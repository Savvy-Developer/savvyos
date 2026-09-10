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
const projectRouter = readFileSync(
  path.join(root, "server/routers/pm.ts"),
  "utf8"
);

describe("project todo section UI", () => {
  it("renders todos without a section directly in the main list", () => {
    expect(projectDetailPage).toContain(
      "const unassignedTodos = todosForSection(null);"
    );
    expect(projectDetailPage).toContain(
      "{openUnassignedTodos.map(renderTodo)}"
    );
    expect(projectDetailPage).not.toContain(
      "<ProjectTodoSection section={null}"
    );
    expect(projectDetailPage).not.toMatch(/unsectioned/i);
    expect(sectionComponent).not.toMatch(/unsectioned/i);
  });

  it("shows only created titled sections as section containers", () => {
    expect(sectionComponent).toContain(
      "section: { id: number; title: string };"
    );
    expect(projectDetailPage).toContain("Section Title *");
    expect(projectDetailPage).toContain('id="project-todo-section-title"');
    expect(projectDetailPage).toContain(
      "disabled={!sectionTitle.trim() || createSection.isPending}"
    );
    expect(projectRouter).toContain("title: z.string().trim().min(1).max(128)");
  });

  it("offers optional assignment only when titled sections exist", () => {
    expect(projectDetailPage).toContain(
      "!parentTodo && todoSections.length > 0"
    );
    expect(projectDetailPage).toContain("Section (optional)");
    expect(projectDetailPage).toContain(
      "<SelectItem value={NO_SECTION_VALUE}>No section</SelectItem>"
    );
  });
});
