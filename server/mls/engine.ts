import { createHash } from "crypto";
import { and, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import {
  mlsFeeds,
  mlsFieldMappings,
  mlsListings,
  mlsMetadataSnapshots,
  mlsSources,
  mlsSyncCursors,
  mlsSyncRuns,
  mlsWorkerHeartbeats,
  type MlsFeed,
} from "../../drizzle/mlsSchema";
import { getMlsDb as getDb } from "./db";
import { adapterFor } from "./adapters";
import { clearTokenCache } from "./adapters/trestle";
import {
  parseODataPage,
  readOption,
  type CursorState,
  type FeedContext,
  type MlsAdapter,
  type MlsResource,
  MLS_RESOURCES,
} from "./adapters/types";
import { credentialStatus } from "./credentials";
import { licenseError } from "./license";
import { FatalHttpError, getLane, redactUrl, requestJson, requestText, type ProviderLane } from "./http";
import { isKnownResoField } from "./normalize/resoStandardFields";
import { emptyCounts, importErrorInfo, laterTimestamp, localKeys, processRecords, pruneEndedOpenHouses, removeKeys, retryImportExceptions, type PageCounts } from "./store";

/**
 * Sync engine. One cycle for one feed:
 *   1. lease the feed (only one worker touches a feed at a time)
 *   2. refresh provider metadata weekly (local field discovery)
 *   3. replicate each resource from its cursor (initial or incremental)
 *   4. apply provider deletions (Deleted resource) and key reconciliation
 *   5. record the run, usage and freshness, release the lease
 *
 * Cursors are saved after every page, so a crash or deploy resumes where it
 * stopped instead of starting over.
 */

const LEASE_MS = 10 * 60_000;
/** A lease owner with no heartbeat for this long is treated as dead (see acquireLease). */
const DEAD_WORKER_MS = 3 * 60_000;
const UNORDERED_MARGIN_MS = 15 * 60_000;

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export type CycleOptions = {
  workerId: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  /** Run even if the feed is disabled (admin "test connection"). */
  force?: boolean;
  /** Limit pages per resource (admin test pull). */
  maxPagesPerResource?: number;
  /**
   * Live pass only: skip the on-market prefill and the history import. The
   * worker runs those as separate time-boxed bursts so every feed that shares
   * a token gets its live sync between bursts.
   */
  skipBacklog?: boolean;
  /** Time box for one import burst (default MLS_IMPORT_BURST_MS, 2 minutes). */
  burstMs?: number;
};

/**
 * How long one import burst may hold a provider lane. Bursts stop after this
 * (at a page boundary, at least one page in) and resume from the saved
 * cursor, so live syncs for every feed on the token run between them.
 */
export function importBurstMs() {
  const value = Number(process.env.MLS_IMPORT_BURST_MS);
  return Number.isFinite(value) && value >= 10_000 ? value : 120_000;
}

export type CycleSummary = {
  feedId: number;
  ok: boolean;
  skipped?: string;
  resources: Record<string, PageCounts & { pages: number; mode: string }>;
  exceptions?: { attempted: number; recovered: number };
  reconciled?: Record<string, { remote: number; local: number; removed: number; aborted?: string }>;
  error?: string;
  /** True when the history import stopped at its page budget with records still to fetch. */
  backlog?: boolean;
};

async function requireDb(): Promise<Db> {
  const db = await getDb();
  if (!db) throw new Error("Database is not configured");
  return db;
}

export function sanitizeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/(access_token|client_secret|token)=([^&\s]+)/gi, "$1=[redacted]")
    .slice(0, 2000);
}

/** Our own write path failed (deadlock victim, lock timeout, dropped
 * connection) and the cursor checkpoint is intact. Nothing is wrong at the
 * provider, so the feed retries at its normal cadence, not the error backoff. */
export class TransientSyncError extends Error {}
export const TRANSIENT_ERROR_PREFIX = "Transient: ";
export function isTransientFeedError(message: string | null | undefined) {
  return typeof message === "string" && message.startsWith(TRANSIENT_ERROR_PREFIX);
}
/** The feed's lastError: sanitized, and tagged when the failure was transient. */
export function feedErrorMessage(error: unknown) {
  const transient = error instanceof TransientSyncError || importErrorInfo(error).transient;
  return `${transient ? TRANSIENT_ERROR_PREFIX : ""}${sanitizeError(error)}`;
}

export async function loadFeedContext(feedId: number): Promise<FeedContext | null> {
  const db = await requireDb();
  const [feed] = await db.select().from(mlsFeeds).where(eq(mlsFeeds.id, feedId)).limit(1);
  if (!feed) return null;
  const [source] = await db.select().from(mlsSources).where(eq(mlsSources.id, feed.sourceId)).limit(1);
  if (!source) return null;
  return { feed, source };
}

