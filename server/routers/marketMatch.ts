import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { invokeLLM } from "../_core/llm";
import {
  getAllMarketProfiles,
  getMarketProfileById,
  getActiveMarketProfiles,
  upsertMarketProfile,
  deleteMarketProfile,
  getMarketAgents,
  upsertMarketAgentAssignment,
  removeMarketAgentAssignment,
  getMarketCaseStudies,
  upsertMarketCaseStudy,
  deleteMarketCaseStudy,
  createMarketMatchSession,
  getMarketMatchSession,
  getSessionsForContact,
  updateMarketMatchSession,
  completeMarketMatchSession,
  getContactCallContext,
  getRecentCallSessions,
  getAgentById,
} from "../marketMatch.db";
import { sendTransactionalEmail } from "../_core/resendEmail";
import { usStates, usCounties, marketCounties } from "../../drizzle/schema";
import { getDb, logActivity } from "../db";
import { eq, asc } from "drizzle-orm";

// ─── Investor Profile Schema ──────────────────────────────────────────────────

const investorProfileSchema = z.object({
  // Timeline & Budget
  purchaseTimeline: z.string().optional(), // "0-3 months", "3-6 months", etc.
  budgetMin: z.number().optional(),
  budgetMax: z.number().optional(),
  financingType: z.string().optional(), // "cash", "conventional", "DSCR", "other"
  cashAvailable: z.number().optional(),
  // Investment priorities (1-5 scale)
  cashFlowImportance: z.number().min(1).max(5).optional(),
  appreciationImportance: z.number().min(1).max(5).optional(),
  taxStrategyImportance: z.number().min(1).max(5).optional(),
  personalUseInterest: z.number().min(1).max(5).optional(),
  // Operations
  managementPreference: z.string().optional(), // "self", "property_manager", "open"
  remoteOwnershipComfort: z.number().min(1).max(5).optional(),
  // Property preferences
  propertyType: z.string().optional(),
  bedroomsMin: z.number().optional(),
  bedroomsMax: z.number().optional(),
  desiredAmenities: z.array(z.string()).optional(),
  willingToRenovate: z.boolean().optional(),
  openToUniqueConceptProperties: z.boolean().optional(),
  // Risk & complexity
  regulationRiskTolerance: z.string().optional(), // "low", "medium", "high"
  managementComplexityTolerance: z.string().optional(),
  // Geography
  geographicPreferences: z.array(z.string()).optional(), // states or regions
  vibePreferences: z.array(z.string()).optional(), // "mountain", "beach", "urban", etc.
  coastPreference: z.string().optional(), // "east", "west", "either"
  seasonalityPreference: z.string().optional(), // "year_round", "seasonal", "no_preference"
  // Experience
  strExperienceLevel: z.string().optional(), // "first_time", "some_experience", "experienced"
  ownershipGoal: z.string().optional(), // "one_property", "small_portfolio", "large_portfolio"
  primaryMotivation: z.string().optional(), // "lifestyle", "performance", "both"
  // Return expectations
  targetCashOnCash: z.number().optional(),
  riskTolerance: z.string().optional(), // "conservative", "moderate", "aggressive"
  easeVsUpside: z.string().optional(), // "ease", "upside", "balanced"
});

// ─── Admin-only middleware ────────────────────────────────────────────────────

const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });
  }
  return next({ ctx });
});

const isaOrAdminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin" && ctx.user.role !== "isa") {
    throw new TRPCError({ code: "FORBIDDEN", message: "ISA or Admin only" });
  }
  return next({ ctx });
});

// ─── Router ───────────────────────────────────────────────────────────────────

