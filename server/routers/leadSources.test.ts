import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
  },
}));

vi.mock("../db", () => ({
  getDb: vi.fn().mockResolvedValue(mockDb),
}));

import { leadSourcesRouter } from "./leadSources";

const adminContext = {
  user: {
    id: 1,
    role: "admin",
  },
} as any;

describe("leadSources agreement requirement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.select.mockReturnThis();
    mockDb.from.mockReturnThis();
    mockDb.where.mockReturnThis();
    mockDb.insert.mockReturnThis();
    mockDb.update.mockReturnThis();
    mockDb.set.mockReturnThis();
    mockDb.values.mockResolvedValue([{ insertId: 101 }]);
  });

  it("stores a category-level agreement requirement", async () => {
    const caller = leadSourcesRouter.createCaller(adminContext);

    await caller.create({
      name: "Inbound Referrals",
      requireAgreementForSubSources: true,
    });

    expect(mockDb.values).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Inbound Referrals",
        parentId: null,
        requireAgreementForSubSources: true,
      })
    );
  });

  it("allows an agreement-free sub-source when its category does not require one", async () => {
    mockDb.limit.mockResolvedValue([{ requireAgreementForSubSources: false }]);
    const caller = leadSourcesRouter.createCaller(adminContext);

    await caller.create({ name: "Website Form", parentId: 10 });

    expect(mockDb.values).toHaveBeenCalledWith(
      expect.objectContaining({
        parentId: 10,
        agreementUrl: null,
        requireAgreementForSubSources: false,
      })
    );
  });

  it("rejects an agreement-free sub-source when its category requires one", async () => {
    mockDb.limit.mockResolvedValue([{ requireAgreementForSubSources: true }]);
    const caller = leadSourcesRouter.createCaller(adminContext);

    await expect(
      caller.create({ name: "Partner Intake", parentId: 10 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(mockDb.values).not.toHaveBeenCalled();
  });

  it("enforces the requirement when moving a sub-source into a category", async () => {
    mockDb.limit
      .mockResolvedValueOnce([{ parentId: 3, agreementUrl: null }])
      .mockResolvedValueOnce([{ requireAgreementForSubSources: true }]);
    const caller = leadSourcesRouter.createCaller(adminContext);

    await expect(caller.update({ id: 20, parentId: 10 })).rejects.toMatchObject(
      { code: "BAD_REQUEST" }
    );

    expect(mockDb.set).not.toHaveBeenCalled();
  });
});
