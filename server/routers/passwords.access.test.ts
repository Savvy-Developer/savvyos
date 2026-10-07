import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "../db";
import { canAdminUsePermission } from "./permissions";
import { passwordsRouter } from "./passwords";

vi.mock("../db", () => ({
  getDb: vi.fn(),
}));

vi.mock("./permissions", () => ({
  canAdminUsePermission: vi.fn(),
}));

function makeContext(role: "admin" | "agent" = "admin") {
  return {
    user: {
      id: 17,
      email: "natalia@example.com",
      name: "Natalia",
      role,
    },
  } as any;
}

describe("Passwords Super Permission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("blocks an administrator whose Passwords Super Permission is disabled", async () => {
    vi.mocked(canAdminUsePermission).mockResolvedValue(false);

    await expect(
      passwordsRouter.createCaller(makeContext()).getLists()
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(canAdminUsePermission).toHaveBeenCalledWith(
      expect.objectContaining({ id: 17, role: "admin" }),
      "canViewPasswords"
    );
    expect(getDb).not.toHaveBeenCalled();
  });

  it("allows an administrator with the Passwords Super Permission to open an empty feature", async () => {
    vi.mocked(canAdminUsePermission).mockResolvedValue(true);
    vi.mocked(getDb).mockResolvedValue(null);

    await expect(
      passwordsRouter.createCaller(makeContext()).getLists()
    ).resolves.toEqual([]);
  });

  it("keeps list-level sharing available to non-admin collaborators", async () => {
    vi.mocked(getDb).mockResolvedValue(null);

    await expect(
      passwordsRouter.createCaller(makeContext("agent")).getLists()
    ).resolves.toEqual([]);

    expect(canAdminUsePermission).not.toHaveBeenCalled();
  });
});
