import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const meetingDashboard = readFileSync(
  path.join(process.cwd(), "client/src/pages/PulseMeetingDashboardPage.tsx"),
  "utf8",
);

describe("Pulse L10 overview cards", () => {
  it("uses matched compact cards for rhythm and leadership", () => {
    expect(meetingDashboard).toContain('section className="grid gap-3 lg:grid-cols-2"');
    expect(meetingDashboard.match(/min-h-40/g)).toHaveLength(2);
    expect(meetingDashboard).not.toContain("lg:grid-cols-[1.2fr_1fr]");
  });

  it("keeps compact leadership details contained and actionable rhythm controls spaced", () => {
    expect(meetingDashboard).toContain('className="truncate text-sm font-semibold"');
    expect(meetingDashboard).toContain('title={data.meeting.facilitator?.name');
    expect(meetingDashboard).toContain('grid grid-cols-2 gap-1.5 pt-3');
    expect(meetingDashboard).toContain('h-8 min-w-0 px-2 text-xs');
  });
});
