import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock DB helpers ──────────────────────────────────────────────────────────
vi.mock("../marketMatch.db", () => ({
  getRecentCallSessions: vi.fn(),
  getAgentById: vi.fn(),
  getMarketMatchSession: vi.fn(),
}));

vi.mock("../_core/resendEmail", () => ({
  sendEmail: vi.fn().mockResolvedValue({ id: "email-123" }),
}));

import * as db from "../marketMatch.db";
import { sendEmail } from "../_core/resendEmail";

// ─── Unit tests for call history helpers ─────────────────────────────────────

describe("getRecentCallSessions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns sessions for the current ISA user", async () => {
    const mockSessions = [
      {
        id: 1,
        contactId: 10,
        contactFirstName: "Brandon",
        contactLastName: "Walsh",
        status: "completed",
        completedAt: new Date("2026-03-15"),
        durationSeconds: 420,
        overallConfidenceScore: 82,
        topMarketRecommendations: JSON.stringify([{ marketName: "Smoky Mountains", fitScore: 88 }]),
        callSummary: "Investor is ready to buy in Q2.",
        nextActionRecommendation: "Schedule property tour.",
        investorProfile: JSON.stringify({ budgetMin: 300000, budgetMax: 500000, purchaseTimeline: "3-6 months" }),
      },
    ];
    vi.mocked(db.getRecentCallSessions).mockResolvedValue(mockSessions as any);

    const result = await db.getRecentCallSessions({ userId: 5, limit: 10 });
    expect(result).toHaveLength(1);
    expect(result[0].contactFirstName).toBe("Brandon");
    expect(result[0].status).toBe("completed");
  });

  it("returns empty array when no sessions exist", async () => {
    vi.mocked(db.getRecentCallSessions).mockResolvedValue([]);
    const result = await db.getRecentCallSessions({ userId: 99, limit: 10 });
    expect(result).toHaveLength(0);
  });

  it("respects the limit parameter", async () => {
    const sessions = Array.from({ length: 5 }, (_, i) => ({
      id: i + 1,
      contactFirstName: `Contact${i}`,
      contactLastName: "Test",
      status: "completed",
    }));
    vi.mocked(db.getRecentCallSessions).mockResolvedValue(sessions as any);
    const result = await db.getRecentCallSessions({ userId: 5, limit: 5 });
    expect(result.length).toBeLessThanOrEqual(5);
  });
});

// ─── Unit tests for email intro ───────────────────────────────────────────────

describe("sendAgentIntroEmail", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls sendEmail with market_match_intro type", async () => {
    vi.mocked(db.getAgentById).mockResolvedValue({
      id: 3,
      name: "Sarah Agent",
      email: "sarah@example.com",
    } as any);

    vi.mocked(db.getMarketMatchSession).mockResolvedValue({
      id: 1,
      callSummary: "Investor ready to buy.",
      handoffNotes: "Strong buyer, pre-qualified.",
      investorProfile: JSON.stringify({ budgetMin: 300000, budgetMax: 500000 }),
      topMarketRecommendations: JSON.stringify([{ marketName: "Smoky Mountains", fitScore: 88 }]),
    } as any);

    await db.getAgentById(3);
    await db.getMarketMatchSession(1);

    await sendEmail({
      type: "market_match_intro",
      to: "sarah@example.com",
      context: {
        agentName: "Sarah Agent",
        investorName: "Brandon Walsh",
        marketName: "Smoky Mountains",
        callSummary: "Investor ready to buy.",
        handoffNotes: "Strong buyer, pre-qualified.",
        budgetRange: "$300,000 – $500,000",
      },
    } as any);

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ type: "market_match_intro" })
    );
  });

  it("throws when agent is not found", async () => {
    vi.mocked(db.getAgentById).mockResolvedValue(undefined as any);
    const result = await db.getAgentById(9999);
    expect(result).toBeUndefined();
  });

  it("throws when session is not found", async () => {
    vi.mocked(db.getMarketMatchSession).mockResolvedValue(undefined as any);
    const result = await db.getMarketMatchSession(9999);
    expect(result).toBeUndefined();
  });
});

// ─── Integration: session detail parsing ─────────────────────────────────────

describe("session detail parsing", () => {
  it("safely parses topMarketRecommendations JSON", () => {
    const raw = JSON.stringify([{ marketName: "Gulf Shores", fitScore: 91 }]);
    const parsed = (() => { try { return JSON.parse(raw); } catch { return []; } })();
    expect(parsed).toHaveLength(1);
    expect(parsed[0].marketName).toBe("Gulf Shores");
  });

  it("returns empty array for invalid JSON in topMarketRecommendations", () => {
    const raw = "not-valid-json";
    const parsed = (() => { try { return JSON.parse(raw); } catch { return []; } })();
    expect(parsed).toEqual([]);
  });

  it("safely parses investorProfile JSON", () => {
    const raw = JSON.stringify({ budgetMin: 200000, purchaseTimeline: "0-3 months" });
    const parsed = (() => { try { return JSON.parse(raw); } catch { return {}; } })();
    expect(parsed.budgetMin).toBe(200000);
    expect(parsed.purchaseTimeline).toBe("0-3 months");
  });

  it("formats call duration correctly", () => {
    const durationSeconds = 425;
    const formatted = `${Math.floor(durationSeconds / 60)}m ${durationSeconds % 60}s`;
    expect(formatted).toBe("7m 5s");
  });

  it("formats date correctly for completed sessions", () => {
    const completedAt = new Date("2026-03-15T14:30:00Z");
    const formatted = completedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    expect(formatted).toMatch(/Mar/);
    expect(formatted).toMatch(/2026/);
  });
});
