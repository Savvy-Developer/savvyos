import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { unwrapPropertyListRows } from "../client/src/lib/propertyList";

describe("unwrapPropertyListRows", () => {
  it("unwraps the aggregate rows returned by properties.list", () => {
    const property = {
      id: 1021,
      address: "1523 Sky View Drive",
      city: "Sevierville",
      state: "TN",
      zip: "37876",
    };

    expect(
      unwrapPropertyListRows([
        {
          property,
          transactionCount: 2,
          listingCount: 0,
          contactCount: 2,
        },
      ])
    ).toEqual([property]);
  });

  it("accepts already-normalized properties and drops invalid rows", () => {
    const property = {
      id: 7,
      address: "10 Main Street",
      city: null,
      state: null,
      zip: null,
    };

    expect(
      unwrapPropertyListRows([
        property,
        null,
        {},
        { property: null },
        { property: { id: "7", address: "Wrong id type" } },
      ])
    ).toEqual([property]);
  });

  it("keeps property selection controls on the normalized row contract", () => {
    const expectations = [
      ["client/src/pages/TransactionsPage.tsx", "unwrapPropertyListRows(propData)"],
      ["client/src/pages/TransactionDetail.tsx", "unwrapPropertyListRows(editPropertyRows)"],
      ["client/src/pages/ListingsPage.tsx", "unwrapPropertyListRows(propertyRows)"],
      ["client/src/pages/ListingDetail.tsx", "unwrapPropertyListRows(propertySearchRows)"],
      ["client/src/pages/ContactDetail.tsx", "unwrapPropertyListRows(allPropertyRows)"],
    ] as const;

    for (const [path, expected] of expectations) {
      expect(readFileSync(path, "utf8"), path).toContain(expected);
    }
  });
});
