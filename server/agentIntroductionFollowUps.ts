import { and, asc, eq, lte } from "drizzle-orm";
import {
  agentIntroductionFollowUps,
  aircallIntegrationState,
  communications,
  contacts,
} from "../drizzle/schema";
import { sendAircallSMS } from "./_core/aircall";
import { getDb, logActivity } from "./db";
import { persistOutboundAircallSend } from "./aircallMessaging";

const FOLLOW_UP_BATCH_SIZE = 25;
let isRunning = false;

function toE164(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return null;
}

/** Delivers queued post-introduction follow-up texts in bounded, idempotent batches. */
export async function processAgentIntroductionFollowUps(): Promise<void> {
  if (isRunning) return;
  isRunning = true;

  try {
    const db = await getDb();
    if (!db) return;
    const now = new Date();
    const [line] = await db
      .select({
        id: aircallIntegrationState.marketingNumberId,
        name: aircallIntegrationState.marketingNumberName,
        digits: aircallIntegrationState.marketingNumberDigits,
      })
      .from(aircallIntegrationState)
      .where(eq(aircallIntegrationState.id, 1))
      .limit(1);

    const dueRows = await db
      .select({ followUp: agentIntroductionFollowUps, contact: contacts })
      .from(agentIntroductionFollowUps)
      .innerJoin(
        contacts,
        eq(agentIntroductionFollowUps.contactId, contacts.id)
      )
      .where(
        and(
          eq(agentIntroductionFollowUps.status, "queued"),
          lte(agentIntroductionFollowUps.dueAt, now)
        )
      )
      .orderBy(
        asc(agentIntroductionFollowUps.dueAt),
        asc(agentIntroductionFollowUps.id)
      )
      .limit(FOLLOW_UP_BATCH_SIZE);

    for (const row of dueRows) {
      // A status transition before delivery prevents concurrent server instances
      // from sending the same scheduled text.
      const claim = await db
        .update(agentIntroductionFollowUps)
        .set({ status: "processing" })
        .where(
          and(
            eq(agentIntroductionFollowUps.id, row.followUp.id),
            eq(agentIntroductionFollowUps.status, "queued")
          )
        );
      if (Number((claim as any)[0]?.affectedRows ?? 0) === 0) continue;

      let status: "sent" | "skipped" | "failed" = "failed";
      let providerMessageId: string | null = null;
      let errorMessage: string | null = null;

      try {
        if (!line?.id) {
          errorMessage =
            "A dedicated Aircall marketing number has not been selected";
        } else if (
          row.contact.doNotContact ||
          row.contact.smsMarketingOptedOutAt
        ) {
          status = "skipped";
          errorMessage = "Contact is opted out of SMS outreach";
        } else if (!row.contact.phone || !toE164(row.contact.phone)) {
          status = "skipped";
          errorMessage = "Contact does not have a valid mobile number";
        } else {
          const destination = toE164(row.contact.phone)!;
          const result = await sendAircallSMS(
            destination,
            row.followUp.body,
            line.id
          );
          if (!result.success || !result.messageId) {
            errorMessage =
              result.error ?? "Aircall did not return a message identifier";
          } else {
            providerMessageId = result.messageId;
            const persisted = await persistOutboundAircallSend({
              messageId: result.messageId,
              body: row.followUp.body,
              destination,
              aircallNumberId: line.id,
              aircallNumberName: line.name,
              aircallNumberDigits: line.digits,
              responseMessage: result.message,
              contactId: row.contact.id,
              savvyUserId: row.followUp.createdById,
            });
            if (persisted.communicationId) {
              await db
                .update(communications)
                .set({ relatedAgentConnectionId: row.followUp.connectionId })
                .where(eq(communications.id, persisted.communicationId));
            }
            status = "sent";
          }
        }
      } catch (error) {
        errorMessage = error instanceof Error ? error.message : String(error);
      }

      await db
        .update(agentIntroductionFollowUps)
        .set({
          status,
          sentAt: status === "sent" ? new Date() : null,
          aircallMessageId: providerMessageId,
          errorMessage,
        })
        .where(eq(agentIntroductionFollowUps.id, row.followUp.id));

      await logActivity({
        userId: row.followUp.createdById,
        action:
          status === "sent"
            ? "agent_introduction_follow_up_sent"
            : "agent_introduction_follow_up_not_sent",
        entityType: "agent_connection",
        entityId: row.followUp.connectionId,
        relatedContactId: row.contact.id,
        details: {
          agentId: row.followUp.agentId,
          followUpId: row.followUp.id,
          status,
          body: row.followUp.body,
          reason: errorMessage,
        },
      });
    }
  } catch (error) {
    console.error("[AgentIntroductions] Follow-up worker error:", error);
  } finally {
    isRunning = false;
  }
}
