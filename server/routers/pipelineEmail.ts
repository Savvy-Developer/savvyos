import { TRPCError } from "@trpc/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { ENV } from "../_core/env";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  activityLog,
  agentConnections,
  communications,
  contacts,
  pipelineEmailBatches,
  pipelineEmailDailyQuotas,
  pipelineEmailSends,
  pipelineEmailTemplates,
  users,
} from "../../drizzle/schema";

const DAILY_SENDER_LIMIT = 250;
const MAX_BATCH_RECIPIENTS = 250;
const SEND_CONCURRENCY = 5;
const OUTREACH_FROM_ADDRESS = process.env.PIPELINE_EMAIL_FROM ?? "Savvy STR Agents <hello@savvy-agents.com>";
const RESEND_EMAIL_ENDPOINT = "https://api.resend.com/emails";
const ELIGIBLE_PIPELINE_STATUSES = new Set([
  "attempted_contact",
  "nurture",
  "active_client",
  "under_contract",
  "closed",
]);
const TEMPLATE_ROLES = ["admin", "agent", "isa"] as const;
type TemplateRole = (typeof TEMPLATE_ROLES)[number];

type PipelineRecipient = {
  connection: typeof agentConnections.$inferSelect;
  contact: typeof contacts.$inferSelect;
  agent: Pick<typeof users.$inferSelect, "id" | "name" | "email"> | null;
};

