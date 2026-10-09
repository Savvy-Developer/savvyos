import { and, desc, eq, gt, inArray, isNull, lt, sql } from "drizzle-orm";
import { mlsListings, mlsMedia, mlsSyncCursors } from "../../drizzle/mlsSchema";
import { getMlsDb as getDb } from "./db";
import { adapterFor } from "./adapters";
import { mlsGridBatchUrl } from "./adapters/mlsGrid";
import { parseODataPage, type FeedContext } from "./adapters/types";
import { loadMetadataLocalFields, loadOverrides } from "./engine";
import { requestJson, type ProviderLane } from "./http";
import { withLockRetry } from "./media";
import { MARKET_STATUSES, OFF_MARKET_STATUSES, type CanonicalStatus } from "./normalize/enums";
import { processRecords } from "./store";

/**
 * MLS Grid switched Savvy's production tokens to its CDN on Oct 2, 2026.
 * Listings synced before that hold old one-hour links (or none), so their
 * galleries cannot display. This walks each feed's listings once per scope
 * (on-market, then sold, then off-market), newest ID first so the listings
 * people see first are fixed first, and re-reads the ones missing CDN links,
 * 100 per API call (`ListingId in (...)`); processRecords then stores the CDN
 * links under the feed's normal photo rules. New and changed listings already
 * arrive with CDN links through normal replication.
 */
type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

/**
 * Relink order, one cursor each; a cursor's highWaterMark is the lowest
 * listing ID already handled. On-market first, then sold listings (comps),
 * then withdrawn/expired/canceled history.
 */
export const CDN_LINK_SCOPES: ReadonlyArray<{ resource: string; scope: string; statuses: CanonicalStatus[] }> = [
  { resource: "CdnLinksNewest", scope: "on_market", statuses: MARKET_STATUSES },
  { resource: "CdnLinksClosed", scope: "closed", statuses: ["closed"] },
  { resource: "CdnLinksOffMarket", scope: "off_market", statuses: OFF_MARKET_STATUSES },
];
export const CDN_LINK_RESOURCE = CDN_LINK_SCOPES[0].resource;
export const CDN_LINK_RESOURCES = CDN_LINK_SCOPES.map(item => item.resource);
/** MLS Grid accepts at most 100 ListingIds per request. */
export const CDN_LINK_BATCH = 100;
/** Groups relinked at once; the work is database writes, not API calls. */
export const CDN_LINK_PARALLEL = 4;
/** Listings examined per feed per worker pass. */
export const CDN_LINK_SCAN = 1_000;
/**
 * Share of a token's rolling-day API limit the backfill may use. Past it, the
 * backfill waits for usage to age out, so live replication (status changes,
 * the 12-hour refresh rule) always has the rest of the day's budget.
 */
export const CDN_LINK_DAY_SHARE = 0.75;

export function backfillHasHeadroom(lane: ProviderLane) {
  const day = lane.api.snapshot().windows.find(window => window.windowMs === 86_400_000);
  return !day || day.used < day.limit * CDN_LINK_DAY_SHARE;
}

/**
 * (feedId, standardStatus, removedFromFeedAt) plus InnoDB's implicit id: one
 * status of one feed reads newest first as a single index range, so a scan
 * costs only that feed's own rows. The old primary-key walk filtered on
 * feedId, so the last step of every scope walked every other feed's rows down
 * to id 1: a full table scan per feed per scope (35 minutes for MIBOR). Built
 * online by schema.ts; until MySQL lists it the backfill waits, because FORCE
 * INDEX on a missing index is an error and waiting keeps the build unblocked.
 */
export const RELINK_SCAN_INDEX = "mls_listings_feed_status_idx";
const RELINK_INDEX_RECHECK_MS = 60_000;
let relinkIndex = { ready: false, checkedAt: 0 };

export function resetRelinkIndexAvailability() {
  relinkIndex = { ready: false, checkedAt: 0 };
}

/** Cheap and cached: once the index exists this never queries again. */
export async function relinkIndexReady(db: Db, now = Date.now()): Promise<boolean> {
  if (relinkIndex.ready || now - relinkIndex.checkedAt < RELINK_INDEX_RECHECK_MS) return relinkIndex.ready;
  try {
    const [rows] = (await db.execute(sql`SELECT 1 AS present FROM information_schema.statistics
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'mls_listings' AND INDEX_NAME = ${RELINK_SCAN_INDEX} LIMIT 1`)) as unknown as [Array<{ present: number }>];
    relinkIndex = { ready: rows.length > 0, checkedAt: now };
  } catch {
    relinkIndex = { ...relinkIndex, checkedAt: now };
  }
  return relinkIndex.ready;
}

/** Newest `limit` listings of one feed and status below `belowId` that report photos. */
export function relinkScanQuery(db: Db, feedId: number, status: CanonicalStatus, belowId: number | null, limit: number) {
  return db.select({
    id: mlsListings.id,
    listingNumber: mlsListings.listingNumber,
    photosCount: mlsListings.photosCount,
  })
    .from(mlsListings, { forceIndex: [RELINK_SCAN_INDEX] })
    .where(and(
      eq(mlsListings.feedId, feedId), eq(mlsListings.standardStatus, status),
      isNull(mlsListings.removedFromFeedAt), gt(mlsListings.photosCount, 0),
      belowId === null ? undefined : lt(mlsListings.id, belowId),
    ))
    .orderBy(desc(mlsListings.id))
    .limit(limit);
}

