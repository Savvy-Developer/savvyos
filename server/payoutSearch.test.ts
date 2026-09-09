import { describe, expect, it } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { buildPayoutSearchCondition } from "./payoutSearch";

const dialect = new MySqlDialect();

function compileSearch(search: string) {
  const condition = buildPayoutSearchCondition(search);
  if (!condition) throw new Error("Expected a payout search condition");
  return dialect.sqlToQuery(condition);
}

describe("buildPayoutSearchCondition", () => {
  it("searches memo numbers and every property address component", () => {
    const query = compileSearch("  Main   Street  ");

    expect(query.sql).toContain("`transaction_payout_items`.`expMemoNumber`");
    expect(query.sql).toContain("`properties`.`address`");
    expect(query.sql).toContain("`properties`.`city`");
    expect(query.sql).toContain("`properties`.`state`");
    expect(query.sql).toContain("`properties`.`zip`");
    expect(query.params).toContain("Main Street");
    expect(query.params).toContain("Main Street.%");
    expect(query.params.filter((value) => value === "%Main Street%"))
      .toHaveLength(4);
  });

  it("preserves exact memo matching when the search includes a decimal suffix", () => {
    const query = compileSearch("12345.1");

    expect(query.params).toContain("12345.1");
    expect(query.params).not.toContain("12345.1.%");
    expect(query.params.filter((value) => value === "%12345.1%"))
      .toHaveLength(4);
  });
});