export async function acquireLease(feedId: number, workerId: string) {
  const db = await requireDb();
  const now = new Date();
  // A lease whose owner has stopped sending heartbeats belongs to a worker
  // that was killed (Railway deploys SIGKILL the old container, so it never
  // releases its leases). Taking it over at once avoids a 10-minute stall
  // on every feed that was mid-cycle during a deploy. Workers beat every
  // 30 seconds, so 3 minutes is six missed beats.
  const ownerAlive = sql`EXISTS (SELECT 1 FROM ${mlsWorkerHeartbeats} WHERE ${and(
    eq(mlsWorkerHeartbeats.workerId, mlsFeeds.leaseOwner),
    gt(mlsWorkerHeartbeats.lastBeatAt, new Date(now.getTime() - DEAD_WORKER_MS))
  )})`;
  const result = await db
    .update(mlsFeeds)
    .set({ leaseOwner: workerId, leaseExpiresAt: new Date(now.getTime() + LEASE_MS) })
    .where(
      and(
        eq(mlsFeeds.id, feedId),
        or(isNull(mlsFeeds.leaseOwner), lt(mlsFeeds.leaseExpiresAt, now), eq(mlsFeeds.leaseOwner, workerId), sql`NOT ${ownerAlive}`)
      )
    );
  return Number((result as any)[0]?.affectedRows ?? 0) > 0;
}

/**
 * Closes runs a killed worker left as "running". Only called while holding
 * the feed's lease, and every run row is created inside a leased cycle, so
 * any "running" row for this feed at that point is orphaned.
 */
export async function closeOrphanedRuns(feedId: number) {
  const db = await requireDb();
  const result = await db
    .update(mlsSyncRuns)
    .set({ status: "aborted", finishedAt: new Date(), error: "Interrupted: the worker stopped before this run finished." })
    .where(and(eq(mlsSyncRuns.feedId, feedId), eq(mlsSyncRuns.status, "running")));
  return Number((result as any)[0]?.affectedRows ?? 0);
}

async function renewLease(feedId: number, workerId: string) {
  const db = await requireDb();
  await db
    .update(mlsFeeds)
    .set({ leaseExpiresAt: new Date(Date.now() + LEASE_MS) })
    .where(and(eq(mlsFeeds.id, feedId), eq(mlsFeeds.leaseOwner, workerId)));
}

export async function releaseLease(feedId: number, workerId: string) {
  const db = await requireDb();
  await db
    .update(mlsFeeds)
    .set({ leaseOwner: null, leaseExpiresAt: null })
    .where(and(eq(mlsFeeds.id, feedId), eq(mlsFeeds.leaseOwner, workerId)));
}

async function getCursor(db: Db, feedId: number, resource: string) {
  const [cursor] = await db
    .select()
    .from(mlsSyncCursors)
    .where(and(eq(mlsSyncCursors.feedId, feedId), eq(mlsSyncCursors.resource, resource)))
    .limit(1);
  if (cursor) return cursor;
  await db.insert(mlsSyncCursors).values({ feedId, resource, phase: "initial" }).onDuplicateKeyUpdate({ set: { resource } });
  const [created] = await db
    .select()
    .from(mlsSyncCursors)
    .where(and(eq(mlsSyncCursors.feedId, feedId), eq(mlsSyncCursors.resource, resource)))
    .limit(1);
  return created;
}

async function saveCursor(db: Db, id: number, values: Partial<typeof mlsSyncCursors.$inferInsert>) {
  await db.update(mlsSyncCursors).set(values).where(eq(mlsSyncCursors.id, id));
}

async function startRun(db: Db, feedId: number, kind: "initial" | "incremental" | "reconcile" | "metadata", resource: string | null) {
  const result = await db.insert(mlsSyncRuns).values({ feedId, kind, resource, startedAt: new Date(), status: "running" });
  return Number((result as any)[0]?.insertId);
}

async function updateRun(
  db: Db,
  runId: number,
  counts: Partial<PageCounts> & { pages?: number; requests?: number; bytes?: number },
  finish?: { status: "succeeded" | "failed" | "aborted"; error?: string | null; detail?: unknown }
) {
  await db
    .update(mlsSyncRuns)
    .set({
      requests: counts.requests ?? 0,
      bytes: counts.bytes ?? 0,
      received: counts.received ?? 0,
      upserted: counts.upserted ?? 0,
      unchanged: counts.unchanged ?? 0,
      deleted: counts.deleted ?? 0,
      mediaQueued: counts.mediaQueued ?? 0,
      ...(finish
        ? {
            status: finish.status,
            finishedAt: new Date(),
            error: finish.error ?? null,
            detail: finish.detail ?? { errors: counts.errors ?? [], pages: counts.pages ?? 0, replayed: counts.replayed ?? 0 },
          }
        : { detail: { errors: counts.errors ?? [], pages: counts.pages ?? 0, replayed: counts.replayed ?? 0 } }),
    })
    .where(eq(mlsSyncRuns.id, runId));
}

