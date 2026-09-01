import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { adminPermissions, adminProfiles, users } from "../../drizzle/schema";
import { and, eq, isNull, or } from "drizzle-orm";

// ── Who can manage admin permissions ─────────────────────────────────────────
const PERMISSION_MANAGERS = [
  "tyler@savvy.realty",
  "elana@savvy.realty",
  "dyl@savvy.realty",
];

// ── Tyler's email — her permissions can never be edited ───────────────────────
const PROTECTED_EMAIL = "tyler@savvy.realty";

/**
 * Active eligibility is centralized here so inactive, on-leave, and offboarded
 * administrators cannot be listed, selected, or assigned permissions. Legacy
 * admins without a profile remain eligible until they receive an explicit status.
 */
const activeAdminEligibility = (userId?: number) => and(
  ...(userId === undefined ? [] : [eq(users.id, userId)]),
  eq(users.role, "admin"),
  eq(users.isActive, true),
  or(eq(adminProfiles.adminStatus, "active"), isNull(adminProfiles.userId)),
);

export function isActivePermissionAdmin(user: { isActive: boolean; adminStatus: string | null }): boolean {
  return user.isActive && (user.adminStatus === "active" || user.adminStatus === null);
}

async function findActiveAdmin(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, userId: number) {
  const rows = await db
    .select({ id: users.id, email: users.email, role: users.role, isActive: users.isActive, adminStatus: adminProfiles.adminStatus })
    .from(users)
    .leftJoin(adminProfiles, eq(adminProfiles.userId, users.id))
    .where(activeAdminEligibility(userId))
    .limit(1);
  return rows.find(isActivePermissionAdmin);
}

