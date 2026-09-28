import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  normalizePredecessorMilestoneIds,
  wouldCreateMilestoneDependencyCycle,
} from "./projectMilestoneDependencies";

const root = process.cwd();
const router = readFileSync(path.join(root, "server/routers/pm.ts"), "utf8");
const detail = readFileSync(path.join(root, "client/src/pages/ProjectDetailPage.tsx"), "utf8");
const dialog = readFileSync(path.join(root, "client/src/components/ProjectMilestoneDependencyDialog.tsx"), "utf8");
const gantt = readFileSync(path.join(root, "client/src/components/ProjectGanttView.tsx"), "utf8");

describe("project milestone dependencies", () => {
  it("deduplicates selected milestone blockers", () => {
    expect(normalizePredecessorMilestoneIds([7, 9, 7])).toEqual([7, 9]);
  });

  it("rejects direct, indirect, and self-referential cycles", () => {
    const links = [
      { milestoneId: 2, predecessorMilestoneId: 1 },
      { milestoneId: 3, predecessorMilestoneId: 2 },
    ];
    expect(wouldCreateMilestoneDependencyCycle(1, [3], links)).toBe(true);
    expect(wouldCreateMilestoneDependencyCycle(1, [1], links)).toBe(true);
    expect(wouldCreateMilestoneDependencyCycle(4, [3], links)).toBe(false);
  });

  it("supports cross-Rock choices and protects the dependency graph", () => {
    expect(router).toContain("dependencyOptions: protectedProcedure");
    expect(router).toContain("setDependencies: protectedProcedure");
    expect(router).toContain("Only Rock milestones can have milestone dependencies");
    expect(router).toContain("circular chain of milestones");
    expect(router).toContain("milestone_dependencies_updated");
    expect(detail).toContain("setMilestoneDependencies");
    expect(dialog).toContain("Dependencies may cross Rocks");
  });

  it("renders a diamond and an explicit Depends on label in Gantt View", () => {
    expect(gantt).toContain("Milestone dependency");
    expect(gantt).toContain("rotate-45");
    expect(gantt).toContain("Depends on");
    expect(gantt).toContain("predecessor.projectTitle");
  });
});
