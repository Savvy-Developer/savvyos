import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray, or } from "drizzle-orm";
import { z } from "zod";
import {
  activityLog,
  agentConnections,
  communications,
  contacts,
  leadSources,
  pipelineEmailDailyUsage,
  pipelineEmailDeliveries,
  pipelineEmailTemplates,
  users,
} from "../../drizzle/schema";
import { getDb } from "../db";
import {
  PIPELINE_EMAIL_BATCH_LIMIT,
  PIPELINE_EMAIL_DAILY_LIMIT,
  pipelineUsageDate,
  renderPipelineMergeTags,
  sanitizePipelineEmailHtml,
  sendPipelineEmailBatch,
  wrapPipelineEmail,
} from "../_core/pipelineEmail";
import { protectedProcedure, router } from "../_core/trpc";
import { wiseStampSignatureProvider } from "../_core/wisestampSignature";

const roleVisibility = {
  admin: pipelineEmailTemplates.visibleToAdmins,
  agent: pipelineEmailTemplates.visibleToAgents,
  isa: pipelineEmailTemplates.visibleToIsas,
} as const;

function assertPipelineEmailRole(role: string): asserts role is keyof typeof roleVisibility {
  if (role !== "admin" && role !== "agent" && role !== "isa") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Pipeline email is available only to admins, agents, and ISAs." });
  }
}

const templateBody = z.object({
  name: z.string().trim().min(1).max(255),
  subject: z.string().trim().min(1).max(512),
  bodyHtml: z.string().trim().min(1).max(250_000),
  isPersonal: z.boolean().default(true),
  visibleToAdmins: z.boolean().default(false),
  visibleToAgents: z.boolean().default(false),
  visibleToIsas: z.boolean().default(false),
});

function normalizedVisibility(input: z.infer<typeof templateBody>, role: string) {
  if (role !== "admin") {
    return {
      isPersonal: true,
      visibleToAdmins: false,
      visibleToAgents: false,
      visibleToIsas: false,
    };
  }
  if (!input.isPersonal && !input.visibleToAdmins && !input.visibleToAgents && !input.visibleToIsas) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Choose at least one role for a shared template, or mark it personal.",
    });
  }
  return {
    isPersonal: input.isPersonal,
    visibleToAdmins: input.isPersonal ? false : input.visibleToAdmins,
    visibleToAgents: input.isPersonal ? false : input.visibleToAgents,
    visibleToIsas: input.isPersonal ? false : input.visibleToIsas,
  };
}

