import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const projectDetail = readFileSync(
  path.join(root, "client/src/pages/ProjectDetailPage.tsx"),
  "utf8"
);
const router = readFileSync(path.join(root, "server/routers/pm.ts"), "utf8");

describe("guided Project-to-Rock conversion", () => {
  it("collects dates for existing sections in the conversion form", () => {
    expect(projectDetail).toContain("ProjectRockConversionMilestones");
    expect(projectDetail).toContain("Existing milestones *");
    expect(projectDetail).toContain("existingSectionMilestones");
    expect(projectDetail).toContain(
      "Set a due date for every existing milestone before saving this Rock"
    );
  });

  it("persists submitted existing-section dates within the Rock conversion transaction", () => {
    expect(router).toContain("existingSectionMilestoneSchema");
    expect(router).toContain(
      "existingSectionMilestones: z.array(existingSectionMilestoneSchema)"
    );
    expect(router).toContain("const datedExistingSections");
    expect(router).toContain(
      "for (const section of existingSectionMilestones)"
    );
    expect(router).toContain(
      "transaction.update(pmTodoSections).set({ dueDate: section.dueDate })"
    );
  });
});
