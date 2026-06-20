import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Mock DB helpers ────────────────────────────────────────────────────────
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
  upsertUser: vi.fn().mockResolvedValue(undefined),
  getUserByOpenId: vi.fn().mockResolvedValue(undefined),
  getAllUsers: vi.fn().mockResolvedValue([]),
  getUsersByRole: vi.fn().mockResolvedValue([]),
  updateUserRole: vi.fn().mockResolvedValue(undefined),
  getContacts: vi.fn().mockResolvedValue([]),
  getContactById: vi.fn().mockResolvedValue(null),
  createContact: vi.fn().mockResolvedValue(1),
  updateContact: vi.fn().mockResolvedValue(undefined),
  getTransactions: vi.fn().mockResolvedValue([]),
  getTransactionById: vi.fn().mockResolvedValue(null),
  createTransaction: vi.fn().mockResolvedValue(1),
  updateTransaction: vi.fn().mockResolvedValue(undefined),
  getProperties: vi.fn().mockResolvedValue([]),
  getPropertyById: vi.fn().mockResolvedValue(null),
  createProperty: vi.fn().mockResolvedValue(1),
  updateProperty: vi.fn().mockResolvedValue(undefined),
  getPropertyOwnership: vi.fn().mockResolvedValue([]),
  getTasks: vi.fn().mockResolvedValue([]),
  getAllTasks: vi.fn().mockResolvedValue([]),
  createTask: vi.fn().mockResolvedValue(1),
  updateTask: vi.fn().mockResolvedValue(undefined),
  getDocuments: vi.fn().mockResolvedValue([]),
  createDocument: vi.fn().mockResolvedValue(1),
  deleteDocument: vi.fn().mockResolvedValue(undefined),
  getCommunications: vi.fn().mockResolvedValue([]),
  createCommunication: vi.fn().mockResolvedValue(1),
  getAgentConnections: vi.fn().mockResolvedValue([]),
  getAgentConnectionById: vi.fn().mockResolvedValue(null),
  createAgentConnection: vi.fn().mockResolvedValue(1),
  updateAgentConnection: vi.fn().mockResolvedValue(undefined),
  getPayoutItems: vi.fn().mockResolvedValue([]),
  createPayoutItem: vi.fn().mockResolvedValue(1),
  updatePayoutItem: vi.fn().mockResolvedValue(undefined),
  deletePayoutItem: vi.fn().mockResolvedValue(undefined),
  validatePayoutIntegrity: vi.fn().mockResolvedValue({ valid: true, total: 0 }),
  getReferralPartners: vi.fn().mockResolvedValue([]),
  createReferralPartner: vi.fn().mockResolvedValue(1),
  updateReferralPartner: vi.fn().mockResolvedValue(undefined),
  deleteReferralPartner: vi.fn().mockResolvedValue(undefined),
  getGroups: vi.fn().mockResolvedValue([]),
  logActivity: vi.fn().mockResolvedValue(undefined),
  getActivityLog: vi.fn().mockResolvedValue([]),
  getAnalyticsOverview: vi.fn().mockResolvedValue({
    totalContacts: 0, newContactsThisMonth: 0, totalTransactions: 0,
    closedTransactions: 0, totalCommission: "0", avgDaysToClose: 0,
    pendingTasks: 0, overdueTasksCount: 0,
  }),
  getMonthlyRevenue: vi.fn().mockResolvedValue([]),
  getPipelineByStatus: vi.fn().mockResolvedValue([]),
  getAnalyticsSummary: vi.fn().mockResolvedValue({
    totalContacts: 0, newContactsThisMonth: 0, totalTransactions: 0,
    closedTransactions: 0, totalCommission: "0", avgDaysToClose: 0,
    pendingTasks: 0, overdueTasksCount: 0,
  }),
  getAgentPerformance: vi.fn().mockResolvedValue([]),
  getLeadSourceBreakdown: vi.fn().mockResolvedValue([]),
  getTransactionTimeline: vi.fn().mockResolvedValue([]),
  getListings: vi.fn().mockResolvedValue([]),
  getListingById: vi.fn().mockResolvedValue(null),
  createListing: vi.fn().mockResolvedValue(1),
  updateListing: vi.fn().mockResolvedValue(undefined),
  getContactProperties: vi.fn().mockResolvedValue([]),
  linkContactProperty: vi.fn().mockResolvedValue(1),
  unlinkContactProperty: vi.fn().mockResolvedValue(undefined),
  getLeadSources: vi.fn().mockResolvedValue([]),
  createLeadSource: vi.fn().mockResolvedValue(1),
  updateLeadSource: vi.fn().mockResolvedValue(undefined),
  deleteLeadSource: vi.fn().mockResolvedValue(undefined),
  createGroup: vi.fn().mockResolvedValue(1),
  updateGroup: vi.fn().mockResolvedValue(undefined),
  deleteGroup: vi.fn().mockResolvedValue(undefined),
  getGroupMembers: vi.fn().mockResolvedValue([]),
  addGroupMember: vi.fn().mockResolvedValue(1),
  removeGroupMember: vi.fn().mockResolvedValue(undefined),
  deleteAgentConnection: vi.fn().mockResolvedValue(undefined),
  getTransactionTypeBreakdown: vi.fn().mockResolvedValue([]),
  getUserById: vi.fn().mockResolvedValue(null),
  updateUser: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({ key: "test-key", url: "https://cdn.example.com/test.pdf" }),
  storageGet: vi.fn().mockResolvedValue({ key: "test-key", url: "https://cdn.example.com/test.pdf" }),
}));

