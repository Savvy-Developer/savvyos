import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, mockLogActivity } = vi.hoisted(() => {
  const db = {
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    where: vi.fn(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn(),
  };
  return { mockDb: db, mockLogActivity: vi.fn() };
});

vi.mock("../db", () => ({
  getDb: vi.fn().mockResolvedValue(mockDb),
  logActivity: mockLogActivity,
}));
vi.mock("../agentMarketsIntelligence", () => ({
  collectMarketProfileDraft: vi.fn(),
  refreshMarketIntelligence: vi.fn(),
}));
vi.mock("../agentMarketProfileFeedback", () => ({
  sendMarketProfileUpdateTestEmail: vi.fn(),
}));
vi.mock("../storage", () => ({
  storageDelete: vi.fn(),
  storagePut: vi.fn(),
}));
vi.mock("../lib/pdf-parse-safe", () => ({ default: vi.fn() }));
vi.mock("./permissions", () => ({
  canAdminUsePermission: vi.fn(),
  isSuperPermissionsManager: vi.fn(),
}));

import { refreshMarketIntelligence } from "../agentMarketsIntelligence";
import { isSuperPermissionsManager } from "./permissions";
import { agentMarketsRouter } from "./agentMarkets";

const superAdmin = {
  id: 7,
  email: "tyler@savvy.realty",
  name: "Tyler",
  role: "admin",
};

function caller() {
  return agentMarketsRouter.createCaller({ user: superAdmin } as any);
}

describe("Agent Market title editing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.update.mockReturnValue(mockDb);
    mockDb.set.mockReturnValue(mockDb);
    mockDb.where.mockResolvedValue({ affectedRows: 1 });
    mockDb.insert.mockReturnValue(mockDb);
    mockDb.values.mockResolvedValue({ insertId: 1 });
  });

  it("allows a Super Permissions manager to update only the market display name", async () => {
    vi.mocked(isSuperPermissionsManager).mockReturnValue(true);

    await expect(
      caller().editTitle({ marketId: 42, name: "Coastal North Carolina" })
    ).resolves.toEqual({
      success: true,
      name: "Coastal North Carolina",
    });

    expect(mockDb.update).toHaveBeenCalledTimes(1);
    expect(mockDb.set).toHaveBeenCalledWith({ name: "Coastal North Carolina" });
    expect(vi.mocked(refreshMarketIntelligence)).not.toHaveBeenCalled();
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: superAdmin.id,
        action: "agent_market_title_updated",
        entityType: "market",
        entityId: 42,
        details: { marketName: "Coastal North Carolina" },
      })
    );
  });

  it("blocks title edits for administrators who are not Super Permissions managers", async () => {
    vi.mocked(isSuperPermissionsManager).mockReturnValue(false);

    await expect(
      caller().editTitle({ marketId: 42, name: "Coastal North Carolina" })
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    expect(mockDb.update).not.toHaveBeenCalled();
  });
});
