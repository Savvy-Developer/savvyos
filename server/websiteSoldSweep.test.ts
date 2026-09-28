import { describe, expect, it } from "vitest";

import { pickSoldListings, soldSweepEnabled, type LiveListing, type Sale } from "./websiteSoldSweep";

const d = (iso: string) => new Date(iso);
const baselineAt = d("2026-09-28T12:00:00Z");
const listing = (over: Partial<LiveListing> = {}): LiveListing => ({
  id: 10,
  propertyId: 100,
  slug: "123-main",
  publishedAt: d("2026-09-01T00:00:00Z"),
  createdAt: d("2026-08-30T00:00:00Z"),
  ...over,
});
const sale = (over: Partial<Sale> = {}): Sale => ({
  key: "tx:1",
  propertyId: 100,
  closedOn: d("2026-10-02T00:00:00Z"),
  changedAt: d("2026-10-02T15:00:00Z"),
  ...over,
});

describe("sold sweep rules", () => {
  it("takes down a live listing whose property closed after it went live", () => {
    const picks = pickSoldListings({ live: [listing()], sales: [sale()], swept: new Set(), baselineAt });
    expect(picks).toEqual([{ websitePropertyId: 10, propertyId: 100, slug: "123-main", saleKeys: ["tx:1"] }]);
  });

  it("counts a closed listing record too", () => {
    const picks = pickSoldListings({
      live: [listing()],
      sales: [sale({ key: "listing:7", closedOn: null })],
      swept: new Set(),
      baselineAt,
    });
    expect(picks[0].saleKeys).toEqual(["listing:7"]);
  });

  it("never takes a relisted property down again for a sale already handled", () => {
    const picks = pickSoldListings({ live: [listing()], sales: [sale()], swept: new Set(["tx:1"]), baselineAt });
    expect(picks).toEqual([]);
  });

  it("ignores deals last changed before the sweep started (the baseline)", () => {
    const picks = pickSoldListings({
      live: [listing()],
      sales: [sale({ changedAt: d("2026-09-20T00:00:00Z") })],
      swept: new Set(),
      baselineAt,
    });
    expect(picks).toEqual([]);
  });

  it("ignores a closing date from before the listing went live (an old sale)", () => {
    const picks = pickSoldListings({
      live: [listing()],
      sales: [sale({ closedOn: d("2025-05-01T00:00:00Z") })],
      swept: new Set(),
      baselineAt,
    });
    expect(picks).toEqual([]);
  });

  it("leaves other properties alone", () => {
    const picks = pickSoldListings({ live: [listing()], sales: [sale({ propertyId: 999 })], swept: new Set(), baselineAt });
    expect(picks).toEqual([]);
  });

  it("can be switched off", () => {
    expect(soldSweepEnabled({})).toBe(true);
    expect(soldSweepEnabled({ WEBSITE_SOLD_SWEEP: "off" })).toBe(false);
  });
});
