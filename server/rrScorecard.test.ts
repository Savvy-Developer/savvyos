import { describe, expect, it } from "vitest";
import { aggregateRows, evaluateFormula, metricPeriodBounds, periodToDatePerformance, scoreResult } from "./rrScorecard";
import { describeAutomaticCalculation, defaultTotalsMode } from "@shared/scorecard";

describe("governed R&R scorecard calculations", () => {
  it("recalculates a percentage from its numerator and denominator", () => {
    const result = aggregateRows([
      { id: 1, status: "eligible" },
      { id: 2, status: "eligible" },
      { id: 3, status: "eligible" },
      { id: 4, status: "ineligible" },
    ], "percentage", undefined, { id: [1, 2] }, { status: "eligible" });
    expect(result.value).toBeCloseTo(200 / 3, 10);
    expect(result.numerator).toBe(2);
    expect(result.denominator).toBe(3);
  });

  it("keeps zero denominators separate from a genuine zero", () => {
    const result = aggregateRows([], "percentage", undefined, {}, {});
    expect(result).toMatchObject({ value: null, recordCount: 0, numerator: 0, denominator: 0, resultState: "no_eligible_activity" });
  });

  it("uses unique records without double counting", () => {
    const result = aggregateRows([{ id: 1 }, { id: 1 }, { id: 2 }], "unique_count");
    expect(result).toMatchObject({ value: 2, recordCount: 2 });
  });

  it("evaluates only named formula inputs and mathematical operators", () => {
    expect(evaluateFormula("advertising_spend / eligible_bookings", { advertising_spend: 360, eligible_bookings: 12 })).toBe(30);
    expect(() => evaluateFormula("advertising_spend / eligible_bookings", { advertising_spend: 360, eligible_bookings: 0 })).toThrow("denominator is zero");
    expect(() => evaluateFormula("process.exit(1)", {})).toThrow("Use only input names");
  });

  it("keeps unset and informational targets out of pass-fail status", () => {
    expect(scoreResult(0, "reported", { comparisonRule: "at_least", targetValue: null })).toEqual({ status: "target_unset", onTarget: null });
    expect(scoreResult(50, "reported", { comparisonRule: "informational", targetValue: null })).toEqual({ status: "informational", onTarget: null });
  });

  it("grades range and warning targets correctly", () => {
    expect(scoreResult(96, "reported", { comparisonRule: "within_range", targetMinimum: 90, targetMaximum: 110 })).toEqual({ status: "on_target", onTarget: true });
    expect(scoreResult(88, "reported", { comparisonRule: "within_range", targetMinimum: 90, targetMaximum: 110 })).toEqual({ status: "off_target", onTarget: false });
    expect(scoreResult(92, "reported", { comparisonRule: "at_least", targetValue: 100, warningThreshold: 90 })).toEqual({ status: "warning", onTarget: false });
  });

  it("uses a defined reset window for cumulative and rolling metrics", () => {
    const quarterToDate = metricPeriodBounds({ frequency: "weekly", measurementPeriod: "quarter_to_date" }, new Date("2026-08-12T15:00:00Z"));
    expect(quarterToDate.start.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(quarterToDate.end.toISOString()).toBe("2026-08-13T00:00:00.000Z");
    const rolling = metricPeriodBounds({ frequency: "monthly", measurementPeriod: "rolling", rollingDays: 30 }, new Date("2026-08-12T15:00:00Z"));
    expect(rolling.start.toISOString()).toBe("2026-07-14T00:00:00.000Z");
    expect(rolling.end.toISOString()).toBe("2026-08-13T00:00:00.000Z");
  });

  it("marks unique best and lowest weeks only after four reported weeks", () => {
    const tooFew = periodToDatePerformance([
      { id: "week-1", actual: 9, resultState: "reported" },
      { id: "week-2", actual: 16, resultState: "reported" },
      { id: "week-3", actual: 4, resultState: "reported" },
    ], { frequency: "weekly", performanceDirection: "higher" });
    expect(tooFew.size).toBe(0);

    const markers = periodToDatePerformance([
      { id: "week-1", actual: 9, resultState: "reported" },
      { id: "week-2", actual: 16, resultState: "reported" },
      { id: "week-3", actual: 4, resultState: "reported" },
      { id: "week-4", actual: 11, resultState: "reported" },
      { id: "missing", actual: null, resultState: "missing" },
    ], { frequency: "weekly", performanceDirection: "higher" });
    expect(markers.get("week-2")).toMatchObject({ kind: "best", label: "Best week to date", comparedPeriods: 4 });
    expect(markers.get("week-3")).toMatchObject({ kind: "worst", label: "Lowest week to date", comparedPeriods: 4 });
    expect(markers.get("week-1")).toBeUndefined();
    expect(markers.get("missing")).toBeUndefined();
  });

  it("reverses best and lowest for lower-is-better and ignores ties", () => {
    const markers = periodToDatePerformance([
      { id: "week-1", actual: 3, resultState: "reported" },
      { id: "week-2", actual: 8, resultState: "reported" },
      { id: "week-3", actual: 3, resultState: "reported" },
      { id: "week-4", actual: 5, resultState: "reported" },
    ], { frequency: "weekly", performanceDirection: "lower" });
    expect(markers.get("week-1")).toBeUndefined();
    expect(markers.get("week-3")).toBeUndefined();
    expect(markers.get("week-2")).toMatchObject({ kind: "worst", label: "Lowest week to date", comparedPeriods: 4 });
  });

  it("withholds markers for flat histories", () => {
    expect(periodToDatePerformance([
      { id: "a", actual: 10, resultState: "reported" },
      { id: "b", actual: 10, resultState: "reported" },
      { id: "c", actual: 10, resultState: "reported" },
      { id: "d", actual: 10, resultState: "reported" },
    ], { frequency: "weekly", performanceDirection: "higher" }).size).toBe(0);
  });

  it("defaults totals to cumulative for counts and dollars and average for percent or score", () => {
    expect(defaultTotalsMode("count")).toBe("cumulative");
    expect(defaultTotalsMode("dollars")).toBe("cumulative");
    expect(defaultTotalsMode("percentage")).toBe("average");
    expect(defaultTotalsMode("score")).toBe("average");
  });

  it("writes a locked plain-language description from automatic setup", () => {
    const description = describeAutomaticCalculation({
      dataSource: "tasks",
      dateField: "completedAt",
      calculation: "count",
      filters: { status: "completed" },
      isCumulative: true,
      cumulativeReset: "annually",
    });
    expect(description).toContain("Automatically counts tasks assigned to the owner");
    expect(description).toContain("completed date");
    expect(description).toContain("status = completed");
    expect(description).toContain("reset annually");
  });
});
