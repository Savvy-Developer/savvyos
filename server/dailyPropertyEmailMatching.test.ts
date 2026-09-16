import { describe, expect, it } from "vitest";

import {
  matchesBedrooms,
  matchesBudget,
  matchesMarket,
  newSince,
  selectListingsFor,
  shouldEmailToday,
  type Listing,
  type Preferences,
} from "./dailyPropertyEmailMatching";

const prefs = (overrides: Partial<Preferences> = {}): Preferences => ({
  notificationsEnabled: true,
  emailFrequency: "daily",
  budgetMin: null,
  budgetMax: null,
  minBedrooms: null,
  marketProfileIds: [],
  ...overrides,
});

const listing = (overrides: Partial<Listing> = {}): Listing => ({
  propertyId: 1,
  slug: "a-listing",
  listPrice: "500000",
  beds: "4",
  zip: "37738",
  publishedAt: new Date("2026-09-15T12:00:00Z"),
  ...overrides,
});

const zips = (): Map<string, number> =>
  new Map([
    ["37738", 10],
    ["28465", 20],
  ]);

describe("shouldEmailToday", () => {
  it("emails a daily subscriber on the daily run", () => {
    expect(shouldEmailToday(prefs(), "daily")).toBe(true);
    expect(shouldEmailToday(prefs(), "weekly")).toBe(false);
  });

  it("emails a weekly subscriber on the weekly run", () => {
    const weekly = prefs({ emailFrequency: "weekly" });
    expect(shouldEmailToday(weekly, "weekly")).toBe(true);
    expect(shouldEmailToday(weekly, "daily")).toBe(false);
  });

  it("never emails someone who turned it off", () => {
    expect(shouldEmailToday(prefs({ notificationsEnabled: false }), "daily")).toBe(
      false
    );
    expect(shouldEmailToday(prefs({ emailFrequency: "never" }), "daily")).toBe(
      false
    );
  });

  /**
   * The default has to be silence. Sending to an account with no preferences
   * row means mailing somebody who never said yes.
   */
  it("stays silent when there are no preferences at all", () => {
    expect(shouldEmailToday(null, "daily")).toBe(false);
  });
});

describe("matchesBudget", () => {
  it("matches everything when no budget is set", () => {
    expect(matchesBudget(listing({ listPrice: null }), prefs())).toBe(true);
  });

  it("respects a minimum and a maximum", () => {
    const p = prefs({ budgetMin: 400000, budgetMax: 600000 });
    expect(matchesBudget(listing({ listPrice: "500000" }), p)).toBe(true);
    expect(matchesBudget(listing({ listPrice: "350000" }), p)).toBe(false);
    expect(matchesBudget(listing({ listPrice: "700000" }), p)).toBe(false);
  });

  it("includes the boundaries", () => {
    const p = prefs({ budgetMin: 400000, budgetMax: 600000 });
    expect(matchesBudget(listing({ listPrice: "400000" }), p)).toBe(true);
    expect(matchesBudget(listing({ listPrice: "600000" }), p)).toBe(true);
  });

  it("works with only one bound set", () => {
    expect(
      matchesBudget(listing({ listPrice: "900000" }), prefs({ budgetMin: 800000 }))
    ).toBe(true);
    expect(
      matchesBudget(listing({ listPrice: "900000" }), prefs({ budgetMax: 800000 }))
    ).toBe(false);
  });

  /**
   * The rule that keeps the email honest. Putting a listing with no price into
   * a "under $600k" email is a claim about a number we do not have.
   */
  it("excludes a listing with no price when a budget is set", () => {
    expect(
      matchesBudget(listing({ listPrice: null }), prefs({ budgetMax: 600000 }))
    ).toBe(false);
    expect(
      matchesBudget(listing({ listPrice: "" }), prefs({ budgetMin: 100000 }))
    ).toBe(false);
  });
});

describe("matchesBedrooms", () => {
  it("matches everything when no minimum is set", () => {
    expect(matchesBedrooms(listing({ beds: null }), prefs())).toBe(true);
  });

  it("treats the minimum as at least", () => {
    const p = prefs({ minBedrooms: 3 });
    expect(matchesBedrooms(listing({ beds: "3" }), p)).toBe(true);
    expect(matchesBedrooms(listing({ beds: "5" }), p)).toBe(true);
    expect(matchesBedrooms(listing({ beds: "2" }), p)).toBe(false);
  });

  it("excludes a listing with no bedroom count when a minimum is set", () => {
    expect(matchesBedrooms(listing({ beds: null }), prefs({ minBedrooms: 3 }))).toBe(
      false
    );
  });

  it("copes with a half bedroom recorded as a decimal", () => {
    expect(
      matchesBedrooms(listing({ beds: "3.5" }), prefs({ minBedrooms: 3 }))
    ).toBe(true);
  });
});

