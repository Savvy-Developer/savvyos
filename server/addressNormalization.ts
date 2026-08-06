/**
 * Address normalization and verification utilities for property deduplication.
 * 
 * Strategy:
 * 1. Normalize: lowercase, strip punctuation, collapse whitespace, expand common abbreviations
 * 2. Geocode via Google Maps API for verification and canonical address
 * 3. Build a normalized key from address + city + state + zip for duplicate detection
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
