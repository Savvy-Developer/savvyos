import { and, desc, eq, sql } from "drizzle-orm";
import {
  dailyCoachingBriefings,
  scheduledReportRuns,
  users,
} from "../drizzle/schema";
import { getDb } from "./db";
import { invokeLLM } from "./_core/llm";
import { sendTransactionalEmail } from "./_core/resendEmail";
import {
  addEasternDays,
  easternDateKey,
  easternDateTimeToUtc,
  getEasternTimeParts,
} from "./agentProductionReportScheduler";

const EASTERN_TIME_ZONE = "America/New_York";
const REPORT_KEY = "coaching_tips_for_today";
const REPORT_HOUR = 8;
const STALE_RUN_MS = 60 * 60 * 1000;
const APP_URL = "https://os.savvy-agents.com";
const AI_MODEL = "gpt-5-mini";
const HISTORY_LOOKBACK = 14;
const AGENT_COOLDOWN_RUNS = 3;
const DEAL_COOLDOWN_RUNS = 5;
// This capability was explicitly approved on Aug. 27, 2026. It prevents a
// late-evening deployment from retrospectively sending the first briefing.
const FIRST_LIVE_REPORT_DATE = "2026-08-28";

/** One shared conversation, intentionally limited to the five leaders requested by Tyler. */
export const COACHING_TIPS_RECIPIENT_EMAILS = [
  "philleone@savvy.realty",
  "trish@savvy.realty",
  "ashleigh@savvy.realty",
  "tyler@savvy.realty",
  "hunter@savvy.realty",
] as const;

const FOCUS_THEMES = [
  "units_and_pipeline",
  "premium_positioning",
  "commission_value",
  "advisor_quality",
  "capacity_and_leverage",
  "launch_cadence",
] as const;
type FocusTheme = typeof FOCUS_THEMES[number];

const THEME_LABELS: Record<FocusTheme, string> = {
  units_and_pipeline: "Units & pipeline conversion",
  premium_positioning: "Premium price-point positioning",
  commission_value: "Commission-value defense",
  advisor_quality: "Advisor quality & client decision leadership",
  capacity_and_leverage: "Capacity, leverage & service protection",
  launch_cadence: "Launch cadence & first-outcome execution",
};

const TRAINING_PLAYS = [
  {
    id: "mutual-action-plan",
    source: "Tyler's Training Time",
    title: "Replace vague follow-up with a mutual action plan",
    insight: "Every client interaction needs the next action, accountable owner, and due date—not an open-ended request to 'let me know.'",
    coachingMove: "Have the coach convert one live buyer or seller follow-up into a two-party decision checkpoint before the conversation ends.",
    exactLanguage: "Before we end, let’s agree on the next action: I will [advisor action] by [time], and you will [client action] by [time]. Then we will decide together on [date].",
  },
  {
    id: "decision-response",
    source: "Tyler's Training Time",
    title: "Turn property traffic into a decision",
    insight: "More listings do not solve an unclear buy box. A useful recommendation produces a yes, a no, or a specific fact that must be verified.",
    coachingMove: "Role-play a decision-response follow-up with one agent, then require the agent to set a 24-hour feedback checkpoint on the next recommendation.",
    exactLanguage: "I sent you this because it appears to fit your goal. I do not need an instant yes; I need your feedback so I can advise you well. Is your answer: explore it, pass, or identify the specific fact we need next?",
  },
  {
    id: "buyer-buy-box",
    source: "Tyler's Training Time",
    title: "Coach the whole buy box before the next recommendation",
    insight: "An STR buy box links the client’s return objective, capital plan, market flexibility, operating model, risks, decision makers, and pass conditions.",
    coachingMove: "Ask the agent to open one active buyer file and identify the one missing buy-box field that could change the next recommendation.",
    exactLanguage: "Before we evaluate another property, I want to make sure our decision model is complete: what must this investment accomplish, what would make us pass, and which assumption still needs proof?",
  },
  {
    id: "seller-options",
    source: "Tyler's Training Time",
    title: "Lead sellers with options, not a listing pitch",
    insight: "A credible STR seller conversation compares hold, improve, and sell/redeploy choices against the owner’s objective and the available operating evidence.",
    coachingMove: "Have the agent prepare one short seller equity-and-options brief that names the owner’s goal, data gaps, viable options, and the next decision appointment.",
    exactLanguage: "Let’s first decide whether holding, improving, or selling best serves your capital and lifestyle goals. Then we can build the right plan instead of defaulting to a listing conversation.",
  },
  {
    id: "daily-operating-blocks",
    source: "Savvy Top Agent Guide",
    title: "Protect the work that creates future business",
    insight: "Top-agent execution protects market intelligence, educational content, prospecting/follow-up, consultations, opportunity work, CRM discipline, and future-business time—even when active deals are busy.",
    coachingMove: "Ask the agent to block one non-negotiable 30-minute future-business window today and define its output before the day begins.",
    exactLanguage: "What high-value action will still happen today even if transactions get busy, and what visible output will prove that it happened?",
  },
  {
    id: "teach-the-market",
    source: "Savvy Top Agent Guide",
    title: "Create authority by teaching investors how to think",
    insight: "The most useful STR content clarifies a real market, deal, owner, or risk question; it does not merely promote inventory or an agent.",
    coachingMove: "Have the agent publish or outline one 90-second educational market observation tied to an investor question they heard this week.",
    exactLanguage: "Here is what I like, here is what concerns me, what still needs verification, and the next decision this evidence supports.",
  },
  {
    id: "opportunity-pipeline",
    source: "Savvy Top Agent Guide",
    title: "Build an investable opportunity pipeline",
    insight: "Top agents curate properties with a thesis, investor avatar, risks, and next diligence step rather than waiting for clients to forward random listings.",
    coachingMove: "Require one agent to add or refresh one opportunity record today with a buyer avatar, thesis, primary risk, and named next diligence step.",
    exactLanguage: "I know why this could fit this investor, what has to be true for it to work, and the next fact we need before recommending it.",
  },
  {
    id: "delegate-low-value-work",
    source: "Savvy Top Agent Guide",
    title: "Treat delegation as protection for client-facing work",
    insight: "The hiring signal is not feeling busy; it is repeatedly losing conversations, follow-up, content, consultations, opportunity creation, negotiation, or relationships to work someone else could own.",
    coachingMove: "Ask the agent to name one recurring low-value task, a handoff owner, a quality standard, and a one-week test.",
    exactLanguage: "What work are you still doing that no longer requires you, and which client-facing activity will the recovered time protect this week?",
  },
] as const;

type TrainingPlay = typeof TRAINING_PLAYS[number];

const MARKET_ANGLES = [
  {
    id: "supply-discipline",
    title: "Lead with differentiated underwriting as supply expands",
    context: "AirDNA’s 2026 outlook expects STR supply to reaccelerate while national demand growth slows, making generic revenue narratives less persuasive.",
    actionToday: "Coach one agent to replace a broad STR promise with a property-specific guest promise, supply-risk assessment, downside case, and one assumption still to verify.",
    clientLanguage: "National context can inform our questions, but it cannot decide this property for us. Let’s test the guest demand, operating plan, downside case, and the assumption that matters most to your buy box.",
  },
  {
    id: "shoulder-season",
    title: "Use shoulder-season planning to deepen the advisor conversation",
    context: "RedAwning’s 2026 forecast highlights year-round attention, smarter pricing, and shoulder-season opportunity as part of maturing STR operations.",
    actionToday: "Have an agent add a shoulder-season demand question to one active underwriting or listing strategy conversation rather than relying only on peak-period revenue.",
    clientLanguage: "Before we rely on the headline season, let’s understand what supports demand outside of it and what operational plan makes that realistic.",
  },
  {
    id: "quality-moat",
    title: "Sell the quality moat, not the category label",
    context: "Current STR outlooks emphasize stronger differentiation through guest experience, reliable operations, review strength, and risk management as the market matures.",
    actionToday: "Coach an agent to identify the specific guest experience or operating edge that makes one property or listing more defensible than a generic STR comp set.",
    clientLanguage: "The question is not simply whether this can be a short-term rental. The question is what experience, operating standard, and evidence make it competitive for the guest we want.",
  },
  {
    id: "world-cup-context",
    title: "Use event demand as a scenario, never as a guarantee",
    context: "AirDNA notes that 2026 World Cup activity may support inbound travel interest, but event effects are location- and timing-specific.",
    actionToday: "Have agents distinguish a verified event-driven scenario from the base underwriting case and document the date, location, and evidence required before using it in a client conversation.",
    clientLanguage: "An event may create upside, but our base decision should still work without assuming a one-time demand spike. Let’s verify the location, timing, and comparable evidence first.",
  },
  {
    id: "six-percent-mortgage",
    title: "Make financing assumptions explicit",
    context: "AirDNA’s national outlook expects mortgage rates to remain around 6%, reinforcing the need to test cash, reserves, furnishing, and debt-service assumptions in every buy box.",
    actionToday: "Coach one agent to review a buyer’s total capital plan—not only purchase price—and to name the financing or reserve variable that would change the recommendation.",
    clientLanguage: "Before we fall in love with the price, let’s confirm the full capital plan: debt service, reserves, closing, furnishing, and the contingency that protects your strategy.",
  },
] as const;
type MarketAngle = typeof MARKET_ANGLES[number];

