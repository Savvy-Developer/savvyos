import { eq, or, sql } from "drizzle-orm";
import { mlsMedia } from "../../drizzle/mlsSchema";

// The original constant marker collided on mls_media's UNIQUE(feedId, mediaKey).
// Keep reading it until old queued requests have drained, but never write it again.
export const LEGACY_GALLERY_MARKER = "__gallery_request__";
export const GALLERY_MARKER_PREFIX = `${LEGACY_GALLERY_MARKER}:`;

export function galleryMarkerKey(listingId: number) {
  if (!Number.isSafeInteger(listingId) || listingId < 1) throw new Error("Invalid MLS listing ID");
  return `${GALLERY_MARKER_PREFIX}${listingId}`;
}

export function isGalleryMarker(mediaKey: string) {
  return mediaKey === LEGACY_GALLERY_MARKER || mediaKey.startsWith(GALLERY_MARKER_PREFIX);
}

export function galleryMarkerCondition() {
  return or(
    eq(mlsMedia.mediaKey, LEGACY_GALLERY_MARKER),
    sql`LEFT(${mlsMedia.mediaKey}, ${GALLERY_MARKER_PREFIX.length}) = ${GALLERY_MARKER_PREFIX}`
  )!;
}
