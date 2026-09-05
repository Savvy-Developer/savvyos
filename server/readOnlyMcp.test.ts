import { describe, expect, it } from "vitest";
import { __testables__ } from "./readOnlyMcp";

const { isSensitiveFieldName, validateReadOnlySql } = __testables__;

describe("read-only MCP SQL guard", () => {
  it("allows a single bounded SELECT query", () => {
    expect(
      validateReadOnlySql("SELECT id, firstName FROM contacts LIMIT 25")
    ).toBe("SELECT id, firstName FROM contacts LIMIT 25");
  });

  it("allows a bounded CTE with only SELECT statements", () => {
    expect(
      validateReadOnlySql(
        "WITH recent AS (SELECT id FROM contacts) SELECT id FROM recent LIMIT 10"
      )
    ).toContain("WITH recent");
  });

  it.each([
    "SELECT id FROM contacts",
    "SELECT id FROM contacts LIMIT 501",
    "DELETE FROM contacts LIMIT 1",
    "WITH x AS (SELECT id FROM contacts) UPDATE contacts SET firstName = 'x' LIMIT 1",
    "SELECT id FROM contacts LIMIT 1; DELETE FROM contacts",
    "SELECT passwordHash FROM users LIMIT 1",
    "SELECT id FROM information_schema.tables LIMIT 1",
  ])("blocks unsafe query: %s", query => {
    expect(() => validateReadOnlySql(query)).toThrow();
  });

  it("recognizes credential-like result fields", () => {
    expect(isSensitiveFieldName("passwordHash")).toBe(true);
    expect(isSensitiveFieldName("apiKey")).toBe(true);
    expect(isSensitiveFieldName("firstName")).toBe(false);
  });
});
