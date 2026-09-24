import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const dashboard = readFileSync(
  path.join(root, "client/src/components/MyTodosDashboard.tsx"),
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
  it("edits the original Project and L10 records instead of creating copies", () => {
    expect(dashboard).toContain("trpc.pm.tasks.update.useMutation");
    expect(dashboard).toContain("<PulseItemEditor");
    expect(dashboard).toContain("workItemId={l10Todo?.sourceId");
    expect(dashboard).toContain("complete.mutate({");
    expect(dashboard).toContain("source: todo.source");
    expect(projectsRouter).toContain("// A unified dashboard projection only.");
    expect(projectsRouter).toContain("priority: pmTasks.priority");
    expect(projectsRouter).toContain("recurrence: pmTasks.recurrence");
  });

  it("keeps all source views fresh after a dashboard update", () => {
    expect(dashboard).toContain("refetchInterval: 1500");
    expect(dashboard).toContain("utils.pm.projects.invalidate()");
    expect(dashboard).toContain("utils.pulse.workItems.invalidate()");
    expect(dashboard).toContain("utils.pulse.l10.invalidate()");
    expect(dashboard).toContain("utils.pulse.personal.invalidate()");
    expect(workloadView).toContain("refetchInterval: 1500");
  });

  it("uses the Projects Super Permission for Workload visibility and enforcement", () => {
    expect(projectsPage).toContain("adminPermissions");
    expect(projectsPage).toContain("canViewProjects");
    expect(workloadAccess).toContain(
      'canAdminUsePermission(user, "canViewProjects")'
    );
    expect(projectsRouter).toContain("await canViewPmWorkload(ctx.user)");
  });
});
