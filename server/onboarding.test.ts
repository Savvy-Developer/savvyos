import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock DB - use a factory that returns a chainable mock ───────────────────
const mockDb = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  leftJoin: vi.fn().mockReturnThis(),
  innerJoin: vi.fn().mockReturnThis(),
  groupBy: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  values: vi.fn(),
  update: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis(),
  delete: vi.fn().mockReturnThis(),
  execute: vi.fn().mockResolvedValue(undefined),
};

vi.mock("./db", () => {
  return {
    getDb: vi.fn().mockImplementation(() => Promise.resolve(mockDb)),
    upsertUser: vi.fn(),
    getUserByOpenId: vi.fn(),
    getAllUsers: vi.fn().mockResolvedValue([]),
    getUsersByRole: vi.fn().mockResolvedValue([]),
    updateUserRole: vi.fn(),
    getContacts: vi.fn().mockResolvedValue([]),
    getContactById: vi.fn(),
    createContact: vi.fn(),
    updateContact: vi.fn(),
    getTransactions: vi.fn().mockResolvedValue([]),
    getTransactionById: vi.fn(),
    createTransaction: vi.fn(),
    updateTransaction: vi.fn(),
    getProperties: vi.fn().mockResolvedValue([]),
    getPropertyById: vi.fn(),
    createProperty: vi.fn(),
    updateProperty: vi.fn(),
    getPropertyOwnership: vi.fn().mockResolvedValue([]),
    getTasks: vi.fn().mockResolvedValue([]),
    getAllTasks: vi.fn().mockResolvedValue([]),
    createTask: vi.fn(),
    updateTask: vi.fn(),
    getDocuments: vi.fn().mockResolvedValue([]),
    createDocument: vi.fn(),
    deleteDocument: vi.fn(),
    getCommunications: vi.fn().mockResolvedValue([]),
    createCommunication: vi.fn(),
    getAgentConnections: vi.fn().mockResolvedValue([]),
    getAgentConnectionById: vi.fn(),
    createAgentConnection: vi.fn(),
    updateAgentConnection: vi.fn(),
    getPayoutItems: vi.fn().mockResolvedValue([]),
    createPayoutItem: vi.fn(),
    updatePayoutItem: vi.fn(),
    deletePayoutItem: vi.fn(),
    validatePayoutIntegrity: vi.fn().mockResolvedValue({ valid: true, total: 0 }),
    getReferralPartners: vi.fn().mockResolvedValue([]),
    createReferralPartner: vi.fn(),
    updateReferralPartner: vi.fn(),
    deleteReferralPartner: vi.fn(),
    getGroups: vi.fn().mockResolvedValue([]),
    logActivity: vi.fn(),
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
    getListingById: vi.fn(),
    createListing: vi.fn(),
    updateListing: vi.fn(),
    getContactProperties: vi.fn().mockResolvedValue([]),
    linkContactProperty: vi.fn(),
    unlinkContactProperty: vi.fn(),
    getLeadSources: vi.fn().mockResolvedValue([]),
    createLeadSource: vi.fn(),
    updateLeadSource: vi.fn(),
    deleteLeadSource: vi.fn(),
    createGroup: vi.fn(),
    updateGroup: vi.fn(),
    deleteGroup: vi.fn(),
    getGroupMembers: vi.fn().mockResolvedValue([]),
    addGroupMember: vi.fn(),
    removeGroupMember: vi.fn(),
    deleteAgentConnection: vi.fn(),
    getTransactionTypeBreakdown: vi.fn().mockResolvedValue([]),
  };
});

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

