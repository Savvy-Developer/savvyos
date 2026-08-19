import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { customReports } from "../../drizzle/schema";
import {
  executeCustomReport,
  customReportDefinitionSchema,
  customReportPromptSchema,
  planCustomReport,
  suggestedCustomReportPrompts,
} from "../customReports";
import { getDb, logActivity } from "../db";
import { canAdminUsePermission } from "./permissions";
import { protectedProcedure, router } from "../_core/trpc";

async function requireCustomReportsAccess(ctx: {
  user: { id: number; role: string; email?: string | null };
}) {
  const allowed = await canAdminUsePermission(ctx.user, "canViewCustomReports");
  if (!allowed) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Custom Reports is available only to authorized administrators.",
    });
  }
}

const savedReportInput = z.object({
  id: z.number().int().positive(),
});

export const customReportsRouter = router({
  canAccess: protectedProcedure.query(async ({ ctx }) => {
    return canAdminUsePermission(ctx.user, "canViewCustomReports");
  }),

  suggestions: protectedProcedure.query(async ({ ctx }) => {
    await requireCustomReportsAccess(ctx);
    return suggestedCustomReportPrompts();
  }),

  list: protectedProcedure.query(async ({ ctx }) => {
    await requireCustomReportsAccess(ctx);
    const db = await getDb();
    if (!db) return [];
    return db
      .select()
      .from(customReports)
      .orderBy(desc(customReports.updatedAt))
      .limit(100);
  }),

  generate: protectedProcedure
    .input(customReportPromptSchema)
    .mutation(async ({ input, ctx }) => {
      await requireCustomReportsAccess(ctx);
      const definition = await planCustomReport(input.prompt);
      const report = await executeCustomReport(definition);
      await logActivity({
        userId: ctx.user.id,
        action: "custom_report_generated",
        entityType: "custom_report",
        details: {
          dataset: definition.dataset,
          groupBy: definition.groupBy,
          metrics: definition.metrics,
          prompt: input.prompt.slice(0, 500),
        },
      });
      return { prompt: input.prompt, report };
    }),

  runDefinition: protectedProcedure
    .input(z.object({ definition: customReportDefinitionSchema }))
    .mutation(async ({ input, ctx }) => {
      await requireCustomReportsAccess(ctx);
      const report = await executeCustomReport(input.definition);
      await logActivity({
        userId: ctx.user.id,
        action: "custom_report_rerun",
        entityType: "custom_report",
        details: {
          dataset: input.definition.dataset,
          groupBy: input.definition.groupBy,
          metrics: input.definition.metrics,
        },
      });
      return { report };
    }),

  save: protectedProcedure
    .input(
      z.object({
        name: z.string().trim().min(3).max(255),
        prompt: z.string().trim().min(12).max(2_000),
        definition: customReportDefinitionSchema,
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requireCustomReportsAccess(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [result] = await db.insert(customReports).values({
        name: input.name,
        prompt: input.prompt,
        definition: input.definition,
        createdById: ctx.user.id,
      });
      const id = Number((result as { insertId: number }).insertId);
      await logActivity({
        userId: ctx.user.id,
        action: "custom_report_saved",
        entityType: "custom_report",
        entityId: id,
        details: { name: input.name, dataset: input.definition.dataset },
      });
      return { id };
    }),

  runSaved: protectedProcedure
    .input(savedReportInput)
    .mutation(async ({ input, ctx }) => {
      await requireCustomReportsAccess(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [saved] = await db
        .select()
        .from(customReports)
        .where(eq(customReports.id, input.id))
        .limit(1);
      if (!saved)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Saved report not found.",
        });
      const report = await executeCustomReport(saved.definition);
      await db
        .update(customReports)
        .set({ lastRunAt: new Date() })
        .where(eq(customReports.id, input.id));
      await logActivity({
        userId: ctx.user.id,
        action: "custom_report_saved_run",
        entityType: "custom_report",
        entityId: input.id,
        details: { name: saved.name },
      });
      return { prompt: saved.prompt, report, savedReportId: saved.id };
    }),

  remove: protectedProcedure
    .input(savedReportInput)
    .mutation(async ({ input, ctx }) => {
      await requireCustomReportsAccess(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(customReports).where(eq(customReports.id, input.id));
      await logActivity({
        userId: ctx.user.id,
        action: "custom_report_deleted",
        entityType: "custom_report",
        entityId: input.id,
      });
      return { success: true };
    }),
});
