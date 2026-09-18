import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "../db";
import { ADMIN_NAV_PERMISSIONS, permissionsRouter } from "./permissions";

vi.mock("../db", () => ({
  getDb: vi.fn(),
}));

type AdminRow = {
  id: number;
  name: string | null;
  email: string | null;
  role: string;
  isActive: boolean;
  adminStatus: string | null;
};

function makeManagerContext() {
  return {
    user: {
      id: 1,
      email: "tyler@savvy.realty",
      name: "Tyler",
      role: "admin",
    },
  } as any;
}

function makeDb(adminRows: AdminRow[], permissionRows: Array<Record<string, unknown>> = []) {
  const adminQuery = {
    from: vi.fn(),
    leftJoin: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
  };
  adminQuery.from.mockReturnValue(adminQuery);
  adminQuery.leftJoin.mockReturnValue(adminQuery);
  adminQuery.where.mockReturnValue(adminQuery);
  adminQuery.orderBy.mockResolvedValue(adminRows);
  adminQuery.limit.mockResolvedValue(adminRows);

  return {
    select: vi.fn((shape?: Record<string, unknown>) => {
      if (shape && "adminStatus" in shape) return adminQuery;
      return { from: vi.fn().mockResolvedValue(permissionRows) };
    }),
    update: vi.fn(),
    insert: vi.fn(),
    __adminQuery: adminQuery,
  };
}

