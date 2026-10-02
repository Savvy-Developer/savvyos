import { and, eq, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { mlsListings, mlsMedia } from "../../drizzle/mlsSchema";
import { getDb } from "../db";
import { privateMlsStorage, privateMlsStorageError } from "./privateMedia";
import { loadOverrides, loadMetadataLocalFields } from "./engine";
import { adapterFor } from "./adapters";
import { mlsGridBatchUrl } from "./adapters/mlsGrid";
import { parseODataPage, type FeedContext } from "./adapters/types";
import { galleryMarkerCondition, isGalleryMarker } from "./gallery";
import { downloadMedia, FatalHttpError, RetryableHttpError, redactUrl, requestJson, type ProviderLane } from "./http";
import { MARKET_STATUSES } from "./normalize/enums";
import { withMlsPhotoListingId } from "./photoUrl";
import { processRecords } from "./store";
/**
 * Media pipeline. Listing photos are copied to our S3 bucket and served from
 * there; old MLS Grid media.mlsgrid.com URLs are never shown to users because
 * they are single-use and expire in an hour. A provisioned CDN has different
 * URL rules, but licensed display gates remain mandatory either way.
 *
 * Queue order: primary photo of market listings first, then their gallery,
 * then off-market primaries. Removed photos are deleted from S3 as well.
 */

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export type MediaStorage = {
  put(key: string, data: Buffer, contentType: string): Promise<{ url: string }>;
  remove(key: string): Promise<void>;
};

let storage: MediaStorage = privateMlsStorage;

/** Tests and local runs swap S3 for an in-memory store. */
export function setMediaStorage(next: MediaStorage) {
  storage = next;
}

const MAX_ATTEMPTS = 5;
const MAX_BYTES = 25 * 1024 * 1024;

function safeSegment(value: string) {
  return value.replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 120) || "x";
}

function extension(contentType: string) {
  const type = contentType.split(";")[0].trim().toLowerCase();
  if (type === "image/jpeg" || type === "image/jpg") return "jpg";
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  if (type === "image/gif") return "gif";
  if (type === "image/avif") return "avif";
  return null;
}

export type MediaBatchResult = {
  claimed: number;
  stored: number;
  failed: number;
  expired: number;
  skipped: number;
  deleted: number;
  refreshed: number;
};

async function requireDb(): Promise<Db> {
  const db = await getDb();
  if (!db) throw new Error("Database is not configured");
  return db;
}

/** Downloads interrupted by a crash or deploy go back in the queue. */
export async function resetStaleMediaClaims() {
  const db = await requireDb();
  const cutoff = new Date(Date.now() - 30 * 60_000);
  await db
    .update(mlsMedia)
    .set({ status: "pending", claimedBy: null })
    .where(and(eq(mlsMedia.status, "downloading"), lt(mlsMedia.updatedAt, cutoff)));
}

async function deleteRemovedMedia(db: Db, feedIds: number[], result: MediaBatchResult) {
  const rows = await db
    .select()
    .from(mlsMedia)
    .where(and(inArray(mlsMedia.feedId, feedIds), eq(mlsMedia.status, "delete_pending")))
    .limit(200);
  for (const row of rows) {
    try {
      if (row.s3Key) await storage.remove(row.s3Key);
    } catch (error) {
      await db
        .update(mlsMedia)
        .set({ lastError: String(error instanceof Error ? error.message : error).slice(0, 512) })
        .where(eq(mlsMedia.id, row.id));
      continue;
    }
    if (row.url && row.listingId) {
      await db
        .update(mlsListings)
        .set({ primaryPhotoUrl: null })
        .where(and(eq(mlsListings.id, row.listingId), eq(mlsListings.primaryPhotoUrl, row.url)));
    }
    await db.delete(mlsMedia).where(eq(mlsMedia.id, row.id));
    result.deleted += 1;
  }
}

/** Refresh expired URLs in batches, including gallery requests. All provider
 * calls run here in the worker, not from the web process, so they share the
 * same token rate and byte budget as replication and photo downloads. */
