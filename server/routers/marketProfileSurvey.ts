import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  marketProfileSources,
  marketProfileSurveyInvitations,
  marketProfileSurveyResponses,
  marketAgentAssignments,
  marketProfiles,
  users,
} from "../../drizzle/schema";
import { protectedProcedure, router } from "../_core/trpc";
import { refreshMarketIntelligence } from "../agentMarketsIntelligence";
import { getDb, logActivity } from "../db";
import { launchMarketProfileSurveyCampaign } from "../marketProfileSurveyScheduler";

const PAGE_COUNT = 5;
const MAX_ANSWER_LENGTH = 8_000;

const answersSchema = z.object({
  marketOverview: z.string().max(MAX_ANSWER_LENGTH).optional().default(""),
  idealClient: z.string().max(MAX_ANSWER_LENGTH).optional().default(""),
  propertyTypes: z.string().max(MAX_ANSWER_LENGTH).optional().default(""),
  revenueReality: z.string().max(MAX_ANSWER_LENGTH).optional().default(""),
  valueAdd: z.string().max(MAX_ANSWER_LENGTH).optional().default(""),
  investmentProfile: z.string().max(MAX_ANSWER_LENGTH).optional().default(""),
  regulations: z.string().max(MAX_ANSWER_LENGTH).optional().default(""),
  avoidAndWatchouts: z.string().max(MAX_ANSWER_LENGTH).optional().default(""),
  localNuance: z.string().max(MAX_ANSWER_LENGTH).optional().default(""),
});
type SurveyAnswers = z.infer<typeof answersSchema>;

function clean(value: string): string {
  return value.replace(/\r\n/g, "\n").trim();
}

function normaliseAnswers(answers: SurveyAnswers): SurveyAnswers {
  return Object.fromEntries(Object.entries(answers).map(([key, value]) => [key, clean(value)])) as SurveyAnswers;
}

function answerLines(answers: SurveyAnswers): string {
  const sections: Array<[string, string]> = [
    ["Market overview", answers.marketOverview],
    ["Ideal investor / client", answers.idealClient],
    ["Best-fit properties", answers.propertyTypes],
    ["Revenue reality", answers.revenueReality],
    ["Value-add opportunities", answers.valueAdd],
    ["Investment profile", answers.investmentProfile],
    ["Regulations and compliance", answers.regulations],
    ["Avoid / watchouts", answers.avoidAndWatchouts],
    ["Additional local nuance", answers.localNuance],
  ];
  return sections
    .filter(([, value]) => Boolean(value))
    .map(([label, value]) => `## ${label}\n${value}`)
    .join("\n\n") || "No substantive answers were provided.";
}

async function requireInvitation(invitationId: number, user: { id: number; role: string }) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
  const [row] = await db.select({
    invitation: marketProfileSurveyInvitations,
    agent: { id: users.id, name: users.name, email: users.email, marketProfileId: users.marketProfileId },
    market: { id: marketProfiles.id, name: marketProfiles.name, state: marketProfiles.state },
  }).from(marketProfileSurveyInvitations)
    .innerJoin(users, eq(marketProfileSurveyInvitations.agentId, users.id))
    .leftJoin(marketProfiles, eq(marketProfileSurveyInvitations.marketProfileId, marketProfiles.id))
    .where(eq(marketProfileSurveyInvitations.id, invitationId))
    .limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Survey invitation not found." });
  if (user.role !== "admin" && row.invitation.agentId !== user.id) {
    throw new TRPCError({ code: "FORBIDDEN", message: "This survey invitation belongs to another agent." });
  }
  return { db, ...row };
}

async function availableMarketsForAgent(agentId: number) {
  const db = await getDb();
  if (!db) return [];
  const markets = await db.select({
    id: marketProfiles.id,
    name: marketProfiles.name,
    state: marketProfiles.state,
    status: marketProfiles.status,
    isPrimary: marketAgentAssignments.isPrimary,
  }).from(marketAgentAssignments)
    .innerJoin(marketProfiles, eq(marketAgentAssignments.marketProfileId, marketProfiles.id))
    .where(and(
      eq(marketAgentAssignments.agentId, agentId),
      eq(marketAgentAssignments.isAvailable, true),
      inArray(marketProfiles.status, ["active", "recruiting", "future"]),
    ));
  return markets.sort((left, right) => Number(Boolean(right.isPrimary)) - Number(Boolean(left.isPrimary)) || left.name.localeCompare(right.name));
}

