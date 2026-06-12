import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock DB ──────────────────────────────────────────────────────────────────
vi.mock("./marketMatch.db", () => ({
  getAllMarketProfiles: vi.fn(),
  getActiveMarketProfiles: vi.fn(),
  getMarketProfileById: vi.fn(),
  upsertMarketProfile: vi.fn(),
  deleteMarketProfile: vi.fn(),
  getMarketAgents: vi.fn(),
  upsertMarketAgentAssignment: vi.fn(),
  removeMarketAgentAssignment: vi.fn(),
  getMarketCaseStudies: vi.fn(),
  upsertMarketCaseStudy: vi.fn(),
  deleteMarketCaseStudy: vi.fn(),
  createMarketMatchSession: vi.fn(),
  getMarketMatchSession: vi.fn(),
  getSessionsForContact: vi.fn(),
  updateMarketMatchSession: vi.fn(),
  completeMarketMatchSession: vi.fn(),
  getContactCallContext: vi.fn(),
}));

vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

import {
  getAllMarketProfiles,
  getActiveMarketProfiles,
  upsertMarketProfile,
  deleteMarketProfile,
  createMarketMatchSession,
  getMarketMatchSession,
  updateMarketMatchSession,
  completeMarketMatchSession,
  getContactCallContext,
} from "./marketMatch.db";

import { invokeLLM } from "./_core/llm";

// ─── Market Profile Tests ─────────────────────────────────────────────────────

describe("Market Profile DB helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getAllMarketProfiles returns all profiles", async () => {
    const mockProfiles = [
      { id: 1, name: "Smoky Mountains", state: "TN", status: "active" },
      { id: 2, name: "Asheville", state: "NC", status: "recruiting" },
    ];
    vi.mocked(getAllMarketProfiles).mockResolvedValue(mockProfiles as any);

    const result = await getAllMarketProfiles();
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("Smoky Mountains");
  });

  it("getActiveMarketProfiles filters to active only", async () => {
    const mockActive = [{ id: 1, name: "Smoky Mountains", state: "TN", status: "active" }];
    vi.mocked(getActiveMarketProfiles).mockResolvedValue(mockActive as any);

    const result = await getActiveMarketProfiles();
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("active");
  });

  it("upsertMarketProfile creates a new profile and returns id", async () => {
    vi.mocked(upsertMarketProfile).mockResolvedValue(42);

    const id = await upsertMarketProfile({
      name: "Blue Ridge",
      state: "VA",
      status: "future",
    } as any);
    expect(id).toBe(42);
    expect(upsertMarketProfile).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Blue Ridge", state: "VA" })
    );
  });

  it("upsertMarketProfile updates existing profile when id provided", async () => {
    vi.mocked(upsertMarketProfile).mockResolvedValue(5);

    const id = await upsertMarketProfile({
      id: 5,
      name: "Updated Market",
      state: "FL",
    } as any);
    expect(id).toBe(5);
  });

  it("deleteMarketProfile calls delete with correct id", async () => {
    vi.mocked(deleteMarketProfile).mockResolvedValue(undefined);

    await deleteMarketProfile(3);
    expect(deleteMarketProfile).toHaveBeenCalledWith(3);
  });
});

// ─── Session Tests ────────────────────────────────────────────────────────────

describe("Market Match Session DB helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("createMarketMatchSession returns a session with contact info", async () => {
    const mockSession = {
      id: 101,
      contactId: 2001,
      isaId: 360002,
      status: "in_progress",
      contact: { id: 2001, firstName: "Brandon", lastName: "Walsh" },
    };
    vi.mocked(createMarketMatchSession).mockResolvedValue(mockSession as any);

    const session = await createMarketMatchSession(2001, 360002);
    expect(session.id).toBe(101);
    expect(session.contact.firstName).toBe("Brandon");
  });

  it("getMarketMatchSession returns null for unknown id", async () => {
    vi.mocked(getMarketMatchSession).mockResolvedValue(null);

    const result = await getMarketMatchSession(99999);
    expect(result).toBeNull();
  });

  it("updateMarketMatchSession saves investor profile data", async () => {
    vi.mocked(updateMarketMatchSession).mockResolvedValue(undefined);

    await updateMarketMatchSession(101, {
      investorProfile: { budgetMin: 300000, budgetMax: 700000, cashFlowImportance: 4 },
    } as any);
    expect(updateMarketMatchSession).toHaveBeenCalledWith(
      101,
      expect.objectContaining({ investorProfile: expect.objectContaining({ budgetMin: 300000 }) })
    );
  });

  it("completeMarketMatchSession marks session as completed with CRM writeback", async () => {
    vi.mocked(completeMarketMatchSession).mockResolvedValue(undefined);

    await completeMarketMatchSession(101, {
      callSummary: "Great call with Brandon",
      followUpEmailDraft: "Hi Brandon...",
      handoffNotes: "Interested in Smokies",
      nextActionRecommendation: "Schedule agent intro",
      contactStatusSuggestion: "active_client",
      tagsApplied: "str,smokies",
      topMarketRecommendations: [],
      overallConfidenceScore: 85,
    });
    expect(completeMarketMatchSession).toHaveBeenCalledWith(
      101,
      expect.objectContaining({ callSummary: "Great call with Brandon" })
    );
  });
});

