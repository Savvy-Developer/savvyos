import { describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({ getDb: vi.fn(), logActivity: vi.fn() }));
vi.mock("./permissions", () => ({ canAdminUsePermission: vi.fn() }));

import { reconcileCanonical } from "./website";

/**
 * A SavvyOS property that already carries real deal data, of the kind a
 * transaction would be hanging off.
 */
const populated = {
  address: "3316 Grace Way",
  normalizedAddress: "3316 grace way sevierville tn 37876",
  city: "Sevierville",
  state: "TN",
  zip: "37876",
  beds: "4",
  baths: "3",
  sqft: 2400,
  propertyType: "cabin",
  listPrice: "2050000.00",
};

/** What a regex-scraped Zillow import might arrive with for the same address. */
const zillowScrape = {
  address: "3316 Grace Way",
  normalizedAddress: "3316 grace way sevierville tn 37876",
  city: "Sevierville",
  state: "TN",
  zip: "37876",
  beds: "2",
  baths: "1",
  sqft: 950,
  propertyType: "single_family",
  listPrice: "429000.00",
};

describe("reconcileCanonical", () => {
  it("never overwrites facts that are already on the SavvyOS record", () => {
    const { fills } = reconcileCanonical(populated, zillowScrape);
    expect(fills).toEqual({});
  });

  it("names the fields it refused to change so the UI can surface them", () => {
    const { ignored } = reconcileCanonical(populated, zillowScrape);
    expect(ignored.sort()).toEqual(
      ["baths", "beds", "listPrice", "propertyType", "sqft"].sort()
    );
  });

  it("does not report normalizedAddress separately from address", () => {
    const { ignored } = reconcileCanonical(populated, {
      ...zillowScrape,
      address: "3316 Grace Ct",
      normalizedAddress: "3316 grace ct sevierville tn 37876",
    });
    expect(ignored).toContain("address");
    expect(ignored).not.toContain("normalizedAddress");
  });

  it("fills blanks on the SavvyOS record without touching populated fields", () => {
    const sparse = { ...populated, beds: null, baths: null, sqft: null };
    const { fills, ignored } = reconcileCanonical(sparse, zillowScrape);
    expect(fills).toEqual({ beds: "2", baths: "1", sqft: 950 });
    expect(ignored.sort()).toEqual(["listPrice", "propertyType"].sort());
  });

  it("never blanks out a populated field when the import parsed nothing", () => {
    const empty = {
      address: "",
      normalizedAddress: "",
      city: null,
      state: null,
      zip: null,
      beds: null,
      baths: null,
      sqft: null,
      propertyType: null,
      listPrice: null,
    };
    const { fills, ignored } = reconcileCanonical(populated, empty);
    expect(fills).toEqual({});
    expect(ignored).toEqual([]);
  });

  it("treats whitespace-only incoming strings as absent", () => {
    const sparse = { ...populated, city: null };
    const { fills } = reconcileCanonical(sparse, { ...zillowScrape, city: "   " });
    expect(fills).toEqual({});
  });
});
