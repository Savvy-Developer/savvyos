import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "drizzle/20261010_event_sponsor_deliverable_timeline.sql",
  "utf8"
);
const schemaGuard = readFileSync(
  "server/eventDeliverableTimelineSchema.ts",
  "utf8"
);
const entrypoint = readFileSync("server/_core/index.ts", "utf8");

describe("event deliverable timeline schema", () => {
  it("keeps the migration, guard, and startup order aligned", () => {
    for (const fragment of [
      "dueOffsetDays",
      "event_sponsor_deliverables_due_status_idx",
    ]) {
      expect(migration).toContain(fragment);
      expect(schemaGuard).toContain(fragment);
    }
    expect(entrypoint).toContain(
      "await ensureEventDeliverableTimelineSchema();"
    );
  });
});
