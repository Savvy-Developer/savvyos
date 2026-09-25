import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("server/coachingWorkflowSchema.ts", "utf8");
const migration = readFileSync(
  "drizzle/20260925_coaching_workflow_reliability.sql",
  "utf8"
);

describe("coaching workflow schema compatibility", () => {
  it("guards every additive column required by the committed migration", () => {
    for (const column of [
      "schedulingSource",
      "zoomMeetingId",
      "zoomHostUserId",
      "calendarProvider",
      "calendarEventId",
      "calendarEventUrl",
      "calendarSyncStatus",
      "calendarSyncError",
      "agentRecapSentAt",
      "agreementEvidence",
    ]) {
      expect(migration).toContain(`\`${column}\``);
      expect(source).toContain(`"${column}"`);
    }
  });

  it("runs before the SavvyOS server accepts traffic", () => {
    const entrypoint = readFileSync("server/_core/index.ts", "utf8");
    expect(entrypoint).toContain("await ensureCoachingWorkflowSchema();");
  });
});