type Row = Record<string, unknown>;
type AgentSnapshot = {
  agentId: number;
  agentName: string;
  coachName: string | null;
  performanceStatus: string | null;
  diagnosis: string | null;
  developmentPriority: string | null;
  closed30d: number;
  closed90d: number;
  closed90dVolume: number;
  avgPrice90d: number | null;
  underContract: number;
  underContractVolume: number;
  buyerAvgRate12m: number | null;
  buyerRateDeals12m: number;
  sellerAvgRate12m: number | null;
  sellerRateDeals12m: number;
};
type RateDeal = {
  transactionId: number;
  agentId: number;
  agentName: string;
  transactionType: "buyer" | "seller";
  status: string;
  purchasePrice: number | null;
  commissionRate: number;
  closingDate: string | null;
};
type CoachingSnapshot = {
  generatedAt: string;
  company: {
    activeAgents: number;
    agentsWithCurrentProduction: number;
    closed30d: number;
    closed90d: number;
    closed90dVolume: number;
    averageClosedPrice90d: number | null;
    underContractUnits: number;
    underContractVolume: number;
    buyerBenchmark: number | null;
    buyerBenchmarkDeals: number;
    sellerBenchmark: number | null;
    sellerBenchmarkDeals: number;
    noCurrentProduction: number;
  };
  agents: AgentSnapshot[];
  rateDeals: RateDeal[];
};
type BriefingRotation = {
  primaryTheme: FocusTheme;
  secondaryTheme: FocusTheme;
  trainingPlayId: string;
  marketAngleId: string;
  namedAgentIds: number[];
  reviewedTransactionIds: number[];
  historyLookback: number;
};
type CoachConversation = {
  agentId: number;
  title: string;
  evidence: string;
  actionToday: string;
  coachQuestion: string;
  actionPath: string;
};
type BriefingContent = {
  subject: string;
  opening: string;
  companyNarrative: string;
  conversations: CoachConversation[];
  commissionTitle: string;
  commissionNarrative: string;
  commissionReviewIds: number[];
  marketTitle: string;
  marketNarrative: string;
  marketAction: string;
  marketClientLanguage: string;
  playTitle: string;
  playNarrative: string;
  playAction: string;
  playExactLanguage: string;
  leverageReflection: string;
  close: string;
};
type HistoryItem = {
  reportDate: string;
  rotation: Partial<BriefingRotation> | null;
  content: Partial<BriefingContent> | null;
};

function asNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function rowList<T extends Row = Row>(result: unknown): T[] {
  if (Array.isArray(result) && Array.isArray(result[0])) return result[0] as T[];
  return Array.isArray(result) ? result as T[] : [];
}

async function runRows<T extends Row = Row>(statement: ReturnType<typeof sql>): Promise<T[]> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available for Coaching Tips For Today.");
  const result = await (db as unknown as { execute: (query: ReturnType<typeof sql>) => Promise<unknown> }).execute(statement);
  return rowList<T>(result);
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatMoney(value: number | null | undefined): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(value ?? 0));
}

function formatPercent(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : `${Number(value).toFixed(2)}%`;
}

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, maxLength) : "";
}

function stableIndex(seed: string, length: number): number {
  let hash = 0;
  for (const character of seed) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return length ? hash % length : 0;
}

function historyIds(history: HistoryItem[], key: "primaryTheme" | "secondaryTheme" | "trainingPlayId" | "marketAngleId", limit = HISTORY_LOOKBACK): string[] {
  return history.slice(0, limit).flatMap((item) => {
    const value = item.rotation?.[key];
    return typeof value === "string" ? [value] : [];
  });
}

function chooseLeastRecentlyUsed<T extends { id: string }>(items: readonly T[], used: string[], reportDate: string): T {
  const counts = new Map<string, number>();
  used.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1));
  const minimum = Math.min(...items.map((item) => counts.get(item.id) ?? 0));
  const eligible = items.filter((item) => (counts.get(item.id) ?? 0) === minimum);
  return eligible[stableIndex(reportDate, eligible.length)]!;
}

function chooseTheme(history: HistoryItem[], reportDate: string, excluded: FocusTheme[] = []): FocusTheme {
  const candidates = FOCUS_THEMES
    .filter((theme) => !excluded.includes(theme))
    .map((id) => ({ id }));
  const used = [
    ...historyIds(history, "primaryTheme"),
    ...historyIds(history, "secondaryTheme"),
  ];
  return chooseLeastRecentlyUsed(candidates, used, reportDate).id as FocusTheme;
}

function recentlyNamedAgentIds(history: HistoryItem[]): Set<number> {
  const ids = new Set<number>();
  history.slice(0, AGENT_COOLDOWN_RUNS).forEach((item) => {
    item.rotation?.namedAgentIds?.forEach((id) => ids.add(Number(id)));
  });
  return ids;
}

function recentlyReviewedDealIds(history: HistoryItem[]): Set<number> {
  const ids = new Set<number>();
  history.slice(0, DEAL_COOLDOWN_RUNS).forEach((item) => {
    item.rotation?.reviewedTransactionIds?.forEach((id) => ids.add(Number(id)));
  });
  return ids;
}

function directAgentPath(agentId: number): string {
  return `/coaching/agent/${agentId}`;
}

function validActionPath(value: string, fallback: string): string {
  return value.startsWith("/coaching/agent/") || value === "/coaching" || value.startsWith("/transactions/")
    ? value
    : fallback;
}

function scoreAgentForTheme(agent: AgentSnapshot, theme: FocusTheme, company: CoachingSnapshot["company"]): number {
  const statusScore = agent.performanceStatus === "Red" ? 8 : agent.performanceStatus === "Yellow" ? 5 : agent.performanceStatus === "Launch" ? 2 : 0;
  const diagnosisScore = agent.diagnosis === "Capacity" ? 4 : agent.diagnosis === "Cadence" ? 3 : agent.diagnosis === "Commitment" ? 2 : agent.diagnosis === "Capability" ? 2 : 0;
  const rateGap = Math.max(
    agent.buyerAvgRate12m !== null && company.buyerBenchmark ? company.buyerBenchmark - agent.buyerAvgRate12m : 0,
    agent.sellerAvgRate12m !== null && company.sellerBenchmark ? company.sellerBenchmark - agent.sellerAvgRate12m : 0,
  );

  switch (theme) {
    case "units_and_pipeline": return (agent.closed90d === 0 && agent.underContract === 0 ? 18 : 0) + agent.underContract * 2 + statusScore;
    case "premium_positioning": return (agent.avgPrice90d !== null && company.averageClosedPrice90d && agent.avgPrice90d < company.averageClosedPrice90d ? 8 : 0) + agent.closed90d * 2 + agent.underContract;
    case "commission_value": return Math.max(0, rateGap * 10) + agent.buyerRateDeals12m / 4 + agent.sellerRateDeals12m / 4;
    case "advisor_quality": return statusScore + diagnosisScore + (agent.closed90d === 0 && agent.underContract > 0 ? 5 : 0);
    case "capacity_and_leverage": return (agent.diagnosis === "Capacity" ? 15 : 0) + agent.underContract * 2 + agent.closed90d;
    case "launch_cadence": return (agent.performanceStatus === "Launch" ? 12 : 0) + (agent.closed90d === 0 && agent.underContract === 0 ? 10 : 0) + diagnosisScore;
  }
}

