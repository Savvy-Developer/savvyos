import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  normalizePredecessorTaskIds,
  wouldCreateProjectTaskDependencyCycle,
} from "./projectTaskDependencies";

const root = process.cwd();
const schema = readFileSync(path.join(root, "drizzle/schema.ts"), "utf8");
const migration = readFileSync(
  path.join(root, "drizzle/20260927_project_task_dependencies.sql"),
  "utf8"
);
const schemaGuard = readFileSync(
  path.join(root, "server/projectTodoWorkflowSchema.ts"),
  "utf8"
);
const router = readFileSync(path.join(root, "server/routers/pm.ts"), "utf8");
const gantt = readFileSync(
  path.join(root, "client/src/components/ProjectGanttView.tsx"),
  "utf8"
);
const projectDetail = readFileSync(
  path.join(root, "client/src/pages/ProjectDetailPage.tsx"),
  "utf8"
);
const dependencyDialog = readFileSync(
  path.join(root, "client/src/components/ProjectTodoDependencyDialog.tsx"),
  "utf8"
);

const dependencyProcedure = router.slice(
  router.indexOf("setDependencies: protectedProcedure"),
  router.indexOf("moveToProject: protectedProcedure")
);

describe("Project To-Do dependencies", () => {
  it("normalizes requested predecessor ids before validation", () => {
    expect(normalizePredecessorTaskIds([8, 8, 4, 0, -2])).toEqual([8, 4]);
  });

  it("rejects direct and indirect circular dependency chains", () => {
    const existingLinks = [
      { taskId: 2, predecessorTaskId: 1 },
      { taskId: 3, predecessorTaskId: 2 },
    ];

    expect(wouldCreateProjectTaskDependencyCycle(1, [3], existingLinks)).toBe(
      true
    );
    expect(wouldCreateProjectTaskDependencyCycle(4, [3], existingLinks)).toBe(
      false
    );
    expect(wouldCreateProjectTaskDependencyCycle(2, [2], existingLinks)).toBe(
      true
    );
  });

  it("persists a same-project dependency relationship with database protection", () => {
    expect(schema).toContain("export const pmTaskDependencies = mysqlTable(");
    expect(schema).toContain('"pm_task_dependencies"');
    expect(schema).toContain("pm_task_dependencies_task_predecessor_unique");
    expect(migration).toContain("CREATE TABLE `pm_task_dependencies`");
    expect(migration).toContain("ON DELETE CASCADE");
    expect(schemaGuard).toContain(
      'schemaTableExists(connection, "pm_task_dependencies")'
    );
  });

  it("enforces access, project scope, and acyclic server-side writes", () => {
    expect(dependencyProcedure).toContain(
      "setDependencies: protectedProcedure"
    );
    expect(dependencyProcedure).toContain(
      "await assertProjectAccess(db, task.projectId, ctx.user)"
    );
    expect(dependencyProcedure).toContain(
      "predecessor.projectId !== task.projectId"
    );
    expect(dependencyProcedure).toContain(
      "wouldCreateProjectTaskDependencyCycle"
    );
    expect(dependencyProcedure).toContain(
      "A To-Do cannot be blocked by itself."
    );
    expect(dependencyProcedure).toContain("circular chain of To-Dos");
    expect(dependencyProcedure).toContain("task_dependencies_updated");
  });

  it("makes blockers actionable in List View and visible in Gantt View", () => {
    expect(projectDetail).toContain("setTaskDependencies");
    expect(projectDetail).toContain("<ProjectTodoDependencyDialog");
    expect(projectDetail).toContain("Blocked by");
    expect(dependencyDialog).toContain("Dependencies stay within this project");
    expect(gantt).toContain("dependencyPaths");
    expect(gantt).toContain("gantt-dependency-arrow");
    expect(gantt).toContain("isDependencyAtRisk");
    expect(gantt).toContain(
      "Dependency arrows show work that must finish first"
    );
  });
});
