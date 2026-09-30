import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const dashboard = readFileSync(
  path.join(root, "client/src/components/MyTodosDashboard.tsx"),
  "utf8"
);
const dueDateControl = readFileSync(
  path.join(root, "client/src/components/ProjectTodoDueDateControl.tsx"),
  "utf8"
);
const projectsPage = readFileSync(
  path.join(root, "client/src/pages/ProjectsPage.tsx"),
  "utf8"
);
const workloadView = readFileSync(
  path.join(root, "client/src/components/ProjectsWorkloadView.tsx"),
  "utf8"
);
const projectsRouter = readFileSync(
  path.join(root, "server/routers/pm.ts"),
  "utf8"
);
const workloadAccess = readFileSync(
  path.join(root, "server/routers/pmAccess.ts"),
  "utf8"
);

describe("actionable My To-Dos dashboard", () => {
  it("works the original Project and L10 records without creating copies", () => {
    expect(dashboard).toContain("trpc.pm.tasks.update.useMutation");
    expect(dashboard).toContain("trpc.pm.tasks.toggleComplete.useMutation");
    expect(dashboard).toContain("<PulseInlineItemRow");
    expect(dashboard).toContain("trpc.pm.tasks.getComments.useQuery");
    expect(dashboard).toContain("trpc.pm.tasks.addComment.useMutation");
    expect(dashboard).toContain("trpc.pm.tasks.deleteComment.useMutation");
    expect(projectsRouter).toContain("// A unified dashboard projection only.");
    expect(projectsRouter).toContain("priority: pmTasks.priority");
    expect(projectsRouter).toContain("recurrence: pmTasks.recurrence");
    expect(projectsRouter).toContain("description: pulseWorkItems.description");
    expect(projectsRouter).toContain("commentCount: sql<number>");
  });

  it("uses a compact expandable workspace instead of padded edit dialogs", () => {
    expect(dashboard).toContain('className="mb-4 overflow-hidden rounded-md');
    expect(dashboard).toContain('className="space-y-1.5 p-1.5"');
    expect(dashboard).toContain("Edit Project To-Do");
    expect(dashboard).toContain("Project To-Do assignee");
    expect(dashboard).toContain("Comments");
  });

  it("uses a compact month-day picker to preserve room for Project to-do titles", () => {
    expect(dashboard).toContain("w-[7rem] shrink-0");
    expect(dashboard).toContain("w-[5.5rem] shrink-0");
    expect(dashboard).toContain("<ProjectTodoDueDateControl");
    expect(dueDateControl).toContain("Choose Project To-Do due date");
    expect(dueDateControl).toContain("Clear due date");
    expect(dueDateControl).not.toContain('type="date"');
  });

  it("keeps all source views fresh after a dashboard update", () => {
    expect(dashboard).toContain("refetchInterval: 1500");
    expect(dashboard).toContain("utils.pm.projects.invalidate()");
    expect(dashboard).toContain("utils.pulse.workItems.invalidate()");
    expect(dashboard).toContain("utils.pulse.l10.invalidate()");
    expect(dashboard).toContain("utils.pulse.personal.invalidate()");
    expect(workloadView).toContain("refetchInterval: 1500");
  });

  it("uses Projects access for Workload entry and roster filtering", () => {
    expect(projectsPage).toContain("adminPermissions");
    expect(projectsPage).toContain("canViewProjects");
    expect(workloadAccess).toContain(
      'canAdminUsePermission(user, "canViewProjects")'
    );
    expect(projectsRouter).toContain("await canViewPmWorkload(ctx.user)");
    expect(projectsRouter).toContain("isPmWorkloadRosterMember");
    expect(projectsRouter).toContain("projectAccessUserIds");
    expect(projectsRouter).toContain("pmProjects.ownerId");
    expect(projectsRouter).toContain("pmProjectCollaborators.userId");
    expect(projectsRouter).toContain("pmTasks.ownerId");
  });
});