function addCounts(total: PageCounts, page: PageCounts) {
  total.received += page.received;
  total.upserted += page.upserted;
  total.unchanged += page.unchanged;
  total.deleted += page.deleted;
  total.mediaQueued += page.mediaQueued;
  total.quarantined += page.quarantined;
  total.unpersisted += page.unpersisted;
  total.replayed += page.replayed;
  total.maxModified = laterTimestamp(total.maxModified, page.maxModified);
  for (const error of page.errors) if (total.errors.length < 50) total.errors.push(error);
}

function resourcesFor(feed: MlsFeed, adapter: MlsAdapter): MlsResource[] {
  const configured = Array.isArray(feed.resources) ? (feed.resources as string[]) : adapter.defaultResources;
  const valid = MLS_RESOURCES.filter(resource => configured.includes(resource));
  // Property first so open houses can link to their listing.
  return valid.length ? valid : ["Property"];
}

function initialIsOrdered(ctx: FeedContext, adapter: MlsAdapter) {
  if (!adapter.capabilities.initialOrderedByTimestamp) return false;
  if (ctx.feed.provider === "trestle" && readOption(ctx.feed, "useReplicationEndpoint", false)) return false;
  return true;
}

export async function loadOverrides(db: Db, ctx: FeedContext) {
  return db
    .select()
    .from(mlsFieldMappings)
    .where(
      and(
        eq(mlsFieldMappings.isActive, true),
        or(
          eq(mlsFieldMappings.sourceId, ctx.source.id),
          and(isNull(mlsFieldMappings.sourceId), or(isNull(mlsFieldMappings.provider), eq(mlsFieldMappings.provider, ctx.feed.provider)))
        )
      )
    );
}

export async function loadMetadataLocalFields(db: Db, feedId: number): Promise<Set<string> | null> {
  const [snapshot] = await db
    .select({ fields: mlsMetadataSnapshots.fields })
    .from(mlsMetadataSnapshots)
    .where(and(eq(mlsMetadataSnapshots.feedId, feedId), eq(mlsMetadataSnapshots.resource, "Property")))
    .limit(1);
  const fields = snapshot?.fields as Array<{ name: string; isLocal: boolean }> | undefined;
  if (!Array.isArray(fields) || fields.length === 0) return null;
  return new Set(fields.filter(field => field.isLocal).map(field => field.name));
}

/** Pull Property, Member, Office, OpenHouse field lists out of an EDMX document. */
export function parseMetadataFields(xml: string, ctx: FeedContext, adapter: MlsAdapter) {
  const resources: Record<string, Array<{ name: string; type: string; isLocal: boolean; localName: string | null }>> = {};
  const entityPattern = /<EntityType\s+Name="([^"]+)"[^>]*>([\s\S]*?)<\/EntityType>/g;
  let entity: RegExpExecArray | null;
  while ((entity = entityPattern.exec(xml))) {
    const name = entity[1];
    if (!MLS_RESOURCES.includes(name as MlsResource)) continue;
    const fields: Array<{ name: string; type: string; isLocal: boolean; localName: string | null }> = [];
    const propertyPattern = /<Property\s+([^>]*?)(?:\/>|>([\s\S]*?)<\/Property>)/g;
    let property: RegExpExecArray | null;
    while ((property = propertyPattern.exec(entity[2]))) {
      const attributes = property[1];
      const fieldName = attributes.match(/Name="([^"]+)"/)?.[1];
      if (!fieldName) continue;
      const type = attributes.match(/Type="([^"]+)"/)?.[1] ?? "";
      const inner = property[2] ?? "";
      const localName = inner.match(/Term="[^"]*LocalName"\s+String="([^"]*)"/)?.[1] ?? null;
      const adapterSays = adapter.isLocalField(ctx, fieldName);
      const isLocal = adapterSays ?? (name === "Property" ? !!localName || !isKnownResoField(fieldName) : !!localName);
      fields.push({ name: fieldName, type, isLocal, localName });
    }
    resources[name] = fields;
  }
  return resources;
}

