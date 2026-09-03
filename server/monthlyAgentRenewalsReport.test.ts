import { describe, expect, it } from "vitest";
import {
  getNextMonthlyAgentRenewalsAt9AmEastern,
  monthlyAgentRenewalsTimerDelay,
} from "./monthlyAgentRenewalsReport";

describe("monthly agent renewals scheduling", () => {
  it("schedules the following first-of-month report in Eastern time", () => {
    expect(
      getNextMonthlyAgentRenewalsAt9AmEastern(
        new Date("2026-09-03T15:00:00.000Z")
      ).toISOString()
    ).toBe("2026-10-01T13:00:00.000Z");
  });

  it("rechecks daily rather than passing an unsafe month-long timeout to Node", () => {
    const now = new Date("2026-09-03T15:00:00.000Z");
    const nextRun = new Date("2026-10-01T13:00:00.000Z");
    expect(monthlyAgentRenewalsTimerDelay(nextRun, now)).toBe(24 * 60 * 60 * 1000);
  });

  it("uses a short retry delay when the intended run time has passed", () => {
    expect(
      monthlyAgentRenewalsTimerDelay(
        new Date("2026-09-03T14:59:00.000Z"),
        new Date("2026-09-03T15:00:00.000Z")
      )
    ).toBe(1_000);
  });
});
