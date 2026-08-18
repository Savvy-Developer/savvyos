import { describe, expect, it } from "vitest";
import { getEasternTimeParts } from "./agentProductionReportScheduler";
import { getNextDailyReportAt6PmEastern } from "./dailyAgentReportScheduler";

describe("getNextDailyReportAt6PmEastern", () => {
  it("selects the same Eastern calendar day before 6 PM", () => {
    const now = new Date("2026-08-17T21:59:00.000Z"); // 5:59 PM EDT
    const next = getNextDailyReportAt6PmEastern(now);
    const eastern = getEasternTimeParts(next);

    expect(next.toISOString()).toBe("2026-08-17T22:00:00.000Z");
    expect(eastern).toMatchObject({ year: 2026, month: 8, day: 17, hour: 18, minute: 0 });
  });

  it("rolls to the following Eastern day after the 6 PM window", () => {
    const now = new Date("2026-08-17T22:01:00.000Z"); // 6:01 PM EDT
    const next = getNextDailyReportAt6PmEastern(now);
    const eastern = getEasternTimeParts(next);

    expect(next.toISOString()).toBe("2026-08-18T22:00:00.000Z");
    expect(eastern).toMatchObject({ year: 2026, month: 8, day: 18, hour: 18, minute: 0 });
  });

  it("preserves the 6 PM wall-clock time across the spring DST offset", () => {
    const now = new Date("2026-03-09T16:00:00.000Z"); // 12:00 PM EDT after DST begins
    const next = getNextDailyReportAt6PmEastern(now);
    const eastern = getEasternTimeParts(next);

    expect(next.toISOString()).toBe("2026-03-09T22:00:00.000Z");
    expect(eastern).toMatchObject({ year: 2026, month: 3, day: 9, hour: 18, minute: 0 });
  });
});