function selectConversationAgents(snapshot: CoachingSnapshot, theme: FocusTheme, history: HistoryItem[]): AgentSnapshot[] {
  const recentlyNamed = recentlyNamedAgentIds(history);
  const scored = snapshot.agents
    .filter((agent) => agent.agentName !== "Savvy Agent")
    .map((agent) => ({ agent, score: scoreAgentForTheme(agent, theme, snapshot.company) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || right.agent.underContract - left.agent.underContract || right.agent.closed90d - left.agent.closed90d || left.agent.agentName.localeCompare(right.agent.agentName));
  const fresh = scored.filter((item) => !recentlyNamed.has(item.agent.agentId));
  return (fresh.length >= 2 ? fresh : scored).slice(0, 3).map((item) => item.agent);
}

function evidenceFor(agent: AgentSnapshot, theme: FocusTheme, company: CoachingSnapshot["company"]): string {
  if (theme === "commission_value") {
    const facts: string[] = [];
    if (agent.buyerAvgRate12m !== null && agent.buyerRateDeals12m >= 3 && company.buyerBenchmark && agent.buyerAvgRate12m < company.buyerBenchmark) {
      facts.push(`Buyer-side average ${formatPercent(agent.buyerAvgRate12m)} across ${agent.buyerRateDeals12m} closed percentage-rate deals, compared with ${formatPercent(company.buyerBenchmark)} companywide.`);
    }
    if (agent.sellerAvgRate12m !== null && agent.sellerRateDeals12m >= 2 && company.sellerBenchmark && agent.sellerAvgRate12m < company.sellerBenchmark) {
      facts.push(`Seller-side average ${formatPercent(agent.sellerAvgRate12m)} across ${agent.sellerRateDeals12m} closed percentage-rate deals, compared with ${formatPercent(company.sellerBenchmark)} companywide.`);
    }
    return facts.join(" ") || "Review the next representation conversation for the value exchange, agreement clarity, and deal-specific constraints.";
  }
  const facts = [
    agent.closed90d ? `${agent.closed90d} closed unit${agent.closed90d === 1 ? "" : "s"} in 90 days${agent.closed90dVolume ? ` (${formatMoney(agent.closed90dVolume)})` : ""}` : "No closed units in the last 90 days",
    agent.underContract ? `${agent.underContract} unit${agent.underContract === 1 ? "" : "s"} under contract${agent.underContractVolume ? ` (${formatMoney(agent.underContractVolume)})` : ""}` : "no current under-contract unit",
  ];
  if (agent.performanceStatus) facts.push(`${agent.performanceStatus} coaching profile`);
  if (agent.diagnosis) facts.push(`current diagnosis: ${agent.diagnosis}`);
  return `${facts.join("; ")}.`;
}

function moveFor(agent: AgentSnapshot, theme: FocusTheme): { title: string; action: string; question: string } {
  switch (theme) {
    case "units_and_pipeline":
      return {
        title: `${agent.agentName}: turn the next conversation into a defined pipeline milestone`,
        action: "Choose one active prospect or opportunity and define the next appointment, the client commitment, the advisor action, and the deadline. Record the milestone before the day ends.",
        question: "What specific client decision or commitment must happen next for this relationship to advance instead of simply stay active?",
      };
    case "premium_positioning":
      return {
        title: `${agent.agentName}: earn a larger transaction through sharper investor positioning`,
        action: "Review one active buy box and test whether the client’s capital plan, strategy, market flexibility, and pass conditions support a higher-value opportunity—or whether an unspoken constraint is narrowing the search.",
        question: "What client objective could justify a larger or more strategic acquisition, and what evidence would make that recommendation responsible?",
      };
    case "commission_value":
      return {
        title: `${agent.agentName}: make the value exchange explicit before compensation is discussed`,
        action: "Review one recent or active representation conversation. Identify when the agent explained agency, underwriting, opportunity curation, negotiation protection, and post-contract leadership. Improve the sequence before the next high-stakes conversation.",
        question: "At what moment did the client understand the work we will protect for them, and what deal context must we understand before changing or defending the rate?",
      };
    case "advisor_quality":
      return {
        title: `${agent.agentName}: strengthen the client’s next decision, not the volume of information`,
        action: "Open one active client file and name the goal, primary risk, remaining evidence to verify, and the single next decision. If any of those is unclear, reset the buy box or seller strategy before more property or listing work.",
        question: "What is the actual decision the client is avoiding, and what fact or fear must we clarify before asking them to move?",
      };
    case "capacity_and_leverage":
      return {
        title: `${agent.agentName}: protect client quality while production grows`,
        action: "Map one recurring task that delays client response or transaction leadership. Assign an owner, response standard, and one-week handoff test so the agent’s time returns to judgment, trust, strategy, and negotiation.",
        question: "Which recurring client-facing moment is delayed because only you can do it, and what is the smallest handoff that protects the client experience this week?",
      };
    case "launch_cadence":
      return {
        title: `${agent.agentName}: trade broad effort for a repeatable first-outcome cadence`,
        action: "Set a four-week operating lane: one investor avatar, one market question to master, one daily conversation block, and one weekly investable opportunity or seller strategy brief. Put each measure into the next coaching commitment.",
        question: "What single weekly behavior, repeated for four weeks, would most directly create your next qualified consultation or investable opportunity?",
      };
  }
}

async function getRecentHistory(): Promise<HistoryItem[]> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available for coaching briefing history.");
  const rows = await db.select({
    reportDate: dailyCoachingBriefings.reportDate,
    rotation: dailyCoachingBriefings.rotation,
    content: dailyCoachingBriefings.content,
  }).from(dailyCoachingBriefings).orderBy(desc(dailyCoachingBriefings.reportDate)).limit(HISTORY_LOOKBACK);
  return rows.map((row) => ({
    reportDate: row.reportDate,
    rotation: (row.rotation ?? null) as Partial<BriefingRotation> | null,
    content: (row.content ?? null) as Partial<BriefingContent> | null,
  }));
}

export async function buildCoachingTipsSnapshot(asOf = new Date()): Promise<CoachingSnapshot> {
  const [agentRows, benchmarkRows, companyRows, dealRows] = await Promise.all([
    runRows<Row>(sql`
      SELECT
        u.id AS agentId,
        COALESCE(NULLIF(TRIM(u.name), ''), CONCAT('Agent #', u.id)) AS agentName,
        coach.name AS coachName,
        cp.performanceStatus AS performanceStatus,
        cp.currentPrimaryDiagnosis AS diagnosis,
        cp.currentDevelopmentPriority AS developmentPriority,
        COALESCE(tx.closed30d, 0) AS closed30d,
        COALESCE(tx.closed90d, 0) AS closed90d,
        COALESCE(tx.closed90dVolume, 0) AS closed90dVolume,
        tx.avgPrice90d AS avgPrice90d,
        COALESCE(tx.underContract, 0) AS underContract,
        COALESCE(tx.underContractVolume, 0) AS underContractVolume,
        tx.buyerAvgRate12m AS buyerAvgRate12m,
        COALESCE(tx.buyerRateDeals12m, 0) AS buyerRateDeals12m,
        tx.sellerAvgRate12m AS sellerAvgRate12m,
        COALESCE(tx.sellerRateDeals12m, 0) AS sellerRateDeals12m
      FROM users u
      LEFT JOIN coaching_profiles cp ON cp.agentId = u.id
      LEFT JOIN users coach ON coach.id = cp.coachOfRecordId
      LEFT JOIN (
        SELECT
          agentId,
          SUM(CASE WHEN status = 'closed' AND closingDate >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) AS closed30d,
          SUM(CASE WHEN status = 'closed' AND closingDate >= DATE_SUB(NOW(), INTERVAL 90 DAY) THEN 1 ELSE 0 END) AS closed90d,
          SUM(CASE WHEN status = 'closed' AND closingDate >= DATE_SUB(NOW(), INTERVAL 90 DAY) THEN COALESCE(purchasePrice, 0) ELSE 0 END) AS closed90dVolume,
          AVG(CASE WHEN status = 'closed' AND closingDate >= DATE_SUB(NOW(), INTERVAL 90 DAY) THEN purchasePrice END) AS avgPrice90d,
          SUM(CASE WHEN status = 'under_contract' THEN 1 ELSE 0 END) AS underContract,
          SUM(CASE WHEN status = 'under_contract' THEN COALESCE(purchasePrice, 0) ELSE 0 END) AS underContractVolume,
          AVG(CASE WHEN status = 'closed' AND closingDate >= DATE_SUB(NOW(), INTERVAL 365 DAY) AND transactionType = 'buyer' AND commissionType = 'percentage' AND commissionRate > 0 THEN commissionRate * 100 END) AS buyerAvgRate12m,
          SUM(CASE WHEN status = 'closed' AND closingDate >= DATE_SUB(NOW(), INTERVAL 365 DAY) AND transactionType = 'buyer' AND commissionType = 'percentage' AND commissionRate > 0 THEN 1 ELSE 0 END) AS buyerRateDeals12m,
          AVG(CASE WHEN status = 'closed' AND closingDate >= DATE_SUB(NOW(), INTERVAL 365 DAY) AND transactionType = 'seller' AND commissionType = 'percentage' AND commissionRate > 0 THEN commissionRate * 100 END) AS sellerAvgRate12m,
          SUM(CASE WHEN status = 'closed' AND closingDate >= DATE_SUB(NOW(), INTERVAL 365 DAY) AND transactionType = 'seller' AND commissionType = 'percentage' AND commissionRate > 0 THEN 1 ELSE 0 END) AS sellerRateDeals12m
        FROM transactions
        GROUP BY agentId
      ) tx ON tx.agentId = u.id
      WHERE u.role = 'agent' AND u.isActive = 1
      ORDER BY closed90dVolume DESC, agentName ASC
    `),
    runRows<Row>(sql`
      SELECT transactionType, AVG(commissionRate * 100) AS averageRate, COUNT(*) AS dealCount
      FROM transactions
      WHERE status = 'closed' AND closingDate >= DATE_SUB(NOW(), INTERVAL 365 DAY)
        AND transactionType IN ('buyer', 'seller')
        AND commissionType = 'percentage' AND commissionRate > 0
      GROUP BY transactionType
    `),
    runRows<Row>(sql`
      SELECT
        COUNT(*) AS activeAgents,
        SUM(CASE WHEN tx.closed90d > 0 OR tx.underContract > 0 THEN 1 ELSE 0 END) AS agentsWithCurrentProduction,
        COALESCE(SUM(tx.closed30d), 0) AS closed30d,
        COALESCE(SUM(tx.closed90d), 0) AS closed90d,
        COALESCE(SUM(tx.closed90dVolume), 0) AS closed90dVolume,
        SUM(tx.closed90dVolume) / NULLIF(SUM(tx.closed90d), 0) AS averageClosedPrice90d,
        COALESCE(SUM(tx.underContract), 0) AS underContractUnits,
        COALESCE(SUM(tx.underContractVolume), 0) AS underContractVolume,
        SUM(CASE WHEN COALESCE(tx.closed90d, 0) = 0 AND COALESCE(tx.underContract, 0) = 0 THEN 1 ELSE 0 END) AS noCurrentProduction
      FROM users u
      LEFT JOIN (
        SELECT
          agentId,
          SUM(CASE WHEN status = 'closed' AND closingDate >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) AS closed30d,
          SUM(CASE WHEN status = 'closed' AND closingDate >= DATE_SUB(NOW(), INTERVAL 90 DAY) THEN 1 ELSE 0 END) AS closed90d,
          SUM(CASE WHEN status = 'closed' AND closingDate >= DATE_SUB(NOW(), INTERVAL 90 DAY) THEN COALESCE(purchasePrice, 0) ELSE 0 END) AS closed90dVolume,
          AVG(CASE WHEN status = 'closed' AND closingDate >= DATE_SUB(NOW(), INTERVAL 90 DAY) THEN purchasePrice END) AS avgPrice90d,
          SUM(CASE WHEN status = 'under_contract' THEN 1 ELSE 0 END) AS underContract,
          SUM(CASE WHEN status = 'under_contract' THEN COALESCE(purchasePrice, 0) ELSE 0 END) AS underContractVolume
        FROM transactions
        GROUP BY agentId
      ) tx ON tx.agentId = u.id
      WHERE u.role = 'agent' AND u.isActive = 1
    `),
    runRows<Row>(sql`
      SELECT
        t.id AS transactionId, t.agentId,
        COALESCE(NULLIF(TRIM(u.name), ''), CONCAT('Agent #', u.id)) AS agentName,
        t.transactionType, t.status, t.purchasePrice, t.commissionRate * 100 AS commissionRate,
        DATE_FORMAT(t.closingDate, '%Y-%m-%d') AS closingDate
      FROM transactions t
      INNER JOIN users u ON u.id = t.agentId
      WHERE u.role = 'agent' AND u.isActive = 1
        AND t.transactionType IN ('buyer', 'seller')
        AND t.commissionType = 'percentage' AND t.commissionRate > 0
        AND (t.status = 'under_contract' OR (t.status = 'closed' AND t.closingDate >= DATE_SUB(NOW(), INTERVAL 90 DAY)))
      ORDER BY t.status = 'under_contract' DESC, t.commissionRate ASC, t.purchasePrice DESC
      LIMIT 100
    `),
  ]);

  const benchmark = new Map(benchmarkRows.map((row) => [String(row.transactionType), { averageRate: nullableNumber(row.averageRate), deals: asNumber(row.dealCount) }]));
  const agents = agentRows.map((row): AgentSnapshot => ({
    agentId: asNumber(row.agentId), agentName: String(row.agentName ?? "Unknown"), coachName: row.coachName ? String(row.coachName).trim() : null,
    performanceStatus: row.performanceStatus ? String(row.performanceStatus) : null, diagnosis: row.diagnosis ? String(row.diagnosis) : null,
    developmentPriority: row.developmentPriority ? cleanText(row.developmentPriority, 240) : null,
    closed30d: asNumber(row.closed30d), closed90d: asNumber(row.closed90d), closed90dVolume: asNumber(row.closed90dVolume), avgPrice90d: nullableNumber(row.avgPrice90d),
    underContract: asNumber(row.underContract), underContractVolume: asNumber(row.underContractVolume),
    buyerAvgRate12m: nullableNumber(row.buyerAvgRate12m), buyerRateDeals12m: asNumber(row.buyerRateDeals12m),
    sellerAvgRate12m: nullableNumber(row.sellerAvgRate12m), sellerRateDeals12m: asNumber(row.sellerRateDeals12m),
  }));
  const companyRow = companyRows[0] ?? {};
  const company = {
    activeAgents: asNumber(companyRow.activeAgents), agentsWithCurrentProduction: asNumber(companyRow.agentsWithCurrentProduction),
    closed30d: asNumber(companyRow.closed30d), closed90d: asNumber(companyRow.closed90d), closed90dVolume: asNumber(companyRow.closed90dVolume),
    averageClosedPrice90d: nullableNumber(companyRow.averageClosedPrice90d), underContractUnits: asNumber(companyRow.underContractUnits), underContractVolume: asNumber(companyRow.underContractVolume),
    buyerBenchmark: benchmark.get("buyer")?.averageRate ?? null, buyerBenchmarkDeals: benchmark.get("buyer")?.deals ?? 0,
    sellerBenchmark: benchmark.get("seller")?.averageRate ?? null, sellerBenchmarkDeals: benchmark.get("seller")?.deals ?? 0,
    noCurrentProduction: asNumber(companyRow.noCurrentProduction),
  };
  const rateDeals = dealRows.map((row): RateDeal => ({
    transactionId: asNumber(row.transactionId), agentId: asNumber(row.agentId), agentName: String(row.agentName ?? "Unknown"),
    transactionType: String(row.transactionType) === "seller" ? "seller" : "buyer", status: String(row.status ?? "under_contract"),
    purchasePrice: nullableNumber(row.purchasePrice), commissionRate: asNumber(row.commissionRate), closingDate: row.closingDate ? String(row.closingDate) : null,
  })).filter((deal) => {
    const baseline = deal.transactionType === "buyer" ? company.buyerBenchmark : company.sellerBenchmark;
    return Boolean(baseline && deal.commissionRate <= baseline - 0.5);
  });

  return { generatedAt: asOf.toISOString(), company, agents, rateDeals };
}

function selectRotation(snapshot: CoachingSnapshot, history: HistoryItem[], reportDate: string): BriefingRotation {
  const primaryTheme = chooseTheme(history, reportDate);
  const secondaryTheme = chooseTheme(history, `${reportDate}:secondary`, [primaryTheme]);
  const trainingPlay = chooseLeastRecentlyUsed(TRAINING_PLAYS, historyIds(history, "trainingPlayId"), reportDate);
  const marketAngle = chooseLeastRecentlyUsed(MARKET_ANGLES, historyIds(history, "marketAngleId"), reportDate);
  const primaryAgents = selectConversationAgents(snapshot, primaryTheme, history).slice(0, 2);
  const secondaryAgents = selectConversationAgents(snapshot, secondaryTheme, history)
    .filter((candidate) => !primaryAgents.some((primary) => primary.agentId === candidate.agentId));
  const namedAgents = [...primaryAgents, ...secondaryAgents].slice(0, 3);
  const recentlyReviewed = recentlyReviewedDealIds(history);
  const reviewDeal = snapshot.rateDeals.find((deal) => !recentlyReviewed.has(deal.transactionId));
  return {
    primaryTheme,
    secondaryTheme,
    trainingPlayId: trainingPlay.id,
    marketAngleId: marketAngle.id,
    namedAgentIds: namedAgents.map((agent) => agent.agentId),
    reviewedTransactionIds: reviewDeal ? [reviewDeal.transactionId] : [],
    historyLookback: history.length,
  };
}

function deterministicContent(snapshot: CoachingSnapshot, rotation: BriefingRotation): BriefingContent {
  const primaryAgents = selectConversationAgents(snapshot, rotation.primaryTheme, []).slice(0, 2);
  const secondaryAgents = selectConversationAgents(snapshot, rotation.secondaryTheme, [])
    .filter((agent) => !primaryAgents.some((primary) => primary.agentId === agent.agentId));
  const selected = [...primaryAgents, ...secondaryAgents]
    .filter((agent) => rotation.namedAgentIds.includes(agent.agentId))
    .slice(0, 3);
  const conversations = selected.map((agent) => {
    const theme = primaryAgents.some((primary) => primary.agentId === agent.agentId) ? rotation.primaryTheme : rotation.secondaryTheme;
    const move = moveFor(agent, theme);
    return { agentId: agent.agentId, title: move.title, evidence: evidenceFor(agent, theme, snapshot.company), actionToday: move.action, coachQuestion: move.question, actionPath: directAgentPath(agent.agentId) };
  });
  const trainingPlay = TRAINING_PLAYS.find((play) => play.id === rotation.trainingPlayId) ?? TRAINING_PLAYS[0];
  const marketAngle = MARKET_ANGLES.find((angle) => angle.id === rotation.marketAngleId) ?? MARKET_ANGLES[0];
  const reviewDeals = snapshot.rateDeals.filter((deal) => rotation.reviewedTransactionIds.includes(deal.transactionId));
  const commissionNarrative = `Closed percentage-rate benchmarks: buyer side ${formatPercent(snapshot.company.buyerBenchmark)} across ${snapshot.company.buyerBenchmarkDeals} deals; seller side ${formatPercent(snapshot.company.sellerBenchmark)} across ${snapshot.company.sellerBenchmarkDeals} deals. These are descriptive company averages, not universal standards. Review the representation terms, deal constraints, and client value story before making any compensation judgment.`;
  return {
    subject: `Coaching Tips For Today | ${THEME_LABELS[rotation.primaryTheme]}`,
    opening: `Today’s primary coaching focus is ${THEME_LABELS[rotation.primaryTheme].toLowerCase()}. Use the data as a prompt for a better conversation, then leave every agent with one observable action, one owner, and one follow-up date.`,
    companyNarrative: `${snapshot.company.closed30d} units closed in the last 30 days, while ${snapshot.company.underContractUnits} units (${formatMoney(snapshot.company.underContractVolume)}) are currently under contract. ${snapshot.company.noCurrentProduction} active agents show neither a 90-day close nor a current contract, making simple leading-action cadence a leadership priority alongside transaction protection.`,
    conversations,
    commissionTitle: "Commission-value review: investigate before you instruct",
    commissionNarrative,
    commissionReviewIds: reviewDeals.map((deal) => deal.transactionId),
    marketTitle: marketAngle.title,
    marketNarrative: marketAngle.context,
    marketAction: marketAngle.actionToday,
    marketClientLanguage: marketAngle.clientLanguage,
    playTitle: trainingPlay.title,
    playNarrative: `${trainingPlay.source}: ${trainingPlay.insight}`,
    playAction: trainingPlay.coachingMove,
    playExactLanguage: trainingPlay.exactLanguage,
    leverageReflection: "Coach the behavior beneath the outcome. The right commitment should be precise enough to repeat, visible enough to verify, and small enough to complete before the next coaching conversation.",
    close: "Demand clarity, not performative activity. The questions coaches ask today become the operating standards agents repeat tomorrow.",
  };
}

function conciseContent(value: unknown, maxLength: number): string {
  const text = cleanText(value, maxLength);
  return text || "Review the related SavvyOS record and agree on the next measurable action.";
}

async function generateAiContent(snapshot: CoachingSnapshot, rotation: BriefingRotation, history: HistoryItem[], fallback: BriefingContent): Promise<BriefingContent> {
  const allowedAgents = snapshot.agents.filter((agent) => rotation.namedAgentIds.includes(agent.agentId));
  const recentTitles = history.slice(0, 5).flatMap((entry) => entry.content?.conversations?.map((item) => item.title).filter((item): item is string => typeof item === "string") ?? []);
  const trainingPlay = TRAINING_PLAYS.find((play) => play.id === rotation.trainingPlayId) ?? TRAINING_PLAYS[0];
  const marketAngle = MARKET_ANGLES.find((angle) => angle.id === rotation.marketAngleId) ?? MARKET_ANGLES[0];
  const reviewDeals = snapshot.rateDeals.filter((deal) => rotation.reviewedTransactionIds.includes(deal.transactionId));
  const prompt = {
    role: "You are an evidence-first executive coach for short-term-rental investment real-estate agents.",
    purpose: "Write a concise leadership email that prompts coaches to take specific, humane actions today to increase units, price-point quality, commission-value defense, advisor quality, and professional leverage.",
    strictTruthRules: [
      "Use only the supplied SavvyOS facts. Never invent clients, property addresses, lead behavior, task behavior, markets, revenue, deal rationale, or agent motivation.",
      "Name an agent only from the allowed list. A performance status or diagnosis is a coaching prompt, not a statement about character.",
      "Do not include client PII, property addresses, referral information, private personal details, tax/legal/insurance/financing advice, or property-performance promises.",
      "Commission benchmarks are descriptive closed-deal averages. Recommend reviewing deal context and representation terms before judging, defending, or changing a rate.",
      "Treat national STR statements as contextual education only, never as a local forecast or property-level performance guarantee.",
      "Make this edition materially distinct from the recent titles supplied; focus on the selected rotation rather than repeating the same agent or wording.",
    ],
    rotation: {
      primaryTheme: THEME_LABELS[rotation.primaryTheme],
      secondaryTheme: THEME_LABELS[rotation.secondaryTheme],
      trainingPlay,
      marketAngle,
      avoidRecentTitles: recentTitles,
    },
    company: snapshot.company,
    allowedAgents: allowedAgents.map((agent) => ({ ...agent, actionPath: directAgentPath(agent.agentId) })),
    commissionReviewDeals: reviewDeals,
    fallbackConcepts: fallback,
  };
  try {
    const result = await invokeLLM({
      model: AI_MODEL,
      maxTokens: 2200,
      responseFormat: {
        type: "json_schema",
        json_schema: {
          name: "daily_coaching_briefing",
          strict: true,
          schema: {
            type: "object",
            properties: {
              subject: { type: "string" }, opening: { type: "string" }, companyNarrative: { type: "string" },
              conversations: {
                type: "array", minItems: 1, maxItems: 3,
                items: { type: "object", properties: {
                  agentId: { type: "integer" }, title: { type: "string" }, evidence: { type: "string" }, actionToday: { type: "string" }, coachQuestion: { type: "string" }, actionPath: { type: "string" },
                }, required: ["agentId", "title", "evidence", "actionToday", "coachQuestion", "actionPath"], additionalProperties: false },
              },
              commissionTitle: { type: "string" }, commissionNarrative: { type: "string" },
              marketTitle: { type: "string" }, marketNarrative: { type: "string" }, marketAction: { type: "string" }, marketClientLanguage: { type: "string" },
              playTitle: { type: "string" }, playNarrative: { type: "string" }, playAction: { type: "string" }, playExactLanguage: { type: "string" },
              leverageReflection: { type: "string" }, close: { type: "string" },
            },
            required: ["subject", "opening", "companyNarrative", "conversations", "commissionTitle", "commissionNarrative", "marketTitle", "marketNarrative", "marketAction", "marketClientLanguage", "playTitle", "playNarrative", "playAction", "playExactLanguage", "leverageReflection", "close"],
            additionalProperties: false,
          },
        },
      },
      messages: [
        { role: "system", content: "Return only strict JSON. Prioritize accurate, coach-ready next actions over motivational filler." },
        { role: "user", content: JSON.stringify(prompt) },
      ],
    });
    const raw = result.choices[0]?.message?.content;
    const parsed = JSON.parse(typeof raw === "string" ? raw : "") as Omit<BriefingContent, "commissionReviewIds">;
    const allowedById = new Map(allowedAgents.map((agent) => [agent.agentId, agent]));
    const conversations = Array.isArray(parsed.conversations) ? parsed.conversations
      .filter((item) => item && allowedById.has(Number(item.agentId)))
      .filter((item, index, array) => array.findIndex((candidate) => Number(candidate.agentId) === Number(item.agentId)) === index)
      .slice(0, 3)
      .map((item) => ({
        agentId: Number(item.agentId), title: conciseContent(item.title, 140), evidence: conciseContent(item.evidence, 360), actionToday: conciseContent(item.actionToday, 440), coachQuestion: conciseContent(item.coachQuestion, 260),
        actionPath: validActionPath(String(item.actionPath ?? ""), directAgentPath(Number(item.agentId))),
      })) : [];
    if (!conversations.length) return fallback;
    return {
      subject: conciseContent(parsed.subject, 150), opening: conciseContent(parsed.opening, 340), companyNarrative: conciseContent(parsed.companyNarrative, 420), conversations,
      commissionTitle: conciseContent(parsed.commissionTitle, 140), commissionNarrative: conciseContent(parsed.commissionNarrative, 500), commissionReviewIds: fallback.commissionReviewIds,
      marketTitle: conciseContent(parsed.marketTitle, 140), marketNarrative: conciseContent(parsed.marketNarrative, 480), marketAction: conciseContent(parsed.marketAction, 420), marketClientLanguage: conciseContent(parsed.marketClientLanguage, 320),
      playTitle: conciseContent(parsed.playTitle, 140), playNarrative: conciseContent(parsed.playNarrative, 440), playAction: conciseContent(parsed.playAction, 420), playExactLanguage: conciseContent(parsed.playExactLanguage, 320),
      leverageReflection: conciseContent(parsed.leverageReflection, 360), close: conciseContent(parsed.close, 260),
    };
  } catch (error) {
    console.warn("[CoachingTips] AI narrative unavailable; using rotated evidence-first fallback.", error);
    return fallback;
  }
}

export async function buildDailyCoachingBriefing(
  asOf = new Date(),
  options: { includeAi?: boolean } = {},
): Promise<{ reportDate: string; snapshot: CoachingSnapshot; rotation: BriefingRotation; content: BriefingContent; usedAi: boolean }> {
  const reportDate = easternDateKey(getEasternTimeParts(asOf));
  const [snapshot, history] = await Promise.all([buildCoachingTipsSnapshot(asOf), getRecentHistory()]);
  const rotation = selectRotation(snapshot, history, reportDate);
  const fallback = deterministicContent(snapshot, rotation);
  const content = options.includeAi === false ? fallback : await generateAiContent(snapshot, rotation, history, fallback);
  return { reportDate, snapshot, rotation, content, usedAi: content !== fallback };
}

function metricCard(value: string, label: string, note: string, color = "#0F172A"): string {
  return `<td width="25%" style="padding:5px;vertical-align:top;"><table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="border:1px solid #E6EAF0;border-radius:8px;background:#FFFFFF;"><tr><td style="padding:13px 11px;"><div style="font-size:19px;line-height:1.1;font-weight:800;color:${color};">${escapeHtml(value)}</div><div style="margin-top:5px;font-size:10px;line-height:1.3;font-weight:800;letter-spacing:.35px;text-transform:uppercase;color:#475569;">${escapeHtml(label)}</div><div style="margin-top:4px;font-size:10px;line-height:1.4;color:#64748B;">${escapeHtml(note)}</div></td></tr></table></td>`;
}

function conversationCard(conversation: CoachConversation): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin:0 0 11px;border:1px solid #E6EAF0;border-left:4px solid #0FC0DF;border-radius:8px;background:#FFFFFF;"><tr><td style="padding:13px 14px;"><div style="font-size:14px;line-height:1.32;font-weight:800;color:#0F172A;">${escapeHtml(conversation.title)}</div><div style="margin-top:6px;font-size:12px;line-height:1.55;color:#475569;"><strong style="color:#1E293B;">What SavvyOS shows:</strong> ${escapeHtml(conversation.evidence)}</div><div style="margin-top:7px;font-size:12px;line-height:1.55;color:#334155;"><strong style="color:#1E293B;">Coach move today:</strong> ${escapeHtml(conversation.actionToday)}</div><div style="margin-top:8px;padding:9px 10px;border-radius:6px;background:#F8FAFC;font-size:12px;line-height:1.5;color:#1E293B;"><strong>Ask:</strong> “${escapeHtml(conversation.coachQuestion)}”</div><a href="${escapeHtml(`${APP_URL}${conversation.actionPath}`)}" style="display:inline-block;margin-top:9px;color:#0284C7;text-decoration:none;font-size:12px;font-weight:800;">Open coaching record →</a></td></tr></table>`;
}

