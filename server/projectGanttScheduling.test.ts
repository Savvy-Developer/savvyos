import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const schema = readFileSync(path.join(root, "drizzle/schema.ts"), "utf8");
const migration = readFileSync(
  path.join(root, "drizzle/20260927_project_task_start_dates.sql"),
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

const tasksRouter = router.slice(
  router.indexOf("tasks: router({"),
  router.indexOf("personalTodos: router({")
);

describe("Project Gantt scheduling", () => {
  it("persists optional start dates and rejects inverted schedules", () => {
    expect(schema).toContain('startDate: timestamp("startDate")');
    expect(migration).toContain("ADD COLUMN `startDate` timestamp NULL");
    expect(schemaGuard).toContain(
      'schemaColumnExists(connection, "startDate")'
    );
    expect(schemaGuard).toContain("ADD COLUMN `startDate` timestamp NULL");
    expect(tasksRouter).toContain("startDate: z.date().nullable().optional()");
    expect(tasksRouter).toContain(
      "The start date cannot be after the due date."
    );
    expect(tasksRouter).toContain("startDate: pmTasks.startDate");
  });

  it("makes schedule dates available in normal Project To-Do workflows", () => {
    expect(projectDetail).toContain("Start Date");
    expect(projectDetail).toContain("Start date");
    expect(projectDetail).toContain("taskForm.startDate");
    expect(projectDetail).toContain("editForm.startDate");
    expect(projectDetail).toContain("startDate: parent?.startDate");
  });

  it("renders an actionable, risk-aware Gantt schedule", () => {
    expect(gantt).toContain("startDate ?? task.createdAt");
    expect(gantt).toContain("Show completed");
    expect(gantt).toMatch(/not yet on the\s+schedule/);
    expect(gantt).toMatch(/Drag a bar to\s+move its schedule/);
    expect(gantt).toContain("finishTaskDrag");
    expect(gantt).toContain("onUpdateTask(task.id");
    expect(gantt).toContain("Schedule To-Do");
    expect(gantt).toContain("TASK_STATUS_META");
    expect(gantt).toContain("isTaskOverdue");
    expect(gantt).toContain("Main To-Dos");
  });
});
