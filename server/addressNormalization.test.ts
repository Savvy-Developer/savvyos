import { describe, expect, it } from "vitest";
import {
  buildNormalizedKey,
  buildUnitAwareStreetAddress,
  extractAddressUnit,
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
});
