import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import { adminPermissions, pulseMeetingMembers, pulseMeetings, pulsePermissions } from "../../drizzle/schema";
import { protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";

const PROTECTED_EMAIL = "tyler@savvy.realty";
const PULSE_UNAVAILABLE = "Pulse is not available. Ask a SavvyOS administrator to grant Pulse access.";
const PULSE_SETTINGS_UNAVAILABLE = "Pulse settings are not available.";
export const PULSE_CAPABILITIES = ["settings", "scorecard_history", "quarterly_rocks", "archive_reports", "email_matrix"] as const;
export type PulseCapability = typeof PULSE_CAPABILITIES[number];

type PulseUser = {
  id: number;
  role: string;
  email?: string | null;
};

function unavailable(message: string) {
  return new TRPCError({ code: "NOT_FOUND", message });
}

/**
 * Layer 1: Pulse is an admin-only SavvyOS module. This is read-only by design:
 * a failed access check never creates an admin_permissions row or changes a value.
 */
export async function canOpenPulse(db: any, user: PulseUser): Promise<boolean> {
  if (user.role !== "admin") return false;
  if (user.email === PROTECTED_EMAIL) return true;
  const [row] = await db
    .select({ canViewPulse: adminPermissions.canViewPulse })
    .from(adminPermissions)
    .where(eq(adminPermissions.userId, user.id))
    .limit(1);
  return row?.canViewPulse === true;
}

/**
 * Layer 2: Pulse Settings is a separate, default-off SavvyOS permission. It
 * controls Pulse-wide administration only and never grants meeting visibility.
 */
export async function hasPulseCapability(db: any, user: PulseUser, capability: PulseCapability): Promise<boolean> {
  // The protected owner can never lose access through either permission system.
  if (user.email?.toLowerCase() === PROTECTED_EMAIL) return true;
  if (user.role !== "admin") return false;
  const [explicit] = await db.select({ allowed: pulsePermissions.allowed })
    .from(pulsePermissions)
    .where(and(eq(pulsePermissions.personId, user.id), eq(pulsePermissions.capability, capability)))
    .limit(1);
  return explicit?.allowed === true;
}

export async function canOpenPulseSettings(db: any, user: PulseUser): Promise<boolean> {
  if (user.email?.toLowerCase() === PROTECTED_EMAIL) return true;
  if (user.role !== "admin") return false;
  const [mainPermission] = await db
    .select({ canViewPulseSettings: adminPermissions.canViewPulseSettings })
    .from(adminPermissions)
    .where(eq(adminPermissions.userId, user.id))
    .limit(1);
  if (mainPermission?.canViewPulseSettings !== true) return false;
  const [configured] = await db.select({ id: pulsePermissions.id }).from(pulsePermissions)
    .where(eq(pulsePermissions.capability, "settings")).limit(1);
  // Preserve the current settings behavior until the dedicated Pulse matrix is configured.
  return configured ? hasPulseCapability(db, user, "settings") : true;
}

export const canViewPulseScorecardHistory = (db: any, user: PulseUser) => hasPulseCapability(db, user, "scorecard_history");
export const canViewPulseQuarterlyRocks = (db: any, user: PulseUser) => hasPulseCapability(db, user, "quarterly_rocks");
export const canViewPulseArchiveReports = (db: any, user: PulseUser) => hasPulseCapability(db, user, "archive_reports");

export async function requirePulseSettingsAccess(db: any, user: PulseUser): Promise<void> {
  if (!await canOpenPulseSettings(db, user)) throw unavailable(PULSE_SETTINGS_UNAVAILABLE);
}

/**
 * Meeting owners and administrators may configure only their own visible
 * meeting. A person with Pulse Settings may configure any active meeting, but
 * this does not alter visible_meeting_ids() or any member-facing payload.
 */
export async function canConfigureMeeting(db: any, user: PulseUser, meetingId: string): Promise<boolean> {
  if (await canOpenPulseSettings(db, user)) {
    const [meeting] = await db
      .select({ id: pulseMeetings.id })
      .from(pulseMeetings)
      .where(and(eq(pulseMeetings.id, meetingId), eq(pulseMeetings.isActive, true), isNull(pulseMeetings.deletedAt)))
      .limit(1);
    return Boolean(meeting);
  }

  const [membership] = await db
    .select({ meetingRole: pulseMeetingMembers.meetingRole })
    .from(pulseMeetingMembers)
    .innerJoin(pulseMeetings, eq(pulseMeetings.id, pulseMeetingMembers.meetingId))
    .where(and(
      eq(pulseMeetingMembers.meetingId, meetingId),
      eq(pulseMeetingMembers.personId, user.id),
      isNull(pulseMeetingMembers.removedAt),
      isNull(pulseMeetingMembers.deletedAt),
      eq(pulseMeetings.isActive, true),
      isNull(pulseMeetings.deletedAt),
    ))
    .limit(1);
  return membership?.meetingRole === "owner" || membership?.meetingRole === "administrator";
}

export async function requireMeetingConfigurationAccess(db: any, user: PulseUser, meetingId: string): Promise<void> {
  if (!await canConfigureMeeting(db, user, meetingId)) throw unavailable(PULSE_SETTINGS_UNAVAILABLE);
}

/**
 * Every Pulse tRPC procedure begins here. This keeps the module admin-only
 * while leaving all non-Pulse procedures and shared Super Permissions behavior
 * untouched.
 */
export const pulseProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Pulse is not available right now. Please try again." });
  if (!await canOpenPulse(db, ctx.user)) throw unavailable(PULSE_UNAVAILABLE);
  return next({ ctx: { ...ctx, pulseDb: db } });
});