export function renderDailyCoachingTipsHtml(briefing: { reportDate: string; snapshot: CoachingSnapshot; rotation: BriefingRotation; content: BriefingContent; usedAi: boolean }): string {
  const { snapshot, rotation, content } = briefing;
  const reviewDeals = snapshot.rateDeals.filter((deal) => content.commissionReviewIds.includes(deal.transactionId));
  const dealRows = reviewDeals.length ? reviewDeals.map((deal) => `<tr><td style="padding:8px;border-bottom:1px solid #E6EAF0;font-size:11px;font-weight:700;color:#0F172A;">${escapeHtml(deal.agentName)}</td><td style="padding:8px;border-bottom:1px solid #E6EAF0;font-size:11px;color:#475569;text-transform:capitalize;">${escapeHtml(deal.transactionType)}</td><td style="padding:8px;border-bottom:1px solid #E6EAF0;font-size:11px;color:#475569;">${escapeHtml(formatMoney(deal.purchasePrice))}</td><td style="padding:8px;border-bottom:1px solid #E6EAF0;font-size:11px;font-weight:800;color:#B45309;">${escapeHtml(formatPercent(deal.commissionRate))}</td><td style="padding:8px;border-bottom:1px solid #E6EAF0;font-size:11px;"><a href="${escapeHtml(`${APP_URL}/transactions/${deal.transactionId}`)}" style="color:#0284C7;font-weight:700;text-decoration:none;">Review deal →</a></td></tr>`).join("") : `<tr><td colspan="5" style="padding:10px;font-size:12px;color:#64748B;">No fresh rate review was selected today. Use the benchmark conversation to prepare the next value-defense coaching role-play.</td></tr>`;
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0F172A;"><div style="padding:24px 24px 20px;border-radius:11px 11px 0 0;background:#07131F;"><div style="font-size:10px;font-weight:800;letter-spacing:1.1px;text-transform:uppercase;color:#0FC0DF;">Savvy STR Agents · Leadership briefing</div><div style="margin-top:8px;font-size:27px;line-height:1.15;font-weight:850;letter-spacing:-.4px;color:#FFFFFF;">Coaching Tips For Today</div><div style="margin-top:8px;font-size:12px;line-height:1.5;color:#B8C7D6;">${escapeHtml(briefing.reportDate)} · Today’s primary rotation: ${escapeHtml(THEME_LABELS[rotation.primaryTheme])}</div></div><div style="padding:22px 24px 27px;border-radius:0 0 11px 11px;background:#FFFFFF;"><p style="margin:0 0 17px;font-size:14px;line-height:1.62;color:#334155;">${escapeHtml(content.opening)}</p><div style="margin:0 0 8px;font-size:15px;font-weight:850;color:#0F172A;">Company pulse</div><table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation"><tr>${metricCard(String(snapshot.company.closed30d), "Closed units · 30 days", "Recent execution", "#047857")}${metricCard(`${snapshot.company.closed90d} · ${formatMoney(snapshot.company.closed90dVolume)}`, "Closed · 90 days", `Avg. price ${formatMoney(snapshot.company.averageClosedPrice90d)}`)}${metricCard(`${snapshot.company.underContractUnits} · ${formatMoney(snapshot.company.underContractVolume)}`, "Under contract", "Conversion work in flight", "#0284C7")}${metricCard(String(snapshot.company.noCurrentProduction), "No 90-day close or UC", "Leading-action focus", "#B45309")}</tr></table><p style="margin:11px 0 22px;padding:10px 11px;border-radius:6px;background:#F8FAFC;font-size:12px;line-height:1.55;color:#475569;">${escapeHtml(content.companyNarrative)}</p><div style="margin:0 0 9px;font-size:16px;font-weight:850;color:#0F172A;">Today’s coaching conversations</div><p style="margin:0 0 11px;font-size:12px;line-height:1.5;color:#64748B;">Named conversations rotate across editions. They are coaching prompts, not verdicts about an agent or a deal.</p>${content.conversations.map(conversationCard).join("")}<div style="margin:25px 0 8px;font-size:16px;font-weight:850;color:#0F172A;">${escapeHtml(content.commissionTitle)}</div><p style="margin:0 0 9px;font-size:12px;line-height:1.58;color:#334155;">${escapeHtml(content.commissionNarrative)}</p><table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse;border:1px solid #E6EAF0;border-radius:8px;overflow:hidden;"><tr style="background:#F8FAFC;"><th style="padding:8px;text-align:left;font-size:10px;color:#475569;text-transform:uppercase;">Agent</th><th style="padding:8px;text-align:left;font-size:10px;color:#475569;text-transform:uppercase;">Side</th><th style="padding:8px;text-align:left;font-size:10px;color:#475569;text-transform:uppercase;">Price</th><th style="padding:8px;text-align:left;font-size:10px;color:#475569;text-transform:uppercase;">Rate</th><th style="padding:8px;text-align:left;font-size:10px;color:#475569;text-transform:uppercase;">Action</th></tr>${dealRows}</table><div style="margin:25px 0 8px;font-size:16px;font-weight:850;color:#0F172A;">Market-to-message move</div><table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="border:1px solid #BAE6FD;border-radius:8px;background:#F0F9FF;"><tr><td style="padding:13px 14px;"><div style="font-size:13px;font-weight:800;color:#0C4A6E;">${escapeHtml(content.marketTitle)}</div><div style="margin-top:6px;font-size:12px;line-height:1.58;color:#155E75;">${escapeHtml(content.marketNarrative)}</div><div style="margin-top:7px;font-size:12px;line-height:1.58;color:#155E75;"><strong>Coach move today:</strong> ${escapeHtml(content.marketAction)}</div><div style="margin-top:9px;padding:9px 10px;border-radius:6px;background:#FFFFFF;font-size:12px;line-height:1.55;color:#1E293B;"><strong>Client language:</strong> “${escapeHtml(content.marketClientLanguage)}”</div></td></tr></table><div style="margin:25px 0 8px;font-size:16px;font-weight:850;color:#0F172A;">Training playbook move</div><p style="margin:0;font-size:12px;line-height:1.58;color:#334155;"><strong>${escapeHtml(content.playTitle)}.</strong> ${escapeHtml(content.playNarrative)}</p><p style="margin:8px 0 0;font-size:12px;line-height:1.58;color:#334155;"><strong>Coach move today:</strong> ${escapeHtml(content.playAction)}</p><div style="margin-top:10px;padding:11px 12px;border-left:3px solid #0FC0DF;border-radius:6px;background:#F8FAFC;font-size:12px;line-height:1.58;color:#1E293B;"><strong>Exact language to role-play:</strong> “${escapeHtml(content.playExactLanguage)}”</div><div style="margin:24px 0 8px;font-size:16px;font-weight:850;color:#0F172A;">Leadership reflection</div><p style="margin:0;font-size:12px;line-height:1.58;color:#334155;">${escapeHtml(content.leverageReflection)}</p><p style="margin:20px 0 0;padding-top:14px;border-top:1px solid #E6EAF0;font-size:12px;line-height:1.58;color:#475569;">${escapeHtml(content.close)}</p><p style="margin:14px 0 0;font-size:10px;line-height:1.55;color:#94A3B8;">This is a decision-support coaching briefing built from current SavvyOS records. National STR context rotates among verified 2026 sources, including <a href="https://www.airdna.co/outlook-report" style="color:#0284C7;">AirDNA’s U.S. STR Outlook</a> and <a href="https://www.redawning.com/pm/post/2026-short-term-rental-market-forecast" style="color:#0284C7;">RedAwning’s STR Forecast</a>. Review the underlying SavvyOS record before acting. No market statement is a property-level performance, financing, legal, tax, insurance, or regulatory promise.</p></div></div>`;
}

