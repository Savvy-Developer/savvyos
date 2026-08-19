/**
 * Resend Webhook Handler
 *
 * Resend uses at-least-once delivery and does not guarantee event ordering. Smart
 * Plan events are therefore retained in an immutable, idempotent event ledger and
 * projected onto the matching execution for fast per-step analytics.
 */
import { getDb } from "../db";
import {
  contacts,
  emailBehaviors,
  smartPlanExecutions,
  smartPlanMessageEvents,
  oneTimeSendRecipients,
  oneTimeSendMessageEvents,
} from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { refreshOneTimeSendMetrics } from "../oneTimeSendTracking";
import { createHmac } from "crypto";

export function verifyResendWebhookSignature(
  payload: string,
  svixSignature: string | undefined,
  secret: string,
  svixId?: string,
  svixTimestamp?: string
): boolean {
  if (!svixSignature || !secret) return false;

  const rawSecret = secret.startsWith("whsec_")
    ? Buffer.from(secret.slice("whsec_".length), "base64")
    : Buffer.from(secret, "base64");
  const signedContent = `${svixId ?? ""}.${svixTimestamp ?? ""}.${payload}`;
  const expectedSig = createHmac("sha256", rawSecret)
    .update(signedContent)
    .digest("base64");

  return svixSignature.split(" ").some((sig) => {
    const [version, sigValue] = sig.split(",");
    return version === "v1" && sigValue === expectedSig;
  });
}

type ResendWebhookEvent = {
  type: string;
  created_at?: string;
  data: {
    email_id?: string;
    to?: string[];
    from?: string;
    subject?: string;
    created_at?: string;
    // Suppression and inbound receiving events can identify an address as `email`.
    email?: string;
    message_id?: string;
  };
};

const SMART_PLAN_EVENT_TYPES = new Set([
  "email.delivered",
  "email.opened",
  "email.clicked",
  "email.bounced",
  "email.complained",
  "email.suppressed",
  "email.failed",
  "email.received",
]);

function inboundReplyToken(recipients?: string[]): string | null {
  const recipient = recipients?.[0]?.trim().toLowerCase();
  if (!recipient) return null;
  const localPart = recipient.split("@")[0];
  return localPart?.startsWith("sp-") ? localPart : null;
}

