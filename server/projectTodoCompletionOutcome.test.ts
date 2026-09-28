import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const projectRouter = readFileSync(
  path.join(root, "server/routers/pm.ts"),
  "utf8"
);
const projectDetail = readFileSync(
  path.join(root, "client/src/pages/ProjectDetailPage.tsx"),
  "utf8"
);
const myTodos = readFileSync(
  path.join(root, "client/src/components/MyTodosDashboard.tsx"),
  "utf8"
);
const completionDialog = readFileSync(
  path.join(root, "client/src/components/ProjectTodoCompletionDialog.tsx"),
  "utf8"
);

describe("Project To-Do completion outcomes", () => {
  it("requires an outcome on every Project completion mutation", () => {
    expect(projectRouter).toContain(
      "completionNote: z.string().trim().min(1).max(2000).optional()"
    );
    expect(projectRouter).toContain(
      "Describe what was completed before closing this Project To-Do."
    );
    expect(projectRouter).toContain("input.completed && !task.completed");
    expect(projectRouter).toContain(
      'input.status === "completed" && task.status !== "completed"'
    );
  });

  it("retains the outcome in the Project activity history", () => {
    expect(projectRouter).toContain("Outcome: ${completionNote!.trim()}");
    expect(projectRouter).toContain("Outcome: ${input.completionNote.trim()}");
    expect(projectDetail).toContain("entry.detail");
  });

  it("prompts before completing from Project and My To-Dos workspaces", () => {
    expect(projectDetail).toContain("ProjectTodoCompletionDialog");
    expect(projectDetail).toContain("requestToggle");
    expect(projectDetail).toContain("requestStatusUpdate");
    expect(myTodos).toContain("ProjectTodoCompletionDialog");
    expect(myTodos).toContain("requestToggle");
    expect(myTodos).toContain("completionNote");
    expect(completionDialog).toContain("What was completed?");
    expect(completionDialog).toContain("completionNote.trim()");
  });
});
