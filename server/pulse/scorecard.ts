import { TRPCError } from "@trpc/server";
import { canOpenPulseSettings, pulseMemberProcedure, pulseProcedure } from "./authorization";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  pulseMeetingScorecardMetrics,
  pulseMeetings,
  rolesResponsibilities,
  rrMetricValues,
  rrScorecardMetrics,
  users,
} from "../../drizzle/schema";
import { router } from "../_core/trpc";
import { getDb } from "../db";
import { is_visible_meeting_manager, require_visible_meeting } from "./access";

export const SCORECARD_CADENCES = ["weekly", "monthly", "quarterly", "annually"] as const;
export type ScorecardCadence = (typeof SCORECARD_CADENCES)[number];

const id = () => crypto.randomUUID();
const cadenceSchema = z.enum(SCORECARD_CADENCES);

function unavailable() {
  return new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The SavvyOS scorecard is not available right now. Please try again." });
}

function dayStart(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function periodBounds(cadence: ScorecardCadence, reference = new Date()) {
  const day = dayStart(reference);
  if (cadence === "weekly") {
    const weekday = day.getUTCDay();
    const offset = weekday === 0 ? -6 : 1 - weekday;
    const start = addDays(day, offset);
    return { start, end: addDays(start, 7) };
  }
  if (cadence === "monthly") {
    const start = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1));
    return { start, end: new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + 1, 1)) };
  }
  if (cadence === "quarterly") {
    const month = Math.floor(day.getUTCMonth() / 3) * 3;
    const start = new Date(Date.UTC(day.getUTCFullYear(), month, 1));
    return { start, end: new Date(Date.UTC(day.getUTCFullYear(), month + 3, 1)) };
  }
  const start = new Date(Date.UTC(day.getUTCFullYear(), 0, 1));
  return { start, end: new Date(Date.UTC(day.getUTCFullYear() + 1, 0, 1)) };
}

function priorPeriod(cadence: ScorecardCadence, reference: Date) {
  if (cadence === "weekly") return addDays(reference, -7);
  if (cadence === "monthly") return new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() - 1, 1));
  if (cadence === "quarterly") return new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() - 3, 1));
  return new Date(Date.UTC(reference.getUTCFullYear() - 1, 0, 1));
}

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function formatPeriod(cadence: ScorecardCadence, start: Date) {
  if (cadence === "weekly") return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(start);
  if (cadence === "monthly") return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" }).format(start);
  if (cadence === "quarterly") return `Q${Math.floor(start.getUTCMonth() / 3) + 1} ${start.getUTCFullYear()}`;
  return String(start.getUTCFullYear());
}

function performance(actual: number | null, target: number | null, direction: string) {
  if (actual == null || target == null) return null;
  return direction === "higher" ? actual >= target : actual <= target;
}

function trendPhrase(values: Array<number | null>, cadence: ScorecardCadence) {
  const [current, prior, older] = values;
  if (current == null || prior == null) return null;
  const unit = cadence === "weekly" ? "week" : cadence === "monthly" ? "month" : cadence === "quarterly" ? "quarter" : "year";
  const direction = current > prior ? "up" : current < prior ? "down" : "flat";
  if (older != null && ((current > prior && prior > older) || (current < prior && prior < older))) return `3rd ${unit} ${direction === "up" ? "rising" : "declining"}`;
  return direction === "flat" ? "Holding steady" : `${direction === "up" ? "Trending up" : "Trending down"}`;
}

async function database() {
  const db = await getDb();
  if (!db) throw unavailable();
  return db;
}

async function mappingRows(db: any, meetingId: string) {
  return db.select({
    mapping: pulseMeetingScorecardMetrics,
    metric: rrScorecardMetrics,
    responsibility: rolesResponsibilities,
    owner: users,
  }).from(pulseMeetingScorecardMetrics)
    .leftJoin(rrScorecardMetrics, eq(rrScorecardMetrics.id, pulseMeetingScorecardMetrics.savvyosMetricId))
    .leftJoin(rolesResponsibilities, eq(rolesResponsibilities.id, rrScorecardMetrics.responsibilityId))
    .leftJoin(users, eq(users.id, rolesResponsibilities.ownerId))
    .where(eq(pulseMeetingScorecardMetrics.meetingId, meetingId))
    .orderBy(asc(pulseMeetingScorecardMetrics.sortOrder), asc(pulseMeetingScorecardMetrics.addedAt));
}

