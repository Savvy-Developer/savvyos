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
  const projectDetailPage = read("client/src/pages/ProjectDetailPage.tsx");
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

  it("limits existing links to Events Projects and creates new linked Projects through Projects", () => {
    expect(eventsPage).toContain("Choose an existing, unlinked Project in the Events department.");
    expect(eventsPage).toContain("Create an Events Project");
    expect(eventsPage).toContain("Create and link Project");
    expect(eventsPage).toContain('department: "Events"');
    expect(eventsPage).toContain("trpc.pm.projects.create.useMutation()");
    expect(eventsPage).toContain("await linkProject.mutateAsync({ eventId, projectId: project.id })");
    expect(eventsPage).toContain("No tasks are created automatically.");
    expect(eventsPage).toContain("ownerId: Number(newProject.ownerId)");
    expect(eventsPage).toContain(
      "A Project is linked to this Event. You do not have access to its planning workspace."
    );
    expect(eventsPage).toContain("<ProjectDetailPage embeddedProjectId={linked.project.id} />");
  });

  it("keeps the full linked Project workspace in its dedicated Event tab", () => {
    expect(eventsPage).toContain('TabsTrigger value="overview"');
    expect(eventsPage).toContain('TabsTrigger value="project"');
    expect(eventsPage).toContain("<EventProjectWorkspace");
    expect(eventsPage).not.toContain("EventProjectOverview");
    expect(projectDetailPage).toContain(
      'const allowedTabs = ["tasks", "board", "gantt", "notes", "updates", "activity"];'
    );
    for (const tab of ["gantt", "notes", "updates", "activity"]) {
      expect(projectDetailPage).toContain(`TabsTrigger value="${tab}"`);
    }
  });

  it("creates the additive link table before Railway accepts traffic", () => {
    expect(schemaGuard).toContain("CREATE TABLE IF NOT EXISTS \\`event_project_links\\`");
    expect(schemaGuard).toContain("ON DELETE RESTRICT");
    expect(serverEntry).toContain("await ensureEventProjectLinkSchema();");
  });
});
