import { createHash } from "crypto";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { gzipSync } from "zlib";
import {
  mlsListingHistory,
  mlsListings,
  mlsMedia,
  mlsMembers,
  mlsOffices,
  mlsOpenHouses,
  mlsProperties,
  mlsPropertyInsights,
  mlsRawRecords,
  type MlsFieldMapping,
  type MlsListing,
  type MlsMediaPolicy,
} from "../../drizzle/mlsSchema";
import { getDb } from "../db";
import { readOption, type ExtractedMedia, type FeedContext, type MlsAdapter, type MlsResource } from "./adapters/types";
import { readComplianceProfile } from "./compliance";
import { MARKET_STATUSES, OFF_MARKET_STATUSES, type CanonicalStatus } from "./normalize/enums";
import {
  MAPPING_VERSION,
  normalizeListing,
  normalizeMember,
  normalizeOffice,
  normalizeOpenHouse,
  type NormalizedListing,
} from "./normalize/normalizeListing";
import { propertyIdentity } from "./normalize/propertyIdentity";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export type PageCounts = {
  received: number;
  upserted: number;
  unchanged: number;
  deleted: number;
  mediaQueued: number;
  errors: Array<{ key: string; message: string }>;
  /** Greatest ModificationTimestamp on the page, verbatim. */
  maxModified: string | null;
  keys: string[];
};

export function emptyCounts(): PageCounts {
  return { received: 0, upserted: 0, unchanged: 0, deleted: 0, mediaQueued: 0, errors: [], maxModified: null, keys: [] };
}

const VOLATILE_FIELDS = new Set(["MediaURL", "MediaUrl", "@odata.etag"]);

/**
 * Change detection hash. Signed media URLs differ on every request (MLS Grid),
 * so they are excluded; everything else that changes means the record changed.
 */
export function payloadHash(record: unknown) {
  const json = JSON.stringify(record, (key, value) => (VOLATILE_FIELDS.has(key) ? undefined : value));
  return createHash("sha256").update(json).digest("hex");
}

export function laterTimestamp(a: string | null, b: string | null) {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(b) > Date.parse(a) ? b : a;
}

async function requireDb(): Promise<Db> {
  const db = await getDb();
  if (!db) throw new Error("Database is not configured");
  return db;
}

async function loadRawHashes(db: Db, feedId: number, resource: MlsResource, keys: string[]) {
  const hashes = new Map<string, { hash: string; modifiedAt: Date | null }>();
  for (let i = 0; i < keys.length; i += 500) {
    const chunk = keys.slice(i, i + 500);
    if (!chunk.length) continue;
    const rows = await db
      .select({ key: mlsRawRecords.providerKey, hash: mlsRawRecords.payloadHash, modifiedAt: mlsRawRecords.sourceModifiedAt })
      .from(mlsRawRecords)
      .where(and(eq(mlsRawRecords.feedId, feedId), eq(mlsRawRecords.resource, resource), inArray(mlsRawRecords.providerKey, chunk)));
    for (const row of rows) hashes.set(row.key, { hash: row.hash, modifiedAt: row.modifiedAt });
  }
  return hashes;
}

async function saveRaw(
  db: Db,
  feedId: number,
  resource: MlsResource,
  key: string,
  record: unknown,
  hash: string,
  modifiedAt: Date | null,
  receivedAt: Date
) {
  const json = JSON.stringify(record);
  const payloadGzip = gzipSync(json);
  await db
    .insert(mlsRawRecords)
    .values({
      feedId,
      resource,
      providerKey: key.slice(0, 160),
      payloadGzip,
      payloadHash: hash,
      payloadBytes: json.length,
      sourceModifiedAt: modifiedAt,
      receivedAt,
    })
    .onDuplicateKeyUpdate({
      set: { payloadGzip, payloadHash: hash, payloadBytes: json.length, sourceModifiedAt: modifiedAt, receivedAt },
    });
}

function recency(listing: Pick<MlsListing, "originalEntryAt" | "onMarketDate" | "listingContractDate" | "firstSeenAt">) {
  const candidates = [listing.originalEntryAt, listing.onMarketDate, listing.listingContractDate, listing.firstSeenAt];
  for (const value of candidates) {
    if (!value) continue;
    const time = value instanceof Date ? value.getTime() : Date.parse(String(value));
    if (Number.isFinite(time)) return time;
  }
  return 0;
}

