import { describe, expect, it } from "vitest";
import {
  buildNormalizedKey,
  buildUnitAwareStreetAddress,
  extractAddressUnit,
  findLooseDuplicate,
  looseAddressKey,
  looseAddressMatch,
  looseStreetKey,
  possibleDuplicateMessage,
  prepareTypedPropertyAddress,
} from "./addressNormalization";

describe("unit-aware address normalization", () => {
  it("treats equivalent apartment designators as the same property", () => {
    expect(buildNormalizedKey("2350 W County Highway 30A Apt. 2", "Santa Rosa Beach", "FL", "32459"))
      .toBe(buildNormalizedKey("2350 West County Highway 30A #2", "Santa Rosa Beach", "FL", "32459"));
  });

  it("distinguishes different units at the same street address", () => {
    const unitTwo = buildNormalizedKey("2350 W County Highway 30A Unit 2", "Santa Rosa Beach", "FL", "32459");
    const unitThree = buildNormalizedKey("2350 W County Highway 30A Unit 3", "Santa Rosa Beach", "FL", "32459");
    const buildingOnly = buildNormalizedKey("2350 W County Highway 30A", "Santa Rosa Beach", "FL", "32459");

    expect(unitTwo).not.toBe(unitThree);
    expect(unitTwo).not.toBe(buildingOnly);

    const unitOneDashOneOhThree = buildNormalizedKey("70 Marthas Lane Unit 1-103", "Santa Rosa Beach", "FL", "32459");
    const unitElevenOhThree = buildNormalizedKey("70 Marthas Lane Unit 1103", "Santa Rosa Beach", "FL", "32459");
    expect(unitOneDashOneOhThree).not.toBe(unitElevenOhThree);
  });

  it("extracts valid unit designators without misreading street names", () => {
    expect(extractAddressUnit("34 Chivas Ln Unit 102C")).toBe("102C");
    expect(extractAddressUnit("2303 Surfrider Circle #C")).toBe("C");
    expect(extractAddressUnit("3173 Stepping Stone Drive")).toBeNull();
    expect(extractAddressUnit("8355 East Stella Lane")).toBeNull();
  });

  it("retains an entered unit when Google returns only the building", () => {
    expect(buildUnitAwareStreetAddress(
      "2350 West County Highway 30A",
      "2350 W County Highway 30A Apt 2",
      null,
    )).toBe("2350 West County Highway 30A Unit 2");
  });

  it("uses a Google subpremise when the entered value has no unit", () => {
    expect(buildUnitAwareStreetAddress(
      "34 Chivas Lane",
      "34 Chivas Lane",
      "102C",
    )).toBe("34 Chivas Lane Unit 102C");
  });

  it("does not replace a manual address with a Google search result", () => {
    const prepared = prepareTypedPropertyAddress({
      address: "  2805 W U.S. 290  ",
      city: "dripping springs",
      state: "tx",
      zip: "78620",
    });

    expect(prepared).toMatchObject({
      address: "2805 W U.S. 290",
      city: "Dripping Springs",
      state: "TX",
      zip: "78620",
    });
    expect(prepared.normalizedAddress).toBe(buildNormalizedKey("2805 W U.S. 290", "Dripping Springs", "TX", "78620"));
    expect(prepared.normalizedAddress).not.toBe(buildNormalizedKey("1301 U.S. 290", "Dripping Springs", "TX", "78620"));
  });
});

