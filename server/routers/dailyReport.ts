import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { buildDailyAgentReport, getSavedDailyAgentReport } from "../dailyAgentReportScheduler";
import { protectedProcedure, router } from "../_core/trpc";

function requireAgent(role: string): void {
  if (role !== "agent") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Daily reports are available to agent accounts.",
    });
  }
}

export const dailyReportRouter = router({
  /** A current, agent-scoped operational view. Email runs add AI suggestions; this view stays live and deterministic. */
  getLive: protectedProcedure.query(async ({ ctx }) => {
    requireAgent(ctx.user.role);
    return buildDailyAgentReport(
      { id: ctx.user.id, name: ctx.user.name, email: ctx.user.email },
      new Date(),
      false
    );
  }),

  /** Return the email snapshot for a specific date when a user needs to revisit what was delivered. */
  getSaved: protectedProcedure
    .input(z.object({ reportDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
    .query(async ({ ctx, input }) => {
      requireAgent(ctx.user.role);
      return getSavedDailyAgentReport(ctx.user.id, input.reportDate);
    }),
});