function statusEvent(from: CanonicalStatus, to: CanonicalStatus) {
  if (to === "closed") return "closed" as const;
  if (to === "pending" || to === "active_under_contract") return "pending" as const;
  if (to === "withdrawn") return "withdrawn" as const;
  if (to === "expired") return "expired" as const;
  if (to === "canceled") return "canceled" as const;
  if (to === "active" && (OFF_MARKET_STATUSES.includes(from) || from === "pending" || from === "active_under_contract")) {
    return "back_on_market" as const;
  }
  return "status_change" as const;
}

/** Which media to download under the feed's policy and the MLS's rules. */
export function mediaWanted(
  item: ExtractedMedia,
  status: CanonicalStatus,
  policy: MlsMediaPolicy,
  closedPrimaryOnly: boolean
) {
  if (policy === "none") return false;
  if (status === "closed" && closedPrimaryOnly && !item.isPrimary) return false;
  if (policy === "all") return true;
  if (policy === "primary_only") return item.isPrimary;
  return item.isPrimary || MARKET_STATUSES.includes(status);
}

function mediaPriority(item: ExtractedMedia, status: CanonicalStatus) {
  if (item.isPrimary) return MARKET_STATUSES.includes(status) ? 10 : 20;
  return MARKET_STATUSES.includes(status) ? 50 : 100;
}

async function syncListingMedia(
  tx: Db,
  ctx: FeedContext,
  adapter: MlsAdapter,
  listingId: number,
  providerListingKey: string,
  status: CanonicalStatus,
  media: ExtractedMedia[],
  receivedAt: Date
) {
  const compliance = readComplianceProfile(ctx.source.compliance, ctx.source.providerRoute);
  const closedPrimaryOnly = compliance.closedListingPhotos === "primary_only";
  const existing = await tx
    .select()
    .from(mlsMedia)
    .where(and(eq(mlsMedia.feedId, ctx.feed.id), eq(mlsMedia.resourceKey, providerListingKey)));
  const byKey = new Map(existing.map(row => [row.mediaKey, row]));
  const incoming = new Set<string>();
  let queued = 0;

  for (const item of media) {
    const mediaKey = item.mediaKey.slice(0, 191);
    incoming.add(mediaKey);
    const current = byKey.get(mediaKey);
    const wanted = current?.priority === 0 || (
      (!readOption(ctx.feed, "fastImportV1", false) || MARKET_STATUSES.includes(status))
      && mediaWanted(item, status, ctx.feed.mediaPolicy, closedPrimaryOnly)
    );
    if (!wanted && !current && readOption(ctx.feed, "fastImportV1", false)) continue;
    const changedAtSource =
      !current || (item.sourceModifiedAt?.getTime() ?? 0) !== (current.sourceModifiedAt?.getTime() ?? 0);
    // Expired URLs get refreshed; failures retry only while attempts remain.
    const retryable = current?.status === "expired" || (current?.status === "failed" && current.attempts < 5);
    const changed = changedAtSource || retryable;
    let nextStatus = current?.status ?? "pending";
    if (!wanted) nextStatus = current?.status === "stored" ? "delete_pending" : "skipped";
    else if (changed || current?.status === "skipped" || current?.status === "delete_pending") nextStatus = "pending";
    const needsUrl = nextStatus === "pending";
    if (needsUrl && current?.status !== "pending") queued += 1;
    const values = {
      feedId: ctx.feed.id,
      listingId,
      resourceKey: providerListingKey,
      mediaKey,
      sortOrder: item.sortOrder,
      category: item.category?.slice(0, 32) ?? null,
      mimeType: item.mimeType?.slice(0, 64) ?? null,
      caption: item.caption?.slice(0, 512) ?? null,
      isPrimary: item.isPrimary,
      sourceModifiedAt: item.sourceModifiedAt,
      sourceUrl: needsUrl ? item.sourceUrl : null,
      sourceUrlExpiresAt: needsUrl && item.sourceUrl ? adapter.mediaUrlExpiresAt(item.sourceUrl, receivedAt) : null,
      status: nextStatus,
      claimedBy: nextStatus === "downloading" ? current?.claimedBy ?? null : null,
      priority: current?.priority === 0 ? 0 : mediaPriority(item, status),
      attempts: changedAtSource ? 0 : current?.attempts ?? 0,
      nextAttemptAt: null,
      lastError: needsUrl ? null : current?.lastError ?? null,
    };
    await tx.insert(mlsMedia).values(values).onDuplicateKeyUpdate({ set: values });
  }

  const removed = existing.filter(row => !incoming.has(row.mediaKey) && row.status !== "delete_pending");
  if (removed.length) {
    await tx
      .update(mlsMedia)
      .set({ status: "delete_pending", sourceUrl: null, nextAttemptAt: null })
      .where(inArray(mlsMedia.id, removed.map(row => row.id)));
  }
  return queued;
}

