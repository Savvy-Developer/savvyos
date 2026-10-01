import { describe, expect, it } from "vitest";
import {
  pulseWeeklyCycle,
  pulseWeeklyCycleStart,
} from "../../shared/pulseWeeklyCycle";

describe("Pulse Saturday weekly cycle", () => {
  it("resets exactly at Saturday midnight Eastern", () => {
    expect(
      pulseWeeklyCycle(new Date("2026-10-03T03:59:59.000Z"))
    ).toMatchObject({
      startDate: "2026-09-26",
      endDate: "2026-10-02",
    });
    expect(
      pulseWeeklyCycle(new Date("2026-10-03T04:00:00.000Z"))
    ).toMatchObject({
      startDate: "2026-10-03",
      endDate: "2026-10-09",
    });
  });

  it("stores the operating-week date at UTC midnight for date-column comparisons", () => {
    expect(
      pulseWeeklyCycleStart(new Date("2026-10-06T16:00:00.000Z")).toISOString()
    ).toBe("2026-10-03T00:00:00.000Z");
  });

  it("keeps the Saturday-midnight boundary correct after Eastern standard time begins", () => {
    expect(
      pulseWeeklyCycle(new Date("2026-12-05T04:59:59.000Z"))
    ).toMatchObject({
      startDate: "2026-11-28",
      endDate: "2026-12-04",
    });
    expect(
      pulseWeeklyCycle(new Date("2026-12-05T05:00:00.000Z"))
    ).toMatchObject({
      startDate: "2026-12-05",
      endDate: "2026-12-11",
    });
  });
});
