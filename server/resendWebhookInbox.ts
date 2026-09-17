import { createHash } from "crypto";
import { and, asc, eq, inArray, lt, lte, sql } from "drizzle-orm";
import { getDb } from "./db";
import { resendWebhookEvents } from "../drizzle/schema";

export type ResendWebhookEventPayload = {
  type: string;
  created_at?: string;
  data: {
    email_id?: string;
    broadcast_id?: string;
    to?: string[];
    from?: string;
    subject?: string;
    created_at?: string;
    email?: string;
    unsubscribed?: boolean;
    message_id?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export type EnqueuedResendWebhookEvent = {
  svixId: string;
  event: ResendWebhookEventPayload;
};

const MAX_EVENT_TYPE_LENGTH = 64;
const MAX_PROVIDER_ID_LENGTH = 255;

function optionalString(value: unknown, maxLength: number): string | null {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maxLength)
    : null;
}

export function parseResendWebhookEvent(rawBody: string): ResendWebhookEventPayload {
  const parsed: unknown = JSON.parse(rawBody);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Resend webhook payload must be an object");
  }
  const candidate = parsed as Record<string, unknown>;
  if (typeof candidate.type !== "string" || !candidate.type.trim()) {
    throw new Error("Resend webhook payload is missing event type");
  }
  if (!candidate.data || typeof candidate.data !== "object" || Array.isArray(candidate.data)) {
    throw new Error("Resend webhook payload is missing event data");
  }
  return candidate as ResendWebhookEventPayload;
}

/**
 * Resend supplies a unique Svix event ID for normal deliveries. Hashing a rare
 * delivery without it preserves idempotency rather than accepting the same raw
 * payload repeatedly.
 */
export function resendWebhookEventId(rawBody: string, svixId?: string): string {
  const normalized = svixId?.trim();
  if (normalized) return normalized.slice(0, 255);
  return `payload:${createHash("sha256").update(rawBody).digest("hex")}`;
}

export function describeResendWebhookEvent(
  rawBody: string,
  svixId?: string
): EnqueuedResendWebhookEvent {
  const event = parseResendWebhookEvent(rawBody);
  return { svixId: resendWebhookEventId(rawBody, svixId), event };
}

/**
 * Stores one verified Resend callback with a unique provider delivery ID. The
 * web request intentionally stops here: CRM matching and analytics projection
 * are owned by the dedicated worker so a callback burst cannot consume user
 * request capacity.
 */
export async function enqueueResendWebhookEvent(
  input: EnqueuedResendWebhookEvent
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable for Resend webhook ingestion");

  await db
    .insert(resendWebhookEvents)
    .values({
      svixId: input.svixId,
      eventType: input.event.type.slice(0, MAX_EVENT_TYPE_LENGTH),
      providerMessageId: optionalString(input.event.data.email_id, MAX_PROVIDER_ID_LENGTH),
      broadcastId: optionalString(input.event.data.broadcast_id, MAX_PROVIDER_ID_LENGTH),
      payload: input.event,
      status: "pending",
      availableAt: new Date(),
    })
    .onDuplicateKeyUpdate({
      // A repeat delivery is already durable. Deliberately leave the original
      // payload and lifecycle untouched so a retry cannot re-queue a completed
      // event or overwrite its audit record.
      set: { svixId: sql`${resendWebhookEvents.svixId}` },
    });
}

export type ClaimedResendWebhookEvent = typeof resendWebhookEvents.$inferSelect;

const LEASE_DURATION_MS = 5 * 60 * 1000;

/**
 * Claims a bounded batch without holding a database transaction while remote
 * or cross-table work runs. Status guards make competing workers harmless and
 * the expiry lets a replacement worker recover after a process restart.
 */
export async function claimResendWebhookEvents(
  workerId: string,
  limit: number,
  now = new Date()
): Promise<ClaimedResendWebhookEvent[]> {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable for Resend webhook processing");

  await db
    .update(resendWebhookEvents)
    .set({
      status: "pending",
      leaseToken: null,
      leaseExpiresAt: null,
      availableAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(resendWebhookEvents.status, "processing"),
        lt(resendWebhookEvents.leaseExpiresAt, now)
      )
    );

  const candidates = await db
    .select({ id: resendWebhookEvents.id })
    .from(resendWebhookEvents)
    .where(
      and(
        eq(resendWebhookEvents.status, "pending"),
        lte(resendWebhookEvents.availableAt, now)
      )
    )
    .orderBy(asc(resendWebhookEvents.id))
    .limit(Math.max(1, Math.min(limit, 500)));

  const ids = candidates.map((candidate) => candidate.id);
  if (ids.length === 0) return [];

  const leaseExpiresAt = new Date(now.getTime() + LEASE_DURATION_MS);
  await db
    .update(resendWebhookEvents)
    .set({
      status: "processing",
      leaseToken: workerId,
      leaseExpiresAt,
      attemptCount: sql`${resendWebhookEvents.attemptCount} + 1`,
      updatedAt: now,
    })
    .where(
      and(
        inArray(resendWebhookEvents.id, ids),
        eq(resendWebhookEvents.status, "pending")
      )
    );

  return db
    .select()
    .from(resendWebhookEvents)
    .where(
      and(
        inArray(resendWebhookEvents.id, ids),
        eq(resendWebhookEvents.status, "processing"),
        eq(resendWebhookEvents.leaseToken, workerId)
      )
    )
    .orderBy(asc(resendWebhookEvents.id));
}

export function retryAt(attemptCount: number, now = new Date()): Date {
  const delayMs = Math.min(30 * 60 * 1000, 1_000 * 2 ** Math.min(attemptCount, 20));
  return new Date(now.getTime() + delayMs);
}

export async function markResendWebhookEventProcessed(
  id: number,
  workerId: string,
  now = new Date()
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable for Resend webhook processing");
  await db
    .update(resendWebhookEvents)
    .set({
      status: "processed",
      leaseToken: null,
      leaseExpiresAt: null,
      processedAt: now,
      errorMessage: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(resendWebhookEvents.id, id),
        eq(resendWebhookEvents.status, "processing"),
        eq(resendWebhookEvents.leaseToken, workerId)
      )
    );
}

export async function rescheduleResendWebhookEvent(
  event: Pick<ClaimedResendWebhookEvent, "id" | "attemptCount">,
  workerId: string,
  error: unknown,
  now = new Date()
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable for Resend webhook processing");
  const message = error instanceof Error ? error.message : String(error);
  await db
    .update(resendWebhookEvents)
    .set({
      status: "pending",
      leaseToken: null,
      leaseExpiresAt: null,
      availableAt: retryAt(event.attemptCount, now),
      errorMessage: message.slice(0, 4_000),
      updatedAt: now,
    })
    .where(
      and(
        eq(resendWebhookEvents.id, event.id),
        eq(resendWebhookEvents.status, "processing"),
        eq(resendWebhookEvents.leaseToken, workerId)
      )
    );
}
