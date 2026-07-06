import { z } from "zod";
import {
  getBusinessOverviewKpis,
  getAgentPerformanceReport,
  getAgentPipelineFunnel,
  getGroupPerformanceReport,
  getMarketPerformanceReport,
  getCommissionSummaryReport,
  getTaskAnalyticsReport,
  getIsaReport,
  getLeadSourceAnalyticsReport,
  getOnboardingReport,
  getDatabaseHealthReport,
  getMonthlyGciTrendExtended,
  getFinancialPerformanceSummary,
  getMasterMetrics,
} from "../db-analytics";
import {
  getAgentPerformance,
  getAnalyticsOverview,
  getLeadSourceBreakdown,
  getMonthlyRevenue,
  getPipelineByStatus,
  getActivityLog,
  getLeadSourceFunnel,
  getAgentProduction,
  getIsaPerformance,
  getMonthlyGciTrend,
  getPipelineVelocity,
  getTransactionTypeBreakdown,
  getIsaStatusFunnel,
  getIsaStatusFunnelByIsa,
  getAgentLeadSourceBreakdown,
  getAgentTransactionTypeBreakdown,
  getMarketPerformance,
  getMarketMonthlyTrend,
  getMarketAgentLeaderboard,
  getExecutiveDashboard,
  getSalesFunnelReport,
  getLeadSourceROI,
  getPipelineHealthReport,
  getTrendComparison,
  getAiInsightsData,
  upsertAgentGoal,
  getAgentGoals,
  getAllGoalsForYear,
  getAgentProductionWithGoals,
  getMyGoalsAndProduction,
  getMarketDrillDownAgents,
  getMarketDrillDownDeals,
  getMarketDrillDownMonthlyTrend,
  getMarketById,
  updateMarketGoal,
  getAgentMonthlyGci,
  getGlobalActivityLog,
} from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";

const dateRangeInput = z.object({
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
}).optional();

function parseDates(input?: { dateFrom?: string; dateTo?: string }) {
  return {
    dateFrom: input?.dateFrom ? new Date(input.dateFrom) : undefined,
    dateTo: input?.dateTo ? new Date(input.dateTo) : undefined,
  };
}

