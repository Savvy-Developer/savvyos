import { and, asc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { mlsFeeds, mlsListings, mlsMedia } from "../../drizzle/mlsSchema";
import { getDb } from "../db";
import { licenseError } from "./license";
import { withMlsPhotoListingId } from "./photoUrl";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type ListingRef = { id: number; propertyId: number; sourceId: number; feedId: number; listingNumber: string | null; standardStatus: string };

/** The BBO record remains authoritative for listing facts. These are still IDX
 * media rows, displayed only to an authorized admin while the separate IDX
 * feed's internal-use license and the exact matching listing remain current. */
export async function licensedIdxPhotoFallbacks(db: Db, listings: ListingRef[]) {
  const fallback = new Map<number, { listingId: number; feedId: number; media: Array<{
    id: number; mediaKey: string; url: string; caption: string | null; category: string | null;
    isPrimary: boolean; sortOrder: number; status: "stored"; priority: number;
  }> }>();
  if (!listings.length) return fallback;
  const sourceIds = Array.from(new Set(listings.map(row => row.sourceId)));
  const feeds = await db.select().from(mlsFeeds).where(inArray(mlsFeeds.sourceId, sourceIds));
  const active = feeds.filter(feed => feed.enabled && !licenseError(feed));
  const bboIds = new Set(active.filter(feed => feed.feedType === "bbo").map(feed => feed.id));
  const idxFeeds = active.filter(feed => feed.feedType === "idx");
  const idxIds = idxFeeds.map(feed => feed.id);
  const idxSources = new Set(idxFeeds.map(feed => feed.sourceId));
  const targets = listings.filter(row => bboIds.has(row.feedId) && row.listingNumber && idxSources.has(row.sourceId));
  if (!targets.length || !idxIds.length) return fallback;

  // The property index limits this to at most one page's canonical properties;
  // listing number, source, active status and separate IDX feed must also match.
  const siblings = await db.select({
    id: mlsListings.id, feedId: mlsListings.feedId, propertyId: mlsListings.propertyId,
    sourceId: mlsListings.sourceId, listingNumber: mlsListings.listingNumber,
    standardStatus: mlsListings.standardStatus,
  }).from(mlsListings, { forceIndex: ["mls_listings_property_idx"] }).where(and(
    inArray(mlsListings.propertyId, Array.from(new Set(targets.map(row => row.propertyId)))),
    inArray(mlsListings.feedId, idxIds), isNull(mlsListings.removedFromFeedAt),
  ));
  const match = new Map<number, { id: number; feedId: number }>();
  for (const target of targets) {
    const sibling = siblings.find(row => row.propertyId === target.propertyId && row.sourceId === target.sourceId &&
      row.listingNumber === target.listingNumber && row.standardStatus === target.standardStatus && row.id !== target.id);
    if (sibling) match.set(target.id, sibling);
  }
  if (!match.size) return fallback;

  const media = await db.select({
    id: mlsMedia.id, listingId: mlsMedia.listingId, feedId: mlsMedia.feedId,
    mediaKey: mlsMedia.mediaKey, url: mlsMedia.url, caption: mlsMedia.caption,
    category: mlsMedia.category, isPrimary: mlsMedia.isPrimary,
    sortOrder: mlsMedia.sortOrder, status: mlsMedia.status, priority: mlsMedia.priority,
  }).from(mlsMedia, { forceIndex: ["mls_media_listing_idx"] }).where(and(
    inArray(mlsMedia.listingId, Array.from(new Set(Array.from(match.values()).map(row => row.id)))),
    inArray(mlsMedia.feedId, idxIds), eq(mlsMedia.status, "stored"), isNotNull(mlsMedia.url),
  )).orderBy(asc(mlsMedia.sortOrder), asc(mlsMedia.id));
  for (const [bboId, sibling] of Array.from(match.entries())) {
    const photos = media.filter(row => row.listingId === sibling.id && row.feedId === sibling.feedId && row.url)
      .map(row => ({
        id: row.id, mediaKey: row.mediaKey,
        url: withMlsPhotoListingId(row.url, sibling.id)!, caption: row.caption,
        category: row.category, isPrimary: row.isPrimary, sortOrder: row.sortOrder,
        status: "stored" as const, priority: row.priority,
      }));
    if (photos.length) fallback.set(bboId, { listingId: sibling.id, feedId: sibling.feedId, media: photos });
  }
  return fallback;
}
