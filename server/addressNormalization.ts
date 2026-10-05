/**
 * Address normalization and verification utilities for property deduplication.
 * 
 * Strategy:
 * 1. Normalize: lowercase, strip punctuation, collapse whitespace, expand common abbreviations
 * 2. Look up the address through Google Places for verification and canonical address
 * 3. Build a normalized key from address + city + state + zip for duplicate detection
 * 4. Capitalize: proper title-case for stored addresses
 */

import { requestGooglePlaces, type GooglePlacesAddressComponent } from "./_core/googlePlaces";

// Common street suffix abbreviations → full forms
const STREET_ABBREVIATIONS: Record<string, string> = {
  st: "street",
  str: "street",
  ave: "avenue",
  av: "avenue",
  blvd: "boulevard",
  dr: "drive",
  ln: "lane",
  rd: "road",
  ct: "court",
  cir: "circle",
  pl: "place",
  pkwy: "parkway",
  hwy: "highway",
  trl: "trail",
  ter: "terrace",
  way: "way",
  pt: "point",
};

// Common directional abbreviations
const DIRECTIONAL_ABBREVIATIONS: Record<string, string> = {
  n: "north",
  s: "south",
  e: "east",
  w: "west",
  ne: "northeast",
  nw: "northwest",
  se: "southeast",
  sw: "southwest",
};

// US state abbreviations (for proper capitalization — always uppercase)
const STATE_ABBREVIATIONS = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC",
]);

// Directional abbreviations that should stay uppercase when used as abbreviations
const DIRECTIONAL_ABBREVS_UPPER = new Set(["N", "S", "E", "W", "NE", "NW", "SE", "SW"]);

/**
 * Normalize an address string for comparison purposes.
 * Strips punctuation, lowercases, collapses whitespace, and standardizes abbreviations.
 */