async function refreshMetadata(db: Db, ctx: FeedContext, adapter: MlsAdapter, lane: ProviderLane, options: CycleOptions) {
  const runId = await startRun(db, ctx.feed.id, "metadata", null);
  try {
    const xml = await requestText(lane, adapter.metadataUrl(ctx), () => adapter.authHeaders(ctx), {
      signal: options.signal,
      fetchImpl: options.fetchImpl,
      onUnauthorized: clearTokenCache,
    });
    const parsed = parseMetadataFields(xml, ctx, adapter);
    const now = new Date();
    for (const [resource, fields] of Object.entries(parsed)) {
      const metadataHash = createHash("sha256").update(JSON.stringify(fields)).digest("hex");
      const values = {
        feedId: ctx.feed.id,
        resource,
        fieldCount: fields.length,
        localFieldCount: fields.filter(field => field.isLocal).length,
        fields,
        metadataHash,
        fetchedAt: now,
      };
      await db.insert(mlsMetadataSnapshots).values(values).onDuplicateKeyUpdate({ set: values });
    }
    await db.update(mlsFeeds).set({ lastMetadataAt: now }).where(eq(mlsFeeds.id, ctx.feed.id));
    await updateRun(db, runId, { requests: 1, bytes: xml.length }, { status: "succeeded", detail: { resources: Object.keys(parsed) } });
  } catch (error) {
    // Metadata is helpful, not required: record it and keep replicating.
    await updateRun(db, runId, {}, { status: "failed", error: sanitizeError(error) });
  }
}

async function countListings(db: Db, feedId: number) {
  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(mlsListings).where(eq(mlsListings.feedId, feedId));
  return Number(count);
}

function purgeGuard(ctx: FeedContext, local: number, missing: number) {
  if (readOption(ctx.feed, "reconcileForce", false)) return null;
  const limit = Math.max(1000, Math.floor(local * 0.2));
  if (missing > limit) {
    return `Would remove ${missing} of ${local} records (limit ${limit}). Set options.reconcileForce to proceed.`;
  }
  return null;
}

