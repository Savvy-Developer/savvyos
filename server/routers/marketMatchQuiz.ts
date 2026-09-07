import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { canAdminUsePermission } from "./permissions";
import {
  beginQuizSession,
  completeQuizContactDetails,
  enrollmentForAbandonedQuiz,
  generateQuizResults,
  getSessionState,
  publicLenders,
  publicQuizMarketFact,
  publicQuizConfiguration,
  quizAdminBootstrap,
  recommendQuizExperiment,
  requestAgentConnection,
  requestLenderConnection,
  saveQuizAgentSetting,
  saveQuizAnswer,
  saveQuizLender,
  saveQuizMarketSetting,
  saveQuizSettings,
  saveQuizVariant,
  startQuizFromEmail,
  resumeQuizFromPrivateLink,
  subscribeToDailyProperties,
} from "../marketMatchQuiz";

const tokenInput = z.object({ browserToken: z.string().min(20).max(200) });
const touchSchema = z.record(z.string(), z.string().max(500).nullable()).optional();

const publicError = (error: unknown) => {
  const message = error instanceof Error ? error.message : "Unable to continue the Market Match quiz.";
  throw new TRPCError({ code: "BAD_REQUEST", message });
};

const quizAdminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Market Match Quiz administration is available to administrators only." });
  const allowed = await canAdminUsePermission(ctx.user, "canViewAgentMarkets");
  if (!allowed) throw new TRPCError({ code: "FORBIDDEN", message: "Agent Markets permission is required." });
  return next({ ctx });
});

const questionSchema = z.object({
  id: z.string().trim().min(1).max(100),
  section: z.enum(["goals", "budget", "property", "geography", "financing", "timeline", "preferences"]),
  label: z.string().trim().min(1).max(500),
  helper: z.string().trim().max(1_000).optional(),
  type: z.enum(["single", "multi", "currency_range", "text", "boolean"]),
  options: z.array(z.object({ value: z.string().trim().min(1).max(100), label: z.string().trim().min(1).max(300) })).max(20).optional(),
  required: z.boolean().optional(),
  showWhen: z.object({ questionId: z.string().trim().min(1).max(100), values: z.array(z.string().trim().min(1).max(100)).min(1).max(20) }).optional(),
});

