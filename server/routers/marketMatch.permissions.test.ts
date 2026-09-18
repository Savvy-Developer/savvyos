import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../marketMatchSettings", () => ({
  MAX_RECOMMENDED_MARKETS: 5,
  MIN_RECOMMENDED_MARKETS: 3,
  getMarketMatchSettings: vi.fn(),
  saveMarketMatchSettings: vi.fn(),
}));

vi.mock("./permissions", () => ({
  canAdminUsePermission: vi.fn(),
}));

import {
  getMarketMatchSettings,
  saveMarketMatchSettings,
} from "../marketMatchSettings";
import { canAdminUsePermission } from "./permissions";
import { marketMatchRouter } from "./marketMatch";

const user = {
  id: 42,
  email: "admin@savvy.realty",
  name: "Delegated Admin",
  role: "admin",
};

function caller() {
  return marketMatchRouter.createCaller({ user } as any);
}

describe("Market Match Settings Super Permission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not treat generic administrator access as settings access", async () => {
    vi.mocked(canAdminUsePermission).mockResolvedValue(false);

    await expect(caller().settings()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(canAdminUsePermission).toHaveBeenCalledWith(
      user,
      "canViewMarketMatchSettings"
    );
  });

  it("allows settings only when the dedicated permission is granted", async () => {
    const settings = { enabled: true, maxRecommendedMarkets: 4 };
    vi.mocked(canAdminUsePermission).mockResolvedValue(true);
    vi.mocked(getMarketMatchSettings).mockResolvedValue(settings as any);

    await expect(caller().settings()).resolves.toEqual(settings);
  });

  it("checks the same dedicated permission before saving", async () => {
    vi.mocked(canAdminUsePermission).mockResolvedValue(true);
    vi.mocked(saveMarketMatchSettings).mockResolvedValue({
      enabled: false,
      maxRecommendedMarkets: 3,
    } as any);

    await expect(
      caller().saveSettings({ enabled: false, maxRecommendedMarkets: 3 })
    ).resolves.toMatchObject({ enabled: false, maxRecommendedMarkets: 3 });
    expect(canAdminUsePermission).toHaveBeenCalledWith(
      user,
      "canViewMarketMatchSettings"
    );
    expect(saveMarketMatchSettings).toHaveBeenCalledWith({
      enabled: false,
      maxRecommendedMarkets: 3,
      updatedById: user.id,
    });
  });
});
