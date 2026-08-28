import { TRPCError } from "@trpc/server";
import { pulseMemberProcedure } from "./authorization";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import {
  aiObservationRules,
  aiObservations,
  pulseMeetingMembers,
  pulseMeetingScorecardMetrics,
  pulseNotifications,
  pulseWorkItems,
  rolesResponsibilities,
  rrMetricValues,
  rrScorecardMetrics,
} from "../../drizzle/schema";
import { invokeLLM } from "../_core/llm";
import { router } from "../_core/trpc";
import { getDb } from "../db";
import { require_visible_meeting } from "./access";

const id = () => crypto.randomUUID();
const MODEL = "gpt-5-mini";
const DEFAULT_RULES = [
  { ruleKey: "consecutive_decline", label: "Three or more consecutive periods declining", config: { minimumPeriods: 3 } },
  { ruleKey: "below_target", label: "Twenty percent or more below target for two or more periods", config: { minimumPeriods: 2, thresholdPercent: 20 } },
  { ruleKey: "missing_data", label: "Missing data for two or more periods", config: { minimumPeriods: 2 } },
  { ruleKey: "inverse_correlation", label: "Metric moves opposite to a correlated metric", config: { minimumPeriods: 3 } },
];

function unavailable() { return new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Metric observations are not available right now. Please try again." }); }
async function dbOrThrow() { const db = await getDb(); if (!db) throw unavailable(); return db; }
function numeric(value: unknown) { const result = Number(value); return Number.isFinite(result) ? result : null; }
function fmt(value: number) { return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value); }

async function seedRules(db: any) {
  for (const rule of DEFAULT_RULES) await db.insert(aiObservationRules).values({ id: id(), ruleKey: rule.ruleKey, label: rule.label, isEnabled: true, config: rule.config }).onDuplicateKeyUpdate({ set: { label: rule.label, config: rule.config } });
}

function triggerFor(metric: any, values: any[], rules: any[]) {
  const actuals = values.map((value) => numeric(value.actualValue));
  for (const rule of rules.filter((row: any) => row.isEnabled)) {
    const config = (rule.config ?? {}) as any;
    const count = Number(config.minimumPeriods ?? 2);
    if (rule.ruleKey === "consecutive_decline" && actuals.length >= count && actuals.slice(0, count).every((value, index, list) => value != null && (index === list.length - 1 || value! < list[index + 1]!))) return { ruleKey: rule.ruleKey, values: actuals.slice(0, count) };
    if (rule.ruleKey === "below_target" && metric.targetValue != null && actuals.length >= count) {
      const target = Number(metric.targetValue); const threshold = Number(config.thresholdPercent ?? 20) / 100;
      const below = actuals.slice(0, count).every((value) => value != null && (metric.performanceDirection === "higher" ? value! <= target * (1 - threshold) : value! >= target * (1 + threshold)));
      if (below) return { ruleKey: rule.ruleKey, values: actuals.slice(0, count), target };
    }
    if (rule.ruleKey === "missing_data" && values.length < count) return { ruleKey: rule.ruleKey, values: actuals };
  }
  return null;
}

async function observationSentence(metric: any, trigger: any) {
  const values = trigger.values.map((value: number | null) => value == null ? "missing" : fmt(value)).join(", ");
  const fact = `Metric: ${metric.name}. Direction: ${metric.performanceDirection}. Target: ${metric.targetValue == null ? "none" : fmt(Number(metric.targetValue))}. Recent values newest to oldest: ${values}. Trigger: ${trigger.ruleKey}.`;
  try {
    const response = await invokeLLM({
      model: MODEL,
      maxTokens: 120,
      messages: [
        { role: "system", content: "Write one plain-language operational observation from the supplied facts. Use one or two short sentences. State only the facts supplied. Name the metric and a specific number. Do not hedge, advise, assign work, or claim causation. Return only the observation." },
        { role: "user", content: fact },
      ],
    });
    const text = typeof response.choices[0]?.message?.content === "string" ? response.choices[0].message.content.trim() : "";
    if (text) return text;
  } catch (error) {
    console.warn("[Pulse observations] Sentence model unavailable; using the rule-based factual fallback.", error);
  }
  return `${metric.name} triggered the ${trigger.ruleKey.replaceAll("_", " ")} rule with recent values of ${values}.`;
}