async function getRecipients(): Promise<Array<{ id: number; name: string; email: string }>> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available for coaching-tip recipients.");
  const rows = await db.select({ id: users.id, name: users.name, email: users.email }).from(users)
    .where(sql`${users.isActive} = 1 AND ${users.email} IN (${sql.join(COACHING_TIPS_RECIPIENT_EMAILS.map((email) => sql`${email}`), sql`, `)})`);
  const byEmail = new Map(rows.filter((row) => row.email).map((row) => [row.email!.toLowerCase(), row]));
  const missing = COACHING_TIPS_RECIPIENT_EMAILS.filter((email) => !byEmail.has(email));
  if (missing.length) throw new Error(`Coaching Tips recipient account(s) missing or inactive: ${missing.join(", ")}`);
  return COACHING_TIPS_RECIPIENT_EMAILS.map((email) => {
    const row = byEmail.get(email)!;
    return { id: row.id, name: row.name?.trim() || email, email };
  });
}

async function claimReportRun(reportDate: string): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available for coaching-tip run tracking.");
  const [run] = await db.select().from(scheduledReportRuns).where(and(eq(scheduledReportRuns.reportKey, REPORT_KEY), eq(scheduledReportRuns.reportDate, reportDate))).limit(1);
  if (run?.status === "sent") return false;
  if (run?.status === "running" && Date.now() - run.startedAt.getTime() < STALE_RUN_MS) return false;
  if (run) {
    await db.update(scheduledReportRuns).set({ status: "running", startedAt: new Date(), completedAt: null, recipientCount: 0, successfulRecipientCount: 0, errorMessage: null }).where(eq(scheduledReportRuns.id, run.id));
  } else {
    try {
      await db.insert(scheduledReportRuns).values({ reportKey: REPORT_KEY, reportDate, status: "running", startedAt: new Date() });
    } catch {
      return false;
    }
  }
  return true;
}

