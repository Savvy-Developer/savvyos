import { and, asc, eq, gt, inArray, isNull, lt, sql } from "drizzle-orm";
import { mlsListings, mlsMedia, mlsSyncCursors } from "../../drizzle/mlsSchema";
import { getDb } from "../db";
import type { FeedContext } from "./adapters/types";
import { galleryMarkerCondition, galleryMarkerKey } from "./gallery";

/** Uses the existing feed/resource cursor; no full-table COUNT or mass UPDATE.
 * One MLS Grid call fetches Media for up to 20 queued listings later in media.ts.
 * Keep the live listing sync and primary-photo pipeline ahead of the gallery. */
const RESOURCE = "ActiveGallery";
const MAX_QUEUED_PHOTOS = 240;
const SCAN_SIZE = 12;

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export async function queueActiveGalleries(db: Db, ctx: FeedContext, scanSize = SCAN_SIZE) {
  if (ctx.feed.provider !== "mls_grid" || !ctx.feed.enabled || ctx.feed.mediaPolicy === "none") return { scanned: 0, queued: 0 };
  // The queue index starts with status,priority. This bounded existence check
  // does not COUNT the hundreds of thousands of expired off-market URLs.
  const outstanding = await db.select({ id: mlsMedia.id }).from(mlsMedia)
    .where(and(eq(mlsMedia.feedId, ctx.feed.id), inArray(mlsMedia.status, ["pending", "expired", "downloading"]), eq(mlsMedia.priority, 0), lt(mlsMedia.attempts, 5)))
    .limit(MAX_QUEUED_PHOTOS + 1);
  if (outstanding.length >= MAX_QUEUED_PHOTOS) return { scanned: 0, queued: 0 };

  const [cursor] = await db.select().from(mlsSyncCursors)
    .where(and(eq(mlsSyncCursors.feedId, ctx.feed.id), eq(mlsSyncCursors.resource, RESOURCE))).limit(1);
  const lastId = Number(cursor?.highWaterMark ?? 0);
  const fromId = Number.isSafeInteger(lastId) && lastId > 0 ? lastId : 0;
  const take = Math.min(Math.max(1, scanSize), SCAN_SIZE, MAX_QUEUED_PHOTOS - outstanding.length);
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
