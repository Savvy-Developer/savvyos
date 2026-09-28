import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getProjectWeeklyUpdatePeriod,
  isProjectWeeklyUpdateLate,
} from "./projectWeeklyUpdateCadence";
import { buildProjectWeeklyUpdateSnapshot } from "./projectWeeklyUpdateSnapshot";

vi.mock("./routers/permissions", () => ({
  canAdminUsePermission: vi.fn(),
}));

import { canAdminUsePermission } from "./routers/permissions";
import { canViewPmWeeklyUpdateHub } from "./routers/pmAccess";
import { pmRouter } from "./routers/pm";

const root = process.cwd();
const router = readFileSync(path.join(root, "server/routers/pm.ts"), "utf8");
const projectPage = readFileSync(
  path.join(root, "client/src/pages/ProjectDetailPage.tsx"),
  "utf8"
);
const weeklyForm = readFileSync(
  path.join(root, "client/src/components/ProjectWeeklyUpdateForm.tsx"),
  "utf8"
);
const hub = readFileSync(
  path.join(root, "client/src/components/ProjectsWeeklyUpdatesHub.tsx"),
  "utf8"
);
const schemaGuard = readFileSync(
  path.join(root, "server/projectWeeklyUpdateSchema.ts"),
  "utf8"
);
const entry = readFileSync(path.join(root, "server/_core/index.ts"), "utf8");

describe("Project Weekly Update Hub", () => {
  beforeEach(() => vi.mocked(canAdminUsePermission).mockReset());

  it("uses Monday reporting weeks and marks updates after Thursday 6 PM Eastern as late", () => {
    const period = getProjectWeeklyUpdatePeriod(
      new Date("2026-09-28T16:00:00.000Z")
    );
    expect(period.weekOf).toBe("2026-09-28");
    expect(period.isLate).toBe(false);
    expect(
      isProjectWeeklyUpdateLate(
        new Date("2026-10-01T22:01:00.000Z"),
        period.deadline
      )
    ).toBe(true);
  });

  it("snapshots automatic work context without a manually entered percentage", () => {
    const snapshot = buildProjectWeeklyUpdateSnapshot(
      [
        { completed: true, dueDate: new Date("2026-10-02"), sectionId: 10 },
        { completed: false, dueDate: new Date("2026-09-20"), sectionId: 10 },
        { completed: true, dueDate: null, sectionId: 11 },
      ],
      [
        { id: 10, title: "Launch", dueDate: new Date("2026-10-02") },
        { id: 11, title: "Train", dueDate: new Date("2026-10-09") },
      ],
      new Date("2026-10-31"),
      new Date("2026-09-28")
    );
    expect(snapshot).toMatchObject({
      taskTotal: 3,
      taskCompleted: 2,
      milestoneTotal: 2,
      milestoneCompleted: 1,
      overdueTaskCount: 1,
      nextMilestoneTitle: "Launch",
    });
  });

  it("requires both the named roster and Projects Super Permission for the Hub", async () => {
    vi.mocked(canAdminUsePermission).mockResolvedValue(true);
    await expect(
      canViewPmWeeklyUpdateHub({
        id: 1,
        role: "admin",
        email: "dyl@savvy.realty",
      })
    ).resolves.toBe(true);
    await expect(
      canViewPmWeeklyUpdateHub({
        id: 2,
        role: "admin",
        email: "other@savvy.realty",
      })
    ).resolves.toBe(false);
    vi.mocked(canAdminUsePermission).mockResolvedValue(false);
    await expect(
      canViewPmWeeklyUpdateHub({
        id: 3,
        role: "admin",
        email: "heart@savvy.realty",
      })
    ).resolves.toBe(false);
    expect(canAdminUsePermission).toHaveBeenCalledWith(
      expect.objectContaining({ email: "heart@savvy.realty" }),
      "canViewProjects"
    );
  });

  it("rejects a direct Hub request when either access gate is absent", async () => {
    vi.mocked(canAdminUsePermission).mockResolvedValue(false);
    const noPermission = pmRouter.createCaller({
      user: { id: 44, role: "admin", email: "dyl@savvy.realty" },
    } as any);
    await expect(noPermission.weeklyUpdates.hub()).rejects.toThrow(
      "Weekly Update Hub is restricted"
    );

    vi.mocked(canAdminUsePermission).mockResolvedValue(true);
    const notNamed = pmRouter.createCaller({
      user: { id: 45, role: "admin", email: "not-on-the-roster@savvy.realty" },
    } as any);
    await expect(notNamed.weeklyUpdates.hub()).rejects.toThrow(
      "Weekly Update Hub is restricted"
    );
  });

  it("keeps the Hub server-restricted and projects-only", () => {
    expect(router).toContain("hubAccess: protectedProcedure");
    expect(router).toContain("assertPmWeeklyUpdateHubAccess(ctx.user)");
    expect(router).toContain(
      "Only this Project's reporting owner can submit the weekly update."
    );
    expect(router).toContain("weekOf: period.weekOf");
    expect(schemaGuard).toContain("pm_weekly_updates_project_week_unique");
    expect(entry).toContain("await ensureProjectWeeklyUpdateSchema()");
  });

  it("uses a short owner workflow with automatic work context and no manual percent slider", () => {
    expect(projectPage).toContain("ProjectWeeklyUpdateForm");
    expect(weeklyForm).toContain("Current state *");
    expect(weeklyForm).toContain("Next week’s priority *");
    expect(weeklyForm).toContain("Add a decision / help ask");
    expect(weeklyForm).not.toContain("Slider");
    expect(weeklyForm).not.toContain("Progress:");
    expect(hub).toContain("Weekly Update Hub");
    expect(hub).toContain("Mark reviewed");
    expect(hub).toContain("Open ask");
  });
});
