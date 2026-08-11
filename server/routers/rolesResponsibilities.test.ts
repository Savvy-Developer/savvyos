import { describe, expect, it } from "vitest";
import { aggregateRows, cumulativeBounds, matchesFilters, periodBounds, sourceFields } from "./rolesResponsibilities";

describe("R&R scorecard calculations", () => {
  it("calculates the current weekly period from Monday through Sunday", () => {
    const bounds = periodBounds("weekly", new Date("2026-08-12T15:00:00Z"));
    expect(bounds.start.toISOString()).toBe("2026-08-10T00:00:00.000Z");
    expect(bounds.end.toISOString()).toBe("2026-08-17T00:00:00.000Z");
  });

  it("uses the configured cumulative reset instead of only the display period", () => {
    const bounds = cumulativeBounds({ frequency: "weekly", isCumulative: true, cumulativeReset: "monthly" }, new Date("2026-08-12T15:00:00Z"));
    expect(bounds.start.toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect(bounds.end.toISOString()).toBe("2026-08-17T00:00:00.000Z");
  });

  it("applies approved filters and safely handles multi-value filter selections", () => {
    const row = { status: "completed", priority: "high", isAutomated: false };
    expect(matchesFilters(row, { status: ["pending", "completed"], priority: "high" })).toBe(true);
    expect(matchesFilters(row, { status: "pending" })).toBe(false);
  });

  it("calculates count, sum, average, latest, and percentage metrics correctly", () => {
    const rows = [
      { id: 1, amount: "10", status: "completed", updatedAt: "2026-08-10T00:00:00.000Z" },
      { id: 2, amount: "20", status: "pending", updatedAt: "2026-08-11T00:00:00.000Z" },
      { id: 3, amount: "40", status: "completed", updatedAt: "2026-08-12T00:00:00.000Z" },
    ];
    expect(aggregateRows(rows, "count")).toEqual({ value: 3, recordCount: 3 });
    expect(aggregateRows(rows, "sum", "amount")).toEqual({ value: 70, recordCount: 3 });
    expect(aggregateRows(rows, "average", "amount")).toEqual({ value: 70 / 3, recordCount: 3 });
    expect(aggregateRows(rows, "latest", "amount")).toEqual({ value: 40, recordCount: 3 });
    const percentage = aggregateRows(rows, "percentage", undefined, { status: "completed" }, {});
    expect(percentage.recordCount).toBe(3);
    expect(percentage.value).toBeCloseTo(200 / 3, 10);
  });

  it("only advertises actual approved fields for automatic source builders", () => {
    expect(sourceFields("tasks").dates).toContain("completedAt");
    expect(sourceFields("transactions").numbers).toContain("grossCommissionIncome");
    expect(sourceFields("agent_connections").filters).toContain("pipelineStatus");
  });
});
