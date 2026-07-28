import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq, desc, and, inArray } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { approvalRequests, agentConnections, communications, tasks, transactions } from "../../drizzle/schema";

export const approvalRequestsRouter = router({
  /** Count pending approval requests (for admin nav badge) */
  pendingCount: protectedProcedure
    .query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") return { count: 0 };
      const db = await getDb();
      if (!db) return { count: 0 };
      const rows = await db.select().from(approvalRequests).where(eq(approvalRequests.status, "pending"));
      return { count: rows.length };
    }),

  /** List all approval requests — admins see all, ISAs see their own */
  list: protectedProcedure
    .input(z.object({ status: z.enum(["pending", "approved", "rejected", "all"]).optional() }).optional())
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];
      let rows = await db.select().from(approvalRequests).orderBy(desc(approvalRequests.createdAt));
      if (ctx.user.role === "isa") {
        rows = rows.filter((r) => r.requestedById === ctx.user.id);
      }
      if (input?.status && input.status !== "all") {
        rows = rows.filter((r) => r.status === input.status);
      }
      return rows;
    }),

  /** ISA submits a deletion request for an agent connection */
  create: protectedProcedure
    .input(z.object({
      type: z.enum(["delete_agent_connection"]),
      targetId: z.number(),
      reason: z.string().min(10, "Please provide a reason (at least 10 characters)"),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "isa" && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only ISAs can submit deletion requests" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      if (input.type === "delete_agent_connection") {
        // ── Guard 1: connection must exist and not be closed / under_contract ──
        const [conn] = await db
          .select()
          .from(agentConnections)
          .where(eq(agentConnections.id, input.targetId))
          .limit(1);

        if (!conn) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Agent connection not found." });
        }

        if (conn.pipelineStatus === "closed") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This connection cannot be deleted because it is marked as Closed. Closed connections must be retained for record-keeping.",
          });
        }

        if (conn.pipelineStatus === "under_contract") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This connection cannot be deleted because it is currently Under Contract. Resolve or close the contract before requesting removal.",
          });
        }

        // ── Guard 2: no outstanding tasks linked to this connection ──
        const outstandingTasks = await db
          .select({ id: tasks.id, title: tasks.title })
          .from(tasks)
          .where(
            and(
              eq(tasks.relatedAgentConnectionId, input.targetId),
              inArray(tasks.status, ["pending", "in_progress"]),
            ),
          );

        if (outstandingTasks.length > 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `This connection has ${outstandingTasks.length} outstanding task${outstandingTasks.length === 1 ? "" : "s"} that must be completed or cancelled before it can be deleted.`,
          });
        }

        // ── Guard 3: no active (under_contract) transaction between this agent and contact ──
        const activeTransactions = await db
          .select({ id: transactions.id })
          .from(transactions)
          .where(
            and(
              eq(transactions.agentId, conn.agentId),
              eq(transactions.primaryContactId, conn.contactId),
              eq(transactions.status, "under_contract"),
            ),
          );

        if (activeTransactions.length > 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This connection cannot be deleted because there is an active transaction between this agent and client that is currently Under Contract.",
          });
        }
      }

      // Check for existing pending request for same target
      const existing = await db
        .select()
        .from(approvalRequests)
        .where(eq(approvalRequests.targetId, input.targetId))
        .limit(1);
      const pendingExists = existing.some((r) => r.status === "pending");
      if (pendingExists) {
        throw new TRPCError({ code: "CONFLICT", message: "A pending deletion request already exists for this connection" });
      }

      await db.insert(approvalRequests).values({
        type: input.type,
        requestedById: ctx.user.id,
        targetId: input.targetId,
        reason: input.reason,
        status: "pending",
      });
      return { success: true };
    }),

  /** Admin approves or rejects a request */
  review: protectedProcedure
    .input(z.object({
      id: z.number(),
      decision: z.enum(["approved", "rejected"]),
      reviewNote: z.string().optional().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can review approval requests" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [request] = await db.select().from(approvalRequests).where(eq(approvalRequests.id, input.id)).limit(1);
      if (!request) throw new TRPCError({ code: "NOT_FOUND" });
      if (request.status !== "pending") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Request has already been reviewed" });
      }

      // ── Re-validate guards at approval time (state may have changed since request was submitted) ──
      if (input.decision === "approved" && request.type === "delete_agent_connection") {
        const [conn] = await db
          .select()
          .from(agentConnections)
          .where(eq(agentConnections.id, request.targetId))
          .limit(1);

        if (!conn) {
          throw new TRPCError({ code: "NOT_FOUND", message: "The agent connection no longer exists." });
        }

        if (conn.pipelineStatus === "closed") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cannot approve: this connection is now marked as Closed and cannot be deleted.",
          });
        }

        if (conn.pipelineStatus === "under_contract") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cannot approve: this connection is now Under Contract.",
          });
        }

        const outstandingTasks = await db
          .select({ id: tasks.id })
          .from(tasks)
          .where(
            and(
              eq(tasks.relatedAgentConnectionId, request.targetId),
              inArray(tasks.status, ["pending", "in_progress"]),
            ),
          );

        if (outstandingTasks.length > 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Cannot approve: there are ${outstandingTasks.length} outstanding task${outstandingTasks.length === 1 ? "" : "s"} linked to this connection.`,
          });
        }

        const activeTransactions = await db
          .select({ id: transactions.id })
          .from(transactions)
          .where(
            and(
              eq(transactions.agentId, conn.agentId),
              eq(transactions.primaryContactId, conn.contactId),
              eq(transactions.status, "under_contract"),
            ),
          );

        if (activeTransactions.length > 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cannot approve: there is an active Under Contract transaction between this agent and client.",
          });
        }
      }

      await db.update(approvalRequests).set({
        status: input.decision,
        reviewedById: ctx.user.id,
        reviewNote: input.reviewNote ?? null,
      }).where(eq(approvalRequests.id, input.id));

      // If approved, execute the action
      if (input.decision === "approved" && request.type === "delete_agent_connection") {
        // Null out FK references in child tables before deleting to avoid constraint violations
        await db.update(communications)
          .set({ relatedAgentConnectionId: null })
          .where(eq(communications.relatedAgentConnectionId, request.targetId));
        await db.update(tasks)
          .set({ relatedAgentConnectionId: null })
          .where(eq(tasks.relatedAgentConnectionId, request.targetId));
        await db.delete(agentConnections).where(eq(agentConnections.id, request.targetId));
      }

      return { success: true };
    }),
});
