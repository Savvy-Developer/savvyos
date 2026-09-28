import { describe, expect, it } from "vitest";

import { listingExpiryDays, planListingExpiry, type ExpiryListing, type ListingClock } from "./websiteListingExpiry";

const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-12-15T12:00:00Z");
const ago = (days: number) => new Date(now.getTime() - days * DAY);
const listing = (over: Partial<ExpiryListing> = {}): ExpiryListing => ({
  id: 1,
  propertyId: 100,
  publishedAt: ago(30),
  createdAt: ago(31),
  ...over,
});
const clock = (over: Partial<ListingClock> = {}): ListingClock => ({
  websitePropertyId: 1,
  liveSince: ago(30),
  wasLive: true,
  ...over,
});

describe("90-day website listing expiry", () => {
  it("takes down a listing live for 90 days or more", () => {
    const plan = planListingExpiry({ live: [listing()], clocks: [clock({ liveSince: ago(90) })], now, days: 90 });
    expect(plan.expire).toEqual([{ websitePropertyId: 1, propertyId: 100, liveSince: ago(90) }]);
  });

  it("leaves a listing live for less than 90 days", () => {
    const plan = planListingExpiry({ live: [listing()], clocks: [clock({ liveSince: ago(89) })], now, days: 90 });
    expect(plan.expire).toEqual([]);
  });

  it("gives a republished listing a fresh clock instead of taking it down", () => {
    const plan = planListingExpiry({
      live: [listing()],
      clocks: [clock({ liveSince: ago(200), wasLive: false })],
      now,
      days: 90,
    });
    expect(plan.restart).toEqual([1]);
    expect(plan.expire).toEqual([]);
  });

  it("stops the clock of a listing that is no longer live", () => {
    const plan = planListingExpiry({ live: [], clocks: [clock()], now, days: 90 });
    expect(plan.stop).toEqual([1]);
  });

  it("starts a new listing from its publish date", () => {
    const plan = planListingExpiry({ live: [listing({ publishedAt: ago(20) })], clocks: [], now, days: 90 });
    expect(plan.start).toEqual([{ websitePropertyId: 1, liveSince: ago(20) }]);
  });

  it("never gives an old listing less than a week's notice when first seen", () => {
    const plan = planListingExpiry({ live: [listing({ publishedAt: ago(400) })], clocks: [], now, days: 90 });
    expect(plan.start).toEqual([{ websitePropertyId: 1, liveSince: ago(83) }]);
    expect(plan.expire).toEqual([]);
  });

  it("reads the days from the environment, with sane limits", () => {
    expect(listingExpiryDays({})).toBe(90);
    expect(listingExpiryDays({ WEBSITE_LISTING_EXPIRY_DAYS: "120" })).toBe(120);
    expect(listingExpiryDays({ WEBSITE_LISTING_EXPIRY_DAYS: "off" })).toBeNull();
    expect(listingExpiryDays({ WEBSITE_LISTING_EXPIRY_DAYS: "3" })).toBe(90);
    expect(listingExpiryDays({ WEBSITE_LISTING_EXPIRY_DAYS: "abc" })).toBe(90);
  });
});
