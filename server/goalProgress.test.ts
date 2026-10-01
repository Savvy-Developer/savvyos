import { describe, it, expect } from "vitest";
import { getGoalStatus } from "../shared/goalProgress";

describe("getGoalStatus", () => {
  it("reports on track with pending when closed + pending covers the goal (large pending book case)", () => {
    // Oct 1: $3.52M closed, $9.03M under contract, $7M goal, ~75% of year elapsed
    const r = getGoalStatus({ actual: 3_520_000, pending: 9_025_000, target: 7_000_000, expectedPct: 75 });
    expect(r.status).toBe("on_track_with_pending");
    expect(r.closedPct).toBe(50);
    expect(r.combined).toBe(12_545_000);
    expect(r.combinedPct).toBe(179);
  });

  it("still reports behind when pending does not cover the goal", () => {
    const r = getGoalStatus({ actual: 3_520_000, pending: 1_000_000, target: 7_000_000, expectedPct: 75 });
    expect(r.status).toBe("behind");
    expect(r.paceGap).toBe(25);
  });

  it("reports behind with no pending deals (previous behavior)", () => {
    const r = getGoalStatus({ actual: 3_520_000, pending: 0, target: 7_000_000, expectedPct: 75 });
    expect(r.status).toBe("behind");
  });

  it("reports hit when closed alone meets the goal, regardless of pending", () => {
    expect(getGoalStatus({ actual: 7_000_000, pending: 2_000_000, target: 7_000_000, expectedPct: 75 }).status).toBe("hit");
  });

  it("treats exactly meeting the goal with pending as on track", () => {
    expect(getGoalStatus({ actual: 4_000_000, pending: 3_000_000, target: 7_000_000, expectedPct: 75 }).status).toBe(
      "on_track_with_pending",
    );
  });

  it("keeps on pace / ahead thresholds based on closed production", () => {
    expect(getGoalStatus({ actual: 52, pending: 0, target: 100, expectedPct: 50 }).status).toBe("on_pace");
    expect(getGoalStatus({ actual: 60, pending: 0, target: 100, expectedPct: 50 }).status).toBe("ahead");
  });

  it("ignores negative or invalid pending values", () => {
    const r = getGoalStatus({ actual: 50, pending: Number.NaN, target: 100, expectedPct: 75 });
    expect(r.combined).toBe(50);
    expect(r.status).toBe("behind");
  });
});