async function upsertInsights(tx: Db, propertyId: number, ctx: FeedContext, listingId: number, normalized: NormalizedListing) {
  const entries = Object.entries(normalized.insights);
  if (!entries.length) return;
  const [current] = await tx.select().from(mlsPropertyInsights).where(eq(mlsPropertyInsights.propertyId, propertyId)).limit(1);
  const provenance = { ...((current?.provenance as Record<string, unknown>) ?? {}) };
  const set: Record<string, unknown> = {};
  for (const [field, insight] of entries) {
    const existing = provenance[field] as { source?: string } | undefined;
    // Values entered by people or other systems are never overwritten by MLS data.
    if (existing && existing.source && existing.source !== "mls") continue;
    let value = insight.value;
    if (field === "strAllowed") {
      const text = String(value).toLowerCase();
      value = ["yes", "no", "restricted"].includes(text) ? text : value === true ? "yes" : value === false ? "no" : "unknown";
    }
    set[field] = value;
    provenance[field] = {
      source: "mls",
      sourceId: ctx.source.id,
      feedId: ctx.feed.id,
      listingId,
      sourceField: insight.sourceField,
      mappingId: insight.mappingId,
      at: new Date().toISOString(),
    };
  }
  if (!Object.keys(set).length) return;
  await tx
    .insert(mlsPropertyInsights)
    .values({ propertyId, ...set, provenance } as any)
    .onDuplicateKeyUpdate({ set: { ...set, provenance } as any });
}

/** Keep the property summary pointed at its most recent listing. */
async function refreshPropertySummary(tx: Db, propertyId: number) {
  const listings = await tx
    .select()
    .from(mlsListings)
    .where(and(eq(mlsListings.propertyId, propertyId), isNull(mlsListings.removedFromFeedAt)));
  if (!listings.length) {
    await tx.update(mlsProperties).set({ listingCount: 0, latestListingId: null }).where(eq(mlsProperties.id, propertyId));
    return;
  }
  const latest = listings.reduce((best, row) => (recency(row) >= recency(best) ? row : best));
  const closed = listings
    .filter(row => row.standardStatus === "closed" && row.closeDate)
    .sort((a, b) => String(b.closeDate).localeCompare(String(a.closeDate)))[0];
  await tx
    .update(mlsProperties)
    .set({
      parcelNumber: latest.parcelNumber,
      streetNumber: latest.streetNumber,
      streetName: latest.streetName,
      unitNumber: latest.unitNumber,
      unparsedAddress: latest.unparsedAddress,
      city: latest.city,
      stateOrProvince: latest.stateOrProvince,
      postalCode: latest.postalCode,
      countyOrParish: latest.countyOrParish,
      latitude: latest.latitude,
      longitude: latest.longitude,
      propertyType: latest.propertyType,
      propertySubType: latest.propertySubType,
      yearBuilt: latest.yearBuilt,
      bedroomsTotal: latest.bedroomsTotal,
      bathroomsTotal: latest.bathroomsTotal,
      livingArea: latest.livingArea,
      lotSizeAcres: latest.lotSizeAcres,
      latestListingId: latest.id,
      latestStatus: latest.standardStatus,
      latestListPrice: latest.listPrice,
      lastClosePrice: closed?.closePrice ?? null,
      lastCloseDate: closed?.closeDate ?? null,
      listingCount: listings.length,
    })
    .where(eq(mlsProperties.id, propertyId));
}