export type CdnLinkProgress = { scope: string | null; scanned: number; relinked: number; requests: number; done: boolean };

/** Runs one pass of the first unfinished scope; an empty scope finishes and hands over to the next. */
export async function backfillCdnLinks(
  db: Db,
  lane: ProviderLane,
  ctx: FeedContext,
  options: { signal?: AbortSignal; fetchImpl?: typeof fetch; scanSize?: number } = {}
): Promise<CdnLinkProgress> {
  const idle: CdnLinkProgress = { scope: null, scanned: 0, relinked: 0, requests: 0, done: true };
  if (ctx.feed.provider !== "mls_grid" || !ctx.feed.enabled || ctx.feed.mediaPolicy === "none") return idle;
  const cursors = await db.select().from(mlsSyncCursors)
    .where(and(eq(mlsSyncCursors.feedId, ctx.feed.id), inArray(mlsSyncCursors.resource, CDN_LINK_RESOURCES)));
  for (const scope of CDN_LINK_SCOPES) {
    const cursor = cursors.find(row => row.resource === scope.resource);
    if (cursor?.phase === "incremental") continue;
    if (options.signal?.aborted) return idle;
    if (!backfillHasHeadroom(lane)) return { scope: "api_headroom", scanned: 0, relinked: 0, requests: 0, done: false };
    if (!(await relinkIndexReady(db))) return { scope: "index_pending", scanned: 0, relinked: 0, requests: 0, done: false };
    const progress = await backfillScope(db, lane, ctx, scope, cursor?.highWaterMark ?? null, options);
    if (progress.scanned) return progress;
  }
  return idle;
}

async function backfillScope(
  db: Db,
  lane: ProviderLane,
  ctx: FeedContext,
  scope: (typeof CDN_LINK_SCOPES)[number],
  highWaterMark: string | null,
  options: { signal?: AbortSignal; fetchImpl?: typeof fetch; scanSize?: number }
): Promise<CdnLinkProgress> {
  const progress: CdnLinkProgress = { scope: scope.scope, scanned: 0, relinked: 0, requests: 0, done: true };
  const lastId = Number(highWaterMark ?? 0);
  const belowId = Number.isSafeInteger(lastId) && lastId > 0 ? lastId : null;
  const limit = Math.max(1, options.scanSize ?? CDN_LINK_SCAN);
  // One index range per status, newest first. The newest `limit` across all
  // of them is exactly the scope's newest `limit`, so the cursor still holds.
  const candidates: Array<{ id: number; listingNumber: string | null; photosCount: number | null }> = [];
  for (const status of scope.statuses) candidates.push(...await relinkScanQuery(db, ctx.feed.id, status, belowId, limit));
  const listings = candidates.sort((a, b) => b.id - a.id).slice(0, limit);
  progress.scanned = listings.length;
  if (!listings.length) {
    await db.insert(mlsSyncCursors).values({
      feedId: ctx.feed.id, resource: scope.resource, phase: "incremental", highWaterMark: belowId === null ? null : String(belowId), lastSuccessAt: new Date(),
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
      feedId: ctx.feed.id, resource: scope.resource, phase: "initial", highWaterMark: String(processed), recordsSeen: listings.length,
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
 * cursors. Bounded chunks per pass. Finishing deletes the feed's ActiveGallery
 * cursor, so a feed without one is already done and costs one cursor lookup,
 * even after a worker restart.
 */
export async function retireLegacyGalleryQueue(db: Db, feedIds: number[]) {
  const unchecked = feedIds.filter(id => !retired.has(id));
  if (!unchecked.length) return { removed: 0, stopped: 0 };
  const pending = await db.selectDistinct({ feedId: mlsSyncCursors.feedId }).from(mlsSyncCursors)
    .where(and(inArray(mlsSyncCursors.feedId, unchecked), eq(mlsSyncCursors.resource, "ActiveGallery")));
  const pendingIds = new Set(pending.map(row => Number(row.feedId)));
  for (const id of unchecked) if (!pendingIds.has(id)) retired.add(id);
  const todo = unchecked.filter(id => pendingIds.has(id));
  if (!todo.length) return { removed: 0, stopped: 0 };
  let removed = 0;
  let stopped = 0;
  let finished = true;
  for (let chunk = 0; chunk < RETIRE_CHUNKS_PER_PASS; chunk++) {
    // Markers were written as expired and never set to skipped; leaving
    // skipped out keeps this off the million-row (skipped, 0) index range.
    const result = await withLockRetry(() => db.execute(sql`
      DELETE FROM ${mlsMedia}
       WHERE ${inArray(mlsMedia.feedId, todo)}
         AND ${mlsMedia.status} IN ('expired', 'failed', 'pending')
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
