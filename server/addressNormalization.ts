/**
 * Address normalization and verification utilities for property deduplication.
 * 
 * Strategy:
 * 1. Normalize: lowercase, strip punctuation, collapse whitespace, expand common abbreviations
 * 2. Geocode via Google Maps API for verification and canonical address
 * 3. Build a normalized key from address + city + state + zip for duplicate detection
 * 4. Capitalize: proper title-case for stored addresses
 */

import { makeRequest, type GeocodingResult } from "./_core/map";

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
 * Geocode an address using Google Maps API.
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
  city?: string;
  state?: string;
  zip?: string;
  placeId?: string;
} | null> {
  try {
    const fullAddress = [address, city, state, zip].filter(Boolean).join(", ");
    const result = await makeRequest<GeocodingResult>("/maps/api/geocode/json", {
      address: fullAddress,
    });

    if (result.status !== "OK" || !result.results?.length) {
      return { success: false };
    }

    const first = result.results[0];
    const components = first.address_components;

    const getComponent = (type: string): string | undefined => {
      const comp = components.find(c => c.types.includes(type));
      return comp?.short_name || comp?.long_name;
    };

    const streetNumber = getComponent("street_number");
    const route = getComponent("route");
    const locality = getComponent("locality") || getComponent("sublocality");
    const adminArea = getComponent("administrative_area_level_1");
    const postalCode = getComponent("postal_code");

    // Build normalized key from geocoded components
    const geocodedAddress = [streetNumber, route].filter(Boolean).join(" ");
    const normalizedKey = buildNormalizedKey(geocodedAddress, locality, adminArea, postalCode);

    return {
      success: true,
      formattedAddress: first.formatted_address,
      normalizedKey,
      streetNumber,
      route,
      city: locality,
      state: adminArea,
      zip: postalCode,
      placeId: first.place_id,
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
