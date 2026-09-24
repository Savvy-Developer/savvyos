import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./permissions", () => ({
  canAdminUsePermission: vi.fn(),
}));

import { canAdminUsePermission } from "./permissions";
import { canViewPmWorkload } from "./pmAccess";
import { pmRouter } from "./pm";

describe("Projects Workload access", () => {
  beforeEach(() => {
    vi.mocked(canAdminUsePermission).mockReset();
  });

  it("uses the Projects Super Permission rather than a hard-coded email list", async () => {
    vi.mocked(canAdminUsePermission).mockResolvedValue(true);

    await expect(
      canViewPmWorkload({
        id: 42,
        role: "admin",
        email: "newly-granted@savvy.realty",
      })
    ).resolves.toBe(true);
    expect(canAdminUsePermission).toHaveBeenCalledWith(
      expect.objectContaining({ id: 42, role: "admin" }),
      "canViewProjects"
    );
  });

  it("hides Workload from an administrator without Projects access", async () => {
    vi.mocked(canAdminUsePermission).mockResolvedValue(false);
    await expect(
      canViewPmWorkload({
        id: 99,
        role: "admin",
        email: "restricted@savvy.realty",
      })
    ).resolves.toBe(false);
  });

  it("rejects a restricted Workload request at the server boundary", async () => {
    vi.mocked(canAdminUsePermission).mockResolvedValue(false);
    const caller = pmRouter.createCaller({
      user: { id: 999_999, role: "admin", email: "other@savvy.realty" },
    } as any);
    await expect(caller.workload.get()).rejects.toThrow(
      "The Projects Workload tab requires Projects access in Super Permissions."
    );
  });

  it("allows a Super Permissions Projects grantee at the server boundary", async () => {
    vi.mocked(canAdminUsePermission).mockResolvedValue(true);
    const caller = pmRouter.createCaller({
      user: { id: 999_998, role: "admin", email: "granted@savvy.realty" },
    } as any);
    await expect(caller.workload.get()).resolves.toEqual({
      weeks: [],
      members: [],
    });
  });
});