async function refreshExpiredUrls(
  db: Db,
  lane: ProviderLane,
  feeds: Map<number, FeedContext>,
  result: MediaBatchResult,
  options: { signal?: AbortSignal; fetchImpl?: typeof fetch; limit: number; priority: "active" | "active_gallery" | "gallery" | "market" }
) {
  const feedIds = Array.from(feeds.keys()).filter(id => adapterFor(feeds.get(id)!.feed.provider).capabilities.mediaUrlsExpire);
  if (!feedIds.length) return;
  const gridOnly = feedIds.every(id => feeds.get(id)!.feed.provider === "mls_grid");
  const rows = await db
    .selectDistinct({ feedId: mlsMedia.feedId, resourceKey: mlsMedia.resourceKey, listingNumber: mlsListings.listingNumber })
    .from(mlsMedia)
    .innerJoin(mlsListings, and(eq(mlsListings.feedId, mlsMedia.feedId), eq(mlsListings.providerListingKey, mlsMedia.resourceKey)))
    .where(and(
      inArray(mlsMedia.feedId, feedIds), eq(mlsMedia.status, "expired"), lt(mlsMedia.attempts, MAX_ATTEMPTS),
      or(isNull(mlsMedia.nextAttemptAt), lt(mlsMedia.nextAttemptAt, new Date())),
      // Active galleries: scanner markers AND gallery photos whose one-hour
      // link lapsed before download. Both are priority 0 (index: status,priority);
      // without the photos here they would be stranded and block the scanner.
      options.priority === "active_gallery"
        ? and(eq(mlsMedia.priority, 0), eq(mlsListings.standardStatus, "active"), isNull(mlsListings.removedFromFeedAt))
        : options.priority === "gallery"
        ? and(galleryMarkerCondition(), isNull(mlsListings.removedFromFeedAt))
        : options.priority === "active"
          ? and(eq(mlsMedia.isPrimary, true), eq(mlsListings.standardStatus, "active"), isNull(mlsListings.removedFromFeedAt))
          : gridOnly ? and(eq(mlsMedia.isPrimary, true), inArray(mlsListings.standardStatus, MARKET_STATUSES), isNull(mlsListings.removedFromFeedAt)) : undefined
    ))
    .limit(options.limit);
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = feeds.get(row.feedId)!.feed.provider === "mls_grid" ? String(row.feedId) : `${row.feedId}:${row.resourceKey}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  for (const group of Array.from(groups.values())) {
    const feedId = group[0].feedId;
    const ctx = feeds.get(feedId)!;
    const adapter = adapterFor(ctx.feed.provider);
    try {
      const overrides = await loadOverrides(db, ctx);
      const metadataLocalFields = await loadMetadataLocalFields(db, feedId);
      const batch = ctx.feed.provider === "mls_grid";
      const url = batch
        ? mlsGridBatchUrl(ctx, group.map(row => `${ctx.feed.keyPrefix ?? ctx.source.keyPrefix ?? ""}${row.listingNumber}`))
        : adapter.singleRecordUrl(ctx, "Property", group[0].resourceKey);
      const { body } = await requestJson(lane, url, () => adapter.authHeaders(ctx), {
        signal: options.signal,
        fetchImpl: options.fetchImpl,
      });
      const page = parseODataPage(body);
      const returned = new Set<string>();
      for (const record of page.value) {
        const key = String(record[adapter.keyField("Property")] ?? "");
        if (!group.some(row => row.resourceKey === key)) continue;
        returned.add(key);
        const gallery = await db.select({ id: mlsMedia.id, mediaKey: mlsMedia.mediaKey }).from(mlsMedia)
          .where(and(
            eq(mlsMedia.feedId, feedId), eq(mlsMedia.resourceKey, key), eq(mlsMedia.status, "expired"),
            or(galleryMarkerCondition(), eq(mlsMedia.priority, 0)),
          ));
        const feed = gallery.length ? { ...ctx.feed, mediaPolicy: "all" as const, options: { ...ctx.feed.options, fastImportV1: false } } : ctx.feed;
        await processRecords({ ...ctx, feed }, adapter, "Property", [record], {
          overrides, metadataLocalFields, force: true,
        });
        if (gallery.length) {
          await db.update(mlsMedia).set({ priority: 0 })
            .where(and(eq(mlsMedia.feedId, feedId), eq(mlsMedia.resourceKey, key), inArray(mlsMedia.status, ["pending", "stored", "expired"])));
          // Retire only the request marker; real photos must stay queued.
          const markers = gallery.filter(row => isGalleryMarker(row.mediaKey)).map(row => row.id);
          if (markers.length) await db.update(mlsMedia).set({ status: "delete_pending" }).where(inArray(mlsMedia.id, markers));
        }
        result.refreshed += 1;
      }
      for (const row of group.filter(row => !returned.has(row.resourceKey))) {
        await db
          .update(mlsMedia)
          .set({ status: "failed", lastError: "Listing no longer returned by provider" })
          .where(and(eq(mlsMedia.feedId, feedId), eq(mlsMedia.resourceKey, row.resourceKey), eq(mlsMedia.status, "expired")));
      }
    } catch (error) {
      await db
        .update(mlsMedia)
        .set({ attempts: sql`${mlsMedia.attempts} + 1`, lastError: String(error instanceof Error ? error.message : error).slice(0, 512) })
        .where(and(eq(mlsMedia.feedId, feedId), inArray(mlsMedia.resourceKey, group.map(row => row.resourceKey)), eq(mlsMedia.status, "expired")));
    }
  }
}

const RETRYABLE_LOCK_ERRNOS = new Set([1213, 1205]); // ER_LOCK_DEADLOCK, ER_LOCK_WAIT_TIMEOUT

/** True when MySQL rolled the statement back over a lock conflict and it is safe to run again. */
export function isRetryableLockError(error: unknown): boolean {
  for (let current: unknown = error, depth = 0; current && depth < 5; depth++) {
    const errno = (current as { errno?: unknown }).errno;
    const code = (current as { code?: unknown }).code;
    if ((typeof errno === "number" && RETRYABLE_LOCK_ERRNOS.has(errno)) || code === "ER_LOCK_DEADLOCK" || code === "ER_LOCK_WAIT_TIMEOUT") {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/** Runs a single statement again after a deadlock or lock wait timeout, with a short jittered backoff. */
export async function withLockRetry<T>(run: () => Promise<T>, attempts = 4): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (attempt >= attempts || !isRetryableLockError(error)) throw error;
      await new Promise(resolve => setTimeout(resolve, 100 * attempt + Math.floor(Math.random() * 150)));
    }
  }
}

async function claim(db: Db, feedIds: number[], claimToken: string, limit: number, scope: "active_cover" | "active_gallery" | "any" = "any") {
  const now = new Date();
  await withLockRetry(() => db
    .update(mlsMedia)
    .set({ status: "expired", sourceUrl: null })
    .where(
      and(
        inArray(mlsMedia.feedId, feedIds),
        eq(mlsMedia.status, "pending"),
        isNotNull(mlsMedia.sourceUrlExpiresAt),
        lt(mlsMedia.sourceUrlExpiresAt, now)
      )
    ));
  await withLockRetry(() => db.execute(sql`
    UPDATE ${mlsMedia}
       SET ${mlsMedia.status} = 'downloading', ${mlsMedia.claimedBy} = ${claimToken}, ${mlsMedia.attempts} = ${mlsMedia.attempts} + 1
     WHERE ${inArray(mlsMedia.feedId, feedIds)}
       AND ${mlsMedia.status} = 'pending'
       AND ${mlsMedia.sourceUrl} IS NOT NULL
       AND (${mlsMedia.nextAttemptAt} IS NULL OR ${mlsMedia.nextAttemptAt} <= ${now})
       ${scope === "active_cover" ? sql`AND ${mlsMedia.isPrimary} = 1 AND EXISTS (
         SELECT 1 FROM ${mlsListings} AS active_listing
          WHERE active_listing.id = ${mlsMedia.listingId}
            AND active_listing.standardStatus = 'active'
            AND active_listing.removedFromFeedAt IS NULL
       )` : scope === "active_gallery" ? sql`AND ${mlsMedia.priority} = 0 AND EXISTS (
         SELECT 1 FROM ${mlsListings} AS active_listing
          WHERE active_listing.id = ${mlsMedia.listingId}
            AND active_listing.standardStatus = 'active'
            AND active_listing.removedFromFeedAt IS NULL
       )` : sql``}
     ORDER BY ${mlsMedia.priority} ASC, ${mlsMedia.id} ASC
     LIMIT ${limit}`));
  return db
    .select()
    .from(mlsMedia)
    .where(and(eq(mlsMedia.claimedBy, claimToken), eq(mlsMedia.status, "downloading")));
}

async function pool<T>(items: T[], concurrency: number, run: (item: T) => Promise<void>) {
  let index = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, async () => {
    while (index < items.length) {
      const item = items[index++];
      await run(item);
    }
  });
  await Promise.all(workers);
}

export async function runMediaBatch(
  lane: ProviderLane,
  feedContexts: FeedContext[],
  workerId: string,
  options: { signal?: AbortSignal; fetchImpl?: typeof fetch; batchSize?: number; refreshLimit?: number } = {}
): Promise<MediaBatchResult> {
  const db = await requireDb();
  const result: MediaBatchResult = { claimed: 0, stored: 0, failed: 0, expired: 0, skipped: 0, deleted: 0, refreshed: 0 };
  const feeds = new Map(feedContexts.map(ctx => [ctx.feed.id, ctx]));
  const feedIds = Array.from(feeds.keys());
  if (!feedIds.length) return result;
  // Photos wait (without using retries) until a dedicated private bucket exists.
  if (storage === privateMlsStorage && privateMlsStorageError()) return result;

  await deleteRemovedMedia(db, feedIds, result);
  // The old queue gave every market status the same priority. A status-aware
  // claim puts Active covers first without a mass UPDATE of millions of rows.
  const claimToken = `${workerId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`.slice(0, 160);
  const batchSize = options.batchSize ?? 50;
  let rows = await claim(db, feedIds, claimToken, batchSize, "active_cover");
  if (!rows.length && (options.refreshLimit ?? 20) > 0) {
    await refreshExpiredUrls(db, lane, feeds, result, { ...options, limit: options.refreshLimit ?? 20, priority: "active" });
    rows = await claim(db, feedIds, claimToken, batchSize, "active_cover");
  }
  if (!rows.length || rows.length < batchSize) {
    // Automatically requested Active galleries run after Active covers, before
    // under-contract covers or explicit non-Active galleries. A trickle of new
    // covers (or one feed's cover backlog on a shared token) must not starve
    // galleries: fill the batch with ready gallery photos first, and fetch new
    // gallery links only once those run out, so ready links never pile up.
    rows = await claim(db, feedIds, claimToken, batchSize - rows.length, "active_gallery"); // claim returns every row under this token
    if (!rows.length || rows.length < batchSize) {
      await refreshExpiredUrls(db, lane, feeds, result, { ...options, limit: options.refreshLimit ?? 20, priority: "active_gallery" });
      rows = await claim(db, feedIds, claimToken, batchSize - rows.length, "active_gallery");
    }
  }
  if (!rows.length) {
    await refreshExpiredUrls(db, lane, feeds, result, { ...options, limit: options.refreshLimit ?? 20, priority: "gallery" });
    rows = await claim(db, feedIds, claimToken, options.batchSize ?? 50);
  }
  if (!rows.length && (options.refreshLimit ?? 20) > 0) {
    await refreshExpiredUrls(db, lane, feeds, result, { ...options, limit: options.refreshLimit ?? 20, priority: "market" });
    rows = await claim(db, feedIds, claimToken, options.batchSize ?? 50);
  }
  result.claimed = rows.length;

  await pool(rows, lane.limits.mediaConcurrency, async row => {
    if (options.signal?.aborted) {
      await db.update(mlsMedia).set({ status: "pending", claimedBy: null }).where(and(eq(mlsMedia.id, row.id), eq(mlsMedia.status, "downloading"), eq(mlsMedia.claimedBy, claimToken)));
      return;
    }
    const ctx = feeds.get(row.feedId)!;
    const adapter = adapterFor(ctx.feed.provider);
    const singleUse = adapter.capabilities.mediaUrlsExpire;
    try {
      const { data, contentType } = await downloadMedia(lane, row.sourceUrl!, await adapter.mediaHeaders(ctx), {
        signal: options.signal,
        fetchImpl: options.fetchImpl,
      });
      const ext = extension(contentType);
      if (!ext || data.length === 0 || data.length > MAX_BYTES) {
        await db
          .update(mlsMedia)
          .set({ status: "skipped", sourceUrl: null, claimedBy: null, lastError: `Not stored: ${contentType}, ${data.length} bytes` })
          .where(and(eq(mlsMedia.id, row.id), eq(mlsMedia.status, "downloading"), eq(mlsMedia.claimedBy, claimToken)));
        result.skipped += 1;
        return;
      }
      const key = `mls/${safeSegment(ctx.source.code)}/${ctx.feed.id}/${safeSegment(row.resourceKey)}/${safeSegment(row.mediaKey)}-${safeSegment(claimToken)}.${ext}`;
      const { url: storageUrl } = await storage.put(key, data, contentType.split(";")[0]);
      const url = row.listingId ? withMlsPhotoListingId(storageUrl, row.listingId)! : storageUrl;
      const stored = await db
        .update(mlsMedia)
        .set({
          status: "stored",
          s3Key: key,
          url,
          bytes: data.length,
          mimeType: contentType.split(";")[0].slice(0, 64),
          storedAt: new Date(),
          sourceUrl: null,
          sourceUrlExpiresAt: null,
          claimedBy: null,
          lastError: null,
          nextAttemptAt: null,
        })
        .where(and(eq(mlsMedia.id, row.id), eq(mlsMedia.status, "downloading"), eq(mlsMedia.claimedBy, claimToken)));
      if (!Number((stored as any)[0]?.affectedRows)) {
        await storage.remove(key);
        return; // A removal/update won the race. Never resurrect its image.
      }
      if (row.s3Key && row.s3Key !== key) await storage.remove(row.s3Key);
      if (row.isPrimary && row.listingId) {
        await db.update(mlsListings).set({ primaryPhotoUrl: url }).where(eq(mlsListings.id, row.listingId));
      }
      result.stored += 1;
    } catch (error) {
      const message = redactUrl(String(error instanceof Error ? error.message : error)).slice(0, 512);
      const gone = error instanceof FatalHttpError && [403, 404, 410].includes(error.status);
      if (singleUse) {
        // A 429 on the old host means THIS image was already accessed. Even a
        // freshly queried URL for the same MediaKey cannot be used this hour.
        const duplicate429 = ctx.feed.provider === "mls_grid" && error instanceof RetryableHttpError &&
          error.status === 429 && new URL(row.sourceUrl!).hostname === "media.mlsgrid.com";
        await db
          .update(mlsMedia)
          .set({
            status: row.attempts >= MAX_ATTEMPTS ? "failed" : "expired",
            sourceUrl: null, claimedBy: null, lastError: message,
            nextAttemptAt: duplicate429 ? new Date(Date.now() + 65 * 60_000) : null,
          })
          .where(and(eq(mlsMedia.id, row.id), eq(mlsMedia.status, "downloading"), eq(mlsMedia.claimedBy, claimToken)));
        if (row.attempts >= MAX_ATTEMPTS) result.failed += 1;
        else result.expired += 1;
        return;
      }
      const final = gone || row.attempts >= MAX_ATTEMPTS;
      await db
        .update(mlsMedia)
        .set({
          status: final ? "failed" : "pending",
          claimedBy: null,
          lastError: message,
          nextAttemptAt: final ? null : new Date(Date.now() + Math.min(6 * 60, 2 ** row.attempts) * 60_000),
        })
        .where(and(eq(mlsMedia.id, row.id), eq(mlsMedia.status, "downloading"), eq(mlsMedia.claimedBy, claimToken)));
      if (final) result.failed += 1;
    }
  });
  return result;
}

export async function hasPendingMedia(feedIds: number[]) {
  if (!feedIds.length) return 0;
  const db = await requireDb();
  for (const status of ["pending", "expired", "delete_pending"] as const) {
    const [row] = await db.select({ id: mlsMedia.id }).from(mlsMedia)
      .where(and(inArray(mlsMedia.feedId, feedIds), eq(mlsMedia.status, status), status === "expired" ? lt(mlsMedia.attempts, MAX_ATTEMPTS) : undefined))
      .limit(1);
    if (row) return 1;
  }
  return 0;
}
