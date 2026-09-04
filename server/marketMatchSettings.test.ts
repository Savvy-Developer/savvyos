import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAX_RECOMMENDED_MARKETS,
  normalizeMaxRecommendedMarkets,
} from "./marketMatchSettings";

describe("Market Match settings normalization", () => {
  it("retains the supported 3–5 recommendation range", () => {
    expect(normalizeMaxRecommendedMarkets(3)).toBe(3);
    expect(normalizeMaxRecommendedMarkets(4)).toBe(4);
    expect(normalizeMaxRecommendedMarkets(5)).toBe(5);
  });

  it("falls back safely when a persisted value is missing or invalid", () => {
    expect(normalizeMaxRecommendedMarkets(undefined)).toBe(
      DEFAULT_MAX_RECOMMENDED_MARKETS
    );
    expect(normalizeMaxRecommendedMarkets(2)).toBe(
      DEFAULT_MAX_RECOMMENDED_MARKETS
    );
    expect(normalizeMaxRecommendedMarkets(6)).toBe(
      DEFAULT_MAX_RECOMMENDED_MARKETS
    );
    expect(normalizeMaxRecommendedMarkets(4.5)).toBe(
      DEFAULT_MAX_RECOMMENDED_MARKETS
    );
    expect(normalizeMaxRecommendedMarkets("not-a-number")).toBe(
      DEFAULT_MAX_RECOMMENDED_MARKETS
    );
  });
});