vi.mock("./_core/resendEmail", () => ({
  sendTransactionalEmail: vi.fn().mockResolvedValue(undefined),
}));

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function makeCtx(overrides: Partial<TrpcContext["user"]> = {}): TrpcContext {
  const user = {
    id: 1,
    openId: "test-user",
    email: "test@savvy.com",
    name: "Test Admin",
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

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("onboarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset chainable mocks
    mockDb.select.mockReturnThis();
    mockDb.from.mockReturnThis();
    mockDb.where.mockReturnThis();
    mockDb.orderBy.mockReturnThis();
    mockDb.leftJoin.mockReturnThis();
    mockDb.innerJoin.mockReturnThis();
    mockDb.groupBy.mockReturnThis();
    mockDb.limit.mockReturnThis();
    mockDb.insert.mockReturnThis();
    mockDb.update.mockReturnThis();
    mockDb.set.mockReturnThis();
    mockDb.delete.mockReturnThis();
    mockDb.execute.mockResolvedValue(undefined);
  });

  // ─── Schema ──────────────────────────────────────────────────────────────────

  describe("schema", () => {
    it("onboardingTemplateTasks has dueDaysOffset field", async () => {
      const { onboardingTemplateTasks } = await import("../drizzle/schema");
      expect(onboardingTemplateTasks.dueDaysOffset).toBeDefined();
      expect(onboardingTemplateTasks.dueDaysOffset.name).toBe("dueDaysOffset");
    });

    it("onboardingInstanceTasks has dueDate field", async () => {
      const { onboardingInstanceTasks } = await import("../drizzle/schema");
      expect(onboardingInstanceTasks.dueDate).toBeDefined();
      expect(onboardingInstanceTasks.dueDate.name).toBe("dueDate");
    });

    it("onboardingTemplates has type field", async () => {
      const { onboardingTemplates } = await import("../drizzle/schema");
      expect(onboardingTemplates.type).toBeDefined();
      expect(onboardingTemplates.type.name).toBe("type");
    });
  });

  // ─── Template Task CRUD ──────────────────────────────────────────────────────

  describe("template task CRUD with dueDaysOffset", () => {
    it("addTemplateTask accepts dueDaysOffset", async () => {
      mockDb.where.mockResolvedValueOnce([{ max: 0 }]);
      mockDb.values.mockResolvedValueOnce([{ insertId: 1 }]);

      const caller = appRouter.createCaller(makeCtx());
      const result = await caller.onboarding.addTemplateTask({
        templateId: 1,
        title: "Complete W-9",
        assignee: "agent",
        dueDaysOffset: 3,
      });
      expect(result.id).toBe(1);

      const valuesCall = mockDb.values.mock.calls[0]?.[0];
      expect(valuesCall).toBeDefined();
      expect(valuesCall.dueDaysOffset).toBe(3);
    });

    it("addTemplateTask allows null dueDaysOffset (no deadline)", async () => {
      mockDb.where.mockResolvedValueOnce([{ max: 0 }]);
      mockDb.values.mockResolvedValueOnce([{ insertId: 2 }]);

      const caller = appRouter.createCaller(makeCtx());
      const result = await caller.onboarding.addTemplateTask({
        templateId: 1,
        title: "Read handbook",
        assignee: "agent",
        dueDaysOffset: null,
      });
      expect(result.id).toBe(2);

      const valuesCall = mockDb.values.mock.calls[0]?.[0];
      expect(valuesCall.dueDaysOffset).toBeNull();
    });

    it("updateTemplateTask can update dueDaysOffset", async () => {
      mockDb.where.mockResolvedValueOnce(undefined);

      const caller = appRouter.createCaller(makeCtx());
      const result = await caller.onboarding.updateTemplateTask({
        id: 1,
        dueDaysOffset: 7,
      });
      expect(result.success).toBe(true);
    });
  });

  // ─── Instance Creation ───────────────────────────────────────────────────────

  describe("instance creation computes due dates", () => {
    it("createInstance computes dueDate from startedAt + dueDaysOffset", async () => {
      let capturedValues: any[] = [];

      mockDb.values.mockResolvedValueOnce([{ insertId: 100 }]);

      mockDb.orderBy.mockResolvedValueOnce([
        { id: 1, templateId: 1, title: "Task A", description: null, assignee: "agent", sortOrder: 0, dueDaysOffset: 3 },
        { id: 2, templateId: 1, title: "Task B", description: null, assignee: "admin", sortOrder: 1, dueDaysOffset: null },
        { id: 3, templateId: 1, title: "Task C", description: "Desc", assignee: "agent", sortOrder: 2, dueDaysOffset: 7 },
      ]);

      mockDb.values.mockImplementationOnce((vals: any[]) => {
        capturedValues = vals;
        return Promise.resolve([{ insertId: 200 }]);
      });

      const caller = appRouter.createCaller(makeCtx());
      const result = await caller.onboarding.createInstance({
        agentUserId: 5,
        templateId: 1,
      });
      expect(result.id).toBe(100);

      expect(capturedValues.length).toBe(3);

      const taskA = capturedValues[0];
      expect(taskA.title).toBe("Task A");
      expect(taskA.dueDate).toBeInstanceOf(Date);
      const threeDaysFromNow = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
      expect(Math.abs(taskA.dueDate.getTime() - threeDaysFromNow.getTime())).toBeLessThan(5000);

      const taskB = capturedValues[1];
      expect(taskB.title).toBe("Task B");
      expect(taskB.dueDate).toBeNull();

      const taskC = capturedValues[2];
      expect(taskC.title).toBe("Task C");
      expect(taskC.dueDate).toBeInstanceOf(Date);
      const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      expect(Math.abs(taskC.dueDate.getTime() - sevenDaysFromNow.getTime())).toBeLessThan(5000);
    });
  });

  // ─── hasActiveOnboarding ─────────────────────────────────────────────────────

  describe("hasActiveOnboarding", () => {
    it("returns active: true when agent has in_progress instance", async () => {
      mockDb.where.mockResolvedValueOnce([{ count: 1 }]);

      const caller = appRouter.createCaller(makeCtx({ id: 5, role: "agent" }));
      const result = await caller.onboarding.hasActiveOnboarding();
      expect(result.active).toBe(true);
    });

    it("returns active: false when agent has no in_progress instance", async () => {
      mockDb.where.mockResolvedValueOnce([{ count: 0 }]);

      const caller = appRouter.createCaller(makeCtx({ id: 5, role: "agent" }));
      const result = await caller.onboarding.hasActiveOnboarding();
      expect(result.active).toBe(false);
    });
  });

  // ─── Bulk Extend Due Dates ───────────────────────────────────────────────────

  describe("bulkExtendDueDates", () => {
    it("shifts all due dates by positive days", async () => {
      // Mock select for instance existence check
      mockDb.where.mockResolvedValueOnce([{ id: 1, agentUserId: 5, status: "in_progress" }]);

      const caller = appRouter.createCaller(makeCtx());
      const result = await caller.onboarding.bulkExtendDueDates({
        instanceId: 1,
        days: 7,
      });
      expect(result.success).toBe(true);
      expect(mockDb.execute).toHaveBeenCalledTimes(1);
    });

    it("shifts all due dates by negative days (shorten)", async () => {
      mockDb.where.mockResolvedValueOnce([{ id: 1, agentUserId: 5, status: "in_progress" }]);

      const caller = appRouter.createCaller(makeCtx());
      const result = await caller.onboarding.bulkExtendDueDates({
        instanceId: 1,
        days: -3,
      });
      expect(result.success).toBe(true);
      expect(mockDb.execute).toHaveBeenCalledTimes(1);
    });

    it("rejects if instance not found", async () => {
      mockDb.where.mockResolvedValueOnce([]);

      const caller = appRouter.createCaller(makeCtx());
      await expect(
        caller.onboarding.bulkExtendDueDates({ instanceId: 999, days: 7 })
      ).rejects.toThrow("NOT_FOUND");
    });

    it("is forbidden for agents", async () => {
      const caller = appRouter.createCaller(makeCtx({ role: "agent" }));
      await expect(
        caller.onboarding.bulkExtendDueDates({ instanceId: 1, days: 7 })
      ).rejects.toThrow("FORBIDDEN");
    });
  });

  // ─── Update Task Due Date ────────────────────────────────────────────────────

  describe("updateTaskDueDate", () => {
    it("updates a single task due date", async () => {
      // Mock select for task existence
      mockDb.where
        .mockResolvedValueOnce([{ id: 10, instanceId: 1, dueDate: new Date() }])
        // Mock the update().set().where() chain
        .mockResolvedValueOnce(undefined);

      const caller = appRouter.createCaller(makeCtx());
      const result = await caller.onboarding.updateTaskDueDate({
        taskId: 10,
        dueDate: "2026-04-15",
      });
      expect(result.success).toBe(true);
    });

    it("clears due date when null is passed", async () => {
      mockDb.where
        .mockResolvedValueOnce([{ id: 10, instanceId: 1, dueDate: new Date() }])
        .mockResolvedValueOnce(undefined);

      const caller = appRouter.createCaller(makeCtx());
      const result = await caller.onboarding.updateTaskDueDate({
        taskId: 10,
        dueDate: null,
      });
      expect(result.success).toBe(true);
    });

    it("rejects if task not found", async () => {
      mockDb.where.mockResolvedValueOnce([]);

      const caller = appRouter.createCaller(makeCtx());
      await expect(
        caller.onboarding.updateTaskDueDate({ taskId: 999, dueDate: "2026-04-15" })
      ).rejects.toThrow("NOT_FOUND");
    });

    it("is forbidden for agents", async () => {
      const caller = appRouter.createCaller(makeCtx({ role: "agent" }));
      await expect(
        caller.onboarding.updateTaskDueDate({ taskId: 10, dueDate: "2026-04-15" })
      ).rejects.toThrow("FORBIDDEN");
    });
  });

  // ─── Trigger Overdue Check ───────────────────────────────────────────────────

  describe("triggerOverdueCheck", () => {
    it("runs overdue check for admin", async () => {
      // The scheduler will query DB and find no overdue tasks
      mockDb.where.mockResolvedValueOnce([]);

      const caller = appRouter.createCaller(makeCtx());
      const result = await caller.onboarding.triggerOverdueCheck();
      expect(result.success).toBe(true);
    });

    it("is forbidden for agents", async () => {
      const caller = appRouter.createCaller(makeCtx({ role: "agent" }));
      await expect(caller.onboarding.triggerOverdueCheck()).rejects.toThrow("FORBIDDEN");
    });
  });

  // ─── Onboarding Report ──────────────────────────────────────────────────────

  describe("getReport", () => {
    it("returns summary and agent breakdown", async () => {
      // Mock totals query: db.select().from()
      mockDb.from.mockResolvedValueOnce([{
        totalInstances: 5,
        completedInstances: 3,
        inProgressInstances: 2,
        avgCompletionDays: 12,
      }]);

      // Mock overdue stats query: db.select().from().innerJoin().where()
      // from() returns mockDb which needs innerJoin
      mockDb.from.mockReturnValueOnce({
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ overdueTaskCount: 4 }]),
        }),
      });

      // Mock on-time stats query: db.select().from()
      mockDb.from.mockResolvedValueOnce([{
        totalCompletedWithDue: 10,
        completedOnTime: 8,
      }]);

      // Mock agent breakdown query: db.select().from().innerJoin().groupBy().orderBy()
      mockDb.from.mockReturnValueOnce({
        innerJoin: vi.fn().mockReturnValue({
          groupBy: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue([
              {
                agentId: 5,
                agentName: "Dev Agent",
                agentEmail: "dev@test.com",
                totalInstances: 2,
                completedInstances: 1,
                avgDays: 10,
                overdueTasks: 1,
              },
            ]),
          }),
        }),
      });

      const caller = appRouter.createCaller(makeCtx());
      const result = await caller.onboarding.getReport();

      expect(result.summary.totalInstances).toBe(5);
      expect(result.summary.completedInstances).toBe(3);
      expect(result.summary.inProgressInstances).toBe(2);
      expect(result.summary.avgCompletionDays).toBe(12);
      expect(result.summary.overdueTaskCount).toBe(4);
      expect(result.summary.onTimeRate).toBe(80); // 8/10 = 80%

      expect(result.agentBreakdown).toHaveLength(1);
      expect(result.agentBreakdown[0].agentName).toBe("Dev Agent");
      expect(result.agentBreakdown[0].overdueTasks).toBe(1);
    });

    it("returns 100% on-time rate when no tasks with due dates completed", async () => {
      mockDb.from.mockResolvedValueOnce([{
        totalInstances: 1,
        completedInstances: 0,
        inProgressInstances: 1,
        avgCompletionDays: null,
      }]);

      mockDb.from.mockReturnValueOnce({
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ overdueTaskCount: 0 }]),
        }),
      });

      mockDb.from.mockResolvedValueOnce([{
        totalCompletedWithDue: 0,
        completedOnTime: 0,
      }]);

      mockDb.from.mockReturnValueOnce({
        innerJoin: vi.fn().mockReturnValue({
          groupBy: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const caller = appRouter.createCaller(makeCtx());
      const result = await caller.onboarding.getReport();

      expect(result.summary.onTimeRate).toBe(100);
      expect(result.summary.avgCompletionDays).toBeNull();
      expect(result.agentBreakdown).toHaveLength(0);
    });

    it("is forbidden for agents", async () => {
      const caller = appRouter.createCaller(makeCtx({ role: "agent" }));
      await expect(caller.onboarding.getReport()).rejects.toThrow("FORBIDDEN");
    });
  });

  // ─── Agent Onboarding Status ─────────────────────────────────────────────────

  describe("agentOnboardingStatus", () => {
    it("returns active instances for a given agent (admin)", async () => {
      mockDb.orderBy.mockResolvedValueOnce([
        {
          instance: { id: 1, agentUserId: 5, status: "in_progress", startedAt: new Date() },
          template: { id: 10, name: "Offboarding Checklist", type: "offboarding" },
          totalTasks: 5,
          completedTasks: 2,
        },
      ]);

      const caller = appRouter.createCaller(makeCtx());
      const result = await caller.onboarding.agentOnboardingStatus({ agentUserId: 5 });
      expect(result).toHaveLength(1);
      expect(result[0].template?.type).toBe("offboarding");
      expect(Number(result[0].totalTasks)).toBe(5);
    });

    it("returns empty array when no active instances", async () => {
      mockDb.orderBy.mockResolvedValueOnce([]);

      const caller = appRouter.createCaller(makeCtx());
      const result = await caller.onboarding.agentOnboardingStatus({ agentUserId: 99 });
      expect(result).toHaveLength(0);
    });

    it("is forbidden for agents", async () => {
      const caller = appRouter.createCaller(makeCtx({ role: "agent" }));
      await expect(
        caller.onboarding.agentOnboardingStatus({ agentUserId: 5 })
      ).rejects.toThrow("FORBIDDEN");
    });
  });

  // ─── Template Type ──────────────────────────────────────────────────────────

  describe("template type", () => {
    it("createTemplate accepts type field", async () => {
      mockDb.values.mockResolvedValueOnce([{ insertId: 50 }]);

      const caller = appRouter.createCaller(makeCtx());
      const result = await caller.onboarding.createTemplate({
        name: "Offboarding Checklist",
        type: "offboarding",
      });
      expect(result.id).toBe(50);

      const valuesCall = mockDb.values.mock.calls[0]?.[0];
      expect(valuesCall.type).toBe("offboarding");
    });

    it("createTemplate defaults to onboarding type", async () => {
      mockDb.values.mockResolvedValueOnce([{ insertId: 51 }]);

      const caller = appRouter.createCaller(makeCtx());
      const result = await caller.onboarding.createTemplate({
        name: "New Hire Onboarding",
      });
      expect(result.id).toBe(51);

      const valuesCall = mockDb.values.mock.calls[0]?.[0];
      expect(valuesCall.type).toBe("onboarding");
    });
  });

  // ─── Access Control ──────────────────────────────────────────────────────────

  describe("access control", () => {
    it("listTemplates is forbidden for agents", async () => {
      const caller = appRouter.createCaller(makeCtx({ role: "agent" }));
      await expect(caller.onboarding.listTemplates()).rejects.toThrow("FORBIDDEN");
    });

    it("addTemplateTask is forbidden for agents", async () => {
      const caller = appRouter.createCaller(makeCtx({ role: "agent" }));
      await expect(
        caller.onboarding.addTemplateTask({
          templateId: 1,
          title: "Test",
          assignee: "agent",
        })
      ).rejects.toThrow("FORBIDDEN");
    });

    it("createInstance is forbidden for agents", async () => {
      const caller = appRouter.createCaller(makeCtx({ role: "agent" }));
      await expect(
        caller.onboarding.createInstance({ agentUserId: 5, templateId: 1 })
      ).rejects.toThrow("FORBIDDEN");
    });

    it("listInstances is forbidden for agents", async () => {
      const caller = appRouter.createCaller(makeCtx({ role: "agent" }));
      await expect(caller.onboarding.listInstances()).rejects.toThrow("FORBIDDEN");
    });
  });

  // ─── Validation ──────────────────────────────────────────────────────────────

  describe("dueDaysOffset validation", () => {
    it("rejects dueDaysOffset of 0", async () => {
      const caller = appRouter.createCaller(makeCtx());
      await expect(
        caller.onboarding.addTemplateTask({
          templateId: 1,
          title: "Test",
          assignee: "agent",
          dueDaysOffset: 0,
        })
      ).rejects.toThrow();
    });

    it("rejects negative dueDaysOffset", async () => {
      const caller = appRouter.createCaller(makeCtx());
      await expect(
        caller.onboarding.addTemplateTask({
          templateId: 1,
          title: "Test",
          assignee: "agent",
          dueDaysOffset: -1,
        })
      ).rejects.toThrow();
    });
  });
});
