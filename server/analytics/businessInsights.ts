import { and, eq } from "drizzle-orm";
import { analyticsInsightCaches, users } from "../../drizzle/schema";
import { invokeLLM } from "../_core/llm";
import { getDb } from "../db";
import { getIsaReport } from "../db-analytics";
import {
  getAgentOnboardingReport,
  getAgentReport,
  getGroupLeaderReport,
  getIsaActivitiesReport,
  getLeadSourcesReport,
  getMarketAnalyticsReport,
  getTasksReport,
  getTransactionStatisticsReport,
} from "./reportingSuite";
import { getTransactionIntelligenceReport } from "./transactionIntelligence";
import { getLeadCohortConversionReport } from "./leadCohortConversion";

/**
 * Company-wide AI Business Insights
 * ---------------------------------
 * This module creates one shared executive analysis for SavvyOS administrators.
 * It deliberately sends a curated, aggregate-oriented fact pack to the model:
 * report totals, trends, owner/market/source rollups, and operational exceptions.
 * Contact names, addresses, emails, phone numbers, activity notes, and row-level
 * evidence are excluded before the model request. The complete cached result is
 * stored once and served to every administrator until the weekly renewal.
 */

export type BusinessInsightViewer = { id: number; role: "admin" | "agent" | "isa" | "agent_support" };

type Row = Record<string, unknown>;

type BusinessInsightEvidence = {
  label: string;
  value: string;
  report: string;
  drilldown: "agents" | "leaders" | "transactions" | "tasks" | "isa" | "sources" | "markets" | "onboarding";
};

export type BusinessInsight = {
  type: "risk" | "opportunity" | "performance" | "coaching" | "data_quality";
  priority: "high" | "medium" | "low";
  confidence: "high" | "medium" | "limited";
  title: string;
  observation: string;
  hypothesis: string;
  businessImpact: string;
  owner: string;
  nextAction: string;
  connectedSignals: string[];
  evidence: BusinessInsightEvidence[];
};

export type BusinessInsightsPayload = {
  executiveSummary: string;
  companyHealth: {
    label: "strong" | "stable" | "watch" | "at_risk";
    score: number;
    rationale: string;
  };
  keyThemes: string[];
  insights: BusinessInsight[];
  dataQualityNote: string;
  generationMethod: "model" | "deterministic";
  generatedAt?: string;
  expiresAt?: string;
  isStale?: boolean;
  status?: "ready" | "refreshing" | "failed";
  model?: string | null;
  refreshReason?: "manual" | "scheduled" | "automatic" | null;
  errorMessage?: string | null;
};

type CachedRow = {
  id: number;
  scopeKey: string;
  insightPayload: unknown;
  facts: unknown;
  status: "ready" | "refreshing" | "failed";
  generatedAt: Date;
  expiresAt: Date;
  model: string | null;
  refreshReason: "manual" | "scheduled" | "automatic" | null;
  errorMessage: string | null;
};

type RefreshReason = "manual" | "scheduled" | "automatic";

const BUSINESS_SCOPE_KEY = "business-insights-v1|company";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const REFRESH_LOCK_MS = 20 * 60 * 1000;
// A concise, structured management brief does not require the highest-cost,
// longest-running model. This model is fast enough for scheduled refreshes and
// still supports strict JSON schema output.
const MODEL = process.env.BUSINESS_INSIGHTS_MODEL || "gpt-5-mini";
const YTD_START = new Date(new Date().getFullYear(), 0, 1);
const MODEL_FACT_ARRAY_LIMIT = 10;
const MODEL_FACT_OBJECT_FIELD_LIMIT = 28;
const MODEL_FACT_MAX_DEPTH = 4;

