import { eq } from "drizzle-orm";
import { coachingSessions, users } from "../drizzle/schema";
import {
  createGoogleCalendarEvent,
  isGoogleCalendarConfigured,
} from "./calendarService";
import { createZoomMeeting } from "./zoomWebinarService";

export type CoachingSchedulingSource = "SavvyOS" | "External";

type ProvisionCoachingSessionInput = {
  db: any;
  sessionId: number;
  agentId: number;
  scheduledCoachId: number | null;
  sessionDate: Date | null;
  sessionType: string;
  durationMinutes: number | null;
  source: CoachingSchedulingSource;
  meetingLink?: string | null;
};

export type CoachingSchedulingResult = {
  meetingLink: string | null;
  zoomMeetingId: string | null;
  zoomHostUserId: string | null;
  calendarProvider: "google" | "none";
  calendarEventId: string | null;
  calendarEventUrl: string | null;
  calendarSyncStatus: "Not Requested" | "Synced" | "Needs Attention" | "External";
  calendarSyncError: string | null;
  warnings: string[];
};

function normalizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unknown integration error";
  return message.replace(/\s+/g, " ").trim().slice(0, 2_000);
}

function meetingTitle(agentName: string | null | undefined, sessionType: string) {
  return `Coaching: ${agentName ?? "Agent"} · ${sessionType}`.slice(0, 255);
}

/**
 * Provisions video and calendar details for a coaching session created in SavvyOS.
 * A provider failure never rolls back the coaching record: coaches can still record
 * externally-originated meetings and Ops can see exactly what needs attention.
 */
export async function provisionCoachingSession(
  input: ProvisionCoachingSessionInput
): Promise<CoachingSchedulingResult> {
  const initialMeetingLink = input.meetingLink?.trim() || null;
  const result: CoachingSchedulingResult = {
    meetingLink: initialMeetingLink,
    zoomMeetingId: null,
    zoomHostUserId: null,
    calendarProvider: "none",
    calendarEventId: null,
    calendarEventUrl: null,
    calendarSyncStatus: input.source === "External" ? "External" : "Not Requested",
    calendarSyncError: null,
    warnings: [],
  };

  if (input.source === "External") return result;

  if (!input.sessionDate || !input.scheduledCoachId) {
    result.calendarSyncStatus = "Needs Attention";
    result.calendarSyncError = "Choose a coach and a scheduled time to create the calendar event.";
    result.warnings.push(result.calendarSyncError);
    return result;
  }

  const [[agent], [coach]] = await Promise.all([
    input.db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, input.agentId))
      .limit(1),
    input.db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, input.scheduledCoachId))
      .limit(1),
  ]);

  if (!coach) {
    result.calendarSyncStatus = "Needs Attention";
    result.calendarSyncError = "The selected coach could not be found.";
    result.warnings.push(result.calendarSyncError);
    return result;
  }

  const title = meetingTitle(agent?.name, input.sessionType);
  const durationMinutes = Math.max(15, Math.min(Number(input.durationMinutes ?? 30), 240));
  const timezone = process.env.COACHING_TIMEZONE?.trim() || "America/New_York";

  if (!result.meetingLink) {
    try {
      const meeting = await createZoomMeeting({
        coachEmail: coach.email ?? "",
        title,
        description: `SavvyOS coaching session for ${agent?.name ?? "agent"}.`,
        startTime: input.sessionDate,
        durationMinutes,
        timezone,
      });
      result.meetingLink = meeting.join_url ?? null;
      result.zoomMeetingId = meeting.id ? String(meeting.id) : null;
      result.zoomHostUserId = meeting.host_id ?? null;
      if (!result.meetingLink) {
        result.warnings.push("Zoom created a meeting but did not return a participant link.");
      }
    } catch (error) {
      result.warnings.push(`Zoom link not created: ${normalizeError(error)}`);
    }
  }

  if (!isGoogleCalendarConfigured()) {
    result.calendarSyncStatus = "Needs Attention";
    result.calendarSyncError = "Google Calendar integration is not configured.";
    result.warnings.push(result.calendarSyncError);
    return result;
  }

  const endAt = new Date(input.sessionDate.getTime() + durationMinutes * 60_000);
  const description = [
    "Created by SavvyOS Coaching Hub.",
    `Agent: ${agent?.name ?? "Unknown"}`,
    `Coach: ${coach.name ?? "Unknown"}`,
    result.meetingLink ? `Join Zoom: ${result.meetingLink}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const event = await createGoogleCalendarEvent(input.scheduledCoachId, {
      title,
      description,
      startAt: input.sessionDate,
      endAt,
      timezone,
      location: result.meetingLink,
      attendeeEmail: agent?.email ?? null,
      recordType: "coaching_session",
      recordId: input.sessionId,
    });
    result.calendarProvider = "google";
    result.calendarEventId = event.eventId;
    result.calendarEventUrl = event.htmlLink;
    result.calendarSyncStatus = "Synced";
  } catch (error) {
    result.calendarSyncStatus = "Needs Attention";
    result.calendarSyncError = normalizeError(error);
    result.warnings.push(`Calendar event not created: ${result.calendarSyncError}`);
  }

  return result;
}

export async function saveCoachingSessionScheduling(
  db: any,
  sessionId: number,
  source: CoachingSchedulingSource,
  result: CoachingSchedulingResult
) {
  await db
    .update(coachingSessions)
    .set({
      schedulingSource: source,
      meetingLink: result.meetingLink,
      zoomMeetingId: result.zoomMeetingId,
      zoomHostUserId: result.zoomHostUserId,
      calendarProvider: result.calendarProvider,
      calendarEventId: result.calendarEventId,
      calendarEventUrl: result.calendarEventUrl,
      calendarSyncStatus: result.calendarSyncStatus,
      calendarSyncError: result.calendarSyncError,
    })
    .where(eq(coachingSessions.id, sessionId));
}
