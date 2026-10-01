import { describe, expect, it } from "vitest";
import { measurableReportingWeek } from "./personal";

describe("measurableReportingWeek", () => {
  it("uses the active Saturday–Friday operational week on Monday", () => {
    const week = measurableReportingWeek(new Date("2026-09-28T16:00:00.000Z"));
    expect(week.startDate).toBe("2026-09-26");
    expect(week.endDate).toBe("2026-10-02");
  });

  it("uses the active Saturday–Friday reporting week before the reset", () => {
    const week = measurableReportingWeek(new Date("2026-09-25T16:00:00.000Z"));
    expect(week.startDate).toBe("2026-09-19");
    expect(week.endDate).toBe("2026-09-25");
  });

  it("keeps the new Saturday cycle active across the Eastern-time Sunday boundary", () => {
    const week = measurableReportingWeek(new Date("2026-09-28T04:30:00.000Z"));
    expect(week.startDate).toBe("2026-09-26");
    expect(week.endDate).toBe("2026-10-02");
  });
});
