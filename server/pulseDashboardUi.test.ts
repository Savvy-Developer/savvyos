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

  it("leads My EOS with one shared L10 selector and preparation", () => {
    const weeklyPreparationIndex = myWorkPage.indexOf('title={`Weekly Preparation · ${selectedMeeting.name}`}');
    const myWorkIndex = myWorkPage.indexOf('title={`My Work · ${selectedMeeting.name}`}');
    expect(weeklyPreparationIndex).toBeGreaterThan(-1);
    expect(myWorkIndex).toBeGreaterThan(weeklyPreparationIndex);
    expect(myWorkPage).toContain('aria-label="Prepare for L10"');
    expect(myWorkPage).toContain('<PulseWeeklyPreparation embedded meetingId={selectedMeeting.id} />');
    expect(myWorkPage).not.toContain('aria-label="Show work from"');
    expect(weeklyPreparation).toContain('if (meetingId) return <section id="weekly-preparation"');
  });

  it("uses a constrained tabbed queue instead of side-by-side To-Do and Issue lists", () => {
    expect(myWorkPage).toContain("function CompactWorkQueue");
    expect(myWorkPage).toContain('value="todos"');
    expect(myWorkPage).toContain('value="issues"');
    expect(myWorkPage).toContain('aria-label="My Work list type"');
    expect(myWorkPage).toContain("max-h-[28rem]");
    expect(myWorkPage).not.toContain("lg:grid-cols-2");
  });

  it("pairs selected L10 work with selected L10 measurables", () => {
    expect(myWorkPage).toContain('section className="grid gap-3 xl:grid-cols-2 xl:items-start"');
    expect(myWorkPage).toContain('title={`My Measurables · ${selectedMeeting.name}`}');
    expect(myWorkPage).toContain('<PulseMyMeasurables embedded meetingId={selectedMeeting.id} meetingName={selectedMeeting.name} />');
    expect(myWorkPage).toContain('className="min-w-0"');
  });

  it("keeps Incoming Cascades compact but informative beside the My EOS title", () => {
    const headerIndex = myWorkPage.indexOf('<header className="border-b border-border pb-4">');
    const weeklyPreparationIndex = myWorkPage.indexOf('title={`Weekly Preparation · ${selectedMeeting.name}`}');
    expect(myWorkPage).toContain("function HeaderCascadePanel");
    expect(myWorkPage).toContain('aria-label="Incoming Cascades"');
    expect(myWorkPage).toContain('className="h-24 min-w-0 flex-1 rounded-lg border border-border bg-muted/20 p-2.5 sm:w-80 sm:flex-none"');
    expect(myWorkPage).toContain("firstMessage.routing.source");
    expect(myWorkPage).toContain('className="mt-1 h-11 w-full justify-start gap-2 px-2 text-left hover:bg-background"');
    expect(myWorkPage).toContain("max-h-[calc(100dvh-2rem)]");
    expect(myWorkPage).toContain("<PulseCascadeCard");
    expect(myWorkPage).toContain("<HeaderCascadePanel messages={data.actionCenter.cascades}");
    expect(myWorkPage).not.toContain('<DashboardSection title="Incoming Cascades"');
    expect(headerIndex).toBeGreaterThan(-1);
    expect(myWorkPage.indexOf("<HeaderCascadePanel")).toBeGreaterThan(headerIndex);
    expect(myWorkPage.indexOf("<HeaderCascadePanel")).toBeLessThan(weeklyPreparationIndex);
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

  it("keeps collapsible dashboard sections without a separate measurable tab", () => {
    expect(myWorkPage).toContain("DashboardSection");
    expect(myWorkPage).toContain("<CollapsibleTrigger");
    expect(myWorkPage).toContain("activeWorkTab");
    expect(myWorkPage).not.toContain('TabsContent value="measurables"');
  });
});
