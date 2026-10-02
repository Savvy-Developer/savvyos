import { describe, expect, it } from "vitest";
import { formatNumericFilter, parseNumericFilter, sanitizeNumericInput } from "../../client/src/pages/mls/filterNumbers";
import { searchFiltersSchema } from "./search";

describe("MLS numeric filters", () => {
  it("formats whole-dollar and fractional prices consistently", () => {
    expect(formatNumericFilter(1200000, "currency")).toBe("$1,200,000.00");
    expect(formatNumericFilter(1234.5, "currency")).toBe("$1,234.50");
    expect(parseNumericFilter("$1,234.50", "currency", 0, 1_000_000_000)).toEqual({ value: 1234.5 });
  });
  it("does not let letters, exponent notation or extra decimal points into numeric inputs", () => {
    expect(sanitizeNumericInput("abc12,345.678x", "currency")).toBe("12345.67");
    expect(sanitizeNumericInput("2e6", "integer")).toBe("26");
    expect(sanitizeNumericInput("12.3.4", "decimal")).toBe("12.34");
  });
  it("rejects implausible bedroom counts instead of applying them", () => {
    expect(parseNumericFilter("100", "integer", 0, 30).error).toContain("30");
    expect(parseNumericFilter("30", "integer", 0, 30)).toEqual({ value: 30 });
    expect(parseNumericFilter("", "integer", 0, 30)).toEqual({});
    expect(searchFiltersSchema.safeParse({ minBeds: 100 }).success).toBe(false);
    expect(searchFiltersSchema.safeParse({ minBeds: 30, maxPrice: 1_000_000_000 }).success).toBe(true);
    expect(searchFiltersSchema.safeParse({ maxPrice: 1_000_000_001 }).success).toBe(false);
  });
});
