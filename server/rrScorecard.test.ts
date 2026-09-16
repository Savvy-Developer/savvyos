import { describe, expect, it } from "vitest";
import { aggregateRows, evaluateFormula, metricPeriodBounds, scoreResult } from "./rrScorecard";

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
});