const BUSINESS_INSIGHT_SCHEMA = {
  name: "savvy_business_insights_v1",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["executiveSummary", "companyHealth", "keyThemes", "insights", "dataQualityNote"],
    properties: {
      executiveSummary: { type: "string" },
      companyHealth: {
        type: "object",
        additionalProperties: false,
        required: ["label", "score", "rationale"],
        properties: {
          label: { type: "string", enum: ["strong", "stable", "watch", "at_risk"] },
          score: { type: "integer", minimum: 0, maximum: 100 },
          rationale: { type: "string" },
        },
      },
      keyThemes: { type: "array", minItems: 3, maxItems: 6, items: { type: "string" } },
      insights: {
        type: "array",
        minItems: 5,
        maxItems: 10,
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "type", "priority", "confidence", "title", "observation", "hypothesis",
            "businessImpact", "owner", "nextAction", "connectedSignals", "evidence",
          ],
          properties: {
            type: { type: "string", enum: ["risk", "opportunity", "performance", "coaching", "data_quality"] },
            priority: { type: "string", enum: ["high", "medium", "low"] },
            confidence: { type: "string", enum: ["high", "medium", "limited"] },
            title: { type: "string" },
            observation: { type: "string" },
            hypothesis: { type: "string" },
            businessImpact: { type: "string" },
            owner: { type: "string" },
            nextAction: { type: "string" },
            connectedSignals: { type: "array", minItems: 2, maxItems: 6, items: { type: "string" } },
            evidence: {
              type: "array",
              minItems: 2,
              maxItems: 5,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["label", "value", "report", "drilldown"],
                properties: {
                  label: { type: "string" },
                  value: { type: "string" },
                  report: { type: "string" },
                  drilldown: { type: "string", enum: ["agents", "leaders", "transactions", "tasks", "isa", "sources", "markets", "onboarding"] },
                },
              },
            },
          },
        },
      },
      dataQualityNote: { type: "string" },
    },
  },
} as const;

function ymd(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function asNumber(value: unknown): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function currency(value: unknown): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(asNumber(value));
}

