import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath: string) =>
  readFileSync(path.join(root, relativePath), "utf8");

describe("Event–Project integration safeguards", () => {
  const migration = read("drizzle/20260925_event_project_links.sql");
  const eventsRouter = read("server/routers/events.ts");
  const eventsPage = read("client/src/pages/EventsPage.tsx");
  const schemaGuard = read("server/eventProjectLinkSchema.ts");
  const serverEntry = read("server/_core/index.ts");

  it("enforces one Event and one Project per relationship without cascading", () => {
    expect(migration).toContain("UNIQUE KEY `event_project_links_event_unique` (`eventId`)");
    expect(migration).toContain("UNIQUE KEY `event_project_links_project_unique` (`projectId`)");
    expect(migration).toContain("REFERENCES `event_portfolio` (`id`) ON DELETE RESTRICT");
    expect(migration).toContain("REFERENCES `pm_projects` (`id`) ON DELETE RESTRICT");
    expect(migration).not.toContain("ON DELETE CASCADE");
  });

  it("enforces Events department, Project access, and Project activity audits", () => {
    expect(eventsRouter).toContain('eq(pmProjects.department, "Events")');
    expect(eventsRouter).toContain("await assertProjectAccess(db, input.projectId, ctx.user)");
    expect(eventsRouter).toContain('action: "event_linked"');
    expect(eventsRouter).toContain('action: "event_unlinked"');
    expect(eventsRouter).toContain("await db.transaction");
  });

  it("keeps the picker non-creating and the inaccessible Project state redacted", () => {
    expect(eventsPage).toContain("No Events projects available. Create one in Projects first.");
    expect(eventsPage).toContain(
      "A Project is linked to this Event. You do not have access to its planning workspace."
    );
    expect(eventsPage).toContain("<ProjectDetailPage embeddedProjectId={linked.project.id} />");
    expect(eventsPage).not.toContain("Create Project from Event");
  });

  it("creates the additive link table before Railway accepts traffic", () => {
    expect(schemaGuard).toContain("CREATE TABLE IF NOT EXISTS \\`event_project_links\\`");
    expect(schemaGuard).toContain("ON DELETE RESTRICT");
    expect(serverEntry).toContain("await ensureEventProjectLinkSchema();");
  });
});
