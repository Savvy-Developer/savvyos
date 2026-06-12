/**
 * Resend Webhook Handler
 * Processes email.bounced, email.complained, and email.suppressed events
 * to keep contact emailStatus in sync for Smart Plans suppression.
 *
 * Note: Resend does not have a contact.unsubscribed event.
 * email.suppressed fires when a contact is added to Resend's suppression list
 * (e.g. via the unsubscribe link in emails).
 */
import { getDb } from "../db";
import { contacts } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { createHmac } from "crypto";

// Resend signs webhooks with HMAC-SHA256 using the webhook signing secret
export function verifyResendWebhookSignature(
  payload: string,
  signature: string | undefined,
  secret: string
): boolean {
  if (!signature || !secret) return false;
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  return signature === expected;
}

export async function handleResendWebhook(event: {
  type: string;
  data: {
    email_id?: string;
    to?: string[];
    from?: string;
    subject?: string;
    created_at?: string;
    // contact.unsubscribed event
    email?: string;
  };
}) {
  const { type, data } = event;

  // Extract the recipient email
  const recipientEmail =
    (data.to && data.to[0]) || data.email || null;

  if (!recipientEmail) return { handled: false, reason: "no_email" };

  const db = await getDb();
  if (!db) return { handled: false, reason: "db_unavailable" };

  if (type === "email.bounced") {
    // Hard bounce — mark contact as bounced, suppress all future sends
    await db
      .update(contacts)
      .set({
        emailStatus: "bounced",
        emailBouncedAt: new Date(),
      })
      .where(eq(contacts.email, recipientEmail));

    console.log(`[Resend Webhook] Marked ${recipientEmail} as bounced`);
    return { handled: true, action: "marked_bounced", email: recipientEmail };
  }

  if (type === "email.complained") {
    // Spam complaint — treat as unsubscribe
    await db
      .update(contacts)
      .set({
        emailStatus: "unsubscribed",
        emailUnsubscribedAt: new Date(),
      })
      .where(eq(contacts.email, recipientEmail));

    console.log(`[Resend Webhook] Marked ${recipientEmail} as unsubscribed (spam complaint)`);
    return { handled: true, action: "marked_unsubscribed_complaint", email: recipientEmail };
  }

  if (type === "email.suppressed") {
    // Contact was added to Resend's suppression list (e.g. clicked unsubscribe link)
    await db
      .update(contacts)
      .set({
        emailStatus: "unsubscribed",
        emailUnsubscribedAt: new Date(),
      })
      .where(eq(contacts.email, recipientEmail));

    console.log(`[Resend Webhook] Marked ${recipientEmail} as unsubscribed (suppressed)`);
    return { handled: true, action: "marked_unsubscribed_suppressed", email: recipientEmail };
  }

  return { handled: false, reason: "unhandled_event_type", type };
}