describe("loose address matching (possible duplicates)", () => {
  const glendale = { city: "Glendale", state: "UT", zip: "84729" };

  it("matches a street written with and without its suffix", () => {
    expect(looseAddressMatch({ address: "360 E Overlook", ...glendale }, { address: "360 E Overlook Ln", ...glendale })).toBe(true);
    expect(looseAddressKey("360 E Overlook", "Glendale", "UT", "84729")).toBe(looseAddressKey("360 East Overlook Lane", "glendale", "ut", "84729"));
  });

  it("does not match a different house number on the same street", () => {
    expect(looseAddressMatch({ address: "360 E Overlook", ...glendale }, { address: "362 E Overlook", ...glendale })).toBe(false);
  });

  it("keeps different condo units in one building apart", () => {
    const orangeBeach = { city: "Orange Beach", state: "AL", zip: "36561" };
    expect(looseAddressMatch(
      { address: "24230 Perdido Beach Blvd Apt 3125", ...orangeBeach },
      { address: "24230 Perdido Beach Blvd Apt 3104", ...orangeBeach },
    )).toBe(false);
    expect(looseAddressMatch(
      { address: "24230 Perdido Beach Blvd Apt 3125", ...orangeBeach },
      { address: "24230 Perdido Beach Blvd #3125", ...orangeBeach },
    )).toBe(true);
  });

  it("does not match a unit against the same address with no unit", () => {
    const orangeBeach = { city: "Orange Beach", state: "AL", zip: "36561" };
    expect(looseAddressMatch(
      { address: "24230 Perdido Beach Blvd Apt 3125", ...orangeBeach },
      { address: "24230 Perdido Beach Blvd", ...orangeBeach },
    )).toBe(false);
  });

  it("ignores direction words anywhere and suffixes in either form", () => {
    const place = { city: "Sandy", state: "UT", zip: "84092" };
    expect(looseAddressMatch({ address: "36 Cloverdale CT", ...place }, { address: "36 Cloverdale Court N", ...place })).toBe(true);
    expect(looseAddressMatch({ address: "185 Blossom Ridge", ...place }, { address: "185 Blossom Rdg", ...place })).toBe(true);
    expect(looseAddressMatch({ address: "9614 Springmont", ...place }, { address: "9614 Springmont Dr", ...place })).toBe(true);
    expect(looseAddressMatch({ address: "1010 W Eagle Mountain", ...place }, { address: "1010 W Eagle Mountain Trl", ...place })).toBe(true);
    expect(looseAddressMatch({ address: "10703 S Dimple Dell Dr", ...place }, { address: "10703 S Dimple Dell Dr E", ...place })).toBe(true);
  });

  it("keeps directions on grid streets, where they tell two homes apart", () => {
    const place = { city: "Provo", state: "UT", zip: "84601" };
    expect(looseAddressMatch({ address: "100 W 300 N", ...place }, { address: "100 E 300 N", ...place })).toBe(false);
    expect(looseAddressMatch({ address: "100 W 300 N", ...place }, { address: "100 West 300 North", ...place })).toBe(true);
    expect(looseStreetKey("100 North St")).not.toBe(looseStreetKey("100 South St"));
  });

  it("never strips the whole street name", () => {
    expect(looseStreetKey("12 Park Ave")).toBe("12 park");
    expect(looseStreetKey("12 Ridge")).toBe("12 ridge");
  });

  it("does not match across ZIP codes", () => {
    expect(looseAddressMatch({ address: "360 E Overlook", ...glendale }, { address: "360 E Overlook Ln", ...glendale, zip: "84759" })).toBe(false);
  });

  it("falls back to city and state when either side has no ZIP", () => {
    expect(looseAddressMatch({ address: "360 E Overlook", ...glendale }, { address: "360 E Overlook Ln", city: "glendale", state: "ut", zip: null })).toBe(true);
    expect(looseAddressMatch({ address: "360 E Overlook", ...glendale }, { address: "360 E Overlook Ln", city: "Kanab", state: "UT", zip: "" })).toBe(false);
    expect(looseAddressMatch({ address: "360 E Overlook", city: null, state: null, zip: "84729" }, { address: "360 E Overlook Ln", city: null, state: null, zip: null })).toBe(false);
  });

  it("needs a house number", () => {
    expect(looseAddressMatch({ address: "E Overlook", ...glendale }, { address: "E Overlook Ln", ...glendale })).toBe(false);
  });

  it("finds the existing property and says which one", () => {
    const existing = { id: 861, address: "360 E Overlook", city: "Glendale", state: "UT", zip: "84729" };
    const other = { id: 5, address: "362 E Overlook", city: "Glendale", state: "UT", zip: "84729" };
    const hit = findLooseDuplicate({ address: "360 E Overlook Ln", ...glendale }, [other, existing]);
    expect(hit?.id).toBe(861);
    expect(possibleDuplicateMessage(hit!)).toBe("Possible duplicate of #861 (360 E Overlook, Glendale, UT 84729)");
  });
});
