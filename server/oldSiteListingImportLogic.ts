/**
 * Moving the old savvy-agents.com listings into SavvyOS: the pure part.
 *
 * The old site publishes its live listings through its own public API
 * (www.savvy-agents.com/api/properties). Each listing becomes a SavvyOS
 * property (the record agents, pro-formas and transactions hang off) plus a
 * website listing on /newsite, kept under the old slug so the old address
 * redirects to it once the domain moves.
 *
 * No database or network here; server/oldSiteListingImport.ts does those.
 */
import { normalizeAddressString } from "./addressNormalization";

export const OLD_SITE_ORIGIN = "https://www.savvy-agents.com";
/** The old site's public photo storage. */
export const OLD_SITE_STORAGE = "https://wvgbegmtbvkcfdzvvfnk.supabase.co/storage/v1/object/public/";
/** The old API refuses more than 100 per request, and its paging cursor fails, so ranges are split instead. */
export const OLD_SITE_PAGE_LIMIT = 100;

export type OldPhoto = {
  externalUrl?: string | null;
  storagePath?: string | null;
  isPrimary?: boolean | null;
  displayOrder?: number | null;
};

export type OldListing = {
  id: string;
  slug: string;
  address: string;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  title?: string | null;
  description?: string | null;
  price?: number | null;
  bedrooms?: number | null;
  bathrooms?: string | number | null;
  sqft?: number | null;
  yearBuilt?: number | null;
  propertyType?: string | null;
  strategyTags?: string[] | null;
  amenityTags?: string[] | null;
  listedAt?: string | null;
  createdAt?: string | null;
  photos?: OldPhoto[] | null;
  market?: { name?: string | null } | null;
  agent?: { slug?: string | null; profile?: { email?: string | null; fullName?: string | null } | null } | null;
};

const PROPERTY_TYPES = new Set(["single_family", "multi_family", "condo", "townhouse", "land", "commercial", "other"]);

/** A photo's public address, or null. */
export function oldPhotoUrl(photo: OldPhoto): string | null {
  const external = (photo.externalUrl ?? "").trim();
  if (/^https?:\/\//i.test(external)) return external;
  const stored = (photo.storagePath ?? "").trim();
  if (!stored) return null;
  if (/^https?:\/\//i.test(stored)) return stored;
  return `${OLD_SITE_STORAGE}${stored.replace(/^\/+/, "")}`;
}

/** Photos in the old site's order: the primary first, then by display order. */
export function oldPhotoUrls(photos: OldPhoto[] | null | undefined): string[] {
  const ordered = [...(photos ?? [])].sort(
    (a, b) => Number(!!b.isPrimary) - Number(!!a.isPrimary) || (a.displayOrder ?? 0) - (b.displayOrder ?? 0)
  );
  const urls: string[] = [];
  for (const photo of ordered) {
    const url = oldPhotoUrl(photo);
    if (url && !urls.includes(url)) urls.push(url);
  }
  return urls;
}

const TAG_WORDS: Record<string, string> = { brrrr: "BRRRR", ev: "EV", str: "STR", hoa: "HOA", adu: "ADU" };

/** "family-friendly" -> "Family-friendly", "remote-work" -> "Remote Work", "hot tub" -> "Hot Tub". */
export function oldTagLabel(tag: string): string {
  const clean = tag.trim();
  if (!clean) return "";
  if (/-friendly$/i.test(clean)) {
    const head = clean.slice(0, -"-friendly".length).replace(/-/g, " ");
    return `${head.charAt(0).toUpperCase()}${head.slice(1).toLowerCase()}-friendly`;
  }
  return clean
    .split(/[\s-]+/)
    .filter(Boolean)
    .map(word => TAG_WORDS[word.toLowerCase()] ?? `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`)
    .join(" ");
}

/** Strategy tags first (what the listing is for), then amenities. At most 12. */
export function oldTags(listing: Pick<OldListing, "strategyTags" | "amenityTags">): string[] {
  const out: string[] = [];
  for (const tag of [...(listing.strategyTags ?? []), ...(listing.amenityTags ?? [])]) {
    const label = oldTagLabel(String(tag));
    if (label && !out.some(existing => existing.toLowerCase() === label.toLowerCase())) out.push(label);
    if (out.length >= 12) break;
  }
  return out;
}

/**
 * The duplicate key: street, city and state, no ZIP. 67 old listings have no
 * ZIP, and a key with the ZIP would miss the SavvyOS record for the same
 * house. Kept separate from SavvyOS's own normalizedAddress on purpose.
 */
export function streetKey(address: string | null | undefined, city: string | null | undefined, state: string | null | undefined): string {
  return normalizeAddressString([address, city, state].filter(Boolean).join(" "));
}

const positiveNumber = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

/** What the old listing becomes in SavvyOS. */
export function mapOldListing(listing: OldListing, importedOn: string) {
  const photos = oldPhotoUrls(listing.photos);
  const price = positiveNumber(listing.price);
  const beds = positiveNumber(listing.bedrooms);
  const baths = positiveNumber(listing.bathrooms);
  const sqft = positiveNumber(listing.sqft);
  const year = positiveNumber(listing.yearBuilt);
  const type = listing.propertyType && PROPERTY_TYPES.has(listing.propertyType) ? listing.propertyType : null;
  return {
    property: {
      address: listing.address.trim(),
      city: listing.city?.trim() || null,
      state: listing.state?.trim().toUpperCase() || null,
      zip: listing.zipCode?.trim() || null,
      beds: beds == null ? null : String(beds),
      baths: baths == null ? null : String(baths),
      sqft: sqft == null ? null : Math.round(sqft),
      propertyType: type as any,
      yearBuilt: year == null ? null : Math.round(year),
      listPrice: price == null ? null : String(price),
      notes: `Imported from savvy-agents.com on ${importedOn} (old listing ${listing.slug}).`,
    },
    website: {
      slug: listing.slug,
      headline: (listing.title || listing.address).trim().slice(0, 512),
      summary: listing.description?.trim() || null,
      heroImageUrl: photos[0] ?? null,
      galleryImageUrls: photos,
      featureTags: oldTags(listing),
      investmentHighlights: [] as string[],
      sourceUrl: `${OLD_SITE_ORIGIN}/properties/${listing.slug}`,
      importedData: {
        source: "savvy-agents.com",
        oldId: listing.id,
        oldSlug: listing.slug,
        oldAgentSlug: listing.agent?.slug ?? null,
        oldMarket: listing.market?.name ?? null,
        listedAt: listing.listedAt ?? null,
        oldCreatedAt: listing.createdAt ?? null,
        importedOn,
      },
    },
    agentSlug: listing.agent?.slug?.trim().toLowerCase() || null,
    agentEmail: listing.agent?.profile?.email?.trim().toLowerCase() || null,
    agentName: listing.agent?.profile?.fullName?.trim() || null,
  };
}

/** Split a price range in two, for the old API's 100-row cap. */
export function splitRange(min: number, max: number): [[number, number], [number, number]] | null {
  if (max - min < 1) return null;
  const mid = Math.floor((min + max) / 2);
  return [
    [min, mid],
    [mid + 1, max],
  ];
}
