import { describe, expect, it } from "vitest";
import { selectedScorecardPeriod } from "./scorecard";

describe("selectedScorecardPeriod", () => {
  it("normalizes reporting dates to the matching weekly, monthly, quarterly, and annual period", () => {
    expect(selectedScorecardPeriod("weekly", "2026-09-27")).toMatchObject({
      periodStart: "2026-09-21",
      periodEnd: "2026-09-27",
      label: "Week of Sep 21, 2026",
    });
    expect(selectedScorecardPeriod("monthly", "2026-09-27")).toMatchObject({
      periodStart: "2026-09-01",
      periodEnd: "2026-09-30",
      label: "Sep 2026",
    });
    expect(selectedScorecardPeriod("quarterly", "2026-09-27")).toMatchObject({
      periodStart: "2026-07-01",
      periodEnd: "2026-09-30",
      label: "Q3 2026",
    });
    expect(selectedScorecardPeriod("annually", "2026-09-27")).toMatchObject({
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
      label: "2026",
    });
  });

  it("rejects malformed reporting periods", () => {
    expect(() => selectedScorecardPeriod("weekly", "not-a-date")).toThrow(
      "Choose a valid scorecard reporting period."
    );
  });
});
