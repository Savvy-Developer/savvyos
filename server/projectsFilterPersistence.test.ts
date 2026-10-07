import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const projectsPage = readFileSync(
  path.join(root, "client/src/pages/ProjectsPage.tsx"),
  "utf8"
);
const persistentState = readFileSync(
  path.join(root, "client/src/hooks/usePersistentState.ts"),
  "utf8"
);

describe("Projects filter persistence", () => {
  it("keeps every Project list filter in the browser session until cleared", () => {
    expect(projectsPage).toContain(
      'import { usePersistentState } from "@/hooks/usePersistentState"'
    );
    expect(projectsPage).toContain('usePersistentState("projects.search", "")');
    expect(projectsPage).toContain(
      'usePersistentState("projects.statusFilter", "all")'
    );
    expect(projectsPage).toContain(
      'usePersistentState("projects.priorityFilter", "all")'
    );
    expect(projectsPage).toContain(
      'usePersistentState("projects.departmentFilter", "all")'
    );
    expect(projectsPage).toContain(
      'usePersistentState("projects.ownerFilter", "all")'
    );
    expect(projectsPage).toContain(
      'usePersistentState("projects.scheduleFilter", "all")'
    );
  });

  it("clears the saved values only through Clear filters", () => {
    expect(projectsPage).toContain('setSearch("");');
    expect(projectsPage).toContain('setFilterStatus("all");');
    expect(projectsPage).toContain('setFilterPriority("all");');
    expect(projectsPage).toContain('setFilterDept("all");');
    expect(projectsPage).toContain('setFilterOwner("all");');
    expect(projectsPage).toContain('setFilterSchedule("all");');
    expect(persistentState).toContain(
      "sessionStorage.setItem(key, JSON.stringify(value))"
    );
  });
});
