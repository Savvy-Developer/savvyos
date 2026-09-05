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
            affectedMessages: {
              type: "array",
              items: { type: "string" },
              maxItems: 10,
            },
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
  return denominator > 0
    ? `${((numerator / denominator) * 100).toFixed(1)}%`
    : "—";
}

function text(value: string | null | undefined, max = 900): string {
  const clean = (value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function messageContent(
  response: Awaited<ReturnType<typeof invokeLLM>>
): string {
  const content = response.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((part): part is { type: "text"; text: string } =>
        Boolean(
          part && typeof part === "object" && (part as any).type === "text"
        )
      )
      .map(part => part.text)
      .join("\n");
  }
  return "";
}

type SmartPlanAnalysis = {
  executiveSummary: string;
  strongestMessages: Array<{
    message: string;
    evidence: string;
    recommendation: string;
  }>;
  timingInsights: Array<{ finding: string; evidence: string; action: string }>;
  deliverabilityAndCompliance: Array<{
    finding: string;
    impact: string;
    action: string;
  }>;
  recommendations: Array<{
    priority: "high" | "medium" | "low";
    change: string;
    rationale: string;
    affectedMessages: string[];
  }>;
  caveats: string[];
};

export type SmartPlanAiAnalysisResult = {
  generatedAt: Date;
  analysis: SmartPlanAnalysis;
  evidence: any;
  usedAi: boolean;
};

function fallbackAnalysis(evidence: any, error?: unknown): SmartPlanAnalysis {
  const messages = Array.isArray(evidence.messages) ? evidence.messages : [];
  const totalSent = Number(evidence.totalEmailSends ?? 0);
  const totals = messages.reduce(
    (acc: RawMetrics, message: any) => {
      const metrics = message.metrics ?? {};
      for (const key of Object.keys(acc) as Array<keyof RawMetrics>)
        acc[key] += number(metrics[key]);
      return acc;
    },
    {
      executions: 0,
      sent: 0,
      delivered: 0,
      opened: 0,
      clicked: 0,
      replied: 0,
      bounced: 0,
      complained: 0,
      suppressed: 0,
      unsubscribed: 0,
      failed: 0,
      skipped: 0,
    }
  );
  const strongest = [...messages]
    .filter((message: any) => number(message.metrics?.sent) > 0)
    .sort(
      (left: any, right: any) =>
        number(right.metrics?.replied) - number(left.metrics?.replied) ||
        number(right.metrics?.opened) - number(left.metrics?.opened) ||
        number(right.metrics?.sent) - number(left.metrics?.sent)
    )[0];
  const busiestWindow = Array.isArray(evidence.timingBuckets)
    ? [...evidence.timingBuckets].sort(
        (left: any, right: any) => number(right.sent) - number(left.sent)
      )[0]
    : null;
  const summary = totalSent
    ? `SavvyOS reviewed ${totalSent.toLocaleString()} recorded Smart Plan and one-time message sends. This evidence-led summary is available now; model-generated commentary will be used again on the next analysis run when the AI service is available.`
    : "There are no successfully sent Smart Plan emails with performance telemetry yet. Publish or send a campaign, then return after delivery events have had time to arrive.";

  return {
    executiveSummary: summary,
    strongestMessages: strongest
      ? [
          {
            message: strongest.message,
            evidence: `${number(strongest.metrics?.sent).toLocaleString()} sent · ${number(strongest.metrics?.opened).toLocaleString()} opened (${strongest.metrics?.openRate ?? "—"}) · ${number(strongest.metrics?.replied).toLocaleString()} replied (${strongest.metrics?.replyRate ?? "—"}).`,
            recommendation:
              "Use this message as a controlled baseline while testing one subject, send window, or call to action at a time.",
          },
        ]
      : [],
    timingInsights: busiestWindow
      ? [
          {
            finding: `${busiestWindow.window} has the most recorded sends in the available timing data.`,
            evidence: `${number(busiestWindow.sent).toLocaleString()} sent · ${number(busiestWindow.opened).toLocaleString()} opened (${busiestWindow.openRate ?? "—"}) · ${number(busiestWindow.replied).toLocaleString()} replied (${busiestWindow.replyRate ?? "—"}).`,
            action:
              "Treat this as a starting point, not a conclusion, until comparable send volume is available across multiple windows.",
          },
        ]
      : [],
    deliverabilityAndCompliance: [
      {
        finding:
          totals.bounced || totals.complained || totals.suppressed
            ? `${totals.bounced.toLocaleString()} bounced, ${totals.complained.toLocaleString()} complained, and ${totals.suppressed.toLocaleString()} suppressed sends are recorded.`
            : "No bounced, complained, or suppressed sends are recorded in the analyzed evidence.",
        impact:
          "Delivery and consent events should remain part of each campaign review before scaling a message or audience.",
        action:
          "Keep honoring opt-outs and do-not-contact flags, and investigate delivery exceptions before expanding send volume.",
      },
    ],
    recommendations: [
      {
        priority: "high",
        change: totalSent
          ? "Use the current delivery data as a baseline."
          : "Establish an initial Smart Plan email baseline.",
        rationale: totalSent
          ? "This review uses recorded delivery and engagement events, but signals with fewer than 30 sends remain directional."
          : "No sent-message performance data is available to compare yet.",
        affectedMessages: strongest ? [strongest.message] : [],
      },
      {
        priority: "medium",
        change: "Test one campaign variable at a time.",
        rationale:
          "Separating subject, timing, and message changes makes future results easier to interpret.",
        affectedMessages: strongest ? [strongest.message] : [],
      },
      {
        priority: "low",
        change: "Return after more delivery events are recorded.",
        rationale:
          "More sends and response events improve confidence in message and timing patterns.",
        affectedMessages: [],
      },
    ],
    caveats: [
      "This is an evidence-led fallback rather than a model-generated interpretation.",
      "Open, click, reply, bounce, complaint, and suppression figures are provider events recorded by SavvyOS; unsubscribes are a contact-level proxy.",
      ...(error
        ? [
            "The AI service was temporarily unavailable or returned an unreadable result. The complete evidence summary remains available in SavvyOS.",
          ]
        : []),
    ],
  };
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/** Renders the same result shown in SavvyOS into a concise internal email. */
export function renderSmartPlanAnalysisEmail(
  result: SmartPlanAiAnalysisResult,
  requestedByName: string | null | undefined
): string {
  const analysis = result.analysis;
  const section = (title: string, body: string) => `
    <div style="margin:18px 0;padding:16px;border:1px solid #E5E7EB;border-radius:8px;background:#FFFFFF;">
      <p style="margin:0 0 8px;font-size:15px;font-weight:700;color:#111827;">${escapeHtml(title)}</p>
      ${body}
    </div>`;
  const bullets = (items: string[]) =>
    items.length
      ? `<ul style="margin:8px 0 0;padding-left:20px;font-size:14px;line-height:1.55;color:#374151;">${items.map(item => `<li style="margin:0 0 7px;">${escapeHtml(item)}</li>`).join("")}</ul>`
      : `<p style="margin:0;font-size:14px;color:#6B7280;">No observations are available yet.</p>`;
  const recommendationItems = analysis.recommendations.map(
    item => `${item.priority.toUpperCase()}: ${item.change} — ${item.rationale}`
  );
  const messageItems = analysis.strongestMessages.map(
    item =>
      `${item.message}: ${item.evidence} Recommended use: ${item.recommendation}`
  );
  const timingItems = analysis.timingInsights.map(
    item => `${item.finding} ${item.evidence} Action: ${item.action}`
  );
  const deliveryItems = analysis.deliverabilityAndCompliance.map(
    item => `${item.finding} Impact: ${item.impact} Action: ${item.action}`
  );

  return `
    <p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#374151;">${escapeHtml(requestedByName || "An admin")} requested this Smart Plans analysis.</p>
    <div style="margin:0 0 18px;padding:14px 16px;border-left:3px solid #0FC0DF;background:#F8FAFC;border-radius:6px;">
      <p style="margin:0;font-size:14px;line-height:1.6;color:#374151;">${escapeHtml(analysis.executiveSummary)}</p>
    </div>
    ${section("Top messages", bullets(messageItems))}
    ${section("Timing insights", bullets(timingItems))}
    ${section("Deliverability & compliance", bullets(deliveryItems))}
    ${section("Prioritized recommendations", bullets(recommendationItems))}
    ${analysis.caveats.length ? section("Data caveats", bullets(analysis.caveats)) : ""}`;
}

function localTimeParts(
  date: Date,
  timeZone: string
): { weekday: string; hour: number } | null {
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

/** Builds an aggregate-only Smart Plans evidence pack and asks the configured AI model for a grounded performance review. */
export async function analyzeSmartPlanPerformance(): Promise<SmartPlanAiAnalysisResult> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const [automatedRows, oneTimeRows, automatedTiming, oneTimeTiming] =
    await Promise.all([
      db
        .select({
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
        })
        .from(smartPlanSteps)
        .innerJoin(smartPlans, eq(smartPlanSteps.planId, smartPlans.id))
        .leftJoin(
          smartPlanExecutions,
          eq(smartPlanExecutions.stepId, smartPlanSteps.id)
        )
        .leftJoin(
          smartPlanEnrollments,
          eq(smartPlanExecutions.enrollmentId, smartPlanEnrollments.id)
        )
        .leftJoin(contacts, eq(smartPlanEnrollments.contactId, contacts.id))
        .groupBy(smartPlanSteps.id)
        .orderBy(asc(smartPlans.name), asc(smartPlanSteps.stepOrder)),
      db
        .select({
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
        })
        .from(oneTimeSends)
        .leftJoin(
          oneTimeSendRecipients,
          eq(oneTimeSendRecipients.sendId, oneTimeSends.id)
        )
        .leftJoin(contacts, eq(oneTimeSendRecipients.contactId, contacts.id))
        .groupBy(oneTimeSends.id)
        .orderBy(desc(oneTimeSends.createdAt)),
      db
        .select({
          sentAt: smartPlanExecutions.sentAt,
          openedAt: smartPlanExecutions.openedAt,
          repliedAt: smartPlanExecutions.repliedAt,
          timezone: smartPlanSteps.timezone,
        })
        .from(smartPlanExecutions)
        .innerJoin(
          smartPlanSteps,
          eq(smartPlanExecutions.stepId, smartPlanSteps.id)
        )
        .where(
          and(
            eq(smartPlanExecutions.channel, "email"),
            eq(smartPlanExecutions.status, "sent")
          )
        )
        .orderBy(desc(smartPlanExecutions.sentAt))
        .limit(MAX_TIMING_EVENTS),
      db
        .select({
          sentAt: oneTimeSendRecipients.sentAt,
          openedAt: oneTimeSendRecipients.openedAt,
          repliedAt: oneTimeSendRecipients.repliedAt,
        })
        .from(oneTimeSendRecipients)
        .innerJoin(
          oneTimeSends,
          eq(oneTimeSendRecipients.sendId, oneTimeSends.id)
        )
        .where(
          and(
            eq(oneTimeSends.channel, "email"),
            eq(oneTimeSendRecipients.status, "sent")
          )
        )
        .orderBy(desc(oneTimeSendRecipients.sentAt))
        .limit(MAX_TIMING_EVENTS),
    ]);

  const timing = new Map<
    string,
    { sent: number; opened: number; replied: number }
  >();
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
      schedule: {
        timezone: row.timezone,
        days: row.sendDays,
        startHour: row.sendStartHour,
        endHour: row.sendEndHour,
      },
      metrics: metricSummary(
        asMetrics(row as unknown as Record<string, unknown>)
      ),
    })),
    ...oneTimeRows.map(row => ({
      kind: "one_time_send",
      message: row.sendName,
      channel: row.channel,
      subject: row.subject ?? "(no subject)",
      bodyExcerpt: text(row.body),
      schedule: { scheduledAt: row.scheduledAt, timezone: "America/New_York" },
      metrics: metricSummary(
        asMetrics(row as unknown as Record<string, unknown>)
      ),
    })),
  ];
  const totalSent = messages.reduce(
    (total, message) => total + message.metrics.sent,
    0
  );
  if (!totalSent) {
    return {
      generatedAt: new Date(),
      analysis: {
        executiveSummary:
          "There are no successfully sent Smart Plan emails with performance telemetry yet. Publish or send a campaign, then return after delivery events have had time to arrive.",
        strongestMessages: [],
        timingInsights: [],
        deliverabilityAndCompliance: [],
        recommendations: [
          {
            priority: "high",
            change:
              "Establish a baseline with a clearly tagged email campaign.",
            rationale:
              "No sent email records are available to compare message or timing performance.",
            affectedMessages: [],
          },
          {
            priority: "medium",
            change:
              "Wait for delivery and engagement events before selecting winners.",
            rationale:
              "Open, reply, bounce, and suppression metrics are event-driven and may lag initial sends.",
            affectedMessages: [],
          },
          {
            priority: "low",
            change:
              "Keep testing one variable at a time once volume is available.",
            rationale:
              "A consistent test structure makes later AI findings more actionable.",
            affectedMessages: [],
          },
        ],
        caveats: [
          "No performance data was available, so this review did not invoke the AI model.",
        ],
      },
      evidence: { totalEmailSends: 0, messages: [] },
      usedAi: false,
    };
  }

  const timingBuckets = Array.from(timing.entries())
    .map(([window, metrics]) => ({
      window,
      ...metrics,
      openRate: rate(metrics.opened, metrics.sent),
      replyRate: rate(metrics.replied, metrics.sent),
    }))
    .sort(
      (left, right) =>
        right.sent - left.sent || left.window.localeCompare(right.window)
    );
  const evidence = {
    generatedAt: new Date().toISOString(),
    totalEmailSends: totalSent,
    timingCoverage: {
      automatedEvents: automatedTiming.length,
      oneTimeEvents: oneTimeTiming.length,
      maximumEventsPerSource: MAX_TIMING_EVENTS,
    },
    messages,
    timingBuckets,
    trackingNotes: [
      "Open, click, reply, bounce, complaint, and suppression figures are provider events recorded by SavvyOS.",
      "An unsubscribe proxy counts a contact whose emailUnsubscribedAt was recorded at or after the send; it is not a provider-attributed unsubscribe event.",
      "One-time send timing is reported in America/New_York because a recipient-local timezone is not retained for that channel.",
      "SMS does not have open-rate telemetry and should be evaluated primarily on sends, replies, failures, and opt-outs.",
    ],
  };

  try {
    // This is an interactive page action. A single bounded attempt prevents a
    // provider outage from leaving the UI spinning indefinitely; the evidence
    // fallback below still returns a useful report to the requester.
    const response = await invokeLLM({
      model: "gpt-5-mini",
      reasoning: { effort: "medium" },
      messages: [
        {
          role: "system",
          content:
            "You are a rigorous lifecycle marketing analyst for an internal brokerage system. Analyze only the supplied aggregate campaign evidence. Never invent a rate, causality, deliverability fact, or unsubscribe measurement. Treat results with fewer than 30 sent messages as directional and say so. Do not expose personal data. Do not recommend bypassing consent, opt-outs, or email compliance. Return JSON only.",
        },
        {
          role: "user",
          content: `Prepare a deep but concise Smart Plans performance review from this evidence. Focus on message/subject strengths, open and reply performance, practical day/time patterns, deliverability and compliance signals, and prioritized concrete changes. Differentiate statistically thin signals from repeatable patterns. Mention unavailable or proxy metrics plainly.\n\n${JSON.stringify(evidence)}`,
        },
      ],
      response_format: { type: "json_schema", json_schema: ANALYSIS_SCHEMA },
      maxTokens: 2_600,
      timeoutMs: 20_000,
      maxAttempts: 1,
    });
    const content = messageContent(response);
    if (!content)
      throw new Error("The Smart Plans analysis model returned no content.");
    const analysis = JSON.parse(content) as SmartPlanAnalysis;
    return { generatedAt: new Date(), analysis, evidence, usedAi: true };
  } catch (error) {
    console.warn(
      "[SmartPlans] AI analysis failed; returning evidence fallback:",
      error
    );
    return {
      generatedAt: new Date(),
      analysis: fallbackAnalysis(evidence, error),
      evidence,
      usedAi: false,
    };
  }
}