async function finalizeReportRun(reportDate: string, status: "sent" | "partial" | "failed" | "skipped", recipientCount: number, successfulRecipientCount: number, errorMessage?: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(scheduledReportRuns).set({ status, recipientCount, successfulRecipientCount, errorMessage: errorMessage ?? null, completedAt: new Date() }).where(and(eq(scheduledReportRuns.reportKey, REPORT_KEY), eq(scheduledReportRuns.reportDate, reportDate)));
}

async function saveBriefing(briefing: { reportDate: string; snapshot: CoachingSnapshot; rotation: BriefingRotation; content: BriefingContent; usedAi: boolean }): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available for coaching briefing persistence.");
  await db.insert(dailyCoachingBriefings).values({
    reportDate: briefing.reportDate,
    snapshot: briefing.snapshot as unknown as Record<string, unknown>,
    rotation: briefing.rotation as unknown as Record<string, unknown>,
    content: briefing.content as unknown as Record<string, unknown>,
    aiModel: briefing.usedAi ? AI_MODEL : null,
    generatedAt: new Date(),
  }).onDuplicateKeyUpdate({
    set: {
      snapshot: briefing.snapshot as unknown as Record<string, unknown>, rotation: briefing.rotation as unknown as Record<string, unknown>, content: briefing.content as unknown as Record<string, unknown>,
      aiModel: briefing.usedAi ? AI_MODEL : null, generatedAt: new Date(), updatedAt: new Date(),
    },
  });
}