async function replicateResource(
  db: Db,
  ctx: FeedContext,
  adapter: MlsAdapter,
  lane: ProviderLane,
  resource: MlsResource,
  shared: { overrides: Awaited<ReturnType<typeof loadOverrides>>; metadataLocalFields: Set<string> | null },
  options: CycleOptions,
  stage?: "priority" | "live" | "history"
) {
  const cursorResource = resource === "Property" && stage && stage !== "history" ? `${stage === "priority" ? "Priority" : "Live"}:Property` : resource;
  let cursor = await getCursor(db, ctx.feed.id, cursorResource);
  const now = new Date();
  const detail: Record<string, unknown> = {};

  // MLS Grid drops MlgCanView=false records after 7 days: a longer gap means
  // deletions were missed, so the feed reloads and sweeps what it did not see.
  const gapDays = adapter.capabilities.maxReplicationGapDays;
  if (gapDays && cursor.phase === "incremental" && cursor.lastSuccessAt) {
    const gapHours = (now.getTime() - cursor.lastSuccessAt.getTime()) / 3_600_000;
    if (gapHours > gapDays * 24 - 12) {
      if (stage === "live") throw new Error("Live cursor exceeded provider deletion window; full reload and reconciliation required");
      await saveCursor(db, cursor.id, { phase: "initial", highWaterMark: null, resumeToken: null });
      cursor = { ...cursor, phase: "initial", highWaterMark: null, resumeToken: null };
      detail.gapReload = { gapHours: Math.round(gapHours) };
    }
  }

  const mode = cursor.phase;
  const ordered = mode === "incremental" || initialIsOrdered(ctx, adapter);
  const fromScratch = mode === "initial" && !cursor.highWaterMark && !cursor.resumeToken;
  let sweepStartedAt = cursor.sweepStartedAt;
  if (mode === "initial" && fromScratch && stage !== "priority") {
    // Seconds precision matches MySQL datetime. Includes every resource, not just listings.
    sweepStartedAt = new Date(Math.floor(Date.now() / 1000) * 1000);
    await saveCursor(db, cursor.id, { sweepStartedAt });
  }
  const state: CursorState = { phase: mode, highWaterMark: cursor.highWaterMark, resumeToken: cursor.resumeToken };
  const runId = await startRun(db, ctx.feed.id, mode, resource);
  const totals = { ...emptyCounts(), pages: 0, requests: 0, bytes: 0 };
  const passStartedAt = new Date();
  const windowEnd = passStartedAt.toISOString();

  // Adapters read `stage` to add the on-market filter (priority) or a lean
  // expansion (MLS Grid history). Other resources never carry a stage.
  const firstUrl = (position: CursorState) => adapter.firstPageUrl(ctx, resource, { ...position, stage }, windowEnd);
  // Older MLS Grid imports may hold a nextLink with Media expanded. Rebuild from
  // the saved boundary timestamp to switch to the lean historical pass safely.
  // Other providers expand Media in every pass, so their links stay as they are.
  if (stage === "history" && adapter.provider === "mls_grid" && cursor.resumeToken && /(?:Media|%2C?Media)/i.test(cursor.resumeToken)) {
    await saveCursor(db, cursor.id, { resumeToken: null });
    cursor = { ...cursor, resumeToken: null };
  }
  let url: string | null = cursor.resumeToken ? cursor.resumeToken : firstUrl({ ...state, resumeToken: null });
  let resumed = !!cursor.resumeToken;
  let highWaterMark = cursor.highWaterMark;
  let lastLiveCheck = Date.now();
  // Listing imports (on-market prefill, history, or a plain first import)
  // stop at the burst time box and resume next burst. Only timestamp-ordered
  // passes are boxed: they resume from the saved boundary even if a stored
  // next link has expired. Unordered passes (Trestle replication links last
  // 5 minutes) keep running so they never restart from scratch.
  const burstLimit = !options.maxPagesPerResource && ordered && mode === "initial" && resource === "Property" && stage !== "live"
    ? options.burstMs ?? importBurstMs()
    : 0;

  try {
    while (url) {
      if (options.signal?.aborted) throw new Error("aborted");
      const pageLimit = options.maxPagesPerResource ?? (stage === "history" ? 20 : undefined);
      if (pageLimit && totals.pages >= pageLimit) break;
      if (burstLimit && totals.pages > 0 && Date.now() - passStartedAt.getTime() >= burstLimit) {
        detail.burstLimited = true;
        break;
      }
      await renewLease(ctx.feed.id, options.workerId);
      let response: { body: any; bytes: number };
      try {
        response = await requestJson(lane, url, () => adapter.authHeaders(ctx), {
          signal: options.signal,
          fetchImpl: options.fetchImpl,
          onUnauthorized: clearTokenCache,
        });
      } catch (error) {
        // A stored resume link can expire (Trestle replication links last 5 minutes).
        if (resumed && error instanceof FatalHttpError) {
          resumed = false;
          if (mode === "initial" && !ordered) {
            highWaterMark = null;
            state.highWaterMark = null;
          }
          await saveCursor(db, cursor.id, { resumeToken: null, highWaterMark });
          url = firstUrl({ ...state, highWaterMark, resumeToken: null });
          detail.resumeReset = true;
          continue;
        }
        throw error;
      }
      resumed = false;
      totals.requests += 1;
      totals.bytes += response.bytes;
      const page = parseODataPage(response.body);
      const counts = await processRecords(ctx, adapter, resource, page.value, {
        overrides: shared.overrides,
        metadataLocalFields: shared.metadataLocalFields,
      });
      addCounts(totals, counts);
      // Advance only if every failed provider payload is durably quarantined.
      // Transient DB failures or a failed quarantine must keep the checkpoint.
      if (counts.unpersisted) throw new TransientSyncError(`Page contains ${counts.unpersisted} unpersisted records; checkpoint retained for retry.`);
      totals.pages += 1;
      if (ordered) highWaterMark = laterTimestamp(highWaterMark, counts.maxModified);
      const next = adapter.nextPageUrl(ctx, resource, page, { ...state, highWaterMark, stage });
      await saveCursor(db, cursor.id, {
        // Replay boundary timestamp ties if a saved nextLink expires. Upserts are idempotent.
        highWaterMark: ordered && next && page.value[0]?.ModificationTimestamp
          ? new Date(Date.parse(String(page.value[0].ModificationTimestamp)) - 1).toISOString()
          : highWaterMark,
        resumeToken: next,
        recordsSeen: sql`${mlsSyncCursors.recordsSeen} + ${counts.received}` as any,
      });
      if (totals.pages % 10 === 0) await updateRun(db, runId, totals);
      url = next;
      if (stage === "history" && Date.now() - lastLiveCheck >= 4 * 60_000 && !options.maxPagesPerResource) {
        await replicateResource(db, ctx, adapter, lane, "Property", shared, options, "live");
        lastLiveCheck = Date.now();
      }
    }

    const completed = !url;
    if (completed) {
      const finishedValues: Partial<typeof mlsSyncCursors.$inferInsert> = { lastSuccessAt: new Date(), resumeToken: null };
      if (mode === "initial") {
        finishedValues.phase = "incremental";
        if (!ordered || !highWaterMark) {
          // Key-ordered passes cannot trust the greatest timestamp they saw.
          const margin = new Date(passStartedAt.getTime() - UNORDERED_MARGIN_MS).toISOString();
          finishedValues.highWaterMark = ordered ? laterTimestamp(highWaterMark, margin) : margin;
        } else {
          finishedValues.highWaterMark = highWaterMark;
        }
        if (stage === "history") {
          const live = await getCursor(db, ctx.feed.id, "Live:Property");
          finishedValues.highWaterMark = laterTimestamp(finishedValues.highWaterMark ?? null, live.highWaterMark);
        }
        if (resource === "Property" && stage !== "priority") {
          await db
            .update(mlsFeeds)
            .set({ initialImportCompletedAt: ctx.feed.initialImportCompletedAt ?? new Date() })
            .where(eq(mlsFeeds.id, ctx.feed.id));
        }
        if (sweepStartedAt && stage !== "priority") {
          // DB-backed mark/sweep survives a crash and bounds process memory.
          const { mlsRawRecords } = await import("../../drizzle/mlsSchema");
          const stale = and(eq(mlsRawRecords.feedId, ctx.feed.id), eq(mlsRawRecords.resource, resource), lt(mlsRawRecords.receivedAt, sweepStartedAt));
          const [{ total }] = await db.select({ total: sql<number>`count(*)` }).from(mlsRawRecords).where(and(eq(mlsRawRecords.feedId, ctx.feed.id), eq(mlsRawRecords.resource, resource)));
          const [{ missing }] = await db.select({ missing: sql<number>`count(*)` }).from(mlsRawRecords).where(stale);
          const blocked = purgeGuard(ctx, Number(total), Number(missing));
          if (blocked) throw new Error(`Reload sweep blocked: ${blocked}`);
          for (;;) {
            const staleKeys = await db.select({ key: mlsRawRecords.providerKey }).from(mlsRawRecords).where(stale).limit(500);
            if (!staleKeys.length) break;
            totals.deleted += await removeKeys(ctx, resource, staleKeys.map(row => row.key), "reload_sweep");
            // retain_history still cannot keep removed payload credentials indefinitely.
            await db.delete(mlsRawRecords).where(and(eq(mlsRawRecords.feedId, ctx.feed.id), eq(mlsRawRecords.resource, resource), sql`${mlsRawRecords.providerKey} IN (${sql.join(staleKeys.map(row => sql`${row.key}`), sql`, `)})`));
          }
          finishedValues.sweepStartedAt = null;
          detail.sweep = { local: Number(total), missing: Number(missing) };
        }
      }
      await saveCursor(db, cursor.id, finishedValues);
    }
    await updateRun(db, runId, totals, { status: "succeeded", error: totals.quarantined ? `${totals.quarantined} records saved for repair; see run detail.` : null, detail: { ...detail, quarantined: totals.quarantined, replayed: totals.replayed, errors: totals.errors, pages: totals.pages } });
    return { ...totals, mode };
  } catch (error) {
    const aborted = options.signal?.aborted;
    await updateRun(db, runId, totals, {
      status: aborted ? "aborted" : "failed",
      error: sanitizeError(error),
      detail: { ...detail, quarantined: totals.quarantined, replayed: totals.replayed, errors: totals.errors, pages: totals.pages, url: url ? redactUrl(url) : null },
    });
    throw error;
  }
}