/** This scheduler writes ai_observations only. It never inserts work, notifications, assignments, or messages. */
export async function generatePulseObservations() {
  const db = await getDb(); if (!db) return { written: 0, inspected: 0 };
  await seedRules(db);
  const rules = await db.select().from(aiObservationRules).where(eq(aiObservationRules.isEnabled, true));
  const metrics = await db.select().from(rrScorecardMetrics).where(eq(rrScorecardMetrics.status, "active"));
  let written = 0;
  for (const metric of metrics) {
    const values = await db.select().from(rrMetricValues).where(eq(rrMetricValues.metricId, metric.id)).orderBy(desc(rrMetricValues.periodEnd)).limit(6);
    const trigger = triggerFor(metric, values, rules); if (!trigger) continue;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const [existing] = await db.select({ id: aiObservations.id }).from(aiObservations).where(and(eq(aiObservations.savvyosMetricId, metric.id), eq(aiObservations.triggerRule, trigger.ruleKey), isNull(aiObservations.dismissedAt))).orderBy(desc(aiObservations.generatedAt)).limit(1);
    if (existing) continue;
    const observation = await observationSentence(metric, trigger);
    await db.insert(aiObservations).values({ id: id(), savvyosMetricId: metric.id, observation, triggerRule: trigger.ruleKey, generatedAt: today }); written += 1;
  }
  return { written, inspected: metrics.length };
}

let timer: NodeJS.Timeout | undefined;
export function schedulePulseObservationGeneration() {
  if (timer) clearInterval(timer);
  void generatePulseObservations().catch((error) => console.error("[Pulse observations] Initial generation failed", error));
  timer = setInterval(() => void generatePulseObservations().catch((error) => console.error("[Pulse observations] Scheduled generation failed", error)), 24 * 60 * 60 * 1000);
}

async function observationWithMetric(db: any, observationId: string) {
  const [row] = await db.select({ observation: aiObservations, metric: rrScorecardMetrics }).from(aiObservations).innerJoin(rrScorecardMetrics, eq(rrScorecardMetrics.id, aiObservations.savvyosMetricId)).where(eq(aiObservations.id, observationId)).limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "That generated observation is no longer available." }); return row;
}

async function proposalRecipients(db: any, meetingId: string) {
  const members = await db.select({ personId: pulseMeetingMembers.personId, meetingRole: pulseMeetingMembers.meetingRole }).from(pulseMeetingMembers).where(and(eq(pulseMeetingMembers.meetingId, meetingId), isNull(pulseMeetingMembers.removedAt), isNull(pulseMeetingMembers.deletedAt)));
  return members.filter((member: any) => member.meetingRole === "owner" || member.meetingRole === "administrator").map((member: any) => member.personId);
}

