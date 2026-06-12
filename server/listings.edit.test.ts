/**
 * Tests for listing edit parity — bulk-uploaded listings should be fully
 * editable by admins regardless of their current status.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Mock DB helpers ──────────────────────────────────────────────────────────
vi.mock("./db", () => ({
  getListingById: vi.fn(),
  updateListing: vi.fn(),
  logActivity: vi.fn(),
  createContact: vi.fn(),
  createProperty: vi.fn(),
}));

import * as db from "./db";

const mockGetListingById = db.getListingById as ReturnType<typeof vi.fn>;
const mockUpdateListing = db.updateListing as ReturnType<typeof vi.fn>;

// ─── Context factories ────────────────────────────────────────────────────────
function makeAdminCtx(): TrpcContext {
  const user = {
    id: 1,
    openId: "admin-open-id",
    email: "admin@example.com",
    name: "Admin User",
    loginMethod: "manus" as const,
    role: "admin" as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    realUser: user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn(), cookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

function makeAgentCtx(agentId = 10): TrpcContext {
  const user = {
    id: agentId,
    openId: "agent-open-id",
    email: "agent@example.com",
    name: "Agent User",
    loginMethod: "manus" as const,
    role: "agent" as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    realUser: user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn(), cookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

function makeListingRow(overrides: Record<string, any> = {}) {
  return {
    listing: {
      id: 42,
      agentId: 10,
      contactId: null,
      propertyId: null,
      listingStatus: "active",
      listPrice: "500000",
      listDate: new Date("2024-01-01"),
      expirationDate: new Date("2024-07-01"),
      terminationDate: null,
      mlsNumber: "MLS123",
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    },
    agent: null,
    contact: null,
    property: null,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("listings.update — edit parity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateListing.mockResolvedValue(undefined);
  });

  it("admin can edit an active listing", async () => {
    mockGetListingById.mockResolvedValue(makeListingRow());
    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.listings.update({
      id: 42,
      data: { listPrice: "550000", mlsNumber: "MLS999" },
    });
    expect(result).toEqual({ success: true });
    expect(mockUpdateListing).toHaveBeenCalledWith(42, expect.objectContaining({ listPrice: "550000" }));
  });

  it("admin can edit a TERMINATED bulk-uploaded listing", async () => {
    mockGetListingById.mockResolvedValue(makeListingRow({ listingStatus: "terminated" }));
    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.listings.update({
      id: 42,
      data: { listPrice: "480000", listingStatus: "active" },
    });
    expect(result).toEqual({ success: true });
    expect(mockUpdateListing).toHaveBeenCalledWith(42, expect.objectContaining({ listPrice: "480000", listingStatus: "active" }));
  });

  it("admin can edit an EXPIRED bulk-uploaded listing", async () => {
    mockGetListingById.mockResolvedValue(makeListingRow({ listingStatus: "expired" }));
    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.listings.update({
      id: 42,
      data: { expirationDate: "2025-12-31", listingStatus: "active" },
    });
    expect(result).toEqual({ success: true });
    expect(mockUpdateListing).toHaveBeenCalledWith(42, expect.objectContaining({ listingStatus: "active" }));
  });

  it("admin can edit a CONVERTED bulk-uploaded listing", async () => {
    mockGetListingById.mockResolvedValue(makeListingRow({ listingStatus: "converted" }));
    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.listings.update({
      id: 42,
      data: { mlsNumber: "CORRECTED-MLS", notes: "Imported with wrong status" },
    });
    expect(result).toEqual({ success: true });
    expect(mockUpdateListing).toHaveBeenCalledWith(42, expect.objectContaining({ mlsNumber: "CORRECTED-MLS" }));
  });

  it("admin can reassign the agent on a bulk-uploaded listing", async () => {
    mockGetListingById.mockResolvedValue(makeListingRow());
    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.listings.update({
      id: 42,
      data: { agentId: 99 },
    });
    expect(result).toEqual({ success: true });
    expect(mockUpdateListing).toHaveBeenCalledWith(42, expect.objectContaining({ agentId: 99 }));
  });

  it("admin can set terminationDate when correcting a terminated listing", async () => {
    mockGetListingById.mockResolvedValue(makeListingRow({ listingStatus: "terminated" }));
    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.listings.update({
      id: 42,
      data: { terminationDate: "2024-06-15" },
    });
    expect(result).toEqual({ success: true });
    expect(mockUpdateListing).toHaveBeenCalledWith(42, expect.objectContaining({
      terminationDate: new Date("2024-06-15"),
    }));
  });

  it("agent can edit their own active listing", async () => {
    mockGetListingById.mockResolvedValue(makeListingRow({ agentId: 10 }));
    const caller = appRouter.createCaller(makeAgentCtx(10));
    const result = await caller.listings.update({
      id: 42,
      data: { notes: "Updated by agent" },
    });
    expect(result).toEqual({ success: true });
  });

  it("agent CANNOT edit another agent's listing", async () => {
    mockGetListingById.mockResolvedValue(makeListingRow({ agentId: 99 }));
    const caller = appRouter.createCaller(makeAgentCtx(10)); // agent 10 trying to edit agent 99's listing
    await expect(
      caller.listings.update({ id: 42, data: { notes: "Unauthorized edit" } })
    ).rejects.toThrow();
  });

  it("non-admin non-agent user CANNOT edit listings", async () => {
    const user = {
      id: 5,
      openId: "isa-open-id",
      email: "isa@example.com",
      name: "ISA User",
      loginMethod: "manus" as const,
      role: "isa" as const,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    };
    const ctx: TrpcContext = {
      user: user as any,
      realUser: user as any,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: { clearCookie: vi.fn(), cookie: vi.fn() } as unknown as TrpcContext["res"],
    };
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.listings.update({ id: 42, data: { notes: "Unauthorized" } })
    ).rejects.toThrow("Only admins and agents can update listings");
  });

  it("update with no data fields still succeeds (no-op)", async () => {
    mockGetListingById.mockResolvedValue(makeListingRow());
    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.listings.update({ id: 42, data: {} });
    expect(result).toEqual({ success: true });
  });
});
