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
  /** Coach submission from an active Coaching Hub session. */
  create: protectedProcedure
    .input(z.object({
      sessionId: z.number(),
      description: z.string().trim().min(3).max(10_000),
    }))
    .mutation(async ({ input, ctx }) => {
      requireCoachSessionAccess(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [session] = await db
        .select({
          id: coachingSessions.id,
          agentId: coachingSessions.agentId,
          actualCoachId: coachingSessions.actualCoachId,
          status: coachingSessions.status,
        })
        .from(coachingSessions)
        .where(eq(coachingSessions.id, input.sessionId))
        .limit(1);

      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Coaching session not found." });
      if (session.status !== "In Progress") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Operations Escalations can only be submitted while the coaching session is in progress.",
        });
      }
      if (session.actualCoachId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the coach conducting this session can submit an Operations Escalation.",
        });
      }

      const [result] = await db.insert(operationsEscalations).values({
        sessionId: session.id,
        agentId: session.agentId,
        submittedById: ctx.user.id,
        description: input.description,
        status: "Open",
      });
      const escalationId = Number((result as any).insertId);

      await logActivity({
        userId: ctx.user.id,
        action: "operations_escalation_created",
        entityType: "operations_escalation",
        entityId: escalationId,
        details: { sessionId: session.id, agentId: session.agentId },
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
