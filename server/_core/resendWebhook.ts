/**
 * Resend Webhook Handler
 * Processes email.bounced, email.complained, email.suppressed, email.delivered,
 * email.opened, and email.clicked events.
 *
 * - Bounce/complaint/suppressed: updates contact emailStatus for Smart Plans suppression.
 * - Delivered/opened/clicked: updates email_behaviors status for the Email Behaviors tab.
 *
 * Note: Resend does not have a contact.unsubscribed event.
 * email.suppressed fires when a contact is added to Resend's suppression list
 * (e.g. via the unsubscribe link in emails).
 */
import { getDb } from "../db";
import { contacts, emailBehaviors } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { createHmac } from "crypto";

// Resend uses Svix for webhook delivery.
// Svix signs the concatenation of: "{svix-id}.{svix-timestamp}.{rawBody}"
// The signature header has the format: "v1,<base64-encoded-sig>" (may contain multiple comma-separated signatures)
export function verifyResendWebhookSignature(
  payload: string,
  svixSignature: string | undefined,
  secret: string,
  svixId?: string,
  svixTimestamp?: string
): boolean {
  if (!svixSignature || !secret) return false;

  // Strip the "whsec_" prefix if present (Resend dashboard shows the secret with this prefix)
  const rawSecret = secret.startsWith("whsec_")
    ? Buffer.from(secret.slice("whsec_".length), "base64")
    : Buffer.from(secret, "base64");

  // Build the signed content as Svix expects
  const signedContent = `${svixId ?? ""}.${svixTimestamp ?? ""}.${payload}`;

  const expectedSig = createHmac("sha256", rawSecret)
    .update(signedContent)
    .digest("base64");

  // The header may contain multiple signatures separated by spaces (e.g. "v1,abc v1,xyz")
  const signatures = svixSignature.split(" ");
  return signatures.some((sig) => {
    const [version, sigValue] = sig.split(",");
    return version === "v1" && sigValue === expectedSig;
  });
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

  const emailId = data.email_id;

  const db = await getDb();
  if (!db) return { handled: false, reason: "db_unavailable" };

  // ── Suppression events (contact-level) ────────────────────────────────────
  if (type === "email.bounced") {
    if (recipientEmail) {
      await db
        .update(contacts)
        .set({ emailStatus: "bounced", emailBouncedAt: new Date() })
        .where(eq(contacts.email, recipientEmail));
      console.log(`[Resend Webhook] Marked ${recipientEmail} as bounced`);
    }
    // Also update email_behaviors status
    if (emailId) {
      await db
        .update(emailBehaviors)
        .set({ status: "bounced", updatedAt: new Date() })
        .where(and(eq(emailBehaviors.source, "resend"), eq(emailBehaviors.externalId, emailId)));
    }
    return { handled: true, action: "marked_bounced", email: recipientEmail };
  }

  if (type === "email.complained") {
    if (recipientEmail) {
      await db
        .update(contacts)
        .set({ emailStatus: "unsubscribed", emailUnsubscribedAt: new Date() })
        .where(eq(contacts.email, recipientEmail));
      console.log(`[Resend Webhook] Marked ${recipientEmail} as unsubscribed (spam complaint)`);
    }
    return { handled: true, action: "marked_unsubscribed_complaint", email: recipientEmail };
  }

  if (type === "email.suppressed") {
    if (recipientEmail) {
      await db
        .update(contacts)
        .set({ emailStatus: "unsubscribed", emailUnsubscribedAt: new Date() })
        .where(eq(contacts.email, recipientEmail));
      console.log(`[Resend Webhook] Marked ${recipientEmail} as unsubscribed (suppressed)`);
    }
    return { handled: true, action: "marked_unsubscribed_suppressed", email: recipientEmail };
  }

  // ── Engagement events (email_behaviors-level) ─────────────────────────────
  if (type === "email.delivered") {
    if (emailId) {
      await db
        .update(emailBehaviors)
        .set({ status: "delivered", updatedAt: new Date() })
        .where(and(eq(emailBehaviors.source, "resend"), eq(emailBehaviors.externalId, emailId)));
      console.log(`[Resend Webhook] Marked email ${emailId} as delivered`);
    }
    return { handled: true, action: "marked_delivered", emailId };
  }

  if (type === "email.opened") {
    if (emailId) {
      await db
        .update(emailBehaviors)
        .set({ openedAt: new Date(), status: "opened", updatedAt: new Date() })
        .where(and(eq(emailBehaviors.source, "resend"), eq(emailBehaviors.externalId, emailId)));
      console.log(`[Resend Webhook] Marked email ${emailId} as opened`);
    }
    return { handled: true, action: "marked_opened", emailId };
  }

  if (type === "email.clicked") {
    if (emailId) {
      await db
        .update(emailBehaviors)
        .set({ clickedAt: new Date(), status: "clicked", updatedAt: new Date() })
        .where(and(eq(emailBehaviors.source, "resend"), eq(emailBehaviors.externalId, emailId)));
      console.log(`[Resend Webhook] Marked email ${emailId} as clicked`);
    }
    return { handled: true, action: "marked_clicked", emailId };
  }

  return { handled: false, reason: "unhandled_event_type", type };
}