// ── All permission keys with their labels and group ───────────────────────────
// Required convention: every left-sidebar admin link must be registered here, mapped in
// AppLayout's PERM_PATH_MAP, persisted in admin_permissions, and enforced by its feature route/API.
export const ADMIN_NAV_PERMISSIONS = [
  // Overview
  { key: "canViewDashboard",              label: "Admin Dashboard",            group: "Overview" },
  { key: "canViewReporting",              label: "Reporting",                  group: "Overview" },
  { key: "canViewCustomReports",          label: "Custom Reports",             group: "Overview" },
  { key: "canViewLeaderboard",            label: "Agent Leaderboard",          group: "Overview" },
  // CRM
  { key: "canViewContacts",               label: "All Contacts",               group: "CRM" },
  { key: "canViewPipeline",               label: "Agent Pipelines",            group: "CRM" },
  { key: "canViewTasks",                  label: "CRM Tasks",                  group: "CRM" },
  // ISA
  { key: "canViewIsmDashboard",           label: "ISM Dashboard",              group: "ISA" },
  { key: "canViewHotLeads",               label: "Hot Leads",                  group: "ISA" },
  { key: "canViewMarketMatch",            label: "Market Match Hub",           group: "ISA" },
  { key: "canViewResendInbox",            label: "Resend Inbox",               group: "ISA" },
  { key: "canViewDuplicates",             label: "Duplicate Contacts",         group: "ISA" },
  // Transactions
  { key: "canViewTransactions",           label: "All Transactions",           group: "Transactions" },
  { key: "canViewTransactionExports",     label: "Transaction Exports",        group: "Transactions" },
  { key: "canViewListings",               label: "Listings",                   group: "Transactions" },
  { key: "canViewProperties",             label: "Properties",                 group: "Transactions" },
  { key: "canViewCommission",             label: "Commissions and Payouts",    group: "Transactions" },
  { key: "canViewReferrals",              label: "View Referrals",             group: "Transactions" },
  { key: "canCreateReferrals",            label: "Create Referrals",           group: "Transactions" },
  { key: "canEditReferrals",              label: "Edit Referrals",             group: "Transactions" },
  { key: "canManageReferralAgents",       label: "Manage Referral Agents",     group: "Transactions" },
  { key: "canEditReferralSplits",         label: "Edit Referral Splits",       group: "Transactions" },
  { key: "canViewReferralFinancials",     label: "View Referral Financials",   group: "Transactions" },
  { key: "canUpdateReferralPayments",     label: "Update Referral Payments",   group: "Transactions" },
  { key: "canManageReferralAgreements",   label: "Manage Agreements",          group: "Transactions" },
  { key: "canEditHistoricalReferrals",    label: "Edit Historical Referrals",  group: "Transactions" },
  // Agent Success Team
  { key: "canViewReviews",                label: "Reviews",                    group: "Agent Success Team" },
  { key: "canViewCoachingHub",            label: "Coaching Hub",               group: "Agent Success Team" },
  { key: "canViewLeadershipDashboard",    label: "Leadership Dashboard",       group: "Agent Success Team" },
  { key: "canViewCoachFeedback",          label: "Coach Feedback",             group: "Agent Success Team" },
  { key: "canViewGoals",                  label: "Goals",                      group: "Agent Success Team" },
  // Pulse
  { key: "canViewPulse",                  label: "Pulse",                      group: "Pulse" },
  { key: "canViewPulseSettings",          label: "Pulse Settings",             group: "Pulse" },
  // Work
  { key: "canViewProjects",               label: "Projects",                   group: "Work" },
  { key: "canViewJobBoard",               label: "Job Board",                  group: "Work" },
  { key: "canViewTalentProfile",          label: "Talent Profiles",            group: "Work" },
  { key: "canViewKnowledgeBase",          label: "Knowledgebase",              group: "Work" },
  // Marketing
  { key: "canViewWebinars",               label: "Webinars",                   group: "Marketing" },
  { key: "canViewLandingPages",           label: "Landing Pages",              group: "Marketing" },
  { key: "canCreateLandingPages",         label: "Landing Pages: Create",      group: "Marketing" },
  { key: "canEditLandingPages",           label: "Landing Pages: Edit",        group: "Marketing" },
  { key: "canPublishLandingPages",        label: "Landing Pages: Publish",     group: "Marketing" },
  { key: "canArchiveLandingPages",        label: "Landing Pages: Archive",     group: "Marketing" },
  { key: "canViewSmartPlans",             label: "Smart Plans",                group: "Marketing" },
  { key: "canViewMarketingAdmin",         label: "Marketing Requests",         group: "Marketing" },
  { key: "canViewShortLinks",             label: "Short Links",                group: "Marketing" },
  // Approvals
  { key: "canViewConnectionRequests",     label: "Connection Requests",        group: "Approvals" },
  { key: "canViewAdminApprovals",         label: "Admin Approvals",            group: "Approvals" },
  // Admin
  { key: "canViewUsers",                  label: "Users",                      group: "Admin" },
  { key: "canViewLeadSources",            label: "Lead Sources",               group: "Admin" },
  { key: "canViewActivityLog",            label: "Activity Log",               group: "Admin" },
  { key: "canAdministerPto",              label: "PTO Administration",        group: "Admin" },
  { key: "canApprovePto",                 label: "PTO Approvals",              group: "Admin" },
  { key: "canViewOnboarding",             label: "On/Offboarding",             group: "Admin" },
  { key: "canViewOrgChart",               label: "Org Chart",                  group: "Admin" },
  { key: "canViewAgentRenewals",          label: "Agent Renewals",             group: "Admin" },
  { key: "canViewRolesResponsibilities",  label: "Roles and Responsibilities", group: "Admin" },
  { key: "canViewFeedback",               label: "Feedback and Requests",      group: "Admin" },
  { key: "canViewTechRequests",           label: "Tech Requests",              group: "Admin" },
  { key: "canViewSuperPermissions",       label: "Super Permissions",          group: "Admin" },
  { key: "canViewPasswords",              label: "Passwords",                  group: "Admin" },
  { key: "canViewEmailNotifications",     label: "Email Notifications",        group: "Admin" },
  { key: "canViewFeatureUpdates",         label: "Feature Updates",            group: "Admin" },
  { key: "canViewWebhooks",               label: "Webhooks",                   group: "Admin" },
] as const;

