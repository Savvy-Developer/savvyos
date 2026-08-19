import { TRPCError } from "@trpc/server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { pulseMeetingMembers, pulseMeetings } from "../../drizzle/schema";

/**
 * The one and only visibility boundary for Pulse meeting-scoped data.
 * Platform roles, assignment, mentions, and SavvyOS groups never grant access.
 */
export async function visible_meeting_ids(db: any, personId: number): Promise<string[]> {
  const rows = await db
    .select({ meetingId: pulseMeetingMembers.meetingId })
    .from(pulseMeetingMembers)
    .where(and(
      eq(pulseMeetingMembers.personId, personId),
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
  if (!visibleIds.includes(meetingId)) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "This meeting no longer exists. Go to your meetings.",
    });
  }

  const [meeting] = await db
    .select()
    .from(pulseMeetings)
    .where(and(
      eq(pulseMeetings.id, meetingId),
      isNull(pulseMeetings.deletedAt),
      inArray(pulseMeetings.id, visibleIds),
    ));

  if (!meeting) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "This meeting no longer exists. Go to your meetings.",
    });
  }

  return meeting;
}

/**
 * Management capability is checked only after meeting visibility. A platform
 * administrator who is not a member receives the same not-found response.
 */
export async function is_visible_meeting_manager(db: any, personId: number, meetingId: string) {
  await require_visible_meeting(db, personId, meetingId);
  const [membership] = await db
    .select({ meetingRole: pulseMeetingMembers.meetingRole })
    .from(pulseMeetingMembers)
    .where(and(
      eq(pulseMeetingMembers.meetingId, meetingId),
      eq(pulseMeetingMembers.personId, personId),
      isNull(pulseMeetingMembers.removedAt),
      isNull(pulseMeetingMembers.deletedAt),
    ));

  return membership?.meetingRole === "owner" || membership?.meetingRole === "administrator";
}
