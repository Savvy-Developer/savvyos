import { describe, expect, it } from "vitest";
import { refreshFailureProfileStatus } from "./agentMarketsIntelligence";

describe("Market AI refresh recovery", () => {
  it("keeps the last complete intelligence profile eligible after a transient refresh failure", () => {
    expect(refreshFailureProfileStatus({ executiveSummary: "Existing evidence-backed profile" })).toBe("ready");
  });

  it("marks a first-time generation failure as unavailable", () => {
    expect(refreshFailureProfileStatus(null)).toBe("failed");
    expect(refreshFailureProfileStatus(undefined)).toBe("failed");
  });
});
