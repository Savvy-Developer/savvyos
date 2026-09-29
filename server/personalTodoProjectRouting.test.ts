import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const router = readFileSync(path.join(root, "server/routers/pm.ts"), "utf8");
const personalTodos = readFileSync(
  path.join(root, "client/src/pages/PersonalTodosPage.tsx"),
  "utf8"
);
const routeDialog = readFileSync(
  path.join(root, "client/src/components/PersonalTodoRouteProjectDialog.tsx"),
  "utf8"
);

const routeProcedure = router.slice(
  router.indexOf("routeToProject: protectedProcedure"),
  router.indexOf(
    "delete: protectedProcedure",
    router.indexOf("routeToProject: protectedProcedure")
  )
);

describe("Personal To-Do Project routing", () => {
  it("only allows the personal To-Do owner to route an open record", () => {
    expect(routeProcedure).toContain("routeToProject: protectedProcedure");
    expect(routeProcedure).toContain("todo.userId !== ctx.user.id");
    expect(routeProcedure).toContain(
      "Personal To-Dos can only be moved by their owner."
    );
    expect(routeProcedure).toContain("if (todo.completed)");
  });

  it("enforces destination Project access and availability on the server", () => {
    expect(routeProcedure).toContain(
      "await assertProjectAccess(db, input.destinationProjectId, ctx.user)"
    );
    expect(routeProcedure).toContain("destinationProject.archivedAt");
    expect(routeProcedure).toContain("The destination Project is unavailable.");
  });

  it("moves the personal record atomically into a Project To-Do", () => {
    expect(routeProcedure).toContain("await db.transaction");
    expect(routeProcedure).toContain("transaction.insert(pmTasks).values");
    expect(routeProcedure).toContain("ownerId: todo.userId");
    expect(routeProcedure).toContain("recurrence: todo.recurrence");
    expect(routeProcedure).toContain("notes: todo.notes");
    expect(routeProcedure).toContain(
      "transaction\n            .delete(pmPersonalTodos)"
    );
    expect(routeProcedure).toContain("Moved personal To-Do");
  });

  it("uses Project-style expandable task cards and an access-filtered route control", () => {
    expect(personalTodos).toContain(
      "overflow-hidden rounded-md border border-border bg-card"
    );
    expect(personalTodos).toContain("Details");
    expect(personalTodos).toContain("Edit To-Do");
    expect(personalTodos).toContain(
      "trpc.pm.projects.moveDestinations.useQuery"
    );
    expect(personalTodos).toContain(
      "trpc.pm.personalTodos.routeToProject.useMutation"
    );
    expect(personalTodos).toContain("<PersonalTodoRouteProjectDialog");
    expect(routeDialog).toContain("Move Personal To-Do to a Project");
    expect(routeDialog).toContain("Project you can access");
  });
});
