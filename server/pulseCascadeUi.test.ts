import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const cascades = read("server/pulse/cascades.ts");
const payloads = read("server/pulse/cascadePayload.ts");
const l10 = read("server/pulse/l10.ts");
const dashboard = read("client/src/pages/PulseMeetingDashboardPage.tsx");
const myWork = read("client/src/pages/PulseMyWorkPage.tsx");
const runner = read("client/src/pages/PulseMeetingRunPage.tsx");
const composer = read("client/src/components/pulse/PulseCascadeComposer.tsx");

describe("Pulse cascading-message workflow", () => {
  it("uses the frozen recipient audience and validates source-meeting access before delivery", () => {
    expect(cascades).toContain("prepareCascadeDelivery");
    expect(cascades).toContain("visible_meeting_ids(db, recipientId)");
    expect(cascades).toContain("cannot see the source meeting");
    expect(cascades).toContain("pulseCascadeRecipients");
    expect(cascades).toContain("visibleIds.includes(rows[0].fromMeetingId)");
  });

  it("creates one actionable in-app notification per recipient and honors notification preferences", () => {
    expect(cascades).toContain(
      'getPulseNotificationPreference(db, recipientId, "cascade_sent")'
    );
    expect(cascades).toContain("notificationRecipientIds");
    expect(cascades).toContain('notificationType: "cascade"');
    expect(cascades).toContain("requiresAction: true");
    expect(cascades).toContain("sendTransactionalEmail(");
    expect(cascades).toContain('"cascade_sent"');
  });

  it("uses a clear subject across direct sends and L10 closeout drafts", () => {
    expect(composer).toContain("Subject");
    expect(composer).toContain("subject: subject.trim()");
    expect(l10).toContain("subject: z.string().trim().min(1).max(255)");
    expect(l10).toContain("publishDraftCascade");
  });

  it("never shows unpublished draft content in recipient payloads", () => {
    expect(payloads).toContain(
      'eq(pulseCascadingMessages.deliveryStatus, "published")'
    );
    expect(payloads).toContain("destinationMeetingIds");
    expect(payloads).toContain("visibleIds.includes(message.fromMeetingId)");
  });

  it("keeps acknowledgments available from the compact My Work header and the original meeting", () => {
    expect(myWork).toContain("Incoming Cascades");
    expect(myWork).toContain("HeaderCascadePanel");
    expect(myWork).toContain("PulseCascadeCard");
    expect(myWork).toContain("pulse.cascades.acknowledge");
    expect(dashboard).toContain("Cascading messages");
    expect(dashboard).toContain("Send cascade");
    expect(dashboard).toContain("Incoming cascades");
    expect(dashboard).toContain("Sent cascades");
  });

  it("keeps individual acknowledgment on My EOS and lets the runner clear an incoming cascade for its destination team", () => {
    expect(cascades).toContain("acknowledgeForMeeting:");
    expect(cascades).toContain("is_visible_meeting_manager(db, user.id, meetingId)");
    expect(cascades).toContain("pulseCascadeRecipients.viaMeetingId");
    expect(cascades).toContain("pulseNotifications.sourceType, \"cascade\"");
    expect(cascades).toContain('action: "acknowledged_for_meeting"');
    expect(payloads).toContain("pendingDestinationMeetingIds");
    expect(payloads).toContain("message.pendingDestinationMeetingIds.includes(meetingId)");
    expect(runner).toContain("Acknowledge for team");
  });

  it("uses one global session composer with a deferred-publication explanation", () => {
    const concludeStep = runner.slice(
      runner.indexOf("function ConcludeStep"),
      runner.indexOf("export default function PulseMeetingRunPage")
    );

    expect(runner).toContain("PulseCascadeDraftDialog");
    expect(composer).toContain("It will publish");
    expect(composer).toContain("when this L10 closes.");
    expect(concludeStep).not.toContain("PulseCascade");
    expect(runner).not.toContain("setCascadeBody");
  });
});
