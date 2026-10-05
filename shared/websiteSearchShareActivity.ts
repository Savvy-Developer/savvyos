/**
 * Market searches and shares on the new website, as the old site logged them
 * on the SavvyOS contact timeline ("market_searched" and "property_shared",
 * see SAVVY_WEB_EVENTS in server/webhookHandlers.ts).
 *
 * Shared by the public site, which decides when a search counts as made, and
 * the server, which writes the timeline entry. Both use the same signature so
 * "the same search twice" means the same thing on each side.
 */

/** Where on the site a search was made. */
export const WEBSITE_SEARCH_SOURCES = ["properties", "market_page"] as const;
export type WebsiteSearchSource = (typeof WEBSITE_SEARCH_SOURCES)[number];

/** How a visitor shared something. "copy_link" is the Copy button. */
export const WEBSITE_SHARE_CHANNELS = [
  "copy_link",
  "x",
  "facebook",
  "whatsapp",
  "linkedin",
  "native",
] as const;
export type WebsiteShareChannel = (typeof WEBSITE_SHARE_CHANNELS)[number];

export const WEBSITE_SHARE_CHANNEL_LABELS: Record<WebsiteShareChannel, string> = {
  copy_link: "Copied link",
  x: "X",
  facebook: "Facebook",
  whatsapp: "WhatsApp",
  linkedin: "LinkedIn",
  native: "Device share sheet",
};

/** What was shared: a listing, or a Resources article. */
export type WebsiteShareTarget =
  | { kind: "property"; propertyId: number }
  | { kind: "post"; contentId: number };

/** A search as the visitor committed it. Every field is optional. */
export type WebsiteSearchCriteria = {
  query?: string | null;
  marketId?: number | null;
  state?: string | null;
  propertyType?: string | null;
  minBeds?: number | null;
  minBaths?: number | null;
  minPrice?: number | null;
  maxPrice?: number | null;
};

/** Search text shorter than this, with nothing else set, is not a search yet. */
export const MIN_SEARCH_QUERY_LENGTH = 2;

/** Present, positive numbers only. "0 beds" or a blank box is no filter. */
function positive(value: number | null | undefined): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function text(value: string | null | undefined, max: number): string | null {
  const trimmed = String(value ?? "").trim().replace(/\s+/g, " ");
  return trimmed ? trimmed.slice(0, max) : null;
}

/** The criteria with blanks dropped and text tidied, in a fixed key order. */
export function normalizeSearchCriteria(criteria: WebsiteSearchCriteria): Required<{
  [K in keyof WebsiteSearchCriteria]: NonNullable<WebsiteSearchCriteria[K]> | null;
}> {
  return {
    query: text(criteria.query, 200),
    marketId: positive(criteria.marketId),
    state: text(criteria.state, 50)?.toUpperCase() ?? null,
    propertyType: text(criteria.propertyType, 64),
    minBeds: positive(criteria.minBeds),
    minBaths: positive(criteria.minBaths),
    minPrice: positive(criteria.minPrice),
    maxPrice: positive(criteria.maxPrice),
  };
}

/** Nothing worth logging: no text (or a stub of one) and no filter. */
export function isEmptySearch(criteria: WebsiteSearchCriteria): boolean {
  const n = normalizeSearchCriteria(criteria);
  const hasFilter =
    n.marketId != null ||
    n.state != null ||
    n.propertyType != null ||
    n.minBeds != null ||
    n.minBaths != null ||
    n.minPrice != null ||
    n.maxPrice != null;
  if (hasFilter) return false;
  return !n.query || n.query.length < MIN_SEARCH_QUERY_LENGTH;
}

/**
 * One string per distinct search. Case and spacing in the text do not make a
 * search different, so "Austin" and " austin " are the same search.
 */
export function searchSignature(criteria: WebsiteSearchCriteria, source: WebsiteSearchSource): string {
  const n = normalizeSearchCriteria(criteria);
  return JSON.stringify([source, n.query?.toLowerCase() ?? null, n.marketId, n.state, n.propertyType?.toLowerCase() ?? null, n.minBeds, n.minBaths, n.minPrice, n.maxPrice]);
}

function money(value: number): string {
  if (value >= 1_000_000) {
    const m = value / 1_000_000;
    return `$${Number.isInteger(m) ? m : m.toFixed(1)}M`;
  }
  if (value >= 1_000) return `$${Math.round(value / 1_000)}k`;
  return `$${value}`;
}

/**
 * One line for the timeline: what was searched, in words.
 *   "Austin" · Market: Destin, FL · 3+ beds · $500k–$1M
 */
export function describeSearch(criteria: WebsiteSearchCriteria, marketName?: string | null): string {
  const n = normalizeSearchCriteria(criteria);
  const parts: string[] = [];
  if (n.query) parts.push(`"${n.query}"`);
  const market = text(marketName, 120);
  if (market) parts.push(`Market: ${market}`);
  else if (n.marketId != null) parts.push(`Market #${n.marketId}`);
  if (n.state) parts.push(`State: ${n.state}`);
  if (n.propertyType) parts.push(`Type: ${n.propertyType}`);
  if (n.minBeds != null) parts.push(`${n.minBeds}+ beds`);
  if (n.minBaths != null) parts.push(`${n.minBaths}+ baths`);
  if (n.minPrice != null && n.maxPrice != null) parts.push(`${money(n.minPrice)}–${money(n.maxPrice)}`);
  else if (n.minPrice != null) parts.push(`${money(n.minPrice)}+`);
  else if (n.maxPrice != null) parts.push(`Up to ${money(n.maxPrice)}`);
  return parts.join(" · ") || "All properties";
}
