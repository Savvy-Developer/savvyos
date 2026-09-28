import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const guard = readFileSync("server/sponsorContactLogSchema.ts", "utf8");
const migration = readFileSync(
  "drizzle/20260927_sponsor_contact_logs.sql",
  "utf8"
);
const router = readFileSync("server/routers/events.ts", "utf8");
const entrypoint = readFileSync("server/_core/index.ts", "utf8");

describe("sponsor contact log schema compatibility", () => {
  it("creates an append-only sponsor communication history with referential cleanup", () => {
    for (const source of [guard, migration]) {
      expect(source).toContain("event_sponsor_contact_logs");
      expect(source).toContain("event_sponsor_contact_logs_sponsor_occurred_idx");
      expect(source).toContain("ON DELETE CASCADE");
      expect(source).toContain("ON DELETE SET NULL");
    }
  });

  it("loads the history into the Events account overview and accepts permitted contact types", () => {
    expect(router).toContain("contactLogs: contactLogsBySponsor.get(sponsor.id) ?? []");
    expect(router).toContain("createSponsorContactLog: protectedProcedure");
    expect(router).toContain("z.enum(sponsorContactTypes)");
    expect(router).toContain("createdById: ctx.user.id");
  });

  it("runs its compatibility guard before the application accepts traffic", () => {
    expect(entrypoint).toContain("await ensureSponsorContactLogSchema();");
  });
});
