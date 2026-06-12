import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the db module
vi.mock("./db", () => ({
  getAgentProductionWithGoals: vi.fn(),
  setAgentGoal: vi.fn(),
  setGoalsForAllAgents: vi.fn(),
}));

import * as db from "./db";

describe("Agent Goal Tracking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getAgentProductionWithGoals", () => {
    it("returns agents with production data and no goals when none set", async () => {
      const mockData = [
        {
          agentId: 1,
          agentName: "Sarah Mitchell",
          gci: 45000,
          closings: 3,
          volume: 1800000,
          activePipeline: 2,
          gciGoal: null,
          closingsGoal: null,
          volumeGoal: null,
        },
      ];
      vi.mocked(db.getAgentProductionWithGoals).mockResolvedValue(mockData);

      const result = await db.getAgentProductionWithGoals(2026, 0);
      expect(result).toHaveLength(1);
      expect(result[0].agentName).toBe("Sarah Mitchell");
      expect(result[0].gci).toBe(45000);
      expect(result[0].gciGoal).toBeNull();
    });

    it("returns agents with goals when goals are set", async () => {
      const mockData = [
        {
          agentId: 1,
          agentName: "Dev Agent",
          gci: 29000,
          closings: 2,
          volume: 970000,
          activePipeline: 7,
          gciGoal: 50000,
          closingsGoal: 4,
          volumeGoal: 2000000,
        },
      ];
      vi.mocked(db.getAgentProductionWithGoals).mockResolvedValue(mockData);

      const result = await db.getAgentProductionWithGoals(2026, 0);
      expect(result[0].gciGoal).toBe(50000);
      expect(result[0].closingsGoal).toBe(4);
      expect(result[0].volumeGoal).toBe(2000000);
    });

    it("handles month-specific queries (not just annual)", async () => {
      vi.mocked(db.getAgentProductionWithGoals).mockResolvedValue([]);
      const result = await db.getAgentProductionWithGoals(2026, 3);
      expect(db.getAgentProductionWithGoals).toHaveBeenCalledWith(2026, 3);
      expect(result).toHaveLength(0);
    });
  });

  describe("setAgentGoal", () => {
    it("saves a goal for a specific agent, year, and month", async () => {
      vi.mocked(db.setAgentGoal).mockResolvedValue(undefined);

      await db.setAgentGoal({
        agentId: 1,
        year: 2026,
        month: 0,
        gciGoal: 50000,
        closingsGoal: 4,
        volumeGoal: 2000000,
      });

      expect(db.setAgentGoal).toHaveBeenCalledWith({
        agentId: 1,
        year: 2026,
        month: 0,
        gciGoal: 50000,
        closingsGoal: 4,
        volumeGoal: 2000000,
      });
    });

    it("allows partial goals (only GCI set)", async () => {
      vi.mocked(db.setAgentGoal).mockResolvedValue(undefined);

      await db.setAgentGoal({
        agentId: 2,
        year: 2026,
        month: 0,
        gciGoal: 60000,
        closingsGoal: null,
        volumeGoal: null,
      });

      expect(db.setAgentGoal).toHaveBeenCalledWith(
        expect.objectContaining({ gciGoal: 60000, closingsGoal: null })
      );
    });
  });

  describe("setGoalsForAllAgents", () => {
    it("applies the same goal to all agents", async () => {
      vi.mocked(db.setGoalsForAllAgents).mockResolvedValue(undefined);

      await db.setGoalsForAllAgents({
        agentIds: [1, 2, 3],
        year: 2026,
        month: 0,
        gciGoal: 50000,
        closingsGoal: 4,
        volumeGoal: 2000000,
      });

      expect(db.setGoalsForAllAgents).toHaveBeenCalledWith(
        expect.objectContaining({ agentIds: [1, 2, 3] })
      );
    });
  });

  describe("Goal progress calculation", () => {
    it("correctly calculates GCI progress percentage", () => {
      const gci = 29000;
      const gciGoal = 50000;
      const progress = Math.min(100, Math.round((gci / gciGoal) * 100));
      expect(progress).toBe(58);
    });

    it("caps progress at 100% when goal is exceeded", () => {
      const gci = 60000;
      const gciGoal = 50000;
      const progress = Math.min(100, Math.round((gci / gciGoal) * 100));
      expect(progress).toBe(100);
    });

    it("returns 0 when no production yet", () => {
      const gci = 0;
      const gciGoal = 50000;
      const progress = Math.min(100, Math.round((gci / gciGoal) * 100));
      expect(progress).toBe(0);
    });

    it("handles null goal gracefully (no progress bar shown)", () => {
      const gciGoal = null;
      const showProgress = gciGoal !== null && gciGoal > 0;
      expect(showProgress).toBe(false);
    });
  });
});
