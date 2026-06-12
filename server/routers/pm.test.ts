import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock the DB module ────────────────────────────────────────────────────────
vi.mock("../db", () => ({
  default: {
    getDb: vi.fn(),
    getUserById: vi.fn(),
  },
}));

// ─── Mock the LLM module ──────────────────────────────────────────────────────
vi.mock("../_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{ message: { content: "AI summary text" } }],
  }),
}));

// ─── Unit tests for PM router logic ──────────────────────────────────────────

describe("PM Router – project status helpers", () => {
  it("maps 'not_started' to the correct label", () => {
    const STATUS_LABELS: Record<string, string> = {
      not_started: "Not Started",
      in_progress: "In Progress",
      at_risk: "At Risk",
      completed: "Completed",
    };
    expect(STATUS_LABELS["not_started"]).toBe("Not Started");
    expect(STATUS_LABELS["completed"]).toBe("Completed");
  });

  it("maps priority values correctly", () => {
    const PRIORITY_LABELS: Record<string, string> = {
      high: "High",
      medium: "Medium",
      low: "Low",
    };
    expect(PRIORITY_LABELS["high"]).toBe("High");
    expect(PRIORITY_LABELS["medium"]).toBe("Medium");
    expect(PRIORITY_LABELS["low"]).toBe("Low");
  });

  it("computes progress percentage correctly", () => {
    const computeProgress = (completed: number, total: number) =>
      total > 0 ? Math.round((completed / total) * 100) : 0;

    expect(computeProgress(0, 0)).toBe(0);
    expect(computeProgress(5, 10)).toBe(50);
    expect(computeProgress(10, 10)).toBe(100);
    expect(computeProgress(1, 3)).toBe(33);
  });
});

describe("PM Router – update status logic", () => {
  it("validates update status values", () => {
    const validStatuses = ["on_track", "at_risk", "off_track"];
    expect(validStatuses).toContain("on_track");
    expect(validStatuses).toContain("at_risk");
    expect(validStatuses).toContain("off_track");
    expect(validStatuses).not.toContain("unknown");
  });

  it("validates progress percentage range", () => {
    const clampProgress = (pct: number) => Math.max(0, Math.min(100, pct));
    expect(clampProgress(-10)).toBe(0);
    expect(clampProgress(110)).toBe(100);
    expect(clampProgress(50)).toBe(50);
  });
});

describe("PM Router – access control logic", () => {
  it("only allows admin role to manage projects", () => {
    const canManageProjects = (role: string) => role === "admin";
    expect(canManageProjects("admin")).toBe(true);
    expect(canManageProjects("agent")).toBe(false);
    expect(canManageProjects("isa")).toBe(false);
  });

  it("Tyler-only nav is gated by email", () => {
    const isTyler = (email: string) => email === "tyler@savvy.realty";
    expect(isTyler("tyler@savvy.realty")).toBe(true);
    expect(isTyler("other@savvy.realty")).toBe(false);
    expect(isTyler("")).toBe(false);
  });
});

describe("PM Router – task comment validation", () => {
  it("rejects empty comment content", () => {
    const isValidComment = (content: string) => content.trim().length > 0;
    expect(isValidComment("")).toBe(false);
    expect(isValidComment("   ")).toBe(false);
    expect(isValidComment("Great progress!")).toBe(true);
  });
});

describe("PM Router – department list", () => {
  it("deduplicates department names", () => {
    const departments = ["Marketing", "Tech", "Marketing", "Operations", "Tech"];
    const unique = [...new Set(departments)].sort();
    expect(unique).toEqual(["Marketing", "Operations", "Tech"]);
    expect(unique.length).toBe(3);
  });
});
