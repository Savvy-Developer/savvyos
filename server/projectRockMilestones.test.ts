import { describe, expect, it } from "vitest";
import {
  hasDatedProjectRockMilestone,
  prepareProjectRockMilestones,
} from "@shared/projectRockMilestones";

describe("project Rock milestone validation", () => {
  it("does not treat an untouched placeholder row as an incomplete milestone", () => {
    const result = prepareProjectRockMilestones([{ title: "", dueDate: "" }]);

    expect(result.milestones).toEqual([]);
    expect(result.hasIncompleteMilestone).toBe(false);
  });

  it("preserves partially completed rows so they are rejected", () => {
    const result = prepareProjectRockMilestones([{ title: "Launch plan", dueDate: "" }]);

    expect(result.milestones).toEqual([{ title: "Launch plan", dueDate: "" }]);
    expect(result.hasIncompleteMilestone).toBe(true);
  });

  it("accepts a conversion when an existing project section already has a due date", () => {
    const result = prepareProjectRockMilestones([{ title: "", dueDate: "" }]);

    expect(hasDatedProjectRockMilestone([{ dueDate: new Date("2026-12-31") }], result.milestones)).toBe(true);
    expect(result.hasIncompleteMilestone).toBe(false);
  });

  it("accepts a completed new milestone when there are no existing sections", () => {
    const result = prepareProjectRockMilestones([{ title: "Launch plan", dueDate: "2026-12-31" }]);

    expect(hasDatedProjectRockMilestone([], result.milestones)).toBe(true);
    expect(result.hasIncompleteMilestone).toBe(false);
  });
});
