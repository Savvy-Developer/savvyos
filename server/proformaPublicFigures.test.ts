import { describe, expect, it } from "vitest";

import {
  publicComps,
  publicRevenueRange,
  scenarioGrossRevenue,
} from "./proformaPublicFigures";

/**
 * These figures go on a public investment listing, so the tests care less about
 * arithmetic than about what reaches a reader who is deciding where to put
 * money. The arithmetic is checked once; the rest of the file is about what
 * must never be published.
 */

const scenario = (over: Record<string, unknown> = {}) => ({
  adr: "350",
  occupancy: "65",
  availableNights: "365",
  cleaningFeeRevenue: "0",
  ancillaryRevenue: "0",
  ...over,
});

describe("scenarioGrossRevenue", () => {
  it("matches the pro-forma's own arithmetic", () => {
    // 365 nights at 65% is 237 sold nights, at $350 each.
    expect(scenarioGrossRevenue(scenario(), "3.5")).toBe(350 * 237);
  });

  it("adds the cleaning fee once per booking, not per night", () => {
    const soldNights = 237;
    const bookings = soldNights / 3.5;
    expect(scenarioGrossRevenue(scenario({ cleaningFeeRevenue: "150" }), "3.5")).toBe(
      Math.round(350 * soldNights + 150 * bookings)
    );
  });

  it("reads figures the way the form writes them", () => {
    expect(scenarioGrossRevenue(scenario({ adr: "$1,000", occupancy: "50" }), "3.5")).toBe(
      1000 * Math.round(365 * 0.5)
    );
  });

  it("returns nothing for a scenario with no rate", () => {
    // A blank scenario multiplies out to zero, and "projected revenue: $0" on a
    // listing is a claim, not an absence. Nothing must reach the page instead.
    expect(scenarioGrossRevenue(scenario({ adr: "" }), "3.5")).toBeNull();
  });

  it("returns nothing for a scenario with no occupancy", () => {
    expect(scenarioGrossRevenue(scenario({ occupancy: "" }), "3.5")).toBeNull();
  });

  it("treats a typed zero occupancy as unfilled rather than as a claim", () => {
    expect(scenarioGrossRevenue(scenario({ occupancy: "0" }), "3.5")).toBeNull();
  });

  it("falls back to a full year and a normal stay when those are blank", () => {
    expect(scenarioGrossRevenue(scenario({ availableNights: "" }), "")).toBe(350 * 237);
  });
});

describe("publicRevenueRange", () => {
  const threeScenarios = {
    avgLengthOfStay: "3.5",
    scenario1ADR: "300",
    scenario1Occupancy: "60",
    scenario2ADR: "350",
    scenario2Occupancy: "65",
    scenario3ADR: "400",
    scenario3Occupancy: "70",
  };

  it("spans the weakest and strongest scenarios", () => {
    const range = publicRevenueRange(threeScenarios);
    expect(range).toEqual({
      low: 300 * Math.round(365 * 0.6),
      high: 400 * Math.round(365 * 0.7),
      single: false,
    });
  });

  it("takes the real minimum and maximum rather than trusting the order", () => {
    // Nothing in the form stops an author entering a strong case that is lower
    // than the conservative one. The range must still read low to high.
    const range = publicRevenueRange({
      ...threeScenarios,
      scenario1ADR: "500",
      scenario3ADR: "200",
    });
    expect(range!.low).toBeLessThan(range!.high);
  });

  it("ignores scenarios that were never filled in", () => {
    const range = publicRevenueRange({
      avgLengthOfStay: "3.5",
      scenario2ADR: "350",
      scenario2Occupancy: "65",
    });
    expect(range).toEqual({ low: 350 * 237, high: 350 * 237, single: true });
  });

  it("returns nothing when no scenario has been filled in", () => {
    expect(publicRevenueRange({})).toBeNull();
    expect(publicRevenueRange(null)).toBeNull();
  });
});

describe("publicComps", () => {
  it("keeps a comp that carries a revenue figure", () => {
    const [comp] = publicComps({
      comps: [{ name: "Lakefront cabin", adr: "400", occupancy: "70", beds: "4", city: "Asheville" }],
    });
    expect(comp).toMatchObject({
      name: "Lakefront cabin",
      annualRevenue: Math.round(400 * 0.7 * 365),
      adr: 400,
      occupancy: 0.7,
      beds: 4,
      city: "Asheville",
    });
  });

  it("prefers the derived figure, matching what the author saw in the form", () => {
    const [comp] = publicComps({
      comps: [{ name: "Cabin", adr: "400", occupancy: "70", annualRevenue: "1" }],
    });
    expect(comp.annualRevenue).toBe(Math.round(400 * 0.7 * 365));
  });

  it("falls back to the typed figure when there is no rate to derive from", () => {
    const [comp] = publicComps({ comps: [{ name: "Cabin", annualRevenue: "$90,000" }] });
    expect(comp.annualRevenue).toBe(90000);
  });

  it("drops a comp with no revenue, because it substantiates nothing", () => {
    expect(publicComps({ comps: [{ name: "Nice place" }] })).toEqual([]);
  });

  it("drops a comp with no name", () => {
    expect(publicComps({ comps: [{ name: "  ", adr: "400", occupancy: "70" }] })).toEqual([]);
  });

  it("strips a javascript link rather than rendering it", () => {
    // These become an href and an img src on a public page.
    const [comp] = publicComps({
      comps: [
        {
          name: "Cabin",
          adr: "400",
          occupancy: "70",
          link: "javascript:alert(1)",
          photoUrl: "javascript:alert(1)",
        },
      ],
    });
    expect(comp.link).toBeNull();
    expect(comp.photoUrl).toBeNull();
  });

  it("keeps ordinary listing links", () => {
    const [comp] = publicComps({
      comps: [{ name: "Cabin", adr: "400", occupancy: "70", link: "https://www.airbnb.com/rooms/1" }],
    });
    expect(comp.link).toBe("https://www.airbnb.com/rooms/1");
  });

  it("shows the strongest evidence first", () => {
    const comps = publicComps({
      comps: [
        { name: "Low", annualRevenue: "50000" },
        { name: "High", annualRevenue: "150000" },
        { name: "Mid", annualRevenue: "90000" },
      ],
    });
    expect(comps.map(comp => comp.name)).toEqual(["High", "Mid", "Low"]);
  });

  it("caps the list at the eight the pro-forma itself allows", () => {
    const many = Array.from({ length: 20 }, (_, index) => ({
      name: `Comp ${index}`,
      annualRevenue: String(1000 + index),
    }));
    expect(publicComps({ comps: many })).toHaveLength(8);
  });

  it("survives form data with no comps at all", () => {
    expect(publicComps({})).toEqual([]);
    expect(publicComps({ comps: null })).toEqual([]);
    expect(publicComps(null)).toEqual([]);
  });
});