async function resolveProperty(tx: Db, ctx: FeedContext, normalized: NormalizedListing, existing: MlsListing | undefined) {
  const c = normalized.columns;
  const identity = propertyIdentity({
    streetNumber: c.streetNumber as string | undefined,
    streetName: c.streetName as string | undefined,
    unitNumber: c.unitNumber as string | undefined,
    postalCode: c.postalCode as string | undefined,
    stateOrProvince: c.stateOrProvince as string | undefined,
    countyOrParish: c.countyOrParish as string | undefined,
    parcelNumber: c.parcelNumber as string | undefined,
    sourceId: ctx.source.id,
    listingNumber: normalized.listingNumber,
  });
  const [match] = await tx.select().from(mlsProperties).where(eq(mlsProperties.propertyKey, identity.key)).limit(1);
  if (existing) {
    if (!match || match.id === existing.propertyId) return { propertyId: existing.propertyId, previousPropertyId: null };
    // Only move a listing off a weak (listing-only) identity onto a real one.
    const [current] = await tx.select().from(mlsProperties).where(eq(mlsProperties.id, existing.propertyId)).limit(1);
    if (current && current.identitySource !== "listing") return { propertyId: existing.propertyId, previousPropertyId: null };
    return { propertyId: match.id, previousPropertyId: existing.propertyId };
  }
  if (match) return { propertyId: match.id, previousPropertyId: null };
  await tx
    .insert(mlsProperties)
    .values({
      propertyKey: identity.key,
      identitySource: identity.source,
      universalPropertyId: null,
      listingCount: 0,
    })
    .onDuplicateKeyUpdate({ set: { identitySource: identity.source } });
  const [created] = await tx.select({ id: mlsProperties.id }).from(mlsProperties).where(eq(mlsProperties.propertyKey, identity.key)).limit(1);
  return { propertyId: created.id, previousPropertyId: null };
}

async function dropPropertyIfOrphaned(tx: Db, propertyId: number) {
  const [{ count }] = await tx
    .select({ count: sql<number>`count(*)` })
    .from(mlsListings)
    .where(eq(mlsListings.propertyId, propertyId));
  if (Number(count) > 0) {
    await refreshPropertySummary(tx, propertyId);
    return;
  }
  const [insight] = await tx.select({ id: mlsPropertyInsights.id }).from(mlsPropertyInsights).where(eq(mlsPropertyInsights.propertyId, propertyId)).limit(1);
  if (insight) {
    // Savvy-owned intelligence survives; the MLS-derived summary does not.
    await tx.update(mlsProperties).set({ listingCount: 0, latestListingId: null, latestStatus: null, latestListPrice: null }).where(eq(mlsProperties.id, propertyId));
    return;
  }
  await tx.delete(mlsProperties).where(eq(mlsProperties.id, propertyId));
}

