import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { adminPermissions, users } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

// ── Who can manage admin permissions ─────────────────────────────────────────
const PERMISSION_MANAGERS = [
  "tyler@savvy.realty",
  "elana@savvy.realty",
  "dyl@savvy.realty",
];

// ── Tyler's email — her permissions can never be edited ───────────────────────
const PROTECTED_EMAIL = "tyler@savvy.realty";

// ── All permission keys with their labels and group ───────────────────────────
export const ADMIN_NAV_PERMISSIONS = [
  // Overview
  { key: "canViewDashboard",          label: "Admin Dashboard",          group: "Overview" },
  { key: "canViewIsmDashboard",       label: "ISM Dashboard",            group: "Overview" },
  { key: "canViewReporting",          label: "Reporting",                group: "Overview" },
  // CRM
  { key: "canViewContacts",           label: "All Contacts",             group: "CRM" },
  { key: "canViewPipeline",           label: "All Pipelines",            group: "CRM" },
  { key: "canViewConnectionRequests", label: "Connection Requests",      group: "CRM" },
  { key: "canViewLeadSources",        label: "Lead Sources",             group: "CRM" },
  { key: "canViewHotLeads",           label: "Hot Leads",                group: "CRM" },
  // Transactions
  { key: "canViewTransactions",       label: "All Transactions",         group: "Transactions" },
  { key: "canViewTransactionExports", label: "Transaction Exports",      group: "Transactions" },
  { key: "canViewListings",           label: "Listings",                 group: "Transactions" },
  { key: "canViewProperties",         label: "Properties",               group: "Transactions" },
  { key: "canViewCommission",         label: "Commission & Payouts",     group: "Transactions" },
  // Operations
  { key: "canViewTasks",              label: "Tasks",                    group: "Operations" },
  { key: "canViewOnboarding",         label: "On/Offboarding",           group: "Operations" },
  { key: "canViewCoachingHub",        label: "Coaching Hub",             group: "Operations" },
  { key: "canViewLeadershipDashboard",label: "Leadership Dashboard",     group: "Operations" },
  { key: "canViewActivityLog",        label: "Activity Log",             group: "Operations" },
  // Admin
  { key: "canViewUsers",              label: "Users",                    group: "Admin" },
  { key: "canViewAdminApprovals",     label: "Admin Approvals",          group: "Admin" },
  { key: "canViewMarketMatch",        label: "Market Match Hub",         group: "Admin" },
    { key: "canViewOrgChart",           label: "Org Chart",                group: "Admin" },
  { key: "canViewRolesResponsibilities", label: "Roles & Responsibilities", group: "Admin" },
  { key: "canViewFeedback",           label: "Feedback & Requests",     group: "Admin" },
  { key: "canViewMarketingAdmin",     label: "Marketing Requests",       group: "Admin" },
  { key: "canViewGoals",              label: "Goals",                    group: "Admin" },
  { key: "canViewJobBoard",           label: "Job Board",                 group: "Admin" },
  // Dev Tools
  { key: "canViewWebhooks",           label: "Webhooks",                 group: "Dev Tools" },
  { key: "canViewDuplicates",         label: "Duplicate Contacts",       group: "Dev Tools" },
  // Resources
  { key: "canViewKnowledgeBase",      label: "Knowledge Base",           group: "Resources" },
  // Work module — the existing canViewProjects key governs the entire Work route tree.
  { key: "canViewProjects",           label: "Work",                     group: "Work" },
  { key: "canViewSmartPlans",         label: "Smart Plans",              group: "Automation" },
  { key: "canViewEmailNotifications", label: "Email Notifications",      group: "Automation" },
  // Admin — Passwords
  { key: "canViewPasswords",           label: "Passwords",                group: "Admin" },
  { key: "canViewPulse",               label: "Pulse",                    group: "Admin" },
  // Super admin tools (default OFF — only Tyler/Elana/Dyl can use this page anyway)
  { key: "canViewSuperPermissions",   label: "Super Permissions",        group: "Admin" },
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

      // Look up target user to verify they're an admin
      const targetUsers = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
      const targetUser = targetUsers[0];
      if (!targetUser) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      if (targetUser.role !== "admin") throw new TRPCError({ code: "BAD_REQUEST", message: "Permissions only apply to admin users" });

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

      // Look up target user
      const targetUsers = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
      const targetUser = targetUsers[0];
      if (!targetUser) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      if (targetUser.role !== "admin") throw new TRPCError({ code: "BAD_REQUEST", message: "Permissions only apply to admin users" });

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

      // Get all active admin users
      const adminUsers = await db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(eq(users.role, "admin"))
        .orderBy(users.name);

      // Get all existing permissions rows
      const permRows = await db.select().from(adminPermissions);
      const permMap = new Map<number, typeof permRows[0]>();
      for (const row of permRows) permMap.set(row.userId, row);

      // Build result: for each admin, return their permissions (defaulting to true for missing rows)
      const result = adminUsers.map((u) => {
        const row = permMap.get(u.id);
        const perms: Record<string, boolean> = {};
        if (u.email === PROTECTED_EMAIL) {
          // Tyler always has full access
          for (const p of ADMIN_NAV_PERMISSIONS) perms[p.key] = true;
        } else if (row) {
          for (const p of ADMIN_NAV_PERMISSIONS) perms[p.key] = (row as any)[p.key] ?? true;
        } else {
          // No row yet — defaults: most ON, Projects & Plans OFF
          for (const p of ADMIN_NAV_PERMISSIONS) {
            perms[p.key] = p.group !== "Projects & Plans";
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
        // Look up user to ensure they're admin and not Tyler
        const targetUsers = await db.select({ email: users.email, role: users.role, id: users.id }).from(users).where(eq(users.id, item.userId)).limit(1);
        const targetUser = targetUsers[0];
        if (!targetUser || targetUser.role !== "admin") continue;
        if (targetUser.email === PROTECTED_EMAIL) continue; // skip Tyler

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