export async function getMeetingScorecard(db: any, viewerId: number, meetingId: string, skipVisibility = false) {
  if (!skipVisibility) await require_visible_meeting(db, viewerId, meetingId);
  const rows = await mappingRows(db, meetingId);
  const active = rows.filter((row: any) => row.metric?.status === "active" && row.responsibility && row.owner);
  const metricIds = active.map((row: any) => row.metric.id);
  const values = metricIds.length
    ? await db.select().from(rrMetricValues).where(inArray(rrMetricValues.metricId, metricIds)).orderBy(desc(rrMetricValues.periodEnd))
    : [];
  const valuesByMetric = new Map<number, any[]>();
  for (const value of values) valuesByMetric.set(value.metricId, [...(valuesByMetric.get(value.metricId) ?? []), value]);

  const items = active.map((row: any) => {
    const metric = row.metric;
    const cadence = metric.frequency as ScorecardCadence;
    const references = [new Date(), priorPeriod(cadence, new Date()), priorPeriod(cadence, priorPeriod(cadence, new Date()))];
    const periods = references.map((reference) => {
      const bounds = periodBounds(cadence, reference);
      const start = dateOnly(bounds.start);
      const end = dateOnly(addDays(bounds.end, -1));
      const value = (valuesByMetric.get(metric.id) ?? []).find((candidate: any) => candidate.periodStart === start && candidate.periodEnd === end) ?? null;
      return { periodStart: start, periodEnd: end, label: formatPeriod(cadence, bounds.start), value: value ? Number(value.actualValue) : null, note: value?.note ?? null };
    });
    const current = periods[0];
    const target = metric.targetValue == null ? null : Number(metric.targetValue);
    return {
      mappingId: row.mapping.id,
      metricId: metric.id,
      name: metric.name,
      cadence,
      owner: { id: row.owner.id, name: row.owner.name ?? row.owner.email ?? "Unassigned" },
      target,
      performanceDirection: metric.performanceDirection,
      displayFormat: metric.displayFormat,
      metricType: metric.metricType,
      current,
      periods,
      onTarget: performance(current.value, target, metric.performanceDirection),
      trend: trendPhrase(periods.map((period) => period.value), cadence),
      canEdit: metric.metricType === "manual" && row.responsibility.ownerId === viewerId,
      detail: { responsibility: row.responsibility.title, definition: row.responsibility.description, ownerName: row.owner.name ?? row.owner.email ?? "Unassigned", target, cadence, history: periods },
    };
  });

  const configurationNotes = rows.filter((row: any) => !row.metric || row.metric.status !== "active" || !row.responsibility || !row.owner).map((row: any) => ({
    mappingId: row.mapping.id,
    note: !row.metric ? "A selected SavvyOS metric was deleted and no longer appears in this meeting." : `“${row.metric.name}” is inactive in SavvyOS and no longer appears in this meeting.`,
  }));
  return { tabs: SCORECARD_CADENCES.filter((cadence) => items.some((item: any) => item.cadence === cadence)), items, configurationNotes };
}

export function scorecardAttention(items: any[], meetingId: string, meetingName?: string) {
  return items.flatMap((metric: any) => {
    const missing = metric.periods.filter((period: any) => period.value == null).length >= 2;
    const wrongTrend = /declining/i.test(metric.trend ?? "") && metric.performanceDirection === "higher" || /rising/i.test(metric.trend ?? "") && metric.performanceDirection === "lower";
    const offTarget = metric.onTarget === false;
    if (!missing && !wrongTrend && !offTarget) return [];
    const reasons = [offTarget ? "off target" : null, wrongTrend ? metric.trend.toLowerCase() : null, missing ? "missing recent data" : null].filter(Boolean);
    const severity = Number(offTarget) * 3 + Number(wrongTrend) * 2 + Number(missing);
    return [{ metricId: metric.metricId, name: metric.name, meetingId, meetingName, current: metric.current, target: metric.target, displayFormat: metric.displayFormat, trend: metric.trend, reasons, severity }];
  }).sort((left: any, right: any) => right.severity - left.severity || left.name.localeCompare(right.name)).slice(0, 5);
}

export async function saveCurrentScorecardValue(db: any, personId: number, input: { meetingId: string; metricId: number; actualValue: number; note?: string | null }) {
  await require_visible_meeting(db, personId, input.meetingId);
  const [row] = await db.select({ mapping: pulseMeetingScorecardMetrics, metric: rrScorecardMetrics, responsibility: rolesResponsibilities })
    .from(pulseMeetingScorecardMetrics)
    .innerJoin(rrScorecardMetrics, eq(rrScorecardMetrics.id, pulseMeetingScorecardMetrics.savvyosMetricId))
    .innerJoin(rolesResponsibilities, eq(rolesResponsibilities.id, rrScorecardMetrics.responsibilityId))
    .where(and(eq(pulseMeetingScorecardMetrics.meetingId, input.meetingId), eq(rrScorecardMetrics.id, input.metricId), eq(rrScorecardMetrics.status, "active"))).limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "That SavvyOS metric is no longer available in this meeting." });
  if (row.metric.metricType !== "manual") throw new TRPCError({ code: "BAD_REQUEST", message: "This metric is calculated in SavvyOS and cannot be entered manually." });
  if (row.responsibility.ownerId !== personId) throw new TRPCError({ code: "FORBIDDEN", message: "Only this metric’s SavvyOS owner can enter its number." });
  const bounds = periodBounds(row.metric.frequency as ScorecardCadence);
  const periodStart = dateOnly(bounds.start);
  const periodEnd = dateOnly(addDays(bounds.end, -1));
  const [existing] = await db.select({ id: rrMetricValues.id }).from(rrMetricValues).where(and(eq(rrMetricValues.metricId, input.metricId), eq(rrMetricValues.periodStart, periodStart), eq(rrMetricValues.periodEnd, periodEnd))).limit(1);
  const data = { actualValue: String(input.actualValue), note: input.note ?? null, valueSource: "manual" as const, enteredById: personId, enteredAt: new Date() };
  if (existing) await db.update(rrMetricValues).set(data).where(eq(rrMetricValues.id, existing.id));
  else await db.insert(rrMetricValues).values({ metricId: input.metricId, periodStart, periodEnd, ...data });
  return { success: true, periodStart, periodEnd };
}

