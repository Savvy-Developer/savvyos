import { and, desc, eq, gt, inArray, isNull, lt, sql } from "drizzle-orm";
import { mlsListings, mlsMedia, mlsSyncCursors } from "../../drizzle/mlsSchema";
import { getDb } from "../db";
import { adapterFor } from "./adapters";
import { mlsGridBatchUrl } from "./adapters/mlsGrid";
import { parseODataPage, type FeedContext } from "./adapters/types";
import { loadMetadataLocalFields, loadOverrides } from "./engine";
import { requestJson, type ProviderLane } from "./http";
import { withLockRetry } from "./media";
import { MARKET_STATUSES } from "./normalize/enums";
import { processRecords } from "./store";

/**
 * MLS Grid switched Savvy's production tokens to its CDN on Oct 2, 2026.
 * Listings synced before that hold old one-hour links (or none), so their
 * galleries cannot display. This walks each feed's on-market listings once,
 * newest ID first so the listings people see first are fixed first, and
 * re-reads the ones missing CDN links, 100 per API call (`ListingId in (...)`);
 * processRecords then stores the CDN links. New and changed listings already
 * arrive with CDN links through normal replication.
 */
type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

/** Cursor name; the highWaterMark is the lowest listing ID already handled. */
export const CDN_LINK_RESOURCE = "CdnLinksNewest";
/** MLS Grid accepts at most 100 ListingIds per request. */
export const CDN_LINK_BATCH = 100;
/** Groups relinked at once; the work is database writes, not API calls. */
export const CDN_LINK_PARALLEL = 4;
/** Listings examined per feed per worker pass. */
export const CDN_LINK_SCAN = 1_000;

export type CdnLinkProgress = { scanned: number; relinked: number; requests: number; done: boolean };

export async function backfillCdnLinks(
  db: Db,
  lane: ProviderLane,
  ctx: FeedContext,
  options: { signal?: AbortSignal; fetchImpl?: typeof fetch; scanSize?: number } = {}
): Promise<CdnLinkProgress> {
  const progress: CdnLinkProgress = { scanned: 0, relinked: 0, requests: 0, done: true };
  if (ctx.feed.provider !== "mls_grid" || !ctx.feed.enabled || ctx.feed.mediaPolicy === "none") return progress;
  const [cursor] = await db.select().from(mlsSyncCursors)
    .where(and(eq(mlsSyncCursors.feedId, ctx.feed.id), eq(mlsSyncCursors.resource, CDN_LINK_RESOURCE))).limit(1);
  if (cursor?.phase === "incremental") return progress;
  const lastId = Number(cursor?.highWaterMark ?? 0);
  const belowId = Number.isSafeInteger(lastId) && lastId > 0 ? lastId : null;
  const listings = await db.select({
    id: mlsListings.id,
    listingNumber: mlsListings.listingNumber,
    photosCount: mlsListings.photosCount,
  })
    .from(mlsListings, { forceIndex: ["PRIMARY"] })
    .where(and(
      eq(mlsListings.feedId, ctx.feed.id), inArray(mlsListings.standardStatus, MARKET_STATUSES),
      isNull(mlsListings.removedFromFeedAt), gt(mlsListings.photosCount, 0),
      belowId === null ? undefined : lt(mlsListings.id, belowId),
    ))
    .orderBy(desc(mlsListings.id))
    .limit(Math.max(1, options.scanSize ?? CDN_LINK_SCAN));
  progress.scanned = listings.length;
  if (!listings.length) {
    await db.insert(mlsSyncCursors).values({
      feedId: ctx.feed.id, resource: CDN_LINK_RESOURCE, phase: "incremental", highWaterMark: belowId === null ? null : String(belowId), lastSuccessAt: new Date(),
    }).onDuplicateKeyUpdate({ set: { phase: "incremental", lastSuccessAt: new Date() } });
    return progress;
  }
  progress.done = false;

  // A listing is linked once every photo it reports has a CDN link.
  const linked = await db.select({
    listingId: mlsMedia.listingId,
    links: sql<number>`SUM(${mlsMedia.sourceUrl} LIKE 'https://cdn-%.mlsgrid.com/%')`.mapWith(Number),
  })
    .from(mlsMedia)
    .where(inArray(mlsMedia.listingId, listings.map(listing => listing.id)))
    .groupBy(mlsMedia.listingId);
  const links = new Map(linked.map(row => [Number(row.listingId), Number(row.links)]));
  const missing = listings.filter(listing => (links.get(listing.id) ?? 0) < Number(listing.photosCount ?? 0) && listing.listingNumber);

  const adapter = adapterFor(ctx.feed.provider);
  const prefix = ctx.feed.keyPrefix ?? ctx.source.keyPrefix ?? "";
  // Lowest ID handled so far; null means nothing finished this pass.
  let processed: number | null = listings[listings.length - 1].id;
  if (missing.length) {
    const overrides = await loadOverrides(db, ctx);
    const metadataLocalFields = await loadMetadataLocalFields(db, ctx.feed.id);
    const groups: Array<typeof missing> = [];
    for (let index = 0; index < missing.length; index += CDN_LINK_BATCH) groups.push(missing.slice(index, index + CDN_LINK_BATCH));
    for (let start = 0; start < groups.length; start += CDN_LINK_PARALLEL) {
      if (options.signal?.aborted) {
        // Resume below the last finished group, not the end of this scan.
        const finished = groups[start - 1];
        processed = finished ? finished[finished.length - 1].id : null;
        break;
      }
      await Promise.all(groups.slice(start, start + CDN_LINK_PARALLEL).map(async group => {
        const url = mlsGridBatchUrl(ctx, group.map(listing => `${prefix}${listing.listingNumber}`));
        const { body } = await requestJson(lane, url, () => adapter.authHeaders(ctx), { signal: options.signal, fetchImpl: options.fetchImpl });
        progress.requests += 1;
        const records = parseODataPage(body).value;
        if (records.length) {
          await processRecords(ctx, adapter, "Property", records, { overrides, metadataLocalFields, force: true });
          progress.relinked += records.length;
        }
      }));
    }
  }
  if (processed !== null && processed !== belowId) {
    await db.insert(mlsSyncCursors).values({
      feedId: ctx.feed.id, resource: CDN_LINK_RESOURCE, phase: "initial", highWaterMark: String(processed), recordsSeen: listings.length,
    }).onDuplicateKeyUpdate({ set: {
      highWaterMark: String(processed),
      recordsSeen: sql`${mlsSyncCursors.recordsSeen} + ${listings.length}`,
    } });
  }
  return progress;
}