async function applyDeletedResource(db: Db, ctx: FeedContext, adapter: MlsAdapter, lane: ProviderLane, options: CycleOptions) {
  if (!adapter.capabilities.deletedResource || !adapter.deletedSinceUrl) return 0;
  const cursor = await getCursor(db, ctx.feed.id, "Deleted:Property");
  const since = cursor.highWaterMark ?? new Date(Date.now() - 86_400_000).toISOString();
  let url = adapter.deletedSinceUrl(ctx, "Property", since);
  if (!url) return 0;
  let highWaterMark = cursor.highWaterMark;
  let removed = 0;
  while (url) {
    const { body } = await requestJson(lane, url, () => adapter.authHeaders(ctx), { signal: options.signal, fetchImpl: options.fetchImpl });
    const page = parseODataPage(body);
    const keys = page.value.map(item => String(item.key ?? item.ResourceRecordKey ?? item.ListingKey ?? "")).filter(Boolean);
    removed += await removeKeys(ctx, "Property", keys, "deleted_resource");
    for (const item of page.value) highWaterMark = laterTimestamp(highWaterMark, item.ts ? String(item.ts) : null);
    url = page.nextLink;
  }
  await saveCursor(db, cursor.id, { highWaterMark: highWaterMark ?? since, phase: "incremental", lastSuccessAt: new Date() });
  return removed;
}

