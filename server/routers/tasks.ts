import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTask, getTasks, getAllTasks, logActivity, updateTask, getTaskNotes, createTaskNote, getTaskById, getMyOverdueTaskCount } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { sendEmailAlert } from "../_core/emailAlerts";
import { tasks as tasksTable } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

export const tasksRouter = router({
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return getTaskById(input.id);
    }),

  list: protectedProcedure
    .input(z.object({
      assignedToId: z.number().optional(),
      status: z.string().optional(),
      relatedContactId: z.number().optional(),
      relatedTransactionId: z.number().optional(),
      dueDateFrom: z.string().optional(),
      dueDateTo: z.string().optional(),
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(25),
    }))
    .query(async ({ input, ctx }) => {
      const assignedToId = ctx.user.role !== "admin" ? ctx.user.id : input.assignedToId;
      return getTasks(
        assignedToId,
        input.status,
        input.relatedContactId,
        input.relatedTransactionId,
        input.page,
        input.limit,
        input.dueDateFrom ? new Date(input.dueDateFrom) : undefined,
        input.dueDateTo ? new Date(input.dueDateTo) : undefined,
      );
    }),

  listAll: protectedProcedure
    .input(z.object({
      assignedToId: z.number().optional(),
      status: z.string().optional(),
      createdFrom: z.string().optional(),
      createdTo: z.string().optional(),
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(50),
    }).optional())
    .query(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      return getAllTasks({
        assignedToId: input?.assignedToId,
        status: input?.status,
        createdFrom: input?.createdFrom ? new Date(input.createdFrom) : undefined,
        createdTo: input?.createdTo ? new Date(input.createdTo) : undefined,
        page: input?.page ?? 1,
        limit: input?.limit ?? 50,
      });
    }),

  create: protectedProcedure
    .input(z.object({
      title: z.string().min(1),
      description: z.string().optional().nullable(),
      assignedToId: z.number().optional().nullable(),
      relatedContactId: z.number().optional().nullable(),
      relatedTransactionId: z.number().optional().nullable(),
      relatedPropertyId: z.number().optional().nullable(),
      relatedAgentConnectionId: z.number().optional().nullable(),
      priority: z.enum(["low","medium","high","urgent"]).optional(),
      taskType: z.enum(["follow_up","outreach","document","call","email","meeting","review","payout","other"]).optional(),
      dueDate: z.string().optional().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      const id = await createTask({
        ...input,
        createdById: ctx.user.id,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
      } as any);

      // Send email alert to assigned user
      if (input.assignedToId && input.assignedToId !== ctx.user.id) {
        try {
          await sendEmailAlert("task_assigned", input.assignedToId, {
            taskTitle: input.title,
            dueDate: input.dueDate ? new Date(input.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : undefined,
          });
        } catch (_) {}
      }

      await logActivity({
        userId: ctx.user.id,
        action: "task_created",
        entityType: "task",
        entityId: id,
        details: { title: input.title },
      });
      return { id };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      data: z.object({
        title: z.string().optional(),
        description: z.string().optional().nullable(),
        assignedToId: z.number().optional().nullable(),
        priority: z.enum(["low","medium","high","urgent"]).optional(),
        status: z.enum(["pending","in_progress","completed","cancelled"]).optional(),
        dueDate: z.string().optional().nullable(),
        completedAt: z.string().optional().nullable(),
      }),
    }))
    .mutation(async ({ input, ctx }) => {
      const { dueDate, completedAt, ...rest } = input.data;
      const updateData: any = {
        ...rest,
        dueDate: dueDate ? new Date(dueDate) : undefined,
        completedAt: completedAt ? new Date(completedAt) : undefined,
      };
      if (input.data.status === "completed" && !completedAt) {
        updateData.completedAt = new Date();
      }
      await updateTask(input.id, updateData);
      await logActivity({
        userId: ctx.user.id,
        action: "task_updated",
        entityType: "task",
        entityId: input.id,
        details: { status: input.data.status },
      });
      return { success: true };
    }),

  complete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      // Admin cannot mark tasks complete for other users
      const { getDb } = await import("../db");
      const db = await getDb();
      if (db) {
        const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, input.id)).limit(1);
        if (task && task.assignedToId !== ctx.user.id && ctx.user.role === "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Admins cannot mark tasks complete for other users" });
        }
      }
      await updateTask(input.id, { status: "completed", completedAt: new Date() });
      await logActivity({ userId: ctx.user.id, action: "task_completed", entityType: "task", entityId: input.id });
      return { success: true };
    }),

  // ─── Overdue count for badge ─────────────────────────────────────────────
  myOverdueCount: protectedProcedure
    .query(async ({ ctx }) => {
      return { count: await getMyOverdueTaskCount(ctx.user.id) };
    }),

  // ─── Task Notes ──────────────────────────────────────────────────────────
  getNotes: protectedProcedure
    .input(z.object({ taskId: z.number() }))
    .query(async ({ input }) => {
      return getTaskNotes(input.taskId);
    }),

  addNote: protectedProcedure
    .input(z.object({
      taskId: z.number(),
      content: z.string().min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const id = await createTaskNote({
        taskId: input.taskId,
        authorId: ctx.user.id,
        content: input.content,
      });
      return { id };
    }),
});
