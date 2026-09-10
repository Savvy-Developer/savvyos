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
      "disabled={!sectionTitle.trim() || createSection.isPending}"
    );
    expect(projectRouter).toContain("title: z.string().trim().min(1).max(128)");
  });
});