export type PermissionKey = typeof ADMIN_NAV_PERMISSIONS[number]["key"];

/**
 * Resolves a centralized admin capability for a current user. Feature modules use this
 * helper instead of carrying their own protected-user exceptions or permission storage.
 */
export async function canAdminUsePermission(
  user: { id: number; role: string; email?: string | null },
  permission: PermissionKey,
): Promise<boolean> {
  if (user.role !== "admin") return false;
  if (user.email === PROTECTED_EMAIL) return true;

  const db = await getDb();
  if (!db) return false;
  const rows = await db.select().from(adminPermissions).where(eq(adminPermissions.userId, user.id)).limit(1);
  if (rows.length === 0) {
    await db.insert(adminPermissions).values({ userId: user.id });
    const created = await db.select().from(adminPermissions).where(eq(adminPermissions.userId, user.id)).limit(1);
    return (created[0] as any)?.[permission] ?? false;
  }
  return (rows[0] as any)?.[permission] ?? false;
}

const permissionUpdateSchema = z.object({
  userId: z.number(),
  permissions: z.record(z.string(), z.boolean()),
});

export const permissionsRouter = router({
  // Get permissions for a specific admin user
  getForUser: protectedProcedure
    .input(z.object({ userId: z.number() }))
    .query(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Only active administrators may be viewed or selected for permission management.
      const targetUser = await findActiveAdmin(db, input.userId);
      if (!targetUser) throw new TRPCError({ code: "NOT_FOUND", message: "Active admin not found" });

      // Tyler always has full access — return synthetic all-true object
      if (targetUser.email === PROTECTED_EMAIL) {
        const allTrue: Record<string, boolean> = {};
        for (const p of ADMIN_NAV_PERMISSIONS) allTrue[p.key] = true;
        return { userId: input.userId, permissions: allTrue, isProtected: true };
      }

      // Fetch or create permissions row
      const rows = await db.select().from(adminPermissions).where(eq(adminPermissions.userId, input.userId)).limit(1);
      if (rows.length === 0) {
        // Create default row
        await db.insert(adminPermissions).values({ userId: input.userId });
        const newRows = await db.select().from(adminPermissions).where(eq(adminPermissions.userId, input.userId)).limit(1);
        const row = newRows[0];
        const perms: Record<string, boolean> = {};
        for (const p of ADMIN_NAV_PERMISSIONS) perms[p.key] = (row as any)[p.key] ?? true;
        return { userId: input.userId, permissions: perms, isProtected: false };
      }

      const row = rows[0];
      const perms: Record<string, boolean> = {};
      for (const p of ADMIN_NAV_PERMISSIONS) perms[p.key] = (row as any)[p.key] ?? true;
      return { userId: input.userId, permissions: perms, isProtected: false };
    }),

  // Get permissions for the currently logged-in admin (used by nav)
  getMyPermissions: protectedProcedure
    .query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") return null;
      const db = await getDb();
      if (!db) return null;

      const email = (ctx.user as any).email as string;

      // Tyler always has full access
      if (email === PROTECTED_EMAIL) {
        const allTrue: Record<string, boolean> = {};
        for (const p of ADMIN_NAV_PERMISSIONS) allTrue[p.key] = true;
        return allTrue;
      }

      const rows = await db.select().from(adminPermissions).where(eq(adminPermissions.userId, ctx.user.id)).limit(1);
      if (rows.length === 0) {
        // Create default row
        await db.insert(adminPermissions).values({ userId: ctx.user.id });
        const newRows = await db.select().from(adminPermissions).where(eq(adminPermissions.userId, ctx.user.id)).limit(1);
        const row = newRows[0];
        const perms: Record<string, boolean> = {};
        for (const p of ADMIN_NAV_PERMISSIONS) perms[p.key] = (row as any)[p.key] ?? true;
        return perms;
      }

      const row = rows[0];
      const perms: Record<string, boolean> = {};
      for (const p of ADMIN_NAV_PERMISSIONS) perms[p.key] = (row as any)[p.key] ?? true;
      return perms;
    }),

  // Update permissions for a specific admin user
  updateForUser: protectedProcedure
    .input(permissionUpdateSchema)
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });

      const callerEmail = (ctx.user as any).email as string;

      // Only Tyler, Elana, Dyl can manage permissions
      if (!PERMISSION_MANAGERS.includes(callerEmail)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only Tyler, Elana, and Dyl can manage admin permissions",
        });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Permission assignments are restricted to active administrators.
      const targetUser = await findActiveAdmin(db, input.userId);
      if (!targetUser) throw new TRPCError({ code: "NOT_FOUND", message: "Active admin not found" });

      // Cannot edit Tyler's permissions
      if (targetUser.email === PROTECTED_EMAIL) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Tyler's permissions cannot be modified",
        });
      }

      // Build the update object — only allow known permission keys
      const validKeys = new Set(ADMIN_NAV_PERMISSIONS.map((p) => p.key));
      const updateData: Record<string, boolean> = {};
      for (const [key, val] of Object.entries(input.permissions)) {
        if (validKeys.has(key as PermissionKey)) {
          updateData[key] = val;
        }
      }

      // Upsert
      const existing = await db.select({ id: adminPermissions.id }).from(adminPermissions).where(eq(adminPermissions.userId, input.userId)).limit(1);
      if (existing.length > 0) {
        await db.update(adminPermissions).set(updateData as any).where(eq(adminPermissions.userId, input.userId));
      } else {
        await db.insert(adminPermissions).values({ userId: input.userId, ...updateData } as any);
      }

      return { success: true };
    }),

  // Return the list of all permission definitions (for the UI to render checkboxes)
  getDefinitions: protectedProcedure
    .query(({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      return ADMIN_NAV_PERMISSIONS.map((p) => ({ key: p.key, label: p.label, group: p.group }));
    }),

  // Check if the current user can manage permissions (Tyler/Elana/Dyl)
  canManagePermissions: protectedProcedure
    .query(({ ctx }) => {
      if (ctx.user.role !== "admin") return false;
      const email = (ctx.user as any).email as string;
      return PERMISSION_MANAGERS.includes(email);
    }),

  // Get all admin users with their permissions (for the super permissions matrix)
  getAllAdminsPermissions: protectedProcedure
    .query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const callerEmail = (ctx.user as any).email as string;
      if (!PERMISSION_MANAGERS.includes(callerEmail)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only Tyler, Elana, and Dyl can view the super permissions matrix" });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Return only active administrators. Existing permission and audit rows remain untouched.
      const adminUsers = await db
        .select({ id: users.id, name: users.name, email: users.email, isActive: users.isActive, adminStatus: adminProfiles.adminStatus })
        .from(users)
        .leftJoin(adminProfiles, eq(adminProfiles.userId, users.id))
        .where(activeAdminEligibility())
        .orderBy(users.name);
      const activeAdminUsers = adminUsers.filter(isActivePermissionAdmin);

      // Get all existing permissions rows
      const permRows = await db.select().from(adminPermissions);
      const permMap = new Map<number, typeof permRows[0]>();
      for (const row of permRows) permMap.set(row.userId, row);

      // Build result: for each admin, return their permissions (defaulting to true for missing rows)
      const result = activeAdminUsers.map((u) => {
        const row = permMap.get(u.id);
        const perms: Record<string, boolean> = {};
        if (u.email === PROTECTED_EMAIL) {
          // Tyler always has full access
          for (const p of ADMIN_NAV_PERMISSIONS) perms[p.key] = true;
        } else if (row) {
          for (const p of ADMIN_NAV_PERMISSIONS) perms[p.key] = (row as any)[p.key] ?? true;
        } else {
          // No row yet — defaults: most ON, except intentionally restricted views.
          const defaultOff = new Set<PermissionKey>([
            "canViewPulse",
            "canViewProjects",
            "canViewSmartPlans",
            "canViewEmailNotifications",
            "canViewSuperPermissions",
            "canViewResendInbox",
            "canViewPulseSettings",
            "canViewCoachFeedback",
            "canApprovePto",
            "canAdministerPto",
            "canViewLandingPages",
            "canCreateLandingPages",
            "canEditLandingPages",
            "canPublishLandingPages",
            "canArchiveLandingPages",
            "canViewShortLinks",
          ]);
          for (const p of ADMIN_NAV_PERMISSIONS) {
            perms[p.key] = !defaultOff.has(p.key);
          }
        }
        return {
          userId: u.id,
          name: u.name ?? u.email ?? String(u.id),
          email: u.email ?? "",
          isProtected: u.email === PROTECTED_EMAIL,
          permissions: perms,
        };
      });

      return result;
    }),

  // Bulk update: save all changes from the super permissions matrix in one call
  // tempExpiry: optional map of { permissionKey: ISO-timestamp } for temporarily-granted permissions
  bulkUpdatePermissions: protectedProcedure
    .input(z.array(z.object({
      userId: z.number(),
      permissions: z.record(z.string(), z.boolean()),
      // Optional: keys that are being temporarily granted, mapped to their expiry ISO timestamp
      tempExpiry: z.record(z.string(), z.string()).optional(),
    })))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const callerEmail = (ctx.user as any).email as string;
      if (!PERMISSION_MANAGERS.includes(callerEmail)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only Tyler, Elana, and Dyl can update permissions" });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const validKeys = new Set(ADMIN_NAV_PERMISSIONS.map((p) => p.key));

      for (const item of input) {
        // Stale clients cannot assign permissions after an admin is deactivated.
        const targetUser = await findActiveAdmin(db, item.userId);
        if (!targetUser || targetUser.email === PROTECTED_EMAIL) continue;

        const updateData: Record<string, boolean> = {};
        for (const [key, val] of Object.entries(item.permissions)) {
          if (validKeys.has(key as PermissionKey)) updateData[key] = val;
        }

        // Merge tempExpiry: fetch existing, remove keys that are now permanent, add new temp keys
        const existingRows = await db.select({ id: adminPermissions.id, tempGrantExpiry: adminPermissions.tempGrantExpiry }).from(adminPermissions).where(eq(adminPermissions.userId, item.userId)).limit(1);
        const existingExpiry: Record<string, string> = (existingRows[0]?.tempGrantExpiry as Record<string, string>) ?? {};

        // Remove expiry entries for keys that are now being set permanently (no tempExpiry entry)
        const newTempExpiry: Record<string, string> = { ...existingExpiry };
        for (const key of Object.keys(updateData)) {
          if (!item.tempExpiry?.[key]) {
            // Being set permanently — remove any existing temp expiry for this key
            delete newTempExpiry[key];
          }
        }
        // Add/update temp expiry entries
        if (item.tempExpiry) {
          for (const [key, ts] of Object.entries(item.tempExpiry)) {
            if (validKeys.has(key as PermissionKey)) newTempExpiry[key] = ts;
          }
        }

        const finalExpiry = Object.keys(newTempExpiry).length > 0 ? newTempExpiry : null;

        if (existingRows.length > 0) {
          await db.update(adminPermissions).set({ ...updateData, tempGrantExpiry: finalExpiry } as any).where(eq(adminPermissions.userId, item.userId));
        } else {
          await db.insert(adminPermissions).values({ userId: item.userId, ...updateData, tempGrantExpiry: finalExpiry } as any);
        }
      }

      return { success: true };
    }),
});