export function normalizeAddressString(addr: string | null | undefined): string {
  if (!addr) return "";
  let normalized = addr
    .trim()
    .toLowerCase()
    // Preserve a unit's identity while treating common designators as equivalent.
    // This happens before stripping # and punctuation so “Apt. 2” and “#2” match.
    .replace(/\b(?:apt(?:artment)?\.?|unit|suite|ste\.?|lot|bldg|building)(?:\s*#\s*|\s+)([a-z0-9][a-z0-9-]*)/g, (_, unit: string) => ` unit ${unit.replace(/-/g, " unitdash ")}`)
    .replace(/#\s*([a-z0-9][a-z0-9-]*)/g, (_, unit: string) => ` unit ${unit.replace(/-/g, " unitdash ")}`)
    .replace(/[.,#\-']/g, "")  // Strip punctuation
    .replace(/\s+/g, " ");      // Collapse whitespace

  // Expand street suffix abbreviations (only at word boundaries)
  const words = normalized.split(" ");
  const expanded = words.map((word, i) => {
    // Don't expand the first word (likely a number) or unit numbers
    if (i === 0 && /^\d+$/.test(word)) return word;
    if (STREET_ABBREVIATIONS[word]) return STREET_ABBREVIATIONS[word];
    if (DIRECTIONAL_ABBREVIATIONS[word] && i < words.length - 1) return DIRECTIONAL_ABBREVIATIONS[word];
    return word;
  });

  return expanded.join(" ");
}

/**
 * Build a normalized key from address components for duplicate detection.
 * Combines address + city + state + zip into a single normalized string.
 */
export function buildNormalizedKey(
  address: string | null | undefined,
  city: string | null | undefined,
  state: string | null | undefined,
  zip: string | null | undefined
): string {
  const parts = [address, city, state, zip].filter(Boolean).map(p => p!.trim());
  const combined = parts.join(" ");
  return normalizeAddressString(combined);
}

/**
 * Prepare a manually entered property identity without changing its street
 * address. This is deliberately separate from Google lookups: validation or
 * suggestions must never silently replace what a user entered.
 */
export function prepareTypedPropertyAddress(input: { address: string; city?: string | null; state?: string | null; zip?: string | null }) {
  const address = input.address.trim().replace(/\s+/g, " ");
  const city = capitalizeCity(input.city);
  const state = normalizeState(input.state);
  const zip = input.zip?.trim() ?? "";
  return {
    address,
    city,
    state,
    zip,
    normalizedAddress: buildNormalizedKey(address, city, state, zip),
  };
}

/**
 * Pull a trailing apartment, unit, suite, lot, or hash-number designator from
 * a street-address field. The returned value is canonicalized for storage and
 * duplicate keys, so “Apt. 2”, “#2”, and “Unit 2” identify the same unit.
 */
export function extractAddressUnit(address: string | null | undefined): string | null {
  if (!address) return null;
  const match = address.trim().match(/(?:^|[\s,])(?:#\s*([A-Za-z0-9][A-Za-z0-9-]*)|(?:apt(?:artment)?|unit|suite|ste\.?|lot|bldg|building)(?:\s*#\s*|\s+)([A-Za-z0-9][A-Za-z0-9-]*))\s*$/i);
  const value = match?.[1] ?? match?.[2];
  return value ? value.toUpperCase() : null;
}

/**
 * Adds a normalized unit designator to a Google street result. User-entered
 * unit data wins because Places sometimes resolves a building but omits its
 * subpremise; Google subpremise data fills the gap when it is available.
 */
export function buildUnitAwareStreetAddress(
  streetAddress: string,
  sourceAddress?: string | null,
  googleSubpremise?: string | null,
): string {
  const unit = extractAddressUnit(sourceAddress) ?? extractAddressUnit(googleSubpremise) ?? googleSubpremise?.trim().toUpperCase();
  return [streetAddress.trim(), unit ? `Unit ${unit}` : null].filter(Boolean).join(" ");
}

/**
 * Properly capitalize an address string for display/storage.
 * Rules:
 * - Numbers stay as-is
 * - Directional abbreviations (N, S, E, W, NE, etc.) stay uppercase
 * - State abbreviations stay uppercase
 * - Everything else is title-cased (first letter uppercase, rest lowercase)
 * - Unit/apt designators: "#" prefix stays, number stays
 */
export function capitalizeAddress(addr: string | null | undefined): string {
  if (!addr) return "";
  const trimmed = addr.trim().replace(/\s+/g, " ");
  if (!trimmed) return "";

  const words = trimmed.split(" ");
  const capitalized = words.map((word) => {
    // Pure numbers stay as-is
    if (/^\d+$/.test(word)) return word;
    // Alphanumeric (like unit "3B") stays uppercase
    if (/^\d+[A-Za-z]$/.test(word)) return word.toUpperCase();
    // Hash-prefixed unit numbers stay as-is
    if (word.startsWith("#")) return word;
    // Check if it's a directional abbreviation (case-insensitive)
    if (DIRECTIONAL_ABBREVS_UPPER.has(word.toUpperCase()) && word.length <= 2) return word.toUpperCase();
    // State abbreviation
    if (STATE_ABBREVIATIONS.has(word.toUpperCase()) && word.length === 2) return word.toUpperCase();
    // Title case everything else
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });

  return capitalized.join(" ");
}

/**
 * Capitalize a city name (title case).
 */
export function capitalizeCity(city: string | null | undefined): string {
  if (!city) return "";
  return city.trim().split(/\s+/).map(w => 
    w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
  ).join(" ");
}

/**
 * Normalize state to uppercase 2-letter abbreviation.
 */
export function normalizeState(state: string | null | undefined): string {
  if (!state) return "";
  const upper = state.trim().toUpperCase();
  if (STATE_ABBREVIATIONS.has(upper)) return upper;
  return upper; // Return as-is if not a recognized abbreviation
}

/**
 * Look up an address through Google Places API (New).
 * Returns the formatted address and components if successful.
 * Falls back gracefully if the API is unavailable.
 */
export async function geocodeAddress(
  address: string,
  city?: string | null,
  state?: string | null,
  zip?: string | null
): Promise<{
  success: boolean;
  formattedAddress?: string;
  normalizedKey?: string;
  streetNumber?: string;
  route?: string;
  subpremise?: string;
  city?: string;
  state?: string;
  zip?: string;
  placeId?: string;
} | null> {
  try {
    const fullAddress = [address, city, state, zip].filter(Boolean).join(", ");
    const result = await requestGooglePlaces<{
      places?: Array<{
        id?: string;
        formattedAddress?: string;
        addressComponents?: GooglePlacesAddressComponent[];
      }>;
    }>("/v1/places:searchText", {
      method: "POST",
      body: JSON.stringify({ textQuery: fullAddress, regionCode: "US" }),
    }, "places.id,places.formattedAddress,places.addressComponents");
    const first = result.places?.[0];
    const components = first?.addressComponents;

    if (!first || !components?.length) {
      return { success: false };
    }

    const getComponent = (type: string, short = false): string | undefined => {
      const comp = components.find(c => c.types?.includes(type));
      return short ? comp?.shortText : comp?.longText;
    };

    const streetNumber = getComponent("street_number");
    const route = getComponent("route");
    const subpremise = getComponent("subpremise");
    const locality = getComponent("locality") || getComponent("postal_town") || getComponent("sublocality") || getComponent("administrative_area_level_3");
    const adminArea = getComponent("administrative_area_level_1", true) || getComponent("administrative_area_level_1");
    const postalCode = getComponent("postal_code");

    // Build normalized key from geocoded components
    const geocodedAddress = buildUnitAwareStreetAddress(
      [streetNumber, route].filter(Boolean).join(" "),
      address,
      subpremise,
    );
    const normalizedKey = buildNormalizedKey(geocodedAddress, locality, adminArea, postalCode);

    return {
      success: true,
      formattedAddress: first.formattedAddress,
      normalizedKey,
      streetNumber,
      route,
      subpremise,
      city: locality,
      state: adminArea,
      zip: postalCode,
      placeId: first.id,
    };
  } catch (err) {
    // If geocoding fails (API unavailable, etc.), return null to fall back to local normalization
    console.error("Geocoding failed:", err);
    return null;
  }
}

/**
 * Check if two normalized keys are similar enough to be considered duplicates.
 * Uses exact match on normalized keys (after abbreviation expansion).
 */
export function areAddressesSimilar(key1: string, key2: string): boolean {
  if (!key1 || !key2) return false;
  return key1 === key2;
}

// ─── Loose matching ──────────────────────────────────────────────────────────
// The exact key above cannot tell that "360 E Overlook" and "360 E Overlook
// Ln" are the same home, because one of them has no street suffix at all.
// The loose key drops the parts people leave off or write differently
// (direction words and the street suffix) and keeps the parts that tell two
// homes apart (house number, street name, unit, and ZIP or city/state). It is
// only ever used to flag a possible duplicate for a person to look at, never
// to merge records on its own.

const DIRECTION_WORDS = new Set([
  "n", "s", "e", "w", "ne", "nw", "se", "sw",
  "north", "south", "east", "west", "northeast", "northwest", "southeast", "southwest",
]);

// Street suffixes from USPS Publication 28, appendix C1, in both the
// abbreviated and the full form. Only used to drop a trailing suffix, so a
// word like "park" or "ridge" in the middle of a street name is kept.
const STREET_SUFFIX_WORDS = new Set([
  "alley", "aly", "allee", "ally",
  "anex", "anx", "annex",
  "arcade", "arc",
  "avenue", "ave", "av", "aven", "avenu", "avn", "avnue",
  "bayou", "byu",
  "beach", "bch",
  "bend", "bnd",
  "bluff", "blf", "bluffs", "blfs",
  "bottom", "btm",
  "boulevard", "blvd", "boul", "boulv",
  "branch", "br", "brnch",
  "bridge", "brg",
  "brook", "brk", "brooks", "brks",
  "burg", "bg",
  "bypass", "byp",
  "camp", "cp",
  "canyon", "cyn",
  "cape", "cpe",
  "causeway", "cswy",
  "center", "ctr", "centre", "cntr",
  "circle", "cir", "circ", "circles", "cirs",
  "cliff", "clf", "cliffs", "clfs",
  "club", "clb",
  "common", "cmn", "commons", "cmns",
  "corner", "cor", "corners", "cors",
  "course", "crse",
  "court", "ct", "courts", "cts",
  "cove", "cv", "coves", "cvs",
  "creek", "crk",
  "crescent", "cres",
  "crest", "crst",
  "crossing", "xing",
  "crossroad", "xrd",
  "curve", "curv",
  "dale", "dl",
  "dam", "dm",
  "divide", "dv",
  "drive", "dr", "drv", "drives", "drs",
  "estate", "est", "estates", "ests",
  "expressway", "expy",
  "extension", "ext",
  "fall", "falls", "fls",
  "ferry", "fry",
  "field", "fld", "fields", "flds",
  "flat", "flt", "flats", "flts",
  "ford", "frd",
  "forest", "frst",
  "forge", "frg",
  "fork", "frk", "forks", "frks",
  "fort", "ft",
  "freeway", "fwy",
  "garden", "gdn", "gardens", "gdns",
  "gateway", "gtwy",
  "glen", "gln",
  "green", "grn",
  "grove", "grv",
  "harbor", "hbr",
  "haven", "hvn",
  "heights", "hts", "ht",
  "highway", "hwy",
  "hill", "hl", "hills", "hls",
  "hollow", "holw",
  "inlet", "inlt",
  "island", "is", "islands", "iss", "isle",
  "junction", "jct",
  "key", "ky",
  "knoll", "knl", "knolls", "knls",
  "lake", "lk", "lakes", "lks",
  "landing", "lndg",
  "lane", "ln",
  "loop", "lp",
  "manor", "mnr",
  "meadow", "mdw", "meadows", "mdws",
  "mews",
  "mill", "ml",
  "mission", "msn",
  "motorway", "mtwy",
  "mount", "mt",
  "mountain", "mtn",
  "orchard", "orch",
  "oval",
  "overpass", "opas",
  "park", "prk", "parks",
  "parkway", "pkwy", "pky",
  "pass",
  "path",
  "pike", "pke",
  "pine", "pne", "pines", "pnes",
  "place", "pl",
  "plain", "pln", "plains", "plns",
  "plaza", "plz",
  "point", "pt", "points", "pts",
  "port", "prt",
  "prairie", "pr",
  "ranch", "rnch",
  "rapid", "rpd", "rapids", "rpds",
  "rest", "rst",
  "ridge", "rdg", "ridges", "rdgs",
  "river", "riv",
  "road", "rd", "roads", "rds",
  "route", "rte",
  "row",
  "run",
  "shore", "shr", "shores", "shrs",
  "spring", "spg", "springs", "spgs",
  "square", "sq",
  "station", "sta",
  "stream", "strm",
  "street", "st", "str", "streets", "sts",
  "summit", "smt",
  "terrace", "ter",
  "trace", "trce",
  "track", "trak",
  "trail", "trl", "tr",
  "tunnel", "tunl",
  "turnpike", "tpke",
  "union", "un",
  "valley", "vly",
  "view", "vw", "views", "vws",
  "village", "vlg",
  "ville", "vl",
  "vista", "vis",
  "walk",
  "wall",
  "way", "wy", "ways",
  "well", "wl", "wells", "wls",
]);

export type LooseAddress = {
  address: string | null | undefined;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
};

/**
 * The street part of the loose key: house number, street name and unit.
 * "360 E Overlook Ln" and "360 E Overlook" both give "360 overlook".
 * Empty when there is no house number, because "Overlook" on its own could be
 * any house on the street.
 */
export function looseStreetKey(address: string | null | undefined): string {
  const words = normalizeAddressString(address).split(" ").filter(Boolean);
  if (!words.length || !/^\d/.test(words[0])) return "";
  const houseNumber = words[0];
  // normalizeAddressString writes every apt/suite/lot/# as "unit <n>". The
  // unit stays in the key so two condos in one building never match, and a
  // unit never matches the same street address with no unit.
  const unitAt = words.indexOf("unit", 1);
  // normalizeAddressString leaves a final "n" or "e" as is, so spell every
  // direction out here for the cases below that keep them.
  const street = (unitAt === -1 ? words.slice(1) : words.slice(1, unitAt)).map(word => DIRECTIONAL_ABBREVIATIONS[word] ?? word);
  const unit = unitAt === -1 ? "" : words.slice(unitAt + 1).join(" ");

  const withoutDirections = street.filter(word => !DIRECTION_WORDS.has(word));
  // Keep the directions when they carry the meaning. On a grid street
  // ("100 W 300 N", "12 E 5th St") they are what tells two homes apart, and
  // in "North St" the direction is the street name.
  const isGrid = /^\d/.test(withoutDirections[0] ?? "");
  const onlySuffixesLeft = withoutDirections.every(word => STREET_SUFFIX_WORDS.has(word));
  const name = isGrid || onlySuffixesLeft ? [...street] : withoutDirections;
  // Drop the trailing suffixes, but never the whole name.
  while (name.length > 1 && STREET_SUFFIX_WORDS.has(name[name.length - 1])) name.pop();

  return [houseNumber, ...name, ...(unit ? ["unit", unit] : [])].join(" ");
}

const looseZip = (zip: string | null | undefined) => zip?.match(/\d{5}/)?.[0] ?? "";
const looseCityState = (city: string | null | undefined, state: string | null | undefined) => {
  const cleanCity = (city ?? "").toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
  const cleanState = (state ?? "").toLowerCase().trim();
  return cleanCity && cleanState ? `${cleanCity} ${cleanState}` : "";
};

/**
 * A looser comparison key than buildNormalizedKey, for showing a single
 * address's loose form. Uses the 5-digit ZIP when there is one, otherwise
 * city and state. To compare two addresses use looseAddressMatch, which only
 * uses the ZIP when both sides have one.
 */
export function looseAddressKey(
  address: string | null | undefined,
  city?: string | null,
  state?: string | null,
  zip?: string | null,
): string {
  const street = looseStreetKey(address);
  const place = looseZip(zip) || looseCityState(city, state);
  return street && place ? `${street} | ${place}` : "";
}

/**
 * Whether two addresses are probably the same home written differently.
 * Same house number, street name and unit, and the same 5-digit ZIP when both
 * have one; when either has no ZIP, the same city and state instead.
 */
export function looseAddressMatch(a: LooseAddress, b: LooseAddress): boolean {
  const streetA = looseStreetKey(a.address);
  if (!streetA || streetA !== looseStreetKey(b.address)) return false;
  const zipA = looseZip(a.zip);
  const zipB = looseZip(b.zip);
  if (zipA && zipB) return zipA === zipB;
  const placeA = looseCityState(a.city, a.state);
  return Boolean(placeA) && placeA === looseCityState(b.city, b.state);
}

/** "Possible duplicate of #861 (360 E Overlook, Glendale, UT 84729)" */
export function possibleDuplicateMessage(existing: { id: number } & LooseAddress): string {
  const where = [existing.address, existing.city, [existing.state, existing.zip].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  return `Possible duplicate of #${existing.id} (${where})`;
}

/** The first of `rows` that loosely matches `target`, if any. */
export function findLooseDuplicate<T extends LooseAddress>(target: LooseAddress, rows: readonly T[]): T | undefined {
  if (!looseStreetKey(target.address)) return undefined;
  return rows.find(row => looseAddressMatch(target, row));
}
