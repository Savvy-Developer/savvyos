import { describe, expect, it } from "vitest";
import {
  classifyHigherIsWorse,
  classifyLowerIsWorse,
  mergeWeeklyTrend,
  percentage,
  resolveIsmDateRange,
} from "./ismDashboard";
import { ADMIN_NAV_PERMISSIONS } from "../routers/permissions";

describe("ISM dashboard metric helpers", () => {
  it("defaults to an inclusive 30-day window ending today", () => {
    expect(
      resolveIsmDateRange({}, new Date("2026-08-13T18:00:00.000Z"))
    ).toEqual({
      dateFrom: "2026-07-15",
      dateTo: "2026-08-13",
    });
  });

  it("normalizes reversed date boundaries", () => {
    expect(
      resolveIsmDateRange({ dateFrom: "2026-08-13", dateTo: "2026-08-01" })
    ).toEqual({
      dateFrom: "2026-08-01",
      dateTo: "2026-08-13",
    });
  });

  it("returns a one-decimal percentage and preserves unavailable denominators", () => {
    expect(percentage(249, 1107)).toBe(22.5);
    expect(percentage(0, 20)).toBe(0);
    expect(percentage(5, 0)).toBeNull();
  });

  it("classifies higher-is-worse data-quality rates", () => {
    expect(classifyHigherIsWorse(5, 10, 25)).toBe("healthy");
    expect(classifyHigherIsWorse(10, 10, 25)).toBe("warning");
    expect(classifyHigherIsWorse(25, 10, 25)).toBe("critical");
    expect(classifyHigherIsWorse(null, 10, 25)).toBe("warning");
  });

  it("classifies lower-is-worse data-quality rates", () => {
    expect(classifyLowerIsWorse(95, 90, 75)).toBe("healthy");
    expect(classifyLowerIsWorse(90, 90, 75)).toBe("warning");
    expect(classifyLowerIsWorse(75, 90, 75)).toBe("critical");
    expect(classifyLowerIsWorse(null, 90, 75)).toBe("warning");
  });

  it("fills missing weekly trend series with zeroes and preserves source ordering", () => {
    const trend = mergeWeeklyTrend("2026-08-03", "2026-08-16", [
      [{ weekStart: "2026-08-03", value: 12 }],
      [
        { weekStart: "2026-08-03", value: 90 },
        { weekStart: "2026-08-10", value: 110 },
      ],
      [],
    ]);

    expect(trend).toHaveLength(2);
    expect(trend[0]).toMatchObject({
      period: "2026-08-03",
      assignedLeads: 12,
      callAttempts: 90,
      completedTasks: 0,
    });
    expect(trend[1]).toMatchObject({
      period: "2026-08-10",
      assignedLeads: 0,
      callAttempts: 110,
      completedTasks: 0,
    });
  });
});

describe("ISM dashboard permission registration", () => {
  it("is a distinct default-managed admin permission in the ISA group", () => {
    expect(ADMIN_NAV_PERMISSIONS).toContainEqual({
      key: "canViewIsmDashboard",
      label: "ISM Dashboard",
      group: "ISA",
    });
  });
});