export const pipelineEmailRouter = router({
  limits: protectedProcedure.query(async ({ ctx }) => {
    assertPipelineEmailRole(ctx.user.role);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    const usageDate = pipelineUsageDate();
    const [usage] = await db
      .select({ reservedCount: pipelineEmailDailyUsage.reservedCount })
      .from(pipelineEmailDailyUsage)
      .where(and(eq(pipelineEmailDailyUsage.userId, ctx.user.id), eq(pipelineEmailDailyUsage.usageDate, usageDate)))
      .limit(1);
    const used = usage?.reservedCount ?? 0;
    return {
      dailyLimit: PIPELINE_EMAIL_DAILY_LIMIT,
      batchLimit: PIPELINE_EMAIL_BATCH_LIMIT,
      used,
      remaining: Math.max(0, PIPELINE_EMAIL_DAILY_LIMIT - used),
      usageDate,
    };
  }),

  templates: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      assertPipelineEmailRole(ctx.user.role);
      const db = await getDb();
      if (!db) return [];
      const visibilityColumn = roleVisibility[ctx.user.role as keyof typeof roleVisibility];
      if (!visibilityColumn) return [];
      return db
        .select({
          id: pipelineEmailTemplates.id,
          name: pipelineEmailTemplates.name,
          subject: pipelineEmailTemplates.subject,
          bodyHtml: pipelineEmailTemplates.bodyHtml,
          createdById: pipelineEmailTemplates.createdById,
          creatorName: users.name,
          isPersonal: pipelineEmailTemplates.isPersonal,
          visibleToAdmins: pipelineEmailTemplates.visibleToAdmins,
          visibleToAgents: pipelineEmailTemplates.visibleToAgents,
          visibleToIsas: pipelineEmailTemplates.visibleToIsas,
          updatedAt: pipelineEmailTemplates.updatedAt,
        })
        .from(pipelineEmailTemplates)
        .leftJoin(users, eq(users.id, pipelineEmailTemplates.createdById))
        .where(
          or(
            and(eq(pipelineEmailTemplates.isPersonal, true), eq(pipelineEmailTemplates.createdById, ctx.user.id)),
            and(eq(pipelineEmailTemplates.isPersonal, false), eq(visibilityColumn, true))
          )
        )
        .orderBy(asc(pipelineEmailTemplates.name));
    }),

    create: protectedProcedure.input(templateBody).mutation(async ({ input, ctx }) => {
      assertPipelineEmailRole(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const visibility = normalizedVisibility(input, ctx.user.role);
      const [result] = await db.insert(pipelineEmailTemplates).values({
        name: input.name,
        subject: input.subject,
        bodyHtml: sanitizePipelineEmailHtml(input.bodyHtml),
        createdById: ctx.user.id,
        ...visibility,
      });
      return { id: Number(result.insertId) };
    }),

    update: protectedProcedure
      .input(templateBody.extend({ id: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        assertPipelineEmailRole(ctx.user.role);
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
        const [existing] = await db
          .select({ createdById: pipelineEmailTemplates.createdById })
          .from(pipelineEmailTemplates)
          .where(eq(pipelineEmailTemplates.id, input.id))
          .limit(1);
        if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" });
        if (existing.createdById !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only the template creator can edit this template" });
        }
        const visibility = normalizedVisibility(input, ctx.user.role);
        await db
          .update(pipelineEmailTemplates)
          .set({
            name: input.name,
            subject: input.subject,
            bodyHtml: sanitizePipelineEmailHtml(input.bodyHtml),
            ...visibility,
          })
          .where(eq(pipelineEmailTemplates.id, input.id));
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        assertPipelineEmailRole(ctx.user.role);
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
        const [existing] = await db
          .select({ createdById: pipelineEmailTemplates.createdById })
          .from(pipelineEmailTemplates)
          .where(eq(pipelineEmailTemplates.id, input.id))
          .limit(1);
        if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" });
        if (existing.createdById !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only the template creator can delete this template" });
        }
        await db.delete(pipelineEmailTemplates).where(eq(pipelineEmailTemplates.id, input.id));
        return { success: true };
      }),
  }),

  send: protectedProcedure
    .input(z.object({
      connectionIds: z.array(z.number().int().positive()).min(1).max(PIPELINE_EMAIL_BATCH_LIMIT),
      subject: z.string().trim().min(1).max(512),
      bodyHtml: z.string().trim().min(1).max(250_000),
    }))
    .mutation(async ({ input, ctx }) => {
      assertPipelineEmailRole(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const replyTo = z.string().email().safeParse(ctx.user.email);
      if (!replyTo.success) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Your login must have a valid email address before sending." });
      }

      const uniqueConnectionIds = Array.from(new Set(input.connectionIds));
      if (uniqueConnectionIds.length > PIPELINE_EMAIL_BATCH_LIMIT) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `A maximum of ${PIPELINE_EMAIL_BATCH_LIMIT} contacts can be emailed at once.` });
      }

      const connectionRows = await db
        .select({
          connectionId: agentConnections.id,
          connectionAgentId: agentConnections.agentId,
          pipelineStatus: agentConnections.pipelineStatus,
          contactId: contacts.id,
          firstName: contacts.firstName,
          lastName: contacts.lastName,
          recipientEmail: contacts.email,
          agentName: users.name,
          leadSourceName: leadSources.name,
        })
        .from(agentConnections)
        .innerJoin(contacts, eq(contacts.id, agentConnections.contactId))
        .leftJoin(users, eq(users.id, agentConnections.agentId))
        .leftJoin(leadSources, eq(leadSources.id, contacts.leadSourceId))
        .where(inArray(agentConnections.id, uniqueConnectionIds));

      if (connectionRows.length !== uniqueConnectionIds.length) {
        throw new TRPCError({ code: "NOT_FOUND", message: "One or more selected connections no longer exists." });
      }
      const rowByConnectionId = new Map(connectionRows.map(row => [row.connectionId, row]));
      const rows = uniqueConnectionIds.map(id => rowByConnectionId.get(id)!);
      if (ctx.user.role === "agent" && rows.some(row => row.connectionAgentId !== ctx.user.id)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You can only email contacts in your own Pipeline." });
      }
      if (rows.some(row => row.pipelineStatus === "new_lead" || row.pipelineStatus === "dead")) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Contacts in New or Dead status cannot be emailed." });
      }
      if (rows.some(row => !z.string().email().safeParse(row.recipientEmail).success)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Every selected contact must have a valid email address." });
      }

      const uniqueContactIds = new Set<number>();
      const uniqueRows = rows.filter(row => {
        if (uniqueContactIds.has(row.contactId)) return false;
        uniqueContactIds.add(row.contactId);
        return true;
      });
      const requestedCount = uniqueRows.length;
      const usageDate = pipelineUsageDate();
      const batchId = randomUUID();
      const cleanBodyHtml = sanitizePipelineEmailHtml(input.bodyHtml);
      let usedBeforeReservation = 0;

      await db.transaction(async tx => {
        await tx
          .insert(pipelineEmailDailyUsage)
          .values({ userId: ctx.user.id, usageDate, reservedCount: 0 })
          .onDuplicateKeyUpdate({ set: { userId: ctx.user.id } });
        const [usage] = await tx
          .select({ id: pipelineEmailDailyUsage.id, reservedCount: pipelineEmailDailyUsage.reservedCount })
          .from(pipelineEmailDailyUsage)
          .where(and(eq(pipelineEmailDailyUsage.userId, ctx.user.id), eq(pipelineEmailDailyUsage.usageDate, usageDate)))
          .limit(1)
          .for("update");
        const used = usage?.reservedCount ?? 0;
        usedBeforeReservation = used;
        if (used + requestedCount > PIPELINE_EMAIL_DAILY_LIMIT) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: `Daily email limit exceeded. You have ${Math.max(0, PIPELINE_EMAIL_DAILY_LIMIT - used)} of ${PIPELINE_EMAIL_DAILY_LIMIT} emails remaining today.`,
          });
        }
        await tx
          .update(pipelineEmailDailyUsage)
          .set({ reservedCount: used + requestedCount })
          .where(eq(pipelineEmailDailyUsage.id, usage.id));
        await tx.insert(pipelineEmailDeliveries).values(uniqueRows.map(row => ({
          batchId,
          senderUserId: ctx.user.id,
          agentConnectionId: row.connectionId,
          contactId: row.contactId,
          recipientEmail: row.recipientEmail!,
          subject: input.subject,
          status: "reserved" as const,
        })));
      });

      const deliveryRows = await db
        .select({ id: pipelineEmailDeliveries.id, contactId: pipelineEmailDeliveries.contactId })
        .from(pipelineEmailDeliveries)
        .where(eq(pipelineEmailDeliveries.batchId, batchId))
        .orderBy(asc(pipelineEmailDeliveries.id));

      let signatureHtml: string | null = null;
      try {
        signatureHtml = await wiseStampSignatureProvider.getRenderedSignatureHtml(replyTo.data);
      } catch (error) {
        console.error("[Pipeline Email] WiseStamp signature lookup failed; sending without a signature", error);
      }

      const messages = uniqueRows.map(row => {
        const firstName = row.firstName ?? "";
        const lastName = row.lastName ?? "";
        const mergeValues = {
          first_name: firstName,
          last_name: lastName,
          full_name: `${firstName} ${lastName}`.trim(),
          agent_name: row.agentName ?? "",
          sender_name: ctx.user.name ?? "",
          lead_source: row.leadSourceName ?? "",
        };
        return {
          to: row.recipientEmail!,
          subject: renderPipelineMergeTags(input.subject, mergeValues, "text"),
          html: wrapPipelineEmail(renderPipelineMergeTags(cleanBodyHtml, mergeValues, "html"), signatureHtml),
          replyTo: replyTo.data,
        };
      });

      let sendResults;
      try {
        sendResults = await sendPipelineEmailBatch(messages, batchId);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Email provider request failed";
        await db
          .update(pipelineEmailDeliveries)
          .set({ status: "failed", errorMessage })
          .where(eq(pipelineEmailDeliveries.batchId, batchId));
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: errorMessage });
      }

      for (const result of sendResults) {
        const delivery = deliveryRows[result.index];
        const row = uniqueRows[result.index];
        if (!delivery || !row) continue;
        await db
          .update(pipelineEmailDeliveries)
          .set({
            status: result.status,
            resendEmailId: result.resendEmailId ?? null,
            errorMessage: result.errorMessage ?? null,
          })
          .where(eq(pipelineEmailDeliveries.id, delivery.id));
        if (result.status === "accepted") {
          await db.insert(communications).values({
            type: "email",
            subject: messages[result.index].subject,
            body: cleanBodyHtml,
            direction: "outbound",
            authorId: ctx.user.id,
            relatedContactId: row.contactId,
            relatedAgentConnectionId: row.connectionId,
          });
        }
      }

      const accepted = sendResults.filter(result => result.status === "accepted").length;
      const failed = sendResults.length - accepted;
      await db.insert(activityLog).values({
        userId: ctx.user.id,
        action: uniqueRows.length === 1 ? "pipeline_email_sent" : "pipeline_mass_email_sent",
        entityType: "pipeline_email_batch",
        details: { batchId, requested: requestedCount, accepted, failed, replyTo: replyTo.data },
      });

      return {
        batchId,
        requested: requestedCount,
        accepted,
        failed,
        remainingToday: Math.max(0, PIPELINE_EMAIL_DAILY_LIMIT - usedBeforeReservation - requestedCount),
        signatureApplied: Boolean(signatureHtml),
      };
    }),
});
