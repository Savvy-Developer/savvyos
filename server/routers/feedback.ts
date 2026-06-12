import { z } from "zod";
import {
  createFeedback,
  getFeedback,
  getFeedbackByUser,
  getFeedbackCount,
  updateFeedbackStatus,
} from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";

export const feedbackRouter = router({
  /** List all feedback (admin only) */
  list: protectedProcedure
    .input(z.object({
      status: z.string().optional(),
      type: z.string().optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      return getFeedback(input?.status, input?.type);
    }),

  /** List feedback submitted by the current user */
  myFeedback: protectedProcedure
    .query(async ({ ctx }) => {
      return getFeedbackByUser(ctx.user.id);
    }),

  /** Count pending feedback (for admin badge) */
  pendingCount: protectedProcedure
    .query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") return 0;
      return getFeedbackCount("pending");
    }),

  /** Submit new feedback */
  create: protectedProcedure
    .input(z.object({
      type: z.enum(["bug", "feature"]),
      title: z.string().min(1).max(255),
      description: z.string().min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const id = await createFeedback({
        type: input.type,
        title: input.title,
        description: input.description,
        userId: ctx.user.id,
      });
      return { id };
    }),

  /** Update feedback status (admin only) */
  updateStatus: protectedProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["pending", "approved", "denied", "in_progress", "completed"]),
      adminNotes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      await updateFeedbackStatus(input.id, input.status, input.adminNotes);
      return { success: true };
    }),
});