describe("Super Permissions active-admin eligibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns only active admins to the matrix/search result source and preserves legacy active profiles", async () => {
    const rows: AdminRow[] = [
      { id: 1, name: "Active Admin", email: "active@savvy.realty", role: "admin", isActive: true, adminStatus: "active" },
      { id: 2, name: "Inactive Admin", email: "inactive@savvy.realty", role: "admin", isActive: true, adminStatus: "inactive" },
      { id: 3, name: "Legacy Admin", email: "legacy@savvy.realty", role: "admin", isActive: true, adminStatus: null },
      { id: 4, name: "Disabled Account", email: "disabled@savvy.realty", role: "admin", isActive: false, adminStatus: "active" },
    ];
    const db = makeDb(rows);
    vi.mocked(getDb).mockResolvedValue(db as any);

    const result = await permissionsRouter.createCaller(makeManagerContext()).getAllAdminsPermissions();

    expect(result.map((admin) => admin.userId)).toEqual([1, 3]);
    expect(result.map((admin) => admin.email)).not.toContain("inactive@savvy.realty");
    expect(db.__adminQuery.where).toHaveBeenCalledTimes(1);
  });

  it("shows an empty matrix result when every administrator is deactivated", async () => {
    const db = makeDb([
      { id: 2, name: "Inactive Admin", email: "inactive@savvy.realty", role: "admin", isActive: true, adminStatus: "inactive" },
      { id: 4, name: "Offboarded Admin", email: "offboarded@savvy.realty", role: "admin", isActive: false, adminStatus: "offboarded" },
    ]);
    vi.mocked(getDb).mockResolvedValue(db as any);

    await expect(permissionsRouter.createCaller(makeManagerContext()).getAllAdminsPermissions()).resolves.toEqual([]);
  });

  it("does not allow a deactivated admin to be selected or assigned permissions", async () => {
    const db = makeDb([
      { id: 2, name: "Inactive Admin", email: "inactive@savvy.realty", role: "admin", isActive: true, adminStatus: "inactive" },
    ]);
    vi.mocked(getDb).mockResolvedValue(db as any);
    const caller = permissionsRouter.createCaller(makeManagerContext());

    await expect(caller.getForUser({ userId: 2 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(caller.updateForUser({ userId: 2, permissions: { canViewDashboard: true } })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("excludes a deactivated admin after refresh and makes the admin eligible again after reactivation", async () => {
    const rows: AdminRow[] = [
      { id: 2, name: "Lifecycle Admin", email: "lifecycle@savvy.realty", role: "admin", isActive: true, adminStatus: "active" },
    ];
    const db = makeDb(rows);
    vi.mocked(getDb).mockResolvedValue(db as any);
    const caller = permissionsRouter.createCaller(makeManagerContext());

    await expect(caller.getAllAdminsPermissions()).resolves.toHaveLength(1);

    rows[0].adminStatus = "inactive";
    await expect(caller.getAllAdminsPermissions()).resolves.toEqual([]);

    rows[0].adminStatus = "active";
    await expect(caller.getAllAdminsPermissions()).resolves.toHaveLength(1);
  });
});

describe("Transaction permissions", () => {
  it("keeps transaction controls in the Transactions navigation category", () => {
    expect(ADMIN_NAV_PERMISSIONS).toContainEqual({ key: "canAdministerTransactions", label: "Transactions Admin", group: "Transactions" });
  });

  it("registers separate attribution-correction permissions for contacts and transactions", () => {
    expect(ADMIN_NAV_PERMISSIONS).toContainEqual({ key: "canEditContactLeadSource", label: "Edit Contact Lead Source", group: "CRM" });
    expect(ADMIN_NAV_PERMISSIONS).toContainEqual({ key: "canEditTransactionLeadSource", label: "Edit Transaction Lead Source", group: "Transactions" });
  });
});

describe("Agent Celebration and Market Match permissions", () => {
  it("registers each navigation destination in the requested Super Permissions group", () => {
    expect(ADMIN_NAV_PERMISSIONS).toContainEqual({ key: "canViewAgentCelebrations", label: "Agent Celebration", group: "Agent Success Team" });
    expect(ADMIN_NAV_PERMISSIONS).toContainEqual({ key: "canViewMarketMatchQuiz", label: "Market Match Quiz", group: "Admin" });
    expect(ADMIN_NAV_PERMISSIONS).toContainEqual({ key: "canViewMarketMatchSettings", label: "Market Match Settings", group: "Admin" });
    expect(ADMIN_NAV_PERMISSIONS).not.toContainEqual({ key: "canViewSuperPermissions", label: "Super Permissions", group: "Admin" });
  });
});

describe("Transaction Checklists permission", () => {
  it("registers the admin-only checklist library in the Agent Success Team group", () => {
    expect(ADMIN_NAV_PERMISSIONS).toContainEqual({
      key: "canViewTransactionChecklists",
      label: "Transaction Checklists",
      group: "Agent Success Team",
    });
  });
});

describe("HR and Tech permissions", () => {
  it("organizes HR destinations in the HR group", () => {
    const hrPermissions = ADMIN_NAV_PERMISSIONS.filter(permission => permission.group === "HR");
    expect(hrPermissions).toEqual([
      { key: "canViewUsers", label: "Users", group: "HR" },
      { key: "canAdministerPto", label: "PTO Administration", group: "HR" },
      { key: "canApprovePto", label: "PTO Approvals", group: "HR" },
      { key: "canViewAgentRenewals", label: "Agent Renewals", group: "HR" },
      { key: "canViewOnboarding", label: "On/Offboarding", group: "HR" },
      { key: "canViewOrgChart", label: "Org Chart", group: "HR" },
      { key: "canViewAgentDirectory", label: "Agent Directory", group: "HR" },
      { key: "canViewJobBoard", label: "Job Board", group: "HR" },
      { key: "canViewTalentProfile", label: "Talent Profiles", group: "HR" },
      { key: "canViewRolesResponsibilities", label: "Roles and Responsibilities", group: "HR" },
    ]);
  });

  it("registers Operations Escalations in the Work group", () => {
    expect(ADMIN_NAV_PERMISSIONS).toContainEqual({
      key: "canViewOperationsEscalations",
      label: "Operations Escalations",
      group: "Work",
    });
  });

  it("keeps Chat and Pulse in the Work navigation category", () => {
    expect(ADMIN_NAV_PERMISSIONS).toContainEqual({ key: "canViewChat", label: "Chat", group: "Work" });
    expect(ADMIN_NAV_PERMISSIONS).toContainEqual({ key: "canManageChat", label: "Chat Admin", group: "Work" });
    expect(ADMIN_NAV_PERMISSIONS).toContainEqual({ key: "canViewPulse", label: "Pulse", group: "Work" });
    expect(ADMIN_NAV_PERMISSIONS.some(permission => permission.group === "Chat")).toBe(false);
    expect(ADMIN_NAV_PERMISSIONS.some(permission => permission.group === "Pulse")).toBe(false);
    expect(ADMIN_NAV_PERMISSIONS.some(permission => permission.group === "Transactions Admin")).toBe(false);
  });

  it("replaces the Website category with Tech and retains its controls", () => {
    const techPermissions = ADMIN_NAV_PERMISSIONS.filter(permission => permission.group === "Tech");
    expect(techPermissions).toEqual([
      { key: "canViewWebsite", label: "Website Studio", group: "Tech" },
      { key: "canViewTechRequests", label: "Tech Requests", group: "Tech" },
      { key: "canViewEmailNotifications", label: "Email Notifications", group: "Tech" },
      { key: "canViewWebhooks", label: "Webhooks", group: "Tech" },
      { key: "canManageWebsiteProperties", label: "Website properties", group: "Tech" },
      { key: "canManageWebsiteAgents", label: "Website agent profiles", group: "Tech" },
      { key: "canManageWebsiteCaseStudies", label: "Website case studies", group: "Tech" },
      { key: "canManageWebsiteBlog", label: "Website blog", group: "Tech" },
      { key: "canManageWebsiteSettings", label: "Website settings", group: "Tech" },
      { key: "canViewWebsiteLeads", label: "Website leads", group: "Tech" },
    ]);
    expect(ADMIN_NAV_PERMISSIONS.some(permission => permission.group === "Website")).toBe(false);
  });
});
