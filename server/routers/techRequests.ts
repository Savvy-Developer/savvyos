import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import { z } from "zod";
import { techRequests, users } from "../../drizzle/schema";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { canAdminUsePermission } from "./permissions";

const requesterUser = alias(users, "tech_request_requester");
const assigneeUser = alias(users, "tech_request_assignee");

const prioritySchema = z.enum(["low", "medium", "high", "urgent"]);
const statusSchema = z.enum(["new", "in_progress", "completed", "cancelled"]);

async function canManageTechRequests(ctx: { user: { id: number; role: string; email?: string | null } }) {
  return canAdminUsePermission(ctx.user, "canViewTechRequests");
}

async function validateAssignee(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, assigneeId: number) {
  const [assignee] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, assigneeId))
    .limit(1);

  if (!assignee) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "The selected assignee does not exist." });
  }
}

export const techRequestsRouter = router({
  /** Provides the UI with the current user's technology-board management capability. */
  access: protectedProcedure.query(async ({ ctx }) => ({
    canManage: await canManageTechRequests(ctx),
  })),

  /** Any authenticated SavvyOS user can submit a technology request. */
  create: protectedProcedure
    .input(
      z.object({
        title: z.string().trim().min(1, "A title is required.").max(255),
        description: z.string().trim().max(20_000).optional(),
        priority: prioritySchema.default("medium"),
        assigneeId: z.number().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const canManage = await canManageTechRequests(ctx);
      if (input.assigneeId !== undefined && !canManage) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can assign tech requests." });
      }
      if (input.assigneeId !== undefined && input.assigneeId !== null) {
        await validateAssignee(db, input.assigneeId);
      }

      const [result] = await db.insert(techRequests).values({
        requesterId: ctx.user.id,
        title: input.title,
        description: input.description || null,
        priority: input.priority,
        assigneeId: input.assigneeId ?? null,
        status: "new",
      });

      return { id: Number((result as { insertId: number }).insertId) };
    }),

  /** Requesters see their own cards; permitted admins see the complete board. */
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];

    const canManage = await canManageTechRequests(ctx);
    return db
      .select({
        request: techRequests,
        requester: {
          id: requesterUser.id,
          name: requesterUser.name,
          email: requesterUser.email,
        },
        assignee: {
          id: assigneeUser.id,
          name: assigneeUser.name,
          email: assigneeUser.email,
        },
      })
      .from(techRequests)
      .innerJoin(requesterUser, eq(techRequests.requesterId, requesterUser.id))
      .leftJoin(assigneeUser, eq(techRequests.assigneeId, assigneeUser.id))
      .where(canManage ? undefined : eq(techRequests.requesterId, ctx.user.id))
      .orderBy(desc(techRequests.updatedAt), desc(techRequests.createdAt));
  }),

  /** Fetch one request with the same access rule as the board. */
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const canManage = await canManageTechRequests(ctx);
      const rows = await db
        .select({
          request: techRequests,
          requester: {
            id: requesterUser.id,
            name: requesterUser.name,
            email: requesterUser.email,
          },
          assignee: {
            id: assigneeUser.id,
            name: assigneeUser.name,
            email: assigneeUser.email,
          },
        })
        .from(techRequests)
        .innerJoin(requesterUser, eq(techRequests.requesterId, requesterUser.id))
        .leftJoin(assigneeUser, eq(techRequests.assigneeId, assigneeUser.id))
        .where(eq(techRequests.id, input.id))
        .limit(1);

      const row = rows[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      if (!canManage && row.request.requesterId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      return row;
    }),

  /** Admins who can manage the board can update its status, priority, or assignee. */
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        status: statusSchema.optional(),
        priority: prioritySchema.optional(),
        assigneeId: z.number().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!(await canManageTechRequests(ctx))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You do not have permission to manage tech requests." });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      if (input.assigneeId !== undefined && input.assigneeId !== null) {
        await validateAssignee(db, input.assigneeId);
      }

      const updates: Record<string, unknown> = {};
      if (input.status !== undefined) updates.status = input.status;
      if (input.priority !== undefined) updates.priority = input.priority;
      if (input.assigneeId !== undefined) updates.assigneeId = input.assigneeId;
      if (Object.keys(updates).length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Choose at least one field to update." });
      }

      const [existing] = await db
        .select({ id: techRequests.id })
        .from(techRequests)
        .where(eq(techRequests.id, input.id))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      await db.update(techRequests).set(updates as typeof techRequests.$inferInsert).where(eq(techRequests.id, input.id));
      return { success: true };
    }),

  /** Only board-managing admins can remove a Tech Request. */
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (!(await canManageTechRequests(ctx))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can delete tech requests." });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const result = await db.delete(techRequests).where(eq(techRequests.id, input.id));
      if ((result as { rowsAffected?: number })?.rowsAffected === 0) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      return { success: true };
    }),

  /** Admin assignment control receives active SavvyOS users as potential assignees. */
  assigneeOptions: protectedProcedure.query(async ({ ctx }) => {
    if (!(await canManageTechRequests(ctx))) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }

    const db = await getDb();
    if (!db) return [];
    return db
      .select({ id: users.id, name: users.name, email: users.email, role: users.role })
      .from(users)
      .where(eq(users.isActive, true))
      .orderBy(users.name, users.email);
  }),

  /** Count active request cards for the admin sidebar badge. */
  pendingCount: protectedProcedure.query(async ({ ctx }) => {
    if (!(await canManageTechRequests(ctx))) return { count: 0 };

    const db = await getDb();
    if (!db) return { count: 0 };
    const [row] = await db
      .select({ count: sql<number>`count(*)` })
      .from(techRequests)
      .where(or(eq(techRequests.status, "new"), eq(techRequests.status, "in_progress")));

    return { count: Number(row?.count ?? 0) };
  }),
});