async function reconcileResource(db: Db, ctx: FeedContext, adapter: MlsAdapter, lane: ProviderLane, resource: MlsResource, options: CycleOptions) {
  let url = adapter.reconcileUrl(ctx, resource);
  if (!url) return null;
  const runId = await startRun(db, ctx.feed.id, "reconcile", resource);
  const keyField = adapter.keyField(resource);
  const remote = new Set<string>();
  let requests = 0;
  let bytes = 0;
  try {
    while (url) {
      if (options.signal?.aborted) throw new Error("aborted");
      await renewLease(ctx.feed.id, options.workerId);
      const response = await requestJson(lane, url, () => adapter.authHeaders(ctx), {
        signal: options.signal,
        fetchImpl: options.fetchImpl,
        onUnauthorized: clearTokenCache,
      });
      requests += 1;
      bytes += response.bytes;
      const page = parseODataPage(response.body);
      for (const item of page.value) if (item[keyField]) remote.add(String(item[keyField]));
      url = page.nextLink;
    }
    const local = await localKeys(ctx, resource);
    const missing = local.filter(key => !remote.has(key));
    let aborted: string | undefined;
    let removed = 0;
    if (remote.size === 0 && local.length > 0) aborted = "Provider returned no keys; nothing removed.";
    else aborted = purgeGuard(ctx, local.length, missing.length) ?? undefined;
    if (!aborted && missing.length) removed = await removeKeys(ctx, resource, missing, "reconcile");
    await updateRun(
      db,
      runId,
      { requests, bytes, received: remote.size, deleted: removed },
      { status: aborted ? "aborted" : "succeeded", error: aborted ?? null, detail: { remote: remote.size, local: local.length, missing: missing.length } }
    );
    return { remote: remote.size, local: local.length, removed, aborted };
  } catch (error) {
    await updateRun(db, runId, { requests, bytes }, { status: "failed", error: sanitizeError(error) });
    throw error;
  }
}

export function reconcileDue(feed: MlsFeed, adapter: MlsAdapter, now = new Date()) {
  if (!adapter.capabilities.requiresReconciliation || !feed.initialImportCompletedAt) return false;
  if (feed.reconcileRequestedAt) return true;
  if (!feed.lastReconcileAt) return true;
  return now.getTime() - feed.lastReconcileAt.getTime() >= feed.reconcileIntervalHours * 3_600_000;
}

export function syncDue(feed: MlsFeed, now = new Date()) {
  if (feed.syncRequestedAt) return true;
  if (!feed.enabled) return false;
  if (!feed.lastRunFinishedAt) return true;
  // Provider, credential and config errors back off. A transient write failure
  // keeps the normal cadence so one deadlock cannot pause live sync for 30 min.
  const backoff = feed.status === "error" && !isTransientFeedError(feed.lastError);
  const interval = backoff ? Math.max(feed.syncIntervalMinutes, 15) * 2 : feed.syncIntervalMinutes;
  return now.getTime() - feed.lastRunFinishedAt.getTime() >= interval * 60_000;
}

