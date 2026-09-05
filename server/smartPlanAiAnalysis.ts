import { and, asc, desc, eq, sql } from "drizzle-orm";
import {
  contacts,
  oneTimeSendRecipients,
  oneTimeSends,
  smartPlanEnrollments,
  smartPlanExecutions,
  smartPlanSteps,
  smartPlans,
} from "../drizzle/schema";
import { invokeLLM } from "./_core/llm";
import { getDb } from "./db";

const MAX_TIMING_EVENTS = 15_000;

const ANALYSIS_SCHEMA = {
  name: "smart_plan_performance_analysis",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "executiveSummary",
      "strongestMessages",
      "timingInsights",
      "deliverabilityAndCompliance",
      "recommendations",
      "caveats",
    ],
    properties: {
      executiveSummary: { type: "string" },
      strongestMessages: {
        type: "array",
        maxItems: 8,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["message", "evidence", "recommendation"],
          properties: {
            message: { type: "string" },
            evidence: { type: "string" },
            recommendation: { type: "string" },
          },
        },
      },
      timingInsights: {
        type: "array",
        maxItems: 8,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["finding", "evidence", "action"],
          properties: {
            finding: { type: "string" },
            evidence: { type: "string" },
            action: { type: "string" },
          },
        },
      },
      deliverabilityAndCompliance: {
        type: "array",
        maxItems: 8,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["finding", "impact", "action"],
          properties: {
            finding: { type: "string" },
            impact: { type: "string" },
            action: { type: "string" },
          },
        },
      },
      recommendations: {
        type: "array",
        minItems: 3,
        maxItems: 10,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["priority", "change", "rationale", "affectedMessages"],
          properties: {
            priority: { type: "string", enum: ["high", "medium", "low"] },
            change: { type: "string" },
            rationale: { type: "string" },
            affectedMessages: { type: "array", items: { type: "string" }, maxItems: 10 },
          },
        },
      },
      caveats: { type: "array", items: { type: "string" }, maxItems: 10 },
    },
  },
} as const;

type RawMetrics = {
  executions: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  replied: number;
  bounced: number;
  complained: number;
  suppressed: number;
  unsubscribed: number;
  failed: number;
  skipped: number;
};

function number(value: unknown): number {
  return Number(value ?? 0);
}

function rate(numerator: number, denominator: number): string {
  return denominator > 0 ? `${((numerator / denominator) * 100).toFixed(1)}%` : "—";
}

function text(value: string | null | undefined, max = 900): string {
  const clean = (value ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

function asMetrics(row: Record<string, unknown>): RawMetrics {
  return {
    executions: number(row.executions),
    sent: number(row.sent),
    delivered: number(row.delivered),
    opened: number(row.opened),
    clicked: number(row.clicked),
    replied: number(row.replied),
    bounced: number(row.bounced),
    complained: number(row.complained),
    suppressed: number(row.suppressed),
    unsubscribed: number(row.unsubscribed),
    failed: number(row.failed),
    skipped: number(row.skipped),
  };
}

function metricSummary(metrics: RawMetrics) {
  const eligible = metrics.sent;
  return {
    ...metrics,
    openRate: rate(metrics.opened, eligible),
    replyRate: rate(metrics.replied, eligible),
    clickRate: rate(metrics.clicked, eligible),
    bounceRate: rate(metrics.bounced, eligible),
    complaintRate: rate(metrics.complained, eligible),
    suppressionRate: rate(metrics.suppressed, eligible),
    unsubscribeRate: rate(metrics.unsubscribed, eligible),
  };
}

function messageContent(response: Awaited<ReturnType<typeof invokeLLM>>): string {
  const content = response.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.filter((part): part is { type: "text"; text: string } => Boolean(part && typeof part === "object" && (part as any).type === "text"))
      .map(part => part.text)
      .join("\n");
  }
  return "";
}

function localTimeParts(date: Date, timeZone: string): { weekday: string; hour: number } | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timeZone || "America/New_York",
      weekday: "short",
      hour: "numeric",
      hourCycle: "h23",
    }).formatToParts(date);
    const weekday = parts.find(part => part.type === "weekday")?.value;
    const hour = Number(parts.find(part => part.type === "hour")?.value);
    if (!weekday || !Number.isFinite(hour)) return null;
    return { weekday, hour };
  } catch {
    return null;
  }
}

