import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { leadershipFeedback, users } from "../../drizzle/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import { aliasedTable } from "drizzle-orm";

export const leadershipRouter = router({
  // List all feedback across all agents for the dashboard (admin only)
  listAll: protectedProcedure
    .input(z.object({
      agentUserId: z.number().optional(),
      conductedByUserId: z.number().optional(),
      ratingMin: z.number().min(1).max(5).optional(),
      ratingMax: z.number().min(1).max(5).optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      limit: z.number().default(50),
      offset: z.number().default(0),
    }).optional())
    .query(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) return { rows: [], total: 0 };
      const agentAlias = aliasedTable(users, "fbAgent");
      const conductorAlias = aliasedTable(users, "fbConductor");
      const conditions: any[] = [];
      if (input?.agentUserId) conditions.push(eq(leadershipFeedback.agentUserId, input.agentUserId));
      if (input?.conductedByUserId) conditions.push(eq(leadershipFeedback.conductedByUserId, input.conductedByUserId));
      if (input?.ratingMin) conditions.push(sql`${leadershipFeedback.rating} >= ${input.ratingMin}`);
      if (input?.ratingMax) conditions.push(sql`${leadershipFeedback.rating} <= ${input.ratingMax}`);
      if (input?.dateFrom) conditions.push(sql`${leadershipFeedback.meetingDate} >= ${new Date(input.dateFrom)}`);
      if (input?.dateTo) conditions.push(sql`${leadershipFeedback.meetingDate} <= ${new Date(input.dateTo)}`);
      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
      const [rows, countRows] = await Promise.all([
        db.select({
          feedback: leadershipFeedback,
          agent: { id: agentAlias.id, name: agentAlias.name, email: agentAlias.email, role: agentAlias.role },
          conductor: { id: conductorAlias.id, name: conductorAlias.name, email: conductorAlias.email },
        })
          .from(leadershipFeedback)
          .leftJoin(agentAlias, eq(leadershipFeedback.agentUserId, agentAlias.id))
          .leftJoin(conductorAlias, eq(leadershipFeedback.conductedByUserId, conductorAlias.id))
          .where(whereClause)
          .orderBy(desc(leadershipFeedback.meetingDate))
          .limit(input?.limit ?? 50)
          .offset(input?.offset ?? 0),
        db.select({ count: sql<number>`COUNT(*)` })
          .from(leadershipFeedback)
          .where(whereClause),
      ]);
      return { rows, total: Number(countRows[0]?.count ?? 0) };
    }),

  // List all feedback for a specific agent (admin only)
  listForAgent: protectedProcedure
    .input(z.object({ agentUserId: z.number() }))
    .query(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) return [];
      const rows = await db
        .select({
          feedback: leadershipFeedback,
          conductor: {
            id: users.id,
            name: users.name,
            email: users.email,
          },
        })
        .from(leadershipFeedback)
        .leftJoin(users, eq(leadershipFeedback.conductedByUserId, users.id))
        .where(eq(leadershipFeedback.agentUserId, input.agentUserId))
        .orderBy(desc(leadershipFeedback.meetingDate));
      return rows;
    }),

  // Create a new 1-on-1 feedback entry (admin only)
  create: protectedProcedure
    .input(
      z.object({
        agentUserId: z.number(),
        meetingDate: z.string(), // ISO date string
        summary: z.string().min(1, "Summary is required"),
        strengths: z.string().optional().nullable(),
        areasForImprovement: z.string().optional().nullable(),
        goals: z.string().optional().nullable(),
        followUpDate: z.string().optional().nullable(),
        rating: z.number().min(1).max(5).optional().nullable(),
        isPrivate: z.boolean().default(false),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const [result] = await db.insert(leadershipFeedback).values({
        agentUserId: input.agentUserId,
        conductedByUserId: ctx.user.id,
        meetingDate: new Date(input.meetingDate),
        summary: input.summary,
        strengths: input.strengths ?? null,
        areasForImprovement: input.areasForImprovement ?? null,
        goals: input.goals ?? null,
        followUpDate: input.followUpDate ? new Date(input.followUpDate) : null,
        rating: input.rating ?? null,
        isPrivate: input.isPrivate,
      });
      return { id: (result as any).insertId };
    }),

  // Update an existing feedback entry (admin only, must be the conductor or any admin)
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        meetingDate: z.string().optional(),
        summary: z.string().min(1).optional(),
        strengths: z.string().optional().nullable(),
        areasForImprovement: z.string().optional().nullable(),
        goals: z.string().optional().nullable(),
        followUpDate: z.string().optional().nullable(),
        rating: z.number().min(1).max(5).optional().nullable(),
        isPrivate: z.boolean().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const { id, ...rest } = input;
      const updateData: Record<string, any> = {};
      if (rest.meetingDate) updateData.meetingDate = new Date(rest.meetingDate);
      if (rest.summary) updateData.summary = rest.summary;
      if ("strengths" in rest) updateData.strengths = rest.strengths ?? null;
      if ("areasForImprovement" in rest) updateData.areasForImprovement = rest.areasForImprovement ?? null;
      if ("goals" in rest) updateData.goals = rest.goals ?? null;
      if ("followUpDate" in rest) updateData.followUpDate = rest.followUpDate ? new Date(rest.followUpDate) : null;
      if ("rating" in rest) updateData.rating = rest.rating ?? null;
      if ("isPrivate" in rest) updateData.isPrivate = rest.isPrivate;
      await db.update(leadershipFeedback).set(updateData).where(eq(leadershipFeedback.id, id));
      return { success: true };
    }),

  // Delete a feedback entry (admin only)
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.delete(leadershipFeedback).where(eq(leadershipFeedback.id, input.id));
      return { success: true };
    }),
});
