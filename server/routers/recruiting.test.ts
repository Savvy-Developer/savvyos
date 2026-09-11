import { describe, expect, it } from "vitest";
import { __testables__ } from "./recruiting";

const settings = {
  timezone: "America/New_York",
  workingHours: __testables__.defaultWorkingHours(),
} as any;

describe("recruiting scheduling helpers", () => {
  it("accepts a weekday slot inside configured working hours", () => {
    expect(__testables__.isWorkingSlot(
      new Date("2026-09-14T15:00:00.000Z"),
      new Date("2026-09-14T15:30:00.000Z"),
      settings,
    )).toBe(true);
  });

  it("rejects a weekend slot and busy overlap", () => {
    expect(__testables__.isWorkingSlot(
      new Date("2026-09-13T15:00:00.000Z"),
      new Date("2026-09-13T15:30:00.000Z"),
      settings,
    )).toBe(false);
    expect(__testables__.rangesOverlap(
      new Date("2026-09-14T15:00:00.000Z"),
      new Date("2026-09-14T15:30:00.000Z"),
      [{ start: "2026-09-14T15:15:00.000Z", end: "2026-09-14T15:45:00.000Z" }],
    )).toBe(true);
  });

  it("requires a first and last name for public booking", () => {
    expect(__testables__.splitName("Jordan Lee")).toEqual({ firstName: "Jordan", lastName: "Lee" });
    expect(() => __testables__.splitName("Jordan")).toThrow("first and last name");
  });
});
