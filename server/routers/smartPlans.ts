import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb, logActivity } from "../db";
import {
  smartPlans,
  smartPlanSteps,
  smartPlanEnrollments,
  smartPlanExecutions,
  leadSources,
  contacts,
} from "../../drizzle/schema";
import { and, eq, desc, asc } from "drizzle-orm";
import { enrollContactInPlan, countContactsMatchingPlan, bulkEnrollExistingContacts } from "../smartPlanScheduler";

// ─── Plans ────────────────────────────────────────────────────────────────────
const planInput = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  triggerLeadSourceId: z.number().optional().nullable(),
  triggerLeadSourceIds: z.array(z.number()).optional().nullable(),
  triggerScope: z.enum(["new_only", "existing_and_new", "manual"]).optional(),
  status: z.enum(["active", "paused", "draft"]).optional(),
});

export const smartPlansRouter = router({
  // ── Plan CRUD ──────────────────────────────────────────────────────────────
  list: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
    const db = await getDb();
    if (!db) return [];
    const rows = await db
      .select({ plan: smartPlans, leadSource: leadSources })
      .from(smartPlans)
      .leftJoin(leadSources, eq(smartPlans.triggerLeadSourceId, leadSources.id))
      .orderBy(asc(smartPlans.name));

    // Fetch all lead sources once for multi-source lookup
    const allLeadSources = await db.select({ id: leadSources.id, name: leadSources.name }).from(leadSources);
    const lsMap = new Map(allLeadSources.map((ls) => [ls.id, ls.name]));

    // Attach step count and enrollment count
    const result = await Promise.all(
      rows.map(async (row) => {
        const stepRows = await db
          .select({ id: smartPlanSteps.id })
          .from(smartPlanSteps)
          .where(eq(smartPlanSteps.planId, row.plan.id));
        const enrollmentRows = await db
          .select({ id: smartPlanEnrollments.id })
          .from(smartPlanEnrollments)
          .where(and(
            eq(smartPlanEnrollments.planId, row.plan.id),
            eq(smartPlanEnrollments.status, "active")
          ));
        // Build triggerLeadSources array for multi-source plans
        const ids = (row.plan.triggerLeadSourceIds as number[] | null) ?? (row.plan.triggerLeadSourceId ? [row.plan.triggerLeadSourceId] : []);
        const triggerLeadSources = ids.map((id) => ({ id, name: lsMap.get(id) ?? `#${id}` }));
        return {
          ...row,
          triggerLeadSources,
          stepCount: stepRows.length,
          activeEnrollments: enrollmentRows.length,
        };
      })
    );
    return result;
  }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const rows = await db
        .select({ plan: smartPlans, leadSource: leadSources })
        .from(smartPlans)
        .leftJoin(leadSources, eq(smartPlans.triggerLeadSourceId, leadSources.id))
        .where(eq(smartPlans.id, input.id))
        .limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND" });
      const steps = await db
        .select()
        .from(smartPlanSteps)
        .where(eq(smartPlanSteps.planId, input.id))
        .orderBy(asc(smartPlanSteps.stepOrder));
      return { ...rows[0], steps };
    }),

  create: protectedProcedure
    .input(planInput)
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [result] = await db.insert(smartPlans).values({
        name: input.name,
        description: input.description ?? null,
        triggerLeadSourceId: null,
        triggerLeadSourceIds: input.triggerLeadSourceIds ?? null,
        triggerScope: input.triggerScope ?? "new_only",
        status: input.status ?? "draft",
      });
      const newId = (result as any).insertId as number;
      await logActivity({ userId: ctx.user.id, action: "smart_plan_created", entityType: "smart_plan", entityId: newId, details: { name: input.name } });
      return { id: newId };
    }),

  // Create a draft plan (returns id immediately for wizard flow)
  createDraft: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      description: z.string().optional().nullable(),
      triggerLeadSourceIds: z.array(z.number()).optional().nullable(),
      triggerScope: z.enum(["new_only", "existing_and_new", "manual"]).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [result] = await db.insert(smartPlans).values({
        name: input.name,
        description: input.description ?? null,
        triggerLeadSourceId: null,
        triggerLeadSourceIds: input.triggerLeadSourceIds ?? null,
        triggerScope: input.triggerScope ?? "new_only",
        status: "draft",
      });
      const draftId = (result as any).insertId as number;
      await logActivity({ userId: ctx.user.id, action: "smart_plan_created", entityType: "smart_plan", entityId: draftId, details: { name: input.name, status: "draft" } });
      return { id: draftId };
    }),

  // Count existing contacts that would be enrolled (for confirmation dialog)
  countMatchingContacts: protectedProcedure
    .input(z.object({ planId: z.number() }))
    .query(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const count = await countContactsMatchingPlan(input.planId);
      return { count };
    }),

  // Bulk-enroll existing contacts after explicit admin confirmation
  bulkEnrollExisting: protectedProcedure
    .input(z.object({ planId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const result = await bulkEnrollExistingContacts(input.planId);
      return result;
    }),

  // Publish a draft plan
  publish: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Validate plan has at least one step
      const steps = await db
        .select({ id: smartPlanSteps.id })
        .from(smartPlanSteps)
        .where(eq(smartPlanSteps.planId, input.id));
      if (steps.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Plan must have at least one step before publishing." });
      await db.update(smartPlans).set({ status: "active" }).where(eq(smartPlans.id, input.id));
      await logActivity({ userId: ctx.user.id, action: "smart_plan_published", entityType: "smart_plan", entityId: input.id });
      return { success: true };
    }),

  update: protectedProcedure
    .input(z.object({ id: z.number(), data: planInput.partial() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(smartPlans).set(input.data).where(eq(smartPlans.id, input.id));
      await logActivity({ userId: ctx.user.id, action: "smart_plan_updated", entityType: "smart_plan", entityId: input.id });
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Delete in dependency order
      const enrollmentIds = await db
        .select({ id: smartPlanEnrollments.id })
        .from(smartPlanEnrollments)
        .where(eq(smartPlanEnrollments.planId, input.id));
      for (const e of enrollmentIds) {
        await db.delete(smartPlanExecutions).where(eq(smartPlanExecutions.enrollmentId, e.id));
      }
      await db.delete(smartPlanEnrollments).where(eq(smartPlanEnrollments.planId, input.id));
      await db.delete(smartPlanSteps).where(eq(smartPlanSteps.planId, input.id));
      await db.delete(smartPlans).where(eq(smartPlans.id, input.id));
      await logActivity({ userId: ctx.user.id, action: "smart_plan_deleted", entityType: "smart_plan", entityId: input.id });
      return { success: true };
    }),

  // ── Steps CRUD ─────────────────────────────────────────────────────────────
  steps: router({
    // Legacy bulk upsert (kept for compatibility)
    upsert: protectedProcedure
      .input(z.object({
        planId: z.number(),
        steps: z.array(z.object({
          id: z.number().optional(),
          stepOrder: z.number(),
          channel: z.enum(["email", "sms"]),
          delayDays: z.number().min(0).default(0),
          delayHours: z.number().min(0).max(23).default(0),
          subject: z.string().optional().nullable(),
          body: z.string().min(1),
        })),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db.delete(smartPlanSteps).where(eq(smartPlanSteps.planId, input.planId));
        if (input.steps.length > 0) {
          await db.insert(smartPlanSteps).values(
            input.steps.map((s) => ({
              planId: input.planId,
              stepOrder: s.stepOrder,
              channel: s.channel,
              delayDays: s.delayDays,
              delayHours: s.delayHours,
              subject: s.subject ?? null,
              body: s.body,
            }))
          );
        }
        return { success: true };
      }),

    // Add a single step to a plan (wizard flow — saves immediately)
    add: protectedProcedure
      .input(z.object({
        planId: z.number(),
        channel: z.enum(["email", "sms"]),
        delayDays: z.number().min(0).default(0),
        delayHours: z.number().min(0).max(23).default(0),
        subject: z.string().optional().nullable(),
        body: z.string().min(1),
        businessHoursOnly: z.boolean().default(false),
        timezone: z.string().default("America/New_York"),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        // Get current max stepOrder
        const existing = await db
          .select({ stepOrder: smartPlanSteps.stepOrder })
          .from(smartPlanSteps)
          .where(eq(smartPlanSteps.planId, input.planId))
          .orderBy(desc(smartPlanSteps.stepOrder))
          .limit(1);
        const nextOrder = existing.length > 0 ? existing[0].stepOrder + 1 : 0;
        const [result] = await db.insert(smartPlanSteps).values({
          planId: input.planId,
          stepOrder: nextOrder,
          channel: input.channel,
          delayDays: input.delayDays,
          delayHours: input.delayHours,
          subject: input.subject ?? null,
          body: input.body,
          businessHoursOnly: input.businessHoursOnly,
          timezone: input.timezone,
        });
        return { id: (result as any).insertId as number, stepOrder: nextOrder };
      }),

    // Update a single step
    updateOne: protectedProcedure
      .input(z.object({
        stepId: z.number(),
        channel: z.enum(["email", "sms"]).optional(),
        delayDays: z.number().min(0).optional(),
        delayHours: z.number().min(0).max(23).optional(),
        subject: z.string().optional().nullable(),
        body: z.string().min(1).optional(),
        businessHoursOnly: z.boolean().optional(),
        timezone: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const { stepId, ...data } = input;
        await db.update(smartPlanSteps).set(data).where(eq(smartPlanSteps.id, stepId));
        return { success: true };
      }),

    // Delete a single step and reorder remaining
    delete: protectedProcedure
      .input(z.object({ stepId: z.number(), planId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db.delete(smartPlanSteps).where(eq(smartPlanSteps.id, input.stepId));
        // Reorder remaining steps
        const remaining = await db
          .select()
          .from(smartPlanSteps)
          .where(eq(smartPlanSteps.planId, input.planId))
          .orderBy(asc(smartPlanSteps.stepOrder));
        for (let i = 0; i < remaining.length; i++) {
          await db
            .update(smartPlanSteps)
            .set({ stepOrder: i })
            .where(eq(smartPlanSteps.id, remaining[i].id));
        }
        return { success: true };
      }),

    // Move a step up or down
    reorder: protectedProcedure
      .input(z.object({ planId: z.number(), stepId: z.number(), direction: z.enum(["up", "down"]) }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const steps = await db
          .select()
          .from(smartPlanSteps)
          .where(eq(smartPlanSteps.planId, input.planId))
          .orderBy(asc(smartPlanSteps.stepOrder));
        const idx = steps.findIndex((s) => s.id === input.stepId);
        if (idx === -1) throw new TRPCError({ code: "NOT_FOUND" });
        const swapIdx = input.direction === "up" ? idx - 1 : idx + 1;
        if (swapIdx < 0 || swapIdx >= steps.length) return { success: true };
        // Swap stepOrder values
        const aOrder = steps[idx].stepOrder;
        const bOrder = steps[swapIdx].stepOrder;
        await db.update(smartPlanSteps).set({ stepOrder: bOrder }).where(eq(smartPlanSteps.id, steps[idx].id));
        await db.update(smartPlanSteps).set({ stepOrder: aOrder }).where(eq(smartPlanSteps.id, steps[swapIdx].id));
        return { success: true };
      }),
  }),

  // ── Enrollments ────────────────────────────────────────────────────────────
  enrollments: router({
    list: protectedProcedure
      .input(z.object({
        planId: z.number().optional(),
        contactId: z.number().optional(),
      }))
      .query(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) return [];
        const conditions = [];
        if (input.planId) conditions.push(eq(smartPlanEnrollments.planId, input.planId));
        if (input.contactId) conditions.push(eq(smartPlanEnrollments.contactId, input.contactId));

        const rows = await db
          .select({
            enrollment: smartPlanEnrollments,
            plan: smartPlans,
            contact: contacts,
          })
          .from(smartPlanEnrollments)
          .innerJoin(smartPlans, eq(smartPlanEnrollments.planId, smartPlans.id))
          .innerJoin(contacts, eq(smartPlanEnrollments.contactId, contacts.id))
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(smartPlanEnrollments.enrolledAt));

        // Attach current step details for each enrollment
        const enriched = await Promise.all(rows.map(async (row) => {
          const stepRows = await db
            .select()
            .from(smartPlanSteps)
            .where(eq(smartPlanSteps.planId, row.enrollment.planId))
            .orderBy(asc(smartPlanSteps.stepOrder));
          const currentStep = stepRows[row.enrollment.currentStepIndex] ?? null;
          return { ...row, currentStep, totalSteps: stepRows.length };
        }));

        return enriched;
      }),

    manualEnroll: protectedProcedure
      .input(z.object({ planId: z.number(), contactId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        await enrollContactInPlan(input.contactId, input.planId);
        return { success: true };
      }),

    cancel: protectedProcedure
      .input(z.object({ enrollmentId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db
          .update(smartPlanEnrollments)
          .set({ status: "cancelled" })
          .where(eq(smartPlanEnrollments.id, input.enrollmentId));
        return { success: true };
      }),
  }),

  // ── Executions (message history) ───────────────────────────────────────────
  executions: router({
    list: protectedProcedure
      .input(z.object({
        enrollmentId: z.number().optional(),
        contactId: z.number().optional(),
      }))
      .query(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) return [];

        if (input.contactId) {
          // Get all executions for all enrollments of this contact
          const enrollments = await db
            .select({ id: smartPlanEnrollments.id })
            .from(smartPlanEnrollments)
            .where(eq(smartPlanEnrollments.contactId, input.contactId));

          if (enrollments.length === 0) return [];

          const enrollmentIds = enrollments.map((e) => e.id);
          const rows = await db
            .select({
              execution: smartPlanExecutions,
              step: smartPlanSteps,
              enrollment: smartPlanEnrollments,
              plan: smartPlans,
            })
            .from(smartPlanExecutions)
            .innerJoin(smartPlanSteps, eq(smartPlanExecutions.stepId, smartPlanSteps.id))
            .innerJoin(smartPlanEnrollments, eq(smartPlanExecutions.enrollmentId, smartPlanEnrollments.id))
            .innerJoin(smartPlans, eq(smartPlanEnrollments.planId, smartPlans.id))
            .where(
              enrollmentIds.length === 1
                ? eq(smartPlanExecutions.enrollmentId, enrollmentIds[0])
                : and(...enrollmentIds.map((id) => eq(smartPlanExecutions.enrollmentId, id)))
            )
            .orderBy(desc(smartPlanExecutions.sentAt));
          return rows;
        }

        if (input.enrollmentId) {
          return db
            .select({
              execution: smartPlanExecutions,
              step: smartPlanSteps,
              enrollment: smartPlanEnrollments,
              plan: smartPlans,
            })
            .from(smartPlanExecutions)
            .innerJoin(smartPlanSteps, eq(smartPlanExecutions.stepId, smartPlanSteps.id))
            .innerJoin(smartPlanEnrollments, eq(smartPlanExecutions.enrollmentId, smartPlanEnrollments.id))
            .innerJoin(smartPlans, eq(smartPlanEnrollments.planId, smartPlans.id))
            .where(eq(smartPlanExecutions.enrollmentId, input.enrollmentId))
            .orderBy(desc(smartPlanExecutions.sentAt));
        }

        return [];
      }),
  }),
});
