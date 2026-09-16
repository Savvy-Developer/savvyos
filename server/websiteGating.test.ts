import { describe, expect, it } from "vitest";

import {
  GATED_PROPERTY_FIELDS,
  gateEvidence,
  gateProperties,
  gateProperty,
} from "./websiteGating";

const listing = {
  slug: "123-main-st",
  address: "123 Main St",
  city: "Gatlinburg",
  state: "TN",
  listPrice: "725000",
  beds: "4",
  baths: "3",
  sqft: 2400,
  headline: "Creekside cabin",
  summary: "Walkable to the parkway.",
  heroImageUrl: "https://example.com/hero.jpg",
  assignedAgentName: "Casey Rivers",
  projectedRevenue: "98000",
  cashOnCash: "0.114",
  capRate: "0.072",
  occupancyRate: "0.68",
  averageDailyRate: "412",
};

describe("gateProperty", () => {
  it("returns the row untouched for a signed-in visitor", () => {
    const result = gateProperty(listing, true);
    expect(result.projectedRevenue).toBe("98000");
    expect(result.occupancyRate).toBe("0.68");
    expect(result.gated).toBe(false);
  });

  it("nulls every gated figure for an anonymous visitor", () => {
    const result = gateProperty(listing, false);
    for (const field of GATED_PROPERTY_FIELDS) {
      expect(result[field]).toBeNull();
    }
    expect(result.gated).toBe(true);
  });

  it("keeps everything a visitor needs in order to decide to sign up", () => {
    const result = gateProperty(listing, false);
    expect(result.address).toBe("123 Main St");
    expect(result.listPrice).toBe("725000");
    expect(result.beds).toBe("4");
    expect(result.sqft).toBe(2400);
    expect(result.headline).toBe("Creekside cabin");
    expect(result.summary).toBe("Walkable to the parkway.");
    expect(result.heroImageUrl).toBe("https://example.com/hero.jpg");
    expect(result.assignedAgentName).toBe("Casey Rivers");
  });

  it("does not claim to have withheld anything when the figures are empty", () => {
    const bare = {
      ...listing,
      projectedRevenue: null,
      cashOnCash: null,
      capRate: null,
      occupancyRate: null,
      averageDailyRate: "",
    };
    // Nothing was behind the login here, so the page must not invite anyone to
    // sign up in order to see it.
    expect(gateProperty(bare, false).gated).toBe(false);
  });

  it("flags the listing when only one figure is present", () => {
    const partial = {
      ...listing,
      cashOnCash: null,
      capRate: null,
      occupancyRate: null,
      averageDailyRate: null,
    };
    expect(gateProperty(partial, false).gated).toBe(true);
  });

  it("does not mutate the row it was given", () => {
    const row = { ...listing };
    gateProperty(row, false);
    expect(row.projectedRevenue).toBe("98000");
  });

  it("gates a whole list", () => {
    const rows = gateProperties([listing, listing], false);
    expect(rows).toHaveLength(2);
    expect(rows.every(row => row.projectedRevenue === null)).toBe(true);
    expect(rows.every(row => row.gated)).toBe(true);
  });
});

describe("gateProperty and the agent's note", () => {
  const withBlurb = { ...listing, agentBlurb: "The creek frontage is the whole deal here." };

  it("hands the note to a signed-in visitor", () => {
    const result = gateProperty(withBlurb, true);
    expect(result.agentBlurb).toBe("The creek frontage is the whole deal here.");
    expect(result.blurbGated).toBe(false);
  });

  it("withholds the note from an anonymous visitor", () => {
    const result = gateProperty(withBlurb, false);
    expect(result.agentBlurb).toBeNull();
    expect(result.blurbGated).toBe(true);
  });

  /**
   * The figures and the note are two separate places on the page. A listing
   * with a note and no figures must not put a "sign in to see the numbers"
   * panel over numbers that do not exist, and the reverse.
   */
  it("counts the note separately from the figures", () => {
    const noFigures = {
      ...withBlurb,
      projectedRevenue: null,
      cashOnCash: null,
      capRate: null,
      occupancyRate: null,
      averageDailyRate: null,
    };
    const result = gateProperty(noFigures, false);
    expect(result.gated).toBe(false);
    expect(result.blurbGated).toBe(true);

    const noBlurb = gateProperty({ ...listing, agentBlurb: null }, false);
    expect(noBlurb.gated).toBe(true);
    expect(noBlurb.blurbGated).toBe(false);
  });

  it("says nothing was withheld when the listing has neither", () => {
    const bare = gateProperty(
      {
        ...listing,
        agentBlurb: null,
        projectedRevenue: null,
        cashOnCash: null,
        capRate: null,
        occupancyRate: null,
        averageDailyRate: null,
      },
      false
    );
    expect(bare.gated).toBe(false);
    expect(bare.blurbGated).toBe(false);
  });
});

describe("gateEvidence", () => {
  const evidence = {
    revenue: { low: 84000, high: 112000, single: false },
    comps: [{ name: "Creek House", annualRevenue: 96000 }],
  };

  it("passes the evidence through for a signed-in visitor", () => {
    const result = gateEvidence(evidence, true);
    expect(result.revenue).toEqual(evidence.revenue);
    expect(result.comps).toHaveLength(1);
    expect(result.gated).toBe(false);
  });

  it("withholds the range and the comps from an anonymous visitor", () => {
    const result = gateEvidence(evidence, false);
    expect(result.revenue).toBeNull();
    expect(result.comps).toEqual([]);
    expect(result.gated).toBe(true);
  });

  it("stays quiet when there was no analysis attached", () => {
    const result = gateEvidence({ revenue: null, comps: [] }, false);
    expect(result.gated).toBe(false);
  });

  it("flags comps even when there is no revenue range", () => {
    const result = gateEvidence(
      { revenue: null, comps: evidence.comps },
      false
    );
    expect(result.gated).toBe(true);
  });
});
