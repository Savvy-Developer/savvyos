import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  marketProfileFeedbackRequests,
  marketProfileSources,
  marketProfiles,
  users,
} from "../../drizzle/schema";
import { refreshMarketIntelligence } from "../agentMarketsIntelligence";
import { getDb, logActivity } from "../db";
import { protectedProcedure, router } from "../_core/trpc";

async function getFeedbackRequest(requestId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
  const [request] = await db
    .select({
      id: marketProfileFeedbackRequests.id,
      agentId: marketProfileFeedbackRequests.agentId,
      marketProfileId: marketProfileFeedbackRequests.marketProfileId,
      profileJson: marketProfileFeedbackRequests.profileJson,
      changeSummary: marketProfileFeedbackRequests.changeSummary,
      feedbackText: marketProfileFeedbackRequests.feedbackText,
      emailSentAt: marketProfileFeedbackRequests.emailSentAt,
      feedbackSubmittedAt: marketProfileFeedbackRequests.feedbackSubmittedAt,
      marketName: marketProfiles.name,
      marketState: marketProfiles.state,
      agentName: users.name,
    })
    .from(marketProfileFeedbackRequests)
    .innerJoin(marketProfiles, eq(marketProfileFeedbackRequests.marketProfileId, marketProfiles.id))
    .innerJoin(users, eq(marketProfileFeedbackRequests.agentId, users.id))
    .where(eq(marketProfileFeedbackRequests.id, requestId))
    .limit(1);
  if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "This market-profile review request no longer exists." });
  if (request.agentId !== userId) throw new TRPCError({ code: "FORBIDDEN", message: "This private market-profile review belongs to a different agent." });
  return { db, request };
}

export const marketProfileFeedbackRouter = router({
  get: protectedProcedure
    .input(z.object({ requestId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const { request } = await getFeedbackRequest(input.requestId, ctx.user.id);
      return request;
    }),

  submit: protectedProcedure
    .input(z.object({
      requestId: z.number().int().positive(),
      feedback: z.string().trim().min(2, "Add a little more detail before submitting.").max(12_000),
    }))
    .mutation(async ({ input, ctx }) => {
      const { db, request } = await getFeedbackRequest(input.requestId, ctx.user.id);
      if (request.feedbackSubmittedAt) {
        throw new TRPCError({ code: "CONFLICT", message: "Your feedback has already been submitted and is being incorporated." });
      }
      const feedback = input.feedback.replace(/\u0000/g, "").trim();
      if (!feedback) throw new TRPCError({ code: "BAD_REQUEST", message: "Add feedback before submitting." });

      await db.transaction(async tx => {
        await tx.insert(marketProfileSources).values({
          marketProfileId: request.marketProfileId,
          sourceType: "note",
          title: "Assigned agent feedback on market profile update",
          content: `Agent feedback on the ${request.marketName}, ${request.marketState} market profile:\n\n${feedback}`,
          extractionStatus: "ready",
          createdById: ctx.user.id,
        });
        await tx.update(marketProfileFeedbackRequests)
          .set({ feedbackText: feedback, feedbackSubmittedAt: new Date() })
          .where(and(
            eq(marketProfileFeedbackRequests.id, request.id),
            eq(marketProfileFeedbackRequests.agentId, ctx.user.id),
          ));
      });
      void logActivity({
        userId: ctx.user.id,
        action: "agent_market_profile_feedback_submitted",
        entityType: "market",
        entityId: request.marketProfileId,
        details: { feedbackRequestId: request.id },
      });
      void refreshMarketIntelligence(request.marketProfileId, "source_added").catch(error =>
        console.error(`[AgentMarkets] Could not synthesize agent feedback for market ${request.marketProfileId}:`, error)
      );
      return { success: true };
    }),
});