export async function runFeedCycle(feedId: number, options: CycleOptions): Promise<CycleSummary> {
  const db = await requireDb();
  const summary: CycleSummary = { feedId, ok: false, resources: {} };
  const initial = await loadFeedContext(feedId);
  if (!initial) return { ...summary, skipped: "feed not found" };
  if (!initial.feed.enabled && !options.force && !initial.feed.syncRequestedAt) return { ...summary, skipped: "disabled" };
  const blockedLicense = licenseError(initial.feed);
  if (blockedLicense) {
    await db.update(mlsFeeds).set({ status: "suspended", lastError: blockedLicense, syncRequestedAt: null }).where(eq(mlsFeeds.id, feedId));
    return { ...summary, skipped: "license approval required", error: blockedLicense };
  }
  const credentials = credentialStatus(initial.feed);
  if (!credentials.configured) {
    const message = `Credentials not configured. Set ${credentials.expectedVariables.map(set => set.join(" + ")).join(" or ")} in Railway.`;
    if (initial.feed.lastError !== message) {
      await db.update(mlsFeeds).set({ status: "error", lastError: message, syncRequestedAt: null }).where(eq(mlsFeeds.id, feedId));
    }
    return { ...summary, skipped: "credentials missing", error: message };
  }
  if (!(await acquireLease(feedId, options.workerId))) return { ...summary, skipped: "leased by another worker" };
  const orphaned = await closeOrphanedRuns(feedId).catch(() => 0);
  if (orphaned) console.log(`[mls] feed ${feedId}: closed ${orphaned} run(s) left running by a stopped worker`);

  const ctx = (await loadFeedContext(feedId))!;
  const adapter = adapterFor(ctx.feed.provider);
  const lane = getLane(ctx.feed.provider, ctx.feed.credentialRef, adapter.limits(ctx.feed));
  await db.update(mlsFeeds).set({ status: "running", lastRunStartedAt: new Date() }).where(eq(mlsFeeds.id, feedId));

  const leaseTimer = setInterval(() => { void renewLease(feedId, options.workerId).catch(() => undefined); }, 60_000);
  try {
    const metadataAgeMs = ctx.feed.lastMetadataAt ? Date.now() - ctx.feed.lastMetadataAt.getTime() : Infinity;
    if (metadataAgeMs > 7 * 86_400_000) await refreshMetadata(db, ctx, adapter, lane, options);
    const shared = {
      overrides: await loadOverrides(db, ctx),
      metadataLocalFields: await loadMetadataLocalFields(db, feedId),
    };
    // Staged first import (on-market listings first, then full history) for
    // any adapter that supports it. New feeds get fastImportV1=true when they
    // are created (bootstrap and admin form); existing feeds keep their setting.
    const staged = adapter.capabilities.stagedImport === true && readOption<boolean>(ctx.feed, "fastImportV1", false) === true;
    let priorityPending = false;
    if (staged && !options.maxPagesPerResource) {
      const history = await getCursor(db, feedId, "Property");
      if (history.phase === "initial") {
        // Start the live watermark BEFORE the prefill. Changes that land during
        // the prefill will be replayed, with a 15-minute overlap.
        const live = await getCursor(db, feedId, "Live:Property");
        if (live.phase === "initial") {
          await saveCursor(db, live.id, {
            phase: "incremental",
            highWaterMark: new Date(Date.now() - UNORDERED_MARGIN_MS).toISOString(),
          });
        }
        const priority = await getCursor(db, feedId, "Priority:Property");
        if (priority.phase === "initial" && !options.skipBacklog) {
          try {
            summary.resources["Priority:Property"] = await replicateResource(db, ctx, adapter, lane, "Property", shared, options, "priority");
          } catch (error) {
            // A server that rejects the on-market filter outright (400-class on
            // the first page) imports everything in the full pass instead.
            const rejected = error instanceof FatalHttpError && error.status >= 400 && error.status < 500 && ![401, 403, 429].includes(error.status);
            if (!rejected || Number(priority.recordsSeen ?? 0) > 0) throw error;
            await saveCursor(db, priority.id, { phase: "incremental", resumeToken: null, lastSuccessAt: new Date() });
            console.warn(`[mls] feed ${feedId}: provider rejected the on-market filter (${error.status}); importing everything in one pass. Set options.priorityFilter to retry.`);
          }
        }
        // On-market listings first: history waits until the prefill is done.
        priorityPending = (await getCursor(db, feedId, "Priority:Property")).phase === "initial";
        summary.resources["Live:Property"] = await replicateResource(db, ctx, adapter, lane, "Property", shared, options, "live");
      }
    }
    for (const resource of resourcesFor(ctx.feed, adapter)) {
      const importing = resource === "Property" && !options.maxPagesPerResource && (await getCursor(db, feedId, "Property")).phase === "initial";
      // Live passes leave the listing import to the worker's next burst.
      if (importing && (options.skipBacklog || priorityPending)) continue;
      const historical = staged && importing;
      summary.resources[resource] = await replicateResource(
        db, ctx, adapter, lane, resource, shared,
        staged && !options.maxPagesPerResource && resource !== "Property" ? { ...options, maxPagesPerResource: 20 } : options,
        historical ? "history" : undefined
      );
    }
    summary.exceptions = await retryImportExceptions(ctx, adapter, shared);
    await applyDeletedResource(db, ctx, adapter, lane, options);

    const [fresh] = await db.select().from(mlsFeeds).where(eq(mlsFeeds.id, feedId)).limit(1);
    if (fresh && reconcileDue(fresh, adapter) && !options.maxPagesPerResource) {
      summary.reconciled = {};
      for (const resource of resourcesFor(fresh, adapter).filter(item => item !== "OpenHouse")) {
        const result = await reconcileResource(db, { ...ctx, feed: fresh }, adapter, lane, resource, options);
        if (result) summary.reconciled[resource] = result;
      }
      await db.update(mlsFeeds).set({ lastReconcileAt: new Date(), reconcileRequestedAt: null }).where(eq(mlsFeeds.id, feedId));
    }
    await pruneEndedOpenHouses(feedId);

    // An import burst stops at its time box or page budget so other feeds on
    // the token get their live sync. Report the remaining backlog so the
    // worker schedules the next burst instead of waiting out the interval.
    if (!options.maxPagesPerResource) {
      summary.backlog = (await getCursor(db, feedId, "Property")).phase === "initial";
    }

    const finishedAt = new Date();
    await db
      .update(mlsFeeds)
      .set({ status: "idle", lastError: null, lastRunFinishedAt: finishedAt, lastSuccessAt: finishedAt, syncRequestedAt: null })
      .where(eq(mlsFeeds.id, feedId));
    summary.ok = true;
  } catch (error) {
    summary.error = feedErrorMessage(error);
    const aborted = options.signal?.aborted;
    await db
      .update(mlsFeeds)
      .set({ status: aborted ? "idle" : "error", lastError: aborted ? null : summary.error, lastRunFinishedAt: new Date(), syncRequestedAt: null })
      .where(eq(mlsFeeds.id, feedId));
  } finally {
    clearInterval(leaseTimer);
    await lane.flushUsage().catch(() => undefined);
    await releaseLease(feedId, options.workerId).catch(() => undefined);
  }
  return summary;
}
