import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb, getUserById } from "../db";
import { agentSupportAssignments, users } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { getSessionCookieOptions } from "../_core/cookies";

export const WORK_AS_COOKIE = "work_as_agent_id";
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export const agentSupportRouter = router({
  // ── Admin: list all assignments (optionally filtered by agentSupportUserId) ──
  listAssignments: protectedProcedure
    .input(z.object({ agentSupportUserId: z.number().int().optional() }).optional())
    .query(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) return [];

      const rows = await db
        .select({
          id: agentSupportAssignments.id,
          agentSupportUserId: agentSupportAssignments.agentSupportUserId,
          agentId: agentSupportAssignments.agentId,
          createdAt: agentSupportAssignments.createdAt,
        })
        .from(agentSupportAssignments);

      if (input?.agentSupportUserId !== undefined) {
        return rows.filter((r) => r.agentSupportUserId === input.agentSupportUserId);
      }
      return rows;
    }),

  // ── Agent Support: list agents assigned to the current user ──────────────────
  myAssignedAgents: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "agent_support") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Agent Support only" });
    }
    const db = await getDb();
    if (!db) return [];

    const rows = await db
      .select({
        assignmentId: agentSupportAssignments.id,
        agentId: agentSupportAssignments.agentId,
        agentName: users.name,
        agentEmail: users.email,
        agentTitle: users.title,
        createdAt: agentSupportAssignments.createdAt,
      })
      .from(agentSupportAssignments)
      .innerJoin(users, eq(agentSupportAssignments.agentId, users.id))
      .where(eq(agentSupportAssignments.agentSupportUserId, ctx.user.id));

    return rows;
  }),

  // ── Admin: add an assignment ──────────────────────────────────────────────────
  addAssignment: protectedProcedure
    .input(
      z.object({
        agentSupportUserId: z.number().int(),
        agentId: z.number().int(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Validate: agentSupportUserId must have role agent_support
      const supportUser = await getUserById(input.agentSupportUserId);
      if (!supportUser || supportUser.role !== "agent_support") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Target user is not an Agent Support user",
        });
      }

      // Validate: agentId must have role agent
      const agentUser = await getUserById(input.agentId);
      if (!agentUser || agentUser.role !== "agent") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Target agent must have the 'agent' role",
        });
      }

      try {
        const [result] = await db.insert(agentSupportAssignments).values({
          agentSupportUserId: input.agentSupportUserId,
          agentId: input.agentId,
        });
        return { id: (result as any).insertId };
      } catch (err: any) {
        if (err?.code === "ER_DUP_ENTRY") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "This assignment already exists",
          });
        }
        throw err;
      }
    }),

  // ── Admin: remove an assignment ───────────────────────────────────────────────
  removeAssignment: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db
        .delete(agentSupportAssignments)
        .where(eq(agentSupportAssignments.id, input.id));
      return { success: true };
    }),

  // ── Agent Support: start working as an assigned agent ────────────────────────
  workAsAgent: protectedProcedure
    .input(z.object({ agentId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "agent_support") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Agent Support only" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Verify this agent_support user is actually assigned to the requested agent
      const [assignment] = await db
        .select()
        .from(agentSupportAssignments)
        .where(
          and(
            eq(agentSupportAssignments.agentSupportUserId, ctx.user.id),
            eq(agentSupportAssignments.agentId, input.agentId)
          )
        )
        .limit(1);

      if (!assignment) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not assigned to this agent",
        });
      }

      const targetAgent = await getUserById(input.agentId);
      if (!targetAgent) throw new TRPCError({ code: "NOT_FOUND" });

      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(WORK_AS_COOKIE, String(input.agentId), {
        ...cookieOptions,
        maxAge: ONE_YEAR_MS,
      });
      return { success: true, agent: targetAgent };
    }),

  // ── Agent Support: stop working as agent ─────────────────────────────────────
  stopWorkingAsAgent: protectedProcedure.mutation(({ ctx }) => {
    // Allow if realUser is agent_support OR if user is agent_support
    const realRole = (ctx as any).realUser?.role ?? ctx.user.role;
    if (realRole !== "agent_support") {
      throw new TRPCError({ code: "FORBIDDEN" });
    }
    const cookieOptions = getSessionCookieOptions(ctx.req);
    ctx.res.clearCookie(WORK_AS_COOKIE, { ...cookieOptions, maxAge: -1 });
    return { success: true };
  }),
});
