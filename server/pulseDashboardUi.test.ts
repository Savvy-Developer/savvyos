import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const myWorkPage = readFileSync(path.join(root, "client/src/pages/PulseMyWorkPage.tsx"), "utf8");
const weeklyPreparation = readFileSync(path.join(root, "client/src/components/pulse/PulseWeeklyPreparation.tsx"), "utf8");
const notifications = readFileSync(path.join(root, "client/src/components/pulse/PulseNotificationsInbox.tsx"), "utf8");
const masterScorecard = readFileSync(path.join(root, "client/src/components/pulse/PulseMasterScorecard.tsx"), "utf8");
const scorecardRouter = readFileSync(path.join(root, "server/pulse/scorecard.ts"), "utf8");

describe("Pulse dashboard consolidation", () => {
  it("uses a compact notification popover instead of a dashboard notification card", () => {
    expect(myWorkPage).toContain("PulseNotificationsPopover");
    expect(myWorkPage).not.toContain("<PulseNotificationsInbox");
    expect(notifications).toContain("export function PulseNotificationsPopover");
    expect(notifications).toContain("<PopoverContent");
    expect(notifications).toContain("max-h-80 overflow-y-auto");
  });

  it("shows one weekly preparation meeting at a time through meeting tabs", () => {
    expect(weeklyPreparation).toContain("<TabsList");
    expect(weeklyPreparation).toContain("<TabsTrigger key={meeting.id}");
    expect(weeklyPreparation).toContain("<TabsContent key={meeting.id}");
    expect(weeklyPreparation).not.toContain("prep.data.meetings.map((meeting: any) => { const fields");
  });

  it("provides an authorized master scorecard Pulse tab", () => {
    expect(myWorkPage).toContain("PulseMasterScorecard");
    expect(myWorkPage).toContain('value="scorecard"');
    expect(masterScorecard).toContain("trpc.pulse.scorecard.master.useQuery");
    expect(masterScorecard).toContain("All meetings");
    expect(scorecardRouter).toContain("master: pulseProcedure.query");
    expect(scorecardRouter).toContain("visible_meeting_ids");
  });
});
