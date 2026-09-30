/**
 * RESO enumerations arrive in different spellings depending on the provider:
 * "Active Under Contract" (MLS Grid, PrettyEnums), "ActiveUnderContract"
 * (Trestle default), "Odata.Models.StandardStatus'Active'" (some direct
 * servers). Everything collapses to one canonical snake_case code.
 */

export const CANONICAL_STATUSES = [
  "active",
  "active_under_contract",
  "pending",
  "closed",
  "coming_soon",
  "hold",
  "withdrawn",
  "expired",
  "canceled",
  "delete",
  "incomplete",
  "unknown",
] as const;
export type CanonicalStatus = (typeof CANONICAL_STATUSES)[number];

export const STATUS_LABELS: Record<CanonicalStatus, string> = {
  active: "Active",
  active_under_contract: "Active Under Contract",
  pending: "Pending",
  closed: "Closed",
  coming_soon: "Coming Soon",
  hold: "Hold",
  withdrawn: "Withdrawn",
  expired: "Expired",
  canceled: "Canceled",
  delete: "Delete",
  incomplete: "Incomplete",
  unknown: "Unknown",
};

/** Statuses a buyer can still act on. Used for default search and media policy. */
export const MARKET_STATUSES: CanonicalStatus[] = ["active", "active_under_contract", "coming_soon", "pending"];
export const OFF_MARKET_STATUSES: CanonicalStatus[] = ["withdrawn", "expired", "canceled", "hold"];

function enumKey(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = String(value).trim();
  // Odata.Models.StandardStatus'Active' -> Active
  const quoted = text.match(/'([^']*)'$/);
  if (quoted) text = quoted[1];
  return text.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const STATUS_ALIASES: Record<string, CanonicalStatus> = {
  active: "active",
  activeundercontract: "active_under_contract",
  undercontract: "active_under_contract",
  contingent: "active_under_contract",
  activecontingent: "active_under_contract",
  backupoffer: "active_under_contract",
  pending: "pending",
  closed: "closed",
  sold: "closed",
  comingsoon: "coming_soon",
  hold: "hold",
  temporarilyoffmarket: "hold",
  withdrawn: "withdrawn",
  expired: "expired",
  canceled: "canceled",
  cancelled: "canceled",
  delete: "delete",
  deleted: "delete",
  incomplete: "incomplete",
};

export function normalizeStatus(value: unknown): CanonicalStatus {
  const key = enumKey(value);
  if (!key) return "unknown";
  return STATUS_ALIASES[key] ?? "unknown";
}

export const CANONICAL_PROPERTY_TYPES = [
  "residential",
  "residential_income",
  "residential_lease",
  "land",
  "farm",
  "commercial_sale",
  "commercial_lease",
  "business_opportunity",
  "manufactured_in_park",
  "unknown",
] as const;
export type CanonicalPropertyType = (typeof CANONICAL_PROPERTY_TYPES)[number];

export const PROPERTY_TYPE_LABELS: Record<CanonicalPropertyType, string> = {
  residential: "Residential",
  residential_income: "Residential Income",
  residential_lease: "Residential Lease",
  land: "Land",
  farm: "Farm",
  commercial_sale: "Commercial Sale",
  commercial_lease: "Commercial Lease",
  business_opportunity: "Business Opportunity",
  manufactured_in_park: "Manufactured In Park",
  unknown: "Unknown",
};

const PROPERTY_TYPE_ALIASES: Record<string, CanonicalPropertyType> = {
  residential: "residential",
  singlefamily: "residential",
  singlefamilyresidence: "residential",
  condominium: "residential",
  condo: "residential",
  townhouse: "residential",
  residentialincome: "residential_income",
  multifamily: "residential_income",
  income: "residential_income",
  residentiallease: "residential_lease",
  lease: "residential_lease",
  rental: "residential_lease",
  land: "land",
  lotsandland: "land",
  lotsland: "land",
  vacantland: "land",
  farm: "farm",
  farmandranch: "farm",
  ranch: "farm",
  commercialsale: "commercial_sale",
  commercial: "commercial_sale",
  commerciallease: "commercial_lease",
  businessopportunity: "business_opportunity",
  manufacturedinpark: "manufactured_in_park",
  mobilehome: "manufactured_in_park",
};

export function normalizePropertyType(value: unknown): CanonicalPropertyType {
  const key = enumKey(value);
  if (!key) return "unknown";
  return PROPERTY_TYPE_ALIASES[key] ?? "unknown";
}

/** Spaced label for any enum value, e.g. ActiveUnderContract -> Active Under Contract. */
export function prettyEnum(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  let text = String(value).trim();
  const quoted = text.match(/'([^']*)'$/);
  if (quoted) text = quoted[1];
  if (/\s/.test(text)) return text;
  return text.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z])([A-Z][a-z])/g, "$1 $2");
}
