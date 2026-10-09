import { sql, type SQL } from "drizzle-orm";
import type { AnyMySqlColumn } from "drizzle-orm/mysql-core";
import { userRoles, users } from "../drizzle/schema";
import { USER_ROLES, type UserRole } from "@shared/userRoles";

export { USER_ROLES, type UserRole };

const ROLE_MANAGER_EMAILS = new Set([
  "tyler@savvy.realty",
  "elana@savvy.realty",
]);

export function canManageUserRoles(user: {
  role: string;
  email?: string | null;
}): boolean {
  return (
    user.role === "admin" &&
    ROLE_MANAGER_EMAILS.has(user.email?.trim().toLowerCase() ?? "")
  );
}

export function normalizeUserRoles(roles: readonly UserRole[]): UserRole[] {
  return Array.from(new Set(roles));
}

/**
 * Roles are always selected explicitly. The primary role is the user's default
 * workspace and must be one of the submitted memberships; this function never
 * adds or infers a role on the caller's behalf.
 */
export function validateRoleSelection(
  primaryRole: UserRole | undefined,
  roles: readonly UserRole[]
): UserRole[] {
  const normalized = normalizeUserRoles(roles);
  if (normalized.length === 0) {
    throw new Error("Select at least one role.");
  }
  if (!primaryRole) {
    throw new Error("Select a default workspace role.");
  }
  if (!normalized.includes(primaryRole)) {
    throw new Error("The default workspace role must be one of the selected roles.");
  }
  return normalized;
}

/**
 * SQL membership condition without duplicate joins. The primary role remains a
 * transitional fallback so read traffic remains correct while the membership
 * table is first deployed and backfilled.
 */
export function hasStoredRole(
  userId: AnyMySqlColumn,
  role: UserRole
): SQL {
  return sql`(
    ${users.role} = ${role}
    OR EXISTS (
      SELECT 1 FROM ${userRoles}
      WHERE ${userRoles.userId} = ${userId}
        AND ${userRoles.role} = ${role}
    )
  )`;
}

export function hasAnyStoredRole(
  userId: AnyMySqlColumn,
  roles: readonly UserRole[]
): SQL {
  const selected = normalizeUserRoles(roles);
  if (selected.length === 0) return sql`FALSE`;
  const values = sql.join(selected.map(role => sql`${role}`), sql`, `);
  return sql`(
    ${users.role} IN (${values})
    OR EXISTS (
      SELECT 1 FROM ${userRoles}
      WHERE ${userRoles.userId} = ${userId}
        AND ${userRoles.role} IN (${values})
    )
  )`;
}
