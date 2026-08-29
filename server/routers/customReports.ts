import { TRPCError } from "@trpc/server";
import { asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { customReports, leadSources, users } from "../../drizzle/schema";
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

  filters: protectedProcedure.query(async ({ ctx }) => {
    await requireCustomReportsAccess(ctx);
    const db = await getDb();
    if (!db) return { agents: [], isas: [], leadSources: [] };
    const [people, sources] = await Promise.all([
      db
        .select({ id: users.id, name: users.name, role: users.role })
        .from(users)
        .orderBy(asc(users.name)),
      db
        .select({
          id: leadSources.id,
          name: leadSources.name,
          parentId: leadSources.parentId,
          isActive: leadSources.isActive,
        })
        .from(leadSources)
        .orderBy(asc(leadSources.name)),
    ]);
    return {
      agents: people.filter(person => person.role === "agent"),
      isas: people.filter(person => person.role === "isa"),
      leadSources: sources,
    };
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

  plan: protectedProcedure
    .input(customReportPromptSchema)
    .mutation(async ({ input, ctx }) => {
      await requireCustomReportsAccess(ctx);
      const plan = await planCustomReport(input.prompt);
      await logActivity({
        userId: ctx.user.id,
        action: "custom_report_planned",
        entityType: "custom_report",
        details: {
          dataset: plan.definition.dataset,
          groupBy: plan.definition.groupBy,
          metrics: plan.definition.metrics,
          supportStatus: plan.supportStatus,
          plannerMode: plan.plannerMode,
          prompt: input.prompt.slice(0, 500),
        },
      });
      return { prompt: input.prompt, ...plan };
    }),

  execute: protectedProcedure
    .input(
      z.object({
        prompt: customReportPromptSchema.shape.prompt,
        definition: customReportDefinitionSchema,
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requireCustomReportsAccess(ctx);
      const plan = await planCustomReport(input.prompt);
      if (plan.supportStatus === "unsupported") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: plan.clarification ?? "This request is not supported yet.",
        });
      }
      if (
        plan.supportStatus === "needs_clarification" &&
        !input.definition.agentIds.length &&
        !input.definition.isaIds.length &&
        !input.definition.leadSourceIds.length
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            plan.clarification ?? "Choose a report scope before running.",
        });
      }
      const report = await executeCustomReport(input.definition);
      await logActivity({
        userId: ctx.user.id,
        action: "custom_report_generated",
        entityType: "custom_report",
        details: {
          dataset: input.definition.dataset,
          groupBy: input.definition.groupBy,
          metrics: input.definition.metrics,
          mode: input.definition.mode,
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

  update: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        name: z.string().trim().min(3).max(255),
        prompt: z.string().trim().min(12).max(2_000),
        definition: customReportDefinitionSchema,
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requireCustomReportsAccess(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [existing] = await db
        .select({ id: customReports.id })
        .from(customReports)
        .where(eq(customReports.id, input.id))
        .limit(1);
      if (!existing)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Saved report not found.",
        });
      await db
        .update(customReports)
        .set({
          name: input.name,
          prompt: input.prompt,
          definition: input.definition,
        })
        .where(eq(customReports.id, input.id));
      await logActivity({
        userId: ctx.user.id,
        action: "custom_report_updated",
        entityType: "custom_report",
        entityId: input.id,
        details: {
          name: input.name,
          dataset: input.definition.dataset,
          mode: input.definition.mode,
        },
      });
      return { id: input.id };
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
      const storedDefinition = saved.definition as Record<string, unknown>;
      const savedHasVersionedMode = Object.prototype.hasOwnProperty.call(
        storedDefinition,
        "mode"
      );
      const legacyPlan = savedHasVersionedMode
        ? null
        : await planCustomReport(saved.prompt);
      if (legacyPlan?.supportStatus === "unsupported") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            legacyPlan.clarification ??
            "This saved report needs to be rebuilt.",
        });
      }
      const definition =
        legacyPlan?.definition ??
        customReportDefinitionSchema.parse(saved.definition);
      const report = await executeCustomReport(definition);
      await db
        .update(customReports)
        .set({ lastRunAt: new Date(), ...(legacyPlan ? { definition } : {}) })
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
