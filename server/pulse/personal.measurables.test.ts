import { describe, expect, it } from "vitest";
import { measurableReportingWeek } from "./personal";

describe("measurableReportingWeek", () => {
  it("defaults Monday to the Sunday–Saturday week that just ended", () => {
    const week = measurableReportingWeek(new Date("2026-09-28T16:00:00.000Z"));
    expect(week.startDate).toBe("2026-09-20");
    expect(week.endDate).toBe("2026-09-26");
  });

  it("uses the active Sunday–Saturday reporting week on other days", () => {
    const week = measurableReportingWeek(new Date("2026-09-25T16:00:00.000Z"));
    expect(week.startDate).toBe("2026-09-20");
    expect(week.endDate).toBe("2026-09-26");
  });

  it("uses the completed week when Monday begins in Eastern time", () => {
    const week = measurableReportingWeek(new Date("2026-09-28T04:30:00.000Z"));
    expect(week.startDate).toBe("2026-09-20");
    expect(week.endDate).toBe("2026-09-26");
  });
});