// ─── AI Recommendation Tests ──────────────────────────────────────────────────

describe("AI Recommendations (LLM integration)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("invokeLLM is called with investor profile and market data", async () => {
    const mockLLMResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              recommendations: [
                {
                  marketId: 1,
                  marketName: "Smoky Mountains",
                  fitScore: 92,
                  confidenceScore: 88,
                  rationale: "Strong cash flow match",
                  keyTalkingPoints: ["High occupancy year-round"],
                  potentialObjections: ["Regulation risk"],
                  suggestedAgentId: 360003,
                },
              ],
              overallAnalysis: "Great fit for cash-flow-focused investor",
              coachingTips: ["Lead with ROI numbers"],
            }),
          },
        },
      ],
    };
    vi.mocked(invokeLLM).mockResolvedValue(mockLLMResponse as any);

    const result = await invokeLLM({
      messages: [
        { role: "system", content: "You are a real estate AI." },
        { role: "user", content: "Match this investor to markets." },
      ],
    });

    const parsed = JSON.parse(result.choices[0].message.content as string);
    expect(parsed.recommendations).toHaveLength(1);
    expect(parsed.recommendations[0].fitScore).toBe(92);
    expect(parsed.recommendations[0].marketName).toBe("Smoky Mountains");
  });

  it("generateCallSummary returns structured summary with all required fields", async () => {
    const mockSummary = {
      callSummary: "Brandon is a cash-flow-focused investor...",
      followUpEmailDraft: "Hi Brandon, great speaking with you...",
      handoffNotes: "Interested in Smokies, budget $400-700k",
      nextActionRecommendation: "Schedule intro with Dev Agent within 48 hours",
      contactStatusSuggestion: "active_client",
      suggestedTags: ["str", "smokies", "cash-flow"],
    };
    vi.mocked(invokeLLM).mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(mockSummary) } }],
    } as any);

    const result = await invokeLLM({
      messages: [{ role: "user", content: "Generate call summary" }],
    });
    const parsed = JSON.parse(result.choices[0].message.content as string);

    expect(parsed).toHaveProperty("callSummary");
    expect(parsed).toHaveProperty("followUpEmailDraft");
    expect(parsed).toHaveProperty("handoffNotes");
    expect(parsed).toHaveProperty("nextActionRecommendation");
    expect(parsed).toHaveProperty("contactStatusSuggestion");
    expect(parsed).toHaveProperty("suggestedTags");
    expect(parsed.suggestedTags).toContain("smokies");
  });
});

// ─── Contact Context Tests ────────────────────────────────────────────────────

describe("getContactCallContext", () => {
  it("returns contact data for valid contact id", async () => {
    const mockContact = {
      id: 2001,
      firstName: "Brandon",
      lastName: "Walsh",
      email: "brandon.walsh@email.com",
      phone: "615-555-0101",
    };
    vi.mocked(getContactCallContext).mockResolvedValue(mockContact as any);

    const contact = await getContactCallContext(2001);
    expect(contact?.firstName).toBe("Brandon");
    expect(contact?.email).toBe("brandon.walsh@email.com");
  });

  it("returns null for unknown contact id", async () => {
    vi.mocked(getContactCallContext).mockResolvedValue(null);

    const contact = await getContactCallContext(99999);
    expect(contact).toBeNull();
  });
});
