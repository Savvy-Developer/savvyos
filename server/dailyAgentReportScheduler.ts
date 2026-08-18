import { and, desc, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import {
  activityLog,
  agentConnections,
  contacts,
  dailyAgentReports,
  emailBehaviors,
  savvyosFeatureUpdates,
  scheduledReportRuns,
  tasks,
  transactions,
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
const REPORT_KEY = "daily_agent_report";
const REPORT_HOUR = 18;
const STALE_RUN_MS = 60 * 60 * 1000;
const APP_URL = "https://os.savvy-agents.com";
const AI_MODEL = "gpt-5-mini";
const ACTIVE_PIPELINE_STAGES = new Set([
  "new_lead",
  "attempted_contact",
  "nurture",
  "active_client",
  "under_contract",
]);

const STAGE_LABELS: Record<string, string> = {
  new_lead: "New Lead",
  attempted_contact: "Attempted Contact",
  nurture: "Nurture",
  active_client: "Active Client",
  under_contract: "Under Contract",
  closed: "Closed",
  dead: "Dead",
  do_not_contact: "Do Not Contact",
};

export type ReportPriority = "critical" | "high" | "medium";

export interface DailyReportTask {
  id: number;
  title: string;
  priority: string;
  status: string;
  dueDate: string | null;
  contactName: string | null;
  actionPath: string;
}

export interface DailyReportLead {
  connectionId: number;
  contactId: number;
  contactName: string;
  stage: string;
  stageLabel: string;
  followUpDate: string | null;
  ageDays: number;
  score: number;
  reasons: string[];
  actionPath: string;
}

export interface DailyReportSuggestion {
  priority: ReportPriority;
  title: string;
  rationale: string;
  actionLabel: string;
  actionPath: string;
}

export interface DailyReportFeatureUpdate {
  id: number;
  title: string;
  summary: string;
  details: string | null;
  actionUrl: string | null;
  publishedAt: string | null;
}

export interface DailyAgentReportSnapshot {
  reportDate: string;
  asOfLabel: string;
  generatedAt: string;
  agent: { id: number; name: string };
  metrics: {
    activeLeads: number;
    hotLeads: number;
    staleLeads: number;
    overdueFollowUps: number;
    openTasks: number;
    overdueTasks: number;
    dueSoonTasks: number;
    currentUnderContract: number;
    upcomingClosings: number;
  };
  pipeline: Array<{ stage: string; label: string; count: number }>;
  hotLeads: DailyReportLead[];
  overdueTasks: DailyReportTask[];
  upcomingTasks: DailyReportTask[];
  suggestions: DailyReportSuggestion[];
  featureUpdates: DailyReportFeatureUpdate[];
  aiGenerated: boolean;
}

interface AgentRecipient {
  id: number;
  name: string | null;
  email: string | null;
}

interface PipelineConnectionRecord {
  connectionId: number;
  contactId: number;
  contactName: string;
  stage: string;
  followUpDate: Date | null;
  activityDate: Date | null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(value: string | null): string {
  if (!value) return "No due date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No due date";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN_TIME_ZONE,
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatTimestamp(value: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN_TIME_ZONE,
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(value);
}

function dateOrNull(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isoOrNull(value: Date | string | null | undefined): string | null {
  return dateOrNull(value)?.toISOString() ?? null;
}

function daysSince(value: Date | null, asOf: Date): number {
  if (!value) return 0;
  return Math.max(0, Math.floor((asOf.getTime() - value.getTime()) / (24 * 60 * 60 * 1000)));
}

function isOverdue(value: Date | null, asOf: Date): boolean {
  return Boolean(value && value.getTime() < asOf.getTime());
}

function isDueSoon(value: Date | null, asOf: Date, days = 3): boolean {
  if (!value) return false;
  const limit = new Date(asOf.getTime() + days * 24 * 60 * 60 * 1000);
  return value.getTime() >= asOf.getTime() && value.getTime() <= limit.getTime();
}

function appUrl(path: string | null | undefined, fallback = "/daily-report"): string {
  if (!path) return `${APP_URL}${fallback}`;
  if (path.startsWith("/")) return `${APP_URL}${path}`;
  if (path.startsWith(APP_URL)) return path;
  return `${APP_URL}${fallback}`;
}

function safeActionPath(value: unknown): string {
  if (typeof value !== "string") return "/daily-report";
  const allowed = ["/tasks", "/pipeline", "/transactions", "/daily-report"];
  return allowed.some((prefix) => value === prefix || value.startsWith(`${prefix}/`))
    ? value
    : "/daily-report";
}

function normalisePriority(value: unknown): ReportPriority {
  return value === "critical" || value === "high" || value === "medium" ? value : "medium";
}

function buildDeterministicSuggestions(report: Omit<DailyAgentReportSnapshot, "suggestions" | "aiGenerated">): DailyReportSuggestion[] {
  const suggestions: DailyReportSuggestion[] = [];
  const topLead = report.hotLeads[0];

  if (report.metrics.overdueTasks > 0) {
    suggestions.push({
      priority: "critical",
      title: `Clear ${report.metrics.overdueTasks} overdue task${report.metrics.overdueTasks === 1 ? "" : "s"}`,
      rationale: "Overdue work is the fastest way to reduce execution risk and restore a clear operating plan.",
      actionLabel: "Review tasks",
      actionPath: "/tasks",
    });
  }
  if (report.metrics.overdueFollowUps > 0) {
    suggestions.push({
      priority: report.metrics.overdueFollowUps >= 3 ? "critical" : "high",
      title: `Reconnect with ${report.metrics.overdueFollowUps} overdue follow-up${report.metrics.overdueFollowUps === 1 ? "" : "s"}`,
      rationale: "These active pipeline relationships have a follow-up date in the past and should be triaged before new outreach.",
      actionLabel: "Open pipeline",
      actionPath: "/pipeline",
    });
  }
  if (topLead) {
    suggestions.push({
      priority: topLead.score >= 60 ? "critical" : "high",
      title: `Prioritize ${topLead.contactName}`,
      rationale: topLead.reasons.slice(0, 2).join(" • ") || "This lead has the strongest current activity signal in your pipeline.",
      actionLabel: "Open lead",
      actionPath: topLead.actionPath,
    });
  }
  if (report.metrics.staleLeads > 0) {
    suggestions.push({
      priority: "medium",
      title: `Clean up ${report.metrics.staleLeads} stalled lead${report.metrics.staleLeads === 1 ? "" : "s"}`,
      rationale: "Active leads without recent qualifying activity can hide risk in the pipeline and make weekly planning less reliable.",
      actionLabel: "Review pipeline",
      actionPath: "/pipeline",
    });
  }
  if (report.metrics.dueSoonTasks > 0) {
    suggestions.push({
      priority: "medium",
      title: `Plan for ${report.metrics.dueSoonTasks} task${report.metrics.dueSoonTasks === 1 ? "" : "s"} due in the next three days`,
      rationale: "Completing or rescheduling near-term work before it becomes overdue keeps the next workday focused.",
      actionLabel: "View task plan",
      actionPath: "/tasks",
    });
  }

  if (suggestions.length === 0) {
    suggestions.push({
      priority: "medium",
      title: "Protect your pipeline momentum",
      rationale: "No urgent SavvyOS exceptions were found. Use this window to complete a deliberate round of active-client and nurture follow-up.",
      actionLabel: "Open pipeline",
      actionPath: "/pipeline",
    });
  }

  return suggestions.slice(0, 3);
}

function toTaskRecord(row: {
  id: number;
  title: string;
  priority: string;
  status: string;
  dueDate: Date | null;
  contactName: string | null;
}): DailyReportTask {
  return {
    id: row.id,
    title: row.title,
    priority: row.priority,
    status: row.status,
    dueDate: isoOrNull(row.dueDate),
    contactName: row.contactName,
    actionPath: `/tasks/${row.id}`,
  };
}

async function getFeatureUpdates(asOf: Date): Promise<DailyReportFeatureUpdate[]> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available for feature updates.");

  const rows = await db
    .select({
      id: savvyosFeatureUpdates.id,
      title: savvyosFeatureUpdates.title,
      summary: savvyosFeatureUpdates.summary,
      details: savvyosFeatureUpdates.details,
      actionUrl: savvyosFeatureUpdates.actionUrl,
      publishedAt: savvyosFeatureUpdates.publishedAt,
    })
    .from(savvyosFeatureUpdates)
    .where(and(
      eq(savvyosFeatureUpdates.isPublished, true),
      eq(savvyosFeatureUpdates.isAgentFacing, true),
      isNotNull(savvyosFeatureUpdates.publishedAt),
      lte(savvyosFeatureUpdates.publishedAt, asOf),
      gte(savvyosFeatureUpdates.publishedAt, new Date(asOf.getTime() - 30 * 24 * 60 * 60 * 1000)),
    ))
    .orderBy(desc(savvyosFeatureUpdates.publishedAt))
    .limit(3);

  return rows.map((row) => ({
    ...row,
    publishedAt: isoOrNull(row.publishedAt),
  }));
}

async function ensureInitialFeatureUpdate(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const [existing] = await db
    .select({ id: savvyosFeatureUpdates.id })
    .from(savvyosFeatureUpdates)
    .where(eq(savvyosFeatureUpdates.title, "Daily SavvyOS Report"))
    .limit(1);
  if (existing) return;

  await db.insert(savvyosFeatureUpdates).values({
    title: "Daily SavvyOS Report",
    summary: "A personalized 6 PM Eastern digest now brings your tasks, hot leads, pipeline health, and priorities into one place.",
    details: "Open the Daily Report page at any time for a current operational view, then use the email links to move directly into the related task or lead.",
    actionUrl: "/daily-report",
    isAgentFacing: true,
    isPublished: true,
    publishedAt: new Date(),
  });
}

async function generateAiSuggestions(
  report: Omit<DailyAgentReportSnapshot, "suggestions" | "aiGenerated">,
): Promise<DailyReportSuggestion[] | null> {
  const fallback = buildDeterministicSuggestions(report);
  const facts = {
    activeLeads: report.metrics.activeLeads,
    hotLeads: report.metrics.hotLeads,
    staleLeads: report.metrics.staleLeads,
    overdueFollowUps: report.metrics.overdueFollowUps,
    openTasks: report.metrics.openTasks,
    overdueTasks: report.metrics.overdueTasks,
    dueSoonTasks: report.metrics.dueSoonTasks,
    currentUnderContract: report.metrics.currentUnderContract,
    upcomingClosings: report.metrics.upcomingClosings,
    pipeline: report.pipeline.map((stage) => ({ label: stage.label, count: stage.count })),
    topLeadSignals: report.hotLeads.slice(0, 3).map((lead) => ({
      stage: lead.stageLabel,
      score: lead.score,
      reasons: lead.reasons,
      actionPath: lead.actionPath,
    })),
    overdueTaskTitles: report.overdueTasks.slice(0, 3).map((task) => ({
      priority: task.priority,
      dueDate: task.dueDate,
      actionPath: task.actionPath,
    })),
  };

  try {
    const result = await invokeLLM({
      model: AI_MODEL,
      maxTokens: 750,
      responseFormat: {
        type: "json_schema",
        json_schema: {
          name: "daily_agent_priorities",
          strict: true,
          schema: {
            type: "object",
            properties: {
              suggestions: {
                type: "array",
                minItems: 1,
                maxItems: 3,
                items: {
                  type: "object",
                  properties: {
                    priority: { type: "string", enum: ["critical", "high", "medium"] },
                    title: { type: "string" },
                    rationale: { type: "string" },
                    actionLabel: { type: "string" },
                    actionPath: { type: "string" },
                  },
                  required: ["priority", "title", "rationale", "actionLabel", "actionPath"],
                  additionalProperties: false,
                },
              },
            },
            required: ["suggestions"],
            additionalProperties: false,
          },
        },
      },
      messages: [
        {
          role: "system",
          content: "You create a concise end-of-day operating plan for a real-estate agent. Use only the supplied facts. Do not invent activity, lead behavior, due dates, or business outcomes. Give at most three action-oriented recommendations. Prioritize overdue work and explicit engagement signals. The report is advisory only; never imply a task was completed or contact was made.",
        },
        {
          role: "user",
          content: JSON.stringify(facts),
        },
      ],
    });
    const text = result.choices[0]?.message?.content;
    const rawText = typeof text === "string" ? text : "";
    const parsed = JSON.parse(rawText) as { suggestions?: Array<Record<string, unknown>> };
    if (!Array.isArray(parsed.suggestions) || parsed.suggestions.length === 0) return null;

    const suggestions = parsed.suggestions.slice(0, 3).map((item) => ({
      priority: normalisePriority(item.priority),
      title: typeof item.title === "string" ? item.title.slice(0, 120) : "Review your daily priorities",
      rationale: typeof item.rationale === "string" ? item.rationale.slice(0, 280) : "Review the related SavvyOS record and take the next appropriate action.",
      actionLabel: typeof item.actionLabel === "string" ? item.actionLabel.slice(0, 48) : "Open SavvyOS",
      actionPath: safeActionPath(item.actionPath),
    }));
    return suggestions.length > 0 ? suggestions : fallback;
  } catch (error) {
    console.warn("[DailyAgentReport] AI suggestions unavailable; using deterministic priorities.", error);
    return null;
  }
}

export async function buildDailyAgentReport(
  agent: AgentRecipient,
  asOf = new Date(),
  includeAi = true,
): Promise<DailyAgentReportSnapshot> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available for daily agent reports.");
  await ensureInitialFeatureUpdate();

  const sevenDaysAgo = new Date(asOf.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAhead = new Date(asOf.getTime() + 30 * 24 * 60 * 60 * 1000);
  const eastern = getEasternTimeParts(asOf);
  const reportDate = easternDateKey(eastern);

  const [connectionRows, taskRows, currentTransactions, upcomingClosings, featureUpdates] = await Promise.all([
    db
      .select({
        connectionId: agentConnections.id,
        contactId: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        stage: agentConnections.pipelineStatus,
        followUpDate: agentConnections.followUpDate,
        activityDate: sql<Date>`COALESCE(${agentConnections.agingUpdatedAt}, ${agentConnections.updatedAt})`,
      })
      .from(agentConnections)
      .innerJoin(contacts, eq(agentConnections.contactId, contacts.id))
      .where(eq(agentConnections.agentId, agent.id)),
    db
      .select({
        id: tasks.id,
        title: tasks.title,
        priority: tasks.priority,
        status: tasks.status,
        dueDate: tasks.dueDate,
        contactName: sql<string | null>`CASE WHEN ${contacts.id} IS NULL THEN NULL ELSE CONCAT(${contacts.firstName}, ' ', ${contacts.lastName}) END`,
      })
      .from(tasks)
      .leftJoin(contacts, eq(tasks.relatedContactId, contacts.id))
      .where(and(
        eq(tasks.assignedToId, agent.id),
        sql`${tasks.status} IN ('pending', 'in_progress')`,
      ))
      .orderBy(tasks.dueDate),
    db
      .select({ id: transactions.id })
      .from(transactions)
      .where(and(eq(transactions.agentId, agent.id), eq(transactions.status, "under_contract"))),
    db
      .select({ id: transactions.id })
      .from(transactions)
      .where(and(
        eq(transactions.agentId, agent.id),
        eq(transactions.status, "under_contract"),
        isNotNull(transactions.closingDate),
        gte(transactions.closingDate, asOf),
        lte(transactions.closingDate, thirtyDaysAhead),
      )),
    getFeatureUpdates(asOf),
  ]);

  const connections: PipelineConnectionRecord[] = connectionRows.map((row) => ({
    connectionId: row.connectionId,
    contactId: row.contactId,
    contactName: `${row.firstName} ${row.lastName}`.trim(),
    stage: row.stage,
    followUpDate: dateOrNull(row.followUpDate),
    activityDate: dateOrNull(row.activityDate),
  }));
  const contactIds = connections.map((connection) => connection.contactId);

  const propertyViewCount = new Map<number, number>();
  const emailSignal = new Map<number, { opens: number; clicks: number }>();
  if (contactIds.length > 0) {
    const [propertyViews, emailRows] = await Promise.all([
      db
        .select({ contactId: activityLog.entityId, count: sql<number>`COUNT(*)` })
        .from(activityLog)
        .where(and(
          eq(activityLog.action, "property_viewed"),
          eq(activityLog.entityType, "contact"),
          gte(activityLog.createdAt, sevenDaysAgo),
          inArray(activityLog.entityId, contactIds),
        ))
        .groupBy(activityLog.entityId),
      db
        .select({
          contactId: emailBehaviors.contactId,
          opens: sql<number>`SUM(CASE WHEN ${emailBehaviors.openedAt} >= ${sevenDaysAgo} THEN 1 ELSE 0 END)`,
          clicks: sql<number>`SUM(CASE WHEN ${emailBehaviors.clickedAt} >= ${sevenDaysAgo} THEN 1 ELSE 0 END)`,
        })
        .from(emailBehaviors)
        .where(and(
          inArray(emailBehaviors.contactId, contactIds),
          sql`(${emailBehaviors.openedAt} >= ${sevenDaysAgo} OR ${emailBehaviors.clickedAt} >= ${sevenDaysAgo})`,
        ))
        .groupBy(emailBehaviors.contactId),
    ]);

    propertyViews.forEach((row) => {
      if (row.contactId) propertyViewCount.set(row.contactId, Number(row.count ?? 0));
    });
    emailRows.forEach((row) => {
      if (row.contactId) {
        emailSignal.set(row.contactId, {
          opens: Number(row.opens ?? 0),
          clicks: Number(row.clicks ?? 0),
        });
      }
    });
  }

  const pipeline = Object.keys(STAGE_LABELS).map((stage) => ({
    stage,
    label: STAGE_LABELS[stage],
    count: connections.filter((connection) => connection.stage === stage).length,
  }));
  const activeConnections = connections.filter((connection) => ACTIVE_PIPELINE_STAGES.has(connection.stage));
  const staleConnections = activeConnections.filter((connection) => daysSince(connection.activityDate, asOf) >= 14);
  const overdueFollowUps = activeConnections.filter((connection) => isOverdue(connection.followUpDate, asOf));

  const hotLeads = activeConnections
    .map((connection): DailyReportLead => {
      const reasons: string[] = [];
      let score = 0;
      const activityAge = daysSince(connection.activityDate, asOf);
      const views = propertyViewCount.get(connection.contactId) ?? 0;
      const email = emailSignal.get(connection.contactId) ?? { opens: 0, clicks: 0 };

      if (isOverdue(connection.followUpDate, asOf)) {
        score += 42;
        reasons.push("Follow-up is overdue");
      }
      if (connection.stage === "under_contract") {
        score += 36;
        reasons.push("Currently under contract");
      } else if (connection.stage === "active_client") {
        score += 24;
        reasons.push("Active client stage");
      }
      if (views > 0) {
        score += Math.min(20, 8 + views * 3);
        reasons.push(`${views} recent property view${views === 1 ? "" : "s"}`);
      }
      if (email.clicks > 0) {
        score += Math.min(24, email.clicks * 12);
        reasons.push(`${email.clicks} recent email click${email.clicks === 1 ? "" : "s"}`);
      } else if (email.opens > 0) {
        score += Math.min(12, email.opens * 4);
        reasons.push(`${email.opens} recent email open${email.opens === 1 ? "" : "s"}`);
      }
      if (activityAge >= 14) {
        score += 8;
        reasons.push(`${activityAge} days since qualifying activity`);
      }

      return {
        connectionId: connection.connectionId,
        contactId: connection.contactId,
        contactName: connection.contactName || "Unnamed contact",
        stage: connection.stage,
        stageLabel: STAGE_LABELS[connection.stage] ?? connection.stage,
        followUpDate: isoOrNull(connection.followUpDate),
        ageDays: activityAge,
        score,
        reasons,
        actionPath: `/pipeline/${connection.connectionId}`,
      };
    })
    .filter((lead) => lead.score >= 20)
    .sort((a, b) => b.score - a.score || a.ageDays - b.ageDays || a.contactName.localeCompare(b.contactName))
    .slice(0, 5);

  const taskRecords = taskRows.map(toTaskRecord);
  const overdueTasks = taskRecords.filter((task) => isOverdue(task.dueDate ? new Date(task.dueDate) : null, asOf)).slice(0, 6);
  const upcomingTasks = taskRecords.filter((task) => isDueSoon(task.dueDate ? new Date(task.dueDate) : null, asOf)).slice(0, 6);

  const baseReport: Omit<DailyAgentReportSnapshot, "suggestions" | "aiGenerated"> = {
    reportDate,
    asOfLabel: formatTimestamp(asOf),
    generatedAt: asOf.toISOString(),
    agent: { id: agent.id, name: agent.name?.trim() || "Savvy Agent" },
    metrics: {
      activeLeads: activeConnections.length,
      hotLeads: hotLeads.length,
      staleLeads: staleConnections.length,
      overdueFollowUps: overdueFollowUps.length,
      openTasks: taskRecords.length,
      overdueTasks: overdueTasks.length,
      dueSoonTasks: upcomingTasks.length,
      currentUnderContract: currentTransactions.length,
      upcomingClosings: upcomingClosings.length,
    },
    pipeline,
    hotLeads,
    overdueTasks,
    upcomingTasks,
    featureUpdates,
  };

  const aiSuggestions = includeAi ? await generateAiSuggestions(baseReport) : null;
  return {
    ...baseReport,
    suggestions: aiSuggestions ?? buildDeterministicSuggestions(baseReport),
    aiGenerated: Boolean(aiSuggestions),
  };
}

export function renderDailyAgentReportHtml(report: DailyAgentReportSnapshot): string {
  const metric = (label: string, value: number, tone = "#111827") => `
    <td width="33.33%" style="padding:6px;vertical-align:top;">
      <div style="border:1px solid #E5E7EB;border-radius:8px;padding:12px;background:#FFFFFF;">
        <div style="font-size:22px;font-weight:700;color:${tone};line-height:1.1;">${value}</div>
        <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.4px;color:#6B7280;margin-top:5px;line-height:1.35;">${escapeHtml(label)}</div>
      </div>
    </td>`;

  const sectionTitle = (title: string, subtitle: string) => `
    <div style="margin:28px 0 9px;">
      <div style="font-size:15px;font-weight:700;color:#111827;">${escapeHtml(title)}</div>
      <div style="font-size:12px;color:#6B7280;margin-top:3px;line-height:1.45;">${escapeHtml(subtitle)}</div>
    </div>`;

  const priorityColor: Record<ReportPriority, string> = {
    critical: "#DC2626",
    high: "#D97706",
    medium: "#0891B2",
  };

  const suggestionCards = report.suggestions.map((suggestion) => `
    <tr>
      <td style="padding:0 0 10px;">
        <div style="border-left:3px solid ${priorityColor[suggestion.priority]};background:#F9FAFB;border-radius:6px;padding:12px 14px;">
          <div style="font-size:10px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:${priorityColor[suggestion.priority]};margin-bottom:4px;">${escapeHtml(suggestion.priority)} priority</div>
          <div style="font-size:14px;font-weight:700;color:#111827;line-height:1.35;">${escapeHtml(suggestion.title)}</div>
          <div style="font-size:12px;color:#4B5563;line-height:1.5;margin-top:4px;">${escapeHtml(suggestion.rationale)}</div>
          <a href="${appUrl(suggestion.actionPath)}" style="display:inline-block;margin-top:9px;color:#0F7490;font-size:12px;font-weight:700;text-decoration:none;">${escapeHtml(suggestion.actionLabel)} →</a>
        </div>
      </td>
    </tr>`).join("");

  const taskRows = report.overdueTasks.length > 0
    ? report.overdueTasks.map((task) => `
      <tr>
        <td style="padding:9px 0;border-bottom:1px solid #E5E7EB;vertical-align:top;">
          <a href="${appUrl(task.actionPath)}" style="font-size:13px;font-weight:700;color:#111827;text-decoration:none;line-height:1.35;">${escapeHtml(task.title)}</a>
          ${task.contactName ? `<div style="font-size:11px;color:#6B7280;margin-top:2px;">${escapeHtml(task.contactName)}</div>` : ""}
        </td>
        <td style="padding:9px 0 9px 12px;border-bottom:1px solid #E5E7EB;vertical-align:top;text-align:right;white-space:nowrap;">
          <div style="font-size:11px;font-weight:700;color:#DC2626;">Due ${escapeHtml(formatDate(task.dueDate))}</div>
          <div style="font-size:10px;color:#6B7280;text-transform:capitalize;margin-top:2px;">${escapeHtml(task.priority)}</div>
        </td>
      </tr>`).join("")
    : `<tr><td style="padding:13px 0;font-size:12px;color:#6B7280;">No overdue tasks. Nice work keeping your task list current.</td></tr>`;

  const leadRows = report.hotLeads.length > 0
    ? report.hotLeads.map((lead) => `
      <tr>
        <td style="padding:9px 0;border-bottom:1px solid #E5E7EB;vertical-align:top;">
          <a href="${appUrl(lead.actionPath)}" style="font-size:13px;font-weight:700;color:#111827;text-decoration:none;line-height:1.35;">${escapeHtml(lead.contactName)}</a>
          <div style="font-size:11px;color:#6B7280;margin-top:2px;">${escapeHtml(lead.stageLabel)} · ${escapeHtml(lead.reasons.slice(0, 2).join(" · ") || "Review current pipeline activity")}</div>
        </td>
        <td style="padding:9px 0 9px 12px;border-bottom:1px solid #E5E7EB;vertical-align:top;text-align:right;white-space:nowrap;">
          <div style="font-size:11px;font-weight:700;color:#D97706;">Priority ${lead.score}</div>
          ${lead.followUpDate ? `<div style="font-size:10px;color:#6B7280;margin-top:2px;">Follow-up ${escapeHtml(formatDate(lead.followUpDate))}</div>` : ""}
        </td>
      </tr>`).join("")
    : `<tr><td style="padding:13px 0;font-size:12px;color:#6B7280;">No leads met the current hot-lead threshold. Keep your next outreach intentional.</td></tr>`;

  const pipelineRows = report.pipeline
    .filter((stage) => stage.count > 0)
    .map((stage) => `<span style="display:inline-block;margin:0 7px 7px 0;padding:6px 8px;border-radius:999px;background:#F3F4F6;color:#374151;font-size:11px;"><strong>${stage.count}</strong> ${escapeHtml(stage.label)}</span>`)
    .join("") || `<span style="font-size:12px;color:#6B7280;">No pipeline records are currently assigned.</span>`;

  const featureRows = report.featureUpdates.length > 0
    ? report.featureUpdates.map((update) => `
      <tr>
        <td style="padding:0 0 10px;">
          <div style="background:#F0F9FF;border:1px solid #BAE6FD;border-radius:7px;padding:11px 13px;">
            <div style="font-size:13px;font-weight:700;color:#0C4A6E;">${escapeHtml(update.title)}</div>
            <div style="font-size:12px;color:#155E75;line-height:1.5;margin-top:3px;">${escapeHtml(update.summary)}</div>
            ${update.actionUrl ? `<a href="${appUrl(update.actionUrl)}" style="display:inline-block;margin-top:7px;color:#0F7490;font-size:12px;font-weight:700;text-decoration:none;">Explore update →</a>` : ""}
          </div>
        </td>
      </tr>`).join("")
    : `<tr><td style="padding:13px 0;font-size:12px;color:#6B7280;">No new agent-facing SavvyOS updates were published in the last 30 days.</td></tr>`;

  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
      <div style="font-size:22px;font-weight:700;color:#111827;line-height:1.25;">Your Daily SavvyOS Report</div>
      <div style="font-size:12px;color:#6B7280;margin-top:5px;line-height:1.5;">${escapeHtml(report.asOfLabel)} · Your end-of-day operating snapshot</div>

      ${sectionTitle("At a glance", "Prioritize overdue work and engaged leads first.")}
      <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation"><tr>
        ${metric("Overdue tasks", report.metrics.overdueTasks, report.metrics.overdueTasks > 0 ? "#DC2626" : "#111827")}
        ${metric("Overdue follow-ups", report.metrics.overdueFollowUps, report.metrics.overdueFollowUps > 0 ? "#D97706" : "#111827")}
        ${metric("Hot leads", report.metrics.hotLeads, report.metrics.hotLeads > 0 ? "#0F7490" : "#111827")}
      </tr><tr>
        ${metric("Active pipeline", report.metrics.activeLeads)}
        ${metric("Open tasks", report.metrics.openTasks)}
        ${metric("Under contract", report.metrics.currentUnderContract)}
      </tr></table>

      ${sectionTitle("Suggested next moves", report.aiGenerated ? "Recommendations are generated from your current SavvyOS activity and remain advisory." : "Recommendations are based on your current SavvyOS activity.")}
      <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">${suggestionCards}</table>

      ${sectionTitle("Past-due tasks", "Complete, reschedule, or clarify ownership so nothing remains invisible.")}
      <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">${taskRows}</table>

      ${sectionTitle("Hot leads in your pipeline", "Signals include overdue follow-up, client stage, property views, and recent email engagement.")}
      <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">${leadRows}</table>

      ${sectionTitle("Pipeline health", `${report.metrics.staleLeads} stalled active lead${report.metrics.staleLeads === 1 ? "" : "s"} · ${report.metrics.dueSoonTasks} task${report.metrics.dueSoonTasks === 1 ? "" : "s"} due within three days · ${report.metrics.upcomingClosings} upcoming closing${report.metrics.upcomingClosings === 1 ? "" : "s"} in 30 days`)}
      <div style="margin-top:7px;">${pipelineRows}</div>

      ${sectionTitle("New or updated SavvyOS features", "Agent-facing improvements published in the last 30 days.")}
      <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">${featureRows}</table>

      <table cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 0;" role="presentation"><tr><td style="background:#0FC0DF;border-radius:7px;">
        <a href="${APP_URL}/daily-report" style="display:inline-block;padding:12px 22px;color:#0A0A0A;font-size:14px;font-weight:700;text-decoration:none;">Open your live report</a>
      </td></tr></table>
      <div style="font-size:11px;line-height:1.5;color:#9CA3AF;margin-top:17px;">This report is a decision-support snapshot, not a record of completed work. Review each linked record before taking action.</div>
    </div>`;
}

async function claimReportRun(reportDate: string): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available for report-run tracking.");

  const [run] = await db
    .select()
    .from(scheduledReportRuns)
    .where(and(eq(scheduledReportRuns.reportKey, REPORT_KEY), eq(scheduledReportRuns.reportDate, reportDate)))
    .limit(1);

  if (run?.status === "sent") return false;
  if (run?.status === "running" && Date.now() - run.startedAt.getTime() < STALE_RUN_MS) return false;

  if (run) {
    await db.update(scheduledReportRuns).set({
      status: "running",
      startedAt: new Date(),
      completedAt: null,
      recipientCount: 0,
      successfulRecipientCount: 0,
      errorMessage: null,
    }).where(eq(scheduledReportRuns.id, run.id));
  } else {
    try {
      await db.insert(scheduledReportRuns).values({ reportKey: REPORT_KEY, reportDate, status: "running", startedAt: new Date() });
    } catch (error) {
      console.warn("[DailyAgentReport] Report run was claimed by another process.", error);
      return false;
    }
  }
  return true;
}

async function finalizeReportRun(
  reportDate: string,
  status: "sent" | "partial" | "failed" | "skipped",
  recipientCount: number,
  successfulRecipientCount: number,
  errorMessage?: string,
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(scheduledReportRuns).set({
    status,
    recipientCount,
    successfulRecipientCount,
    errorMessage: errorMessage ?? null,
    completedAt: new Date(),
  }).where(and(eq(scheduledReportRuns.reportKey, REPORT_KEY), eq(scheduledReportRuns.reportDate, reportDate)));
}

async function saveDailyAgentReport(report: DailyAgentReportSnapshot): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available for daily report storage.");

  await db.insert(dailyAgentReports).values({
    agentId: report.agent.id,
    reportDate: report.reportDate,
    snapshot: report as unknown as Record<string, unknown>,
    aiSuggestions: report.suggestions as unknown as Array<Record<string, unknown>>,
    aiModel: report.aiGenerated ? AI_MODEL : null,
    generatedAt: new Date(report.generatedAt),
  }).onDuplicateKeyUpdate({
    set: {
      snapshot: report as unknown as Record<string, unknown>,
      aiSuggestions: report.suggestions as unknown as Array<Record<string, unknown>>,
      aiModel: report.aiGenerated ? AI_MODEL : null,
      generatedAt: new Date(report.generatedAt),
    },
  });
}

/** Build, save, and email the daily report to every active full-user agent. */
export async function sendDailyAgentReports(asOf = new Date()): Promise<void> {
  const reportDate = easternDateKey(getEasternTimeParts(asOf));
  if (!(await claimReportRun(reportDate))) {
    console.info(`[DailyAgentReport] ${reportDate} already handled; skipping duplicate run.`);
    return;
  }

  try {
    const db = await getDb();
    if (!db) throw new Error("Database is not available for daily report recipients.");
    await ensureInitialFeatureUpdate();

    const agents = await db.select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(and(
        eq(users.role, "agent"),
        eq(users.personType, "full_user"),
        eq(users.isActive, true),
        isNotNull(users.email),
      ))
      .orderBy(users.name);

    if (agents.length === 0) {
      await finalizeReportRun(reportDate, "skipped", 0, 0, "No active agents with email addresses were found.");
      return;
    }

    let successfulRecipientCount = 0;
    const failures: string[] = [];
    for (const agent of agents) {
      try {
        const report = await buildDailyAgentReport(agent, asOf, true);
        await saveDailyAgentReport(report);
        const delivery = await sendTransactionalEmail(
          "daily_agent_report",
          {
            recipientName: report.agent.name,
            recipientEmail: agent.email!,
            dailyReportDate: report.reportDate,
            dailyReportAsOf: report.asOfLabel,
            dailyReportHtml: renderDailyAgentReportHtml(report),
          },
          {
            allowTemplateOverride: false,
            idempotencyKey: `${REPORT_KEY}:${reportDate}:agent:${agent.id}`,
          },
        );
        if (delivery.sent) {
          successfulRecipientCount += 1;
        } else if (!delivery.skipped) {
          failures.push(`${agent.email}: ${delivery.reason ?? "email delivery failed"}`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push(`${agent.email ?? agent.id}: ${message}`);
        console.error(`[DailyAgentReport] Failed for agent ${agent.id}.`, error);
      }
    }

    const status = successfulRecipientCount === agents.length
      ? "sent"
      : successfulRecipientCount > 0
        ? "partial"
        : failures.length > 0
          ? "failed"
          : "skipped";
    await finalizeReportRun(reportDate, status, agents.length, successfulRecipientCount, failures.length ? failures.join(" | ") : undefined);
    console.info(`[DailyAgentReport] ${status}: ${successfulRecipientCount}/${agents.length} delivery attempt(s) completed for ${reportDate}.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finalizeReportRun(reportDate, "failed", 0, 0, message);
    console.error("[DailyAgentReport] Scheduled report failed.", error);
  }
}

export async function getSavedDailyAgentReport(agentId: number, reportDate: string): Promise<DailyAgentReportSnapshot | null> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available for daily report lookup.");
  const [saved] = await db.select({ snapshot: dailyAgentReports.snapshot })
    .from(dailyAgentReports)
    .where(and(eq(dailyAgentReports.agentId, agentId), eq(dailyAgentReports.reportDate, reportDate)))
    .limit(1);
  return (saved?.snapshot as unknown as DailyAgentReportSnapshot | undefined) ?? null;
}

let schedulerTimer: NodeJS.Timeout | undefined;
let startupRecoveryTimer: NodeJS.Timeout | undefined;

/** Return the next 6:00 PM America/New_York execution time, including DST. */
export function getNextDailyReportAt6PmEastern(now = new Date()): Date {
  const eastern = getEasternTimeParts(now);
  let targetDate = easternDateKey(eastern);
  if (eastern.hour > REPORT_HOUR || (eastern.hour === REPORT_HOUR && (eastern.minute > 0 || eastern.second > 0))) {
    targetDate = addEasternDays(targetDate, 1);
  }
  return easternDateTimeToUtc(targetDate, REPORT_HOUR);
}

function scheduleNextReport(): void {
  if (schedulerTimer) clearTimeout(schedulerTimer);
  const nextRun = getNextDailyReportAt6PmEastern();
  const delay = Math.max(nextRun.getTime() - Date.now(), 1000);
  console.info(`[DailyAgentReport] Next daily report scheduled for ${nextRun.toLocaleString("en-US", { timeZone: EASTERN_TIME_ZONE })}.`);
  schedulerTimer = setTimeout(async () => {
    await sendDailyAgentReports();
    scheduleNextReport();
  }, delay);
}

/** Schedule a daily 6 PM Eastern agent report with same-day restart recovery. */
export function scheduleDailyAgentReports(): void {
  scheduleNextReport();
  if (startupRecoveryTimer) clearTimeout(startupRecoveryTimer);
  startupRecoveryTimer = setTimeout(() => {
    const eastern = getEasternTimeParts();
    if (eastern.hour >= REPORT_HOUR) {
      sendDailyAgentReports().catch((error) => console.error("[DailyAgentReport] Startup recovery failed.", error));
    }
  }, 30_000);
}