async function markBriefingSent(reportDate: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(dailyCoachingBriefings).set({ sentAt: new Date() }).where(eq(dailyCoachingBriefings.reportDate, reportDate));
}

/** Sends one weekday leadership email. Phil is primary and the other four leaders are copied together for Reply All. */
export async function sendDailyCoachingTips(asOf = new Date()): Promise<{ sent: boolean; skipped: boolean; reason?: string; reportDate: string }> {
  const eastern = getEasternTimeParts(asOf);
  const reportDate = easternDateKey(eastern);
  if (reportDate < FIRST_LIVE_REPORT_DATE) return { sent: false, skipped: true, reason: "The approved first live coaching briefing date has not arrived.", reportDate };
  if (!["Mon", "Tue", "Wed", "Thu", "Fri"].includes(eastern.weekday)) return { sent: false, skipped: true, reason: "Coaching Tips is configured for weekdays only.", reportDate };
  if (!(await claimReportRun(reportDate))) return { sent: false, skipped: true, reason: "This weekday briefing was already handled for the Eastern calendar date.", reportDate };

  const recipientCount = COACHING_TIPS_RECIPIENT_EMAILS.length;
  try {
    const [briefing, recipients] = await Promise.all([buildDailyCoachingBriefing(asOf), getRecipients()]);
    await saveBriefing(briefing);
    const [primary, ...cc] = recipients;
    if (!primary || cc.length !== recipientCount - 1) throw new Error("The configured Coaching Tips leadership recipient group is incomplete.");
    const delivery = await sendTransactionalEmail(
      "coaching_tips_for_today",
      {
        recipientName: primary.name,
        recipientEmail: primary.email,
        ccEmails: cc.map((recipient) => recipient.email),
        coachingTipsDate: briefing.reportDate,
        coachingTipsHtml: renderDailyCoachingTipsHtml(briefing),
        coachingTipsSubject: briefing.content.subject,
      },
      { allowTemplateOverride: false, injectMagicLinks: false, idempotencyKey: `${REPORT_KEY}:${briefing.reportDate}:shared-leadership` },
    );
    if (delivery.sent) {
      await Promise.all([finalizeReportRun(briefing.reportDate, "sent", recipientCount, recipientCount), markBriefingSent(briefing.reportDate)]);
      console.info(`[CoachingTips] Sent ${briefing.reportDate} shared briefing to ${primary.email} with ${cc.length} copied recipients. Theme: ${briefing.rotation.primaryTheme}.`);
      return { sent: true, skipped: false, reportDate: briefing.reportDate };
    }
    await finalizeReportRun(briefing.reportDate, delivery.skipped ? "skipped" : "failed", recipientCount, 0, delivery.reason);
    return { sent: false, skipped: Boolean(delivery.skipped), reason: delivery.reason, reportDate: briefing.reportDate };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await finalizeReportRun(reportDate, "failed", recipientCount, 0, reason);
    console.error("[CoachingTips] Shared weekday briefing failed:", error);
    return { sent: false, skipped: false, reason, reportDate };
  }
}

