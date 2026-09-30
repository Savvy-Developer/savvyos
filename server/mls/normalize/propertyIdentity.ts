import { createHash } from "crypto";
import { normalizeAddressString } from "../../addressNormalization";

/**
 * One physical property can have many listings over time and across MLSs
 * (relists, a Canopy and a Realtracs listing of the same house). The property
 * key ties them together:
 *
 *   1. address: street number + street + unit + 5-digit ZIP + state
 *   2. parcel:  parcel number + county + state, when the address is missing
 *   3. listing: source + MLS number, when neither is usable (address withheld)
 *
 * Keys are hashed so they are fixed length and carry no personal data.
 */
export type PropertyIdentityInput = {
  streetNumber?: string | null;
  streetName?: string | null;
  unitNumber?: string | null;
  postalCode?: string | null;
  stateOrProvince?: string | null;
  countyOrParish?: string | null;
  parcelNumber?: string | null;
  sourceId: number;
  listingNumber: string;
};

export type PropertyIdentity = { key: string; source: "address" | "parcel" | "listing" };

function hash(value: string) {
  return createHash("sha1").update(value).digest("hex");
}

export function normalizeParcel(value: string | null | undefined) {
  return (value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function zip5(value: string | null | undefined) {
  const match = String(value ?? "").match(/\d{5}/);
  return match ? match[0] : "";
}

export function propertyIdentity(input: PropertyIdentityInput): PropertyIdentity {
  const street = normalizeAddressString(`${input.streetNumber ?? ""} ${input.streetName ?? ""}`.trim());
  const unit = normalizeAddressString(input.unitNumber ?? "").replace(/^unit\s+/, "");
  const zip = zip5(input.postalCode);
  const state = (input.stateOrProvince ?? "").trim().toUpperCase();
  if (input.streetNumber && input.streetName && zip) {
    return { key: `a:${hash([street, unit, zip, state].join("|"))}`, source: "address" };
  }
  const parcel = normalizeParcel(input.parcelNumber);
  if (parcel.length >= 4 && state) {
    const county = (input.countyOrParish ?? "").trim().toUpperCase();
    return { key: `p:${hash([parcel, county, state].join("|"))}`, source: "parcel" };
  }
  return { key: `l:${hash(`${input.sourceId}|${input.listingNumber}`)}`, source: "listing" };
}
