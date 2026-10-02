import { describe, expect, it } from "vitest";
import { isIsolatedTrpcQuery } from "../../client/src/lib/isolatedTrpcQueries";

describe("latency-sensitive tRPC routing", () => {
  it("keeps MLS card, total, map, and detail responses independent of slow facets", () => {
    for (const path of ["mlsProperties.search", "mlsProperties.total", "mlsProperties.mapPoints", "mlsProperties.listing"]) {
      expect(isIsolatedTrpcQuery(path)).toBe(true);
    }
    expect(isIsolatedTrpcQuery("mlsProperties.sourceFacets")).toBe(false);
    expect(isIsolatedTrpcQuery("mlsProperties.filterOptions")).toBe(false);
  });

  it("retains the existing long-running report split without expanding unrelated routes", () => {
    expect(isIsolatedTrpcQuery("analytics.leadCohortConversion")).toBe(true);
    expect(isIsolatedTrpcQuery("permissions.getMyPermissions")).toBe(false);
    expect(isIsolatedTrpcQuery("mlsProperties.searchOther")).toBe(false);
  });
});