function weekdayIndex(weekday: string): number {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
}

/** Returns the next weekday 8:00 AM America/New_York execution time, preserving DST. */
export function getNextWeekdayCoachingTipsAt8AmEastern(now = new Date()): Date {
  const eastern = getEasternTimeParts(now);
  let targetDate = easternDateKey(eastern);
  let weekday = weekdayIndex(eastern.weekday);
  const passedToday = eastern.hour > REPORT_HOUR || (eastern.hour === REPORT_HOUR && (eastern.minute > 0 || eastern.second > 0));
  if (passedToday) {
    targetDate = addEasternDays(targetDate, 1);
    weekday = (weekday + 1) % 7;
  }
  while (weekday === 0 || weekday === 6) {
    targetDate = addEasternDays(targetDate, 1);
    weekday = (weekday + 1) % 7;
  }
  return easternDateTimeToUtc(targetDate, REPORT_HOUR);
}

let schedulerTimer: NodeJS.Timeout | undefined;
let startupRecoveryTimer: NodeJS.Timeout | undefined;

function scheduleNextReport(): void {
  if (schedulerTimer) clearTimeout(schedulerTimer);
  const nextRun = getNextWeekdayCoachingTipsAt8AmEastern();
  const delay = Math.max(nextRun.getTime() - Date.now(), 1_000);
  console.info(`[CoachingTips] Next weekday briefing scheduled for ${nextRun.toLocaleString("en-US", { timeZone: EASTERN_TIME_ZONE })}.`);
  schedulerTimer = setTimeout(async () => {
    await sendDailyCoachingTips();
    scheduleNextReport();
  }, delay);
}

/** Schedules one shared leadership briefing at 8:00 AM Eastern, Monday through Friday. */
export function scheduleDailyCoachingTips(): void {
  scheduleNextReport();
  if (startupRecoveryTimer) clearTimeout(startupRecoveryTimer);
  startupRecoveryTimer = setTimeout(() => {
    const eastern = getEasternTimeParts();
    const reportDate = easternDateKey(eastern);
    if (reportDate >= FIRST_LIVE_REPORT_DATE && ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(eastern.weekday) && eastern.hour >= REPORT_HOUR) {
      sendDailyCoachingTips().catch((error) => console.error("[CoachingTips] Startup recovery failed:", error));
    }
  }, 30_000);
}
