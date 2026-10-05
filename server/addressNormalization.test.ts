import { describe, expect, it } from "vitest";
import {
  buildNormalizedKey,
  buildUnitAwareStreetAddress,
  extractAddressUnit,
  findLooseDuplicate,
  looseAddressMatch,
  looseCandidateKey,
  parseLooseAddress,
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
  const zip = (code: string) => ({ city: null, state: null, zip: code });

  it("parses an address into the parts it compares", () => {
    expect(parseLooseAddress("36 Cloverdale Court N Apt 2", "84092-1234")).toEqual({
      houseNumber: "36",
      preDirection: null,
      streetName: ["cloverdale"],
      suffix: "court",
      postDirection: "north",
      unit: "2",
      zip: "84092",
    });
    expect(parseLooseAddress("100 W 300 N", "84601")).toMatchObject({ preDirection: "west", streetName: ["300"], suffix: null, postDirection: "north" });
    // The last word of the name is never taken as a suffix or direction.
    expect(parseLooseAddress("100 North St", "84601")).toMatchObject({ preDirection: null, streetName: ["north"], suffix: "street" });
    expect(parseLooseAddress("12 Ridge", "84601")).toMatchObject({ streetName: ["ridge"], suffix: null });
    // At most one suffix is taken off.
    expect(parseLooseAddress("5 Spring Lake Dr", "84601")).toMatchObject({ streetName: ["spring", "lake"], suffix: "drive" });
    expect(parseLooseAddress("Overlook Ln", "84729")).toBeNull();
  });

  it("matches a street written with and without its suffix", () => {
    expect(looseAddressMatch({ address: "360 E Overlook", ...glendale }, { address: "360 E Overlook Ln", ...glendale })).toBe(true);
    expect(looseAddressMatch({ address: "360 E Overlook", ...glendale }, { address: "360 East Overlook Lane", ...glendale })).toBe(true);
  });

  it("does not match different suffixes on the same name", () => {
    expect(looseAddressMatch({ address: "500 Main St", ...zip("84092") }, { address: "500 Main Ave", ...zip("84092") })).toBe(false);
    expect(looseAddressMatch({ address: "500 Main Street", ...zip("84092") }, { address: "500 Main St", ...zip("84092") })).toBe(true);
  });

  it("drops only one suffix, so a longer street name is a different street", () => {
    expect(looseAddressMatch({ address: "5 Spring Lake Dr", ...zip("84092") }, { address: "5 Spring Dr", ...zip("84092") })).toBe(false);
    // "Spring Lake" with no suffix is the same street as "Spring Lake Dr".
    expect(looseAddressMatch({ address: "5 Spring Lake", ...zip("84092") }, { address: "5 Spring Lake Dr", ...zip("84092") })).toBe(true);
    // A name word that is also a suffix ("Canyon") can be read as the name.
    expect(looseAddressMatch({ address: "500 W Canyon", ...zip("84092") }, { address: "500 W Canyon Rd", ...zip("84092") })).toBe(true);
    expect(looseAddressMatch({ address: "500 W Canyon", ...zip("84092") }, { address: "500 W Canyon Rd N", ...zip("84092") })).toBe(true);
  });

  it("does not match opposite directions", () => {
    expect(looseAddressMatch({ address: "100 N Main", ...zip("84092") }, { address: "100 S Main", ...zip("84092") })).toBe(false);
    expect(looseAddressMatch({ address: "100 Main E", ...zip("84092") }, { address: "100 Main West", ...zip("84092") })).toBe(false);
    expect(looseAddressMatch({ address: "100 N Main", ...zip("84092") }, { address: "100 Main S", ...zip("84092") })).toBe(false);
    expect(looseAddressMatch({ address: "100 N Main", ...zip("84092") }, { address: "100 North Main", ...zip("84092") })).toBe(true);
    expect(looseAddressMatch({ address: "100 N Main", ...zip("84092") }, { address: "100 Main", ...zip("84092") })).toBe(true);
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

  it("matches a direction or suffix that one side left off, in either form", () => {
    const place = { city: "Sandy", state: "UT", zip: "84092" };
    // "Court N" has a direction after the name and "CT" has none.
    expect(looseAddressMatch({ address: "36 Cloverdale CT", ...place }, { address: "36 Cloverdale Court N", ...place })).toBe(true);
    expect(looseAddressMatch({ address: "185 Blossom Ridge", ...place }, { address: "185 Blossom Rdg", ...place })).toBe(true);
    expect(looseAddressMatch({ address: "9614 Springmont", ...place }, { address: "9614 Springmont Dr", ...place })).toBe(true);
    // One suffix (Trl) against none: "Mountain" is part of the name.
    expect(looseAddressMatch({ address: "1010 W Eagle Mountain", ...place }, { address: "1010 W Eagle Mountain Trl", ...place })).toBe(true);
    expect(looseAddressMatch({ address: "10703 S Dimple Dell Dr", ...place }, { address: "10703 S Dimple Dell Dr E", ...place })).toBe(true);
  });

  it("keeps directions on grid streets apart", () => {
    const place = { city: "Provo", state: "UT", zip: "84601" };
    expect(looseAddressMatch({ address: "100 W 300 N", ...place }, { address: "100 E 300 N", ...place })).toBe(false);
    expect(looseAddressMatch({ address: "100 W 300 N", ...place }, { address: "100 West 300 North", ...place })).toBe(true);
    expect(looseAddressMatch({ address: "100 North St", ...place }, { address: "100 South St", ...place })).toBe(false);
  });

  it("does not match across ZIP codes", () => {
    expect(looseAddressMatch({ address: "360 E Overlook", ...glendale }, { address: "360 E Overlook Ln", ...glendale, zip: "84759" })).toBe(false);
  });

  it("needs a 5-digit ZIP on both sides, with no city and state fallback", () => {
    expect(looseAddressMatch({ address: "360 E Overlook", ...glendale }, { address: "360 E Overlook Ln", city: "Glendale", state: "UT", zip: null })).toBe(false);
    expect(looseAddressMatch({ address: "360 E Overlook", ...glendale, zip: "" }, { address: "360 E Overlook Ln", ...glendale, zip: "" })).toBe(false);
    expect(looseAddressMatch({ address: "360 E Overlook", ...glendale, zip: "847" }, { address: "360 E Overlook Ln", ...glendale })).toBe(false);
    expect(looseAddressMatch({ address: "360 E Overlook", ...glendale }, { address: "360 E Overlook Ln", ...glendale, zip: "84729-0001" })).toBe(true);
  });

  it("needs a house number", () => {
    expect(looseAddressMatch({ address: "E Overlook", ...glendale }, { address: "E Overlook Ln", ...glendale })).toBe(false);
  });

  it("narrows candidates by house number and ZIP", () => {
    expect(looseCandidateKey("360 E Overlook Ln", "84729")).toBe("360 84729");
    expect(looseCandidateKey("360 E Overlook Ln", null)).toBe("");
    expect(looseCandidateKey("E Overlook Ln", "84729")).toBe("");
  });

  it("finds the existing property, comparing one by one, and says which one", () => {
    const existing = { id: 861, address: "360 E Overlook", city: "Glendale", state: "UT", zip: "84729" };
    const other = { id: 5, address: "362 E Overlook", city: "Glendale", state: "UT", zip: "84729" };
    const westSide = { id: 6, address: "360 W Overlook", city: "Glendale", state: "UT", zip: "84729" };
    const hit = findLooseDuplicate({ address: "360 E Overlook Ln", ...glendale }, [other, westSide, existing]);
    expect(hit?.id).toBe(861);
    expect(possibleDuplicateMessage(hit!)).toBe("Possible duplicate of #861 (360 E Overlook, Glendale, UT 84729)");
    expect(findLooseDuplicate({ address: "360 E Overlook Ln", ...glendale, zip: null }, [existing])).toBeUndefined();
  });
});