vi.mock("./_core/emailAlerts", () => ({
  sendEmailAlert: vi.fn().mockResolvedValue(undefined),
  sendLeadAssignedAlert: vi.fn().mockResolvedValue(undefined),
  sendTransactionStatusAlert: vi.fn().mockResolvedValue(undefined),
  sendCommissionCalculatedAlert: vi.fn().mockResolvedValue(undefined),
  sendTaskDueAlert: vi.fn().mockResolvedValue(undefined),
}));



// ─── Helper: create a mock context ──────────────────────────────────────────
function makeCtx(overrides: Partial<TrpcContext["user"]> = {}): TrpcContext {
  const user = {
    id: 1,
    openId: "test-user",
    email: "test@savvy.com",
    name: "Test User",
    loginMethod: "manus",
    role: "admin" as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

// ─── Auth tests ──────────────────────────────────────────────────────────────
describe("auth", () => {
  it("me returns the current user", async () => {
    const ctx = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const me = await caller.auth.me();
    expect(me).toBeTruthy();
    expect(me?.email).toBe("test@savvy.com");
  });

  it("logout clears session cookie", async () => {
    const clearedCookies: string[] = [];
    const ctx = makeCtx();
    (ctx.res as any).clearCookie = (name: string) => clearedCookies.push(name);
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result.success).toBe(true);
    // Logout clears the session cookie, simulate cookie, and work_as cookie
    expect(clearedCookies.length).toBe(3);
    expect(clearedCookies).toContain("app_session_id");
    expect(clearedCookies).toContain("simulate_user_id");
    expect(clearedCookies).toContain("work_as_agent_id");
  });
});

// ─── Contacts tests ──────────────────────────────────────────────────────────
describe("contacts", () => {
  it("list returns empty array when no contacts", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.contacts.list({});
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  it("create validates required fields", async () => {
    const { createContact } = await import("./db");
    (createContact as any).mockResolvedValueOnce(42);
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.contacts.create({
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
      phone: null,
      leadSourceType: "referral",
      contactType: "buyer",
    });
    expect(result.id).toBe(42);
  });

  it("get throws NOT_FOUND for missing contact", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(caller.contacts.get({ id: 9999 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

// ─── Transactions tests ──────────────────────────────────────────────────────
describe("transactions", () => {
  it("list returns empty array", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.transactions.list({});
    expect(Array.isArray(result)).toBe(true);
  });

  it("create returns new transaction id", async () => {
    const { createTransaction } = await import("./db");
    (createTransaction as any).mockResolvedValueOnce(10);
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.transactions.create({
      agentId: 1,
      primaryContactId: 1,
      propertyId: 1,
      transactionType: "buyer",
      status: "active",
      purchasePrice: "500000",
    });
    expect(result.id).toBe(10);
  });
});

// ─── Tasks tests ─────────────────────────────────────────────────────────────
describe("tasks", () => {
  it("listAll returns empty array", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.tasks.listAll({});
    expect(Array.isArray(result)).toBe(true);
  });

  it("create returns task id", async () => {
    const { createTask } = await import("./db");
    (createTask as any).mockResolvedValueOnce(5);
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.tasks.create({
      title: "Follow up with buyer",
      description: null,
      priority: "high",
      taskType: "follow_up",
      dueDate: null,
      assignedToId: null,
    });
    expect(result.id).toBe(5);
  });
});

// ─── Analytics tests ─────────────────────────────────────────────────────────
describe("analytics", () => {
  it("overview returns expected shape", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.analytics.overview();
    expect(result).toHaveProperty("totalContacts");
    expect(result).toHaveProperty("totalTransactions");
    expect(result).toHaveProperty("totalCommission");
  });

  it("agentPerformance returns array", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.analytics.agentPerformance();
    expect(Array.isArray(result)).toBe(true);
  });
});

// ─── Documents tests ─────────────────────────────────────────────────────────
describe("documents", () => {
  it("list returns empty array", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.documents.list({});
    expect(Array.isArray(result)).toBe(true);
  });

  it("getUploadUrl returns fileKey", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.documents.getUploadUrl({
      fileName: "contract.pdf",
      mimeType: "application/pdf",
      fileSize: 1024,
    });
    expect(result.fileKey).toContain("documents/");
    expect(result.uploadReady).toBe(true);
  });
});

// ─── Users tests ─────────────────────────────────────────────────────────────
describe("users", () => {
  it("list returns array", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.users.list({});
    expect(Array.isArray(result)).toBe(true);
  });

  describe("toggleActive", () => {
    it("deactivates a user", async () => {
      const { getUserById, updateUser } = await import("./db");
      (getUserById as any).mockResolvedValueOnce({
        id: 5, email: "agent@savvy.com", name: "Agent", role: "agent", isActive: true,
      });
      (updateUser as any).mockResolvedValueOnce(undefined);

      const caller = appRouter.createCaller(makeCtx());
      const result = await caller.users.toggleActive({ userId: 5, isActive: false });
      expect(result.success).toBe(true);
      expect(result.isActive).toBe(false);
      expect(updateUser).toHaveBeenCalledWith(5, { isActive: false });
    });

    it("activates a deactivated user", async () => {
      const { getUserById, updateUser } = await import("./db");
      (getUserById as any).mockResolvedValueOnce({
        id: 5, email: "agent@savvy.com", name: "Agent", role: "agent", isActive: false,
      });
      (updateUser as any).mockResolvedValueOnce(undefined);

      const caller = appRouter.createCaller(makeCtx());
      const result = await caller.users.toggleActive({ userId: 5, isActive: true });
      expect(result.success).toBe(true);
      expect(result.isActive).toBe(true);
    });

    it("prevents deactivating tyler@savvy.realty", async () => {
      const { getUserById } = await import("./db");
      (getUserById as any).mockResolvedValueOnce({
        id: 99, email: "tyler@savvy.realty", name: "Tyler", role: "admin", isActive: true,
      });

      const caller = appRouter.createCaller(makeCtx());
      await expect(
        caller.users.toggleActive({ userId: 99, isActive: false })
      ).rejects.toThrow("This account cannot be deactivated");
    });

    it("allows activating tyler@savvy.realty (reactivation is fine)", async () => {
      const { getUserById, updateUser } = await import("./db");
      (getUserById as any).mockResolvedValueOnce({
        id: 99, email: "tyler@savvy.realty", name: "Tyler", role: "admin", isActive: false,
      });
      (updateUser as any).mockResolvedValueOnce(undefined);

      const caller = appRouter.createCaller(makeCtx());
      const result = await caller.users.toggleActive({ userId: 99, isActive: true });
      expect(result.success).toBe(true);
    });

    it("prevents deactivating yourself", async () => {
      const caller = appRouter.createCaller(makeCtx({ id: 1 }));
      await expect(
        caller.users.toggleActive({ userId: 1, isActive: false })
      ).rejects.toThrow("Cannot deactivate your own account");
    });

    it("rejects if user not found", async () => {
      const { getUserById } = await import("./db");
      (getUserById as any).mockResolvedValueOnce(undefined);

      const caller = appRouter.createCaller(makeCtx());
      await expect(
        caller.users.toggleActive({ userId: 999, isActive: false })
      ).rejects.toThrow("User not found");
    });

    it("is forbidden for non-admins", async () => {
      const caller = appRouter.createCaller(makeCtx({ role: "agent" }));
      await expect(
        caller.users.toggleActive({ userId: 5, isActive: false })
      ).rejects.toThrow("FORBIDDEN");
    });
  });
});
