import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// No database or network here: getDb and createProperty are stubbed, and the
// old site's API is a fake fetch.
const { mockCreateProperty, mockGetDb } = vi.hoisted(() => ({
  mockCreateProperty: vi.fn(),
  mockGetDb: vi.fn(),
}));

vi.mock("./db", () => ({ createProperty: mockCreateProperty, getDb: mockGetDb }));

import { properties, users, websiteAgentProfiles, websiteProperties } from "../drizzle/schema";
import { importOldSiteListings } from "./oldSiteListingImport";
import type { OldListing } from "./oldSiteListingImportLogic";

const listing = (id: string, address: string): OldListing => ({
  id,
  slug: address.toLowerCase().replace(/\s+/g, "-"),
  address,
  city: "Glendale",
  state: "UT",
  zipCode: "84729",
  price: 450000,
  bedrooms: 3,
  bathrooms: 2,
  photos: [{ externalUrl: "https://example.com/a.jpg", isPrimary: true }],
});

// Property 861 is the house the 2 Oct import made a second record for.
const EXISTING = [{ id: 861, address: "360 E Overlook", city: "Glendale", state: "UT", zip: "84729" }];

function fakeDb() {
  const rowsFor = new Map<unknown, unknown[]>([
    [properties, EXISTING],
    [websiteProperties, []],
    [websiteAgentProfiles, []],
    [users, []],
  ]);
  const inserted: unknown[] = [];
  return {
    inserted,
    select: () => ({ from: async (table: unknown) => rowsFor.get(table) ?? [] }),
    insert: () => ({
      values: async (row: unknown) => {
        inserted.push(row);
      },
    }),
  };
}

function fakeOldSite(listings: OldListing[]) {
  return vi.fn(async (url: string) => {
    const body = String(url).includes("/count") ? { total: listings.length } : { data: listings };
    return { ok: true, status: 200, json: async () => body } as Response;
  });
}

describe("old-site import possible duplicates", () => {
  let db: ReturnType<typeof fakeDb>;

  beforeEach(() => {
    db = fakeDb();
    mockGetDb.mockResolvedValue(db);
    mockCreateProperty.mockReset();
    mockCreateProperty.mockResolvedValue(2001);
    vi.stubGlobal("fetch", fakeOldSite([listing("a", "360 E Overlook Ln"), listing("b", "362 E Overlook")]));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports a loose match on the check instead of counting it as new", async () => {
    const report = await importOldSiteListings({ dryRun: true, publishReady: false, userId: 1 });
    expect(report.possibleDuplicates).toEqual([
      {
        slug: "360-e-overlook-ln",
        address: "360 E Overlook Ln",
        existingId: 861,
        message: "Possible duplicate of #861 (360 E Overlook, Glendale, UT 84729)",
      },
    ]);
    // Only the genuinely different house would be added.
    expect(report.toCreate).toBe(1);
    expect(report.toAttach).toBe(0);
    expect(mockCreateProperty).not.toHaveBeenCalled();
  });

  it("skips a loose match on the real import and never creates or merges it", async () => {
    const report = await importOldSiteListings({ dryRun: false, publishReady: false, userId: 1 });
    expect(report.possibleDuplicates.map(item => item.existingId)).toEqual([861]);
    expect(report.created).toBe(1);
    expect(report.attached).toBe(0);
    expect(mockCreateProperty).toHaveBeenCalledTimes(1);
    expect(mockCreateProperty.mock.calls[0][0]).toMatchObject({ address: "362 E Overlook" });
    // The one website listing written is for the new house, not attached to 861.
    expect(db.inserted).toHaveLength(1);
    expect(db.inserted[0]).toMatchObject({ propertyId: 2001, slug: "362-e-overlook" });
  });

  it("still links an exact match to the existing property", async () => {
    vi.stubGlobal("fetch", fakeOldSite([listing("c", "360 East Overlook")]));
    const report = await importOldSiteListings({ dryRun: true, publishReady: false, userId: 1 });
    expect(report.possibleDuplicates).toEqual([]);
    expect(report.toAttach).toBe(1);
  });

  it("flags the second of two old listings that are the same house written differently", async () => {
    vi.stubGlobal("fetch", fakeOldSite([listing("d", "500 W Canyon Rd"), listing("e", "500 W Canyon")]));
    const report = await importOldSiteListings({ dryRun: false, publishReady: false, userId: 1 });
    expect(report.created).toBe(1);
    expect(report.possibleDuplicates).toHaveLength(1);
    expect(report.possibleDuplicates[0]).toMatchObject({ address: "500 W Canyon", existingId: 2001 });
  });
});
