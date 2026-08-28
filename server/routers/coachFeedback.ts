import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { canAdminUsePermission } from "./permissions";
import {
  assertCoachFeedbackDashboardAccess,
  checkPublicCoachFeedbackSubmissionRateLimit,
  coachFeedbackPublicTokenMinLength,
  getCoachFeedbackRequestIp,
  getPublicCoachFeedback,
  submitPublicCoachFeedback,
} from "../coachingFeedback";
import { buildCoachFeedbackDashboard, listCoachFeedbackHistory } from "../coachFeedbackDashboard";

const dashboardFilterInput = z.object({
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  includeTest: z.boolean().optional(),
});

const feedbackInput = z.object({
  token: z.string().min(coachFeedbackPublicTokenMinLength).max(128),
  overallRating: z.number().int().min(1).max(5),
  prioritiesRating: z.number().int().min(1).max(5),
  clarityRating: z.number().int().min(1).max(5),
  supportRating: z.number().int().min(1).max(5),
  helpfulComment: z.string().trim().max(3000).optional(),
  improvementComment: z.string().trim().max(3000).optional(),
  additionalComment: z.string().trim().max(3000).optional(),
  _hp: z.string().max(0, "Bot detected").optional(),
});

export const coachFeedbackRouter = router({
  /** Leadership-only aggregate view with an authorized date range and optional test submissions. */
  getDashboard: protectedProcedure.input(dashboardFilterInput.optional()).query(async ({ ctx, input }) => {
    const allowed = await canAdminUsePermission(ctx.user, "canViewCoachFeedback");
    assertCoachFeedbackDashboardAccess(ctx.user, allowed);
    return buildCoachFeedbackDashboard(input);
  }),

  /** Detailed anonymous responses, visible only within the same designated leadership permission. */
  getHistory: protectedProcedure.input(dashboardFilterInput.optional()).query(async ({ ctx, input }) => {
    const allowed = await canAdminUsePermission(ctx.user, "canViewCoachFeedback");
    assertCoachFeedbackDashboardAccess(ctx.user, allowed);
    return listCoachFeedbackHistory(input);
  }),

  /** Public one-time survey view. No authenticated SavvyOS session is required. */
  getPublic: publicProcedure
    .input(z.object({ token: z.string().min(coachFeedbackPublicTokenMinLength).max(128) }))
    .query(async ({ input }) => getPublicCoachFeedback(input.token)),

  /** Public one-time survey submission. The resulting response is stored separately from invitation identity. */
  submitPublic: publicProcedure
    .input(feedbackInput)
    .mutation(async ({ input, ctx }) => {
      if (input._hp) return { status: "submitted" as const };
      checkPublicCoachFeedbackSubmissionRateLimit(getCoachFeedbackRequestIp(ctx));
      return submitPublicCoachFeedback(input);
    }),
});