function percent(value: unknown): string {
  const numeric = asNumber(value);
  return `${numeric.toFixed(numeric % 1 === 0 ? 0 : 1)}%`;
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toRecord(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
}

function toRows(value: unknown): Row[] {
  return Array.isArray(value) ? value.map(toRecord) : [];
}

/**
 * Normalizes the production measures that must be stated exactly in the company
 * narrative. The Transaction Statistics summary can include multiple outcome
 * statuses for a status="all" report, so closed GCI is deliberately taken from
 * the closed-status rollup while the pipeline remains a current snapshot.
 */
function buildCompanyProductionSnapshot(transactionStatistics: unknown) {
  const report = toRecord(transactionStatistics);
  const summary = toRecord(report.summary);
  const pipeline = toRecord(report.pipeline);
  const closedStatus = toRows(report.statuses).find((row) => String(row.status ?? "") === "closed");

  return {
    ytdClosed: {
      units: asNumber(closedStatus?.units ?? summary.closedUnits ?? summary.closings),
      volume: asNumber(closedStatus?.volume ?? summary.volume),
      grossCommission: asNumber(closedStatus?.grossCommission ?? summary.grossCommission),
      savvyNet: asNumber(closedStatus?.savvyNet ?? summary.savvyNet),
    },
    currentUnderContract: {
      units: asNumber(pipeline.units),
      volume: asNumber(pipeline.volume),
      grossCommission: asNumber(pipeline.grossCommission),
      savvyNet: asNumber(pipeline.savvyNet),
    },
  };
}

/** Prevent raw client and row-level evidence data from crossing the model boundary. */
const SENSITIVE_KEY = /contact|property|address|email|phone|note|description|evidence|transactionnumber|followup|session|message|content|file|url/i;

function sanitizeForModel(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return ymd(value);
  if (typeof value === "string") return value.length > 220 ? `${value.slice(0, 217)}...` : value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (depth > MODEL_FACT_MAX_DEPTH) return "[truncated]";
  if (Array.isArray(value)) {
    return value
      .slice(0, MODEL_FACT_ARRAY_LIMIT)
      .map((item) => sanitizeForModel(item, depth + 1));
  }
  if (typeof value === "object") {
    const result: Row = {};
    for (const [key, item] of Object.entries(value as Row)
      .filter(([key]) => !SENSITIVE_KEY.test(key))
      .slice(0, MODEL_FACT_OBJECT_FIELD_LIMIT)) {
      result[key] = sanitizeForModel(item, depth + 1);
    }
    return result;
  }
  return String(value);
}

function period(): { dateFrom: string; dateTo: string; label: string } {
  const now = new Date();
  return {
    dateFrom: ymd(YTD_START),
    dateTo: ymd(now),
    label: `Year to date through ${now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`,
  };
}

function buildFactPack(reports: Record<string, unknown>) {
  const activePeriod = period();
  const companyProductionSnapshot = buildCompanyProductionSnapshot(reports.transactionStatistics);
  return {
    definitionVersion: "business-insights-v1",
    generatedFor: activePeriod,
    scope: "Company-wide, all active Savvy STR Agents records. Period reports are YTD; current pipeline and operational flags are explicitly point-in-time snapshots.",
    privacy: "The model fact pack excludes client names, contact identifiers, property addresses, emails, phone numbers, notes, and item-level evidence.",
    companyProductionSnapshot,
    reportFacts: Object.fromEntries(
      Object.entries(reports).map(([name, report]) => [name, sanitizeForModel(report)]),
    ),
    interpretiveRules: [
      "Do not compare a current pipeline snapshot directly to a date-scoped outcome without stating the scope difference.",
      "Savvy Net means recorded payout items to Savvy STR Agents or EXP, not an inferred commission split; use payout coverage when evaluating it.",
      "Appointments set are agent-connection records flagged appointmentSet, not necessarily completed appointments or closed business.",
      "Observational relationships are hypotheses, not causal claims. Small samples and incomplete tracking require limited confidence.",
    ],
  };
}

async function collectCompanyReports() {
  const current = period();
  const reportingFilters = {
    dateFrom: current.dateFrom,
    dateTo: current.dateTo,
    status: "all" as const,
    transactionType: "all" as const,
    page: 1,
    limit: 25,
  };
  const [
    agents,
    leaders,
    transactions,
    onboarding,
    markets,
    tasks,
    isas,
    sources,
    transactionEconomics,
    leadCohorts,
    isaPerformance,
  ] = await Promise.all([
    getAgentReport(reportingFilters),
    getGroupLeaderReport({ ...reportingFilters, includeLeaderStats: true }),
    getTransactionStatisticsReport(reportingFilters),
    getAgentOnboardingReport(reportingFilters),
    getMarketAnalyticsReport(reportingFilters),
    getTasksReport(reportingFilters),
    getIsaActivitiesReport(reportingFilters),
    getLeadSourcesReport(reportingFilters),
    getTransactionIntelligenceReport({ dateFrom: current.dateFrom, dateTo: current.dateTo }),
    getLeadCohortConversionReport({ dateFrom: current.dateFrom, dateTo: current.dateTo }),
    getIsaReport({ dateFrom: new Date(`${current.dateFrom}T00:00:00`), dateTo: new Date(`${current.dateTo}T23:59:59`) }),
  ]);

  return {
    agentPerformance: agents,
    groupLeaderPerformance: leaders,
    transactionStatistics: transactions,
    onboarding,
    marketProduction: markets,
    taskExecution: tasks,
    isaActivities: isas,
    leadSources: sources,
    transactionEconomics,
    leadCohortConversion: leadCohorts,
    isaAppointmentsAndFunnel: isaPerformance,
  };
}

function evidence(label: string, value: string, report: string, drilldown: BusinessInsightEvidence["drilldown"]): BusinessInsightEvidence {
  return { label, value, report, drilldown };
}

function buildDeterministicFallback(facts: Record<string, unknown>): BusinessInsightsPayload {
  // Runtime generation passes a sanitized fact pack, while narrow unit probes can
  // supply raw report objects. Support both shapes so a model outage never turns
  // valid production into zero-value narrative claims.
  const reportFacts = toRecord(facts.reportFacts);
  const transactions = toRecord(reportFacts.transactionStatistics ?? facts.transactionStatistics);
  const productionSnapshot = toRecord(reportFacts.companyProductionSnapshot ?? facts.companyProductionSnapshot);
  const ytdClosed = toRecord(productionSnapshot.ytdClosed);
  const currentUnderContract = toRecord(productionSnapshot.currentUnderContract);
  const summary = toRecord(transactions.summary);
  const pipeline = toRecord(transactions.pipeline);
  const flags = toRecord(transactions.flags);
  const taskReport = toRecord(reportFacts.taskExecution ?? facts.taskExecution);
  const taskSummary = toRecord(taskReport.summary);
  const isa = toRecord(reportFacts.isaAppointmentsAndFunnel ?? facts.isaAppointmentsAndFunnel);
  const cohort = toRecord(reportFacts.leadCohortConversion ?? facts.leadCohortConversion);
  const cohortSummary = toRecord(cohort.summary);
  const economics = toRecord(reportFacts.transactionEconomics ?? facts.transactionEconomics);
  const economicsActuals = toRecord(economics.actuals ?? economics.closedFlow ?? economics.summary);

  const closedUnits = asNumber(ytdClosed.units ?? summary.closedUnits ?? summary.closings);
  const terminatedUnits = asNumber(summary.terminatedUnits);
  const pipelineUnits = asNumber(currentUnderContract.units ?? pipeline.units);
  const overdueTasks = asNumber(taskSummary.overdue ?? taskSummary.overdueTasks);
  const appointments = asNumber(isa.totalAppointmentsSet);
  const grossCommission = asNumber(ytdClosed.grossCommission ?? summary.grossCommission);
  const savvyNet = asNumber(ytdClosed.savvyNet ?? summary.savvyNet);
  const missingExpectedClose = asNumber(flags.noExpectedClose ?? flags.missingExpectedCloseDate ?? flags.missingExpectedClose);
  const pastExpectedClose = asNumber(flags.pastExpectedClose ?? flags.pastExpectedCloseDate);
  const commissionFlags = asNumber(flags.commissionFlags ?? flags.payoutIntegrity);
  const leads = asNumber(cohortSummary.cohortLeads);
  const contracted = asNumber(cohortSummary.contractedContacts);
  const closeConversion = asNullableNumber(cohortSummary.closeConversionRate ?? cohortSummary.closeConversionPct);
  const payoutCoverage = asNullableNumber(economicsActuals.payoutCoveragePct);

  const healthPenalty = Math.min(45,
    (terminatedUnits > 0 ? 8 : 0)
    + (overdueTasks > 0 ? 8 : 0)
    + (missingExpectedClose + pastExpectedClose + commissionFlags > 0 ? 10 : 0)
    + (closeConversion !== null && closeConversion < 2 ? 7 : 0)
    + (payoutCoverage !== null && payoutCoverage < 85 ? 7 : 0),
  );
  const score = Math.max(35, 82 - healthPenalty);
  const insights: BusinessInsight[] = [
    {
      type: "performance",
      priority: "high",
      confidence: "high",
      title: "YTD production and the current pipeline should be managed as separate operating horizons",
      observation: `The period report shows ${closedUnits} closed units and ${currency(grossCommission)} in recorded GCI, while the current under-contract pipeline contains ${pipelineUnits} units.` ,
      hypothesis: "Current pipeline represents future execution risk and opportunity, whereas the closed-flow figures represent realized YTD production; combining them would obscure both performance and forecast reliability.",
      businessImpact: `The pipeline has ${pipelineUnits} active units whose timing, expected-close completeness, and commission quality can materially affect upcoming production and Savvy Net.`,
      owner: "Leadership and transaction operations",
      nextAction: "Review the current pipeline by expected-close status, agent, and commission integrity; assign next actions for every exception before the weekly operating review.",
      connectedSignals: ["YTD closed-flow production", "Current under-contract pipeline", "Expected-close operational flags"],
      evidence: [
        evidence("YTD closed units", String(closedUnits), "Transaction Statistics", "transactions"),
        evidence("Current under-contract units", String(pipelineUnits), "Transaction Statistics", "transactions"),
      ],
    },
    {
      type: overdueTasks > 0 ? "risk" : "performance",
      priority: overdueTasks > 0 ? "high" : "medium",
      confidence: "high",
      title: overdueTasks > 0 ? "Overdue task execution is an immediate operational control point" : "Task execution is currently operating without overdue backlog in the report scope",
      observation: `The task report shows ${overdueTasks} overdue tasks, alongside ${appointments} appointments set in the ISA activity dataset.`,
      hypothesis: "When follow-up and transaction tasks age, lead conversion and expected-close readiness can weaken; the relationship should be validated at owner level before intervention.",
      businessImpact: overdueTasks > 0 ? "Unresolved task backlog can delay lead follow-up, transaction progression, and operational data completion." : "Sustained task discipline protects follow-up coverage and data readiness as pipeline volume grows.",
      owner: "ISA management, agent leaders, and transaction operations",
      nextAction: overdueTasks > 0 ? "Use the overdue-task drill-down to assign owners and dates, then recheck the backlog in the next weekly review." : "Continue auditing monthly task flow against appointments and pipeline growth to detect early capacity strain.",
      connectedSignals: ["Overdue task backlog", "ISA appointment-setting activity", "Pipeline execution readiness"],
      evidence: [
        evidence("Overdue tasks", String(overdueTasks), "Task Execution", "tasks"),
        evidence("Appointments set", String(appointments), "ISA Activities", "isa"),
      ],
    },
    {
      type: terminatedUnits > 0 ? "risk" : "performance",
      priority: terminatedUnits > 0 ? "high" : "low",
      confidence: "medium",
      title: terminatedUnits > 0 ? "Termination outcomes need owner-level pattern review" : "No period termination volume is present in the current outcome summary",
      observation: `The period outcome report contains ${terminatedUnits} terminated units and ${closedUnits} closed units.`,
      hypothesis: "Concentrated terminations by representation type, source, or agent could reveal expectation-setting, deal-quality, or transaction-management patterns; the aggregate alone does not establish cause.",
      businessImpact: "Terminations reduce realized volume and GCI and can consume agent, ISA, and operations capacity without generating closed production.",
      owner: "Sales leadership and transaction operations",
      nextAction: terminatedUnits > 0 ? "Review the monthly and by-agent outcome views, then identify recurring representation, source, or process patterns before setting coaching actions." : "Maintain monthly by-agent outcome review so emerging termination patterns are surfaced early.",
      connectedSignals: ["Closed outcomes", "Terminated outcomes", "Agent outcome breakdown"],
      evidence: [
        evidence("Terminated units", String(terminatedUnits), "Transaction Statistics", "transactions"),
        evidence("Closed units", String(closedUnits), "Transaction Statistics", "transactions"),
      ],
    },
    {
      type: "opportunity",
      priority: "medium",
      confidence: closeConversion === null ? "limited" : "medium",
      title: "Lead, appointment, and downstream conversion should be reviewed as one acquisition-to-production system",
      observation: `The YTD cohort includes ${leads} leads, ${contracted} observed contracts, and ${closeConversion === null ? "an unavailable" : percent(closeConversion)} observed close-conversion rate; ISAs recorded ${appointments} appointments set.`,
      hypothesis: "Source and owner cohorts with strong appointment activity but weaker downstream contract or close outcomes may indicate handoff, qualification, or follow-up gaps rather than top-of-funnel volume constraints.",
      businessImpact: "Improving the highest-leverage handoff or conversion constraint could increase closed production without proportional increases in lead spend.",
      owner: "ISA leadership and sales leadership",
      nextAction: "Compare the lead-source and agent cohort views to isolate segments where appointment activity, contracting, and closing diverge; verify sample size and attribution before actioning.",
      connectedSignals: ["Lead cohort volume", "Appointments set", "Observed contract conversion", "Observed close conversion"],
      evidence: [
        evidence("Cohort leads", String(leads), "Lead Cohort Conversion", "sources"),
        evidence("Appointments set", String(appointments), "ISA Activities", "isa"),
      ],
    },
    {
      type: payoutCoverage !== null && payoutCoverage < 85 ? "data_quality" : "performance",
      priority: payoutCoverage !== null && payoutCoverage < 85 ? "high" : "medium",
      confidence: payoutCoverage === null ? "limited" : "high",
      title: "Recorded Savvy Net should be interpreted with payout coverage",
      observation: `The period shows ${currency(savvyNet)} in recorded Savvy Net${payoutCoverage === null ? " with no payout-coverage percentage available" : ` and ${percent(payoutCoverage)} payout coverage`}.`,
      hypothesis: "If payout coverage is incomplete, performance comparisons based on recorded Savvy Net may reflect data completeness as well as true unit economics.",
      businessImpact: "Incomplete payout allocation can distort margin monitoring, agent economics, and source or market profitability decisions.",
      owner: "Finance and transaction operations",
      nextAction: "Review commission flags and payout integrity exceptions before using Savvy Net variance as a management-performance conclusion.",
      connectedSignals: ["Recorded Savvy Net", "Payout coverage", "Commission integrity flags"],
      evidence: [
        evidence("Recorded Savvy Net", currency(savvyNet), "Transaction Statistics", "transactions"),
        evidence("Payout coverage", payoutCoverage === null ? "Not available" : percent(payoutCoverage), "Transaction Intelligence", "transactions"),
      ],
    },
  ];

  return {
    executiveSummary: `SavvyOS has ${closedUnits} YTD closed units, ${currency(grossCommission)} in recorded GCI, and ${pipelineUnits} current under-contract units. The strongest operating priorities are protecting pipeline readiness, resolving task and transaction exceptions, and reviewing the lead-to-appointment-to-close handoff as one system.`,
    companyHealth: {
      label: score >= 75 ? "stable" : score >= 60 ? "watch" : "at_risk",
      score,
      rationale: "Deterministic fallback based on visible production, pipeline, task, termination, and financial-data completeness signals. A model-generated narrative will replace this after the next successful refresh.",
    },
    keyThemes: [
      "Separate realized production from current pipeline forecast risk.",
      "Use task, expected-close, and commission flags as execution controls.",
      "Evaluate lead sources, ISA appointments, and agent outcomes as a connected conversion system.",
    ],
    insights,
    dataQualityNote: `The synthesis uses aggregate report facts. ${missingExpectedClose + pastExpectedClose + commissionFlags > 0 ? `${missingExpectedClose + pastExpectedClose + commissionFlags} current transaction operational or commission flags warrant record-level review.` : "No current transaction operational or commission flag total was detected in the normalized fallback fields."}`,
    generationMethod: "deterministic",
  };
}

type BusinessInsightGenerationResult = {
  payload: BusinessInsightsPayload;
  modelError: string | null;
};

async function createInsightPayload(facts: Record<string, unknown>): Promise<BusinessInsightGenerationResult> {
  try {
    const response = await invokeLLM({
      model: MODEL,
      maxTokens: 5000,
      reasoning: { effort: "low" },
      messages: [
        {
          role: "system",
          content: `You are the executive business-intelligence strategist for Savvy STR Agents. Analyze only the supplied SavvyOS fact pack. Produce unusually deep, decision-quality cross-report synthesis—not report-by-report summaries.

Rules:
1. Never invent facts, owners, dates, causes, records, benchmarks, or unseen data. Use only exact values contained in the fact pack. Treat companyProductionSnapshot as the canonical source for the headline YTD and current-pipeline production values.
2. Treat observational relationships as hypotheses, never proof of causation. State the hypothesis and confidence explicitly.
3. Every insight must connect at least two distinct data domains, such as production and pipeline, ISA appointments and cohort conversion, task execution and outcomes, or commission quality and Savvy Net.
4. Every insight must include two or more exact evidence values, report locations, a responsible owner, and a concrete next action that can be taken this week.
5. Preserve scope integrity: YTD/period outcomes are not the same as current pipeline snapshots. Do not call under-contract units "closed" or use date-scoped outcome counts as current pipeline counts.
6. When sample size, attribution, payout coverage, timing, or data completeness limits interpretation, identify that limitation and lower confidence.
7. Avoid generic advice and avoid shaming people. Surface management choices, operating risks, coaching opportunities, and measurable next steps.
8. Rank insights by expected business impact and urgency. Cover performance, opportunity, execution risk, and data quality when evidence supports each.
9. The fact pack contains internal aggregate information only. Do not ask for or infer client-specific details.`,
        },
        {
          role: "user",
          content: `Create an executive AI Business Insights report from the following company-wide SavvyOS fact pack. Return only the requested structured object.\n\n${JSON.stringify(facts)}`,
        },
      ],
      response_format: { type: "json_schema", json_schema: BUSINESS_INSIGHT_SCHEMA },
    });
    const content = response.choices[0]?.message?.content;
    const parsed = typeof content === "string" ? JSON.parse(content) : null;
    if (!parsed || !Array.isArray(parsed.insights) || parsed.insights.length < 3) {
      throw new Error("Business insight model returned an empty or malformed structured payload.");
    }
    return {
      payload: { ...parsed, generationMethod: "model" } as BusinessInsightsPayload,
      modelError: null,
    };
  } catch (error) {
    const modelError = error instanceof Error ? error.message : String(error);
    console.error("[BusinessInsights] Falling back to deterministic analysis:", modelError);
    return {
      payload: buildDeterministicFallback(facts),
      modelError: `Model generation fallback: ${modelError}`.slice(0, 2_000),
    };
  }
}

function hydrateCachedInsight(row: CachedRow): BusinessInsightsPayload {
  const payload = row.insightPayload && typeof row.insightPayload === "object"
    ? row.insightPayload as BusinessInsightsPayload
    : buildDeterministicFallback({});
  return {
    ...payload,
    generatedAt: toIso(row.generatedAt) ?? undefined,
    expiresAt: toIso(row.expiresAt) ?? undefined,
    isStale: row.expiresAt.getTime() <= Date.now(),
    status: row.status,
    model: row.model,
    refreshReason: row.refreshReason,
    errorMessage: row.errorMessage,
  };
}

function isAdmin(viewer: BusinessInsightViewer): asserts viewer is BusinessInsightViewer & { role: "admin" } {
  if (viewer.role !== "admin") throw new Error("AI Business Insights is available to administrators only.");
}

export async function getCachedBusinessInsights(): Promise<BusinessInsightsPayload | null> {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .select()
    .from(analyticsInsightCaches)
    .where(eq(analyticsInsightCaches.scopeKey, BUSINESS_SCOPE_KEY))
    .limit(1);
  return row ? hydrateCachedInsight(row as unknown as CachedRow) : null;
}

export async function refreshBusinessInsights(options: {
  viewer: BusinessInsightViewer;
  force?: boolean;
  reason?: RefreshReason;
}) {
  const { viewer, force = false, reason = "automatic" } = options;
  isAdmin(viewer);
  const db = await getDb();
  if (!db) throw new Error("Database is not available for AI Business Insights caching.");

  const [existing] = await db
    .select()
    .from(analyticsInsightCaches)
    .where(eq(analyticsInsightCaches.scopeKey, BUSINESS_SCOPE_KEY))
    .limit(1);
  const now = new Date();
  const cached = existing as unknown as CachedRow | undefined;
  if (cached && !force && cached.status === "ready" && cached.expiresAt > now) {
    return { cache: hydrateCachedInsight(cached), cacheHit: true, refreshing: false };
  }
  if (cached && cached.status === "refreshing" && now.getTime() - cached.generatedAt.getTime() < REFRESH_LOCK_MS) {
    return { cache: hydrateCachedInsight(cached), cacheHit: true, refreshing: true };
  }

  const cacheMetadata = {
    version: "business-insights-v1",
    scope: "company",
    period: period(),
    privacy: "Aggregated and sanitized report facts only; client-level evidence excluded.",
  };
  if (cached) {
    await db.update(analyticsInsightCaches).set({
      status: "refreshing",
      ownerUserId: viewer.id,
      viewerRole: "admin",
      filters: cacheMetadata,
      generatedAt: now,
      errorMessage: null,
      refreshReason: reason,
      model: MODEL,
    }).where(eq(analyticsInsightCaches.id, cached.id));
  } else {
    await db.insert(analyticsInsightCaches).values({
      scopeKey: BUSINESS_SCOPE_KEY,
      ownerUserId: viewer.id,
      viewerRole: "admin",
      filters: cacheMetadata,
      insightPayload: {
        executiveSummary: "Generating company-wide analysis…",
        companyHealth: { label: "watch", score: 0, rationale: "Analysis is being generated." },
        keyThemes: [],
        insights: [],
        dataQualityNote: "",
        generationMethod: "deterministic",
      },
      facts: {},
      status: "refreshing",
      generatedAt: now,
      expiresAt: new Date(now.getTime() + WEEK_MS),
      refreshReason: reason,
      model: MODEL,
    });
  }

  try {
    const reports = await collectCompanyReports();
    const facts = buildFactPack(reports);
    const generation = await createInsightPayload(facts);
    const { payload, modelError } = generation;
    const generatedAt = new Date();
    // A deterministic fallback keeps the report useful if the model is temporarily unavailable,
    // but it is deliberately short-lived so the scheduler retries the model promptly.
    const expiresAt = new Date(generatedAt.getTime() + (payload.generationMethod === "model" ? WEEK_MS : DAY_MS));
    await db.update(analyticsInsightCaches).set({
      insightPayload: payload,
      facts,
      status: "ready",
      generatedAt,
      expiresAt,
      errorMessage: modelError,
      refreshReason: reason,
      model: MODEL,
    }).where(eq(analyticsInsightCaches.scopeKey, BUSINESS_SCOPE_KEY));

    return {
      cache: {
        ...payload,
        generatedAt: generatedAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        isStale: false,
        status: "ready" as const,
        model: MODEL,
        refreshReason: reason,
        errorMessage: modelError,
      },
      cacheHit: false,
      refreshing: false,
    };
  } catch (error: any) {
    const message = error instanceof Error ? error.message : String(error);
    await db.update(analyticsInsightCaches).set({
      status: "failed",
      errorMessage: message,
      expiresAt: new Date(Date.now() + DAY_MS),
    }).where(eq(analyticsInsightCaches.scopeKey, BUSINESS_SCOPE_KEY));
    throw error;
  }
}

async function getSchedulingViewer(): Promise<BusinessInsightViewer | null> {
  const db = await getDb();
  if (!db) return null;
  const [admin] = await db
    .select({ id: users.id, role: users.role, isActive: users.isActive })
    .from(users)
    .where(and(eq(users.role, "admin"), eq(users.isActive, true)))
    .limit(1);
  if (!admin || !admin.isActive) return null;
  return { id: admin.id, role: "admin" };
}

/** Rebuild the one shared company cache after its weekly TTL, or create it after deployment. */
export async function refreshDueBusinessInsights(): Promise<{ refreshed: number; failed: number; skipped: boolean }> {
  const db = await getDb();
  if (!db) return { refreshed: 0, failed: 0, skipped: true };
  const [row] = await db
    .select()
    .from(analyticsInsightCaches)
    .where(eq(analyticsInsightCaches.scopeKey, BUSINESS_SCOPE_KEY))
    .limit(1);
  const cached = row as unknown as CachedRow | undefined;
  const cachedPayload = cached ? toRecord(cached.insightPayload) : {};
  const needsModelRetry = cachedPayload.generationMethod !== "model";
  const due = !cached || cached.status === "failed" || cached.expiresAt.getTime() <= Date.now() || needsModelRetry;
  if (!due) return { refreshed: 0, failed: 0, skipped: true };
  if (cached?.status === "refreshing" && Date.now() - cached.generatedAt.getTime() < REFRESH_LOCK_MS) {
    return { refreshed: 0, failed: 0, skipped: true };
  }
  const viewer = await getSchedulingViewer();
  if (!viewer) {
    console.warn("[BusinessInsights] No active administrator is available to own the shared scheduled cache.");
    return { refreshed: 0, failed: 0, skipped: true };
  }
  try {
    await refreshBusinessInsights({ viewer, force: true, reason: "scheduled" });
    return { refreshed: 1, failed: 0, skipped: false };
  } catch (error) {
    console.error("[BusinessInsights] Scheduled refresh failed:", error);
    return { refreshed: 0, failed: 1, skipped: false };
  }
}

let businessInsightScheduler: NodeJS.Timeout | undefined;
let businessInsightStartupTimer: NodeJS.Timeout | undefined;

/** Check daily; the seven-day cache expiry guarantees weekly model synthesis. */
export function scheduleBusinessInsightRefresh(): void {
  if (businessInsightScheduler) clearInterval(businessInsightScheduler);
  businessInsightScheduler = setInterval(() => {
    refreshDueBusinessInsights()
      .then((result) => console.info(`[BusinessInsights] Scheduled refresh: ${result.refreshed} refreshed, ${result.failed} failed, skipped=${result.skipped}.`))
      .catch((error) => console.error("[BusinessInsights] Scheduled refresh error:", error));
  }, DAY_MS);

  if (businessInsightStartupTimer) clearTimeout(businessInsightStartupTimer);
  businessInsightStartupTimer = setTimeout(() => {
    refreshDueBusinessInsights()
      .then((result) => console.info(`[BusinessInsights] Startup refresh: ${result.refreshed} refreshed, ${result.failed} failed, skipped=${result.skipped}.`))
      .catch((error) => console.error("[BusinessInsights] Startup refresh error:", error));
  }, 75_000);
}

export const businessInsightRefreshApi = { refreshDueBusinessInsights };

/** Included only for narrow test probes without exposing report facts to callers. */
export const businessInsightTestApi = {
  buildFactPack,
  buildCompanyProductionSnapshot,
  buildDeterministicFallback,
  asNumber,
};
