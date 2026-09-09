import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

vi.mock("./db", () => ({
  getListingById: vi.fn(),
  getListingDocuments: vi.fn(),
  createTransaction: vi.fn(),
  createTransactionDocument: vi.fn(),
  updateListing: vi.fn(),
  logActivity: vi.fn(),
}));

vi.mock("./routers/referrals", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./routers/referrals")>();
  return {
    ...actual,
    linkReferralTransaction: vi.fn(),
  };
});

import * as db from "./db";

const mockGetListingById = db.getListingById as ReturnType<typeof vi.fn>;
const mockGetListingDocuments = db.getListingDocuments as ReturnType<typeof vi.fn>;
const mockCreateTransaction = db.createTransaction as ReturnType<typeof vi.fn>;
const mockUpdateListing = db.updateListing as ReturnType<typeof vi.fn>;

function makeAdminCtx(): TrpcContext {
  const user = {
    id: 1,
    openId: "admin-open-id",
    email: "admin@example.com",
    name: "Admin User",
    loginMethod: "password" as const,
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

function makeListingRow() {
  return {
    listing: {
      id: 42,
      agentId: 10,
      contactId: 20,
      propertyId: 30,
      listingStatus: "active",
      referralId: null,
      referralAgentId: null,
      isOutsideReferral: false,
      savvyReferralPct: null,
      referralMarket: null,
    },
    agent: null,
    contact: null,
    property: null,
  };
}

describe("listings.convertToTransaction", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetListingById.mockResolvedValue(makeListingRow());
    mockGetListingDocuments.mockResolvedValue([]);
    mockCreateTransaction.mockResolvedValueOnce(101).mockResolvedValueOnce(102);
    mockUpdateListing.mockResolvedValue(undefined);
  });

  it("keeps a seller listing under contract after creating its transaction", async () => {
    const caller = appRouter.createCaller(makeAdminCtx());

    const result = await caller.listings.convertToTransaction({
      listingId: 42,
      transactionType: "seller",
      primaryContactId: 20,
      purchasePrice: "500000",
      commissionRate: "0.03",
      commissionType: "percentage",
    });

    expect(result).toEqual({ transactionId: 101 });
    expect(mockCreateTransaction).toHaveBeenCalledWith(expect.objectContaining({
      listingId: 42,
      status: "under_contract",
      transactionType: "seller",
    }));
    expect(mockUpdateListing).toHaveBeenCalledWith(42, {
      listingStatus: "under_contract",
      convertedTransactionId: 101,
    });
  });

  it("keeps a dual-agency listing under contract after creating both transactions", async () => {
    const caller = appRouter.createCaller(makeAdminCtx());

    const result = await caller.listings.convertToTransaction({
      listingId: 42,
      transactionType: "dual",
      primaryContactId: 20,
      buyerContactId: 21,
      purchasePrice: "500000",
      commissionRate: "0.03",
      commissionType: "percentage",
      buyerCommissionRate: "0.025",
      buyerCommissionType: "percentage",
    });

    expect(result).toEqual({ transactionId: 101, buyerTransactionId: 102, dual: true });
    expect(mockCreateTransaction).toHaveBeenCalledTimes(2);
    expect(mockUpdateListing).toHaveBeenCalledWith(42, {
      listingStatus: "under_contract",
      convertedTransactionId: 101,
    });
  });
});
