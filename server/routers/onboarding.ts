import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";

async function getDatabase() {
  const d = await getDb();
  if (!d)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database unavailable",
    });
  return d;
}

async function requireAdminAssignee(
  db: Awaited<ReturnType<typeof getDatabase>>,
  adminUserId: number | null | undefined
): Promise<number> {
  if (!adminUserId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Select an admin user for admin-assigned onboarding tasks.",
    });
  }
  const [adminUser] = await db
    .select({ id: users.id, role: users.role, isActive: users.isActive })
    .from(users)
    .where(eq(users.id, adminUserId));
  if (!adminUser || adminUser.role !== "admin" || !adminUser.isActive) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "The selected user must be an active admin user.",
    });
  }
  return adminUser.id;
}
import {
  onboardingTemplates,
  onboardingTemplateStages,
  onboardingTemplateTasks,
  onboardingInstances,
  onboardingInstanceTasks,
  onboardingOverdueNotificationRecipients,
  tasks as tasksTable,
  users,
} from "../../drizzle/schema";
import { emailNotificationSettings } from "../../drizzle/schema";
import { eq, asc, and, desc, sql, isNotNull, lt, inArray } from "drizzle-orm";
import { checkOverdueOnboardingTasks } from "../onboardingOverdueScheduler";
import { sendTransactionalEmail } from "../_core/resendEmail";

async function requireOnboardingAgent(
  db: Awaited<ReturnType<typeof getDatabase>>,
  agentUserId: number
): Promise<{ id: number; name: string | null; email: string | null }> {
  const [agent] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      isActive: users.isActive,
    })
    .from(users)
    .where(eq(users.id, agentUserId));
  if (!agent || agent.role !== "agent" || !agent.isActive) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Select an active agent for this onboarding assignment.",
    });
  }
  return { id: agent.id, name: agent.name, email: agent.email };
}

