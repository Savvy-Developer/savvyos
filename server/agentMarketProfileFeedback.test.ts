import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetDb, mockGenerateMagicLinkUrl, mockSendTransactionalEmail } =
  vi.hoisted(() => ({
    mockGetDb: vi.fn(),
    mockGenerateMagicLinkUrl: vi.fn(),
    mockSendTransactionalEmail: vi.fn(),
  }));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...conditions) => conditions),
  eq: vi.fn((column, value) => ({ column, value })),
  gte: vi.fn((column, value) => ({ column, value })),
}));

vi.mock("./db", () => ({
  getDb: mockGetDb,
}));

vi.mock("./_core/resendEmail", () => ({
  generateMagicLinkUrl: mockGenerateMagicLinkUrl,
  sendTransactionalEmail: mockSendTransactionalEmail,
}));

vi.mock("../drizzle/schema", () => ({
  emailNotificationDeliveries: {
    id: "delivery.id",
    notificationKey: "delivery.notificationKey",
    recipientEmail: "delivery.recipientEmail",
    sentAt: "delivery.sentAt",
  },
  marketAgentAssignments: {
    marketProfileId: "assignment.marketProfileId",
    agentId: "assignment.agentId",
  },
  marketIntelligenceProfiles: {
    marketProfileId: "intelligence.marketProfileId",
    profileJson: "intelligence.profileJson",
  },
  marketProfileFeedbackRequests: {
    id: "request.id",
    marketProfileId: "request.marketProfileId",
    agentId: "request.agentId",
    profileFingerprint: "request.profileFingerprint",
  },
  marketProfiles: {
    id: "market.id",
    name: "market.name",
    state: "market.state",
  },
  users: {
    id: "user.id",
    name: "user.name",
    email: "user.email",
    isActive: "user.isActive",
    role: "user.role",
  },
}));

import {
  notifyAssignedAgentsOfMarketProfileUpdate,
  sendMarketProfileUpdateTestEmail,
} from "./agentMarketProfileFeedback";

function queryResult(rows: unknown[]) {
  const chain = {
    from: vi.fn(() => chain),
    innerJoin: vi.fn(() => chain),
    where: vi.fn(() => chain),
    limit: vi.fn(async () => rows),
    then: (
      resolve: (value: unknown[]) => unknown,
      reject: (reason: unknown) => unknown
    ) => Promise.resolve(rows).then(resolve, reject),
  };
  return chain;
}

const nextProfile = {
  executiveSummary: "Current market evidence supports a focused buy box.",
  bestFitInvestors: ["Evidence-led investors"],
  notIdealFor: ["Investors seeking a guarantee"],
  buyBox: { purchasePriceGuidance: "Validate live pricing." },
  marketDynamics: ["Supply is changing."],
  agentGuidance: ["Confirm property-level feasibility."],
  watchouts: ["Verify local rules."],
  evidenceNotes: ["CRM signal."],
  researchGaps: ["Add current public data."],
  confidence: "limited",
};

function setupNotificationDb(recentDeliveries: unknown[]) {
  const db = {
    select: vi
      .fn()
      .mockReturnValueOnce(queryResult([{ name: "Asheville", state: "NC" }]))
      .mockReturnValueOnce(
        queryResult([
          { id: 17, name: "Avery Agent", email: "AVERY@EXAMPLE.COM" },
        ])
      )
      .mockReturnValueOnce(queryResult([]))
      .mockReturnValueOnce(queryResult(recentDeliveries)),
    insert: vi.fn(),
  };
  mockGetDb.mockResolvedValue(db);
  return db;
}

describe("market profile update email cooldown", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateMagicLinkUrl.mockResolvedValue(
      "https://os.savvy-agents.com/test-link"
    );
    mockSendTransactionalEmail.mockResolvedValue({ sent: true });
  });

  it("skips an assigned agent who received any market AI update email within 48 hours", async () => {
    const db = setupNotificationDb([{ id: 9001 }]);

    const result = await notifyAssignedAgentsOfMarketProfileUpdate({
      marketProfileId: 42,
      previousProfile: {
        ...nextProfile,
        executiveSummary: "Previous market read.",
      },
      profile: nextProfile,
    });

    expect(result).toEqual({ notified: 0, skipped: 1 });
    expect(db.insert).not.toHaveBeenCalled();
    expect(mockGenerateMagicLinkUrl).not.toHaveBeenCalled();
    expect(mockSendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("sends when the delivery audit has no market AI update email in the last 48 hours", async () => {
    const db = setupNotificationDb([]);
    db.insert.mockReturnValue({
      values: vi.fn().mockResolvedValue([{ insertId: 81 }]),
    });

    const result = await notifyAssignedAgentsOfMarketProfileUpdate({
      marketProfileId: 42,
      previousProfile: {
        ...nextProfile,
        executiveSummary: "Previous market read.",
      },
      profile: nextProfile,
    });

    expect(result).toEqual({ notified: 1, skipped: 0 });
    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(mockSendTransactionalEmail).toHaveBeenCalledWith(
      "market_profile_updated",
      expect.objectContaining({ recipientEmail: "AVERY@EXAMPLE.COM" }),
      expect.objectContaining({ injectMagicLinks: false })
    );
  });

  it("also skips the administrator's real market AI update test email during the cooldown", async () => {
    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce(queryResult([{ name: "Asheville", state: "NC" }]))
        .mockReturnValueOnce(queryResult([{ id: 9001 }])),
      insert: vi.fn(),
    };
    mockGetDb.mockResolvedValue(db);

    const result = await sendMarketProfileUpdateTestEmail({
      marketProfileId: 42,
      recipient: { id: 17, name: "Avery Agent", email: "avery@example.com" },
    });

    expect(result).toEqual({ skipped: true });
    expect(db.insert).not.toHaveBeenCalled();
    expect(mockGenerateMagicLinkUrl).not.toHaveBeenCalled();
    expect(mockSendTransactionalEmail).not.toHaveBeenCalled();
  });
});
