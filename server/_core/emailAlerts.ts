import { getDb } from "../db";
import { users, contacts } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { sendTransactionalEmail, EmailType } from "./resendEmail";

/**
 * Send an email alert to a user by userId.
 * Uses Resend for Savvy-branded email delivery.
 */
export async function sendEmailAlert(
  type: EmailType,
  userId: number,
  context: Record<string, unknown> = {}
): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) return;

    // Resolve the contact name from contactId when the caller didn't pass a
    // name. Callers like the "lead_assigned" alert only pass contactId, which
    // left the email's Contact field blank ("—") and the subject as "New
    // Contact". Looking it up here fixes it for every caller centrally.
    let contactName = context.contactName as string | undefined;
    if (!contactName && context.contactId != null) {
      const [contact] = await db
        .select({ firstName: contacts.firstName, lastName: contacts.lastName })
        .from(contacts)
        .where(eq(contacts.id, Number(context.contactId)))
        .limit(1);
      if (contact) {
        contactName =
          `${contact.firstName ?? ""} ${contact.lastName ?? ""}`.trim() || undefined;
      }
    }

    // Send Savvy-branded email via Resend if the user has an email address
    if (user.email) {
      await sendTransactionalEmail(type, {
        recipientName: user.name ?? undefined,
        recipientEmail: user.email,
        contactName,
        agentName: context.agentName as string | undefined,
        transactionNumber: context.transactionNumber as string | undefined,
        transactionType: context.transactionType as string | undefined,
        propertyAddress: context.propertyAddress as string | undefined,
        status: context.status as string | undefined,
        taskTitle: context.taskTitle as string | undefined,
        dueDate: context.dueDate as string | undefined,
        amount: context.amount as string | undefined,
        percentage: context.percentage as string | undefined,
        notes: context.notes as string | undefined,
        listingAddress: context.listingAddress as string | undefined,
        listPrice: context.listPrice as string | undefined,
        listingDate: context.listingDate as string | undefined,
        expirationDate: context.expirationDate as string | undefined,
        overdueCount: context.overdueCount as string | undefined,
        taskList: context.taskList as string | undefined,
      });
    }
  } catch (err) {
    console.error("[EmailAlert] Failed to send alert:", err);
  }
}
