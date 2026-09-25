import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { aliasedTable } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb, logActivity } from "../db";
import { canAdminUsePermission } from "./permissions";
import { sendTransactionalEmail } from "../_core/resendEmail";
import {
  coachingSessions,
  operationsEscalations,
  users,
} from "../../drizzle/schema";

async function requireOperationsEscalationAccess(user: {
  id: number;
  role: string;
  email?: string | null;
}) {
  if (user.role !== "admin" || !(await canAdminUsePermission(user, "canViewOperationsEscalations"))) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Operations Escalations access is required." });
  }
}

function requireCoachSessionAccess(role: string) {
  if (role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Coaching access is required." });
  }
}

export const operationsEscalationsRouter = router({
  /** Coach submission from a Coaching Hub session or a standalone agent conversation. */
  create: protectedProcedure
    .input(z.object({
      sessionId: z.number().optional(),
      agentId: z.number().optional(),
      description: z.string().trim().min(3).max(10_000).optional(),
      issueRequest: z.string().trim().min(3).max(5_000).optional(),
      context: z.string().trim().max(5_000).optional(),
    }).refine((value) => Boolean(value.sessionId || value.agentId), {
      message: "Choose an agent or link the escalation to a coaching session.",
    }))
    .mutation(async ({ input, ctx }) => {
      requireCoachSessionAccess(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      let session: { id: number; agentId: number } | null = null;
      if (input.sessionId) {
        const [sessionRow] = await db
          .select({ id: coachingSessions.id, agentId: coachingSessions.agentId })
          .from(coachingSessions)
          .where(eq(coachingSessions.id, input.sessionId))
          .limit(1);
        if (!sessionRow) throw new TRPCError({ code: "NOT_FOUND", message: "Coaching session not found." });
        session = sessionRow;
      }
      const agentId = session?.agentId ?? input.agentId;
      if (!agentId) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose an agent before submitting the escalation." });

      const description = input.description?.trim() || [
        input.issueRequest?.trim() ? `Issue / Request:\n${input.issueRequest.trim()}` : null,
        input.context?.trim() ? `Context:\n${input.context.trim()}` : null,
      ].filter(Boolean).join("\n\n");
      if (!description.trim()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Describe the issue or request before submitting." });
      }

      const [result] = await db.insert(operationsEscalations).values({
        sessionId: session?.id ?? null,
        agentId,
        submittedById: ctx.user.id,
        description,
        status: "Open",
      });
      const escalationId = Number((result as any).insertId);

      await logActivity({
        userId: ctx.user.id,
        action: "operations_escalation_created",
        entityType: "operations_escalation",
        entityId: escalationId,
        details: { sessionId: session?.id ?? null, agentId },
      });

      return { success: true, escalationId };
    }),

  /** Agent history for the Coaching Hub conduct workspace. */
  listForAgent: protectedProcedure
    .input(z.object({ agentId: z.number().positive() }))
    .query(async ({ input, ctx }) => {
      requireCoachSessionAccess(ctx.user.role);
      const db = await getDb();
      if (!db) return [];

      const submitterAlias = aliasedTable(users, "operationsEscalationHistorySubmitter");
      const resolverAlias = aliasedTable(users, "operationsEscalationHistoryResolver");
      return db
        .select({
          escalation: operationsEscalations,
          submittedBy: { id: submitterAlias.id, name: submitterAlias.name },
          resolvedBy: { id: resolverAlias.id, name: resolverAlias.name },
        })
        .from(operationsEscalations)
        .leftJoin(submitterAlias, eq(operationsEscalations.submittedById, submitterAlias.id))
        .leftJoin(resolverAlias, eq(operationsEscalations.resolvedById, resolverAlias.id))
        .where(eq(operationsEscalations.agentId, input.agentId))
        .orderBy(desc(operationsEscalations.createdAt));
    }),

  /** Status-only records for an agent's own Savvy follow-ups. */
  listMine: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "agent") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Agent access is required." });
    }
    const db = await getDb();
    if (!db) return [];
    return db
      .select({
        id: operationsEscalations.id,
        status: operationsEscalations.status,
        createdAt: operationsEscalations.createdAt,
        resolvedAt: operationsEscalations.resolvedAt,
      })
      .from(operationsEscalations)
      .where(eq(operationsEscalations.agentId, ctx.user.id))
      .orderBy(desc(operationsEscalations.createdAt));
  }),

  /** Full operations queue for authorized administrators. */
  list: protectedProcedure
    .input(z.object({ status: z.enum(["open", "resolved", "all"]).default("open") }).optional())
    .query(async ({ input, ctx }) => {
      await requireOperationsEscalationAccess(ctx.user);
      const db = await getDb();
      if (!db) return [];

      const agentAlias = aliasedTable(users, "operationsEscalationAgent");
      const submitterAlias = aliasedTable(users, "operationsEscalationSubmitter");
      const resolverAlias = aliasedTable(users, "operationsEscalationResolver");
      const conditions = input?.status === "open"
        ? [eq(operationsEscalations.status, "Open")]
        : input?.status === "resolved"
          ? [eq(operationsEscalations.status, "Resolved")]
          : [];

      return db
        .select({
          escalation: operationsEscalations,
          agent: { id: agentAlias.id, name: agentAlias.name },
          submittedBy: { id: submitterAlias.id, name: submitterAlias.name },
          resolvedBy: { id: resolverAlias.id, name: resolverAlias.name },
        })
        .from(operationsEscalations)
        .leftJoin(agentAlias, eq(operationsEscalations.agentId, agentAlias.id))
        .leftJoin(submitterAlias, eq(operationsEscalations.submittedById, submitterAlias.id))
        .leftJoin(resolverAlias, eq(operationsEscalations.resolvedById, resolverAlias.id))
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(
          asc(sql`CASE WHEN ${operationsEscalations.status} = 'Open' THEN 0 ELSE 1 END`),
          desc(operationsEscalations.createdAt),
        );
    }),

  /** Resolving is one-way so the recorded outcome and coach notice stay reliable. */
  resolve: protectedProcedure
    .input(z.object({
      escalationId: z.number(),
      resolution: z.string().trim().min(1, "A written resolution is required.").max(10_000),
    }))
    .mutation(async ({ input, ctx }) => {
      await requireOperationsEscalationAccess(ctx.user);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [escalation] = await db
        .select()
        .from(operationsEscalations)
        .where(eq(operationsEscalations.id, input.escalationId))
        .limit(1);
      if (!escalation) throw new TRPCError({ code: "NOT_FOUND", message: "Operations Escalation not found." });
      if (escalation.status === "Resolved") {
        throw new TRPCError({ code: "CONFLICT", message: "This Operations Escalation has already been resolved." });
      }

      const [submitter] = await db
        .select({ name: users.name, email: users.email })
        .from(users)
        .where(eq(users.id, escalation.submittedById))
        .limit(1);
      const [agent] = await db
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, escalation.agentId))
        .limit(1);

      await db.update(operationsEscalations).set({
        status: "Resolved",
        resolution: input.resolution,
        resolvedById: ctx.user.id,
        resolvedAt: sql`NOW()`,
        updatedAt: sql`NOW()`,
      }).where(and(
        eq(operationsEscalations.id, input.escalationId),
        eq(operationsEscalations.status, "Open"),
      ));

      await logActivity({
        userId: ctx.user.id,
        action: "operations_escalation_resolved",
        entityType: "operations_escalation",
        entityId: escalation.id,
        details: { sessionId: escalation.sessionId, agentId: escalation.agentId },
      });

      const delivery = submitter?.email
        ? await sendTransactionalEmail("operations_escalation_resolved", {
            recipientEmail: submitter.email,
            recipientName: submitter.name ?? undefined,
            agentName: agent?.name ?? "the coached agent",
            operationsEscalationDescription: escalation.description,
            operationsEscalationResolution: input.resolution,
            operationsEscalationResolverName: ctx.user.name ?? ctx.user.email ?? "A SavvyOS administrator",
            operationsEscalationSubmittedAt: escalation.createdAt.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            }),
          }, {
            idempotencyKey: `operations-escalation-resolved-${escalation.id}`,
          })
        : { sent: false, skipped: true, reason: "Submitting coach has no email address" };

      return {
        success: true,
        emailSent: delivery.sent,
        emailSkipped: delivery.skipped,
      };
    }),
});
