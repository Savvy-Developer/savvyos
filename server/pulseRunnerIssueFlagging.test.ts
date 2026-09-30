import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const runner = read("client/src/pages/PulseMeetingRunPage.tsx");
const dialog = read("client/src/components/pulse/PulseRunnerIssueDialog.tsx");
const l10 = read("server/pulse/l10.ts");
const schema = read("drizzle/schema.ts");
const migration = read("drizzle/20260930_pulse_runner_issue_sources.sql");
const schemaGuard = read("server/pulse/runnerIssueSourceSchema.ts");

describe("Pulse Meeting Runner Issue flags", () => {
  it("adds a server-enforced, active-session Issue path for all supported sources", () => {
    const raiseIssue = l10.slice(
      l10.indexOf("raiseIssueFromRunner:"),
      l10.indexOf("setTodoStatus:")
    );

    expect(raiseIssue).toContain(
      "await requireL10Runner(db, ctx.user, input.meetingId)"
    );
    expect(raiseIssue).toContain(
      "await requireSession(db, input.meetingId, input.sessionId, true)"
    );
    expect(raiseIssue).toContain("getRunnerIssueSource");
    expect(raiseIssue).toContain('type: "issue"');
    expect(raiseIssue).toContain("sourceSnapshot: source.snapshot");
    expect(raiseIssue).toContain("alreadyRaised: true");
  });

  it("retains one source snapshot per headline, scorecard measurable, or Rock in an L10 session", () => {
    expect(schema).toContain('"pulse_runner_issue_sources"');
    expect(schema).toContain(
      'mysqlEnum("sourceType", ["headline", "scorecard", "rock"])'
    );
    expect(migration).toContain(
      "pulse_runner_issue_sources_session_source_unique"
    );
    expect(schemaGuard).toContain("ensurePulseRunnerIssueSourceSchema");
    expect(schemaGuard).toContain("pulse_runner_issue_sources");
  });

  it("shows flag actions in headline, scorecard, and Rock review with a concise source-aware dialog", () => {
    expect(runner).toContain('sourceType: "headline"');
    expect(runner).toContain('sourceType: "scorecard"');
    expect(runner).toContain('sourceType: "rock"');
    expect(runner).toContain("Flag for IDS");
    expect(runner).toContain("PulseRunnerIssueDialog");
    expect(dialog).toContain("This creates an Issue in this L10 and retains");
    expect(dialog).toContain("Add Issue to IDS");
  });

  it("marks flagged items in the runner so a source is not accidentally added twice", () => {
    expect(l10).toContain("flaggedSources");
    expect(runner).toContain("In IDS");
    expect(runner).toContain("flaggedIssueId");
  });
});
