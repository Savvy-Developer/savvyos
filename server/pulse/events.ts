import { pulseDomainEvents } from "../../drizzle/schema";
import type { PulsePolicyDb } from "./policy";

export type PulseEventType =
  | "scope_created"
  | "scope_archived"
  | "scope_reactivated"
  | "membership_granted"
  | "membership_revoked"
  | "calendar_configured"
  | "reporting_period_created"
  | "holiday_created"
  | "meeting_created"
  | "meeting_deactivated"
  | "meeting_reactivated"
  | "session_started"
  | "session_step_entered"
  | "session_ids_snapshot"
  | "session_item_captured"
  | "session_vote_cast"
  | "session_completed"
  | "session_auto_closed"
  | "session_report_created"
  | "work_item_created"
  | "work_item_moved"
  | "work_item_status_changed"
  | "work_item_assigned"
  | "work_item_comment_added"
  | "work_item_mention_added";

export type PulseEventInput = {
  eventType: PulseEventType;
  scopeId?: number | null;
  actorPersonId?: number | null;
  payload: Record<string, unknown>;
};

/**
 * The only application-level writer for Pulse events. The migration also adds DB-level
 * payload-class checks and immutable triggers, so application code cannot silently bypass it.
 */
export async function appendPulseEvent(db: PulsePolicyDb, input: PulseEventInput) {
  await db.insert(pulseDomainEvents).values({
    eventType: input.eventType,
    scopeId: input.scopeId ?? null,
    actorPersonId: input.actorPersonId ?? null,
    payload: input.payload,
  });
}
