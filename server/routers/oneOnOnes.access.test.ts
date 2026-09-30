import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({
  getDb: vi.fn(),
  logActivity: vi.fn(),
}));
vi.mock("./permissions", () => ({
  canAdminUsePermission: vi.fn(),
}));

import { getDb } from "../db";
import { canAdminUsePermission } from "./permissions";
import { oneOnOnesRouter, requireOneOnOneAccess } from "./oneOnOnes";

const admin = { id: 410, role: "admin", email: "delegated-admin@savvy.realty" };

describe("HR 1:1 Meetings access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires the dedicated HR 1:1 permission for an administrator", async () => {
    vi.mocked(canAdminUsePermission).mockResolvedValue(false);

    await expect(requireOneOnOneAccess(admin)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(canAdminUsePermission).toHaveBeenCalledWith(admin, "canViewOneOnOneMeetings");
  });

  it("does not allow a non-admin to access the HR 1:1 router", async () => {
    await expect(requireOneOnOneAccess({ id: 411, role: "agent", email: "agent@savvy.realty" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(canAdminUsePermission).not.toHaveBeenCalled();
  });

  it("allows a permitted administrator through the dashboard boundary", async () => {
    vi.mocked(canAdminUsePermission).mockResolvedValue(true);
    vi.mocked(getDb).mockResolvedValue(null as any);
    const caller = oneOnOnesRouter.createCaller({ user: admin } as any);

    await expect(caller.dashboard()).resolves.toEqual({
      rows: [],
      counts: { upcoming: 0, dueSoon: 0, overdue: 0, noSchedule: 0 },
    });
  });
});
