import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import {
  pmProjects,
  pmProjectCollaborators,
  pmTasks,
  pmTaskComments,
  pmWeeklyUpdates,
  pmProjectActivity,
  pmDepartments,
  pmProjectNotes,
  pmNoteMentions,
  pmNoteReads,
  pmTaskCommentReads,
  users,
} from "../../drizzle/schema";
import { eq, desc, asc, isNull, sql, inArray } from "drizzle-orm";
import { sendTransactionalEmail } from "../_core/resendEmail";
import { invokeLLM } from "../_core/llm";

const OWNER_EMAIL = "tyler@savvy.realty";

function assertPmAccess(ctx: { user: { role: string; email?: string | null } }) {
  if (ctx.user.role !== "admin" && ctx.user.email !== OWNER_EMAIL) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Project management is admin-only." });
  }
}

async function logActivity(
  projectId: number,
  actorId: number,
  action: string,
  detail?: string,
  taskId?: number
) {
  const db = await getDb();
  if (!db) return;
  await db.insert(pmProjectActivity).values({
    projectId,
    taskId: taskId ?? null,
    actorId,
    action,
    detail: detail ?? null,
  });
}

export const pmRouter = router({
  // ── Projects ──────────────────────────────────────────────────────────────

  projects: router({
    list: protectedProcedure
      .input(z.object({
        includeArchived: z.boolean().optional().default(false),
        department: z.string().optional(),
        ownerId: z.number().optional(),
        priority: z.string().optional(),
        status: z.string().optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        assertPmAccess(ctx);
        const db = await getDb();
        if (!db) return [];

        const rows = await db
          .select({
            id: pmProjects.id,
            title: pmProjects.title,
            description: pmProjects.description,
            department: pmProjects.department,
            ownerId: pmProjects.ownerId,
            ownerName: users.name,
            ownerEmail: users.email,
            dueDate: pmProjects.dueDate,
            priority: pmProjects.priority,
            status: pmProjects.status,
            sortOrder: pmProjects.sortOrder,
            archivedAt: pmProjects.archivedAt,
            createdAt: pmProjects.createdAt,
            updatedAt: pmProjects.updatedAt,
          })
          .from(pmProjects)
          .leftJoin(users, eq(pmProjects.ownerId, users.id))
          .orderBy(asc(pmProjects.sortOrder), asc(pmProjects.createdAt));

        let filtered = rows;
        if (!input?.includeArchived) {
          filtered = filtered.filter(r => !r.archivedAt);
        }
        if (input?.department) filtered = filtered.filter(r => r.department === input.department);
        if (input?.ownerId) filtered = filtered.filter(r => r.ownerId === input.ownerId);
        if (input?.priority) filtered = filtered.filter(r => r.priority === input.priority);
        if (input?.status) filtered = filtered.filter(r => r.status === input.status);

        const projectIds = filtered.map(r => r.id);
        if (projectIds.length === 0) return [];

        const taskCounts = await db
          .select({
            projectId: pmTasks.projectId,
            total: sql<number>`count(*)`,
            completed: sql<number>`sum(case when ${pmTasks.completed} = 1 then 1 else 0 end)`,
          })
          .from(pmTasks)
          .where(inArray(pmTasks.projectId, projectIds))
          .groupBy(pmTasks.projectId);

        const latestUpdates = await db
          .select()
          .from(pmWeeklyUpdates)
          .where(inArray(pmWeeklyUpdates.projectId, projectIds))
          .orderBy(desc(pmWeeklyUpdates.createdAt));

        const latestUpdateMap = new Map<number, (typeof latestUpdates)[0]>();
        for (const u of latestUpdates) {
          if (!latestUpdateMap.has(u.projectId)) latestUpdateMap.set(u.projectId, u);
        }

        const taskCountMap = new Map(taskCounts.map(t => [t.projectId, t]));

        return filtered.map(p => ({
          ...p,
          taskTotal: Number(taskCountMap.get(p.id)?.total ?? 0),
          taskCompleted: Number(taskCountMap.get(p.id)?.completed ?? 0),
          latestUpdate: latestUpdateMap.get(p.id) ?? null,
        }));
      }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        assertPmAccess(ctx);
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const [project] = await db
          .select({
            id: pmProjects.id,
            title: pmProjects.title,
            description: pmProjects.description,
            department: pmProjects.department,
            ownerId: pmProjects.ownerId,
            ownerName: users.name,
            ownerEmail: users.email,
            dueDate: pmProjects.dueDate,
            priority: pmProjects.priority,
            status: pmProjects.status,
            sortOrder: pmProjects.sortOrder,
            archivedAt: pmProjects.archivedAt,
            createdAt: pmProjects.createdAt,
            updatedAt: pmProjects.updatedAt,
          })
          .from(pmProjects)
          .leftJoin(users, eq(pmProjects.ownerId, users.id))
          .where(eq(pmProjects.id, input.id))
          .limit(1);

        if (!project) throw new TRPCError({ code: "NOT_FOUND" });

        const collaborators = await db
          .select({ userId: pmProjectCollaborators.userId, name: users.name, email: users.email })
          .from(pmProjectCollaborators)
          .leftJoin(users, eq(pmProjectCollaborators.userId, users.id))
          .where(eq(pmProjectCollaborators.projectId, input.id));

        const tasks = await db
          .select({
            id: pmTasks.id,
            title: pmTasks.title,
            ownerId: pmTasks.ownerId,
            ownerName: users.name,
            dueDate: pmTasks.dueDate,
            priority: pmTasks.priority,
            completed: pmTasks.completed,
            completedAt: pmTasks.completedAt,
            notes: pmTasks.notes,
            sortOrder: pmTasks.sortOrder,
            createdAt: pmTasks.createdAt,
          })
          .from(pmTasks)
          .leftJoin(users, eq(pmTasks.ownerId, users.id))
          .where(eq(pmTasks.projectId, input.id))
          .orderBy(asc(pmTasks.completed), asc(pmTasks.sortOrder), asc(pmTasks.createdAt));

        const weeklyUpdates = await db
          .select({
            id: pmWeeklyUpdates.id,
            updateStatus: pmWeeklyUpdates.updateStatus,
            progressPct: pmWeeklyUpdates.progressPct,
            keyUpdates: pmWeeklyUpdates.keyUpdates,
            blockers: pmWeeklyUpdates.blockers,
            nextSteps: pmWeeklyUpdates.nextSteps,
            authorId: pmWeeklyUpdates.authorId,
            authorName: users.name,
            createdAt: pmWeeklyUpdates.createdAt,
          })
          .from(pmWeeklyUpdates)
          .leftJoin(users, eq(pmWeeklyUpdates.authorId, users.id))
          .where(eq(pmWeeklyUpdates.projectId, input.id))
          .orderBy(desc(pmWeeklyUpdates.createdAt));

        const activity = await db
          .select({
            id: pmProjectActivity.id,
            action: pmProjectActivity.action,
            detail: pmProjectActivity.detail,
            actorId: pmProjectActivity.actorId,
            actorName: users.name,
            taskId: pmProjectActivity.taskId,
            createdAt: pmProjectActivity.createdAt,
          })
          .from(pmProjectActivity)
          .leftJoin(users, eq(pmProjectActivity.actorId, users.id))
          .where(eq(pmProjectActivity.projectId, input.id))
          .orderBy(desc(pmProjectActivity.createdAt))
          .limit(50);

        return { ...project, collaborators, tasks, weeklyUpdates, activity };
      }),

    create: protectedProcedure
      .input(z.object({
        title: z.string().min(1),
        description: z.string().min(1),
        department: z.string().min(1),
        ownerId: z.number(),
        dueDate: z.date(),
        priority: z.enum(["high", "medium", "low"]).default("medium"),
        collaboratorIds: z.array(z.number()).optional().default([]),
      }))
      .mutation(async ({ ctx, input }) => {
        assertPmAccess(ctx);
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const [result] = await db.insert(pmProjects).values({
          title: input.title,
          description: input.description,
          department: input.department,
          ownerId: input.ownerId,
          dueDate: input.dueDate,
          priority: input.priority,
          status: "not_started",
        });
        const projectId = result.insertId;
        if (input.collaboratorIds.length > 0) {
          await db.insert(pmProjectCollaborators).values(
            input.collaboratorIds.map(uid => ({ projectId, userId: uid }))
          );
        }
        await logActivity(projectId, ctx.user.id, "project_created", `Created project "${input.title}"`);
        return { id: projectId };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().min(1).optional(),
        description: z.string().optional(),
        department: z.string().optional(),
        ownerId: z.number().optional(),
        dueDate: z.date().optional(),
        priority: z.enum(["high", "medium", "low"]).optional(),
        status: z.enum(["not_started", "in_progress", "at_risk", "completed"]).optional(),
        collaboratorIds: z.array(z.number()).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        assertPmAccess(ctx);
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const { id, collaboratorIds, ...fields } = input;
        if (Object.keys(fields).length > 0) {
          await db.update(pmProjects).set(fields).where(eq(pmProjects.id, id));
        }
        if (collaboratorIds !== undefined) {
          await db.delete(pmProjectCollaborators).where(eq(pmProjectCollaborators.projectId, id));
          if (collaboratorIds.length > 0) {
            await db.insert(pmProjectCollaborators).values(
              collaboratorIds.map(uid => ({ projectId: id, userId: uid }))
            );
          }
        }
        await logActivity(id, ctx.user.id, "project_updated", "Updated project fields");
        return { success: true };
      }),

    archive: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        assertPmAccess(ctx);
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db.update(pmProjects).set({ archivedAt: new Date() }).where(eq(pmProjects.id, input.id));
        await logActivity(input.id, ctx.user.id, "project_archived", "Project archived");
        return { success: true };
      }),

    reorder: protectedProcedure
      .input(z.array(z.object({ id: z.number(), sortOrder: z.number() })))
      .mutation(async ({ ctx, input }) => {
        assertPmAccess(ctx);
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        for (const item of input) {
          await db.update(pmProjects).set({ sortOrder: item.sortOrder }).where(eq(pmProjects.id, item.id));
        }
        return { success: true };
      }),
  }),

  // ── Tasks ─────────────────────────────────────────────────────────────────

  tasks: router({
    create: protectedProcedure
      .input(z.object({
        projectId: z.number(),
        title: z.string().min(1),
        ownerId: z.number(),
        dueDate: z.date(),
        priority: z.enum(["high", "medium", "low"]).default("medium"),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        assertPmAccess(ctx);
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const [result] = await db.insert(pmTasks).values({
          projectId: input.projectId,
          title: input.title,
          ownerId: input.ownerId,
          dueDate: input.dueDate,
          priority: input.priority,
          notes: input.notes ?? null,
        });
        await logActivity(input.projectId, ctx.user.id, "task_created", `Added task "${input.title}"`, result.insertId);
        return { id: result.insertId };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().optional(),
        ownerId: z.number().optional(),
        dueDate: z.date().optional(),
        priority: z.enum(["high", "medium", "low"]).optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        assertPmAccess(ctx);
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const { id, ...fields } = input;
        await db.update(pmTasks).set(fields).where(eq(pmTasks.id, id));
        const [task] = await db.select({ projectId: pmTasks.projectId }).from(pmTasks).where(eq(pmTasks.id, id));
        if (task) await logActivity(task.projectId, ctx.user.id, "task_updated", "Updated task");
        return { success: true };
      }),

    toggleComplete: protectedProcedure
      .input(z.object({ id: z.number(), completed: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        assertPmAccess(ctx);
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db.update(pmTasks).set({
          completed: input.completed,
          completedAt: input.completed ? new Date() : null,
        }).where(eq(pmTasks.id, input.id));
        const [task] = await db.select({ projectId: pmTasks.projectId, title: pmTasks.title }).from(pmTasks).where(eq(pmTasks.id, input.id));
        if (task) {
          await logActivity(task.projectId, ctx.user.id, input.completed ? "task_completed" : "task_reopened", `"${task.title}"`, input.id);
        }
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        assertPmAccess(ctx);
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const [task] = await db.select({ projectId: pmTasks.projectId, title: pmTasks.title }).from(pmTasks).where(eq(pmTasks.id, input.id));
        if (task) await logActivity(task.projectId, ctx.user.id, "task_deleted", `Deleted task "${task.title}"`);
        await db.delete(pmTaskComments).where(eq(pmTaskComments.taskId, input.id));
        await db.delete(pmTasks).where(eq(pmTasks.id, input.id));
        return { success: true };
      }),

    reorder: protectedProcedure
      .input(z.array(z.object({ id: z.number(), sortOrder: z.number() })))
      .mutation(async ({ ctx, input }) => {
        assertPmAccess(ctx);
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        for (const item of input) {
          await db.update(pmTasks).set({ sortOrder: item.sortOrder }).where(eq(pmTasks.id, item.id));
        }
        return { success: true };
      }),

    addComment: protectedProcedure
      .input(z.object({ taskId: z.number(), content: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        assertPmAccess(ctx);
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const [result] = await db.insert(pmTaskComments).values({
          taskId: input.taskId,
          authorId: ctx.user.id,
          content: input.content,
        });
        const [task] = await db.select({ projectId: pmTasks.projectId }).from(pmTasks).where(eq(pmTasks.id, input.taskId));
        if (task) await logActivity(task.projectId, ctx.user.id, "comment_added", "Comment on task", input.taskId);
        return { id: result.insertId };
      }),

    getComments: protectedProcedure
      .input(z.object({ taskId: z.number() }))
      .query(async ({ ctx, input }) => {
        assertPmAccess(ctx);
        const db = await getDb();
        if (!db) return [];
        return db
          .select({
            id: pmTaskComments.id,
            content: pmTaskComments.content,
            authorId: pmTaskComments.authorId,
            authorName: users.name,
            createdAt: pmTaskComments.createdAt,
          })
          .from(pmTaskComments)
          .leftJoin(users, eq(pmTaskComments.authorId, users.id))
          .where(eq(pmTaskComments.taskId, input.taskId))
          .orderBy(asc(pmTaskComments.createdAt));
      }),
  }),

  // ── Weekly Updates ────────────────────────────────────────────────────────

  weeklyUpdates: router({
    submit: protectedProcedure
      .input(z.object({
        projectId: z.number(),
        updateStatus: z.enum(["on_track", "at_risk", "off_track"]),
        progressPct: z.number().min(0).max(100),
        keyUpdates: z.string().min(1),
        blockers: z.string().optional(),
        nextSteps: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        assertPmAccess(ctx);
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const [result] = await db.insert(pmWeeklyUpdates).values({
          projectId: input.projectId,
          authorId: ctx.user.id,
          updateStatus: input.updateStatus,
          progressPct: input.progressPct,
          keyUpdates: input.keyUpdates,
          blockers: input.blockers ?? null,
          nextSteps: input.nextSteps ?? null,
        });
        if (input.updateStatus === "at_risk") {
          await db.update(pmProjects).set({ status: "at_risk" }).where(eq(pmProjects.id, input.projectId));
        }
        await logActivity(input.projectId, ctx.user.id, "weekly_update_submitted", `${input.progressPct}% — ${input.updateStatus}`);
        return { id: result.insertId };
      }),
  }),

  // ── Dashboard ─────────────────────────────────────────────────────────────

  dashboard: router({
    summary: protectedProcedure.query(async ({ ctx }) => {
      assertPmAccess(ctx);
      const db = await getDb();
      if (!db) return {
        overdueProjects: [], atRiskProjects: [], staleProjects: [],
        missingUpdates: [], overdueTasks: [], dueTodayTasks: [],
        myTasks: [], myProjects: [], totalProjects: 0, totalTasks: 0,
      };

      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const allProjects = await db
        .select({
          id: pmProjects.id,
          title: pmProjects.title,
          department: pmProjects.department,
          ownerId: pmProjects.ownerId,
          ownerName: users.name,
          dueDate: pmProjects.dueDate,
          status: pmProjects.status,
          priority: pmProjects.priority,
          updatedAt: pmProjects.updatedAt,
        })
        .from(pmProjects)
        .leftJoin(users, eq(pmProjects.ownerId, users.id))
        .where(isNull(pmProjects.archivedAt));

      const allTasks = await db
        .select({
          id: pmTasks.id,
          title: pmTasks.title,
          projectId: pmTasks.projectId,
          ownerId: pmTasks.ownerId,
          ownerName: users.name,
          dueDate: pmTasks.dueDate,
          completed: pmTasks.completed,
          priority: pmTasks.priority,
        })
        .from(pmTasks)
        .leftJoin(users, eq(pmTasks.ownerId, users.id))
        .where(eq(pmTasks.completed, false));

      const latestUpdates = await db
        .select()
        .from(pmWeeklyUpdates)
        .orderBy(desc(pmWeeklyUpdates.createdAt));

      const latestUpdateMap = new Map<number, (typeof latestUpdates)[0]>();
      for (const u of latestUpdates) {
        if (!latestUpdateMap.has(u.projectId)) latestUpdateMap.set(u.projectId, u);
      }

      type ProjectRow = (typeof allProjects)[0];
      type TaskRow = (typeof allTasks)[0];

      const overdueProjects = allProjects.filter((p: ProjectRow) => p.status !== "completed" && p.dueDate < now);
      const atRiskProjects = allProjects.filter((p: ProjectRow) => p.status === "at_risk");
      const staleProjects = allProjects.filter((p: ProjectRow) => {
        const lu = latestUpdateMap.get(p.id);
        return p.status !== "completed" && (!lu || lu.createdAt < sevenDaysAgo);
      });

      const overdueTasks = allTasks.filter((t: TaskRow) => t.dueDate < now);
      const dueTodayTasks = allTasks.filter((t: TaskRow) => {
        const d = t.dueDate;
        return d >= new Date(now.getFullYear(), now.getMonth(), now.getDate()) &&
               d < new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      });

      const myTasks = allTasks.filter((t: TaskRow) => t.ownerId === ctx.user.id);
      const myProjects = allProjects.filter((p: ProjectRow) => p.ownerId === ctx.user.id);

      return {
        overdueProjects,
        atRiskProjects,
        staleProjects,
        missingUpdates: staleProjects,
        overdueTasks,
        dueTodayTasks,
        myTasks,
        myProjects,
        totalProjects: allProjects.length,
        totalTasks: allTasks.length,
      };
    }),

    aiDebrief: protectedProcedure.mutation(async ({ ctx }) => {
      assertPmAccess(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const allProjects = await db
        .select({ id: pmProjects.id, title: pmProjects.title, department: pmProjects.department, status: pmProjects.status, priority: pmProjects.priority, dueDate: pmProjects.dueDate })
        .from(pmProjects)
        .where(isNull(pmProjects.archivedAt));

      const allTasks = await db
        .select({ id: pmTasks.id, title: pmTasks.title, projectId: pmTasks.projectId, dueDate: pmTasks.dueDate, completed: pmTasks.completed, priority: pmTasks.priority })
        .from(pmTasks)
        .where(eq(pmTasks.completed, false));

      const latestUpdates = await db.select().from(pmWeeklyUpdates).orderBy(desc(pmWeeklyUpdates.createdAt));
      const latestUpdateMap = new Map<number, (typeof latestUpdates)[0]>();
      for (const u of latestUpdates) {
        if (!latestUpdateMap.has(u.projectId)) latestUpdateMap.set(u.projectId, u);
      }

      type PRow = (typeof allProjects)[0];
      type TRow = (typeof allTasks)[0];

      const overdueProjects = allProjects.filter((p: PRow) => p.status !== "completed" && p.dueDate < now);
      const atRisk = allProjects.filter((p: PRow) => p.status === "at_risk");
      const stale = allProjects.filter((p: PRow) => {
        const lu = latestUpdateMap.get(p.id);
        return p.status !== "completed" && (!lu || lu.createdAt < sevenDaysAgo);
      });
      const overdueTasks = allTasks.filter((t: TRow) => t.dueDate < now);

      const prompt = `You are an executive assistant for a real estate brokerage. Today is ${now.toLocaleDateString()}.

Here is the current project management state:

OVERDUE PROJECTS (${overdueProjects.length}):
${overdueProjects.map((p: PRow) => `- ${p.title} (${p.department}, due ${p.dueDate.toLocaleDateString()})`).join("\n") || "None"}

AT RISK PROJECTS (${atRisk.length}):
${atRisk.map((p: PRow) => `- ${p.title} (${p.department})`).join("\n") || "None"}

PROJECTS WITH NO UPDATE IN 7+ DAYS (${stale.length}):
${stale.map((p: PRow) => `- ${p.title} (${p.department})`).join("\n") || "None"}

OVERDUE TASKS (${overdueTasks.length}):
${overdueTasks.slice(0, 10).map((t: TRow) => `- ${t.title} (due ${t.dueDate.toLocaleDateString()})`).join("\n") || "None"}

Generate a concise, action-oriented morning debrief for the CEO. Structure it as:
1. **What Needs Attention Today** (top 3-5 items, most urgent first)
2. **Key Risks** (brief)
3. **What's Falling Behind** (brief)
4. **Suggested Focus Areas** (1-3 items)

Be direct, specific, and use plain language. No fluff.`;

      const response = await invokeLLM({
        messages: [
          { role: "system", content: "You are a concise executive assistant. Respond in markdown." },
          { role: "user", content: prompt },
        ],
      });

      return { debrief: response.choices[0].message.content ?? "" };
    }),

    projectAiSummary: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        assertPmAccess(ctx);
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const [project] = await db
          .select({ id: pmProjects.id, title: pmProjects.title, department: pmProjects.department, status: pmProjects.status, priority: pmProjects.priority, dueDate: pmProjects.dueDate })
          .from(pmProjects)
          .where(eq(pmProjects.id, input.projectId))
          .limit(1);

        if (!project) throw new TRPCError({ code: "NOT_FOUND" });

        const tasks = await db.select().from(pmTasks).where(eq(pmTasks.projectId, input.projectId));
        const updates = await db.select().from(pmWeeklyUpdates).where(eq(pmWeeklyUpdates.projectId, input.projectId)).orderBy(desc(pmWeeklyUpdates.createdAt)).limit(3);

        const completedTasks = tasks.filter(t => t.completed).length;
        const latestUpdate = updates[0];

        const prompt = `Project: ${project.title}
Department: ${project.department}
Status: ${project.status}
Priority: ${project.priority}
Due: ${project.dueDate.toLocaleDateString()}
Tasks: ${completedTasks}/${tasks.length} completed

Latest Weekly Update: ${latestUpdate ? `${latestUpdate.updateStatus} — ${latestUpdate.keyUpdates}` : "None submitted"}
Blockers: ${latestUpdate?.blockers ?? "None reported"}
Next Steps: ${latestUpdate?.nextSteps ?? "Not specified"}

Write a 3-4 sentence AI summary of this project's current state, progress, and key risks. Be direct and factual.`;

        const response = await invokeLLM({
          messages: [
            { role: "system", content: "You are a concise project analyst. Respond in markdown." },
            { role: "user", content: prompt },
          ],
        });

        return { summary: response.choices[0].message.content ?? "" };
      }),
  }),

  //   // ── Departments (managed table) ──────────────────────────────────────────

  departments: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      assertPmAccess(ctx);
      const db = await getDb();
      if (!db) return [];
      const rows = await db.select().from(pmDepartments).orderBy(asc(pmDepartments.name));
      // Attach project counts
      const projects = await db.select({ department: pmProjects.department }).from(pmProjects);
      const countMap: Record<string, number> = {};
      for (const p of projects) {
        if (p.department) countMap[p.department] = (countMap[p.department] ?? 0) + 1;
      }
      return rows.map(r => ({ ...r, projectCount: countMap[r.name] ?? 0 }));
    }),

    create: protectedProcedure
      .input(z.object({ name: z.string().min(1).max(128) }))
      .mutation(async ({ ctx, input }) => {
        assertPmAccess(ctx);
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const existing = await db.select().from(pmDepartments).where(eq(pmDepartments.name, input.name)).limit(1);
        if (existing.length > 0) return { id: existing[0].id, name: existing[0].name };
        const [result] = await db.insert(pmDepartments).values({ name: input.name });
        return { id: result.insertId, name: input.name };
      }),

    rename: protectedProcedure
      .input(z.object({ id: z.number(), name: z.string().min(1).max(128) }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        // Get old name to update projects
        const [old] = await db.select().from(pmDepartments).where(eq(pmDepartments.id, input.id)).limit(1);
        if (!old) throw new TRPCError({ code: "NOT_FOUND" });
        await db.update(pmDepartments).set({ name: input.name }).where(eq(pmDepartments.id, input.id));
        // Update all projects that used the old department name
        await db.update(pmProjects).set({ department: input.name }).where(eq(pmProjects.department, old.name));
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        // Get the department name to clear from projects
        const [dept] = await db.select().from(pmDepartments).where(eq(pmDepartments.id, input.id)).limit(1);
        if (dept) {
          // Clear department from projects using this department
          await db.update(pmProjects).set({ department: "" }).where(eq(pmProjects.department, dept.name));
        }
        await db.delete(pmDepartments).where(eq(pmDepartments.id, input.id));
        return { success: true };
      }),
  }),

  // ── Collaborators ──────────────────────────────────────────────────────

  collaborators: router({
    listForProject: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ ctx, input }) => {
        assertPmAccess(ctx);
        const db = await getDb();
        if (!db) return [];
        return db
          .select({ userId: pmProjectCollaborators.userId, name: users.name, email: users.email })
          .from(pmProjectCollaborators)
          .leftJoin(users, eq(pmProjectCollaborators.userId, users.id))
          .where(eq(pmProjectCollaborators.projectId, input.projectId));
      }),

    add: protectedProcedure
      .input(z.object({ projectId: z.number(), userId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        assertPmAccess(ctx);
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const existing = await db.select().from(pmProjectCollaborators)
          .where(eq(pmProjectCollaborators.projectId, input.projectId))
          .limit(100);
        if (existing.some(e => e.userId === input.userId)) return { success: true };
        await db.insert(pmProjectCollaborators).values({ projectId: input.projectId, userId: input.userId });
        await logActivity(input.projectId, ctx.user.id, "collaborator_added", `Added collaborator`);
        return { success: true };
      }),

    remove: protectedProcedure
      .input(z.object({ projectId: z.number(), userId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        assertPmAccess(ctx);
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db.delete(pmProjectCollaborators)
          .where(eq(pmProjectCollaborators.projectId, input.projectId));
        await logActivity(input.projectId, ctx.user.id, "collaborator_removed", `Removed collaborator`);
        return { success: true };
      }),
  }),

  // ── Project Notes (with @mentions) ──────────────────────────────────────

  notes: router({
    list: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ ctx, input }) => {
        assertPmAccess(ctx);
        const db = await getDb();
        if (!db) return [];

        const notes = await db
          .select({
            id: pmProjectNotes.id,
            content: pmProjectNotes.content,
            authorId: pmProjectNotes.authorId,
            authorName: users.name,
            createdAt: pmProjectNotes.createdAt,
            updatedAt: pmProjectNotes.updatedAt,
          })
          .from(pmProjectNotes)
          .leftJoin(users, eq(pmProjectNotes.authorId, users.id))
          .where(eq(pmProjectNotes.projectId, input.projectId))
          .orderBy(desc(pmProjectNotes.createdAt));

        if (notes.length === 0) return [];
        const noteIds = notes.map(n => n.id);

        // Fetch read status for current user
        const reads = await db
          .select()
          .from(pmNoteReads)
          .where(inArray(pmNoteReads.noteId, noteIds));

        const myReads = new Map(reads.filter(r => r.userId === ctx.user.id).map(r => [r.noteId, r]));

        // Fetch mentions per note
        const mentions = await db
          .select({ noteId: pmNoteMentions.noteId, userId: pmNoteMentions.mentionedUserId, name: users.name })
          .from(pmNoteMentions)
          .leftJoin(users, eq(pmNoteMentions.mentionedUserId, users.id))
          .where(inArray(pmNoteMentions.noteId, noteIds));

        const mentionMap = new Map<number, { userId: number; name: string | null }[]>();
        for (const m of mentions) {
          if (!mentionMap.has(m.noteId)) mentionMap.set(m.noteId, []);
          mentionMap.get(m.noteId)!.push({ userId: m.userId, name: m.name });
        }

        return notes.map(n => {
          const myRead = myReads.get(n.id);
          const isUnread = !myRead || myRead.markedUnread;
          return { ...n, mentions: mentionMap.get(n.id) ?? [], isUnread };
        });
      }),

    create: protectedProcedure
      .input(z.object({
        projectId: z.number(),
        content: z.string().min(1),
        mentionedUserIds: z.array(z.number()).optional().default([]),
      }))
      .mutation(async ({ ctx, input }) => {
        assertPmAccess(ctx);
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const [result] = await db.insert(pmProjectNotes).values({
          projectId: input.projectId,
          authorId: ctx.user.id,
          content: input.content,
        });
        const noteId = result.insertId;

        if (input.mentionedUserIds.length > 0) {
          await db.insert(pmNoteMentions).values(
            input.mentionedUserIds.map(uid => ({ noteId, mentionedUserId: uid }))
          );
        }

        // Auto-mark as read for the author
        await db.insert(pmNoteReads).values({ noteId, userId: ctx.user.id, markedUnread: false });

        await logActivity(input.projectId, ctx.user.id, "note_added", "Added a note");

        // Send @mention email notifications (fire-and-forget)
        if (input.mentionedUserIds.length > 0) {
          try {
            const [project] = await db.select({ title: pmProjects.title }).from(pmProjects).where(eq(pmProjects.id, input.projectId)).limit(1);
            const mentionedUsers = await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, input.mentionedUserIds));
            const authorName = ctx.user.name ?? ctx.user.email ?? "A teammate";
            const projectTitle = project?.title ?? "a project";
            const projectUrl = `${process.env.VITE_FRONTEND_FORGE_API_URL ? "" : "https://savvyos-rgtcxhr8.manus.space"}/projects/${input.projectId}`;
            for (const u of mentionedUsers) {
              if (!u.email || u.id === ctx.user.id) continue;
              await sendTransactionalEmail("pm_mention", {
                recipientEmail: u.email,
                recipientName: u.name ?? undefined,
                mentionedByName: authorName,
                projectTitle,
                noteContent: input.content.slice(0, 300) + (input.content.length > 300 ? "..." : ""),
                projectUrl: `https://savvyos-rgtcxhr8.manus.space/projects/${input.projectId}`,
              });
            }
          } catch (emailErr) {
            console.warn("[PM] Failed to send mention emails:", emailErr);
          }
        }

        return { id: noteId };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        assertPmAccess(ctx);
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const [note] = await db.select({ projectId: pmProjectNotes.projectId, authorId: pmProjectNotes.authorId })
          .from(pmProjectNotes).where(eq(pmProjectNotes.id, input.id)).limit(1);
        if (!note) throw new TRPCError({ code: "NOT_FOUND" });
        if (note.authorId !== ctx.user.id && ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Can only delete your own notes" });
        }
        await db.delete(pmNoteReads).where(eq(pmNoteReads.noteId, input.id));
        await db.delete(pmNoteMentions).where(eq(pmNoteMentions.noteId, input.id));
        await db.delete(pmProjectNotes).where(eq(pmProjectNotes.id, input.id));
        return { success: true };
      }),

    markRead: protectedProcedure
      .input(z.object({ noteId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        assertPmAccess(ctx);
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const existing = await db.select().from(pmNoteReads)
          .where(eq(pmNoteReads.noteId, input.noteId)).limit(100);
        const myRead = existing.find(r => r.userId === ctx.user.id);
        if (myRead) {
          await db.update(pmNoteReads).set({ markedUnread: false, readAt: new Date() })
            .where(eq(pmNoteReads.id, myRead.id));
        } else {
          await db.insert(pmNoteReads).values({ noteId: input.noteId, userId: ctx.user.id, markedUnread: false });
        }
        return { success: true };
      }),

    markUnread: protectedProcedure
      .input(z.object({ noteId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        assertPmAccess(ctx);
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const existing = await db.select().from(pmNoteReads)
          .where(eq(pmNoteReads.noteId, input.noteId)).limit(100);
        const myRead = existing.find(r => r.userId === ctx.user.id);
        if (myRead) {
          await db.update(pmNoteReads).set({ markedUnread: true }).where(eq(pmNoteReads.id, myRead.id));
        } else {
          await db.insert(pmNoteReads).values({ noteId: input.noteId, userId: ctx.user.id, markedUnread: true });
        }
        return { success: true };
      }),
  }),

  // ── Inbox (unread notes + task comments) ────────────────────────────────

  inbox: router({
    unreadCount: protectedProcedure.query(async ({ ctx }) => {
      assertPmAccess(ctx);
      const db = await getDb();
      if (!db) return { count: 0 };

      // Unread project notes: notes on projects where I'm owner or collaborator,
      // that I haven't read or have marked unread
      const myProjects = await db
        .select({ id: pmProjects.id })
        .from(pmProjects)
        .where(eq(pmProjects.ownerId, ctx.user.id));

      const myCollabProjects = await db
        .select({ projectId: pmProjectCollaborators.projectId })
        .from(pmProjectCollaborators)
        .where(eq(pmProjectCollaborators.userId, ctx.user.id));

      const myMentionedNotes = await db
        .select({ noteId: pmNoteMentions.noteId })
        .from(pmNoteMentions)
        .where(eq(pmNoteMentions.mentionedUserId, ctx.user.id));

      const projectIds = Array.from(new Set([
        ...myProjects.map(p => p.id),
        ...myCollabProjects.map(p => p.projectId),
      ]));

      let unreadNoteCount = 0;
      if (projectIds.length > 0 || myMentionedNotes.length > 0) {
        const allNotes = projectIds.length > 0
          ? await db.select({ id: pmProjectNotes.id, authorId: pmProjectNotes.authorId })
              .from(pmProjectNotes)
              .where(inArray(pmProjectNotes.projectId, projectIds))
          : [];

        const mentionedNoteIds = myMentionedNotes.map(m => m.noteId);
        const allRelevantNoteIds = Array.from(new Set([
          ...allNotes.filter(n => n.authorId !== ctx.user.id).map(n => n.id),
          ...mentionedNoteIds,
        ]));

        if (allRelevantNoteIds.length > 0) {
          const reads = await db.select().from(pmNoteReads)
            .where(inArray(pmNoteReads.noteId, allRelevantNoteIds));
          const myReads = new Map(reads.filter(r => r.userId === ctx.user.id).map(r => [r.noteId, r]));
          unreadNoteCount = allRelevantNoteIds.filter(id => {
            const r = myReads.get(id);
            return !r || r.markedUnread;
          }).length;
        }
      }

      // Unread task comments: comments on tasks in my projects (excluding my own comments)
      let unreadCommentCount = 0;
      if (projectIds.length > 0) {
        const myTasks = await db.select({ id: pmTasks.id })
          .from(pmTasks)
          .where(inArray(pmTasks.projectId, projectIds));
        if (myTasks.length > 0) {
          const taskIds = myTasks.map(t => t.id);
          const comments = await db.select({ id: pmTaskComments.id, authorId: pmTaskComments.authorId })
            .from(pmTaskComments)
            .where(inArray(pmTaskComments.taskId, taskIds));
          const otherComments = comments.filter(c => c.authorId !== ctx.user.id);
          if (otherComments.length > 0) {
            const commentIds = otherComments.map(c => c.id);
            const reads = await db.select().from(pmTaskCommentReads)
              .where(inArray(pmTaskCommentReads.commentId, commentIds));
            const myReads = new Map(reads.filter(r => r.userId === ctx.user.id).map(r => [r.commentId, r]));
            unreadCommentCount = commentIds.filter(id => {
              const r = myReads.get(id);
              return !r || r.markedUnread;
            }).length;
          }
        }
      }

      return { count: unreadNoteCount + unreadCommentCount };
    }),

    list: protectedProcedure.query(async ({ ctx }) => {
      assertPmAccess(ctx);
      const db = await getDb();
      if (!db) return [];

      // Get projects I'm involved in
      const myProjects = await db.select({ id: pmProjects.id, title: pmProjects.title })
        .from(pmProjects).where(eq(pmProjects.ownerId, ctx.user.id));
      const myCollabProjects = await db
        .select({ projectId: pmProjectCollaborators.projectId })
        .from(pmProjectCollaborators)
        .where(eq(pmProjectCollaborators.userId, ctx.user.id));
      const myMentionedNotes = await db
        .select({ noteId: pmNoteMentions.noteId })
        .from(pmNoteMentions)
        .where(eq(pmNoteMentions.mentionedUserId, ctx.user.id));

      const projectIds = Array.from(new Set([
        ...myProjects.map(p => p.id),
        ...myCollabProjects.map(p => p.projectId),
      ]));

      const projectTitleMap = new Map(myProjects.map(p => [p.id, p.title]));

      const items: {
        type: "note" | "comment";
        id: number;
        projectId: number;
        projectTitle: string;
        authorName: string | null;
        content: string;
        createdAt: Date;
        isUnread: boolean;
        markedUnread: boolean;
      }[] = [];

      // Project notes
      if (projectIds.length > 0 || myMentionedNotes.length > 0) {
        const allNotes = projectIds.length > 0
          ? await db
              .select({
                id: pmProjectNotes.id,
                projectId: pmProjectNotes.projectId,
                content: pmProjectNotes.content,
                authorId: pmProjectNotes.authorId,
                authorName: users.name,
                createdAt: pmProjectNotes.createdAt,
              })
              .from(pmProjectNotes)
              .leftJoin(users, eq(pmProjectNotes.authorId, users.id))
              .where(inArray(pmProjectNotes.projectId, projectIds))
              .orderBy(desc(pmProjectNotes.createdAt))
          : [];

        const mentionedNoteIds = myMentionedNotes.map(m => m.noteId);
        const relevantNotes = allNotes.filter(n => n.authorId !== ctx.user.id || mentionedNoteIds.includes(n.id));

        if (relevantNotes.length > 0) {
          const noteIds = relevantNotes.map(n => n.id);
          const reads = await db.select().from(pmNoteReads).where(inArray(pmNoteReads.noteId, noteIds));
          const myReads = new Map(reads.filter(r => r.userId === ctx.user.id).map(r => [r.noteId, r]));

          for (const note of relevantNotes) {
            const myRead = myReads.get(note.id);
            const isUnread = !myRead || myRead.markedUnread;
            items.push({
              type: "note",
              id: note.id,
              projectId: note.projectId,
              projectTitle: projectTitleMap.get(note.projectId) ?? "Unknown Project",
              authorName: note.authorName,
              content: note.content,
              createdAt: note.createdAt,
              isUnread,
              markedUnread: myRead?.markedUnread ?? true,
            });
          }
        }
      }

      // Task comments
      if (projectIds.length > 0) {
        const myTasksWithProject = await db
          .select({ id: pmTasks.id, projectId: pmTasks.projectId })
          .from(pmTasks)
          .where(inArray(pmTasks.projectId, projectIds));

        if (myTasksWithProject.length > 0) {
          const taskIds = myTasksWithProject.map(t => t.id);
          const taskProjectMap = new Map(myTasksWithProject.map(t => [t.id, t.projectId]));

          const comments = await db
            .select({
              id: pmTaskComments.id,
              taskId: pmTaskComments.taskId,
              content: pmTaskComments.content,
              authorId: pmTaskComments.authorId,
              authorName: users.name,
              createdAt: pmTaskComments.createdAt,
            })
            .from(pmTaskComments)
            .leftJoin(users, eq(pmTaskComments.authorId, users.id))
            .where(inArray(pmTaskComments.taskId, taskIds))
            .orderBy(desc(pmTaskComments.createdAt));

          const otherComments = comments.filter(c => c.authorId !== ctx.user.id);
          if (otherComments.length > 0) {
            const commentIds = otherComments.map(c => c.id);
            const reads = await db.select().from(pmTaskCommentReads).where(inArray(pmTaskCommentReads.commentId, commentIds));
            const myReads = new Map(reads.filter(r => r.userId === ctx.user.id).map(r => [r.commentId, r]));

            for (const comment of otherComments) {
              const myRead = myReads.get(comment.id);
              const isUnread = !myRead || myRead.markedUnread;
              const projectId = taskProjectMap.get(comment.taskId) ?? 0;
              items.push({
                type: "comment",
                id: comment.id,
                projectId,
                projectTitle: projectTitleMap.get(projectId) ?? "Unknown Project",
                authorName: comment.authorName,
                content: comment.content,
                createdAt: comment.createdAt,
                isUnread,
                markedUnread: myRead?.markedUnread ?? true,
              });
            }
          }
        }
      }

      return items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }),

    markCommentRead: protectedProcedure
      .input(z.object({ commentId: z.number(), markedUnread: z.boolean().optional().default(false) }))
      .mutation(async ({ ctx, input }) => {
        assertPmAccess(ctx);
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const existing = await db.select().from(pmTaskCommentReads)
          .where(eq(pmTaskCommentReads.commentId, input.commentId)).limit(100);
        const myRead = existing.find(r => r.userId === ctx.user.id);
        if (myRead) {
          await db.update(pmTaskCommentReads)
            .set({ markedUnread: input.markedUnread, readAt: new Date() })
            .where(eq(pmTaskCommentReads.id, myRead.id));
        } else {
          await db.insert(pmTaskCommentReads).values({
            commentId: input.commentId,
            userId: ctx.user.id,
            markedUnread: input.markedUnread,
          });
        }
        return { success: true };
      }),
  }),
});
