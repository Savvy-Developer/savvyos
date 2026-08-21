import { and, eq, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { ENV } from "../_core/env";
import { protectedProcedure, router } from "../_core/trpc";
import { appendSignatureToCustomEmail, isCompleteEmailDocument, renderSavvyEmail } from "../_core/savvyEmailTemplate";
import { getDb, resetLeadAgingByConnectionId } from "../db";
import {
  activityLog,
  agentConnections,
  communications,
  contacts,
  pipelineEmailDailyQuotas,
  userProfiles,
  users,
} from "../../drizzle/schema";

const DAILY_SENDER_LIMIT = 250;
const OUTREACH_FROM_ADDRESS =
  process.env.PIPELINE_EMAIL_FROM ??
  "Savvy STR Agents <hello@savvy-agents.com>";
const RESEND_EMAIL_ENDPOINT = "https://api.resend.com/emails";
const ALLOWED_ROLES = new Set(["admin", "agent", "isa"]);

function outboundMailbox(): string {
  const bracketed = OUTREACH_FROM_ADDRESS.match(/<\s*([^<>\s]+@[^<>\s]+)\s*>/);
  return bracketed?.[1] ?? OUTREACH_FROM_ADDRESS.trim();
}

function personalizedFromAddress(senderName: string): string {
  const safeName =
    senderName.replace(/["<>\r\n]/g, "").trim() || "Savvy STR Agents";
  return `${safeName} <${outboundMailbox()}>`;
}

type EmailRecipient = {
  email: string;
  firstName: string;
  contactId: number | null;
  agentConnectionId: number | null;
};

function easternDateKey(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function escapeHtml(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function stripHtml(value: string): string {
  return value
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sanitizeOutboundHtml(value: string): string {
  return value
    .replace(
      /<\s*(script|iframe|object|embed|form|base|meta|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi,
      ""
    )
    .replace(
      /<\s*(script|iframe|object|embed|form|base|meta)[^>]*\/?\s*>/gi,
      ""
    )
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(
      /\s+(href|src)\s*=\s*("\s*javascript:[^"]*"|'\s*javascript:[^']*'|javascript:[^\s>]+)/gi,
      ' $1="#"'
    );
}

function replaceMergeTags(
  value: string,
  recipient: EmailRecipient,
  senderName: string,
  html: boolean
): string {
  const values: Record<string, string> = {
    "{{first_name}}": recipient.firstName,
    "{{agent_name}}": senderName,
  };
  return Object.entries(values).reduce((rendered, [tag, rawValue]) => {
    const replacement = html ? escapeHtml(rawValue) : rawValue;
    return rendered.split(tag).join(replacement);
  }, value);
}

function buildOutboundHtml(subject: string, bodyHtml: string, signatureHtml: string): string {
  const safeBody = sanitizeOutboundHtml(bodyHtml);
  const safeSignature = sanitizeOutboundHtml(signatureHtml);

  // The proforma composer may submit a complete bespoke document. Keep that
  // document intact rather than wrapping it in the default Savvy shell.
  if (isCompleteEmailDocument(safeBody)) {
    return appendSignatureToCustomEmail(safeBody, safeSignature);
  }

  const contentWithSignature = `${safeBody}${safeSignature ? `<div style="margin-top:28px;">${safeSignature}</div>` : ""}`;
  return renderSavvyEmail(subject, contentWithSignature, true);
}

function buildOutboundText(bodyHtml: string, signatureHtml: string): string {
  const signatureText = stripHtml(signatureHtml);
  return `${stripHtml(bodyHtml)}${signatureText ? `\n\n${signatureText}` : ""}\n\n---\nYou are receiving this email because you are a contact of Savvy STR Agents.\nTo unsubscribe, visit: {{{RESEND_UNSUBSCRIBE_URL}}}`;
}

async function reserveDailyQuota(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  senderUserId: number
): Promise<number> {
  const sendDate = easternDateKey();
  await db
    .insert(pipelineEmailDailyQuotas)
    .values({ senderUserId, sendDate, attemptedCount: 0, deliveredCount: 0 })
    .onDuplicateKeyUpdate({ set: { updatedAt: new Date() } });

  const updateResult = await db
    .update(pipelineEmailDailyQuotas)
    .set({
      attemptedCount:
        sql`${pipelineEmailDailyQuotas.attemptedCount} + 1` as any,
    })
    .where(
      and(
        eq(pipelineEmailDailyQuotas.senderUserId, senderUserId),
        eq(pipelineEmailDailyQuotas.sendDate, sendDate),
        sql`${pipelineEmailDailyQuotas.attemptedCount} + 1 <= ${DAILY_SENDER_LIMIT}`
      )
    );

  const affectedRows = Number(
    (updateResult as any)?.[0]?.affectedRows ??
      (updateResult as any)?.affectedRows ??
      0
  );
  const [quota] = await db
    .select({ attemptedCount: pipelineEmailDailyQuotas.attemptedCount })
    .from(pipelineEmailDailyQuotas)
    .where(
      and(
        eq(pipelineEmailDailyQuotas.senderUserId, senderUserId),
        eq(pipelineEmailDailyQuotas.sendDate, sendDate)
      )
    )
    .limit(1);
  const remaining = Math.max(
    0,
    DAILY_SENDER_LIMIT - Number(quota?.attemptedCount ?? 0)
  );
  if (affectedRows > 0) return remaining;
  throw new TRPCError({
    code: "BAD_REQUEST",
    message: `Daily sending limit reached. You have ${remaining} of ${DAILY_SENDER_LIMIT} email sends remaining today.`,
  });
}

async function incrementDeliveredQuota(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  senderUserId: number
): Promise<void> {
  await db
    .update(pipelineEmailDailyQuotas)
    .set({
      deliveredCount:
        sql`${pipelineEmailDailyQuotas.deliveredCount} + 1` as any,
    })
    .where(
      and(
        eq(pipelineEmailDailyQuotas.senderUserId, senderUserId),
        eq(pipelineEmailDailyQuotas.sendDate, easternDateKey())
      )
    );
}

export const proformaEmailRouter = router({
  send: protectedProcedure
    .input(
      z.object({
        recipient: z.discriminatedUnion("kind", [
          z.object({
            kind: z.literal("contact"),
            contactId: z.number().int().positive(),
          }),
          z.object({
            kind: z.literal("manual"),
            email: z.string().trim().email("Enter a valid email address."),
          }),
        ]),
        subject: z.string().trim().min(1, "Add an email subject.").max(512),
        htmlBody: z
          .string()
          .trim()
          .min(1, "Add an email message.")
          .max(100_000),
        propertyId: z.number().int().positive(),
        proformaId: z.number().int().positive().optional(),
        proformaTitle: z.string().trim().min(1).max(255),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!ALLOWED_ROLES.has(ctx.user.role)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Your role is not permitted to email a proforma.",
        });
      }

      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database unavailable",
        });

      let recipient: EmailRecipient;
      if (input.recipient.kind === "manual") {
        recipient = {
          email: input.recipient.email.trim(),
          firstName: "",
          contactId: null,
          agentConnectionId: null,
        };
      } else {
        const [row] = await db
          .select({ contact: contacts, agentConnection: agentConnections })
          .from(contacts)
          .leftJoin(
            agentConnections,
            and(
              eq(agentConnections.contactId, contacts.id),
              eq(agentConnections.agentId, ctx.user.id)
            )
          )
          .where(eq(contacts.id, input.recipient.contactId))
          .limit(1);
        if (!row || row.contact.archivedAt) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "The selected contact could not be found.",
          });
        }
        if (ctx.user.role === "agent" && !row.agentConnection) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message:
              "You can only email contacts connected to your own Pipeline.",
          });
        }
        if (row.contact.doNotContact) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "This contact is marked Do Not Contact and cannot be emailed.",
          });
        }
        const email = row.contact.email?.trim();
        if (!email || !z.string().email().safeParse(email).success) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "The selected contact needs a valid email address before you can send this proforma.",
          });
        }
        recipient = {
          email,
          firstName: row.contact.firstName?.trim() ?? "",
          contactId: row.contact.id,
          agentConnectionId: row.agentConnection?.id ?? null,
        };
      }

      const [sender] = await db
        .select({
          name: users.name,
          email: users.email,
          emailSignatureHtml: userProfiles.emailSignatureHtml,
        })
        .from(users)
        .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
        .where(eq(users.id, ctx.user.id))
        .limit(1);
      const replyTo = sender?.email?.trim();
      if (!replyTo || !z.string().email().safeParse(replyTo).success) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Your SavvyOS profile needs a valid email address before you can email a proforma.",
        });
      }
      const emailSignatureHtml = sanitizeOutboundHtml(
        sender?.emailSignatureHtml ?? ""
      );
      if (!stripHtml(emailSignatureHtml)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Add and save your Email Signature in My Profile before emailing a proforma.",
        });
      }

      const remainingToday = await reserveDailyQuota(db, ctx.user.id);
      const senderName = sender?.name ?? ctx.user.name ?? "Savvy STR Agents";
      const renderedBody = replaceMergeTags(
        input.htmlBody,
        recipient,
        senderName,
        true
      );
      const renderedSubject = replaceMergeTags(
        input.subject,
        recipient,
        senderName,
        false
      ).trim();
      let deliveryError: string | null = null;
      let resendMessageId: string | null = null;

      try {
        const response = await fetch(RESEND_EMAIL_ENDPOINT, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${ENV.resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: personalizedFromAddress(senderName),
            to: [recipient.email],
            reply_to: replyTo,
            subject: renderedSubject,
            html: buildOutboundHtml(renderedSubject, renderedBody, emailSignatureHtml),
            text: buildOutboundText(renderedBody, emailSignatureHtml),
            headers: {
              "List-Unsubscribe": "<{{{RESEND_UNSUBSCRIBE_URL}}}>",
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
          }),
        });
        if (!response.ok) {
          deliveryError = `Resend rejected the email (${response.status}): ${(await response.text()).slice(0, 500)}`;
        } else {
          const data = (await response.json()) as { id?: string };
          resendMessageId = data.id ?? null;
        }
      } catch (error) {
        deliveryError = error instanceof Error ? error.message : String(error);
      }

      if (deliveryError) {
        await db.insert(activityLog).values({
          userId: ctx.user.id,
          action: "proforma_email_failed",
          entityType: input.proformaId ? "proforma" : "property",
          entityId: input.proformaId ?? input.propertyId,
          details: {
            recipientEmail: recipient.email,
            recipientType: input.recipient.kind,
            proformaTitle: input.proformaTitle,
            error: deliveryError,
          },
        });
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Email delivery failed: ${deliveryError}`,
        });
      }

      await incrementDeliveredQuota(db, ctx.user.id);
      await Promise.all([
        recipient.contactId
          ? db.insert(communications).values({
              type: "email",
              subject: renderedSubject,
              body: stripHtml(renderedBody),
              direction: "outbound",
              authorId: ctx.user.id,
              relatedContactId: recipient.contactId,
              relatedAgentConnectionId: recipient.agentConnectionId,
              communicatedAt: new Date(),
            })
          : Promise.resolve(),
        db.insert(activityLog).values({
          userId: ctx.user.id,
          action: "proforma_emailed",
          entityType: input.proformaId ? "proforma" : "property",
          entityId: input.proformaId ?? input.propertyId,
          details: {
            recipientEmail: recipient.email,
            recipientType: input.recipient.kind,
            contactId: recipient.contactId,
            proformaTitle: input.proformaTitle,
            resendMessageId,
            fromName: senderName,
            replyTo,
          },
        }),
      ]);
      if (ctx.user.role === "agent" && recipient.agentConnectionId) {
        try {
          await resetLeadAgingByConnectionId(recipient.agentConnectionId, ctx.user.id);
        } catch (_) {}
      }

      return { success: true, recipientEmail: recipient.email, remainingToday };
    }),
});
