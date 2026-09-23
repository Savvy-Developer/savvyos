import { describe, expect, it } from "vitest";
import {
  formatWebinarDateTime,
  formatWebinarTime,
  hasMinimumWebinarLeadTime,
  webinarDateTimeToUtc,
} from "@shared/webinarTime";

describe("webinar timezone handling", () => {
  it("stores and displays an Eastern webinar at the submitted wall time", () => {
    const startTime = webinarDateTimeToUtc(
      "2026-10-06T14:00",
      "America/New_York"
    );

    expect(startTime.toISOString()).toBe("2026-10-06T18:00:00.000Z");
    expect(formatWebinarDateTime(startTime, "America/New_York")).toContain(
      "2:00 PM EDT"
    );
  });

  it("stores and displays an Arizona webinar without converting it to Eastern time", () => {
    const startTime = webinarDateTimeToUtc(
      "2026-10-06T14:00",
      "America/Phoenix"
    );

    expect(startTime.toISOString()).toBe("2026-10-06T21:00:00.000Z");
    expect(formatWebinarTime(startTime, "America/Phoenix")).toBe("2:00 PM MST");
  });

  it("rejects an unavailable daylight-saving local time", () => {
    expect(() =>
      webinarDateTimeToUtc("2026-03-08T02:30", "America/New_York")
    ).toThrow("does not exist");
  });

  it("requires a full fourteen days of webinar lead time", () => {
    const now = new Date("2026-09-22T16:00:00.000Z");
    expect(
      hasMinimumWebinarLeadTime(new Date("2026-10-06T16:00:00.000Z"), now)
    ).toBe(true);
    expect(
      hasMinimumWebinarLeadTime(new Date("2026-10-06T15:59:59.999Z"), now)
    ).toBe(false);
  });
});
