import { describe, expect, it } from "vitest";
import {
  getExpMemoRoot,
  isValidExpMemoNumber,
  normalizeExpMemoNumber,
} from "./expMemoNumber";

describe("eXp memo numbers", () => {
  it("accepts root and numbered payout-side memo numbers without a side limit", () => {
    expect(isValidExpMemoNumber("3992138")).toBe(true);
    expect(isValidExpMemoNumber("3992138.0")).toBe(true);
    expect(isValidExpMemoNumber("3992138.2")).toBe(true);
    expect(isValidExpMemoNumber("3992138.42")).toBe(true);
  });

  it("rejects invalid memo number formats", () => {
    expect(isValidExpMemoNumber("3992138a")).toBe(false);
    expect(isValidExpMemoNumber("3992138.1.2")).toBe(false);
    expect(isValidExpMemoNumber("3992138.")).toBe(false);
  });

  it("normalizes optional input and derives a memo root", () => {
    expect(normalizeExpMemoNumber(" 3992138.2 ")).toBe("3992138.2");
    expect(normalizeExpMemoNumber("  ")).toBeNull();
    expect(normalizeExpMemoNumber(undefined)).toBeUndefined();
    expect(getExpMemoRoot("3992138.2")).toBe("3992138");
    expect(getExpMemoRoot("3992138")).toBe("3992138");
  });
});