function bucketKey(parts: { weekday: string; hour: number }): string {
  const suffix = parts.hour >= 12 ? "PM" : "AM";
  const hour = parts.hour % 12 || 12;
  return `${parts.weekday} ${hour}:00 ${suffix}`;
}

/** Builds an aggregate-only Smart Plans evidence pack and asks GPT-5 for a grounded performance review. */
export async function analyzeSmartPlanPerformance(): Promise<{ generatedAt: Date; analysis: unknown; evidence: unknown }> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const [automatedRows, oneTimeRows, automatedTiming, oneTimeTiming] = await Promise.all([
    db.select({
      planName: smartPlans.name,
      planStatus: smartPlans.status,
      stepId: smartPlanSteps.id,
      stepOrder: smartPlanSteps.stepOrder,
      channel: smartPlanSteps.channel,
      subject: smartPlanSteps.subject,
      body: smartPlanSteps.body,
      timezone: smartPlanSteps.timezone,
      sendDays: smartPlanSteps.sendDays,
      sendStartHour: smartPlanSteps.sendStartHour,
      sendEndHour: smartPlanSteps.sendEndHour,
      executions: sql<number>`count(${smartPlanExecutions.id})`,
      sent: sql<number>`coalesce(sum(case when ${smartPlanExecutions.status} = 'sent' then 1 else 0 end), 0)`,
      delivered: sql<number>`coalesce(sum(case when ${smartPlanExecutions.deliveredAt} is not null then 1 else 0 end), 0)`,
      opened: sql<number>`coalesce(sum(case when ${smartPlanExecutions.openedAt} is not null then 1 else 0 end), 0)`,
      clicked: sql<number>`coalesce(sum(case when ${smartPlanExecutions.clickedAt} is not null then 1 else 0 end), 0)`,
      replied: sql<number>`coalesce(sum(case when ${smartPlanExecutions.repliedAt} is not null then 1 else 0 end), 0)`,
      bounced: sql<number>`coalesce(sum(case when ${smartPlanExecutions.bouncedAt} is not null then 1 else 0 end), 0)`,
      complained: sql<number>`coalesce(sum(case when ${smartPlanExecutions.complainedAt} is not null then 1 else 0 end), 0)`,
      suppressed: sql<number>`coalesce(sum(case when ${smartPlanExecutions.suppressedAt} is not null then 1 else 0 end), 0)`,
      unsubscribed: sql<number>`coalesce(sum(case when ${contacts.emailUnsubscribedAt} is not null and ${contacts.emailUnsubscribedAt} >= ${smartPlanExecutions.sentAt} then 1 else 0 end), 0)`,
      failed: sql<number>`coalesce(sum(case when ${smartPlanExecutions.status} = 'failed' then 1 else 0 end), 0)`,
      skipped: sql<number>`coalesce(sum(case when ${smartPlanExecutions.status} = 'skipped' then 1 else 0 end), 0)`,
    }).from(smartPlanSteps)
      .innerJoin(smartPlans, eq(smartPlanSteps.planId, smartPlans.id))
      .leftJoin(smartPlanExecutions, eq(smartPlanExecutions.stepId, smartPlanSteps.id))
      .leftJoin(smartPlanEnrollments, eq(smartPlanExecutions.enrollmentId, smartPlanEnrollments.id))
      .leftJoin(contacts, eq(smartPlanEnrollments.contactId, contacts.id))
      .groupBy(smartPlanSteps.id)
      .orderBy(asc(smartPlans.name), asc(smartPlanSteps.stepOrder)),
    db.select({
      sendId: oneTimeSends.id,
      sendName: oneTimeSends.name,
      channel: oneTimeSends.channel,
      subject: oneTimeSends.subject,
      body: oneTimeSends.body,
      scheduledAt: oneTimeSends.scheduledAt,
      executions: sql<number>`count(${oneTimeSendRecipients.id})`,
      sent: sql<number>`coalesce(sum(case when ${oneTimeSendRecipients.status} = 'sent' then 1 else 0 end), 0)`,
      delivered: sql<number>`coalesce(sum(case when ${oneTimeSendRecipients.deliveredAt} is not null then 1 else 0 end), 0)`,
      opened: sql<number>`coalesce(sum(case when ${oneTimeSendRecipients.openedAt} is not null then 1 else 0 end), 0)`,
      clicked: sql<number>`coalesce(sum(case when ${oneTimeSendRecipients.clickedAt} is not null then 1 else 0 end), 0)`,
      replied: sql<number>`coalesce(sum(case when ${oneTimeSendRecipients.repliedAt} is not null then 1 else 0 end), 0)`,
      bounced: sql<number>`coalesce(sum(case when ${oneTimeSendRecipients.bouncedAt} is not null then 1 else 0 end), 0)`,
      complained: sql<number>`coalesce(sum(case when ${oneTimeSendRecipients.complainedAt} is not null then 1 else 0 end), 0)`,
      suppressed: sql<number>`coalesce(sum(case when ${oneTimeSendRecipients.suppressedAt} is not null then 1 else 0 end), 0)`,
      unsubscribed: sql<number>`coalesce(sum(case when ${contacts.emailUnsubscribedAt} is not null and ${contacts.emailUnsubscribedAt} >= ${oneTimeSendRecipients.sentAt} then 1 else 0 end), 0)`,
      failed: sql<number>`coalesce(sum(case when ${oneTimeSendRecipients.status} = 'failed' then 1 else 0 end), 0)`,
      skipped: sql<number>`coalesce(sum(case when ${oneTimeSendRecipients.status} = 'skipped' then 1 else 0 end), 0)`,
    }).from(oneTimeSends)
      .leftJoin(oneTimeSendRecipients, eq(oneTimeSendRecipients.sendId, oneTimeSends.id))
      .leftJoin(contacts, eq(oneTimeSendRecipients.contactId, contacts.id))
      .groupBy(oneTimeSends.id)
      .orderBy(desc(oneTimeSends.createdAt)),
    db.select({
      sentAt: smartPlanExecutions.sentAt,
      openedAt: smartPlanExecutions.openedAt,
      repliedAt: smartPlanExecutions.repliedAt,
      timezone: smartPlanSteps.timezone,
    }).from(smartPlanExecutions)
      .innerJoin(smartPlanSteps, eq(smartPlanExecutions.stepId, smartPlanSteps.id))
      .where(and(eq(smartPlanExecutions.channel, "email"), eq(smartPlanExecutions.status, "sent")))
      .orderBy(desc(smartPlanExecutions.sentAt))
      .limit(MAX_TIMING_EVENTS),
    db.select({
      sentAt: oneTimeSendRecipients.sentAt,
      openedAt: oneTimeSendRecipients.openedAt,
      repliedAt: oneTimeSendRecipients.repliedAt,
    }).from(oneTimeSendRecipients)
      .innerJoin(oneTimeSends, eq(oneTimeSendRecipients.sendId, oneTimeSends.id))
      .where(and(eq(oneTimeSends.channel, "email"), eq(oneTimeSendRecipients.status, "sent")))
      .orderBy(desc(oneTimeSendRecipients.sentAt))
      .limit(MAX_TIMING_EVENTS),
  ]);

  const timing = new Map<string, { sent: number; opened: number; replied: number }>();
  for (const event of automatedTiming) {
    const parts = localTimeParts(event.sentAt, event.timezone);
    if (!parts) continue;
    const key = bucketKey(parts);
    const current = timing.get(key) ?? { sent: 0, opened: 0, replied: 0 };
    current.sent += 1;
    if (event.openedAt) current.opened += 1;
    if (event.repliedAt) current.replied += 1;
    timing.set(key, current);
  }
  for (const event of oneTimeTiming) {
    // One-time sends do not retain a recipient-local timezone, so report their
    // send performance in SavvyOS's operating timezone.
    if (!event.sentAt) continue;
    const parts = localTimeParts(event.sentAt, "America/New_York");
    if (!parts) continue;
    const key = bucketKey(parts);
    const current = timing.get(key) ?? { sent: 0, opened: 0, replied: 0 };
    current.sent += 1;
    if (event.openedAt) current.opened += 1;
    if (event.repliedAt) current.replied += 1;
    timing.set(key, current);
  }

  const messages = [
    ...automatedRows.map(row => ({
      kind: "automated_step",
      message: `${row.planName} · Step ${row.stepOrder + 1}`,
      channel: row.channel,
      subject: row.subject ?? "(no subject)",
      bodyExcerpt: text(row.body),
      schedule: { timezone: row.timezone, days: row.sendDays, startHour: row.sendStartHour, endHour: row.sendEndHour },
      metrics: metricSummary(asMetrics(row as unknown as Record<string, unknown>)),
    })),
    ...oneTimeRows.map(row => ({
      kind: "one_time_send",
      message: row.sendName,
      channel: row.channel,
      subject: row.subject ?? "(no subject)",
      bodyExcerpt: text(row.body),
      schedule: { scheduledAt: row.scheduledAt, timezone: "America/New_York" },
      metrics: metricSummary(asMetrics(row as unknown as Record<string, unknown>)),
    })),
  ];
  const totalSent = messages.reduce((total, message) => total + message.metrics.sent, 0);
  if (!totalSent) {
    return {
      generatedAt: new Date(),
      analysis: {
        executiveSummary: "There are no successfully sent Smart Plan emails with performance telemetry yet. Publish or send a campaign, then return after delivery events have had time to arrive.",
        strongestMessages: [],
        timingInsights: [],
        deliverabilityAndCompliance: [],
        recommendations: [
          { priority: "high", change: "Establish a baseline with a clearly tagged email campaign.", rationale: "No sent email records are available to compare message or timing performance.", affectedMessages: [] },
          { priority: "medium", change: "Wait for delivery and engagement events before selecting winners.", rationale: "Open, reply, bounce, and suppression metrics are event-driven and may lag initial sends.", affectedMessages: [] },
          { priority: "low", change: "Keep testing one variable at a time once volume is available.", rationale: "A consistent test structure makes later AI findings more actionable.", affectedMessages: [] },
        ],
        caveats: ["No performance data was available, so this review did not invoke the AI model."],
      },
      evidence: { totalSent: 0, messages: [] },
    };
  }

  const timingBuckets = Array.from(timing.entries())
    .map(([window, metrics]) => ({ window, ...metrics, openRate: rate(metrics.opened, metrics.sent), replyRate: rate(metrics.replied, metrics.sent) }))
    .sort((left, right) => right.sent - left.sent || left.window.localeCompare(right.window));
  const evidence = {
    generatedAt: new Date().toISOString(),
    totalEmailSends: totalSent,
    timingCoverage: { automatedEvents: automatedTiming.length, oneTimeEvents: oneTimeTiming.length, maximumEventsPerSource: MAX_TIMING_EVENTS },
    messages,
    timingBuckets,
    trackingNotes: [
      "Open, click, reply, bounce, complaint, and suppression figures are provider events recorded by SavvyOS.",
      "An unsubscribe proxy counts a contact whose emailUnsubscribedAt was recorded at or after the send; it is not a provider-attributed unsubscribe event.",
      "One-time send timing is reported in America/New_York because a recipient-local timezone is not retained for that channel.",
      "SMS does not have open-rate telemetry and should be evaluated primarily on sends, replies, failures, and opt-outs.",
    ],
  };

  const response = await invokeLLM({
    model: "gpt-5",
    reasoning: { effort: "medium" },
    messages: [
      {
        role: "system",
        content: "You are a rigorous lifecycle marketing analyst for an internal brokerage system. Analyze only the supplied aggregate campaign evidence. Never invent a rate, causality, deliverability fact, or unsubscribe measurement. Treat results with fewer than 30 sent messages as directional and say so. Do not expose personal data. Do not recommend bypassing consent, opt-outs, or email compliance. Return JSON only.",
      },
      {
        role: "user",
        content: `Prepare a deep but concise Smart Plans performance review from this evidence. Focus on message/subject strengths, open and reply performance, practical day/time patterns, deliverability and compliance signals, and prioritized concrete changes. Differentiate statistically thin signals from repeatable patterns. Mention unavailable or proxy metrics plainly.\n\n${JSON.stringify(evidence)}`,
      },
    ],
    response_format: { type: "json_schema", json_schema: ANALYSIS_SCHEMA },
    maxTokens: 4_000,
  } as any);
  const content = messageContent(response);
  if (!content) throw new Error("The Smart Plans analysis model returned no content.");
  return { generatedAt: new Date(), analysis: JSON.parse(content), evidence };
}
