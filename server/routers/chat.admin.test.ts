import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetDb, mockCanAdminUsePermission } = vi.hoisted(() => ({
  mockGetDb: vi.fn(),
  mockCanAdminUsePermission: vi.fn(),
}));

vi.mock("../db", () => ({ getDb: mockGetDb }));
vi.mock("./permissions", () => ({ canAdminUsePermission: mockCanAdminUsePermission }));
vi.mock("../mobileNotifications", () => ({ notifyMobileUsers: vi.fn() }));

import { chatRouter } from "./chat";

const chatAdmin = {
  id: 1,
  email: "tyler@savvy.realty",
  name: "Tyler",
  role: "admin",
};

const viewer = {
  id: 8,
  email: "viewer@savvy.realty",
  name: "Viewer",
  role: "admin",
};

function thenable(rows: unknown[]) {
  const chain: any = {
    from() { return chain; },
    innerJoin() { return chain; },
    leftJoin() { return chain; },
    where() { return chain; },
    orderBy() { return chain; },
    limit() { return chain; },
    then(resolve: (value: unknown[]) => unknown, reject?: (reason: unknown) => unknown) {
      return Promise.resolve(rows).then(resolve, reject);
    },
  };
  return chain;
}

function makeDb() {
  const updateSet = vi.fn();
  const updateWhere = vi.fn().mockResolvedValue([]);
  updateSet.mockReturnValue({ where: updateWhere });

  const db = {
    select: vi.fn((shape?: Record<string, unknown>) => {
      if (shape && "channelId" in shape) return thenable([]);
      if (shape && "id" in shape && !("isPermanent" in (shape as object))) {
        return thenable([{ id: 4, isArchived: false }]);
      }
      return thenable([
        { id: 21, isPermanent: true, type: "group", isArchived: false, name: "isa-team", sectionId: 4 },
      ]);
    }),
    update: vi.fn(() => ({ set: updateSet })),
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue([{ insertId: 99 }]) })),
    delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })),
    updateSet,
    updateWhere,
  };
  return db;
}

function callerFor(user: typeof chatAdmin) {
  return chatRouter.createCaller({ user } as any);
}

describe("Chat Admin section and channel archive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCanAdminUsePermission.mockImplementation(async (user: typeof chatAdmin, key: string) => {
      if (user.id !== chatAdmin.id) return key === "canViewChat";
      return key === "canManageChat" || key === "canViewChat";
    });
  });

  it("lets a Chat Admin rename a section", async () => {
    const db = makeDb();
    mockGetDb.mockResolvedValue(db);

    await expect(
      callerFor(chatAdmin).sections.update({ id: 4, name: "Operations" })
    ).resolves.toEqual({ success: true });
    expect(db.updateSet).toHaveBeenCalledWith({ name: "Operations" });
  });

  it("archives a section heading without cascading to groups", async () => {
    const db = makeDb();
    mockGetDb.mockResolvedValue(db);

    await expect(callerFor(chatAdmin).sections.archive({ id: 4 })).resolves.toEqual({
      success: true,
    });
    expect(db.updateSet).toHaveBeenCalledWith({ isArchived: true });
    expect(db.update).toHaveBeenCalledTimes(1);
  });

  it("restores an archived section", async () => {
    const db = makeDb();
    mockGetDb.mockResolvedValue(db);

    await expect(callerFor(chatAdmin).sections.restore({ id: 4 })).resolves.toEqual({
      success: true,
    });
    expect(db.updateSet).toHaveBeenCalledWith({ isArchived: false });
  });

  it("archives a permanent company channel so it can be restored later", async () => {
    const db = makeDb();
    mockGetDb.mockResolvedValue(db);

    await expect(callerFor(chatAdmin).groups.archive({ id: 21 })).resolves.toEqual({
      success: true,
    });
    expect(db.updateSet).toHaveBeenCalledWith({ isArchived: true });
  });

  it("blocks Chat viewers from deleting sections or archiving company channels", async () => {
    mockGetDb.mockResolvedValue(makeDb());

    await expect(callerFor(viewer).sections.archive({ id: 4 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(callerFor(viewer).groups.archive({ id: 21 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
