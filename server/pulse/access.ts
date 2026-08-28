import { TRPCError } from "@trpc/server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { pulseMeetingMembers, pulseMeetings, users } from "../../drizzle/schema";

// Missing and inaccessible meeting IDs must be indistinguishable. This prevents
// membership probes from revealing that a meeting exists to someone outside it.
export const PULSE_MEETING_NOT_FOUND = "This meeting no longer exists. Go to your meetings.";
const PROTECTED_EMAIL = "tyler@savvy.realty";

async function isProtectedPulseUser(db: any, personId: number) {
  const [person] = await db.select({ email: users.email }).from(users).where(eq(users.id, personId)).limit(1);
  return person?.email?.toLowerCase() === PROTECTED_EMAIL;
}

function unavailableMeetingError() {
  return new TRPCError({ code: "NOT_FOUND", message: PULSE_MEETING_NOT_FOUND });
}

/**
 * The one and only visibility boundary for Pulse meeting-scoped data.
 * Platform roles, assignment, mentions, and SavvyOS groups never grant access.
 */
export async function visible_meeting_ids(db: any, personId: number): Promise<string[]> {
  // Even the protected Pulse user must be explicitly added to a meeting.
  // Tyler's immutable protection applies to Pulse capabilities, not meeting
  // membership or meeting-specific visibility.
  const rows = await db
    .select({ meetingId: pulseMeetingMembers.meetingId })
    .from(pulseMeetingMembers)
    .innerJoin(pulseMeetings, eq(pulseMeetings.id, pulseMeetingMembers.meetingId))
    .where(and(
      eq(pulseMeetingMembers.personId, personId),
      eq(pulseMeetings.isActive, true),
      isNull(pulseMeetings.deletedAt),
      isNull(pulseMeetingMembers.removedAt),
      isNull(pulseMeetingMembers.deletedAt),
    ));

  return rows.map((row: { meetingId: string }) => row.meetingId);
}

/**
 * Resolves one meeting only after proving it is visible through meeting membership.
 * A missing or inaccessible ID deliberately has no fallback meeting.
 */
export async function require_visible_meeting(db: any, personId: number, meetingId: string) {
  const visibleIds = await visible_meeting_ids(db, personId);
  if (!visibleIds.includes(meetingId)) throw unavailableMeetingError();

  const [meeting] = await db
    .select()
    .from(pulseMeetings)
    .where(and(
      eq(pulseMeetings.id, meetingId),
      isNull(pulseMeetings.deletedAt),
      inArray(pulseMeetings.id, visibleIds),
    ));

  if (!meeting) throw unavailableMeetingError();

  return meeting;
}

/**
 * Management capability is checked only after meeting visibility. A platform
 * administrator who is not a member receives the same not-found response.
 */
export function can_run_meeting_for_member(meeting: { ownerId: number; administratorId: number }, personId: number, activeMemberIds: number[]) {
  return activeMemberIds.includes(personId) && (meeting.ownerId === personId || meeting.administratorId === personId);
}

export async function is_visible_meeting_manager(db: any, personId: number, meetingId: string) {
  const meeting = await require_visible_meeting(db, personId, meetingId);
  // ownerId is the existing Pulse schema field for the meeting facilitator.
  // The configured IDs, active membership, and no other Pulse capability are
  // authoritative for Run Meeting control.
  const members = await db.select({ personId: pulseMeetingMembers.personId })
    .from(pulseMeetingMembers)
    .where(and(
      eq(pulseMeetingMembers.meetingId, meetingId),
      isNull(pulseMeetingMembers.removedAt),
      isNull(pulseMeetingMembers.deletedAt),
    ));
  return can_run_meeting_for_member(meeting, personId, members.map((member: { personId: number }) => member.personId));
}