export const marketMatchRouter = router({
  // ── Market Profiles ──────────────────────────────────────────────────────

  getAllMarkets: isaOrAdminProcedure.query(async () => {
    return getAllMarketProfiles();
  }),

  getActiveMarkets: isaOrAdminProcedure.query(async () => {
    return getActiveMarketProfiles();
  }),

  getMarket: isaOrAdminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const market = await getMarketProfileById(input.id);
      if (!market) throw new TRPCError({ code: "NOT_FOUND" });
      const agents = await getMarketAgents(input.id);
      const caseStudies = await getMarketCaseStudies(input.id);
      return { ...market, agents, caseStudies };
    }),

  upsertMarket: adminProcedure
    .input(
      z.object({
        id: z.number().optional(),
        name: z.string().min(1),
        state: z.string().min(1),
        region: z.string().optional(),
        status: z.enum(["active", "recruiting", "paused", "future"]).optional(),
        idealInvestorProfile: z.string().optional(),
        notGoodFor: z.string().optional(),
        budgetMin: z.number().optional(),
        budgetMax: z.number().optional(),
        commonPropertyTypes: z.string().optional(),
        commonBedroomRanges: z.string().optional(),
        commonAmenities: z.string().optional(),
        cashFlowProfile: z.enum(["low", "medium", "high", "very_high"]).optional(),
        appreciationProfile: z.enum(["low", "medium", "high", "very_high"]).optional(),
        regulationRisk: z.enum(["low", "medium", "high"]).optional(),
        managementDifficulty: z.enum(["low", "medium", "high"]).optional(),
        seasonalityProfile: z.enum(["year_round", "seasonal", "highly_seasonal"]).optional(),
        personalUseAttractiveness: z.enum(["low", "medium", "high"]).optional(),
        remoteOwnershipFriendly: z.boolean().optional(),
        vibeTag: z.string().optional(),
        talkingPoints: z.string().optional(),
        commonObjections: z.string().optional(),
        sampleBuyerScenarios: z.string().optional(),
        regulationNotes: z.string().optional(),
        internalNotes: z.string().optional(),
        scoringWeightCashFlow: z.number().optional(),
        scoringWeightAppreciation: z.number().optional(),
        scoringWeightRegulation: z.number().optional(),
        scoringWeightManagement: z.number().optional(),
        scoringWeightPersonalUse: z.number().optional(),
        scoringWeightBudget: z.number().optional(),
        scoringWeightVibe: z.number().optional(),
        annualGciGoal: z.number().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const id = await upsertMarketProfile({
        ...input,
        budgetMin: input.budgetMin?.toString() as any,
        budgetMax: input.budgetMax?.toString() as any,
        annualGciGoal: input.annualGciGoal?.toString() as any,
      });
      return { id };
    }),

  deleteMarket: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await deleteMarketProfile(input.id);
      return { success: true };
    }),

  // ── Agent Assignments ─────────────────────────────────────────────────────

  getMarketAgents: isaOrAdminProcedure
    .input(z.object({ marketProfileId: z.number() }))
    .query(async ({ input }) => {
      return getMarketAgents(input.marketProfileId);
    }),

  upsertMarketAgent: adminProcedure
    .input(
      z.object({
        id: z.number().optional(),
        marketProfileId: z.number(),
        agentId: z.number(),
        isPrimary: z.boolean().optional(),
        budgetSpecialization: z.string().optional(),
        maxLeadCapacity: z.number().optional(),
        isAvailable: z.boolean().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const id = await upsertMarketAgentAssignment(input);
      return { id };
    }),

  removeMarketAgent: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await removeMarketAgentAssignment(input.id);
      return { success: true };
    }),

  // ── Case Studies ──────────────────────────────────────────────────────────

  getMarketCaseStudies: isaOrAdminProcedure
    .input(z.object({ marketProfileId: z.number() }))
    .query(async ({ input }) => {
      return getMarketCaseStudies(input.marketProfileId);
    }),

  upsertCaseStudy: adminProcedure
    .input(
      z.object({
        id: z.number().optional(),
        marketProfileId: z.number(),
        title: z.string().min(1),
        propertyType: z.string().optional(),
        bedrooms: z.number().optional(),
        purchasePrice: z.number().optional(),
        annualRevenue: z.number().optional(),
        cashOnCashReturn: z.number().optional(),
        description: z.string().optional(),
        keyAmenities: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const id = await upsertMarketCaseStudy(input);
      return { id };
    }),

  deleteCaseStudy: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await deleteMarketCaseStudy(input.id);
      return { success: true };
    }),

  // ── Call Sessions ─────────────────────────────────────────────────────────

  startSession: isaOrAdminProcedure
    .input(z.object({ contactId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const contact = await getContactCallContext(input.contactId);
      if (!contact) throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found" });
      const sessionId = await createMarketMatchSession({
        contactId: input.contactId,
        isaId: ctx.user.id,
      });
      void logActivity({ userId: ctx.user.id, action: "market_match_session_started", entityType: "contact", entityId: input.contactId, details: { sessionId } });
      return { sessionId, contact };
    }),

  getSession: isaOrAdminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const session = await getMarketMatchSession(input.id);
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      // ISAs can only see their own sessions
      if (ctx.user.role === "isa" && session.isaId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const contact = await getContactCallContext(session.contactId);
      return { session, contact };
    }),

  getContactSessions: isaOrAdminProcedure
    .input(z.object({ contactId: z.number() }))
    .query(async ({ input }) => {
      return getSessionsForContact(input.contactId);
    }),

  updateSession: isaOrAdminProcedure
    .input(
      z.object({
        id: z.number(),
        callNotes: z.string().optional(),
        investorProfile: investorProfileSchema.optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const session = await getMarketMatchSession(input.id);
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      if (ctx.user.role === "isa" && session.isaId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      await updateMarketMatchSession(input.id, {
        callNotes: input.callNotes,
        investorProfile: input.investorProfile as any,
      });
      return { success: true };
    }),

  // ── AI Recommendation Engine ──────────────────────────────────────────────

  getAIRecommendations: isaOrAdminProcedure
    .input(
      z.object({
        sessionId: z.number(),
        callNotes: z.string().optional(),
        investorProfile: investorProfileSchema.optional(),
      })
    )
    .mutation(async ({ input }) => {
      const session = await getMarketMatchSession(input.sessionId);
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });

      const markets = await getActiveMarketProfiles();
      if (markets.length === 0) {
        return {
          recommendations: [],
          coachingTips: ["No active markets configured. Ask your admin to add markets."],
          missingInfo: [],
          overallConfidence: 0,
          aiInferences: [],
        };
      }

      const contact = await getContactCallContext(session.contactId);
      const profile = input.investorProfile ?? (session.investorProfile as any) ?? {};
      const notes = input.callNotes ?? session.callNotes ?? "";

      // Build market context string
      const marketContext = markets
        .map(
          (m) =>
            `Market: ${m.name} (${m.state})
  Vibe: ${m.vibeTag ?? "N/A"} | Cash Flow: ${m.cashFlowProfile} | Appreciation: ${m.appreciationProfile}
  Regulation Risk: ${m.regulationRisk} | Management: ${m.managementDifficulty} | Seasonality: ${m.seasonalityProfile}
  Budget Range: $${m.budgetMin ?? "?"} - $${m.budgetMax ?? "?"}
  Personal Use: ${m.personalUseAttractiveness} | Remote Friendly: ${m.remoteOwnershipFriendly ? "Yes" : "No"}
  Ideal For: ${m.idealInvestorProfile ?? "N/A"}
  NOT Good For: ${m.notGoodFor ?? "N/A"}
  Talking Points: ${m.talkingPoints ?? "N/A"}`
        )
        .join("\n\n");

      const profileStr = JSON.stringify(profile, null, 2);

      const prompt = `You are a senior Savvy STR Agents sales strategist. Your job is to recommend the best STR markets for an investor lead based on a live discovery call.

INVESTOR LEAD: ${contact?.firstName ?? ""} ${contact?.lastName ?? ""}
CALL NOTES: ${notes || "(none yet)"}

STRUCTURED INVESTOR PROFILE:
${profileStr}

AVAILABLE SAVVY MARKETS:
${marketContext}

Your task:
1. Recommend the TOP 3 best-fit markets for this investor, ranked by fit.
2. Identify 1 "safe/easy" option and 1 "stretch/upside" option if applicable.
3. For each market, provide: fitScore (0-100), confidenceScore (0-100), shortExplanation, whyItFits, whyItMayNotFit, bestTalkingPoints (array of 2-3 strings), likelyObjections (array), suggestedAgentNote.
4. Provide coachingTips: 2-4 actionable tips for the ISA right now (missing questions to ask, contradictions, urgency signals).
5. Provide missingInfo: list of key fields still unknown that would improve confidence.
6. Provide aiInferences: list of inferred facts from the notes (e.g. "Lead seems price sensitive", "Values personal use highly"). Each inference: {field, inferredValue, confidence: "high"|"medium"|"low", reasoning}.
7. Provide overallConfidence: 0-100 score based on how much info we have.

Respond ONLY with valid JSON matching this schema exactly:
{
  "recommendations": [
    {
      "marketName": string,
      "fitScore": number,
      "confidenceScore": number,
      "shortExplanation": string,
      "whyItFits": string,
      "whyItMayNotFit": string,
      "bestTalkingPoints": string[],
      "likelyObjections": string[],
      "suggestedAgentNote": string,
      "label": "top_pick" | "safe_easy" | "stretch_upside" | "standard"
    }
  ],
  "coachingTips": string[],
  "missingInfo": string[],
  "overallConfidence": number,
  "aiInferences": [
    {
      "field": string,
      "inferredValue": string,
      "confidence": "high" | "medium" | "low",
      "reasoning": string
    }
  ]
}`;

      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content:
              "You are a real estate investment market matching AI. Always respond with valid JSON only, no markdown.",
          },
          { role: "user", content: prompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "market_recommendations",
            strict: true,
            schema: {
              type: "object",
              properties: {
                recommendations: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      marketName: { type: "string" },
                      fitScore: { type: "number" },
                      confidenceScore: { type: "number" },
                      shortExplanation: { type: "string" },
                      whyItFits: { type: "string" },
                      whyItMayNotFit: { type: "string" },
                      bestTalkingPoints: { type: "array", items: { type: "string" } },
                      likelyObjections: { type: "array", items: { type: "string" } },
                      suggestedAgentNote: { type: "string" },
                      label: { type: "string" },
                    },
                    required: [
                      "marketName", "fitScore", "confidenceScore", "shortExplanation",
                      "whyItFits", "whyItMayNotFit", "bestTalkingPoints",
                      "likelyObjections", "suggestedAgentNote", "label",
                    ],
                    additionalProperties: false,
                  },
                },
                coachingTips: { type: "array", items: { type: "string" } },
                missingInfo: { type: "array", items: { type: "string" } },
                overallConfidence: { type: "number" },
                aiInferences: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      field: { type: "string" },
                      inferredValue: { type: "string" },
                      confidence: { type: "string" },
                      reasoning: { type: "string" },
                    },
                    required: ["field", "inferredValue", "confidence", "reasoning"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["recommendations", "coachingTips", "missingInfo", "overallConfidence", "aiInferences"],
              additionalProperties: false,
            },
          },
        } as any,
      });

      const content = response.choices?.[0]?.message?.content;
      if (!content) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI returned empty response" });

      let parsed: any;
      try {
        parsed = typeof content === "string" ? JSON.parse(content) : content;
      } catch {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI returned invalid JSON" });
      }

      // Save AI outputs to session
      await updateMarketMatchSession(input.sessionId, {
        topMarketRecommendations: parsed.recommendations,
        aiInferences: parsed.aiInferences,
        overallConfidenceScore: parsed.overallConfidence,
      });

      return parsed;
    }),

  // ── End of Call Summary ───────────────────────────────────────────────────

  generateCallSummary: isaOrAdminProcedure
    .input(
      z.object({
        sessionId: z.number(),
        callNotes: z.string().optional(),
        investorProfile: investorProfileSchema.optional(),
        recommendations: z.array(z.any()).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const session = await getMarketMatchSession(input.sessionId);
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });

      const contact = await getContactCallContext(session.contactId);
      const profile = input.investorProfile ?? (session.investorProfile as any) ?? {};
      const notes = input.callNotes ?? session.callNotes ?? "";
      const recs = input.recommendations ?? (session.topMarketRecommendations as any[]) ?? [];

      const prompt = `You are a senior ISA at Savvy STR Agents. Generate a professional end-of-call summary package.

CONTACT: ${contact?.firstName ?? ""} ${contact?.lastName ?? ""} | Phone: ${contact?.phone ?? "N/A"} | Email: ${contact?.email ?? "N/A"}
CALL NOTES: ${notes}
INVESTOR PROFILE: ${JSON.stringify(profile, null, 2)}
TOP MARKET RECOMMENDATIONS: ${JSON.stringify(recs.slice(0, 3), null, 2)}

Generate the following in JSON:
{
  "callSummary": "2-3 paragraph professional summary of the call, investor profile, and key takeaways",
  "followUpEmailDraft": "A professional follow-up email from the ISA to the investor. Include: greeting, recap of their goals, top 2 market recommendations with brief why, next steps, warm close. Keep it concise and high-value.",
  "handoffNotes": "Internal notes for the receiving agent. Include: investor profile highlights, what they care most about, budget, timeline, top market fit, any concerns or objections raised, recommended approach.",
  "nextActionRecommendation": "Single most important next action (e.g. 'Schedule intro call with Dev Agent in Smokies market within 48 hours')",
  "contactStatusSuggestion": "One of: active_client, nurture, attempted_contact, new_lead",
  "suggestedTags": ["tag1", "tag2"]
}`;

      const response = await invokeLLM({
        messages: [
          { role: "system", content: "You are a professional real estate ISA. Respond with valid JSON only." },
          { role: "user", content: prompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "call_summary",
            strict: true,
            schema: {
              type: "object",
              properties: {
                callSummary: { type: "string" },
                followUpEmailDraft: { type: "string" },
                handoffNotes: { type: "string" },
                nextActionRecommendation: { type: "string" },
                contactStatusSuggestion: { type: "string" },
                suggestedTags: { type: "array", items: { type: "string" } },
              },
              required: [
                "callSummary", "followUpEmailDraft", "handoffNotes",
                "nextActionRecommendation", "contactStatusSuggestion", "suggestedTags",
              ],
              additionalProperties: false,
            },
          },
        } as any,
      });

      const content = response.choices?.[0]?.message?.content;
      if (!content) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      let parsed: any;
      try {
        parsed = typeof content === "string" ? JSON.parse(content) : content;
      } catch {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI returned invalid JSON" });
      }

      return parsed;
    }),

  completeSession: isaOrAdminProcedure
    .input(
      z.object({
        sessionId: z.number(),
        callSummary: z.string(),
        followUpEmailDraft: z.string(),
        handoffNotes: z.string(),
        nextActionRecommendation: z.string(),
        contactStatusSuggestion: z.string(),
        tagsApplied: z.string(),
        recommendedAgentId: z.number().optional(),
        topMarketRecommendations: z.array(z.any()),
        overallConfidenceScore: z.number(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const session = await getMarketMatchSession(input.sessionId);
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      if (ctx.user.role === "isa" && session.isaId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
            const { sessionId, ...rest } = input;
      await completeMarketMatchSession(sessionId, rest);
      void logActivity({ userId: ctx.user.id, action: "market_match_session_completed", entityType: "contact", entityId: session.contactId, details: { sessionId, recommendedAgentId: input.recommendedAgentId } });
      return { success: true };
    }),
  // ─── Call History ────────────────────────────────────────────────────────
  recentSessions: isaOrAdminProcedure
    .input(z.object({ limit: z.number().min(1).max(100).optional() }))
    .query(async ({ input, ctx }) => {
      return getRecentCallSessions(ctx.user.id, input.limit ?? 20);
    }),

  // ─── Agent Intro Email ───────────────────────────────────────────────────
  sendAgentIntroEmail: isaOrAdminProcedure
    .input(
      z.object({
        sessionId: z.number(),
        agentId: z.number(),
        marketName: z.string().optional(),
        marketState: z.string().optional(),
        sendToInvestor: z.boolean().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const session = await getMarketMatchSession(input.sessionId);
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      if (ctx.user.role === "isa" && session.isaId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const agent = await getAgentById(input.agentId);
      if (!agent) throw new TRPCError({ code: "NOT_FOUND", message: "Agent not found" });
      if (!agent.email) throw new TRPCError({ code: "BAD_REQUEST", message: "Agent has no email" });

      const contact = await getContactCallContext(session.contactId);
      if (!contact) throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found" });

      const profile = (session.investorProfile as any) ?? {};
      const budgetMin = profile.budgetMin ? `$${Number(profile.budgetMin).toLocaleString()}` : null;
      const budgetMax = profile.budgetMax ? `$${Number(profile.budgetMax).toLocaleString()}` : null;
      const investorBudget = budgetMin && budgetMax ? `${budgetMin} – ${budgetMax}` : (budgetMin ?? budgetMax ?? undefined);

      const goalParts: string[] = [];
      if ((profile.cashFlowImportance ?? 0) >= 4) goalParts.push("Cash flow");
      if ((profile.appreciationImportance ?? 0) >= 4) goalParts.push("Appreciation");
      if ((profile.taxStrategyImportance ?? 0) >= 4) goalParts.push("Tax strategy");
      if ((profile.personalUseInterest ?? 0) >= 4) goalParts.push("Personal use");
      const investorGoals = goalParts.length > 0 ? goalParts.join(", ") : undefined;

      await sendTransactionalEmail("market_match_intro", {
        recipientEmail: agent.email,
        recipientName: agent.name ?? undefined,
        investorFirstName: contact.firstName ?? undefined,
        marketName: input.marketName,
        marketState: input.marketState,
        investorBudget,
        investorGoals,
        callSummarySnippet: session.callSummary?.slice(0, 400) ?? undefined,
        handoffNotes: session.handoffNotes ?? undefined,
        isaName: ctx.user.name ?? undefined,
      });

      if (input.sendToInvestor && contact.email) {
        await sendTransactionalEmail("market_match_intro", {
          recipientEmail: contact.email,
          recipientName: contact.firstName ?? undefined,
          investorFirstName: contact.firstName ?? undefined,
          marketName: input.marketName,
          marketState: input.marketState,
          investorBudget,
          investorGoals,
          callSummarySnippet: session.callSummary?.slice(0, 400) ?? undefined,
          handoffNotes: session.handoffNotes ?? undefined,
          isaName: ctx.user.name ?? undefined,
        });
      }

      return { success: true, agentName: agent.name, agentEmail: agent.email };
    }),

  // ── Location reference data ──────────────────────────────────────────────────
  listStates: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(usStates).orderBy(asc(usStates.name));
  }),

  listCountiesByState: protectedProcedure
    .input(z.object({ stateCode: z.string().min(2).max(2) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db
        .select()
        .from(usCounties)
        .where(eq(usCounties.stateCode, input.stateCode))
        .orderBy(asc(usCounties.name));
    }),

  getMarketCounties: protectedProcedure
    .input(z.object({ marketProfileId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db
        .select({ id: usCounties.id, name: usCounties.name, stateCode: usCounties.stateCode })
        .from(marketCounties)
        .innerJoin(usCounties, eq(marketCounties.countyId, usCounties.id))
        .where(eq(marketCounties.marketProfileId, input.marketProfileId))
        .orderBy(asc(usCounties.name));
    }),

  setMarketCounties: adminProcedure
    .input(z.object({ marketProfileId: z.number(), countyIds: z.array(z.number()) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(marketCounties).where(eq(marketCounties.marketProfileId, input.marketProfileId));
      if (input.countyIds.length > 0) {
        await db.insert(marketCounties).values(
          input.countyIds.map((countyId) => ({ marketProfileId: input.marketProfileId, countyId }))
        );
      }
      return { success: true };
    }),

  /** Preview the AI context block and prompt that will be sent for a specific market */
  getMarketAIPrompt: adminProcedure
    .input(z.object({ marketProfileId: z.number() }))
    .query(async ({ input }) => {
      const markets = await getAllMarketProfiles();
      const market = markets.find((m) => m.id === input.marketProfileId);
      if (!market) throw new TRPCError({ code: "NOT_FOUND", message: "Market not found" });

      const marketBlock = `Market: ${market.name} (${market.state ?? "N/A"})
  Vibe: ${market.vibeTag ?? "N/A"} | Cash Flow: ${market.cashFlowProfile ?? "N/A"} | Appreciation: ${market.appreciationProfile ?? "N/A"}
  Regulation Risk: ${market.regulationRisk ?? "N/A"} | Management: ${market.managementDifficulty ?? "N/A"} | Seasonality: ${market.seasonalityProfile ?? "N/A"}
  Budget Range: $${market.budgetMin ?? "?"} - $${market.budgetMax ?? "?"}
  Personal Use: ${market.personalUseAttractiveness ?? "N/A"} | Remote Friendly: ${market.remoteOwnershipFriendly ? "Yes" : "No"}
  Ideal For: ${market.idealInvestorProfile ?? "N/A"}
  NOT Good For: ${market.notGoodFor ?? "N/A"}
  Common Amenities: ${market.commonAmenities ?? "N/A"}
  Common Property Types: ${market.commonPropertyTypes ?? "N/A"}
  Talking Points: ${market.talkingPoints ?? "N/A"}
  Common Objections: ${market.commonObjections ?? "N/A"}
  Sample Buyer Scenarios: ${market.sampleBuyerScenarios ?? "N/A"}
  Regulation Notes: ${market.regulationNotes ?? "N/A"}`;

      // Calculate completeness score
      const fields = [
        market.vibeTag, market.talkingPoints, market.idealInvestorProfile,
        market.notGoodFor, market.budgetMin, market.commonAmenities,
        market.cashFlowProfile, market.regulationNotes, market.commonObjections,
        market.sampleBuyerScenarios, market.commonPropertyTypes, market.commonBedroomRanges,
      ];
      const completenessScore = Math.round((fields.filter(Boolean).length / fields.length) * 100);

      const fieldsSummary = {
        hasVibeTag: !!market.vibeTag,
        hasTalkingPoints: !!market.talkingPoints,
        hasIdealInvestorProfile: !!market.idealInvestorProfile,
        hasNotGoodFor: !!market.notGoodFor,
        hasBudgetRange: !!(market.budgetMin || market.budgetMax),
        hasCommonAmenities: !!market.commonAmenities,
        hasCashFlowProfile: !!market.cashFlowProfile,
        hasRegulationNotes: !!market.regulationNotes,
        hasCommonObjections: !!market.commonObjections,
        hasSampleBuyerScenarios: !!market.sampleBuyerScenarios,
        completenessScore,
      };

      return {
        marketName: market.name,
        isActive: market.status === "active",
        status: market.status,
        marketBlock,
        fieldsSummary,
      };
    }),
});
