import { and, asc, eq, gt, inArray, isNull, lt, sql } from "drizzle-orm";
import { mlsListings, mlsMedia, mlsSyncCursors } from "../../drizzle/mlsSchema";
import { getDb } from "../db";
import type { FeedContext } from "./adapters/types";
import { galleryMarkerCondition, galleryMarkerKey } from "./gallery";
import { isQueryTimeout } from "./media";

/** Uses the existing feed/resource cursor; no full-table COUNT or mass UPDATE.
 * One MLS Grid call fetches Media for up to 20 queued listings later in media.ts.
 * Keep the live listing sync and primary-photo pipeline ahead of the gallery.
 *
 * The cap bounds photos waiting per feed (about 50 listings' galleries by
 * default). It was 240 while every photo shared the API token's quota; MLS Grid
 * photo downloads are now outside those quotas, so the queue can run deeper. */
const RESOURCE = "ActiveGallery";
const positive = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : fallback;
};
export const ACTIVE_GALLERY_MAX_QUEUED = positive(process.env.MLS_ACTIVE_GALLERY_MAX_QUEUED, 1_500);
export const ACTIVE_GALLERY_SCAN_SIZE = positive(process.env.MLS_ACTIVE_GALLERY_SCAN_SIZE, 40);
const OUTSTANDING_TIMEOUT_MS = 5_000;

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export async function queueActiveGalleries(db: Db, ctx: FeedContext, options: { scanSize?: number; maxQueued?: number } = {}) {
  if (ctx.feed.provider !== "mls_grid" || !ctx.feed.enabled || ctx.feed.mediaPolicy === "none") return { scanned: 0, queued: 0 };
  const maxQueued = Math.max(1, options.maxQueued ?? ACTIVE_GALLERY_MAX_QUEUED);
  const scanSize = Math.max(1, options.scanSize ?? ACTIVE_GALLERY_SCAN_SIZE);
  // The queue index starts with status,priority. This bounded existence check
  // does not COUNT the hundreds of thousands of expired off-market URLs. Only
  // photos of listings that are still Active count: priority-0 rows left by a
  // listing that went under contract can never download here and must not
  // hold the queue closed. Capped server-side; on timeout, skip this pass.
  let outstanding: number;
  try {
    const rows = await db.select({
      id: sql<number>`/*+ MAX_EXECUTION_TIME(${sql.raw(String(OUTSTANDING_TIMEOUT_MS))}) */ ${mlsMedia.id}`.mapWith(Number),
    }).from(mlsMedia)
      .innerJoin(mlsListings, eq(mlsListings.id, mlsMedia.listingId))
      .where(and(
        eq(mlsMedia.feedId, ctx.feed.id), inArray(mlsMedia.status, ["pending", "expired", "downloading"]), eq(mlsMedia.priority, 0), lt(mlsMedia.attempts, 5),
        eq(mlsListings.standardStatus, "active"), isNull(mlsListings.removedFromFeedAt),
      ))
      .limit(maxQueued + 1);
    outstanding = rows.length;
  } catch (error) {
    if (isQueryTimeout(error)) return { scanned: 0, queued: 0 };
    throw error;
  }
  if (outstanding >= maxQueued) return { scanned: 0, queued: 0 };

  const [cursor] = await db.select().from(mlsSyncCursors)
    .where(and(eq(mlsSyncCursors.feedId, ctx.feed.id), eq(mlsSyncCursors.resource, RESOURCE))).limit(1);
  const lastId = Number(cursor?.highWaterMark ?? 0);
  const fromId = Number.isSafeInteger(lastId) && lastId > 0 ? lastId : 0;
  const take = scanSize;
  const listings = await db.select({ id: mlsListings.id, providerListingKey: mlsListings.providerListingKey, photosCount: mlsListings.photosCount })
    .from(mlsListings, { forceIndex: ["PRIMARY"] })
    .where(and(eq(mlsListings.feedId, ctx.feed.id), eq(mlsListings.standardStatus, "active"), isNull(mlsListings.removedFromFeedAt), gt(mlsListings.photosCount, 1), gt(mlsListings.id, fromId)))
    .orderBy(asc(mlsListings.id)).limit(take);

  let queued = 0;
  for (const listing of listings) {
    const [marker] = await db.select({ id: mlsMedia.id }).from(mlsMedia)
      .where(and(eq(mlsMedia.feedId, ctx.feed.id), eq(mlsMedia.resourceKey, listing.providerListingKey), galleryMarkerCondition())).limit(1);
    if (marker) continue; // Existing manual or automatic request is already being handled.
    const [{ stored }] = await db.select({ stored: sql<number>`count(*)` }).from(mlsMedia)
      .where(and(eq(mlsMedia.listingId, listing.id), eq(mlsMedia.status, "stored")));
    if (Number(stored) >= Number(listing.photosCount)) continue;
    await db.insert(mlsMedia).values({
      feedId: ctx.feed.id, listingId: listing.id, resourceKey: listing.providerListingKey,
      mediaKey: galleryMarkerKey(listing.id), status: "expired", priority: 0,
    }).onDuplicateKeyUpdate({ set: { priority: 0 } });
    queued++;
  }
  if (listings.length) {
    await db.insert(mlsSyncCursors).values({
      feedId: ctx.feed.id, resource: RESOURCE, phase: "initial",
      highWaterMark: String(listings[listings.length - 1].id), recordsSeen: listings.length,
    }).onDuplicateKeyUpdate({ set: {
      highWaterMark: String(listings[listings.length - 1].id),
      recordsSeen: sql`${mlsSyncCursors.recordsSeen} + ${listings.length}`,
    } });
  } else if (cursor?.phase === "initial") {
    await db.update(mlsSyncCursors).set({ phase: "incremental", lastSuccessAt: new Date() }).where(eq(mlsSyncCursors.id, cursor.id));
  }
  return { scanned: listings.length, queued };
}
