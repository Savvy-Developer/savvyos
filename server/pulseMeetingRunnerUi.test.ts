import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const runner = read("client/src/pages/PulseMeetingRunPage.tsx");
const completionRail = read("client/src/components/pulse/PulseMeetingCompletionRail.tsx");
const cascadeComposer = read("client/src/components/pulse/PulseCascadeComposer.tsx");
const styles = read("client/src/index.css");
const l10 = read("server/pulse/l10.ts");

describe("Pulse Meeting Runner workspace", () => {
  it("renders incoming cascades as an actionable agenda step", () => {
    expect(runner).toContain('step === "cascades" ? <CascadesStep');
    expect(runner).toContain("PulseCascadeCard");
    expect(runner).toContain('from: "meeting_runner"');
  });

  it("uses a full-width, full-height work surface", () => {
    expect(runner).toContain(
      'className="flex w-full flex-wrap items-center justify-between gap-3"'
    );
    expect(runner).toContain("lg:min-h-[calc(100dvh-19rem)]");
    expect(styles).toMatch(/\.pulse-runner-content\s*\{[^}]*max-width: none;/s);
  });

  it("keeps conclusion focused on participant ratings and one average", () => {
    expect(runner).toContain("Meeting ratings");
    expect(runner).toContain("Average rating");
    expect(runner).toContain('aria-label="Participant ratings"');
    expect(runner).toContain("Rate a participant");
    expect(runner).not.toContain("Rating distribution");
    expect(runner).not.toContain("<Checkbox");
    expect(runner).not.toContain("<h3 className=\"font-semibold\">Attendance</h3>");
  });

  it("returns the complete participant rating list to the configured meeting rater", () => {
    expect(l10).toContain("const canRateParticipants = meeting.label === \"level_10\"");
    expect(l10).toContain("canRateParticipants ? eq(pulseSessionRatings.sessionId, activeSession.id)");
  });

  it("lets the person running an L10 immediately recall completed work", () => {
    expect(l10).toContain('canRecallCompletedInRun: meeting.label === "level_10" && canRun');
    expect(runner).toContain('canRecall={Boolean(data.permissions.canRecallCompletedInRun)}');
    expect(completionRail).toContain("trpc.pulse.workItems.reopen.useMutation");
    expect(completionRail).toContain("void history.refetch()");
    expect(completionRail).toContain("onChanged()");
    expect(completionRail).toContain("Recall is available to the person running this L10.");
    expect(completionRail).not.toContain("designated L10 Administrator");
  });

  it("keeps one cascade action available throughout the active runner", () => {
    expect(runner).toContain("const [cascadeComposerOpen, setCascadeComposerOpen] = useState(false)");
    expect(runner).toContain("<Send className=\"mr-2 h-4 w-4\"/>Cascade message");
    expect(runner).toContain("<PulseCascadeDraftDialog");
    expect(runner).toContain("sessionId={session.id}");
    expect(runner).not.toContain("PulseCascadeDraftForm");
    expect(cascadeComposer).toContain("export function PulseCascadeDraftDialog");
    expect(cascadeComposer).toContain("Capture this handoff from {sourceMeetingName} now.");
  });

  it("allows each authorized L10 runner to prepare an in-session cascade", () => {
    const draftCascade = l10.slice(l10.indexOf("draftCascade:"), l10.indexOf("closeSession:"));

    expect(draftCascade).toContain("const meeting = await requireL10Runner(db, ctx.user, input.meetingId)");
    expect(draftCascade).not.toContain('requireL10Capability(db, ctx.user, input.meetingId, "run_l10s")');
  });
});
