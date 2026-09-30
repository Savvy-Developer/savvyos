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
const email = read("server/_core/resendEmail.ts");

describe("My EOS unified L10 workspace", () => {
  it("uses one selected L10 across preparation, work, Rocks, and measurables", () => {
    expect(dashboard).toContain('id="pulse-meeting-workspace"');
    expect(dashboard).toContain('aria-label="Prepare for L10"');
    expect(dashboard).toContain('setSelectedMeetingId(data.meetings[0].id)');
    expect(dashboard).toContain('<PulseWeeklyPreparation embedded meetingId={selectedMeeting.id} />');
    expect(dashboard).toContain('<PulseMyMeasurables embedded meetingId={selectedMeeting.id} />');
    expect(dashboard).toContain('<PulseL10WorkCreator meetingId={selectedMeeting.id} onCreated={changed} />');
    expect(dashboard).toContain('<PulseWeeklyPreparationReview meetingId={selectedMeeting.id} rocks={data.items.rocks} />');
    expect(dashboard).toContain('title="Weekly Preparation"');
    expect(dashboard).toContain('title="My Work"');
    expect(dashboard).toContain('title="My Measurables"');
    expect(dashboard).not.toContain('Weekly Preparation · ${selectedMeeting.name}');
    expect(dashboard).not.toContain('My Work · ${selectedMeeting.name}');
    expect(dashboard).not.toContain('My Measurables · ${selectedMeeting.name}');
    expect(dashboard).not.toContain('id="pulse-workspace"');
    expect(dashboard).not.toContain('<PulseWeeklyPreparation embedded />');
  });

  it("puts the single confirmation after the selected L10's measurable and Rock review", () => {
    expect(dashboard.indexOf('<PulseMyMeasurables embedded meetingId={selectedMeeting.id} />')).toBeLessThan(dashboard.indexOf('<PulseWeeklyPreparationReview meetingId={selectedMeeting.id} rocks={data.items.rocks} />'));
    expect(preparation).toContain('Review your measurables and Rocks below, then confirm one complete recap for this L10.');
    expect(preparation).toContain('Confirm weekly preparation');
    expect(preparation).toContain('Review what will be saved and emailed to you for this L10.');
    expect(preparation).toContain('Rocks reviewed');
    expect(preparation).toContain('Weekly preparation confirmed. A detailed confirmation email is on its way.');
    expect(preparation).toContain('Reopen preparation');
  });

  it("keeps meeting updates separate while reviewing measurable values and notes in one flow", () => {
    expect(preparation).toContain('hideMeetingName ? "Meeting updates" : meeting.name');
    expect(preparation).not.toContain('Confirm preparation');
    expect(measurables).toContain('Review pulled and manual values, then add an optional note for each measurable.');
    expect(measurables).toContain('id={`measurable-note-${field.key}`}');
    expect(measurables).toContain('placeholder="Add context for this result…"');
    expect(measurables).toContain('Mark reviewed');
    expect(measurables).toContain('approved: options?.approve ?? field.source !== "automatic"');
    expect(measurables).not.toContain('submitMyMeasurables.useMutation');
  });

  it("records notes, Rocks, and a detailed confirmation email with the weekly submission", () => {
    expect(personal).toContain('note?: string | null;');
    expect(personal).toContain('note: metadata.note ?? metric.current.note ?? ""');
    expect(personal).toContain('async function weeklyPreparationRocks');
    expect(personal).toContain('const rocks = await weeklyPreparationRocks');
    expect(personal).toContain('pulseSubmissionDetails: [');
    expect(personal).toContain('note: field.note || undefined');
    expect(email).toContain('pulseSubmissionDetails?: string[];');
    expect(email).toContain('infoCard(ctx.pulseSubmissionDetails.map(escapeHtml))');
  });

  it("creates new work directly in the selected L10", () => {
    expect(creator).toContain('defaultDestinationId={meetingId}');
    expect(creator).toContain('New To-Dos and Issues start in the L10 selected above.');
    expect(creator).not.toContain('meetingName');
  });
});
