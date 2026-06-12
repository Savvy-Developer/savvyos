import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";

async function getDatabase() {
  const d = await getDb();
  if (!d) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return d;
}
import {
  onboardingTemplates,
  onboardingTemplateTasks,
  onboardingInstances,
  onboardingInstanceTasks,
  users,
} from "../../drizzle/schema";
import { eq, asc, and, desc, sql, isNotNull, lt } from "drizzle-orm";
import { checkOverdueOnboardingTasks } from "../onboardingOverdueScheduler";

export const onboardingRouter = router({
  // ─── Templates CRUD (admin only) ──────────────────────────────────────────

  listTemplates: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
    const db = await getDatabase();
    const templates = await db
      .select({
        id: onboardingTemplates.id,
        name: onboardingTemplates.name,
        description: onboardingTemplates.description,
        type: onboardingTemplates.type,
        createdAt: onboardingTemplates.createdAt,
        taskCount: sql<number>`(SELECT COUNT(*) FROM onboarding_template_tasks WHERE templateId = ${onboardingTemplates.id})`.as("taskCount"),
        instanceCount: sql<number>`(SELECT COUNT(*) FROM onboarding_instances WHERE templateId = ${onboardingTemplates.id})`.as("instanceCount"),
      })
      .from(onboardingTemplates)
      .orderBy(desc(onboardingTemplates.createdAt));
    return templates;
  }),

  getTemplate: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDatabase();
      const [template] = await db
        .select()
        .from(onboardingTemplates)
        .where(eq(onboardingTemplates.id, input.id));
      if (!template) throw new TRPCError({ code: "NOT_FOUND" });
      const tasks = await db
        .select()
        .from(onboardingTemplateTasks)
        .where(eq(onboardingTemplateTasks.templateId, input.id))
        .orderBy(asc(onboardingTemplateTasks.sortOrder));
      return { ...template, tasks };
    }),

  createTemplate: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      type: z.enum(["onboarding", "offboarding"]).default("onboarding"),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDatabase();
      const [result] = await db.insert(onboardingTemplates).values(input);
      return { id: result.insertId };
    }),

  updateTemplate: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).optional(),
      description: z.string().optional().nullable(),
      type: z.enum(["onboarding", "offboarding"]).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDatabase();
      const { id, ...data } = input;
      await db.update(onboardingTemplates).set(data).where(eq(onboardingTemplates.id, id));
      return { success: true };
    }),

  deleteTemplate: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDatabase();
      // Check if template is in use
      const [inUse] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(onboardingInstances)
        .where(eq(onboardingInstances.templateId, input.id));
      if (inUse && Number(inUse.count) > 0) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Cannot delete a template that has active onboarding instances." });
      }
      await db.delete(onboardingTemplates).where(eq(onboardingTemplates.id, input.id));
      return { success: true };
    }),

  // ─── Template Tasks CRUD ──────────────────────────────────────────────────

  addTemplateTask: protectedProcedure
    .input(z.object({
      templateId: z.number(),
      title: z.string().min(1),
      description: z.string().optional(),
      assignee: z.enum(["admin", "agent"]).default("admin"),
      sortOrder: z.number().default(0),
      dueDaysOffset: z.number().min(1).nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDatabase();
      // Auto-set sortOrder to next available
      const [maxOrder] = await db
        .select({ max: sql<number>`COALESCE(MAX(sortOrder), -1)` })
        .from(onboardingTemplateTasks)
        .where(eq(onboardingTemplateTasks.templateId, input.templateId));
      const sortOrder = input.sortOrder || (Number(maxOrder?.max ?? -1) + 1);
      const [result] = await db.insert(onboardingTemplateTasks).values({
        templateId: input.templateId,
        title: input.title,
        description: input.description,
        assignee: input.assignee,
        sortOrder,
        dueDaysOffset: input.dueDaysOffset ?? null,
      });
      return { id: result.insertId };
    }),

  updateTemplateTask: protectedProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().min(1).optional(),
      description: z.string().optional().nullable(),
      assignee: z.enum(["admin", "agent"]).optional(),
      sortOrder: z.number().optional(),
      dueDaysOffset: z.number().min(1).nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDatabase();
      const { id, ...data } = input;
      await db.update(onboardingTemplateTasks).set(data).where(eq(onboardingTemplateTasks.id, id));
      return { success: true };
    }),

  deleteTemplateTask: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDatabase();
      await db.delete(onboardingTemplateTasks).where(eq(onboardingTemplateTasks.id, input.id));
      return { success: true };
    }),

  // ─── Onboarding Instances ─────────────────────────────────────────────────

  createInstance: protectedProcedure
    .input(z.object({
      agentUserId: z.number(),
      templateId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDatabase();
      // Create the instance
      const startedAt = new Date();
      const [instResult] = await db.insert(onboardingInstances).values({
        agentUserId: input.agentUserId,
        templateId: input.templateId,
      });
      const instanceId = instResult.insertId;
      // Copy template tasks into instance tasks, computing due dates
      const templateTasks = await db
        .select()
        .from(onboardingTemplateTasks)
        .where(eq(onboardingTemplateTasks.templateId, input.templateId))
        .orderBy(asc(onboardingTemplateTasks.sortOrder));
      if (templateTasks.length > 0) {
        await db.insert(onboardingInstanceTasks).values(
          templateTasks.map((t) => {
            let dueDate: Date | null = null;
            if (t.dueDaysOffset != null && t.dueDaysOffset > 0) {
              dueDate = new Date(startedAt.getTime() + t.dueDaysOffset * 24 * 60 * 60 * 1000);
            }
            return {
              instanceId,
              templateTaskId: t.id,
              title: t.title,
              description: t.description,
              assignee: t.assignee,
              sortOrder: t.sortOrder,
              dueDate,
            };
          })
        );
      }
      return { id: instanceId };
    }),

  listInstances: protectedProcedure
    .input(z.object({ status: z.enum(["in_progress", "completed", "all"]).default("all") }).optional())
    .query(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDatabase();
      const conditions = [];
      const statusFilter = input?.status ?? "all";
      if (statusFilter !== "all") {
        conditions.push(eq(onboardingInstances.status, statusFilter));
      }
      const instances = await db
        .select({
          instance: onboardingInstances,
          agent: { id: users.id, name: users.name, email: users.email },
          template: { id: onboardingTemplates.id, name: onboardingTemplates.name },
          totalTasks: sql<number>`(SELECT COUNT(*) FROM onboarding_instance_tasks WHERE instanceId = ${onboardingInstances.id})`.as("totalTasks"),
          completedTasks: sql<number>`(SELECT COUNT(*) FROM onboarding_instance_tasks WHERE instanceId = ${onboardingInstances.id} AND completed = true)`.as("completedTasks"),
          overdueTasks: sql<number>`(SELECT COUNT(*) FROM onboarding_instance_tasks WHERE instanceId = ${onboardingInstances.id} AND completed = false AND dueDate IS NOT NULL AND dueDate < NOW())`.as("overdueTasks"),
        })
        .from(onboardingInstances)
        .leftJoin(users, eq(onboardingInstances.agentUserId, users.id))
        .leftJoin(onboardingTemplates, eq(onboardingInstances.templateId, onboardingTemplates.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(onboardingInstances.startedAt));
      return instances;
    }),

  getInstance: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDatabase();
      const [instance] = await db
        .select({
          instance: onboardingInstances,
          agent: { id: users.id, name: users.name, email: users.email },
          template: { id: onboardingTemplates.id, name: onboardingTemplates.name },
        })
        .from(onboardingInstances)
        .leftJoin(users, eq(onboardingInstances.agentUserId, users.id))
        .leftJoin(onboardingTemplates, eq(onboardingInstances.templateId, onboardingTemplates.id))
        .where(eq(onboardingInstances.id, input.id));
      if (!instance) throw new TRPCError({ code: "NOT_FOUND" });
      // Check access: admin can see all, agent can only see their own
      if (ctx.user.role !== "admin" && instance.instance.agentUserId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const tasks = await db
        .select()
        .from(onboardingInstanceTasks)
        .where(eq(onboardingInstanceTasks.instanceId, input.id))
        .orderBy(asc(onboardingInstanceTasks.sortOrder));
      return { ...instance, tasks };
    }),

  // Agent's own onboarding
  myOnboarding: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDatabase();
    const [instance] = await db
      .select({
        instance: onboardingInstances,
        template: { id: onboardingTemplates.id, name: onboardingTemplates.name },
      })
      .from(onboardingInstances)
      .leftJoin(onboardingTemplates, eq(onboardingInstances.templateId, onboardingTemplates.id))
      .where(and(
        eq(onboardingInstances.agentUserId, ctx.user.id),
        eq(onboardingInstances.status, "in_progress")
      ))
      .orderBy(desc(onboardingInstances.startedAt))
      .limit(1);
    if (!instance) return null;
    const tasks = await db
      .select()
      .from(onboardingInstanceTasks)
      .where(eq(onboardingInstanceTasks.instanceId, instance.instance.id))
      .orderBy(asc(onboardingInstanceTasks.sortOrder));
    return { ...instance, tasks };
  }),

  // Check if agent has active onboarding (lightweight query for nav)
  hasActiveOnboarding: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDatabase();
    const [result] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(onboardingInstances)
      .where(and(
        eq(onboardingInstances.agentUserId, ctx.user.id),
        eq(onboardingInstances.status, "in_progress")
      ));
    return { active: Number(result?.count ?? 0) > 0 };
  }),

  // ─── Bulk Due Date Management (admin only) ─────────────────────────────────

  /** Shift all due dates on an instance by N days (positive = extend, negative = shorten) */
  bulkExtendDueDates: protectedProcedure
    .input(z.object({
      instanceId: z.number(),
      days: z.number().min(-365).max(365),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDatabase();
      // Verify instance exists
      const [instance] = await db.select().from(onboardingInstances).where(eq(onboardingInstances.id, input.instanceId));
      if (!instance) throw new TRPCError({ code: "NOT_FOUND" });
      // Update all tasks that have a dueDate
      await db.execute(
        sql`UPDATE onboarding_instance_tasks SET dueDate = DATE_ADD(dueDate, INTERVAL ${input.days} DAY) WHERE instanceId = ${input.instanceId} AND dueDate IS NOT NULL`
      );
      return { success: true };
    }),

  /** Update a single instance task's due date */
  updateTaskDueDate: protectedProcedure
    .input(z.object({
      taskId: z.number(),
      dueDate: z.string().nullable(), // ISO date string or null to clear
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDatabase();
      const [task] = await db.select().from(onboardingInstanceTasks).where(eq(onboardingInstanceTasks.id, input.taskId));
      if (!task) throw new TRPCError({ code: "NOT_FOUND" });
      await db.update(onboardingInstanceTasks).set({
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
      }).where(eq(onboardingInstanceTasks.id, input.taskId));
      return { success: true };
    }),

  /** Manually trigger overdue check (admin only) */
  triggerOverdueCheck: protectedProcedure
    .mutation(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      await checkOverdueOnboardingTasks();
      return { success: true };
    }),

  // ─── Onboarding Report / Metrics (admin only) ─────────────────────────────

  getReport: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
    const db = await getDatabase();

    // Summary stats
    const [totals] = await db.select({
      totalInstances: sql<number>`COUNT(*)`,
      completedInstances: sql<number>`SUM(CASE WHEN ${onboardingInstances.status} = 'completed' THEN 1 ELSE 0 END)`,
      inProgressInstances: sql<number>`SUM(CASE WHEN ${onboardingInstances.status} = 'in_progress' THEN 1 ELSE 0 END)`,
      avgCompletionDays: sql<number>`AVG(CASE WHEN ${onboardingInstances.status} = 'completed' AND ${onboardingInstances.completedAt} IS NOT NULL THEN DATEDIFF(${onboardingInstances.completedAt}, ${onboardingInstances.startedAt}) ELSE NULL END)`,
    }).from(onboardingInstances);

    // Overdue task count across all active instances
    const [overdueStats] = await db.select({
      overdueTaskCount: sql<number>`COUNT(*)`,
    }).from(onboardingInstanceTasks)
      .innerJoin(onboardingInstances, eq(onboardingInstanceTasks.instanceId, onboardingInstances.id))
      .where(and(
        eq(onboardingInstanceTasks.completed, false),
        isNotNull(onboardingInstanceTasks.dueDate),
        lt(onboardingInstanceTasks.dueDate, new Date()),
        eq(onboardingInstances.status, "in_progress")
      ));

    // On-time completion rate: tasks completed before or on their due date
    const [onTimeStats] = await db.select({
      totalCompletedWithDue: sql<number>`SUM(CASE WHEN ${onboardingInstanceTasks.completed} = true AND ${onboardingInstanceTasks.dueDate} IS NOT NULL THEN 1 ELSE 0 END)`,
      completedOnTime: sql<number>`SUM(CASE WHEN ${onboardingInstanceTasks.completed} = true AND ${onboardingInstanceTasks.dueDate} IS NOT NULL AND ${onboardingInstanceTasks.completedAt} <= ${onboardingInstanceTasks.dueDate} THEN 1 ELSE 0 END)`,
    }).from(onboardingInstanceTasks);

    const totalCompletedWithDue = Number(onTimeStats?.totalCompletedWithDue ?? 0);
    const completedOnTime = Number(onTimeStats?.completedOnTime ?? 0);
    const onTimeRate = totalCompletedWithDue > 0 ? Math.round((completedOnTime / totalCompletedWithDue) * 100) : 100;

    // Per-agent breakdown
    const agentBreakdown = await db.select({
      agentId: users.id,
      agentName: users.name,
      agentEmail: users.email,
      totalInstances: sql<number>`COUNT(DISTINCT ${onboardingInstances.id})`,
      completedInstances: sql<number>`SUM(CASE WHEN ${onboardingInstances.status} = 'completed' THEN 1 ELSE 0 END)`,
      avgDays: sql<number>`AVG(CASE WHEN ${onboardingInstances.status} = 'completed' AND ${onboardingInstances.completedAt} IS NOT NULL THEN DATEDIFF(${onboardingInstances.completedAt}, ${onboardingInstances.startedAt}) ELSE NULL END)`,
      overdueTasks: sql<number>`(SELECT COUNT(*) FROM onboarding_instance_tasks oit INNER JOIN onboarding_instances oi2 ON oit.instanceId = oi2.id WHERE oi2.agentUserId = ${users.id} AND oit.completed = false AND oit.dueDate IS NOT NULL AND oit.dueDate < NOW() AND oi2.status = 'in_progress')`,
    })
      .from(onboardingInstances)
      .innerJoin(users, eq(onboardingInstances.agentUserId, users.id))
      .groupBy(users.id, users.name, users.email)
      .orderBy(desc(sql`totalInstances`));

    return {
      summary: {
        totalInstances: Number(totals?.totalInstances ?? 0),
        completedInstances: Number(totals?.completedInstances ?? 0),
        inProgressInstances: Number(totals?.inProgressInstances ?? 0),
        avgCompletionDays: totals?.avgCompletionDays != null ? Math.round(Number(totals.avgCompletionDays)) : null,
        overdueTaskCount: Number(overdueStats?.overdueTaskCount ?? 0),
        onTimeRate,
      },
      agentBreakdown: agentBreakdown.map((a) => ({
        agentId: a.agentId,
        agentName: a.agentName,
        agentEmail: a.agentEmail,
        totalInstances: Number(a.totalInstances),
        completedInstances: Number(a.completedInstances),
        avgDays: a.avgDays != null ? Math.round(Number(a.avgDays)) : null,
        overdueTasks: Number(a.overdueTasks),
      })),
    };
  }),

  // Get active on/offboarding instances for a specific agent (admin only, for profile page)
  agentOnboardingStatus: protectedProcedure
    .input(z.object({ agentUserId: z.number() }))
    .query(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDatabase();
      const instances = await db
        .select({
          instance: onboardingInstances,
          template: { id: onboardingTemplates.id, name: onboardingTemplates.name, type: onboardingTemplates.type },
          totalTasks: sql<number>`(SELECT COUNT(*) FROM onboarding_instance_tasks WHERE instanceId = ${onboardingInstances.id})`.as("totalTasks"),
          completedTasks: sql<number>`(SELECT COUNT(*) FROM onboarding_instance_tasks WHERE instanceId = ${onboardingInstances.id} AND completed = true)`.as("completedTasks"),
        })
        .from(onboardingInstances)
        .leftJoin(onboardingTemplates, eq(onboardingInstances.templateId, onboardingTemplates.id))
        .where(and(
          eq(onboardingInstances.agentUserId, input.agentUserId),
          eq(onboardingInstances.status, "in_progress")
        ))
        .orderBy(desc(onboardingInstances.startedAt));
      return instances;
    }),

  toggleTask: protectedProcedure
    .input(z.object({ taskId: z.number(), completed: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDatabase();
      // Get the task and its instance
      const [task] = await db
        .select()
        .from(onboardingInstanceTasks)
        .where(eq(onboardingInstanceTasks.id, input.taskId));
      if (!task) throw new TRPCError({ code: "NOT_FOUND" });
      // Get the instance to check access
      const [instance] = await db
        .select()
        .from(onboardingInstances)
        .where(eq(onboardingInstances.id, task.instanceId));
      if (!instance) throw new TRPCError({ code: "NOT_FOUND" });
      // Access check: admin can toggle any, agent can only toggle their own agent-assigned tasks
      if (ctx.user.role !== "admin") {
        if (instance.agentUserId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        if (task.assignee !== "agent") {
          throw new TRPCError({ code: "FORBIDDEN", message: "You can only complete tasks assigned to you." });
        }
      }
      await db.update(onboardingInstanceTasks).set({
        completed: input.completed,
        completedAt: input.completed ? new Date() : null,
        completedByUserId: input.completed ? ctx.user.id : null,
      }).where(eq(onboardingInstanceTasks.id, input.taskId));

      // Check if all tasks are completed → auto-complete instance
      const [remaining] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(onboardingInstanceTasks)
        .where(and(
          eq(onboardingInstanceTasks.instanceId, task.instanceId),
          eq(onboardingInstanceTasks.completed, false)
        ));
      if (input.completed && Number(remaining?.count ?? 1) === 0) {
        await db.update(onboardingInstances).set({
          status: "completed",
          completedAt: new Date(),
        }).where(eq(onboardingInstances.id, task.instanceId));
      } else if (!input.completed) {
        // If unchecking a task, reopen the instance
        await db.update(onboardingInstances).set({
          status: "in_progress",
          completedAt: null,
        }).where(eq(onboardingInstances.id, task.instanceId));
      }
      return { success: true };
    }),
});
