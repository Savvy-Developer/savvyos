import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetAgentConnections } = vi.hoisted(() => ({
  mockGetAgentConnections: vi.fn(),
}));

vi.mock("../db", () => ({
  createAgentConnection: vi.fn(),
  createTask: vi.fn(),
  getAgentConnectionById: vi.fn(),
  getAgentConnections: mockGetAgentConnections,
  getDb: vi.fn(),
  updateContact: vi.fn(),
  logActivity: vi.fn(),
  updateAgentConnection: vi.fn(),
}));
vi.mock("../_core/emailAlerts", () => ({ sendEmailAlert: vi.fn() }));
vi.mock("../_core/resendEmail", () => ({ sendTransactionalEmail: vi.fn() }));
vi.mock("../contactClientContext", () => ({ buildLeadAssignmentContext: vi.fn() }));

import { agentConnectionsRouter } from "./agentConnections";

function context(role: "admin" | "agent" | "isa" = "agent") {
  return { user: { id: 71, name: "Test Agent", role } } as any;
}

describe("agentConnections.list buy-box search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAgentConnections.mockResolvedValue({ rows: [], total: 0 });
  });

  it("keeps an agent scoped to their own pipeline while forwarding buy-box criteria", async () => {
    const caller = agentConnectionsRouter.createCaller(context("agent"));
    await caller.list({
      buyBoxSearch: {
        location: "Asheville",
        propertyType: "Cabin",
        minPrice: 400000,
        maxPrice: 750000,
        minBeds: 3,
        maxBeds: 5,
        minBaths: 2.5,
        minSqft: 1800,
        maxSqft: 3200,
      },
    });

    expect(mockGetAgentConnections).toHaveBeenCalledWith(expect.objectContaining({
      scopeAgentId: 71,
      agentId: undefined,
      buyBoxSearch: {
        location: "Asheville",
        propertyType: "Cabin",
        minPrice: 400000,
        maxPrice: 750000,
        minBeds: 3,
        maxBeds: 5,
        minBaths: 2.5,
        minSqft: 1800,
        maxSqft: 3200,
      },
    }));
  });

  it("rejects inverted buy-box search ranges", async () => {
    const caller = agentConnectionsRouter.createCaller(context("agent"));

    await expect(caller.list({
      buyBoxSearch: { minPrice: 800000, maxPrice: 500000 },
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(mockGetAgentConnections).not.toHaveBeenCalled();
  });
});
