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

  it("leads My Work with Weekly Preparation", () => {
    const weeklyPreparationIndex = myWorkPage.indexOf('title="Weekly Preparation"');
    const myWorkIndex = myWorkPage.indexOf('title="My Work"');
    expect(weeklyPreparationIndex).toBeGreaterThan(-1);
    expect(myWorkIndex).toBeGreaterThan(weeklyPreparationIndex);
    expect(myWorkPage).toContain('<PulseWeeklyPreparation embedded />');
  });

  it("uses a constrained tabbed queue instead of side-by-side To-Do and Issue lists", () => {
    expect(myWorkPage).toContain("function CompactWorkQueue");
    expect(myWorkPage).toContain('value="todos"');
    expect(myWorkPage).toContain('value="issues"');
    expect(myWorkPage).toContain('aria-label="My Work list type"');
    expect(myWorkPage).toContain("max-h-[28rem]");
    expect(myWorkPage).not.toContain("lg:grid-cols-2");
  });

  it("uses a meeting dropdown and pairs My Work with My Measurables", () => {
    expect(myWorkPage).toContain('id="pulse-workspace"');
    expect(myWorkPage).toContain('aria-label="Show work from"');
    expect(myWorkPage).toContain("<SelectContent>{workspaces.map");
    expect(myWorkPage).not.toContain("workspaces.map((workspace: any) => <button");
    expect(myWorkPage).toContain('section className="grid gap-3 xl:grid-cols-2 xl:items-start"');
    const myWorkIndex = myWorkPage.indexOf('title="My Work"');
    const measurableIndex = myWorkPage.indexOf('title="My Measurables"');
    expect(measurableIndex).toBeGreaterThan(myWorkIndex);
    expect(myWorkPage.slice(myWorkIndex, measurableIndex)).toContain('className="min-w-0"');
  });

  it("provides an authorized master scorecard Pulse tab", () => {
    expect(myWorkPage).toContain("PulseMasterScorecard");
    expect(myWorkPage).toContain('value="scorecard"');
    expect(masterScorecard).toContain("trpc.pulse.scorecard.master.useQuery");
    expect(masterScorecard).toContain("All meetings");
    expect(scorecardRouter).toContain("master: pulseProcedure.input");
    expect(scorecardRouter).toContain("visible_meeting_ids");
  });

  it("provides cadence tabs and historical reporting-period navigation on the Master Scorecard", () => {
    expect(masterScorecard).toContain('CADENCES = ["weekly", "monthly", "quarterly", "annually"]');
    expect(masterScorecard).toContain("selectedPeriod.label");
    expect(masterScorecard).toContain("movePeriod(-1)");
    expect(masterScorecard).toContain("movePeriod(1)");
    expect(masterScorecard).toContain("editableCurrent={selectedPeriod.isCurrent}");
    expect(scorecardRouter).toContain("selectedScorecardPeriod");
    expect(scorecardRouter).toContain("periodStart: z.string().regex");
  });

  it("keeps My Measurables as a collapsible section within My Work", () => {
    expect(myWorkPage).toContain("DashboardSection");
    expect(myWorkPage).toContain('title="My Measurables"');
    expect(myWorkPage).toContain("<PulseMyMeasurables embedded />");
    expect(myWorkPage).toContain("<CollapsibleTrigger");
    expect(myWorkPage).toContain("activeWorkTab");
    expect(myWorkPage).not.toContain('TabsContent value="measurables"');
  });
});
