import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const router = readFileSync(path.join(root, "server/routers/pm.ts"), "utf8");
const projectsPage = readFileSync(
  path.join(root, "client/src/pages/ProjectsPage.tsx"),
  "utf8"
);
const sortList = readFileSync(
  path.join(root, "client/src/components/ProjectSortList.tsx"),
  "utf8"
);

const projectsListProcedure = router.slice(
  router.indexOf("list: protectedProcedure"),
  router.indexOf("moveDestinations: protectedProcedure")
);

describe("Project list open To-Do counts", () => {
  it("returns a dedicated count of incomplete Project To-Dos", () => {
    expect(projectsListProcedure).toContain(
      "open: sql<number>`sum(case when ${pmTasks.completed} = 0 then 1 else 0 end)`"
    );
    expect(projectsListProcedure).toContain(
      "taskOpen: Number(taskCountMap.get(p.id)?.open ?? 0)"
    );
  });

  it("shows open To-Do counts in standard and arrange Project lists", () => {
    expect(projectsPage).toContain("taskOpen: number;");
    expect(projectsPage).toContain("{project.taskOpen} open");
    expect(projectsPage).toContain("open To-Do");
    expect(sortList).toContain("taskOpen: number;");
    expect(sortList).toContain("{project.taskOpen} open");
    expect(sortList).toContain("open To-Do");
  });
});
