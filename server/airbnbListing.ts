// /rooms/<id>, and Airbnb Plus / Luxe listings at /rooms/plus/<id> or /luxury/listing/<id>.
const AIRBNB_LISTING_ID_PATTERN = /^\/(?:rooms\/(?:plus\/)?|luxury\/listing\/)(\d+)/i;

/**
 * Airbnb's own hosts: airbnb.com and every country site (airbnb.co.in,
 * airbnb.co.uk, airbnb.ca, airbnb.com.au, airbnb.de, ...), with or without a
 * subdomain such as www. or m. Listing IDs are the same on every one of them.
 */
const AIRBNB_HOST_PATTERN = /(^|\.)airbnb\.(com|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})$/i;

export function isAirbnbHost(hostname: string): boolean {
  return AIRBNB_HOST_PATTERN.test(hostname.toLowerCase());
}

/** Extracts a listing ID from any Airbnb room URL, on any Airbnb country site. */
export function extractAirbnbListingId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  // A bare listing ID pasted on its own.
  if (/^\d{4,25}$/.test(trimmed)) return trimmed;
  try {
    // Accept links pasted without https://, e.g. "airbnb.co.in/rooms/123".
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    if (!isAirbnbHost(url.hostname)) return null;
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
