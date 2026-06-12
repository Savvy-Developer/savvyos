import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { approvalRequests, agentConnections } from "../../drizzle/schema";

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
      let rows = await db.select().from(approvalRequests).orderBy(approvalRequests.createdAt);
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

      await db.update(approvalRequests).set({
        status: input.decision,
        reviewedById: ctx.user.id,
        reviewNote: input.reviewNote ?? null,
      }).where(eq(approvalRequests.id, input.id));

      // If approved, execute the action
      if (input.decision === "approved" && request.type === "delete_agent_connection") {
        await db.delete(agentConnections).where(eq(agentConnections.id, request.targetId));
      }

      return { success: true };
    }),
});
