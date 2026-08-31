import { describe, expect, it } from "vitest";
import { getAgentLeaderboardPeriodRange, sortAgentLeaderboardEntries } from "./db-analytics";

const now = new Date("2026-08-14T15:30:00.000Z");

describe("agent leaderboard period ranges", () => {
  it("uses Monday through today for the current week", () => {
    const range = getAgentLeaderboardPeriodRange("this_week", now);
    expect(range.label).toBe("This Week");
    expect(range.dateFrom?.toISOString()).toBe("2026-08-10T00:00:00.000Z");
    expect(range.dateTo?.toISOString()).toBe("2026-08-14T23:59:59.999Z");
  });

  it("uses the active month, quarter, and year-to-date boundaries", () => {
    const month = getAgentLeaderboardPeriodRange("this_month", now);
    const quarter = getAgentLeaderboardPeriodRange("this_quarter", now);
    const ytd = getAgentLeaderboardPeriodRange("ytd", now);

    expect(month).toMatchObject({ label: "August 2026" });
    expect(month.dateFrom?.toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect(quarter).toMatchObject({ label: "Q3 2026" });
    expect(quarter.dateFrom?.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(ytd).toMatchObject({ label: "Year to Date" });
    expect(ytd.dateFrom?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("does not impose date limits for the all-time board", () => {
    const range = getAgentLeaderboardPeriodRange("all_time", now);
    expect(range).toEqual({ dateFrom: undefined, dateTo: undefined, label: "All Time" });
  });

  it("orders the units view by units, with volume as the tie-breaker", () => {
    const entries = [
      { agentName: "Volume First", units: 3, volume: 950_000 },
      { agentName: "Units First", units: 4, volume: 500_000 },
      { agentName: "Unit Tie", units: 3, volume: 1_000_000 },
    ];

    expect(sortAgentLeaderboardEntries(entries, "units").map((entry) => entry.agentName))
      .toEqual(["Units First", "Unit Tie", "Volume First"]);
    expect(sortAgentLeaderboardEntries(entries, "volume").map((entry) => entry.agentName))
      .toEqual(["Unit Tie", "Volume First", "Units First"]);
  });
});
