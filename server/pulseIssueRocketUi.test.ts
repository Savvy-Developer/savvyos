import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const workItems = readFileSync(path.join(root, "server/pulse/workItems.ts"), "utf8");
const l10 = readFileSync(path.join(root, "server/pulse/l10.ts"), "utf8");
const itemEditor = readFileSync(path.join(root, "client/src/components/pulse/PulseItemEditor.tsx"), "utf8");

describe("Pulse Issue Rocket", () => {
  it("orders Rocketed Issues before the ordinary Issue list", () => {
    expect(l10).toContain("asc(pulseWorkItems.sortOrder)");
    expect(l10).toContain("function getIssues");
  });

  it("allows an active meeting participant to Rocket only an open meeting Issue", () => {
    expect(workItems).toContain("rocketIssue: pulseMemberProcedure");
    expect(workItems).toContain("getAccessibleWorkItem(db, ctx.user.id, input.workItemId)");
    expect(workItems).toContain("Only open meeting Issues can be rocketed.");
    expect(workItems).toContain('"issue_rocketed"');
    expect(workItems).toContain("nextRocketSortOrder");
  });

  it("exposes a compact Rocket control directly on meeting Issue rows", () => {
    expect(itemEditor).toContain("Rocket");
    expect(itemEditor).toContain("trpc.pulse.workItems.rocketIssue.useMutation");
    expect(itemEditor).toContain("Rocket Issue to top");
    expect(itemEditor).toContain("isIssue && item.meetingId");
  });
});
