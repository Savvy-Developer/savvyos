import { TRPCError } from "@trpc/server";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { savvyosFeatureUpdates, users } from "../../drizzle/schema";
import { getDb } from "../db";
import { buildDailyAgentReport, getSavedDailyAgentReport } from "../dailyAgentReportScheduler";
import { notifySavvyOSFeatureUpdate } from "../_core/slackNotifications";
import { protectedProcedure, router } from "../_core/trpc";

const featureUpdateInput = z.object({
  title: z.string().trim().min(3).max(255),
  summary: z.string().trim().min(10).max(1500),
  details: z.string().trim().max(6000).nullable().optional(),
  actionUrl: z.string().trim().max(512).nullable().optional(),
  isAgentFacing: z.boolean().default(true),
  isPublished: z.boolean().default(false),
});

function requireAdmin(role: string): void {
  if (role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Administrator access is required." });
}

function requireAgent(role: string): void {
  if (role !== "agent") throw new TRPCError({ code: "FORBIDDEN", message: "Daily reports are available to agent accounts." });
}

function normaliseActionUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.startsWith("/")) return value;
  if (value.startsWith("https://os.savvy-agents.com/")) return value;
  throw new TRPCError({ code: "BAD_REQUEST", message: "Feature update links must be a SavvyOS path or SavvyOS URL." });
}

export const dailyReportRouter = router({
  /** A current, agent-scoped operational view. Email runs add AI suggestions; this view stays live and deterministic. */
  getLive: protectedProcedure.query(async ({ ctx }) => {
    requireAgent(ctx.user.role);
    return buildDailyAgentReport({ id: ctx.user.id, name: ctx.user.name, email: ctx.user.email }, new Date(), false);
  }),

  /** Return the email snapshot for a specific date when a user needs to revisit what was delivered. */
  getSaved: protectedProcedure
    .input(z.object({ reportDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
    .query(async ({ ctx, input }) => {
      requireAgent(ctx.user.role);
      return getSavedDailyAgentReport(ctx.user.id, input.reportDate);
    }),

  /** Published release notes used by the live report and daily email. */
  listFeatureUpdates: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    return db.select({
      id: savvyosFeatureUpdates.id,
      title: savvyosFeatureUpdates.title,
      summary: savvyosFeatureUpdates.summary,
      details: savvyosFeatureUpdates.details,
      actionUrl: savvyosFeatureUpdates.actionUrl,
      publishedAt: savvyosFeatureUpdates.publishedAt,
    }).from(savvyosFeatureUpdates)
      .where(and(
        eq(savvyosFeatureUpdates.isPublished, true),
        eq(savvyosFeatureUpdates.isAgentFacing, true),
        isNotNull(savvyosFeatureUpdates.publishedAt),
      ))
      .orderBy(desc(savvyosFeatureUpdates.publishedAt))
      .limit(25);
  }),

  adminListFeatureUpdates: protectedProcedure.query(async ({ ctx }) => {
    requireAdmin(ctx.user.role);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    return db.select({
      id: savvyosFeatureUpdates.id,
      title: savvyosFeatureUpdates.title,
      summary: savvyosFeatureUpdates.summary,
      details: savvyosFeatureUpdates.details,
      actionUrl: savvyosFeatureUpdates.actionUrl,
      isAgentFacing: savvyosFeatureUpdates.isAgentFacing,
      isPublished: savvyosFeatureUpdates.isPublished,
      publishedAt: savvyosFeatureUpdates.publishedAt,
      createdAt: savvyosFeatureUpdates.createdAt,
      updatedAt: savvyosFeatureUpdates.updatedAt,
      createdByName: users.name,
    }).from(savvyosFeatureUpdates)
      .leftJoin(users, eq(savvyosFeatureUpdates.createdById, users.id))
      .orderBy(desc(savvyosFeatureUpdates.updatedAt));
  }),

  createFeatureUpdate: protectedProcedure
    .input(featureUpdateInput)
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
      const now = new Date();
      const values = {
        title: input.title,
        summary: input.summary,
        details: input.details || null,
        actionUrl: normaliseActionUrl(input.actionUrl),
        isAgentFacing: input.isAgentFacing,
        isPublished: input.isPublished,
        publishedAt: input.isPublished ? now : null,
        createdById: ctx.user.id,
      };
      const result = await db.insert(savvyosFeatureUpdates).values(values);
      if (values.isPublished) await notifySavvyOSFeatureUpdate({ event: "published", title: values.title, summary: values.summary, details: values.details, actionUrl: values.actionUrl });
      return { id: Number(result[0].insertId) };
    }),

  updateFeatureUpdate: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), data: featureUpdateInput }))
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
      const [existing] = await db.select({ id: savvyosFeatureUpdates.id, isPublished: savvyosFeatureUpdates.isPublished, publishedAt: savvyosFeatureUpdates.publishedAt })
        .from(savvyosFeatureUpdates)
        .where(eq(savvyosFeatureUpdates.id, input.id))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Feature update not found." });
      const values = {
        title: input.data.title,
        summary: input.data.summary,
        details: input.data.details || null,
        actionUrl: normaliseActionUrl(input.data.actionUrl),
        isAgentFacing: input.data.isAgentFacing,
        isPublished: input.data.isPublished,
        publishedAt: input.data.isPublished ? (existing.publishedAt ?? new Date()) : null,
      };
      await db.update(savvyosFeatureUpdates).set(values).where(eq(savvyosFeatureUpdates.id, input.id));
      if (values.isPublished) await notifySavvyOSFeatureUpdate({ event: existing.isPublished ? "revised" : "published", title: values.title, summary: values.summary, details: values.details, actionUrl: values.actionUrl });
      return { success: true };
    }),

  deleteFeatureUpdate: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
      await db.delete(savvyosFeatureUpdates).where(eq(savvyosFeatureUpdates.id, input.id));
      return { success: true };
    }),
});
