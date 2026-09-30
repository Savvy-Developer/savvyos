import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const scorecard = read("client/src/components/pulse/PulseScorecard.tsx");
const l10Dashboard = read("client/src/pages/PulseMeetingDashboardPage.tsx");
const scorecardRouter = read("server/pulse/scorecard.ts");
const l10Router = read("server/pulse/l10.ts");

describe("Pulse weekly scorecard review", () => {
  it("shows a blank-safe previous week, this week, YTD target comparison, and eight-week history", () => {
    expect(scorecard).toContain("Previous week");
    expect(scorecard).toContain("This week");
    expect(scorecard).toContain("YTD vs. Target");
    expect(scorecard).toContain("8-week history");
    expect(scorecard).toContain("slice(0, 8).reverse()");
    expect(scorecard).toContain("formatWeeklyValue(metric.previous?.value");
  });

  it("uses the same canonical measurable payload in the L10 and Master Scorecard", () => {
    expect(l10Dashboard).toContain("<PulseScorecard");
    expect(l10Router).toContain(
      "getMeetingScorecard(db, userId, targetMeetingId, true)"
    );
    expect(scorecardRouter).toContain("WEEKLY_SCORECARD_HISTORY_LENGTH = 8");
    expect(scorecardRouter).toContain("annualTargetForWeeklyMetric");
  });

  it("keeps record recognition as an inline icon rather than a scorecard column", () => {
    expect(scorecard).toContain(
      "<RecordMarker performance={metric.periodToDatePerformance} />"
    );
    expect(scorecard).not.toContain(">Worst week<");
    expect(scorecard).not.toContain(">Best week<");
  });
});
