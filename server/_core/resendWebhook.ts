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
