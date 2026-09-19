import { describe, expect, it } from "vitest";

import {
  filterableMarkets,
  marketDirectory,
  marketIdForZip,
  marketZipSet,
  zipInMarket,
  zipToMarket,
  type MarketRow,
  type ZipAssignment,
} from "./publicMarketDirectory";

const market = (overrides: Partial<MarketRow> = {}): MarketRow => ({
  id: 1,
  name: "Asheville",
  state: "NC",
  status: "active",
  ...overrides,
});

const zips = (
  marketProfileId: number,
  ...zipCodes: string[]
): ZipAssignment[] => zipCodes.map(zipCode => ({ zipCode, marketProfileId }));

describe("resolving a property to a market", () => {
  const map = zipToMarket(zips(10, "28801", "28803"));

  it("resolves a plain five digit ZIP", () => {
    expect(marketIdForZip("28801", map)).toBe(10);
  });

  it("resolves a ZIP+4, which is how plenty of records are stored", () => {
    expect(marketIdForZip("28801-1234", map)).toBe(10);
  });

  it("ignores surrounding whitespace", () => {
    expect(marketIdForZip("  28801 ", map)).toBe(10);
  });

  it("returns null for a ZIP in nobody's territory", () => {
    expect(marketIdForZip("99999", map)).toBeNull();
  });

  it("returns null rather than guessing at an unusable ZIP", () => {
    expect(marketIdForZip(null, map)).toBeNull();
    expect(marketIdForZip("", map)).toBeNull();
    expect(marketIdForZip("abcde", map)).toBeNull();
    expect(marketIdForZip("288", map)).toBeNull();
  });
});

describe("the public markets directory", () => {
  it("omits a market with no ZIP territories", () => {
    const directory = marketDirectory(
      [market({ id: 10 }), market({ id: 11, name: "Boise", state: "ID" })],
      zips(10, "28801"),
      []
    );
    expect(directory.map(entry => entry.id)).toEqual([10]);
  });

  it("keeps a market that has territories but nothing published yet", () => {
    const directory = marketDirectory([market({ id: 10 })], zips(10, "28801"), []);
    expect(directory).toEqual([
      { id: 10, name: "Asheville", state: "NC", zipCount: 1, propertyCount: 0 },
    ]);
  });

  it("counts published properties into the market owning their ZIP", () => {
    const directory = marketDirectory(
      [market({ id: 10 }), market({ id: 20, name: "Panama City Beach", state: "FL" })],
      [...zips(10, "28801", "28803"), ...zips(20, "32413")],
      [
        { zip: "28801" },
        { zip: "28803-0002" },
        { zip: "32413" },
        { zip: "99999" },
        { zip: null },
      ]
    );
    expect(
      directory.map(entry => [entry.name, entry.propertyCount])
    ).toEqual([
      ["Panama City Beach", 1],
      ["Asheville", 2],
    ]);
  });

  it("counts ZIP territories, not properties, in zipCount", () => {
    const directory = marketDirectory(
      [market({ id: 10 })],
      zips(10, "28801", "28803", "28804"),
      [{ zip: "28801" }]
    );
    expect(directory[0].zipCount).toBe(3);
    expect(directory[0].propertyCount).toBe(1);
  });

  it("hides markets that are paused or still in the future", () => {
    const directory = marketDirectory(
      [
        market({ id: 10, status: "active" }),
        market({ id: 11, name: "Paused", status: "paused" }),
        market({ id: 12, name: "Future", status: "future" }),
        market({ id: 13, name: "Recruiting", status: "recruiting" }),
      ],
      [
        ...zips(10, "28801"),
        ...zips(11, "28802"),
        ...zips(12, "28803"),
        ...zips(13, "28804"),
      ],
      []
    );
    expect(directory.map(entry => entry.id).sort()).toEqual([10, 13]);
  });

  it("treats a placeholder state as no state rather than printing it", () => {
    const directory = marketDirectory(
      [
        market({ id: 10, name: "Western North Carolina", state: "N/A" }),
        market({ id: 11, name: "Blank", state: "  " }),
        market({ id: 12, name: "Lowercase", state: "n/a" }),
      ],
      [...zips(10, "28801"), ...zips(11, "28802"), ...zips(12, "28803")],
      []
    );
    expect(directory.map(entry => entry.state)).toEqual([null, null, null]);
  });

  it("sorts markets with no state last rather than under the letter N", () => {
    const directory = marketDirectory(
      [
        market({ id: 1, name: "Western North Carolina", state: "N/A" }),
        market({ id: 2, name: "Asheville", state: "NC" }),
        market({ id: 3, name: "Panama City Beach", state: "FL" }),
      ],
      [...zips(1, "28701"), ...zips(2, "28801"), ...zips(3, "32413")],
      []
    );
    expect(directory.map(entry => entry.name)).toEqual([
      "Panama City Beach",
      "Asheville",
      "Western North Carolina",
    ]);
  });

  it("orders by state then name, the order preferences already uses", () => {
    const directory = marketDirectory(
      [
        market({ id: 1, name: "Wilmington", state: "NC" }),
        market({ id: 2, name: "Panama City Beach", state: "FL" }),
        market({ id: 3, name: "Asheville", state: "NC" }),
      ],
      [...zips(1, "28401"), ...zips(2, "32413"), ...zips(3, "28801")],
      []
    );
    expect(directory.map(entry => entry.name)).toEqual([
      "Panama City Beach",
      "Asheville",
      "Wilmington",
    ]);
  });

  it("counts a property once even when several markets are in play", () => {
    const directory = marketDirectory(
      [market({ id: 10 }), market({ id: 20, name: "Western NC" })],
      [...zips(10, "28801"), ...zips(20, "28701")],
      [{ zip: "28801" }]
    );
    const total = directory.reduce((sum, entry) => sum + entry.propertyCount, 0);
    expect(total).toBe(1);
  });
});

describe("which markets may be offered as a filter", () => {
  it("drops markets that would return nothing", () => {
    const directory = marketDirectory(
      [market({ id: 10 }), market({ id: 20, name: "Quiet", state: "NC" })],
      [...zips(10, "28801"), ...zips(20, "28701")],
      [{ zip: "28801" }]
    );
    expect(directory).toHaveLength(2);
    expect(filterableMarkets(directory).map(entry => entry.id)).toEqual([10]);
  });
});

describe("filtering the property list by one market", () => {
  const set = marketZipSet(zips(10, "28801", "28803"));

  it("keeps a property inside the territory", () => {
    expect(zipInMarket("28801", set)).toBe(true);
    expect(zipInMarket("28803-4455", set)).toBe(true);
  });

  it("drops a property outside it, or one we cannot place", () => {
    expect(zipInMarket("32413", set)).toBe(false);
    expect(zipInMarket(null, set)).toBe(false);
    expect(zipInMarket("not a zip", set)).toBe(false);
  });
});