async function requireManager(db: any, personId: number, meetingId: string) {
  if (!await is_visible_meeting_manager(db, personId, meetingId)) throw new TRPCError({ code: "NOT_FOUND", message: "This meeting is not available." });
}

export const pulseScorecardRouter = router({
  configuration: pulseProcedure.input(z.object({ meetingId: z.string().uuid() })).query(async ({ ctx, input }) => {
    const db = await database();
    await requireManager(db, ctx.user.id, input.meetingId);
    const [mapped, available] = await Promise.all([
      mappingRows(db, input.meetingId),
      db.select({ id: rrScorecardMetrics.id, name: rrScorecardMetrics.name, frequency: rrScorecardMetrics.frequency, ownerName: users.name, responsibilityTitle: rolesResponsibilities.title })
        .from(rrScorecardMetrics).innerJoin(rolesResponsibilities, eq(rolesResponsibilities.id, rrScorecardMetrics.responsibilityId)).innerJoin(users, eq(users.id, rolesResponsibilities.ownerId))
        .where(eq(rrScorecardMetrics.status, "active")).orderBy(asc(rrScorecardMetrics.name)),
    ]);
    return {
      mapped: mapped.map((row: any) => ({ mappingId: row.mapping.id, metricId: row.metric?.id ?? null, name: row.metric?.name ?? "Deleted SavvyOS metric", status: row.metric?.status ?? "deleted", sortOrder: row.mapping.sortOrder })),
      available,
    };
  }),

  addMetric: pulseProcedure.input(z.object({ meetingId: z.string().uuid(), metricId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = await database();
    await requireManager(db, ctx.user.id, input.meetingId);
    const [metric] = await db.select({ id: rrScorecardMetrics.id, status: rrScorecardMetrics.status }).from(rrScorecardMetrics).where(eq(rrScorecardMetrics.id, input.metricId)).limit(1);
    if (!metric || metric.status !== "active") throw new TRPCError({ code: "BAD_REQUEST", message: "Choose an active SavvyOS metric." });
    const [last] = await db.select({ sortOrder: pulseMeetingScorecardMetrics.sortOrder }).from(pulseMeetingScorecardMetrics).where(eq(pulseMeetingScorecardMetrics.meetingId, input.meetingId)).orderBy(asc(pulseMeetingScorecardMetrics.sortOrder));
    await db.insert(pulseMeetingScorecardMetrics).values({ id: id(), meetingId: input.meetingId, savvyosMetricId: metric.id, sortOrder: (last?.sortOrder ?? -1) + 1, addedById: ctx.user.id });
    return { success: true };
  }),

  removeMetric: pulseProcedure.input(z.object({ meetingId: z.string().uuid(), mappingId: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const db = await database();
    await requireManager(db, ctx.user.id, input.meetingId);
    await db.delete(pulseMeetingScorecardMetrics).where(and(eq(pulseMeetingScorecardMetrics.id, input.mappingId), eq(pulseMeetingScorecardMetrics.meetingId, input.meetingId)));
    return { success: true };
  }),

  attention: pulseProcedure.input(z.object({ meetingId: z.string().uuid() })).query(async ({ ctx, input }) => {
    const db = await database(); await requireManager(db, ctx.user.id, input.meetingId);
    const scorecard = await getMeetingScorecard(db, ctx.user.id, input.meetingId);
    return scorecardAttention(scorecard.items, input.meetingId);
  }),
  globalAttention: pulseProcedure.query(async ({ ctx }) => {
    const db = await database();
    if (!await canOpenPulseSettings(db, ctx.user)) throw new TRPCError({ code: "NOT_FOUND", message: "This Pulse page is not available." });
    const meetings = await db.select({ id: pulseMeetings.id, name: pulseMeetings.name }).from(pulseMeetings).where(eq(pulseMeetings.isActive, true));
    const attention = (await Promise.all(meetings.map(async (meeting) => scorecardAttention((await getMeetingScorecard(db, ctx.user.id, meeting.id, true)).items, meeting.id, meeting.name)))).flat();
    return attention.sort((left: any, right: any) => right.severity - left.severity || left.name.localeCompare(right.name)).slice(0, 5);
  }),
  saveCurrentValue: pulseMemberProcedure.input(z.object({ meetingId: z.string().uuid(), metricId: z.number().int().positive(), actualValue: z.number().finite(), note: z.string().max(5000).nullable().optional() })).mutation(async ({ ctx, input }) => {
    const db = await database();
    return saveCurrentScorecardValue(db, ctx.user.id, input);
  }),
});