export async function upsertNormalizedListing(
  db: Db,
  ctx: FeedContext,
  adapter: MlsAdapter,
  normalized: NormalizedListing,
  hash: string,
  receivedAt: Date
) {
  return db.transaction(async tx => {
    const t = tx as unknown as Db;
    const [existing] = await t
      .select()
      .from(mlsListings)
      .where(and(eq(mlsListings.feedId, ctx.feed.id), eq(mlsListings.providerListingKey, normalized.providerListingKey)))
      .limit(1);
    // Never combine license scopes by overwriting a listing from another feed.
    const prior = existing;
    const { propertyId, previousPropertyId } = await resolveProperty(t, ctx, normalized, prior);
    const columns = normalized.columns as Record<string, any>;
    const values = {
      ...columns,
      propertyId,
      sourceId: ctx.source.id,
      feedId: ctx.feed.id,
      listingNumber: normalized.listingNumber,
      listingKey: normalized.listingKey,
      providerListingKey: normalized.providerListingKey,
      standardStatus: String(columns.standardStatus ?? "unknown"),
      permittedUses: normalized.permittedUses,
      features: Object.keys(normalized.features).length ? normalized.features : null,
      rooms: normalized.rooms,
      units: normalized.units,
      localFields: Object.keys(normalized.localFields).length ? normalized.localFields : null,
      fieldProvenance: normalized.provenance,
      mappingVersion: MAPPING_VERSION,
      payloadHash: hash,
      lastSyncedAt: receivedAt,
      removedFromFeedAt: null,
      removalReason: null,
    };
    // Columns the new payload no longer carries must be cleared, not kept stale.
    const cleared: Record<string, null> = {};
    if (prior) {
      for (const key of Object.keys(prior)) {
        if (key in values) continue;
        if (["id", "firstSeenAt", "createdAt", "updatedAt", "primaryPhotoUrl"].includes(key)) continue;
        cleared[key] = null;
      }
    }
    let listingId: number;
    if (prior) {
      listingId = prior.id;
      await t.update(mlsListings).set({ ...cleared, ...values } as any).where(eq(mlsListings.id, prior.id));
    } else {
      await t.insert(mlsListings).values({ ...values, firstSeenAt: receivedAt } as any);
      const [row] = await t
        .select({ id: mlsListings.id })
        .from(mlsListings)
        .where(and(eq(mlsListings.feedId, ctx.feed.id), eq(mlsListings.providerListingKey, normalized.providerListingKey)))
        .limit(1);
      listingId = row.id;
    }

    // History.
    const status = values.standardStatus as CanonicalStatus;
    const newPrice = columns.listPrice ?? null;
    const history: Array<typeof mlsListingHistory.$inferInsert> = [];
    const base = { listingId, propertyId, sourceId: ctx.source.id, detectedAt: receivedAt };
    if (!prior) {
      const [{ others }] = await t
        .select({ others: sql<number>`count(*)` })
        .from(mlsListings)
        .where(and(eq(mlsListings.propertyId, propertyId), sql`${mlsListings.id} <> ${listingId}`));
      history.push({
        ...base,
        eventType: Number(others) > 0 ? "relisted" : "listed",
        toStatus: status,
        toPrice: newPrice === null ? null : String(newPrice),
        eventAt: (columns.originalEntryAt as Date) ?? (columns.onMarketDate ? new Date(`${columns.onMarketDate}T12:00:00Z`) : receivedAt),
      });
    } else {
      const fromStatus = prior.standardStatus as CanonicalStatus;
      if (fromStatus !== status) {
        history.push({
          ...base,
          eventType: statusEvent(fromStatus, status),
          fromStatus,
          toStatus: status,
          toPrice: newPrice === null ? null : String(newPrice),
          eventAt: (columns.statusChangeAt as Date) ?? (columns.sourceModifiedAt as Date) ?? receivedAt,
          detail: status === "closed" && columns.closePrice ? { closePrice: columns.closePrice, closeDate: columns.closeDate } : null,
        });
      }
      const oldPrice = prior.listPrice === null ? null : Number(prior.listPrice);
      if (newPrice !== null && oldPrice !== null && Number(newPrice) !== oldPrice) {
        history.push({
          ...base,
          eventType: "price_change",
          fromPrice: String(oldPrice),
          toPrice: String(newPrice),
          toStatus: status,
          eventAt: (columns.priceChangeAt as Date) ?? (columns.sourceModifiedAt as Date) ?? receivedAt,
        });
      }
    }
    if (history.length) await t.insert(mlsListingHistory).values(history);

    const mediaQueued = normalized.mediaExpanded ? await syncListingMedia(
      t,
      ctx,
      adapter,
      listingId,
      normalized.providerListingKey,
      status,
      normalized.media,
      receivedAt
    ) : 0;
    await upsertInsights(t, propertyId, ctx, listingId, normalized);
    await refreshPropertySummary(t, propertyId);
    if (previousPropertyId) {
      await t.update(mlsListingHistory).set({ propertyId }).where(eq(mlsListingHistory.listingId, listingId));
      await dropPropertyIfOrphaned(t, previousPropertyId);
    }
    return { listingId, created: !prior, mediaQueued };
  });
}

/**
 * Remove a listing that lost display rights or left the feed.
 * purge: delete it and its media (compliance default).
 * retain_history: keep the record for analytics, flagged as removed.
 */
