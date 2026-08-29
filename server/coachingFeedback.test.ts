import { describe, expect, it } from "vitest";
import { getCoachFeedbackWeekDateRange } from "./coachingFeedback";

describe("getCoachFeedbackWeekDateRange", () => {
  it("keeps weekly coach-feedback filters as calendar dates across a DST boundary", () => {
    const range = getCoachFeedbackWeekDateRange("2026-03-02");

    expect(range.start.toISOString()).toBe("2026-03-02T00:00:00.000Z");
    expect(range.endExclusive.toISOString()).toBe("2026-03-09T00:00:00.000Z");
  });

  it("uses the following Monday as the exclusive boundary", () => {
    const range = getCoachFeedbackWeekDateRange("2026-08-24");

    expect(range.start.toISOString()).toBe("2026-08-24T00:00:00.000Z");
    expect(range.endExclusive.toISOString()).toBe("2026-08-31T00:00:00.000Z");
  });
});
