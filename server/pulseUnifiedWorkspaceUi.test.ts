import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const dashboard = read("client/src/pages/PulseMyWorkPage.tsx");
const preparation = read("client/src/components/pulse/PulseWeeklyPreparation.tsx");
const measurables = read("client/src/components/pulse/PulseMyMeasurables.tsx");
const creator = read("client/src/components/pulse/PulseL10WorkCreator.tsx");
const personal = read("server/pulse/personal.ts");

describe("My EOS unified L10 workspace", () => {
  it("uses one selected L10 across preparation, work, Rocks, and measurables", () => {
    expect(dashboard).toContain('id="pulse-meeting-workspace"');
    expect(dashboard).toContain('aria-label="Prepare for L10"');
    expect(dashboard).toContain('setSelectedMeetingId(data.meetings[0].id)');
    expect(dashboard).toContain('<PulseWeeklyPreparation embedded meetingId={selectedMeeting.id} />');
    expect(dashboard).toContain('<PulseMyMeasurables embedded meetingId={selectedMeeting.id} meetingName={selectedMeeting.name} />');
    expect(dashboard).toContain('<PulseL10WorkCreator meetingId={selectedMeeting.id} meetingName={selectedMeeting.name} onCreated={changed} />');
    expect(dashboard).not.toContain('id="pulse-workspace"');
    expect(dashboard).not.toContain('<PulseWeeklyPreparation embedded />');
  });

  it("removes weekly-preparation tabs inside the controlled My EOS workspace", () => {
    expect(preparation).toContain('meetingId?: string');
    expect(preparation).toContain('const activeId = meetingId ?? (activeMeetingId');
    expect(preparation).toContain('if (meetingId) return <section id="weekly-preparation"');
    expect(preparation).toContain('Segue, Headlines, and Brief together');
  });

  it("scopes measurable display, refresh, and submission to the selected L10", () => {
    expect(measurables).toContain('myMeasurables.useQuery(meetingId ? { meetingId } : undefined)');
    expect(measurables).toContain('refresh.mutate({ metricId: measurable.metricId, meetingId })');
    expect(measurables).toContain('meetingId,\n      manualValues');
    expect(personal).toContain('pulseMeetingScorecardMetrics');
    expect(personal).toContain('myMeasurables: pulseProcedure.input');
    expect(personal).toContain('eq(pulseMeetingScorecardMetrics.meetingId, meetingId)');
    expect(personal).toContain('submitMyMeasurables: pulseProcedure.input');
  });

  it("creates new work directly in the selected L10", () => {
    expect(creator).toContain('defaultDestinationId={meetingId}');
    expect(creator).toContain('Add work to {meetingName}');
  });
});