const LEGACY_MARKER_PREFIX = "__gallery_request__";
const RETIRE_CHUNK = 5_000;
const RETIRE_CHUNKS_PER_PASS = 20;
const retired = new Set<number>();

/**
 * One-time cleanup of the old gallery-download queue, which CDN display
 * replaced: deletes gallery request markers, stops queued MLS Grid gallery
 * downloads (their CDN links stay for display), and drops the old scanner's
 * cursors. Bounded chunks per pass; a feed is marked done once a pass finds
 * nothing left, so later passes cost nothing.
 */
export async function retireLegacyGalleryQueue(db: Db, feedIds: number[]) {
  const todo = feedIds.filter(id => !retired.has(id));
  if (!todo.length) return { removed: 0, stopped: 0 };
  let removed = 0;
  let stopped = 0;
  let finished = true;
  for (let chunk = 0; chunk < RETIRE_CHUNKS_PER_PASS; chunk++) {
    const result = await withLockRetry(() => db.execute(sql`
      DELETE FROM ${mlsMedia}
       WHERE ${inArray(mlsMedia.feedId, todo)}
         AND ${mlsMedia.status} IN ('expired', 'failed', 'pending', 'skipped')
         AND ${mlsMedia.priority} = 0
         AND LEFT(${mlsMedia.mediaKey}, ${LEGACY_MARKER_PREFIX.length}) = ${LEGACY_MARKER_PREFIX}
       LIMIT ${RETIRE_CHUNK}`));
    const affected = Number((result as any)[0]?.affectedRows ?? 0);
    removed += affected;
    if (affected < RETIRE_CHUNK) break;
    if (chunk === RETIRE_CHUNKS_PER_PASS - 1) finished = false;
  }
  for (let chunk = 0; chunk < RETIRE_CHUNKS_PER_PASS; chunk++) {
    // Gallery rows sit in priority 0 (old scanner) or 50+ (store.ts); covers
    // are 1-40. Bounding by those bands keeps each chunk a short range on
    // mls_media_queue_idx instead of rescanning every expired cover.
    const result = await withLockRetry(() => db.execute(sql`
      UPDATE ${mlsMedia}
         SET ${mlsMedia.status} = 'skipped', ${mlsMedia.claimedBy} = NULL, ${mlsMedia.nextAttemptAt} = NULL
       WHERE ${inArray(mlsMedia.feedId, todo)}
         AND ${mlsMedia.status} IN ('pending', 'expired')
         AND (${mlsMedia.priority} = 0 OR ${mlsMedia.priority} >= 50)
         AND ${mlsMedia.isPrimary} = 0
       LIMIT ${RETIRE_CHUNK}`));
    const affected = Number((result as any)[0]?.affectedRows ?? 0);
    stopped += affected;
    if (affected < RETIRE_CHUNK) break;
    if (chunk === RETIRE_CHUNKS_PER_PASS - 1) finished = false;
  }
  if (finished) {
    await db.delete(mlsSyncCursors).where(and(inArray(mlsSyncCursors.feedId, todo), eq(mlsSyncCursors.resource, "ActiveGallery")));
    for (const id of todo) retired.add(id);
  }
  return { removed, stopped };
}

/** Tests reset the once-per-process cleanup flag. */
export function resetLegacyGalleryRetirement() {
  retired.clear();
}
