import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import { pulseMeetingMembers, pulsePermissions } from "../../drizzle/schema";
import { protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { canAdminUsePermission } from "../routers/permissions";

const PULSE_UNAVAILABLE = "Pulse is not available. Ask a Pulse administrator to grant access.";
const PULSE_SETTINGS_UNAVAILABLE = "This Pulse configuration is not available.";

/**
 * These are the authoritative Pulse-wide capabilities. For SavvyOS administrators,
 * the Pulse Settings Super Permission is the centralized grant for the permission
 * matrix; it never grants meeting membership or the remaining Pulse capabilities.
 * Meeting data still requires active, explicit membership in the relevant L10.
 */
export const PULSE_CAPABILITIES = [
  "manage_permission_matrix",
  "manage_l10s",
  "run_l10s",
  "view_all_l10_health",
] as const;
export type PulseCapability = typeof PULSE_CAPABILITIES[number];

type PulseUser = { id: number; email?: string | null; role?: string | null };

function unavailable(message: string) {
  return new TRPCError({ code: "NOT_FOUND", message });
}

export async function hasPulseCapability(db: any, user: PulseUser, capability: PulseCapability): Promise<boolean> {
  // For SavvyOS administrators, the Pulse Settings Super Permission is the
  // authoritative matrix-administrator grant. This preserves the centralized
  // access model and prevents a stale Pulse row from bypassing a revocation.
  if (capability === "manage_permission_matrix" && user.role === "admin") {
    return canAdminUsePermission({ id: user.id, role: user.role, email: user.email }, "canViewPulseSettings");
  }

  const [row] = await db.select({ allowed: pulsePermissions.allowed })
    .from(pulsePermissions)
    .where(and(eq(pulsePermissions.personId, user.id), eq(pulsePermissions.capability, capability)))
    .limit(1);
  return row?.allowed === true;
}

export async function hasAnyPulseCapability(db: any, user: PulseUser): Promise<boolean> {
  const [row] = await db.select({ id: pulsePermissions.id })
    .from(pulsePermissions)
    .where(and(eq(pulsePermissions.personId, user.id), eq(pulsePermissions.allowed, true)))
    .limit(1);
  return Boolean(row);
}

/** A Pulse home may be opened by a meeting member, a matrix-capability holder, or a Super Permissions assignee. */
export async function canOpenPulse(db: any, user: PulseUser): Promise<boolean> {
  if (user.role === "admin" && await canAdminUsePermission({ id: user.id, role: user.role, email: user.email }, "canViewPulse")) return true;
  if (await hasAnyPulseCapability(db, user)) return true;
  const [membership] = await db.select({ id: pulseMeetingMembers.id })
    .from(pulseMeetingMembers)
    .where(and(
      eq(pulseMeetingMembers.personId, user.id),
      isNull(pulseMeetingMembers.removedAt),
      isNull(pulseMeetingMembers.deletedAt),
    ))
    .limit(1);
  return Boolean(membership);
}

export async function requirePulseCapability(db: any, user: PulseUser, capability: PulseCapability) {
  if (!await hasPulseCapability(db, user, capability)) throw unavailable(PULSE_SETTINGS_UNAVAILABLE);
}

export async function canOpenPulseSettings(db: any, user: PulseUser): Promise<boolean> {
  // Super Permissions is authoritative for administrators. Pulse capabilities remain
  // the settings authority for non-administrator operating users.
  if (user.role === "admin") {
    return canAdminUsePermission({ id: user.id, role: user.role, email: user.email }, "canViewPulseSettings");
  }
  return hasPulseCapability(db, user, "manage_l10s") || hasPulseCapability(db, user, "manage_permission_matrix");
}

export const canViewPulseScorecardHistory = (db: any, user: PulseUser) => hasPulseCapability(db, user, "view_all_l10_health");
export const canViewPulseQuarterlyRocks = (db: any, user: PulseUser) => hasPulseCapability(db, user, "manage_l10s");
export const canViewPulseArchiveReports = (db: any, user: PulseUser) => hasPulseCapability(db, user, "view_all_l10_health");

export async function requirePulseSettingsAccess(db: any, user: PulseUser): Promise<void> {
  if (!await canOpenPulseSettings(db, user)) throw unavailable(PULSE_SETTINGS_UNAVAILABLE);
}

/**
 * L10 configuration is intentionally bounded. Even a capable Pulse operator
 * must be an active member of an L10 before configuring its workspace.
 */
export async function canConfigureMeeting(db: any, user: PulseUser, meetingId: string): Promise<boolean> {
  const { require_visible_meeting } = await import("./access");
  try {
    await require_visible_meeting(db, user.id, meetingId);
  } catch {
    return false;
  }
  return hasPulseCapability(db, user, "manage_l10s");
}

export async function requireMeetingConfigurationAccess(db: any, user: PulseUser, meetingId: string): Promise<void> {
  if (!await canConfigureMeeting(db, user, meetingId)) throw unavailable(PULSE_SETTINGS_UNAVAILABLE);
}

/**
 * Generic Pulse procedures first establish that the user can open the module.
 * Individual meeting procedures then prove membership plus the needed matrix
 * capability; no SavvyOS role or organization team is consulted.
 */
export const pulseProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Pulse is not available right now. Please try again." });
  if (!await canOpenPulse(db, ctx.user)) throw unavailable(PULSE_UNAVAILABLE);
  return next({ ctx: { ...ctx, pulseDb: db } });
});

/** Member-facing Pulse procedures must require the applicable visible meeting at their input boundary. */
export const pulseMemberProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Pulse is not available right now. Please try again." });
  return next({ ctx: { ...ctx, pulseDb: db } });
});