export const marketMatchQuizRouter = router({
  publicConfiguration: publicProcedure.query(async () => {
    try { return await publicQuizConfiguration(); } catch (error) { return publicError(error); }
  }),
  startFromEmail: publicProcedure.input(z.object({
    email: z.string().trim().email().max(320),
    firstTouch: touchSchema,
    deviceCategory: z.string().trim().max(24).nullable().optional(),
    emailReminderConsent: z.boolean(),
    marketingEmailConsent: z.boolean(),
    marketingSmsConsent: z.boolean(),
  })).mutation(async ({ input }) => {
    try { return await startQuizFromEmail(input); } catch (error) { return publicError(error); }
  }),
  completeContactDetails: publicProcedure.input(tokenInput.extend({
    firstName: z.string().trim().min(1).max(128),
    lastName: z.string().trim().min(1).max(128),
    phone: z.string().trim().max(32).nullable().optional(),
    marketingSmsConsent: z.boolean().optional(),
  })).mutation(async ({ input }) => {
    try { return await completeQuizContactDetails(input); } catch (error) { return publicError(error); }
  }),
  resume: publicProcedure.input(z.object({ resumeNonce: z.string().trim().min(20).max(200) })).mutation(async ({ input }) => {
    try { return await resumeQuizFromPrivateLink(input.resumeNonce); } catch (error) { return publicError(error); }
  }),
  begin: publicProcedure.input(z.object({
    email: z.string().trim().email().max(320),
    firstName: z.string().trim().min(1).max(128),
    lastName: z.string().trim().max(128),
    phone: z.string().trim().max(32).nullable().optional(),
    firstTouch: touchSchema,
    deviceCategory: z.string().trim().max(24).nullable().optional(),
    emailReminderConsent: z.boolean(),
    marketingEmailConsent: z.boolean(),
    marketingSmsConsent: z.boolean(),
  })).mutation(async ({ input }) => {
    try { return await beginQuizSession(input); } catch (error) { return publicError(error); }
  }),
  session: publicProcedure.input(tokenInput).query(async ({ input }) => {
    try { return await getSessionState(input.browserToken); } catch (error) { return publicError(error); }
  }),
  marketFact: publicProcedure.input(tokenInput.extend({ slot: z.number().int().min(0).max(100) })).query(async ({ input }) => {
    try { return await publicQuizMarketFact(input); } catch (error) { return publicError(error); }
  }),
  saveAnswer: publicProcedure.input(tokenInput.extend({
    questionId: z.string().trim().min(1).max(100),
    answer: z.unknown(),
    currentStep: z.string().trim().max(100),
    touch: touchSchema,
  })).mutation(async ({ input }) => {
    try { return await saveQuizAnswer(input); } catch (error) { return publicError(error); }
  }),
  results: publicProcedure.input(tokenInput).mutation(async ({ input }) => {
    try { return await generateQuizResults(input.browserToken); } catch (error) { return publicError(error); }
  }),
  lenders: publicProcedure.input(tokenInput).query(async ({ input }) => {
    try { await getSessionState(input.browserToken); return await publicLenders(); } catch (error) { return publicError(error); }
  }),
  requestAgent: publicProcedure.input(tokenInput.extend({ marketId: z.number().int().positive(), path: z.enum(["introduction", "schedule"]) })).mutation(async ({ input }) => {
    try { return await requestAgentConnection(input); } catch (error) { return publicError(error); }
  }),
  requestLender: publicProcedure.input(tokenInput.extend({ lenderId: z.number().int().positive(), path: z.enum(["introduction", "schedule"]) })).mutation(async ({ input }) => {
    try { return await requestLenderConnection(input); } catch (error) { return publicError(error); }
  }),
  subscribeDailyProperties: publicProcedure.input(tokenInput).mutation(async ({ input }) => {
    try { return await subscribeToDailyProperties(input.browserToken); } catch (error) { return publicError(error); }
  }),
  recordAbandonment: publicProcedure.input(tokenInput).mutation(async ({ input }) => {
    try { return await enrollmentForAbandonedQuiz(input); } catch (error) { return publicError(error); }
  }),

  adminBootstrap: quizAdminProcedure.query(() => quizAdminBootstrap()),
  adminSaveSettings: quizAdminProcedure.input(z.object({
    enabled: z.boolean().optional(), publicTitle: z.string().trim().max(255).optional(), publicSubtitle: z.string().trim().max(4_000).nullable().optional(), publicCta: z.string().trim().max(120).optional(),
    leadSourceId: z.number().int().positive().nullable().optional(), finishPlanId: z.number().int().positive().nullable().optional(), maxRecommendedMarkets: z.number().int().min(1).max(3).optional(), maxAgentConnections: z.number().int().min(1).max(10_000).optional(), dailyPropertyAudienceId: z.string().trim().max(255).nullable().optional(), questionConfig: z.array(questionSchema).min(1).max(20).optional(), aiGuidance: z.string().trim().max(4_000).nullable().optional(), autoTestingEnabled: z.boolean().optional(), autoPromoteMinCompletions: z.number().int().min(50).max(10_000).optional(),
  })).mutation(({ input, ctx }) => saveQuizSettings(input, ctx.user.id)),
  adminSaveMarket: quizAdminProcedure.input(z.object({ marketId: z.number().int().positive(), isEnabled: z.boolean(), priorityWeight: z.number().int().min(-3).max(3), connectionCap: z.number().int().positive().max(10_000).nullable() })).mutation(({ input, ctx }) => saveQuizMarketSetting(input, ctx.user.id)),
  adminSaveAgent: quizAdminProcedure.input(z.object({ marketId: z.number().int().positive(), agentId: z.number().int().positive(), isEnabled: z.boolean(), connectionCap: z.number().int().positive().max(10_000).nullable() })).mutation(({ input, ctx }) => saveQuizAgentSetting(input, ctx.user.id)),
  adminSaveLender: quizAdminProcedure.input(z.object({ id: z.number().int().positive().optional(), name: z.string().trim().min(1).max(255), email: z.string().trim().email().max(320), coverage: z.string().trim().max(2_000).nullable().optional(), availabilityNote: z.string().trim().max(2_000).nullable().optional(), bookingLink: z.string().trim().url().max(1_024).nullable().optional(), isEnabled: z.boolean() })).mutation(async ({ input, ctx }) => {
    try { return await saveQuizLender(input, ctx.user.id); } catch (error) { return publicError(error); }
  }),
  adminSaveVariant: quizAdminProcedure.input(z.object({ id: z.number().int().positive().optional(), name: z.string().trim().min(1).max(160), description: z.string().trim().max(4_000).nullable().optional(), hypothesis: z.string().trim().max(4_000).nullable().optional(), status: z.enum(["draft", "published", "paused", "archived"]), trafficAllocation: z.number().int().min(0).max(100), questionConfig: z.array(questionSchema).min(1).max(20).nullable().optional(), isControl: z.boolean().optional() })).mutation(({ input, ctx }) => saveQuizVariant(input, ctx.user.id)),
  adminExperimentRecommendation: quizAdminProcedure.mutation(() => recommendQuizExperiment()),
});