function easternDateKey(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function effectiveAudienceRole(role: string): TemplateRole | null {
  return TEMPLATE_ROLES.includes(role as TemplateRole) ? (role as TemplateRole) : null;
}

function assertPipelineEmailRole(role: string): asserts role is TemplateRole {
  if (!TEMPLATE_ROLES.includes(role as TemplateRole)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Your role is not permitted to use Pipeline email." });
  }
}

function parseVisibleRoles(value: string | null | undefined): TemplateRole[] {
  const seen = new Set<TemplateRole>();
  for (const role of (value ?? "").split(",")) {
    if (TEMPLATE_ROLES.includes(role as TemplateRole)) seen.add(role as TemplateRole);
  }
  return Array.from(seen);
}

function normalizeVisibleRoles(roles: TemplateRole[]): string {
  return TEMPLATE_ROLES.filter((role) => roles.includes(role)).join(",");
}

function canUseTemplate(template: typeof pipelineEmailTemplates.$inferSelect, userId: number, role: string): boolean {
  if (template.ownerId === userId) return true;
  const audienceRole = effectiveAudienceRole(role);
  return Boolean(audienceRole && parseVisibleRoles(template.visibleToRoles).includes(audienceRole));
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

/**
 * The rich editor intentionally permits styling and links. Remove executable or
 * navigation-abuse markup before it reaches a preview/email client. This is a
 * defense-in-depth guard; users only author content available to their account.
 */
function sanitizeOutboundHtml(value: string): string {
  return value
    .replace(/<\s*(script|iframe|object|embed|form|base|meta|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|iframe|object|embed|form|base|meta)[^>]*\/?\s*>/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s+(href|src)\s*=\s*("\s*javascript:[^"]*"|'\s*javascript:[^']*'|javascript:[^\s>]+)/gi, " $1=\"#\"");
}

function replaceMergeTags(value: string, recipient: PipelineRecipient, senderName: string, html: boolean): string {
  const contact = recipient.contact;
  const contactName = `${contact.firstName ?? ""} ${contact.lastName ?? ""}`.trim();
  const agentName = recipient.agent?.name ?? senderName;
  const values: Record<string, string> = {
    "{{first_name}}": contact.firstName ?? "",
    "{{last_name}}": contact.lastName ?? "",
    "{{full_name}}": contactName,
    "{{agent_name}}": agentName,
    "{{lead_source}}": contact.leadSourceType?.replace(/_/g, " ") ?? "",
  };

  return Object.entries(values).reduce((rendered, [tag, rawValue]) => {
    const replacement = html ? escapeHtml(rawValue) : rawValue;
    return rendered.split(tag).join(replacement);
  }, value);
}

function buildOutboundHtml(bodyHtml: string): string {
  const safeBody = sanitizeOutboundHtml(bodyHtml);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body style="margin:0;padding:0;background:#ffffff;color:#1f2937;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:680px;margin:0 auto;padding:28px 24px;font-size:15px;line-height:1.6;">
      ${safeBody}
      <div style="margin-top:36px;padding-top:18px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;line-height:1.5;">
        <p style="margin:0 0 6px;">You are receiving this email because you are a contact of Savvy STR Agents.</p>
        <p style="margin:0;"><a href="{{{RESEND_UNSUBSCRIBE_URL}}}" style="color:#4b5563;text-decoration:underline;">Unsubscribe</a> &nbsp;|&nbsp; Savvy STR Agents</p>
      </div>
    </div>
  </body>
</html>`;
}

function buildOutboundText(bodyHtml: string): string {
  return `${stripHtml(bodyHtml)}\n\n---\nYou are receiving this email because you are a contact of Savvy STR Agents.\nTo unsubscribe, visit: {{{RESEND_UNSUBSCRIBE_URL}}}`;
}

async function sendViaResend(params: {
  to: string;
  replyTo: string;
  subject: string;
  html: string;
  text: string;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!ENV.resendApiKey) {
    return { success: false, error: "Resend is not configured" };
  }

  try {
    const response = await fetch(RESEND_EMAIL_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ENV.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: OUTREACH_FROM_ADDRESS,
        to: [params.to],
        reply_to: params.replyTo,
        subject: params.subject,
        html: params.html,
        text: params.text,
        headers: {
          "List-Unsubscribe": "<{{{RESEND_UNSUBSCRIBE_URL}}}>",
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      return { success: false, error: `Resend rejected the email (${response.status}): ${detail.slice(0, 500)}` };
    }

    const data = (await response.json()) as { id?: string };
    return { success: true, messageId: data.id };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

async function reserveDailyQuota(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, senderUserId: number, count: number): Promise<number> {
  const sendDate = easternDateKey();
  await db
    .insert(pipelineEmailDailyQuotas)
    .values({ senderUserId, sendDate, attemptedCount: 0, deliveredCount: 0 })
    .onDuplicateKeyUpdate({ set: { updatedAt: new Date() } });

  const updateResult = await db
    .update(pipelineEmailDailyQuotas)
    .set({ attemptedCount: sql`${pipelineEmailDailyQuotas.attemptedCount} + ${count}` as any })
    .where(and(
      eq(pipelineEmailDailyQuotas.senderUserId, senderUserId),
      eq(pipelineEmailDailyQuotas.sendDate, sendDate),
      sql`${pipelineEmailDailyQuotas.attemptedCount} + ${count} <= ${DAILY_SENDER_LIMIT}`,
    ));

  const affectedRows = Number((updateResult as any)?.[0]?.affectedRows ?? (updateResult as any)?.affectedRows ?? 0);
  const [quota] = await db
    .select({ attemptedCount: pipelineEmailDailyQuotas.attemptedCount })
    .from(pipelineEmailDailyQuotas)
    .where(and(
      eq(pipelineEmailDailyQuotas.senderUserId, senderUserId),
      eq(pipelineEmailDailyQuotas.sendDate, sendDate),
    ))
    .limit(1);
  const used = Number(quota?.attemptedCount ?? 0);
  const remaining = Math.max(0, DAILY_SENDER_LIMIT - used);
  if (affectedRows > 0) return remaining;
  throw new TRPCError({
    code: "BAD_REQUEST",
    message: `Daily sending limit reached. You have ${remaining} of ${DAILY_SENDER_LIMIT} email sends remaining today.`,
  });
}

async function incrementDeliveredQuota(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, senderUserId: number, count: number): Promise<void> {
  if (count <= 0) return;
  await db
    .update(pipelineEmailDailyQuotas)
    .set({ deliveredCount: sql`${pipelineEmailDailyQuotas.deliveredCount} + ${count}` as any })
    .where(and(
      eq(pipelineEmailDailyQuotas.senderUserId, senderUserId),
      eq(pipelineEmailDailyQuotas.sendDate, easternDateKey()),
    ));
}

async function getAuthorizedRecipients(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  connectionIds: number[],
  user: { id: number; role: string },
): Promise<PipelineRecipient[]> {
  const rows = await db
    .select({
      connection: agentConnections,
      contact: contacts,
      agent: { id: users.id, name: users.name, email: users.email },
    })
    .from(agentConnections)
    .innerJoin(contacts, eq(agentConnections.contactId, contacts.id))
    .leftJoin(users, eq(agentConnections.agentId, users.id))
    .where(inArray(agentConnections.id, connectionIds));

  if (rows.length !== connectionIds.length) {
    throw new TRPCError({ code: "NOT_FOUND", message: "One or more Pipeline connections could not be found." });
  }

  if (user.role !== "admin" && user.role !== "isa" && user.role !== "agent") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Your role is not permitted to send Pipeline email." });
  }

  if (user.role === "agent" && rows.some((row) => row.connection.agentId !== user.id)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "You can only email contacts connected to your own Pipeline." });
  }

  const ineligible = rows.filter((row) => {
    const email = row.contact.email?.trim();
    return !ELIGIBLE_PIPELINE_STATUSES.has(row.connection.pipelineStatus)
      || !email
      || row.contact.emailStatus !== "valid";
  });
  if (ineligible.length > 0) {
    const examples = ineligible
      .slice(0, 3)
      .map((row) => `${row.contact.firstName} ${row.contact.lastName}`.trim())
      .filter(Boolean)
      .join(", ");
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `${ineligible.length} selected contact${ineligible.length === 1 ? " is" : "s are"} not eligible for email. Contacts must have a valid email address, be deliverable, and be in a status other than New or Dead${examples ? ` (${examples})` : ""}.`,
    });
  }

  return rows;
}

const templatePayload = z.object({
  name: z.string().trim().min(1).max(160),
  subject: z.string().trim().min(1).max(512),
  htmlBody: z.string().trim().min(1).max(100_000),
  visibleToRoles: z.array(z.enum(TEMPLATE_ROLES)).max(TEMPLATE_ROLES.length).default([]),
});

export const pipelineEmailRouter = router({
  quota: protectedProcedure.query(async ({ ctx }) => {
    assertPipelineEmailRole(ctx.user.role);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    const sendDate = easternDateKey();
    const [quota] = await db
      .select({ attemptedCount: pipelineEmailDailyQuotas.attemptedCount, deliveredCount: pipelineEmailDailyQuotas.deliveredCount })
      .from(pipelineEmailDailyQuotas)
      .where(and(
        eq(pipelineEmailDailyQuotas.senderUserId, ctx.user.id),
        eq(pipelineEmailDailyQuotas.sendDate, sendDate),
      ))
      .limit(1);
    const used = Number(quota?.attemptedCount ?? 0);
    return {
      limit: DAILY_SENDER_LIMIT,
      used,
      delivered: Number(quota?.deliveredCount ?? 0),
      remaining: Math.max(0, DAILY_SENDER_LIMIT - used),
      date: sendDate,
    };
  }),

  templates: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      assertPipelineEmailRole(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const templates = await db
        .select({ template: pipelineEmailTemplates, owner: { id: users.id, name: users.name, role: users.role } })
        .from(pipelineEmailTemplates)
        .leftJoin(users, eq(pipelineEmailTemplates.ownerId, users.id));
      return templates
        .filter((row) => canUseTemplate(row.template, ctx.user.id, ctx.user.role))
        .map((row) => ({
          ...row.template,
          visibleToRoles: parseVisibleRoles(row.template.visibleToRoles),
          ownerName: row.owner?.name ?? "Unknown",
          ownerRole: row.owner?.role ?? null,
          canEdit: row.template.ownerId === ctx.user.id,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }),

    create: protectedProcedure
      .input(templatePayload)
      .mutation(async ({ input, ctx }) => {
        assertPipelineEmailRole(ctx.user.role);
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
        const visibleToRoles = ctx.user.role === "admin" ? normalizeVisibleRoles(input.visibleToRoles) : "";
        const [result] = await db.insert(pipelineEmailTemplates).values({
          name: input.name,
          subject: input.subject,
          htmlBody: sanitizeOutboundHtml(input.htmlBody),
          ownerId: ctx.user.id,
          visibleToRoles,
        });
        return { id: Number((result as any).insertId) };
      }),

    update: protectedProcedure
      .input(templatePayload.extend({ id: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        assertPipelineEmailRole(ctx.user.role);
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
        const [template] = await db.select().from(pipelineEmailTemplates).where(eq(pipelineEmailTemplates.id, input.id)).limit(1);
        if (!template) throw new TRPCError({ code: "NOT_FOUND", message: "Email template not found." });
        if (template.ownerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Only the template owner can edit this template." });
        const visibleToRoles = ctx.user.role === "admin" ? normalizeVisibleRoles(input.visibleToRoles) : "";
        await db.update(pipelineEmailTemplates).set({
          name: input.name,
          subject: input.subject,
          htmlBody: sanitizeOutboundHtml(input.htmlBody),
          visibleToRoles,
        }).where(eq(pipelineEmailTemplates.id, input.id));
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        assertPipelineEmailRole(ctx.user.role);
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
        const [template] = await db.select().from(pipelineEmailTemplates).where(eq(pipelineEmailTemplates.id, input.id)).limit(1);
        if (!template) throw new TRPCError({ code: "NOT_FOUND", message: "Email template not found." });
        if (template.ownerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Only the template owner can delete this template." });
        await db.delete(pipelineEmailTemplates).where(eq(pipelineEmailTemplates.id, input.id));
        return { success: true };
      }),
  }),

  send: protectedProcedure
    .input(z.object({
      connectionIds: z.array(z.number().int().positive()).min(1).max(MAX_BATCH_RECIPIENTS),
      subject: z.string().trim().min(1).max(512),
      htmlBody: z.string().trim().min(1).max(100_000),
      templateId: z.number().int().positive().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      assertPipelineEmailRole(ctx.user.role);
      const connectionIds = Array.from(new Set(input.connectionIds));
      if (connectionIds.length > MAX_BATCH_RECIPIENTS) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `A maximum of ${MAX_BATCH_RECIPIENTS} contacts can be emailed in one action.` });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [sender] = await db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(eq(users.id, ctx.user.id))
        .limit(1);
      const replyTo = sender?.email?.trim();
      if (!replyTo || !z.string().email().safeParse(replyTo).success) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Your SavvyOS profile needs a valid email address before you can send Pipeline email.",
        });
      }

      if (input.templateId) {
        const [template] = await db.select().from(pipelineEmailTemplates).where(eq(pipelineEmailTemplates.id, input.templateId)).limit(1);
        if (!template || !canUseTemplate(template, ctx.user.id, ctx.user.role)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to the selected email template." });
        }
      }

      const recipients = await getAuthorizedRecipients(db, connectionIds, ctx.user);
      const remainingToday = await reserveDailyQuota(db, ctx.user.id, recipients.length);

      const [batchResult] = await db.insert(pipelineEmailBatches).values({
        senderUserId: ctx.user.id,
        templateId: input.templateId ?? null,
        subject: input.subject,
        recipientCount: recipients.length,
        status: "sending",
      });
      const batchId = Number((batchResult as any).insertId);

      await db.insert(pipelineEmailSends).values(recipients.map((recipient) => ({
        batchId,
        senderUserId: ctx.user.id,
        contactId: recipient.contact.id,
        agentConnectionId: recipient.connection.id,
        recipientEmail: recipient.contact.email!.trim(),
        status: "sending" as const,
      })));

      const senderName = sender?.name ?? ctx.user.name ?? "Savvy STR Agents";
      const outcomes = await mapWithConcurrency(recipients, SEND_CONCURRENCY, async (recipient) => {
        const renderedBody = replaceMergeTags(input.htmlBody, recipient, senderName, true);
        const renderedSubject = replaceMergeTags(input.subject, recipient, senderName, false).trim();
        const result = await sendViaResend({
          to: recipient.contact.email!.trim(),
          replyTo,
          subject: renderedSubject,
          html: buildOutboundHtml(renderedBody),
          text: buildOutboundText(renderedBody),
        });

        if (result.success) {
          await Promise.all([
            db.update(pipelineEmailSends).set({
              status: "sent",
              resendMessageId: result.messageId ?? null,
              sentAt: new Date(),
            }).where(and(
              eq(pipelineEmailSends.batchId, batchId),
              eq(pipelineEmailSends.agentConnectionId, recipient.connection.id),
            )),
            db.insert(communications).values({
              type: "email",
              subject: renderedSubject,
              body: stripHtml(renderedBody),
              direction: "outbound",
              authorId: ctx.user.id,
              relatedContactId: recipient.contact.id,
              relatedAgentConnectionId: recipient.connection.id,
              communicatedAt: new Date(),
            }),
          ]);
          return { success: true };
        }

        await db.update(pipelineEmailSends).set({
          status: "failed",
          errorMessage: result.error ?? "Email delivery failed",
        }).where(and(
          eq(pipelineEmailSends.batchId, batchId),
          eq(pipelineEmailSends.agentConnectionId, recipient.connection.id),
        ));
        return { success: false, error: result.error ?? "Email delivery failed" };
      });

      const deliveredCount = outcomes.filter((outcome) => outcome.success).length;
      const failedCount = outcomes.length - deliveredCount;
      const batchStatus = deliveredCount === outcomes.length ? "completed" : deliveredCount > 0 ? "partial" : "failed";
      await Promise.all([
        incrementDeliveredQuota(db, ctx.user.id, deliveredCount),
        db.update(pipelineEmailBatches).set({
          deliveredCount,
          failedCount,
          status: batchStatus,
          completedAt: new Date(),
        }).where(eq(pipelineEmailBatches.id, batchId)),
        db.insert(activityLog).values({
          userId: ctx.user.id,
          action: "pipeline_email_sent",
          entityType: "pipeline_email_batch",
          entityId: batchId,
          details: {
            recipientCount: recipients.length,
            deliveredCount,
            failedCount,
            replyTo,
            templateId: input.templateId ?? null,
          },
        }),
      ]);

      return {
        batchId,
        recipientCount: recipients.length,
        deliveredCount,
        failedCount,
        status: batchStatus,
        remainingToday,
      };
    }),
});
