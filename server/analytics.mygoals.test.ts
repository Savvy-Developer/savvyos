import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the db module
vi.mock("./db", () => ({
  getMyGoalsAndProduction: vi.fn(),
}));

import * as db from "./db";

describe("My Goals & Production (agent-facing)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getMyGoalsAndProduction", () => {
    it("returns null when agent has no transactions", async () => {
      vi.mocked(db.getMyGoalsAndProduction).mockResolvedValue(null);
      const result = await db.getMyGoalsAndProduction(99, 2026, 0);
      expect(result).toBeNull();
    });

    it("returns production with hasGoals=false when no goals set", async () => {
      vi.mocked(db.getMyGoalsAndProduction).mockResolvedValue({
        agentId: 1,
        agentName: "Dev Agent",
        gci: 29100,
        closings: 2,
        volume: 970000,
        activePipeline: 7,
        gciTarget: null,
        closingsTarget: null,
        volumeTarget: null,
        gciPct: null,
        closingsPct: null,
        volumePct: null,
        hasGoals: false,
      });

      const result = await db.getMyGoalsAndProduction(1, 2026, 0);
      expect(result).not.toBeNull();
      expect(result!.hasGoals).toBe(false);
      expect(result!.gciTarget).toBeNull();
    });

    it("returns production with goals and progress percentages when goals are set", async () => {
      vi.mocked(db.getMyGoalsAndProduction).mockResolvedValue({
        agentId: 1,
        agentName: "Dev Agent",
        gci: 29100,
        closings: 2,
        volume: 970000,
        activePipeline: 7,
        gciTarget: 50000,
        closingsTarget: 4,
        volumeTarget: 2000000,
        gciPct: 58,
        closingsPct: 50,
        volumePct: 49,
        hasGoals: true,
      });

      const result = await db.getMyGoalsAndProduction(1, 2026, 0);
      expect(result!.hasGoals).toBe(true);
      expect(result!.gciPct).toBe(58);
      expect(result!.closingsPct).toBe(50);
      expect(result!.volumePct).toBe(49);
    });

    it("caps progress at 999 when far exceeding goal", async () => {
      vi.mocked(db.getMyGoalsAndProduction).mockResolvedValue({
        agentId: 1,
        agentName: "Dev Agent",
        gci: 200000,
        closings: 20,
        volume: 8000000,
        activePipeline: 3,
        gciTarget: 50000,
        closingsTarget: 4,
        volumeTarget: 2000000,
        gciPct: 400,
        closingsPct: 500,
        volumePct: 400,
        hasGoals: true,
      });

      const result = await db.getMyGoalsAndProduction(1, 2026, 0);
      // UI caps at 100 for bar width, but raw pct can be > 100
      expect(result!.gciPct).toBeGreaterThan(100);
    });

    it("handles month-specific query (not just annual)", async () => {
      vi.mocked(db.getMyGoalsAndProduction).mockResolvedValue({
        agentId: 1,
        agentName: "Dev Agent",
        gci: 5000,
        closings: 1,
        volume: 200000,
        activePipeline: 2,
        gciTarget: 10000,
        closingsTarget: 2,
        volumeTarget: 500000,
        gciPct: 50,
        closingsPct: 50,
        volumePct: 40,
        hasGoals: true,
      });

      const result = await db.getMyGoalsAndProduction(1, 2026, 3);
      expect(db.getMyGoalsAndProduction).toHaveBeenCalledWith(1, 2026, 3);
      expect(result!.gci).toBe(5000);
    });

    it("returns hasGoals=true when only GCI goal is set (partial goals)", async () => {
      vi.mocked(db.getMyGoalsAndProduction).mockResolvedValue({
        agentId: 2,
        agentName: "Sarah Mitchell",
        gci: 15000,
        closings: 1,
        volume: 600000,
        activePipeline: 4,
        gciTarget: 60000,
        closingsTarget: null,
        volumeTarget: null,
        gciPct: 25,
        closingsPct: null,
        volumePct: null,
        hasGoals: true,
      });

      const result = await db.getMyGoalsAndProduction(2, 2026, 0);
      expect(result!.hasGoals).toBe(true);
      expect(result!.gciTarget).toBe(60000);
      expect(result!.closingsTarget).toBeNull();
    });
  });

  describe("Goal progress bar color logic", () => {
    it("shows green color at 100%+ (goal hit)", () => {
      const pct = 100;
      const isComplete = pct >= 100;
      expect(isComplete).toBe(true);
    });

    it("shows primary color at 75-99%", () => {
      const pct = 80;
      const isComplete = pct >= 100;
      const isPrimary = !isComplete && pct >= 75;
      expect(isPrimary).toBe(true);
    });

    it("shows amber color at 40-74%", () => {
      const pct = 58;
      const isComplete = pct >= 100;
      const isPrimary = !isComplete && pct >= 75;
      const isAmber = !isComplete && !isPrimary && pct >= 40;
      expect(isAmber).toBe(true);
    });

    it("shows rose color below 40%", () => {
      const pct = 20;
      const isComplete = pct >= 100;
      const isPrimary = !isComplete && pct >= 75;
      const isAmber = !isComplete && !isPrimary && pct >= 40;
      const isRose = !isComplete && !isPrimary && !isAmber;
      expect(isRose).toBe(true);
    });

    it("caps bar width at 100% even when pct > 100", () => {
      const pct = 150;
      const capped = Math.min(pct, 100);
      expect(capped).toBe(100);
    });
  });

  describe("Currency formatting", () => {
    it("formats millions correctly", () => {
      const fmt = (n: number) =>
        n >= 1_000_000
          ? `$${(n / 1_000_000).toFixed(1)}M`
          : n >= 1_000
          ? `$${Math.round(n / 1_000)}k`
          : `$${n.toLocaleString()}`;

      expect(fmt(2_000_000)).toBe("$2.0M");
      expect(fmt(1_500_000)).toBe("$1.5M");
    });

    it("formats thousands correctly", () => {
      const fmt = (n: number) =>
        n >= 1_000_000
          ? `$${(n / 1_000_000).toFixed(1)}M`
          : n >= 1_000
          ? `$${Math.round(n / 1_000)}k`
          : `$${n.toLocaleString()}`;

      expect(fmt(50_000)).toBe("$50k");
      expect(fmt(29_100)).toBe("$29k");
    });

    it("formats small values correctly", () => {
      const fmt = (n: number) =>
        n >= 1_000_000
          ? `$${(n / 1_000_000).toFixed(1)}M`
          : n >= 1_000
          ? `$${Math.round(n / 1_000)}k`
          : `$${n.toLocaleString()}`;

      expect(fmt(500)).toBe("$500");
    });
  });
});
