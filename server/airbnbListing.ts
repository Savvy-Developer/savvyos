const AIRBNB_LISTING_ID_PATTERN = /^\/rooms\/(\d+)/i;

/** Extracts a listing ID from the canonical Airbnb room URL variants. */
export function extractAirbnbListingId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    if (hostname !== "airbnb.com" && !hostname.endsWith(".airbnb.com")) return null;
    return url.pathname.match(AIRBNB_LISTING_ID_PATTERN)?.[1] ?? null;
  } catch {
    return null;
  }
}

function addPhotoUrl(photos: string[], candidate: unknown): void {
  if (typeof candidate !== "string") return;
  const url = candidate.trim();
  if (!/^https?:\/\//i.test(url) || photos.includes(url)) return;
  photos.push(url);
}

/**
 * Airbnb’s RapidAPI response has used several photo shapes over time. This
 * collects them in the visual priority order used by the Airbnb listing page.
 */
export function extractAirbnbPhotoUrls(listingData: any, maxPhotos = 5): string[] {
  const photos: string[] = [];
  const sections = Array.isArray(listingData?.sectionContainer)
    ? listingData.sectionContainer
    : [];
  const hero = sections.find((section: any) => section?.sectionId === "HERO_DEFAULT")?.section;

  // Current response shape: HERO_DEFAULT.previewImages contains the visible
  // listing carousel. Older payloads exposed HERO_DEFAULT.mediaItems instead.
  for (const image of hero?.previewImages ?? []) {
    addPhotoUrl(photos, image?.baseUrl ?? image?.url ?? image?.imageUrl);
  }
  for (const image of hero?.mediaItems ?? []) {
    addPhotoUrl(photos, image?.baseUrl ?? image?.url ?? image?.imageUrl);
  }
  addPhotoUrl(photos, hero?.shareSave?.sharingConfig?.imageUrl);

  // Fallback for listings without a hero carousel.
  if (photos.length === 0) {
    const sleeping = sections.find(
      (section: any) => section?.sectionId === "SLEEPING_ARRANGEMENT_WITH_IMAGES"
    )?.section;
    for (const arrangement of sleeping?.arrangementDetails ?? []) {
      for (const image of arrangement?.images ?? []) {
        addPhotoUrl(photos, image?.baseUrl ?? image?.url ?? image?.imageUrl);
      }
    }
  }

  return photos.slice(0, maxPhotos);
}
