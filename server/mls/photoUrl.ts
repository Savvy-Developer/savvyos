/**
 * The private photo route needs a listingId to use mls_media_listing_idx rather
 * than searching the millions of media rows by their unindexed S3 key.
 * URLs already stored before this hint existed are upgraded in API responses.
 */
export function withMlsPhotoListingId(url: string | null, listingId: number): string | null {
  if (!url?.startsWith("/api/mls/media?")) return url;
  if (!Number.isSafeInteger(listingId) || listingId < 1) return null;
  const parsed = new URL(url, "https://savvyos.invalid");
  if (parsed.pathname !== "/api/mls/media" || !parsed.searchParams.has("key")) return url;
  parsed.searchParams.set("listingId", String(listingId));
  return `${parsed.pathname}${parsed.search}`;
}
