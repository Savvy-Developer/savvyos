import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const router = readFileSync(path.join(root, "server/routers/pm.ts"), "utf8");
const projectDetail = readFileSync(
  path.join(root, "client/src/pages/ProjectDetailPage.tsx"),
  "utf8"
);
const myTodos = readFileSync(
  path.join(root, "client/src/components/MyTodosDashboard.tsx"),
  "utf8"
);
const moveDialog = readFileSync(
  path.join(root, "client/src/components/ProjectTodoMoveProjectDialog.tsx"),
  "utf8"
);

const moveProcedure = router.slice(
  router.indexOf("moveToProject: protectedProcedure"),
  router.indexOf("toggleComplete: protectedProcedure")
);

describe("Project To-Do moves", () => {
  it("only lists active projects the user can access as destinations", () => {
    const destinationsProcedure = router.slice(
      router.indexOf("moveDestinations: protectedProcedure"),
      router.indexOf("getById: protectedProcedure")
    );

    expect(destinationsProcedure).toContain(
      "getAccessibleProjectIds(db, ctx.user.id)"
    );
    expect(destinationsProcedure).toContain("isNull(pmProjects.archivedAt)");
    expect(destinationsProcedure).toContain(
      "projects.filter(project => accessibleProjectIds.includes(project.id))"
    );
    expect(moveDialog).toContain(
      "projects.filter(project => project.id !== currentProjectId)"
    );
  });

  it("enforces both source and destination project access on the server", () => {
    expect(moveProcedure).toContain("moveToProject: protectedProcedure");
    expect(moveProcedure).toContain(
      "await assertProjectAccess(db, task.projectId, ctx.user)"
    );
    expect(moveProcedure).toContain(
      "await assertProjectAccess(db, input.destinationProjectId, ctx.user)"
    );
    expect(
      moveProcedure.indexOf(
        "await assertProjectAccess(db, task.projectId, ctx.user)"
      )
    ).toBeLessThan(
      moveProcedure.indexOf(
        "await assertProjectAccess(db, input.destinationProjectId, ctx.user)"
      )
    );
    expect(moveProcedure).toContain("destinationProject.archivedAt");
  });

  it("moves a top-level To-Do and its complete sub-To-Do family into the destination main list", () => {
    expect(moveProcedure).toContain("Move the parent To-Do");
    expect(moveProcedure).toContain(
      "collectTaskFamilyIds(sourceTasks, task.id)"
    );
    expect(moveProcedure).toContain(
      ".set({ projectId: input.destinationProjectId, sectionId: null })"
    );
    expect(moveProcedure).toContain("Moved To-Do");
  });

  it("exposes the access-filtered move control from Project and My To-Dos workspaces", () => {
    expect(projectDetail).toContain(
      "trpc.pm.projects.moveDestinations.useQuery()"
    );
    expect(projectDetail).toContain("trpc.pm.tasks.moveToProject.useMutation");
    expect(projectDetail).toContain("<ProjectTodoMoveProjectDialog");
    expect(myTodos).toContain("trpc.pm.projects.moveDestinations.useQuery()");
    expect(myTodos).toContain("trpc.pm.tasks.moveToProject.useMutation");
    expect(myTodos).toContain("<ProjectTodoMoveProjectDialog");
  });
});