export const marketProfileSurveyRouter = router({
  get: protectedProcedure
    .input(z.object({ invitationId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const { db, invitation, agent, market } = await requireInvitation(input.invitationId, ctx.user);
      const [response] = await db.select().from(marketProfileSurveyResponses)
        .where(eq(marketProfileSurveyResponses.invitationId, invitation.id)).limit(1);
      const markets = await availableMarketsForAgent(invitation.agentId);
      return {
        invitation: {
          id: invitation.id,
          status: invitation.status,
          currentPage: Math.min(PAGE_COUNT, Math.max(1, invitation.currentPage)),
          completedAt: invitation.completedAt,
          marketProfileId: invitation.marketProfileId,
        },
        agent: { id: agent.id, name: agent.name, email: agent.email },
        market,
        availableMarkets: markets,
        answers: response?.answers ?? {},
      };
    }),

  saveProgress: protectedProcedure
    .input(z.object({
      invitationId: z.number().int().positive(),
      marketProfileId: z.number().int().positive().nullable().optional(),
      currentPage: z.number().int().min(1).max(PAGE_COUNT),
      answers: answersSchema,
    }))
    .mutation(async ({ input, ctx }) => {
      const { db, invitation, agent } = await requireInvitation(input.invitationId, ctx.user);
      if (invitation.status === "completed") return { success: true, completed: true };
      const marketProfileId = input.marketProfileId ?? invitation.marketProfileId ?? agent.marketProfileId;
      if (!marketProfileId) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose your Agent Market before saving the survey." });
      const assignedMarketIds = new Set((await availableMarketsForAgent(invitation.agentId)).map(market => market.id));
      if (!assignedMarketIds.has(marketProfileId)) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose an Agent Market assigned to you." });
      const answers = normaliseAnswers(input.answers);
      await db.insert(marketProfileSurveyResponses).values({
        invitationId: invitation.id,
        marketProfileId,
        agentId: invitation.agentId,
        answers,
      }).onDuplicateKeyUpdate({ set: { marketProfileId, answers, updatedAt: new Date() } });
      await db.update(marketProfileSurveyInvitations).set({
        marketProfileId,
        status: "in_progress",
        currentPage: input.currentPage,
      }).where(eq(marketProfileSurveyInvitations.id, invitation.id));
      return { success: true, completed: false };
    }),

  complete: protectedProcedure
    .input(z.object({
      invitationId: z.number().int().positive(),
      marketProfileId: z.number().int().positive().nullable().optional(),
      answers: answersSchema,
    }))
    .mutation(async ({ input, ctx }) => {
      const { db, invitation, agent } = await requireInvitation(input.invitationId, ctx.user);
      const marketProfileId = input.marketProfileId ?? invitation.marketProfileId ?? agent.marketProfileId;
      if (!marketProfileId) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose your Agent Market before submitting the survey." });
      const assignedMarketIds = new Set((await availableMarketsForAgent(invitation.agentId)).map(item => item.id));
      if (!assignedMarketIds.has(marketProfileId)) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose an Agent Market assigned to you." });
      const [market] = await db.select({ id: marketProfiles.id, name: marketProfiles.name }).from(marketProfiles).where(eq(marketProfiles.id, marketProfileId)).limit(1);
      if (!market) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a valid Agent Market." });
      const answers = normaliseAnswers(input.answers);
      const sourceContent = answerLines(answers);
      const title = `Agent Market Profile Survey — ${agent.name ?? agent.email ?? `Agent #${agent.id}`}`;
      const [existingResponse] = await db.select().from(marketProfileSurveyResponses)
        .where(eq(marketProfileSurveyResponses.invitationId, invitation.id)).limit(1);
      let sourceId = existingResponse?.sourceId ?? null;

      if (sourceId) {
        await db.update(marketProfileSources).set({
          marketProfileId,
          title,
          content: sourceContent,
          extractionStatus: "ready",
          createdById: invitation.agentId,
        }).where(eq(marketProfileSources.id, sourceId));
      } else {
        const [sourceResult] = await db.insert(marketProfileSources).values({
          marketProfileId,
          sourceType: "note",
          title,
          content: sourceContent,
          extractionStatus: "ready",
          createdById: invitation.agentId,
        });
        sourceId = Number((sourceResult as any).insertId);
      }

      await db.insert(marketProfileSurveyResponses).values({
        invitationId: invitation.id,
        marketProfileId,
        agentId: invitation.agentId,
        answers,
        sourceId,
        submittedAt: new Date(),
      }).onDuplicateKeyUpdate({ set: {
        marketProfileId,
        answers,
        sourceId,
        submittedAt: new Date(),
        updatedAt: new Date(),
      } });
      await db.update(marketProfileSurveyInvitations).set({
        marketProfileId,
        status: "completed",
        currentPage: PAGE_COUNT,
        completedAt: new Date(),
        nextReminderAt: null,
      }).where(eq(marketProfileSurveyInvitations.id, invitation.id));
      await logActivity({
        userId: invitation.agentId,
        action: "market_profile_survey_completed",
        entityType: "market_profile",
        entityId: marketProfileId,
        details: { invitationId: invitation.id, sourceId },
      });
      // Refresh asynchronously. Submission itself remains durable even when the
      // model call is temporarily unavailable.
      void refreshMarketIntelligence(marketProfileId, "source_added");
      return { success: true, marketName: market.name };
    }),

  launchCampaign: protectedProcedure.mutation(async ({ ctx }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
    const result = await launchMarketProfileSurveyCampaign();
    await logActivity({ userId: ctx.user.id, action: "market_profile_survey_campaign_launched", entityType: "market_profile_survey", entityId: 0, details: result });
    return result;
  }),
});
