import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const router = readFileSync(path.join(root, "server/routers/pm.ts"), "utf8");
const projectsPage = readFileSync(
  path.join(root, "client/src/pages/ProjectsPage.tsx"),
  "utf8"
);
const projectDetailPage = readFileSync(
  path.join(root, "client/src/pages/ProjectDetailPage.tsx"),
  "utf8"
);

const listProcedure = router.slice(
  router.indexOf("list: protectedProcedure"),
  router.indexOf("moveDestinations: protectedProcedure")
);
const getByIdProcedure = router.slice(
  router.indexOf("getById: protectedProcedure"),
  router.indexOf("routingOptions: protectedProcedure")
);
const archiveProcedures = router.slice(
  router.indexOf("archive: protectedProcedure"),
  router.indexOf("reorder: protectedProcedure")
);

describe("owner-only Project archive", () => {
  it("returns only the caller's archived Projects, even when they can view all active Projects", () => {
    expect(listProcedure).toContain("if (input?.includeArchived)");
    expect(listProcedure).toContain(
      "Boolean(project.archivedAt) && project.ownerId === ctx.user.id"
    );
    expect(listProcedure).toContain("Never broaden this view");
    expect(listProcedure).toContain(
      "input?.showAll === true && canViewAllProjects(ctx.user)"
    );
  });

  it("blocks direct archived Project access for non-owners and restores only owner-owned records", () => {
    expect(getByIdProcedure).toContain(
      "project.archivedAt && project.ownerId !== ctx.user.id"
    );
    expect(getByIdProcedure).toContain(
      "Only the Project owner can view an archived Project."
    );
    expect(archiveProcedures).toContain("restore: protectedProcedure");
    expect(archiveProcedures).toContain(
      "Only the Project owner can restore an archived Project."
    );
    expect(archiveProcedures).toContain("set({ archivedAt: null })");
    expect(archiveProcedures).toContain(
      '"project_restored", "Project restored"'
    );
  });

  it("offers a clearly labeled owner archive view and restore action", () => {
    expect(projectsPage).toContain('"My Archived Projects"');
    expect(projectsPage).toContain(
      'showArchived ? "Active Projects" : "My Archived Projects"'
    );
    expect(projectsPage).toContain(
      "Archived Projects you own will appear here."
    );
    expect(projectDetailPage).toContain("trpc.pm.projects.restore.useMutation");
    expect(projectDetailPage).toContain("Restore Project");
    expect(projectDetailPage).toContain(
      'project_restored: "restored this project"'
    );
  });
});