export async function removeListing(db: Db, ctx: FeedContext, providerListingKey: string, reason: string) {
  return db.transaction(async tx => {
    const t = tx as unknown as Db;
    const [listing] = await t
      .select()
      .from(mlsListings)
      .where(and(eq(mlsListings.feedId, ctx.feed.id), eq(mlsListings.providerListingKey, providerListingKey)))
      .limit(1);
    await t
      .update(mlsMedia)
      .set({ status: "delete_pending", sourceUrl: null, nextAttemptAt: null })
      .where(and(eq(mlsMedia.feedId, ctx.feed.id), eq(mlsMedia.resourceKey, providerListingKey)));
    if (!listing) {
      await t.delete(mlsRawRecords).where(and(eq(mlsRawRecords.feedId, ctx.feed.id), eq(mlsRawRecords.resource, "Property"), eq(mlsRawRecords.providerKey, providerListingKey)));
      return false;
    }
    if (ctx.feed.retentionPolicy === "retain_history" && (ctx.feed.options?.license as any)?.retainHistory === true) {
      await t.delete(mlsRawRecords).where(and(eq(mlsRawRecords.feedId, ctx.feed.id), eq(mlsRawRecords.resource, "Property"), eq(mlsRawRecords.providerKey, providerListingKey)));
      if (!listing.removedFromFeedAt) {
        const now = new Date();
        await t.update(mlsListings).set({ removedFromFeedAt: now, removalReason: reason.slice(0, 64), primaryPhotoUrl: null }).where(eq(mlsListings.id, listing.id));
        await t.insert(mlsListingHistory).values({
          listingId: listing.id,
          propertyId: listing.propertyId,
          sourceId: listing.sourceId,
          eventType: "removed_from_feed",
          fromStatus: listing.standardStatus,
          eventAt: now,
          detectedAt: now,
          detail: { reason },
        });
        await refreshPropertySummary(t, listing.propertyId);
      }
      return true;
    }
    await t.delete(mlsListingHistory).where(eq(mlsListingHistory.listingId, listing.id));
    await t.delete(mlsOpenHouses).where(eq(mlsOpenHouses.listingId, listing.id));
    await t.delete(mlsListings).where(eq(mlsListings.id, listing.id));
    await t.delete(mlsRawRecords).where(and(eq(mlsRawRecords.feedId, ctx.feed.id), eq(mlsRawRecords.resource, "Property"), eq(mlsRawRecords.providerKey, providerListingKey)));
    await dropPropertyIfOrphaned(t, listing.propertyId);
    return true;
  });
}

export async function removeRecord(db: Db, ctx: FeedContext, resource: MlsResource, key: string, reason: string) {
  if (resource === "Property") return removeListing(db, ctx, key, reason);
  if (resource === "Member") await db.delete(mlsMembers).where(and(eq(mlsMembers.feedId, ctx.feed.id), eq(mlsMembers.memberKey, key)));
  if (resource === "Office") await db.delete(mlsOffices).where(and(eq(mlsOffices.feedId, ctx.feed.id), eq(mlsOffices.officeKey, key)));
  if (resource === "OpenHouse") await db.delete(mlsOpenHouses).where(and(eq(mlsOpenHouses.feedId, ctx.feed.id), eq(mlsOpenHouses.openHouseKey, key)));
  await db.delete(mlsRawRecords).where(and(eq(mlsRawRecords.feedId, ctx.feed.id), eq(mlsRawRecords.resource, resource), eq(mlsRawRecords.providerKey, key)));
  return true;
}

export type ProcessOptions = {
  overrides: MlsFieldMapping[];
  metadataLocalFields: Set<string> | null;
  receivedAt?: Date;
  /** Reprocess even when the payload hash is unchanged (media refresh, remap). */
  force?: boolean;
};