describe("matchesMarket", () => {
  it("matches every market when none is chosen", () => {
    expect(matchesMarket(listing({ zip: null }), prefs(), zips())).toBe(true);
  });

  it("matches a listing whose ZIP belongs to a chosen market", () => {
    expect(
      matchesMarket(listing({ zip: "37738" }), prefs({ marketProfileIds: [10] }), zips())
    ).toBe(true);
  });

  it("rejects a listing in a market that was not chosen", () => {
    expect(
      matchesMarket(listing({ zip: "28465" }), prefs({ marketProfileIds: [10] }), zips())
    ).toBe(false);
  });

  it("rejects a listing whose ZIP belongs to no market", () => {
    expect(
      matchesMarket(listing({ zip: "99999" }), prefs({ marketProfileIds: [10] }), zips())
    ).toBe(false);
  });

  it("rejects a listing with no usable ZIP when markets were chosen", () => {
    expect(
      matchesMarket(listing({ zip: null }), prefs({ marketProfileIds: [10] }), zips())
    ).toBe(false);
    expect(
      matchesMarket(listing({ zip: "abc" }), prefs({ marketProfileIds: [10] }), zips())
    ).toBe(false);
  });

  it("reads a ZIP+4 as its five digit ZIP", () => {
    expect(
      matchesMarket(
        listing({ zip: "37738-1234" }),
        prefs({ marketProfileIds: [10] }),
        zips()
      )
    ).toBe(true);
  });
});

describe("selectListingsFor", () => {
  const candidates = [
    listing({ propertyId: 1, listPrice: "450000", beds: "3", zip: "37738" }),
    listing({ propertyId: 2, listPrice: "900000", beds: "6", zip: "28465" }),
    listing({ propertyId: 3, listPrice: "480000", beds: "2", zip: "37738" }),
  ];

  it("applies every filter together", () => {
    const result = selectListingsFor(
      candidates,
      prefs({ budgetMax: 500000, minBedrooms: 3, marketProfileIds: [10] }),
      zips()
    );
    expect(result.listings.map(l => l.propertyId)).toEqual([1]);
    expect(result.marketFilterUnresolvable).toBe(false);
  });

  it("returns everything when nothing is filtered", () => {
    const result = selectListingsFor(candidates, prefs(), zips());
    expect(result.listings).toHaveLength(3);
  });

  /**
   * The failure this is here to catch. Someone subscribes to a market whose
   * ZIP codes were never filled in, and from then on receives nothing, with no
   * signal anywhere that their preference is impossible to satisfy.
   */
  it("reports a market filter that cannot be resolved at all", () => {
    const result = selectListingsFor(
      candidates,
      prefs({ marketProfileIds: [99] }),
      zips()
    );
    expect(result.listings).toHaveLength(0);
    expect(result.marketFilterUnresolvable).toBe(true);
  });

  it("does not report a filter that is merely unmatched today", () => {
    // Market 20 is real and has ZIPs, it just has nothing new in it that fits
    // the budget. That is a normal quiet day, not a misconfiguration.
    const result = selectListingsFor(
      candidates,
      prefs({ marketProfileIds: [20], budgetMax: 100000 }),
      zips()
    );
    expect(result.listings).toHaveLength(0);
    expect(result.marketFilterUnresolvable).toBe(false);
  });
});

describe("newSince", () => {
  const older = listing({ propertyId: 1, publishedAt: new Date("2026-09-10T00:00:00Z") });
  const newer = listing({ propertyId: 2, publishedAt: new Date("2026-09-14T00:00:00Z") });
  const newest = listing({ propertyId: 3, publishedAt: new Date("2026-09-16T00:00:00Z") });

  it("returns only listings published after the cutoff, newest first", () => {
    const result = newSince([older, newest, newer], new Date("2026-09-12T00:00:00Z"));
    expect(result.map(l => l.propertyId)).toEqual([3, 2]);
  });

  it("caps the very first email rather than sending the whole archive", () => {
    const many = Array.from({ length: 30 }, (_, index) =>
      listing({
        propertyId: index + 1,
        publishedAt: new Date(2026, 8, index + 1),
      })
    );
    const result = newSince(many, null, 5);
    expect(result).toHaveLength(5);
    // Newest first, so the last published are the ones that make the cut.
    expect(result[0].propertyId).toBe(30);
  });

  it("ignores listings that were never published", () => {
    const result = newSince([listing({ publishedAt: null }), newest], null);
    expect(result.map(l => l.propertyId)).toEqual([3]);
  });

  it("excludes a listing published exactly at the cutoff", () => {
    // The cutoff is the moment of the last send, and that listing was already
    // in that email. Sending it twice is the most visible bug this can have.
    const result = newSince([newer], new Date("2026-09-14T00:00:00Z"));
    expect(result).toHaveLength(0);
  });
});
