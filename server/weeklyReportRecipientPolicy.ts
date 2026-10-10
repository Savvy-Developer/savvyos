import { eq } from "drizzle-orm";
import { emailNotificationSettings } from "../drizzle/schema";
import { getDb } from "./db";

const RETIRED_RECIPIENT_EMAIL = "amyrollins@savvy.realty";

export const WEEKLY_LEAD_REPORT_REQUIRED_RECIPIENT_EMAILS = [
  "nataliacallejas@savvy.realty",
  "camilo@savvy.realty",
  "dhruv@savvy.realty",
] as const;

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * Keeps an explicit Weekly Lead Report list aligned with the current operating
 * distribution. Empty and missing lists intentionally retain code defaults.
 */
export function reconcileWeeklyLeadReportRecipients(recipientEmails: unknown): string[] | null {
  if (!Array.isArray(recipientEmails) || recipientEmails.length === 0) return null;

  const next: string[] = [];
  const seen = new Set<string>();
  for (const value of recipientEmails) {
    if (typeof value !== "string") continue;
    const email = value.trim().toLowerCase();
    if (!isValidEmail(email) || email === RETIRED_RECIPIENT_EMAIL || seen.has(email)) continue;
    seen.add(email);
    next.push(email);
  }
  for (const email of WEEKLY_LEAD_REPORT_REQUIRED_RECIPIENT_EMAILS) {
    if (!seen.has(email)) {
      seen.add(email);
      next.push(email);
    }
  }
  return next;
}

/**
 * Reconciles the saved Weekly Lead Report distribution before schedulers are
 * installed, so a previously saved recipient list cannot bypass this update.
 */
export async function ensureWeeklyLeadReportRecipientPolicy(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const [setting] = await db
    .select({ id: emailNotificationSettings.id, recipientEmails: emailNotificationSettings.recipientEmails })
    .from(emailNotificationSettings)
    .where(eq(emailNotificationSettings.notificationKey, "weekly_lead_report"))
    .limit(1);

  const reconciled = reconcileWeeklyLeadReportRecipients(setting?.recipientEmails);
  if (!setting || !reconciled) return;

  const normalizedStored = (setting.recipientEmails ?? [])
    .filter((email): email is string => typeof email === "string")
    .map(email => email.trim().toLowerCase());
  if (normalizedStored.length === reconciled.length && normalizedStored.every((email, index) => email === reconciled[index])) {
    return;
  }

  await db
    .update(emailNotificationSettings)
    .set({ recipientEmails: reconciled })
    .where(eq(emailNotificationSettings.id, setting.id));
}