export const analyticsRouter = router({
  // ─── Core overview ────────────────────────────────────────────────────────
  overview: protectedProcedure.query(async () => getAnalyticsOverview()),
  agentPerformance: protectedProcedure.query(async () => getAgentPerformance()),
  pipelineByStatus: protectedProcedure.query(async () => getPipelineByStatus()),
  monthlyRevenue: protectedProcedure
    .input(z.object({ months: z.number().optional() }).optional())
    .query(async ({ input }) => getMonthlyRevenue(input?.months ?? 12)),
  leadSourceBreakdown: protectedProcedure.query(async () => getLeadSourceBreakdown()),
  activityLog: protectedProcedure
    .input(z.object({
      entityType: z.string().optional(),
      entityId: z.number().optional(),
      limit: z.number().optional(),
      contactId: z.number().optional(),
    }).optional())
    .query(async ({ input }) =>
      getActivityLog(input?.entityType, input?.entityId, input?.limit ?? 50, input?.contactId)
    ),

  // ─── Admin: Global Activity Timeline ─────────────────────────────────────
  /** Paginated global activity log for the /admin/activity timeline page */
  globalActivityLog: protectedProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(50),
      userId: z.number().optional(),
      entityTypes: z.array(z.string()).optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new Error("Admin only");
      return getGlobalActivityLog({
        page: input?.page ?? 1,
        limit: input?.limit ?? 50,
        userId: input?.userId,
        entityTypes: input?.entityTypes,
      });
    }),

  // ─── Deep analytics ───────────────────────────────────────────────────────

  /** Lead source conversion funnel: contacts → active → closed, with GCI */
  leadSourceFunnel: protectedProcedure
    .input(z.object({ dateFrom: z.string().optional(), dateTo: z.string().optional(), agentId: z.number().optional() }).optional())
    .query(async ({ input }) => {
      const { dateFrom, dateTo } = parseDates(input);
      return getLeadSourceFunnel(dateFrom, dateTo, input?.agentId);
    }),

  /** Agent production leaderboard with pipeline counts and avg days to close */
  agentProduction: protectedProcedure
    .input(dateRangeInput)
    .query(async ({ input }) => {
      const { dateFrom, dateTo } = parseDates(input);
      return getAgentProduction(dateFrom, dateTo);
    }),

  /** ISA performance: leads assigned, converted, conversion rate */
  isaPerformance: protectedProcedure
    .input(dateRangeInput)
    .query(async ({ input }) => {
      const { dateFrom, dateTo } = parseDates(input);
      return getIsaPerformance(dateFrom, dateTo);
    }),

  /** Monthly GCI trend with optional agent filter */
  monthlyGciTrend: protectedProcedure
    .input(z.object({
      months: z.number().optional(),
      agentId: z.number().optional(),
    }).optional())
    .query(async ({ input }) => getMonthlyGciTrend(input?.months ?? 12, input?.agentId)),

  /** Pipeline velocity: contact count per stage */
  pipelineVelocity: protectedProcedure.query(async () => getPipelineVelocity()),

  /** Transaction type breakdown: buyer/seller/dual GCI */
  transactionTypeBreakdown: protectedProcedure
    .input(dateRangeInput)
    .query(async ({ input }) => {
      const { dateFrom, dateTo } = parseDates(input);
      return getTransactionTypeBreakdown(dateFrom, dateTo);
    }),

  /** ISA pipeline status funnel: contacts per stage, optionally filtered by ISA */
  isaStatusFunnel: protectedProcedure
    .input(z.object({ isaId: z.number().optional() }).optional())
    .query(async ({ input }) => getIsaStatusFunnel(input?.isaId)),

  /** ISA status funnel broken down by each ISA (admin view) */
  agentLeadSourceBreakdown: protectedProcedure
    .input(z.object({ agentId: z.number() }))
    .query(async ({ input }) => getAgentLeadSourceBreakdown(input.agentId)),

  agentTransactionTypeBreakdown: protectedProcedure
    .input(z.object({ agentId: z.number() }))
    .query(async ({ input }) => getAgentTransactionTypeBreakdown(input.agentId)),

  isaStatusFunnelByIsa: protectedProcedure
    .query(async () => getIsaStatusFunnelByIsa()),

  /** Market performance overview: GCI, deals, agents per market */
  marketPerformance: protectedProcedure
    .query(async () => getMarketPerformance()),

  /** Market monthly GCI trend */
  marketMonthlyTrend: protectedProcedure
    .input(z.object({ months: z.number().optional() }).optional())
    .query(async ({ input }) => getMarketMonthlyTrend(input?.months ?? 12)),

  /** Agent leaderboard for a specific market */
  marketAgentLeaderboard: protectedProcedure
    .input(z.object({ marketId: z.number() }))
    .query(async ({ input }) => getMarketAgentLeaderboard(input.marketId)),

  // ─── NEW: Executive Dashboard ─────────────────────────────────────────────
  /** Executive dashboard: MTD/YTD metrics, pipeline coverage, revenue per lead/agent */
  executiveDashboard: protectedProcedure
    .input(z.object({
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      marketId: z.number().optional(),
      agentId: z.number().optional(),
    }).optional())
    .query(async ({ input }) => {
      const { dateFrom, dateTo } = parseDates(input);
      return getExecutiveDashboard({ dateFrom, dateTo, marketId: input?.marketId, agentId: input?.agentId });
    }),

  // ─── NEW: Sales Funnel ────────────────────────────────────────────────────
  /** Stage-by-stage conversion rates, drop-off rates */
  salesFunnel: protectedProcedure
    .input(z.object({
      agentId: z.number().optional(),
      marketId: z.number().optional(),
    }).optional())
    .query(async ({ input }) => getSalesFunnelReport({ agentId: input?.agentId, marketId: input?.marketId })),

  // ─── NEW: Lead Source ROI ─────────────────────────────────────────────────
  /** Revenue per source, conversion rate, avg deal size */
  leadSourceROI: protectedProcedure
    .input(z.object({
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      marketId: z.number().optional(),
      agentId: z.number().optional(),
    }).optional())
    .query(async ({ input }) => {
      const { dateFrom, dateTo } = parseDates(input);
      return getLeadSourceROI({ dateFrom, dateTo, marketId: input?.marketId, agentId: input?.agentId });
    }),

  // ─── NEW: Pipeline Health ─────────────────────────────────────────────────
  /** Stalled deals, aging analysis, days-in-stage heatmap */
  pipelineHealth: protectedProcedure
    .input(z.object({
      agentId: z.number().optional(),
      marketId: z.number().optional(),
    }).optional())
    .query(async ({ input }) => getPipelineHealthReport({ agentId: input?.agentId, marketId: input?.marketId })),

  // ─── NEW: Trend Comparisons ───────────────────────────────────────────────
  /** WoW, MoM, YoY comparisons for GCI, closings, volume */
  trendComparisons: protectedProcedure
    .input(z.object({
      agentId: z.number().optional(),
      marketId: z.number().optional(),
    }).optional())
    .query(async ({ input }) => getTrendComparison({ agentId: input?.agentId, marketId: input?.marketId })),

  // ─── Agent Goals ──────────────────────────────────────────────────────────
  /** Set or update a goal for an agent for a specific year/month (admin only) */
  setGoal: protectedProcedure
    .input(z.object({
      agentId: z.number(),
      year: z.number(),
      month: z.number(), // 1-12, or 0 for annual
      gciTarget: z.number().nullable().optional(),
      closingsTarget: z.number().nullable().optional(),
      volumeTarget: z.number().nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new Error("Admin only");
      await upsertAgentGoal(input);
      return { success: true };
    }),

  /** Bulk-set the same goal for all agents */
  setBulkGoals: protectedProcedure
    .input(z.object({
      agentIds: z.array(z.number()),
      year: z.number(),
      month: z.number(),
      gciTarget: z.number().nullable().optional(),
      closingsTarget: z.number().nullable().optional(),
      volumeTarget: z.number().nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new Error("Admin only");
      await Promise.all(
        input.agentIds.map((agentId) =>
          upsertAgentGoal({ agentId, year: input.year, month: input.month, gciTarget: input.gciTarget, closingsTarget: input.closingsTarget, volumeTarget: input.volumeTarget })
        )
      );
      return { success: true };
    }),

  /** Get all goals for a specific year */
  goalsForYear: protectedProcedure
    .input(z.object({ year: z.number() }))
    .query(async ({ input }) => getAllGoalsForYear(input.year)),

  /** Get goals for a specific agent and year */
  agentGoals: protectedProcedure
    .input(z.object({ agentId: z.number(), year: z.number() }))
    .query(async ({ input }) => getAgentGoals(input.agentId, input.year)),

  /** Agent production with goal progress bars */
  agentProductionWithGoals: protectedProcedure
    .input(z.object({
      year: z.number(),
      month: z.number(), // 1-12, or 0 for annual
    }))
    .query(async ({ input }) => getAgentProductionWithGoals(input.year, input.month)),

  /** My goals and production — agent-facing, returns current user's own data */
  myGoals: protectedProcedure
    .input(z.object({
      year: z.number(),
      month: z.number(), // 1-12, or 0 for annual
    }))
    .query(async ({ ctx, input }) => {
      return getMyGoalsAndProduction(ctx.user.id, input.year, input.month);
    }),

  // ─── NEW: AI Insights ─────────────────────────────────────────────────────
  /** AI-generated insights: anomalies, bottlenecks, coaching recommendations */
  aiInsights: protectedProcedure
    .mutation(async () => {
      const data = await getAiInsightsData();
      if (!data) return { insights: [], generatedAt: new Date().toISOString() };

      const prompt = `You are a real estate brokerage performance analyst for Savvy, a short-term rental investment brokerage.

Here is the current performance data:

**Last 30 Days vs Prior 30 Days:**
- GCI: $${data.recentGci.toLocaleString()} vs $${data.priorGci.toLocaleString()} (${data.gciTrend > 0 ? '+' : ''}${data.gciTrend.toFixed(1)}%)
- Closings: ${data.recentClosings} vs ${data.priorClosings} (${data.closingsTrend > 0 ? '+' : ''}${data.closingsTrend.toFixed(1)}%)
- Volume: $${data.recentVolume.toLocaleString()}

**Pipeline Alerts:**
- Stalled deals (14+ days no update): ${data.stalledDeals}
- Overdue follow-ups: ${data.overdueFollowUps}

**Top Agents (last 30d):**
${data.topAgents.map(a => `- ${a.agentName}: ${a.closings} closings, $${Number(a.gci).toLocaleString()} GCI`).join('\n')}

**Bottom Agents (last 30d):**
${data.bottomAgents.map(a => `- ${a.agentName}: ${a.closings} closings, $${Number(a.gci).toLocaleString()} GCI`).join('\n')}

**Top Lead Sources:**
${data.sourceStats.slice(0, 5).map(s => `- ${s.sourceName || 'Unknown'}: ${s.leads} leads, ${s.closed} closed`).join('\n')}

Generate 4-6 specific, actionable insights in JSON format. Each insight should have:
- type: "warning" | "opportunity" | "coaching" | "anomaly" | "success"
- title: short headline (max 8 words)
- description: 1-2 sentences with specific data points
- action: concrete next step for leadership
- priority: "high" | "medium" | "low"

Return only valid JSON array.`;

      try {
        const response = await invokeLLM({
          messages: [
            { role: "system", content: "You are a real estate analytics expert. Return only valid JSON arrays." },
            { role: "user", content: prompt },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "insights",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  insights: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        type: { type: "string" },
                        title: { type: "string" },
                        description: { type: "string" },
                        action: { type: "string" },
                        priority: { type: "string" },
                      },
                      required: ["type", "title", "description", "action", "priority"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["insights"],
                additionalProperties: false,
              },
            },
          },
        });
        const content = response.choices[0]?.message?.content;
        const parsed = typeof content === "string" ? JSON.parse(content) : content;
        return { insights: parsed.insights ?? [], generatedAt: new Date().toISOString(), rawData: data };
      } catch (e) {
        console.error("AI insights error:", e);
        return { insights: [], generatedAt: new Date().toISOString(), rawData: data };
      }
    }),

  /** Full drill-down for a single market */
  marketDrillDown: protectedProcedure
    .input(z.object({ marketId: z.number(), months: z.number().optional() }))
    .query(async ({ input }) => {
      const [market, agents, deals, trend] = await Promise.all([
        getMarketById(input.marketId),
        getMarketDrillDownAgents(input.marketId),
        getMarketDrillDownDeals(input.marketId, 50),
        getMarketDrillDownMonthlyTrend(input.marketId, input.months ?? 12),
      ]);
      return { market, agents, deals, trend };
    }),

  // ─── NEW BI REPORTS ──────────────────────────────────────────────────────────

  /** Business overview KPIs */
  businessOverviewKpis: protectedProcedure
    .input(z.object({ dateFrom: z.string().optional(), dateTo: z.string().optional() }).optional())
    .query(async ({ input }) => getBusinessOverviewKpis({
      dateFrom: input?.dateFrom ? new Date(input.dateFrom) : undefined,
      dateTo: input?.dateTo ? new Date(input.dateTo) : undefined,
    })),

  /** Agent performance report with group/market filters */
  agentPerformanceReport: protectedProcedure
    .input(z.object({
      dateFrom: z.string().optional(), dateTo: z.string().optional(),
      agentId: z.number().optional(), groupId: z.number().optional(), marketProfileId: z.number().optional(),
    }).optional())
    .query(async ({ input }) => getAgentPerformanceReport({
      dateFrom: input?.dateFrom ? new Date(input.dateFrom) : undefined,
      dateTo: input?.dateTo ? new Date(input.dateTo) : undefined,
      agentId: input?.agentId, groupId: input?.groupId, marketProfileId: input?.marketProfileId,
    })),

  /** Agent pipeline funnel by status */
  agentPipelineFunnel: protectedProcedure
    .input(z.object({ agentId: z.number().optional(), groupId: z.number().optional() }).optional())
    .query(async ({ input }) => getAgentPipelineFunnel({ agentId: input?.agentId, groupId: input?.groupId })),

  /** Group performance report */
  groupPerformanceReport: protectedProcedure
    .input(z.object({
      dateFrom: z.string().optional(), dateTo: z.string().optional(), groupId: z.number().optional(),
    }).optional())
    .query(async ({ input }) => getGroupPerformanceReport({
      dateFrom: input?.dateFrom ? new Date(input.dateFrom) : undefined,
      dateTo: input?.dateTo ? new Date(input.dateTo) : undefined,
      groupId: input?.groupId,
    })),

  /** Market performance report */
  marketPerformanceReport: protectedProcedure
    .input(z.object({
      dateFrom: z.string().optional(), dateTo: z.string().optional(), marketProfileId: z.number().optional(),
    }).optional())
    .query(async ({ input }) => getMarketPerformanceReport({
      dateFrom: input?.dateFrom ? new Date(input.dateFrom) : undefined,
      dateTo: input?.dateTo ? new Date(input.dateTo) : undefined,
      marketProfileId: input?.marketProfileId,
    })),

  /** Commission summary with payout breakdown */
  commissionSummaryReport: protectedProcedure
    .input(z.object({
      dateFrom: z.string().optional(), dateTo: z.string().optional(), agentId: z.number().optional(),
    }).optional())
    .query(async ({ input }) => getCommissionSummaryReport({
      dateFrom: input?.dateFrom ? new Date(input.dateFrom) : undefined,
      dateTo: input?.dateTo ? new Date(input.dateTo) : undefined,
      agentId: input?.agentId,
    })),

  /** Task analytics report */
  taskAnalyticsReport: protectedProcedure
    .input(z.object({
      dateFrom: z.string().optional(), dateTo: z.string().optional(),
      assignedToId: z.number().optional(), taskType: z.string().optional(), priority: z.string().optional(),
    }).optional())
    .query(async ({ input }) => getTaskAnalyticsReport({
      dateFrom: input?.dateFrom ? new Date(input.dateFrom) : undefined,
      dateTo: input?.dateTo ? new Date(input.dateTo) : undefined,
      assignedToId: input?.assignedToId, taskType: input?.taskType, priority: input?.priority,
    })),

  /** ISA report with market match sessions */
  isaReport: protectedProcedure
    .input(z.object({
      dateFrom: z.string().optional(), dateTo: z.string().optional(), isaId: z.number().optional(),
    }).optional())
    .query(async ({ input }) => getIsaReport({
      dateFrom: input?.dateFrom ? new Date(input.dateFrom) : undefined,
      dateTo: input?.dateTo ? new Date(input.dateTo) : undefined,
      isaId: input?.isaId,
    })),

  /** Lead source analytics report */
  leadSourceAnalyticsReport: protectedProcedure
    .input(z.object({
      dateFrom: z.string().optional(), dateTo: z.string().optional(), parentId: z.number().optional(),
    }).optional())
    .query(async ({ input }) => getLeadSourceAnalyticsReport({
      dateFrom: input?.dateFrom ? new Date(input.dateFrom) : undefined,
      dateTo: input?.dateTo ? new Date(input.dateTo) : undefined,
      parentId: input?.parentId,
    })),

  /** Onboarding/offboarding report */
  onboardingReport: protectedProcedure
    .input(z.object({
      status: z.enum(["in_progress", "completed"]).optional(), agentId: z.number().optional(),
    }).optional())
    .query(async ({ input }) => getOnboardingReport({ status: input?.status, agentId: input?.agentId })),

  /** Database health report */
  databaseHealthReport: protectedProcedure
    .query(async () => getDatabaseHealthReport()),

  /** Monthly GCI trend with group/market filters */
  monthlyGciTrendExtended: protectedProcedure
    .input(z.object({
      months: z.number().optional(), agentId: z.number().optional(),
      groupId: z.number().optional(), marketProfileId: z.number().optional(),
    }).optional())
    .query(async ({ input }) => getMonthlyGciTrendExtended({
      months: input?.months, agentId: input?.agentId,
      groupId: input?.groupId, marketProfileId: input?.marketProfileId,
    })),

  /** Financial performance summary: closed/UC volumes + commission buckets */
  financialPerformanceSummary: protectedProcedure
    .input(z.object({
      dateFrom: z.string().optional(), dateTo: z.string().optional(),
      agentId: z.number().optional(), groupId: z.number().optional(), marketProfileId: z.number().optional(),
    }).optional())
    .query(async ({ input }) => getFinancialPerformanceSummary({
      dateFrom: input?.dateFrom ? new Date(input.dateFrom) : undefined,
      dateTo: input?.dateTo ? new Date(input.dateTo) : undefined,
      agentId: input?.agentId, groupId: input?.groupId, marketProfileId: input?.marketProfileId,
    })),

  /** Master metrics table: per-transaction financial breakdown */
  masterMetrics: protectedProcedure
    .input(z.object({
      dateFrom: z.string().optional(), dateTo: z.string().optional(),
      agentId: z.number().optional(), groupId: z.number().optional(), marketProfileId: z.number().optional(),
      leadSourceId: z.number().optional(),
      status: z.enum(["closed", "under_contract"]).optional(),
      sortBy: z.enum(["closingDate", "purchasePrice", "gci", "companyDollars"]).optional(),
      sortOrder: z.enum(["asc", "desc"]).optional(),
    }).optional())
    .query(async ({ input }) => getMasterMetrics({
      dateFrom: input?.dateFrom ? new Date(input.dateFrom) : undefined,
      dateTo: input?.dateTo ? new Date(input.dateTo) : undefined,
      agentId: input?.agentId, groupId: input?.groupId, marketProfileId: input?.marketProfileId,
      leadSourceId: input?.leadSourceId,
      status: input?.status,
      sortBy: input?.sortBy,
      sortOrder: input?.sortOrder,
    })),

  /** Set annual GCI goal for a market */
  setMarketGoal: protectedProcedure
    .input(z.object({ marketId: z.number(), annualGciGoal: z.number().nullable() }))
    .mutation(async ({ input }) => {
      await updateMarketGoal(input.marketId, input.annualGciGoal);
      return { ok: true };
    }),
  /** Monthly GCI breakdown for all agents in a given year — used for sparklines on Goals page */
  agentMonthlyGci: protectedProcedure
    .input(z.object({ year: z.number() }))
    .query(async ({ input }) => getAgentMonthlyGci(input.year)),
});