/** Process one replication page for any resource. */
export async function processRecords(
  ctx: FeedContext,
  adapter: MlsAdapter,
  resource: MlsResource,
  records: Record<string, any>[],
  options: ProcessOptions
): Promise<PageCounts> {
  const db = await requireDb();
  const counts = emptyCounts();
  const receivedAt = options.receivedAt ?? new Date();
  const keyField = adapter.keyField(resource);
  const keys = records.map(record => String(record[keyField] ?? "")).filter(Boolean);
  const hashes = await loadRawHashes(db, ctx.feed.id, resource, keys);

  for (const record of records) {
    counts.received += 1;
    const key = String(record[keyField] ?? "").trim();
    const modified = record.ModificationTimestamp ? String(record.ModificationTimestamp) : null;
    counts.maxModified = laterTimestamp(counts.maxModified, modified);
    if (!key) {
      counts.errors.push({ key: "(missing)", message: `Record without ${keyField}` });
      continue;
    }
    counts.keys.push(key);
    try {
      if (!adapter.isViewable(record)) {
        if (await removeRecord(db, ctx, resource, key, "not_viewable")) counts.deleted += 1;
        continue;
      }
      const hash = payloadHash(record);
      const previous = hashes.get(key);
      // A market prefill / live cursor runs ahead of the historical cursor.
      // Never let an older history page roll a price or status backwards.
      if (previous?.modifiedAt && modified && Date.parse(modified) < previous.modifiedAt.getTime()) {
        await db.update(mlsRawRecords).set({ receivedAt }).where(and(eq(mlsRawRecords.feedId, ctx.feed.id), eq(mlsRawRecords.resource, resource), eq(mlsRawRecords.providerKey, key)));
        counts.unchanged += 1;
        continue;
      }
      if (!options.force && previous?.hash === hash) {
        await db.update(mlsRawRecords).set({ receivedAt }).where(and(eq(mlsRawRecords.feedId, ctx.feed.id), eq(mlsRawRecords.resource, resource), eq(mlsRawRecords.providerKey, key)));
        counts.unchanged += 1;
        continue;
      }
      const modifiedAt = modified ? new Date(modified) : null;
      if (resource === "Property") {
        const normalized = normalizeListing(ctx, adapter, record, {
          overrides: options.overrides.filter(mapping => mapping.resource === "Property"),
          metadataLocalFields: options.metadataLocalFields,
        });
        const result = await upsertNormalizedListing(db, ctx, adapter, normalized, hash, receivedAt);
        counts.mediaQueued += result.mediaQueued;
      } else if (resource === "Member") {
        const { viewable: _viewable, ...member } = normalizeMember(ctx, adapter, record);
        const values = { ...member, sourceId: ctx.source.id, feedId: ctx.feed.id, lastSyncedAt: receivedAt };
        await db.insert(mlsMembers).values(values).onDuplicateKeyUpdate({ set: values });
      } else if (resource === "Office") {
        const { viewable: _viewable, ...office } = normalizeOffice(ctx, adapter, record);
        const values = { ...office, sourceId: ctx.source.id, feedId: ctx.feed.id, lastSyncedAt: receivedAt };
        await db.insert(mlsOffices).values(values).onDuplicateKeyUpdate({ set: values });
      } else if (resource === "OpenHouse") {
        const { viewable: _viewable, ...openHouse } = normalizeOpenHouse(ctx, adapter, record);
        let listingId: number | null = null;
        if (openHouse.providerListingKey) {
          const [listing] = await db
            .select({ id: mlsListings.id })
            .from(mlsListings)
            .where(and(eq(mlsListings.feedId, ctx.feed.id), eq(mlsListings.providerListingKey, openHouse.providerListingKey)))
            .limit(1);
          listingId = listing?.id ?? null;
        }
        const values = { ...openHouse, listingId, feedId: ctx.feed.id, lastSyncedAt: receivedAt };
        await db.insert(mlsOpenHouses).values(values).onDuplicateKeyUpdate({ set: values });
      }
      await saveRaw(db, ctx.feed.id, resource, key, record, hash, modifiedAt, receivedAt);
      counts.upserted += 1;
    } catch (error) {
      if (counts.errors.length < 25) {
        counts.errors.push({ key, message: "Record could not be persisted; retry after checking mapping, schema, and database health" });
      }
    }
  }
  return counts;
}

/** Every key we currently hold for a feed and resource (for reconciliation). */
export async function localKeys(ctx: FeedContext, resource: MlsResource): Promise<string[]> {
  const db = await requireDb();
  if (resource === "Property") {
    const rows = await db
      .select({ key: mlsListings.providerListingKey })
      .from(mlsListings)
      .where(and(eq(mlsListings.feedId, ctx.feed.id), isNull(mlsListings.removedFromFeedAt)));
    return rows.map(row => row.key);
  }
  if (resource === "Member") {
    return (await db.select({ key: mlsMembers.memberKey }).from(mlsMembers).where(eq(mlsMembers.feedId, ctx.feed.id))).map(row => row.key);
  }
  if (resource === "Office") {
    return (await db.select({ key: mlsOffices.officeKey }).from(mlsOffices).where(eq(mlsOffices.feedId, ctx.feed.id))).map(row => row.key);
  }
  return (await db.select({ key: mlsOpenHouses.openHouseKey }).from(mlsOpenHouses).where(eq(mlsOpenHouses.feedId, ctx.feed.id))).map(row => row.key);
}

export async function removeKeys(ctx: FeedContext, resource: MlsResource, keys: string[], reason: string) {
  const db = await requireDb();
  let removed = 0;
  for (const key of keys) {
    if (await removeRecord(db, ctx, resource, key, reason)) removed += 1;
  }
  return removed;
}

/** Open houses that ended more than a day ago are no longer displayable. */
export async function pruneEndedOpenHouses(feedId: number) {
  const db = await requireDb();
  const cutoff = new Date(Date.now() - 86_400_000);
  const result = await db.delete(mlsOpenHouses).where(and(eq(mlsOpenHouses.feedId, feedId), sql`${mlsOpenHouses.endAt} < ${cutoff}`));
  return Number((result as any)[0]?.affectedRows ?? 0);
}