export const pulseObservationsRouter = router({
  forMeeting: pulseMemberProcedure.input(z.object({ meetingId: z.string().uuid() })).query(async ({ ctx, input }) => {
    const db = await dbOrThrow(); await require_visible_meeting(db, ctx.user.id, input.meetingId);
    const mapped = await db.select({ metricId: pulseMeetingScorecardMetrics.savvyosMetricId }).from(pulseMeetingScorecardMetrics).where(eq(pulseMeetingScorecardMetrics.meetingId, input.meetingId));
    const metricIds = mapped.map((row) => row.metricId).filter((value): value is number => value != null); if (!metricIds.length) return [];
    return db.select({ id: aiObservations.id, metricId: rrScorecardMetrics.id, metricName: rrScorecardMetrics.name, observation: aiObservations.observation, triggerRule: aiObservations.triggerRule, generatedAt: aiObservations.generatedAt, raisedAsIssueId: aiObservations.raisedAsIssueId, dismissedAt: aiObservations.dismissedAt })
      .from(aiObservations).innerJoin(rrScorecardMetrics, eq(rrScorecardMetrics.id, aiObservations.savvyosMetricId)).where(and(inArray(aiObservations.savvyosMetricId, metricIds), isNull(aiObservations.dismissedAt))).orderBy(desc(aiObservations.generatedAt));
  }),
  raiseAsIssue: pulseMemberProcedure.input(z.object({ observationId: z.string().uuid(), meetingId: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const db = await dbOrThrow(); await require_visible_meeting(db, ctx.user.id, input.meetingId);
    const row = await observationWithMetric(db, input.observationId);
    if (row.observation.dismissedAt) throw new TRPCError({ code: "BAD_REQUEST", message: "That observation was dismissed." });
    if (row.observation.raisedAsIssueId) return { success: true, workItemId: row.observation.raisedAsIssueId, alreadyRaised: true };
    const itemId = id(); const description = `Generated observation (${row.observation.generatedAt.toISOString().slice(0, 10)}):\n${row.observation.observation}`;
    const recipients = await proposalRecipients(db, input.meetingId);
    await db.transaction(async (tx: any) => {
      await tx.insert(pulseWorkItems).values({ id: itemId, type: "issue", title: `Review: ${row.metric.name}`, description, meetingId: input.meetingId, ownerPersonId: null, assigneeId: null, createdById: ctx.user.id, status: "open", percentComplete: 0, percentSource: "manual", origin: "ai_proposed", isProposed: true, savvyosMetricId: row.metric.id });
      await tx.update(aiObservations).set({ raisedAsIssueId: itemId }).where(eq(aiObservations.id, row.observation.id));
      if (recipients.length) await tx.insert(pulseNotifications).values(recipients.map((personId: number) => ({ id: id(), personId, notificationType: "proposed_issue" as const, requiresAction: true, sourceType: "work_item", sourceId: itemId, meetingId: input.meetingId, body: `Proposed issue: Review ${row.metric.name}.` })));
    });
    return { success: true, workItemId: itemId, alreadyRaised: false };
  }),
  acceptProposal: pulseMemberProcedure.input(z.object({ workItemId: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const db = await dbOrThrow(); const [item] = await db.select().from(pulseWorkItems).where(and(eq(pulseWorkItems.id, input.workItemId), isNull(pulseWorkItems.deletedAt))).limit(1);
    if (!item?.meetingId || item.type !== "issue" || !item.isProposed) throw new TRPCError({ code: "NOT_FOUND", message: "That proposed issue is no longer available." }); await require_visible_meeting(db, ctx.user.id, item.meetingId);
    await db.transaction(async (tx: any) => { await tx.update(pulseWorkItems).set({ isProposed: false }).where(eq(pulseWorkItems.id, item.id)); await tx.update(pulseNotifications).set({ clearedAt: new Date() }).where(and(eq(pulseNotifications.sourceType, "work_item"), eq(pulseNotifications.sourceId, item.id))); }); return { success: true };
  }),
  dismissProposal: pulseMemberProcedure.input(z.object({ workItemId: z.string().uuid(), reason: z.string().trim().max(500).optional() })).mutation(async ({ ctx, input }) => {
    const db = await dbOrThrow(); const [item] = await db.select().from(pulseWorkItems).where(and(eq(pulseWorkItems.id, input.workItemId), isNull(pulseWorkItems.deletedAt))).limit(1);
    if (!item?.meetingId || item.type !== "issue" || !item.isProposed) throw new TRPCError({ code: "NOT_FOUND", message: "That proposed issue is no longer available." }); await require_visible_meeting(db, ctx.user.id, item.meetingId);
    await db.transaction(async (tx: any) => { await tx.update(pulseWorkItems).set({ status: "dropped", deletedAt: new Date() }).where(eq(pulseWorkItems.id, item.id)); await tx.update(aiObservations).set({ dismissedById: ctx.user.id, dismissedAt: new Date(), dismissReason: input.reason?.trim() || null }).where(eq(aiObservations.raisedAsIssueId, item.id)); await tx.update(pulseNotifications).set({ clearedAt: new Date() }).where(and(eq(pulseNotifications.sourceType, "work_item"), eq(pulseNotifications.sourceId, item.id))); }); return { success: true };
  }),
});
