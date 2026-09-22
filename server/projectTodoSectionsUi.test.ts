import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const projectDetailPage = readFileSync(
  path.join(root, "client/src/pages/ProjectDetailPage.tsx"),
  "utf8"
);
const sectionComponent = readFileSync(
  path.join(root, "client/src/components/ProjectTodoSection.tsx"),
  "utf8"
);
const todoBoard = readFileSync(
  path.join(root, "client/src/components/ProjectTodoBoard.tsx"),
  "utf8"
);
const projectRouter = readFileSync(
  path.join(root, "server/routers/pm.ts"),
  "utf8"
);
const serverEntry = readFileSync(
  path.join(root, "server/_core/index.ts"),
  "utf8"
);
const todoSchemaGuard = readFileSync(
  path.join(root, "server/projectTodoWorkflowSchema.ts"),
  "utf8"
);

describe("project todo section UI", () => {
  it("renders standalone todos and titled sections in one draggable root order", () => {
    expect(projectDetailPage).toContain("<ProjectTodoBoard");
    expect(todoBoard).toContain("buildProjectTodoLayout");
    expect(todoBoard).toContain("DndContext");
    expect(todoBoard).toContain("useSortable");
    expect(todoBoard).toContain('type: "task"');
    expect(todoBoard).toContain('type: "section"');
    expect(projectDetailPage).not.toMatch(/unsectioned/i);
    expect(sectionComponent).not.toMatch(/unsectioned/i);
  });

  it("provides drag handles for section rows and top-level todos", () => {
    expect(sectionComponent).toContain("Drag ${section.title} section");
    expect(sectionComponent).toContain("dragHandle.setActivatorNodeRef");
    expect(projectDetailPage).toContain("Drag ${task.title}");
    expect(projectDetailPage).toContain("dragHandle.setActivatorNodeRef");
    expect(sectionComponent).not.toContain("Move section higher");
    expect(sectionComponent).not.toContain("Move section lower");
  });

  it("persists section order, todo order, and section membership together", () => {
    expect(projectDetailPage).toContain("trpc.pm.tasks.saveLayout.useMutation");
    expect(projectDetailPage).toContain("saveTodoLayout.mutateAsync");
    expect(projectRouter).toContain("saveLayout: protectedProcedure");
    expect(projectRouter).toContain("normalizeProjectTodoLayout");
    expect(projectRouter).toContain("collectTaskFamilyIds");
  });

  it("requires a non-empty title for every created section", () => {
    expect(projectDetailPage).toContain("Section Title *");
    expect(projectDetailPage).toContain('id="project-todo-section-title"');
    expect(projectDetailPage).toContain(
      "disabled={!sectionTitle.trim() || (project.isRock && !sectionDueDate) || createSection.isPending}"
    );
    expect(projectRouter).toContain("title: z.string().trim().min(1).max(128)");
  });

  it("keeps empty expanded sections compact", () => {
    expect(sectionComponent).toContain("displayCount > 0 || acceptingTask ? (");
    expect(sectionComponent).toContain(
      'className="px-3 py-2 text-xs text-muted-foreground"'
    );
    expect(sectionComponent).not.toContain("px-2 py-5 text-center");
  });

  it("clears regular due dates immediately without a stale-read overwrite", () => {
    expect(projectDetailPage).toContain(
      'updateProjectOverview.mutate({ id: projectId, dueDate: null })'
    );
    expect(projectDetailPage).toContain(
      'utils.pm.projects.getById.cancel({ id: projectId })'
    );
    expect(projectDetailPage).toContain(
      'utils.pm.projects.getById.setData({ id: projectId }, current => current ? { ...current, dueDate: null } : current)'
    );
    expect(projectDetailPage).toContain(
      'utils.pm.projects.getById.invalidate({ id: projectId })'
    );
    expect(sectionComponent).toContain(
      'onUpdate({ title: section.title, dueDate: null })'
    );
  });

  it("renders a project status icon only through the selected option", () => {
    expect(projectDetailPage).toContain(
      '<SelectTrigger aria-label="Project status"'
    );
    expect(projectDetailPage).toContain(
      'disabled={updateProjectOverview.isPending}>\n                    <SelectValue />\n                  </SelectTrigger>'
    );
    expect(projectDetailPage).not.toContain(
      '<span className="flex items-center gap-1.5">{statusCfg.icon}<SelectValue /></span>'
    );
  });

  it("allows a dated existing section to satisfy Rock conversion milestones", () => {
    expect(projectDetailPage).toContain(
      'hasDatedProjectRockMilestone(project.todoSections ?? [], rockMilestones)'
    );
    expect(projectDetailPage).toContain(
      'prepareProjectRockMilestones(editForm.rockMilestones ?? [])'
    );
    expect(projectRouter).toContain(
      'hasDatedProjectRockMilestone(existingSections, rockMilestones)'
    );
  });

  it("shows Pulse-style project todo statuses and repeating schedules", () => {
    expect(projectDetailPage).toContain('aria-label="To-Do status"');
    expect(projectDetailPage).toContain("TODO_STATUS_CONFIG");
    expect(projectDetailPage).toContain("Repeats");
    expect(projectDetailPage).toContain("RECURRENCE_LABELS");
    expect(projectRouter).toContain("recurrence: z.enum(TODO_RECURRENCES)");
    expect(projectRouter).toContain('status: z.enum(["not_started", "in_progress", "blocked", "completed"])');
    expect(projectRouter).toContain("completionUpdate");
  });

  it("makes the production schema ready before serving the new workflow", () => {
    expect(serverEntry).toContain("ensureProjectTodoWorkflowSchema");
    expect(serverEntry).toContain("await ensureProjectTodoWorkflowSchema()");
    expect(todoSchemaGuard).toContain("ALTER TABLE `pm_tasks` ADD COLUMN `status`");
    expect(todoSchemaGuard).toContain("ALTER TABLE `pm_tasks` ADD COLUMN `recurrence`");
    expect(todoSchemaGuard).toContain("pm_tasks_project_status_idx");
  });
});