function eventTimestamp(event: ResendWebhookEvent): Date {
  const candidate = event.created_at ?? event.data.created_at;
  const parsed = candidate ? new Date(candidate) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

async function recordOneTimeSendEvent(
  event: ResendWebhookEvent,
  webhookEventId?: string,
): Promise<{ recipientId?: number; duplicate?: boolean }> {
  if (!SMART_PLAN_EVENT_TYPES.has(event.type)) return {};

  const db = await getDb();
  if (!db) return {};

  if (webhookEventId) {
    const [prior] = await db
      .select({ id: oneTimeSendMessageEvents.id, recipientId: oneTimeSendMessageEvents.recipientId })
      .from(oneTimeSendMessageEvents)
      .where(eq(oneTimeSendMessageEvents.providerEventId, webhookEventId))
      .limit(1);
    if (prior) return { recipientId: prior.recipientId, duplicate: true };
  }

  const replyToken = event.type === "email.received" ? inboundReplyToken(event.data.to) : null;
  const recipientRows = replyToken
    ? await db
        .select()
        .from(oneTimeSendRecipients)
        .where(eq(oneTimeSendRecipients.replyToken, replyToken))
        .limit(1)
    : event.data.email_id
      ? await db
          .select()
          .from(oneTimeSendRecipients)
          .where(and(
            eq(oneTimeSendRecipients.provider, "resend"),
            eq(oneTimeSendRecipients.providerMessageId, event.data.email_id),
          ))
          .limit(1)
      : [];
  const recipient = recipientRows[0];
  if (!recipient) return {};

  const occurredAt = eventTimestamp(event);
  const projection: Partial<typeof oneTimeSendRecipients.$inferInsert> = {};
  switch (event.type) {
    case "email.delivered":
      projection.deliveredAt = occurredAt;
      break;
    case "email.opened":
      projection.openedAt = occurredAt;
      break;
    case "email.clicked":
      projection.clickedAt = occurredAt;
      break;
    case "email.bounced":
      projection.bouncedAt = occurredAt;
      break;
    case "email.complained":
      projection.complainedAt = occurredAt;
      break;
    case "email.suppressed":
      projection.suppressedAt = occurredAt;
      break;
    case "email.received":
      projection.repliedAt = occurredAt;
      break;
    case "email.failed":
      projection.status = "failed";
      projection.errorMessage = "Resend reported that the email could not be sent";
      break;
  }

  await db.transaction(async (tx) => {
    if (Object.keys(projection).length > 0) {
      await tx
        .update(oneTimeSendRecipients)
        .set(projection)
        .where(eq(oneTimeSendRecipients.id, recipient.id));
    }
    await tx.insert(oneTimeSendMessageEvents).values({
      recipientId: recipient.id,
      provider: "resend",
      providerEventId: webhookEventId ?? null,
      eventType: event.type,
      occurredAt,
      metadata: {
        emailId: event.data.email_id ?? null,
        from: event.data.from ?? null,
        to: event.data.to ?? [],
        subject: event.data.subject ?? null,
      },
    });
  });
  await refreshOneTimeSendMetrics(db, recipient.sendId);
  return { recipientId: recipient.id };
}

async function recordSmartPlanEvent(
  event: ResendWebhookEvent,
  webhookEventId?: string
): Promise<{ executionId?: number; duplicate?: boolean }> {
  if (!SMART_PLAN_EVENT_TYPES.has(event.type)) return {};

  const db = await getDb();
  if (!db) return {};

  // Svix IDs are unique per delivery. Check before doing any stateful work so a
  // retry cannot double count a metric or regress a timestamp.
  if (webhookEventId) {
    const prior = await db
      .select({ id: smartPlanMessageEvents.id, executionId: smartPlanMessageEvents.executionId })
      .from(smartPlanMessageEvents)
      .where(eq(smartPlanMessageEvents.providerEventId, webhookEventId))
      .limit(1);
    if (prior[0]) return { executionId: prior[0].executionId, duplicate: true };
  }

  const replyToken = event.type === "email.received" ? inboundReplyToken(event.data.to) : null;
  const executionRows = replyToken
    ? await db
        .select()
        .from(smartPlanExecutions)
        .where(eq(smartPlanExecutions.replyToken, replyToken))
        .limit(1)
    : event.data.email_id
      ? await db
          .select()
          .from(smartPlanExecutions)
          .where(and(
            eq(smartPlanExecutions.provider, "resend"),
            eq(smartPlanExecutions.providerMessageId, event.data.email_id)
          ))
          .limit(1)
      : [];

  const execution = executionRows[0];
  if (!execution) return {};

  const occurredAt = eventTimestamp(event);
  const projection: Partial<typeof smartPlanExecutions.$inferInsert> = {};
  switch (event.type) {
    case "email.delivered":
      projection.deliveredAt = occurredAt;
      break;
    case "email.opened":
      projection.openedAt = occurredAt;
      break;
    case "email.clicked":
      projection.clickedAt = occurredAt;
      break;
    case "email.bounced":
      projection.bouncedAt = occurredAt;
      break;
    case "email.complained":
      projection.complainedAt = occurredAt;
      break;
    case "email.suppressed":
      projection.suppressedAt = occurredAt;
      break;
    case "email.received":
      projection.repliedAt = occurredAt;
      break;
    case "email.failed":
      projection.status = "failed";
      projection.errorMessage = "Resend reported that the email could not be sent";
      break;
  }

  await db.transaction(async (tx) => {
    if (Object.keys(projection).length > 0) {
      await tx
        .update(smartPlanExecutions)
        .set(projection)
        .where(eq(smartPlanExecutions.id, execution.id));
    }
    await tx.insert(smartPlanMessageEvents).values({
      executionId: execution.id,
      provider: "resend",
      providerEventId: webhookEventId ?? null,
      eventType: event.type,
      occurredAt,
      metadata: {
        emailId: event.data.email_id ?? null,
        from: event.data.from ?? null,
        to: event.data.to ?? [],
        subject: event.data.subject ?? null,
      },
    });
  });

  return { executionId: execution.id };
}

export async function handleResendWebhook(event: ResendWebhookEvent, webhookEventId?: string) {
  const { type, data } = event;
  const recipientEmail = (data.to && data.to[0]) || data.email || null;
  const emailId = data.email_id;

  // Always attempt Smart Plan correlation first. It has no effect on ordinary
  // Resend messages, and returns a no-op when the provider ID is not a plan send.
  const smartPlanResult = await recordSmartPlanEvent(event, webhookEventId);
  if (smartPlanResult.duplicate) {
    return { handled: true, action: "duplicate_ignored", emailId, executionId: smartPlanResult.executionId };
  }
  const oneTimeSendResult = await recordOneTimeSendEvent(event, webhookEventId);
  if (oneTimeSendResult.duplicate) {
    return { handled: true, action: "duplicate_ignored", emailId, recipientId: oneTimeSendResult.recipientId };
  }

  const db = await getDb();
  if (!db) return { handled: false, reason: "db_unavailable" };

  if (type === "email.bounced") {
    if (recipientEmail) {
      await db
        .update(contacts)
        .set({ emailStatus: "bounced", emailBouncedAt: new Date() })
        .where(eq(contacts.email, recipientEmail));
    }
    if (emailId) {
      await db
        .update(emailBehaviors)
        .set({ status: "bounced", updatedAt: new Date() })
        .where(and(eq(emailBehaviors.source, "resend"), eq(emailBehaviors.externalId, emailId)));
    }
    return { handled: true, action: "marked_bounced", email: recipientEmail, executionId: smartPlanResult.executionId, recipientId: oneTimeSendResult.recipientId };
  }

  if (type === "email.complained") {
    if (recipientEmail) {
      await db
        .update(contacts)
        .set({ emailStatus: "unsubscribed", emailUnsubscribedAt: new Date() })
        .where(eq(contacts.email, recipientEmail));
    }
    return { handled: true, action: "marked_unsubscribed_complaint", email: recipientEmail, executionId: smartPlanResult.executionId, recipientId: oneTimeSendResult.recipientId };
  }

  if (type === "email.suppressed") {
    if (recipientEmail) {
      await db
        .update(contacts)
        .set({ emailStatus: "unsubscribed", emailUnsubscribedAt: new Date() })
        .where(eq(contacts.email, recipientEmail));
    }
    return { handled: true, action: "marked_unsubscribed_suppressed", email: recipientEmail, executionId: smartPlanResult.executionId, recipientId: oneTimeSendResult.recipientId };
  }

  if (type === "email.delivered" && emailId) {
    await db
      .update(emailBehaviors)
      .set({ status: "delivered", updatedAt: new Date() })
      .where(and(eq(emailBehaviors.source, "resend"), eq(emailBehaviors.externalId, emailId)));
    return { handled: true, action: "marked_delivered", emailId, executionId: smartPlanResult.executionId, recipientId: oneTimeSendResult.recipientId };
  }

  if (type === "email.opened" && emailId) {
    await db
      .update(emailBehaviors)
      .set({ openedAt: new Date(), status: "opened", updatedAt: new Date() })
      .where(and(eq(emailBehaviors.source, "resend"), eq(emailBehaviors.externalId, emailId)));
    return { handled: true, action: "marked_opened", emailId, executionId: smartPlanResult.executionId, recipientId: oneTimeSendResult.recipientId };
  }

  if (type === "email.clicked" && emailId) {
    await db
      .update(emailBehaviors)
      .set({ clickedAt: new Date(), status: "clicked", updatedAt: new Date() })
      .where(and(eq(emailBehaviors.source, "resend"), eq(emailBehaviors.externalId, emailId)));
    return { handled: true, action: "marked_clicked", emailId, executionId: smartPlanResult.executionId, recipientId: oneTimeSendResult.recipientId };
  }

  if (type === "email.received") {
    return { handled: true, action: smartPlanResult.executionId || oneTimeSendResult.recipientId ? "smart_plan_reply_recorded" : "inbound_email_unmatched", executionId: smartPlanResult.executionId, recipientId: oneTimeSendResult.recipientId };
  }

  return { handled: smartPlanResult.executionId !== undefined || oneTimeSendResult.recipientId !== undefined, reason: "unhandled_event_type", type, executionId: smartPlanResult.executionId, recipientId: oneTimeSendResult.recipientId };
}
