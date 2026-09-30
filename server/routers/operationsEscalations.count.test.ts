import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({ getDb: vi.fn(), logActivity: vi.fn() }));
vi.mock("./permissions", () => ({ canAdminUsePermission: vi.fn() }));

import { getDb } from "../db";
import { canAdminUsePermission } from "./permissions";
import { operationsEscalationsRouter } from "./operationsEscalations";

const admin = { id: 410, role: "admin", email: "admin@example.com" };

describe("Operations Escalations sidebar count", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns only the database's open escalation count for an authorized admin", async () => {
    vi.mocked(canAdminUsePermission).mockResolvedValue(true);
    const where = vi.fn().mockResolvedValue([{ count: "3" }]);
    const from = vi.fn().mockReturnValue({ where });
    vi.mocked(getDb).mockResolvedValue({ select: vi.fn().mockReturnValue({ from }) } as any);

    await expect(operationsEscalationsRouter.createCaller({ user: admin } as any).openCount()).resolves.toEqual({ count: 3 });
    expect(canAdminUsePermission).toHaveBeenCalledWith(admin, "canViewOperationsEscalations");
    expect(where).toHaveBeenCalledOnce();
  });

  it("hides the badge when no database is available", async () => {
    vi.mocked(canAdminUsePermission).mockResolvedValue(true);
    vi.mocked(getDb).mockResolvedValue(null as any);

    await expect(operationsEscalationsRouter.createCaller({ user: admin } as any).openCount()).resolves.toEqual({ count: 0 });
  });

  it("rejects admins without the Operations Escalations permission before accessing data", async () => {
    vi.mocked(canAdminUsePermission).mockResolvedValue(false);

    await expect(operationsEscalationsRouter.createCaller({ user: admin } as any).openCount()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(getDb).not.toHaveBeenCalled();
  });

  it("rejects non-admins before checking permissions or accessing data", async () => {
    await expect(operationsEscalationsRouter.createCaller({ user: { ...admin, role: "agent" } } as any).openCount()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(canAdminUsePermission).not.toHaveBeenCalled();
    expect(getDb).not.toHaveBeenCalled();
  });
});