async function requireTemplateStage(
  db: Awaited<ReturnType<typeof getDatabase>>,
  templateId: number,
  stageId: number | null | undefined
): Promise<number | null> {
  if (stageId == null) return null;
  const [stage] = await db
    .select({ id: onboardingTemplateStages.id })
    .from(onboardingTemplateStages)
    .where(
      and(
        eq(onboardingTemplateStages.id, stageId),
        eq(onboardingTemplateStages.templateId, templateId)
      )
    );
  if (!stage) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Select a stage that belongs to this template.",
    });
  }
  return stage.id;
}

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
        taskCount:
          sql<number>`(SELECT COUNT(*) FROM onboarding_template_tasks WHERE templateId = ${onboardingTemplates.id})`.as(
            "taskCount"
          ),
        instanceCount:
          sql<number>`(SELECT COUNT(*) FROM onboarding_instances WHERE templateId = ${onboardingTemplates.id})`.as(
            "instanceCount"
          ),
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
      const stages = await db
        .select()
        .from(onboardingTemplateStages)
        .where(eq(onboardingTemplateStages.templateId, input.id))
        .orderBy(asc(onboardingTemplateStages.sortOrder));
      return { ...template, tasks, stages };
    }),

  createTemplate: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        type: z.enum(["onboarding", "offboarding"]).default("onboarding"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDatabase();
      const [result] = await db.insert(onboardingTemplates).values(input);
      return { id: result.insertId };
    }),

  updateTemplate: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        description: z.string().optional().nullable(),
        type: z.enum(["onboarding", "offboarding"]).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDatabase();
      const { id, ...data } = input;
      await db
        .update(onboardingTemplates)
        .set(data)
        .where(eq(onboardingTemplates.id, id));
      return { success: true };
    }),

  // ─── Template Stages CRUD ─────────────────────────────────────────────────

  createTemplateStage: protectedProcedure
    .input(
      z.object({
        templateId: z.number(),
        name: z.string().trim().min(1).max(120),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDatabase();
      const [maxOrder] = await db
        .select({ max: sql<number>`COALESCE(MAX(sortOrder), -1)` })
        .from(onboardingTemplateStages)
        .where(eq(onboardingTemplateStages.templateId, input.templateId));
      try {
        const [result] = await db.insert(onboardingTemplateStages).values({
          templateId: input.templateId,
          name: input.name,
          sortOrder: Number(maxOrder?.max ?? -1) + 1,
        });
        return { id: result.insertId };
      } catch (error: any) {
        if (error?.code === "ER_DUP_ENTRY") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "This template already has a stage with that name.",
          });
        }
        throw error;
      }
    }),

  updateTemplateStage: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().trim().min(1).max(120).optional(),
        sortOrder: z.number().int().min(0).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDatabase();
      const { id, ...data } = input;
      await db
        .update(onboardingTemplateStages)
        .set(data)
        .where(eq(onboardingTemplateStages.id, id));
      return { success: true };
    }),

  deleteTemplateStage: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDatabase();
      // Clear the assignment first so stage removal is always safe, even on a
      // database that has not yet applied the SET NULL foreign-key migration.
      await db
        .update(onboardingTemplateTasks)
        .set({ stageId: null })
        .where(eq(onboardingTemplateTasks.stageId, input.id));
      await db
        .delete(onboardingTemplateStages)
        .where(eq(onboardingTemplateStages.id, input.id));
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
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Cannot delete a template that has active onboarding instances.",
        });
      }
      await db
        .delete(onboardingTemplates)
        .where(eq(onboardingTemplates.id, input.id));
      return { success: true };
    }),

  // ─── Template Tasks CRUD ──────────────────────────────────────────────────

  addTemplateTask: protectedProcedure
    .input(
      z.object({
        templateId: z.number(),
        title: z.string().min(1),
        description: z.string().optional(),
        assignee: z.enum(["admin", "agent"]).default("admin"),
        adminUserId: z.number().nullable().optional(),
        stageId: z.number().nullable().optional(),
        sortOrder: z.number().default(0),
        dueDaysOffset: z.number().min(1).nullable().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDatabase();
      const adminUserId =
        input.assignee === "admin"
          ? await requireAdminAssignee(db, input.adminUserId)
          : null;
      const stageId = await requireTemplateStage(
        db,
        input.templateId,
        input.stageId
      );
      // Auto-set sortOrder to next available
      const [maxOrder] = await db
        .select({ max: sql<number>`COALESCE(MAX(sortOrder), -1)` })
        .from(onboardingTemplateTasks)
        .where(eq(onboardingTemplateTasks.templateId, input.templateId));
      const sortOrder = input.sortOrder || Number(maxOrder?.max ?? -1) + 1;
      const [result] = await db.insert(onboardingTemplateTasks).values({
        templateId: input.templateId,
        title: input.title,
        description: input.description,
        assignee: input.assignee,
        adminUserId,
        stageId,
        sortOrder,
        dueDaysOffset: input.dueDaysOffset ?? null,
      });
      return { id: result.insertId };
    }),

  updateTemplateTask: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        title: z.string().min(1).optional(),
        description: z.string().optional().nullable(),
        assignee: z.enum(["admin", "agent"]).optional(),
        adminUserId: z.number().nullable().optional(),
        stageId: z.number().nullable().optional(),
        sortOrder: z.number().optional(),
        dueDaysOffset: z.number().min(1).nullable().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDatabase();
      const [currentTask] = await db
        .select()
        .from(onboardingTemplateTasks)
        .where(eq(onboardingTemplateTasks.id, input.id));
      if (!currentTask) throw new TRPCError({ code: "NOT_FOUND" });

      const assignee = input.assignee ?? currentTask.assignee;
      const adminUserId =
        assignee === "admin"
          ? await requireAdminAssignee(
              db,
              input.adminUserId !== undefined
                ? input.adminUserId
                : currentTask.adminUserId
            )
          : null;
      const stageId =
        input.stageId !== undefined
          ? await requireTemplateStage(
              db,
              currentTask.templateId,
              input.stageId
            )
          : currentTask.stageId;
      const {
        id,
        adminUserId: _adminUserId,
        assignee: _assignee,
        stageId: _stageId,
        ...data
      } = input;
      await db
        .update(onboardingTemplateTasks)
        .set({ ...data, assignee, adminUserId, stageId })
        .where(eq(onboardingTemplateTasks.id, id));
      return { success: true };
    }),

  deleteTemplateTask: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDatabase();
      // Launched checklists retain their copied task details. Clear this
      // optional source reference first so a template task can be removed even
      // when historical instances still point to it.
      await db
        .update(onboardingInstanceTasks)
        .set({ templateTaskId: null })
        .where(eq(onboardingInstanceTasks.templateTaskId, input.id));
      await db
        .delete(onboardingTemplateTasks)
        .where(eq(onboardingTemplateTasks.id, input.id));
      return { success: true };
    }),

  // ─── Onboarding Instances ─────────────────────────────────────────────────

  createInstance: protectedProcedure
    .input(
      z.object({
        agentUserId: z.number(),
        templateId: z.number(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDatabase();
      const onboardingAgent = await requireOnboardingAgent(
        db,
        input.agentUserId
      );
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
      const templateStages = await db
        .select()
        .from(onboardingTemplateStages)
        .where(eq(onboardingTemplateStages.templateId, input.templateId))
        .orderBy(asc(onboardingTemplateStages.sortOrder));
      const stageNamesById = new Map(
        templateStages.map(stage => [stage.id, stage.name])
      );
      if (templateTasks.length > 0) {
        for (const templateTask of templateTasks) {
          let dueDate: Date | null = null;
          if (
            templateTask.dueDaysOffset != null &&
            templateTask.dueDaysOffset > 0
          ) {
            dueDate = new Date(
              startedAt.getTime() +
                templateTask.dueDaysOffset * 24 * 60 * 60 * 1000
            );
          }

          const adminUserId =
            templateTask.assignee === "admin" ? templateTask.adminUserId : null;
          const [instanceTaskResult] = await db
            .insert(onboardingInstanceTasks)
            .values({
              instanceId,
              templateTaskId: templateTask.id,
              stageName: templateTask.stageId
                ? (stageNamesById.get(templateTask.stageId) ?? null)
                : null,
              title: templateTask.title,
              description: templateTask.description,
              assignee: templateTask.assignee,
              adminUserId,
              sortOrder: templateTask.sortOrder,
              dueDate,
            });
          const onboardingInstanceTaskId = instanceTaskResult.insertId;

          // Admin-assigned checklist items also become standard tasks so they
          // appear in the selected admin's existing task list and overdue badge.
          if (adminUserId) {
            const [linkedTaskResult] = await db.insert(tasksTable).values({
              title: templateTask.title,
              description: [
                templateTask.description,
                `Onboarding checklist item for agent #${input.agentUserId}.`,
              ]
                .filter(Boolean)
                .join("\n\n"),
              assignedToId: adminUserId,
              createdById: ctx.user.id,
              dueDate,
              taskType: "other",
              onboardingInstanceTaskId,
            });
            await db
              .update(onboardingInstanceTasks)
              .set({ linkedTaskId: linkedTaskResult.insertId })
              .where(eq(onboardingInstanceTasks.id, onboardingInstanceTaskId));
          }
        }
      }

      // A new agent can start their Extended Profile immediately from a secure
      // magic link. The email is sent after the instance and its tasks exist so
      // any return visit finds a complete, resumable onboarding record.
      let profileInvitationSent = false;
      try {
        if (onboardingAgent.email) {
          const delivery = await sendTransactionalEmail(
            "onboarding_profile_invitation",
            {
              recipientName: onboardingAgent.name ?? undefined,
              recipientEmail: onboardingAgent.email,
              onboardingProfileUrl: "https://os.savvy-agents.com/profile",
            },
            {
              idempotencyKey: `onboarding-profile-invitation:${instanceId}:${onboardingAgent.email.toLowerCase()}`,
              allowTemplateOverride: false,
            }
          );
          profileInvitationSent = delivery.sent;
          if (!delivery.sent) {
            console.warn(
              `[Onboarding] Profile invitation was not delivered for onboarding instance ${instanceId}: ${delivery.reason ?? "unknown reason"}`
            );
          }
        }
      } catch (error) {
        // Onboarding itself remains durable if transactional email is
        // temporarily unavailable. The agent can still reach My Profile after
        // signing in normally.
        console.error(
          `[Onboarding] Failed to send profile invitation for onboarding instance ${instanceId}:`,
          error
        );
      }
      return { id: instanceId, profileInvitationSent };
    }),

  updateInstanceAssignment: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        agentUserId: z.number(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDatabase();
      await requireOnboardingAgent(db, input.agentUserId);
      const [instance] = await db
        .select({ id: onboardingInstances.id })
        .from(onboardingInstances)
        .where(eq(onboardingInstances.id, input.id));
      if (!instance) throw new TRPCError({ code: "NOT_FOUND" });
      await db
        .update(onboardingInstances)
        .set({ agentUserId: input.agentUserId })
        .where(eq(onboardingInstances.id, input.id));
      return { success: true };
    }),

  deleteInstance: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDatabase();
      const [instance] = await db
        .select({ id: onboardingInstances.id })
        .from(onboardingInstances)
        .where(eq(onboardingInstances.id, input.id));
      if (!instance) throw new TRPCError({ code: "NOT_FOUND" });

      const instanceTasks = await db
        .select({ linkedTaskId: onboardingInstanceTasks.linkedTaskId })
        .from(onboardingInstanceTasks)
        .where(eq(onboardingInstanceTasks.instanceId, input.id));
      const linkedTaskIds = instanceTasks
        .map(task => task.linkedTaskId)
        .filter((taskId): taskId is number => taskId != null);

      // Unlink before deleting the matching standard task to satisfy the
      // instance-task foreign key. The instance deletion then cascades safely.
      if (linkedTaskIds.length > 0) {
        await db
          .update(onboardingInstanceTasks)
          .set({ linkedTaskId: null })
          .where(eq(onboardingInstanceTasks.instanceId, input.id));
        await db
          .delete(tasksTable)
          .where(inArray(tasksTable.id, linkedTaskIds));
      }
      await db
        .delete(onboardingInstances)
        .where(eq(onboardingInstances.id, input.id));
      return { success: true };
    }),

  listInstances: protectedProcedure
    .input(
      z
        .object({
          status: z.enum(["in_progress", "completed", "all"]).default("all"),
        })
        .optional()
    )
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
          template: {
            id: onboardingTemplates.id,
            name: onboardingTemplates.name,
          },
          totalTasks:
            sql<number>`(SELECT COUNT(*) FROM onboarding_instance_tasks WHERE instanceId = ${onboardingInstances.id})`.as(
              "totalTasks"
            ),
          completedTasks:
            sql<number>`(SELECT COUNT(*) FROM onboarding_instance_tasks WHERE instanceId = ${onboardingInstances.id} AND completed = true)`.as(
              "completedTasks"
            ),
          overdueTasks:
            sql<number>`(SELECT COUNT(*) FROM onboarding_instance_tasks WHERE instanceId = ${onboardingInstances.id} AND completed = false AND dueDate IS NOT NULL AND dueDate < NOW())`.as(
              "overdueTasks"
            ),
        })
        .from(onboardingInstances)
        .leftJoin(users, eq(onboardingInstances.agentUserId, users.id))
        .leftJoin(
          onboardingTemplates,
          eq(onboardingInstances.templateId, onboardingTemplates.id)
        )
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
          template: {
            id: onboardingTemplates.id,
            name: onboardingTemplates.name,
          },
        })
        .from(onboardingInstances)
        .leftJoin(users, eq(onboardingInstances.agentUserId, users.id))
        .leftJoin(
          onboardingTemplates,
          eq(onboardingInstances.templateId, onboardingTemplates.id)
        )
        .where(eq(onboardingInstances.id, input.id));
      if (!instance) throw new TRPCError({ code: "NOT_FOUND" });
      // Check access: admin can see all, agent can only see their own
      if (
        ctx.user.role !== "admin" &&
        instance.instance.agentUserId !== ctx.user.id
      ) {
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
        template: {
          id: onboardingTemplates.id,
          name: onboardingTemplates.name,
        },
      })
      .from(onboardingInstances)
      .leftJoin(
        onboardingTemplates,
        eq(onboardingInstances.templateId, onboardingTemplates.id)
      )
      .where(
        and(
          eq(onboardingInstances.agentUserId, ctx.user.id),
          eq(onboardingInstances.status, "in_progress")
        )
      )
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
      .where(
        and(
          eq(onboardingInstances.agentUserId, ctx.user.id),
          eq(onboardingInstances.status, "in_progress")
        )
      );
    return { active: Number(result?.count ?? 0) > 0 };
  }),

  // ─── Bulk Due Date Management (admin only) ─────────────────────────────────

  /** Shift all due dates on an instance by N days (positive = extend, negative = shorten) */
  bulkExtendDueDates: protectedProcedure
    .input(
      z.object({
        instanceId: z.number(),
        days: z.number().min(-365).max(365),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDatabase();
      // Verify instance exists
      const [instance] = await db
        .select()
        .from(onboardingInstances)
        .where(eq(onboardingInstances.id, input.instanceId));
      if (!instance) throw new TRPCError({ code: "NOT_FOUND" });
      // Update all tasks that have a dueDate
      await db.execute(
        sql`UPDATE onboarding_instance_tasks SET dueDate = DATE_ADD(dueDate, INTERVAL ${input.days} DAY) WHERE instanceId = ${input.instanceId} AND dueDate IS NOT NULL`
      );
      await db.execute(
        sql`UPDATE tasks t INNER JOIN onboarding_instance_tasks oit ON oit.linkedTaskId = t.id SET t.dueDate = DATE_ADD(t.dueDate, INTERVAL ${input.days} DAY) WHERE oit.instanceId = ${input.instanceId} AND t.dueDate IS NOT NULL`
      );
      return { success: true };
    }),

  /** Update a single instance task's due date */
  updateTaskDueDate: protectedProcedure
    .input(
      z.object({
        taskId: z.number(),
        dueDate: z.string().nullable(), // ISO date string or null to clear
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDatabase();
      const [task] = await db
        .select()
        .from(onboardingInstanceTasks)
        .where(eq(onboardingInstanceTasks.id, input.taskId));
      if (!task) throw new TRPCError({ code: "NOT_FOUND" });
      const dueDate = input.dueDate ? new Date(input.dueDate) : null;
      await db
        .update(onboardingInstanceTasks)
        .set({
          dueDate,
        })
        .where(eq(onboardingInstanceTasks.id, input.taskId));
      if (task.linkedTaskId) {
        await db
          .update(tasksTable)
          .set({ dueDate })
          .where(eq(tasksTable.id, task.linkedTaskId));
      }
      return { success: true };
    }),

  // ─── Overdue Alert Audience (admin only) ───────────────────────────────────

  getOverdueAlertSettings: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
    const db = await getDatabase();
    const [notificationSetting] = await db
      .select({ isEnabled: emailNotificationSettings.isEnabled })
      .from(emailNotificationSettings)
      .where(
        eq(emailNotificationSettings.notificationKey, "onboarding_overdue")
      )
      .limit(1);
    const [audienceSetting] = await db
      .select({
        recipientUserIds:
          onboardingOverdueNotificationRecipients.recipientUserIds,
        includeAffectedAgent:
          onboardingOverdueNotificationRecipients.includeAffectedAgent,
      })
      .from(onboardingOverdueNotificationRecipients)
      .orderBy(desc(onboardingOverdueNotificationRecipients.updatedAt))
      .limit(1);

    const savedRecipientIds = Array.from(
      new Set(
        (audienceSetting?.recipientUserIds ?? []).filter(
          (id): id is number => Number.isInteger(id) && id > 0
        )
      )
    );
    const recipients = savedRecipientIds.length
      ? await db
          .select({ id: users.id, name: users.name, email: users.email })
          .from(users)
          .where(
            and(
              inArray(users.id, savedRecipientIds),
              eq(users.role, "admin"),
              eq(users.isActive, true),
              isNotNull(users.email)
            )
          )
      : [];
    const includeAffectedAgent = Boolean(audienceSetting?.includeAffectedAgent);

    return {
      // A legacy email-notification row can be enabled before an audience is
      // configured. Treat that incomplete state as off in the purpose-built UI.
      isEnabled: Boolean(
        notificationSetting?.isEnabled &&
        (recipients.length > 0 || includeAffectedAgent)
      ),
      recipientUserIds: recipients.map(recipient => recipient.id),
      includeAffectedAgent,
      recipients,
    };
  }),

  updateOverdueAlertSettings: protectedProcedure
    .input(
      z.object({
        recipientUserIds: z.array(z.number().int().positive()).max(50),
        includeAffectedAgent: z.boolean(),
        isEnabled: z.boolean(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDatabase();
      const recipientUserIds = Array.from(new Set(input.recipientUserIds));
      if (
        input.isEnabled &&
        recipientUserIds.length === 0 &&
        !input.includeAffectedAgent
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Select at least one admin recipient or include the affected agent before enabling overdue alerts.",
        });
      }

      if (recipientUserIds.length > 0) {
        const activeAdmins = await db
          .select({ id: users.id })
          .from(users)
          .where(
            and(
              inArray(users.id, recipientUserIds),
              eq(users.role, "admin"),
              eq(users.isActive, true),
              isNotNull(users.email)
            )
          );
        if (activeAdmins.length !== recipientUserIds.length) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Every selected recipient must be an active admin user with an email address.",
          });
        }
      }

      const [existingAudience] = await db
        .select({ id: onboardingOverdueNotificationRecipients.id })
        .from(onboardingOverdueNotificationRecipients)
        .orderBy(desc(onboardingOverdueNotificationRecipients.updatedAt))
        .limit(1);
      const audienceValues = {
        recipientUserIds,
        includeAffectedAgent: input.includeAffectedAgent,
        updatedBy: ctx.user.id,
      };
      if (existingAudience) {
        await db
          .update(onboardingOverdueNotificationRecipients)
          .set(audienceValues)
          .where(
            eq(onboardingOverdueNotificationRecipients.id, existingAudience.id)
          );
      } else {
        await db
          .insert(onboardingOverdueNotificationRecipients)
          .values(audienceValues);
      }

      await db
        .insert(emailNotificationSettings)
        .values({
          notificationKey: "onboarding_overdue",
          isEnabled: input.isEnabled,
          updatedBy: ctx.user.id,
        })
        .onDuplicateKeyUpdate({
          set: { isEnabled: input.isEnabled, updatedBy: ctx.user.id },
        });
      return { success: true };
    }),

  /** Manually trigger overdue check (admin only) */
  triggerOverdueCheck: protectedProcedure.mutation(async ({ ctx }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
    await checkOverdueOnboardingTasks();
    return { success: true };
  }),

  // ─── Onboarding Report / Metrics (admin only) ─────────────────────────────

  getReport: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
    const db = await getDatabase();

    // Summary stats
    const [totals] = await db
      .select({
        totalInstances: sql<number>`COUNT(*)`,
        completedInstances: sql<number>`SUM(CASE WHEN ${onboardingInstances.status} = 'completed' THEN 1 ELSE 0 END)`,
        inProgressInstances: sql<number>`SUM(CASE WHEN ${onboardingInstances.status} = 'in_progress' THEN 1 ELSE 0 END)`,
        avgCompletionDays: sql<number>`AVG(CASE WHEN ${onboardingInstances.status} = 'completed' AND ${onboardingInstances.completedAt} IS NOT NULL THEN DATEDIFF(${onboardingInstances.completedAt}, ${onboardingInstances.startedAt}) ELSE NULL END)`,
      })
      .from(onboardingInstances);

    // Overdue task count across all active instances
    const [overdueStats] = await db
      .select({
        overdueTaskCount: sql<number>`COUNT(*)`,
      })
      .from(onboardingInstanceTasks)
      .innerJoin(
        onboardingInstances,
        eq(onboardingInstanceTasks.instanceId, onboardingInstances.id)
      )
      .where(
        and(
          eq(onboardingInstanceTasks.completed, false),
          isNotNull(onboardingInstanceTasks.dueDate),
          lt(onboardingInstanceTasks.dueDate, new Date()),
          eq(onboardingInstances.status, "in_progress")
        )
      );

    // On-time completion rate: tasks completed before or on their due date
    const [onTimeStats] = await db
      .select({
        totalCompletedWithDue: sql<number>`SUM(CASE WHEN ${onboardingInstanceTasks.completed} = true AND ${onboardingInstanceTasks.dueDate} IS NOT NULL THEN 1 ELSE 0 END)`,
        completedOnTime: sql<number>`SUM(CASE WHEN ${onboardingInstanceTasks.completed} = true AND ${onboardingInstanceTasks.dueDate} IS NOT NULL AND ${onboardingInstanceTasks.completedAt} <= ${onboardingInstanceTasks.dueDate} THEN 1 ELSE 0 END)`,
      })
      .from(onboardingInstanceTasks);

    const totalCompletedWithDue = Number(
      onTimeStats?.totalCompletedWithDue ?? 0
    );
    const completedOnTime = Number(onTimeStats?.completedOnTime ?? 0);
    const onTimeRate =
      totalCompletedWithDue > 0
        ? Math.round((completedOnTime / totalCompletedWithDue) * 100)
        : 100;

    // Per-agent breakdown
    const agentBreakdown = await db
      .select({
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
        avgCompletionDays:
          totals?.avgCompletionDays != null
            ? Math.round(Number(totals.avgCompletionDays))
            : null,
        overdueTaskCount: Number(overdueStats?.overdueTaskCount ?? 0),
        onTimeRate,
      },
      agentBreakdown: agentBreakdown.map(a => ({
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
          template: {
            id: onboardingTemplates.id,
            name: onboardingTemplates.name,
            type: onboardingTemplates.type,
          },
          totalTasks:
            sql<number>`(SELECT COUNT(*) FROM onboarding_instance_tasks WHERE instanceId = ${onboardingInstances.id})`.as(
              "totalTasks"
            ),
          completedTasks:
            sql<number>`(SELECT COUNT(*) FROM onboarding_instance_tasks WHERE instanceId = ${onboardingInstances.id} AND completed = true)`.as(
              "completedTasks"
            ),
        })
        .from(onboardingInstances)
        .leftJoin(
          onboardingTemplates,
          eq(onboardingInstances.templateId, onboardingTemplates.id)
        )
        .where(
          and(
            eq(onboardingInstances.agentUserId, input.agentUserId),
            eq(onboardingInstances.status, "in_progress")
          )
        )
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
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You can only complete tasks assigned to you.",
          });
        }
      }
      const completedAt = input.completed ? new Date() : null;
      await db
        .update(onboardingInstanceTasks)
        .set({
          completed: input.completed,
          completedAt,
          completedByUserId: input.completed ? ctx.user.id : null,
        })
        .where(eq(onboardingInstanceTasks.id, input.taskId));

      // Keep the linked standard task in sync when a checklist item is completed
      // directly from the onboarding tracker.
      if (task.linkedTaskId) {
        await db
          .update(tasksTable)
          .set({
            status: input.completed ? "completed" : "pending",
            completedAt,
          })
          .where(eq(tasksTable.id, task.linkedTaskId));
      }

      // Check if all tasks are completed → auto-complete instance
      const [remaining] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(onboardingInstanceTasks)
        .where(
          and(
            eq(onboardingInstanceTasks.instanceId, task.instanceId),
            eq(onboardingInstanceTasks.completed, false)
          )
        );
      if (input.completed && Number(remaining?.count ?? 1) === 0) {
        await db
          .update(onboardingInstances)
          .set({
            status: "completed",
            completedAt: new Date(),
          })
          .where(eq(onboardingInstances.id, task.instanceId));
      } else if (!input.completed) {
        // If unchecking a task, reopen the instance
        await db
          .update(onboardingInstances)
          .set({
            status: "in_progress",
            completedAt: null,
          })
          .where(eq(onboardingInstances.id, task.instanceId));
      }
      return { success: true };
    }),
});
