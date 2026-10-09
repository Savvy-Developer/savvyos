import { describe, expect, it } from "vitest";
import { __testables__ } from "./oneOnOnes";

describe("HR 1:1 scheduling safeguards", () => {
  it("uses the Eastern calendar date when deciding whether a meeting can run", () => {
    const now = new Date("2026-10-09T15:00:00.000Z"); // 11:00 AM Eastern

    expect(__testables__.isScheduledForTodayOrEarlier(new Date("2026-10-10T00:30:00.000Z"), now)).toBe(true); // 8:30 PM Eastern on Oct. 9
    expect(__testables__.isScheduledForTodayOrEarlier(new Date("2026-10-10T04:00:00.000Z"), now)).toBe(false); // Midnight Eastern on Oct. 10
    expect(__testables__.isScheduledForTodayOrLater(new Date("2026-10-08T16:00:00.000Z"), now)).toBe(false);
  });

  it("calculates the following occurrence from the configured cadence", () => {
    const current = new Date("2026-10-09T16:30:00.000Z");

    expect(__testables__.addDays(current, 30).toISOString()).toBe("2026-11-08T16:30:00.000Z");
  });
});
