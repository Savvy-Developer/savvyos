import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { z } from "zod";
import {
  pulseActivityLog,
  pulseMeetingUpdates,
  pulseMeetings,
  pulseNotifications,
  pulsePersonalInputs,
  pulseWeeklySubmissions,
  rrMetricAutoConfigs,
  rrMetricChangeHistory,
  rrMetricValues,
  rrScorecardMetrics,
  rolesResponsibilities,
  users,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { router } from "../_core/trpc";
import { sendTransactionalEmail } from "../_core/resendEmail";
import { hasPulseCapability, pulseProcedure } from "./authorization";
import { visible_meeting_ids } from "./access";
import { getPendingCascadePayloads } from "./cascadePayload";
import { getMeetingScorecard, saveCurrentScorecardValue } from "./scorecard";
import { listAccessibleItems } from "./workItems";
import { isEventMetric } from "../rrScorecard";
import { refreshAutomaticMetric } from "../routers/rolesResponsibilities";

const uuid = () => crypto.randomUUID();
const week = () => {
  const date = new Date();
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  date.setHours(0, 0, 0, 0);
  return date;
};
const dateOnly = (date: Date) => date.toISOString().slice(0, 10);
const todayEastern = () => new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());
const isUsableNumber = (value: unknown) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
const inputTypeSchema = z.enum(["segue", "headline", "brief"]);

type DraftMetadata = {
  tone?: "green" | "amber" | "red";
  approvedAt?: string;
  approvedValue?: number;
  autoSource?: string | null;
  periodLabel?: string | null;
  lastRefreshedAt?: string | null;
};

async function dbOrThrow() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Pulse is not available right now. Please try again." });
  return db;
}

async function myMeetingIds(db: any, personId: number) {
  return visible_meeting_ids(db, personId);
}

function draftMetadata(value: unknown): DraftMetadata {
  return value && typeof value === "object" ? value as DraftMetadata : {};
}

function isFieldComplete(field: any) {
  if (!field.required) return true;
  if (!isUsableNumber(field.value)) return false;
  return field.source !== "automatic" || Boolean(field.approved);
}

function sourceLabel(value?: string | null) {
  if (value === "agent_connections") return "Agent connections";
  if (value === "transactions") return "Transactions";
  if (value === "tasks") return "Tasks";
  return value ? value.replaceAll("_", " ") : "SavvyOS";
}

function easternCalendarDay(reference = new Date()) {
  const parts = new Map(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(reference).filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
  return new Date(Date.UTC(parts.get("year") ?? 0, (parts.get("month") ?? 1) - 1, parts.get("day") ?? 1));
}

/** Sunday–Saturday reporting window. Monday deliberately opens the week that just ended. */
export function measurableReportingWeek(reference = new Date()) {
  const day = easternCalendarDay(reference);
  const sunday = addDays(day, -day.getUTCDay());
  const start = day.getUTCDay() === 1 ? addDays(sunday, -7) : sunday;
  const end = addDays(start, 6);
  return { start, end, startDate: dateOnly(start), endDate: dateOnly(end) };
}

function asNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function ownedMeasurableRows(db: any, personId: number) {
  return db.select({ metric: rrScorecardMetrics, responsibility: rolesResponsibilities, autoConfig: rrMetricAutoConfigs })
    .from(rrScorecardMetrics)
    .innerJoin(rolesResponsibilities, eq(rolesResponsibilities.id, rrScorecardMetrics.responsibilityId))
    .leftJoin(rrMetricAutoConfigs, eq(rrMetricAutoConfigs.metricId, rrScorecardMetrics.id))
    .where(and(
      eq(rrScorecardMetrics.status, "active"),
      or(
        eq(rrScorecardMetrics.ownerId, personId),
        and(isNull(rrScorecardMetrics.ownerId), eq(rolesResponsibilities.ownerId, personId)),
      ),
    ))
    .orderBy(asc(rolesResponsibilities.title), asc(rrScorecardMetrics.name));
}

async function personalMeasurables(db: any, personId: number) {
  const reportingWeek = measurableReportingWeek();
  const rows = await ownedMeasurableRows(db, personId);
  const metricIds = rows.map((row: any) => row.metric.id);
  const values = metricIds.length
    ? await db.select().from(rrMetricValues).where(inArray(rrMetricValues.metricId, metricIds)).orderBy(desc(rrMetricValues.eventDate), desc(rrMetricValues.periodEnd))
    : [];
  const valuesByMetric = new Map<number, any[]>();
  for (const value of values) valuesByMetric.set(value.metricId, [...(valuesByMetric.get(value.metricId) ?? []), value]);

  return {
    reportingWeek: { start: reportingWeek.startDate, end: reportingWeek.endDate },
    measurables: rows.map((row: any) => {
      const metric = row.metric;
      const periodStart = reportingWeek.startDate;
      const periodEnd = reportingWeek.endDate;
      const history = valuesByMetric.get(metric.id) ?? [];
      const current = isEventMetric(metric)
        ? history.find((value: any) => value.eventDate && value.eventDate >= periodStart && value.eventDate <= periodEnd) ?? null
        : history.find((value: any) => value.periodStart === periodStart && value.periodEnd === periodEnd) ?? null;
      const automatic = metric.metricType !== "manual";
      return {
        metricId: metric.id,
        name: metric.name,
        responsibilityName: row.responsibility.title,
        entryType: automatic ? "automatic" as const : "manual" as const,
        value: asNumber(current?.actualValue),
        note: current?.note ?? "",
        target: asNumber(metric.targetValue),
        periodStart: current?.periodStart ?? periodStart,
        periodEnd: current?.periodEnd ?? periodEnd,
        pulledSource: automatic ? sourceLabel(row.autoConfig?.dataSource) : null,
        lastRefreshedAt: automatic ? row.autoConfig?.lastRefreshedAt?.toISOString?.() ?? row.autoConfig?.lastRefreshedAt ?? null : null,
      };
    }),
  };
}

async function personalMeetingPrep(db: any, personId: number) {
  const ids = await myMeetingIds(db, personId);
  const todayWeek = week();
  if (!ids.length) return { weekOf: todayWeek, meetings: [], fields: [], history: [], complete: true };

  const meetings = await db.select({
    id: pulseMeetings.id,
    name: pulseMeetings.name,
    label: pulseMeetings.label,
    dayOfWeek: pulseMeetings.dayOfWeek,
    startTime: pulseMeetings.startTime,
    sectionsEnabled: pulseMeetings.sectionsEnabled,
  }).from(pulseMeetings)
    .where(and(inArray(pulseMeetings.id, ids), eq(pulseMeetings.isActive, true), isNull(pulseMeetings.deletedAt)))
    .orderBy(asc(pulseMeetings.name));

  const [scorecards, drafts, submissions, history] = await Promise.all([
    Promise.all(meetings.map(async (meeting: any) => ({ meeting, scorecard: await getMeetingScorecard(db, personId, meeting.id) }))),
    db.select().from(pulsePersonalInputs).where(and(
      eq(pulsePersonalInputs.personId, personId),
      inArray(pulsePersonalInputs.meetingId, ids),
      eq(pulsePersonalInputs.weekOf, todayWeek),
      isNull(pulsePersonalInputs.deletedAt),
    )),
    db.select().from(pulseWeeklySubmissions).where(and(
      eq(pulseWeeklySubmissions.personId, personId),
      eq(pulseWeeklySubmissions.weekOf, todayWeek),
      isNull(pulseWeeklySubmissions.withdrawnAt),
    )),
    db.select({
      id: pulseWeeklySubmissions.id,
      meetingId: pulseWeeklySubmissions.meetingId,
      meetingName: pulseMeetings.name,
      weekOf: pulseWeeklySubmissions.weekOf,
      submittedAt: pulseWeeklySubmissions.submittedAt,
      confirmationSummary: pulseWeeklySubmissions.confirmationSummary,
      emailSentAt: pulseWeeklySubmissions.emailSentAt,
      withdrawnAt: pulseWeeklySubmissions.withdrawnAt,
    }).from(pulseWeeklySubmissions)
      .innerJoin(pulseMeetings, eq(pulseMeetings.id, pulseWeeklySubmissions.meetingId))
      .where(and(eq(pulseWeeklySubmissions.personId, personId), inArray(pulseWeeklySubmissions.meetingId, ids)))
      .orderBy(desc(pulseWeeklySubmissions.submittedAt)).limit(20),
  ]);

  const metricIds = scorecards.flatMap(({ scorecard }: any) => scorecard.items.map((item: any) => item.metricId));
  const autoConfigs = metricIds.length
    ? await db.select({ metricId: rrMetricAutoConfigs.metricId, dataSource: rrMetricAutoConfigs.dataSource, lastRefreshedAt: rrMetricAutoConfigs.lastRefreshedAt })
      .from(rrMetricAutoConfigs).where(inArray(rrMetricAutoConfigs.metricId, metricIds))
    : [];
  const autoConfigByMetric = new Map(autoConfigs.map((config: any) => [config.metricId, config]));
  const draftByKey = new Map<string, any>(drafts.map((draft: any) => [`${draft.meetingId}:${draft.inputKey}`, draft]));
  const submittedIds = new Set(submissions.map((submission: any) => submission.meetingId));
  const fields: any[] = [];

  for (const { meeting, scorecard } of scorecards) {
    for (const metric of scorecard.items.filter((item: any) => item.owner?.id === personId)) {
      const key = `metric:${metric.metricId}`;
      const draft = draftByKey.get(`${meeting.id}:${key}`);
      const metadata = draftMetadata(draft?.metadata);
      const automatic = metric.metricType === "automatic";
      const value = draft?.numericValue ?? (automatic ? metric.current.value : null);
      const autoConfig = autoConfigByMetric.get(metric.metricId) as any;
      fields.push({
        key,
        kind: "number",
        label: metric.name,
        meetingId: meeting.id,
        meetingName: meeting.name,
        target: metric.target,
        value: value == null ? null : Number(value),
        draftValue: draft?.numericValue == null ? null : Number(draft.numericValue),
        required: true,
        source: metric.metricType,
        approved: automatic ? Boolean(metadata.approvedAt) && Number(metadata.approvedValue) === Number(value) : true,
        cadence: metric.cadence,
        periodLabel: metric.current.label,
        periodStart: metric.current.periodStart,
        periodEnd: metric.current.periodEnd,
        pulledSource: automatic ? sourceLabel(metadata.autoSource ?? autoConfig?.dataSource) : null,
        lastRefreshedAt: automatic ? metadata.lastRefreshedAt ?? autoConfig?.lastRefreshedAt?.toISOString?.() ?? autoConfig?.lastRefreshedAt ?? null : null,
      });
    }

    for (const updateType of inputTypeSchema.options) {
      const key = `${updateType}:${meeting.id}`;
      const draft = draftByKey.get(`${meeting.id}:${key}`);
      const metadata = draftMetadata(draft?.metadata);
      fields.push({
        key,
        kind: "text",
        label: updateType === "segue" ? "Segue" : updateType === "headline" ? "Headlines" : "Brief",
        meetingId: meeting.id,
        meetingName: meeting.name,
        value: draft?.textValue ?? "",
        tone: metadata.tone ?? "green",
        required: false,
        updateType,
        source: "draft",
      });
    }
  }

  const displayMeetings = meetings.map((meeting: any) => {
    const meetingFields = fields.filter((field: any) => field.meetingId === meeting.id);
    const metrics = meetingFields.filter((field: any) => field.kind === "number");
    return {
      ...meeting,
      submitted: submittedIds.has(meeting.id),
      metricCount: metrics.length,
      incompleteMetrics: metrics.filter((field: any) => !isFieldComplete(field)).length,
      complete: metrics.every(isFieldComplete),
    };
  });

  return {
    weekOf: todayWeek,
    meetings: displayMeetings,
    fields,
    history: history.map((entry: any) => ({ ...entry, weekOf: dateOnly(new Date(entry.weekOf)), submittedAt: entry.submittedAt?.toISOString?.() ?? entry.submittedAt })),
    complete: displayMeetings.every((meeting: any) => meeting.submitted),
  };
}

async function applyReviewedAutomaticValue(db: any, personId: number, field: any) {
  const metricId = Number(field.key.slice(7));
  const scorecard = await getMeetingScorecard(db, personId, field.meetingId);
  const metric = scorecard.items.find((item: any) => item.metricId === metricId && item.owner?.id === personId);
  if (!metric || metric.metricType !== "automatic") throw new TRPCError({ code: "NOT_FOUND", message: "That automatic measurable is no longer assigned to you." });
  if (!isUsableNumber(field.value) || !field.approved) throw new TRPCError({ code: "BAD_REQUEST", message: `Approve ${field.label} before submitting.` });
  const [existing] = await db.select({ id: rrMetricValues.id, calculationMetadata: rrMetricValues.calculationMetadata })
    .from(rrMetricValues).where(and(eq(rrMetricValues.metricId, metricId), eq(rrMetricValues.periodStart, field.periodStart), eq(rrMetricValues.periodEnd, field.periodEnd))).limit(1);
  const review = { reviewedInWeeklyPrepAt: new Date().toISOString(), reviewedById: personId, approvedValue: Number(field.value) };
  const values = {
    actualValue: String(field.value),
    valueSource: "automatic" as const,
    calculationMetadata: { ...((existing?.calculationMetadata ?? {}) as Record<string, unknown>), weeklyPrepReview: review },
    enteredById: personId,
    enteredAt: new Date(),
  };
  if (existing) await db.update(rrMetricValues).set(values).where(eq(rrMetricValues.id, existing.id));
  else await db.insert(rrMetricValues).values({ metricId, periodStart: field.periodStart, periodEnd: field.periodEnd, ...values });
}

async function saveDraft(db: any, personId: number, input: {
  meetingId: string;
  key: string;
  value: string | number | null;
  tone?: "green" | "amber" | "red";
  approved?: boolean;
}) {
  const ids = await myMeetingIds(db, personId);
  if (!ids.includes(input.meetingId)) throw new TRPCError({ code: "NOT_FOUND", message: "That meeting is not available." });
  const weekOf = week();
  const metricMatch = /^metric:(\d+)$/.exec(input.key);
  let metadata: DraftMetadata = { tone: input.tone };

  if (metricMatch) {
    const metricId = Number(metricMatch[1]);
    const scorecard = await getMeetingScorecard(db, personId, input.meetingId);
    const metric = scorecard.items.find((item: any) => item.metricId === metricId && item.owner?.id === personId);
    if (!metric) throw new TRPCError({ code: "NOT_FOUND", message: "That measurable is not assigned to you in this meeting." });
    if (!isUsableNumber(input.value)) throw new TRPCError({ code: "BAD_REQUEST", message: "Enter a number before saving this measurable." });
    if (metric.metricType === "automatic") {
      const [autoConfig] = await db.select({ dataSource: rrMetricAutoConfigs.dataSource, lastRefreshedAt: rrMetricAutoConfigs.lastRefreshedAt })
        .from(rrMetricAutoConfigs).where(eq(rrMetricAutoConfigs.metricId, metricId)).limit(1);
      metadata = {
        autoSource: autoConfig?.dataSource ?? null,
        periodLabel: metric.current.label,
        lastRefreshedAt: autoConfig?.lastRefreshedAt?.toISOString?.() ?? autoConfig?.lastRefreshedAt ?? null,
        ...(input.approved ? { approvedAt: new Date().toISOString(), approvedValue: Number(input.value) } : {}),
      };
    }
  } else if (!/^(segue|headline|brief):[0-9a-f-]{36}$/.test(input.key)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "That weekly-prep field is not available." });
  }

  const values = {
    numericValue: typeof input.value === "number" ? String(input.value) : null,
    textValue: typeof input.value === "string" ? input.value : null,
    metadata,
    deletedAt: null,
  };
  await db.insert(pulsePersonalInputs).values({
    id: uuid(), personId, meetingId: input.meetingId, inputKey: input.key, weekOf, ...values,
  }).onDuplicateKeyUpdate({ set: { ...values, updatedAt: new Date() } });
  return { success: true };
}

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

type ZonedDateParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function usableTimeZone(value?: string | null) {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: value || "America/New_York" }).resolvedOptions().timeZone;
  } catch {
    return "America/New_York";
  }
}

function zonedDateParts(value: Date, timeZone: string): ZonedDateParts {
  const values = new Map(new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(value).filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
  return {
    year: values.get("year") ?? 0,
    month: values.get("month") ?? 0,
    day: values.get("day") ?? 0,
    hour: values.get("hour") ?? 0,
    minute: values.get("minute") ?? 0,
    second: values.get("second") ?? 0,
  };
}

function zonedWallTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string) {
  const targetAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let timestamp = targetAsUtc;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const actual = zonedDateParts(new Date(timestamp), timeZone);
    const actualAsUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second, 0);
    const adjustment = targetAsUtc - actualAsUtc;
    if (adjustment === 0) break;
    timestamp += adjustment;
  }
  return new Date(timestamp);
}

export function nextOccurrence(dayOfWeek?: string | null, startTime?: string | null, timeZone?: string | null, now = new Date()) {
  if (!dayOfWeek || !startTime) return null;
  const dayIndex: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
  const target = dayIndex[dayOfWeek];
  const [hours, minutes] = startTime.split(":").map(Number);
  if (target === undefined || !Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  const zone = usableTimeZone(timeZone);
  const localNow = zonedDateParts(now, zone);
  const localToday = new Date(Date.UTC(localNow.year, localNow.month - 1, localNow.day));
  let daysUntil = (target - localToday.getUTCDay() + 7) % 7;
  let localCandidate = new Date(Date.UTC(localNow.year, localNow.month - 1, localNow.day + daysUntil));
  let occurrence = zonedWallTimeToUtc(localCandidate.getUTCFullYear(), localCandidate.getUTCMonth() + 1, localCandidate.getUTCDate(), hours, minutes, zone);
  if (occurrence <= now) {
    daysUntil += 7;
    localCandidate = new Date(Date.UTC(localNow.year, localNow.month - 1, localNow.day + daysUntil));
    occurrence = zonedWallTimeToUtc(localCandidate.getUTCFullYear(), localCandidate.getUTCMonth() + 1, localCandidate.getUTCDate(), hours, minutes, zone);
  }
  return occurrence.toISOString();
}

export const pulsePersonalRouter = router({
  inputs: pulseProcedure.query(async ({ ctx }) => personalMeetingPrep(await dbOrThrow(), ctx.user.id)),

  myMeasurables: pulseProcedure.query(async ({ ctx }) => personalMeasurables(await dbOrThrow(), ctx.user.id)),

  refreshMyMeasurable: pulseProcedure.input(z.object({ metricId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = await dbOrThrow();
    const owned = await ownedMeasurableRows(db, ctx.user.id);
    const row = owned.find((candidate: any) => candidate.metric.id === input.metricId);
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "That measurable is not assigned to you." });
    if (row.metric.metricType === "manual" || !row.autoConfig) throw new TRPCError({ code: "BAD_REQUEST", message: "Only automatically pulled measurables can be refreshed." });
    const reportingWeek = measurableReportingWeek();
    return refreshAutomaticMetric(db, input.metricId, { start: reportingWeek.start, end: addDays(reportingWeek.end, 1) });
  }),

  submitMyMeasurables: pulseProcedure.input(z.object({
    manualValues: z.array(z.object({
      metricId: z.number().int().positive(),
      actualValue: z.number().finite(),
      note: z.string().trim().max(5_000).nullable().optional(),
    })).max(200),
  })).mutation(async ({ ctx, input }) => {
    const db = await dbOrThrow();
    const before = await personalMeasurables(db, ctx.user.id);
    const ownedById = new Map<number, any>(before.measurables.map((measurable: any) => [measurable.metricId, measurable]));
    const manualById = new Map(input.manualValues.map((value) => [value.metricId, value]));
    const ownedRows = await ownedMeasurableRows(db, ctx.user.id);
    const manualRows = ownedRows.filter((row: any) => row.metric.metricType === "manual");

    if (manualById.size !== input.manualValues.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Each manual measurable can be submitted only once." });
    if (manualRows.length !== manualById.size || manualRows.some((row: any) => !manualById.has(row.metric.id))) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Enter every active manual measurable before submitting." });
    }
    if (ownedRows.some((row: any) => row.metric.metricType !== "manual" && !Number.isFinite(Number(ownedById.get(row.metric.id)?.value)))) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Refresh every automatic measurable with a valid value before submitting." });
    }

    const recorded: Array<{ metricId: number; name: string; value: number; note: string | null; source: "manual" | "automatic" }> = [];
    await db.transaction(async (tx: any) => {
      for (const row of manualRows) {
        const submitted = manualById.get(row.metric.id)!;
        const periodStart = before.reportingWeek.start;
        const periodEnd = before.reportingWeek.end;
        const [existing] = await tx.select({ id: rrMetricValues.id }).from(rrMetricValues).where(and(
          eq(rrMetricValues.metricId, row.metric.id),
          eq(rrMetricValues.periodStart, periodStart),
          eq(rrMetricValues.periodEnd, periodEnd),
        )).limit(1);
        const values = { actualValue: String(submitted.actualValue), resultState: "reported", note: submitted.note || null, valueSource: "manual" as const, enteredById: ctx.user.id, enteredAt: new Date() };
        if (existing) await tx.update(rrMetricValues).set(values).where(eq(rrMetricValues.id, existing.id));
        else await tx.insert(rrMetricValues).values({ metricId: row.metric.id, periodStart, periodEnd, ...values });
        await tx.insert(rrMetricChangeHistory).values({
          metricId: row.metric.id,
          changeType: existing ? "result_corrected" : "result_reported",
          details: { periodStart, periodEnd, actualValue: submitted.actualValue, note: submitted.note || null, source: "pulse_my_measurables" },
          createdById: ctx.user.id,
        });
        recorded.push({ metricId: row.metric.id, name: row.metric.name, value: submitted.actualValue, note: submitted.note || null, source: "manual" });
      }
      for (const row of ownedRows.filter((candidate: any) => candidate.metric.metricType !== "manual")) {
        const measurable = ownedById.get(row.metric.id)!;
        await tx.insert(rrMetricChangeHistory).values({
          metricId: row.metric.id,
          changeType: "weekly_submission_confirmed",
          details: { reportingWeek: before.reportingWeek, periodStart: measurable.periodStart, periodEnd: measurable.periodEnd, actualValue: measurable.value, source: "pulse_my_measurables" },
          createdById: ctx.user.id,
        });
        recorded.push({ metricId: row.metric.id, name: row.metric.name, value: Number(measurable.value), note: measurable.note || null, source: "automatic" });
      }
    });

    const [person] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, ctx.user.id)).limit(1);
    if (person?.email) {
      const summary = recorded.map((measurable) => `${measurable.name}: ${measurable.value}${measurable.note ? ` (${measurable.note})` : ""}`).join(" · ");
      await sendTransactionalEmail("pulse_measurables_submission_confirmation", {
        recipientEmail: person.email,
        recipientName: person.name ?? undefined,
        pulseSubmissionSummary: summary,
        pulseActionUrl: "https://os.savvy-agents.com/pulse/dashboard#my-measurables",
        measurableReportingWeek: `${before.reportingWeek.start} to ${before.reportingWeek.end}`,
      }, { idempotencyKey: `pulse-my-measurables:${ctx.user.id}:${before.reportingWeek.start}:${before.reportingWeek.end}` });
    }
    return { success: true, reportingWeek: before.reportingWeek, recorded };
  }),

  saveInput: pulseProcedure.input(z.object({
    key: z.string().min(1).max(100),
    value: z.union([z.number().finite(), z.string().max(8000), z.null()]),
    meetingId: z.string().uuid(),
    tone: z.enum(["green", "amber", "red"]).optional(),
    approved: z.boolean().optional(),
  })).mutation(async ({ ctx, input }) => saveDraft(await dbOrThrow(), ctx.user.id, input)),

  submitWeeklyPrep: pulseProcedure.input(z.object({ meetingId: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const db = await dbOrThrow();
    const prep = await personalMeetingPrep(db, ctx.user.id);
    const meeting = prep.meetings.find((entry: any) => entry.id === input.meetingId);
    if (!meeting) throw new TRPCError({ code: "NOT_FOUND", message: "That meeting is not available." });
    const fields = prep.fields.filter((field: any) => field.meetingId === input.meetingId);
    const incomplete = fields.filter((field: any) => field.required && !isFieldComplete(field));
    if (incomplete.length) throw new TRPCError({ code: "BAD_REQUEST", message: `Review ${incomplete.map((field: any) => field.label).join(", ")} before submitting.` });

    const manualFields = fields.filter((field: any) => field.kind === "number" && field.source === "manual");
    const automaticFields = fields.filter((field: any) => field.kind === "number" && field.source === "automatic");
    for (const field of manualFields) {
      await saveCurrentScorecardValue(db, ctx.user.id, { meetingId: input.meetingId, metricId: Number(field.key.slice(7)), actualValue: Number(field.value) });
    }
    for (const field of automaticFields) await applyReviewedAutomaticValue(db, ctx.user.id, field);

    const textFields = fields.filter((field: any) => field.kind === "text" && String(field.value ?? "").trim());
    await db.transaction(async (tx: any) => {
      for (const field of textFields) {
        const [existing] = await tx.select({ id: pulseMeetingUpdates.id }).from(pulseMeetingUpdates).where(and(
          eq(pulseMeetingUpdates.meetingId, input.meetingId),
          eq(pulseMeetingUpdates.authorId, ctx.user.id),
          eq(pulseMeetingUpdates.updateType, field.updateType),
          eq(pulseMeetingUpdates.weekOf, prep.weekOf),
          isNull(pulseMeetingUpdates.deletedAt),
        )).limit(1);
        const changes = { body: String(field.value).trim(), tone: field.updateType === "headline" ? field.tone ?? "green" : null, weekOf: prep.weekOf, deletedAt: null };
        if (existing) await tx.update(pulseMeetingUpdates).set(changes).where(eq(pulseMeetingUpdates.id, existing.id));
        else await tx.insert(pulseMeetingUpdates).values({ id: uuid(), meetingId: input.meetingId, authorId: ctx.user.id, updateType: field.updateType, ...changes });
      }

      const summary = {
        destination: meeting.name,
        weekOf: dateOnly(prep.weekOf),
        confirmedAt: new Date().toISOString(),
        fields: fields.map((field: any) => ({
          label: field.label,
          value: field.value,
          source: field.source,
          approved: field.source === "automatic" ? field.approved : undefined,
          reportingPeriod: field.periodLabel ?? undefined,
        })),
      };
      await tx.insert(pulseWeeklySubmissions).values({ id: uuid(), meetingId: input.meetingId, personId: ctx.user.id, weekOf: prep.weekOf, confirmationSummary: summary })
        .onDuplicateKeyUpdate({ set: { submittedAt: new Date(), confirmationSummary: summary, withdrawnAt: null } });
    });

    const [person] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, ctx.user.id)).limit(1);
    if (person?.email) {
      const delivery = await sendTransactionalEmail("pulse_submission_confirmation", {
        recipientEmail: person.email,
        recipientName: person.name ?? undefined,
        pulseMeetingName: meeting.name,
        pulseSubmissionSummary: `${fields.filter((field: any) => field.kind === "number").length} measurable${fields.filter((field: any) => field.kind === "number").length === 1 ? "" : "s"} and ${textFields.length} update${textFields.length === 1 ? "" : "s"} saved to ${meeting.name}.`,
        pulseActionUrl: "https://os.savvy-agents.com/pulse/weekly-prep",
      }, { idempotencyKey: `pulse-weekly-prep:${input.meetingId}:${ctx.user.id}:${dateOnly(prep.weekOf)}` });
      if (delivery.sent || delivery.skipped) await db.update(pulseWeeklySubmissions).set({ emailSentAt: new Date() }).where(and(
        eq(pulseWeeklySubmissions.meetingId, input.meetingId),
        eq(pulseWeeklySubmissions.personId, ctx.user.id),
        eq(pulseWeeklySubmissions.weekOf, prep.weekOf),
      ));
    }
    return { success: true };
  }),

  withdrawWeeklyPrep: pulseProcedure.input(z.object({ meetingId: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const db = await dbOrThrow();
    const ids = await myMeetingIds(db, ctx.user.id);
    if (!ids.includes(input.meetingId)) throw new TRPCError({ code: "NOT_FOUND", message: "That meeting is not available." });
    await db.update(pulseWeeklySubmissions).set({ withdrawnAt: new Date() }).where(and(
      eq(pulseWeeklySubmissions.meetingId, input.meetingId),
      eq(pulseWeeklySubmissions.personId, ctx.user.id),
      eq(pulseWeeklySubmissions.weekOf, week()),
    ));
    return { success: true };
  }),

  dashboard: pulseProcedure.input(z.object({ workspaceId: z.union([z.literal("all"), z.string().uuid()]).optional() }).optional()).query(async ({ ctx, input }) => {
    const db = await dbOrThrow();
    const ids = await myMeetingIds(db, ctx.user.id);
    const workspaceId = input?.workspaceId ?? "all";
    if (workspaceId !== "all" && !ids.includes(workspaceId)) {
      throw new TRPCError({ code: "NOT_FOUND", message: "That workspace is not available." });
    }

    const [allItems, meetings, prep, pendingCascades, canRun] = await Promise.all([
      listAccessibleItems(db, ctx.user.id, {}),
      ids.length ? db.select({
        id: pulseMeetings.id, name: pulseMeetings.name, label: pulseMeetings.label, dayOfWeek: pulseMeetings.dayOfWeek,
        startTime: pulseMeetings.startTime, durationMinutes: pulseMeetings.durationMinutes, timezone: pulseMeetings.timezone,
      }).from(pulseMeetings).where(and(inArray(pulseMeetings.id, ids), eq(pulseMeetings.isActive, true), isNull(pulseMeetings.deletedAt))).orderBy(asc(pulseMeetings.name)) : Promise.resolve([]),
      personalMeetingPrep(db, ctx.user.id),
      getPendingCascadePayloads(db, ctx.user.id),
      hasPulseCapability(db, ctx.user, "run_l10s"),
    ]);

    const ownedItems = allItems.filter((item: any) => (item.assigneeId === ctx.user.id || item.ownerPersonId === ctx.user.id) && Boolean(item.meetingId))
      .map((item: any) => ({ ...item, source: item.meetingName ?? "L10", sourceHref: `/pulse/meetings/${item.meetingId}` }));
    const inWorkspace = (item: any) => workspaceId === "all" || item.meetingId === workspaceId;
    const items = ownedItems.filter(inWorkspace);
    const today = todayEastern();
    const dueSoonDate = dateOnly(addDays(new Date(), 7));
    const todos = items.filter((item: any) => item.type === "todo" && item.status !== "completed").sort((left: any, right: any) => Number(right.isOverdue) - Number(left.isOverdue) || String(left.dueDate ?? "9999-12-31").localeCompare(String(right.dueDate ?? "9999-12-31")) || left.source.localeCompare(right.source));
    const issues = items.filter((item: any) => item.type === "issue" && item.status !== "completed").sort((left: any, right: any) => String(left.updatedAt).localeCompare(String(right.updatedAt)));
    const rocks = items.filter((item: any) => item.type === "rock" && !["done", "dropped"].includes(item.status)).sort((left: any, right: any) => (["off_track", "at_risk"].includes(left.status) ? -1 : 0) - (["off_track", "at_risk"].includes(right.status) ? -1 : 0) || String(left.updatedAt).localeCompare(String(right.updatedAt)));
    const workspaceCascades = pendingCascades.filter((cascade: any) => workspaceId === "all" || cascade.fromMeetingId === workspaceId || cascade.recipientMeetingIds?.includes(workspaceId));

    const notificationMeetingCondition = ids.length ? or(isNull(pulseNotifications.meetingId), inArray(pulseNotifications.meetingId, ids)) : isNull(pulseNotifications.meetingId);
    const messageRows = await db.select({
      id: pulseNotifications.id,
      notificationType: pulseNotifications.notificationType,
      sourceType: pulseNotifications.sourceType,
      sourceId: pulseNotifications.sourceId,
      body: pulseNotifications.body,
      meetingId: pulseNotifications.meetingId,
      meetingName: pulseMeetings.name,
      createdAt: pulseNotifications.createdAt,
    }).from(pulseNotifications).leftJoin(pulseMeetings, eq(pulseMeetings.id, pulseNotifications.meetingId))
      .where(and(eq(pulseNotifications.personId, ctx.user.id), eq(pulseNotifications.requiresAction, true), isNull(pulseNotifications.clearedAt), notificationMeetingCondition))
      .orderBy(desc(pulseNotifications.createdAt)).limit(20);
    const messages = messageRows.filter((message: any) => message.notificationType !== "cascade")
      .filter((message: any) => Boolean(message.meetingId) && (workspaceId === "all" || message.meetingId === workspaceId))
      .map((message: any) => ({ ...message, source: message.meetingName ?? "L10", sourceHref: `/pulse/meetings/${message.meetingId}` }));

    const itemIds = ownedItems.map((item: any) => item.id);
    const activity = itemIds.length ? await db.select({
      id: pulseActivityLog.id, entityId: pulseActivityLog.entityId, action: pulseActivityLog.action, fieldChanged: pulseActivityLog.fieldChanged,
      personName: users.name, createdAt: pulseActivityLog.createdAt,
    }).from(pulseActivityLog).leftJoin(users, eq(users.id, pulseActivityLog.personId))
      .where(and(eq(pulseActivityLog.entityType, "work_item"), inArray(pulseActivityLog.entityId, itemIds)))
      .orderBy(desc(pulseActivityLog.createdAt)).limit(24) : [];
    const sourceByItemId = new Map(ownedItems.map((item: any) => [item.id, item]));
    const workspaceActivity = activity.filter((entry: any) => inWorkspace(sourceByItemId.get(entry.entityId)))
      .map((entry: any) => ({ ...entry, item: sourceByItemId.get(entry.entityId) }));

    const missingMeasurables = prep.fields.filter((field: any) => field.kind === "number" && !isFieldComplete(field))
      .filter((field: any) => workspaceId === "all" || field.meetingId === workspaceId)
      .map((field: any) => ({ ...field, source: field.meetingName, sourceHref: `/pulse/meetings/${field.meetingId}` }));
    const nextMeetings = meetings
      .filter((meeting: any) => workspaceId === "all" || meeting.id === workspaceId)
      .map((meeting: any) => ({ ...meeting, nextOccursAt: nextOccurrence(meeting.dayOfWeek, meeting.startTime, meeting.timezone), canRun: canRun && meeting.label === "level_10" }))
      .filter((meeting: any) => meeting.nextOccursAt)
      .sort((left: any, right: any) => String(left.nextOccursAt).localeCompare(String(right.nextOccursAt))).slice(0, 4);

    const overdueTodos = todos.filter((item: any) => item.isOverdue);
    const dueSoonTodos = todos.filter((item: any) => item.status !== "completed" && !item.isOverdue && item.dueDate && item.dueDate >= today && item.dueDate <= dueSoonDate);
    const rocksNeedingAttention = rocks.filter((item: any) => ["at_risk", "off_track"].includes(item.status) || new Date(item.updatedAt).getTime() < Date.now() - 7 * 24 * 60 * 60 * 1000)
      .map((item: any) => ({ ...item, needsUpdate: !["at_risk", "off_track"].includes(item.status) }));

    return {
      workspaces: [{ id: "all", name: "All L10s", type: "all" }, ...meetings.map((meeting: any) => ({ id: meeting.id, name: meeting.name, type: meeting.label }))],
      selectedWorkspaceId: workspaceId,
      meetings,
      items: { todos, issues, rocks },
      activity: workspaceActivity,
      messages,
      actionCenter: {
        overdueTodos,
        dueSoonTodos,
        missingMeasurables,
        rocksNeedingAttention,
        openIssues: issues,
        cascades: workspaceCascades,
        messages,
        nextMeetings,
      },
      counts: {
        overdue: overdueTodos.length,
        dueSoon: dueSoonTodos.length,
        missingMeasurables: missingMeasurables.length,
        offTrackRocks: rocksNeedingAttention.filter((item: any) => item.status === "off_track").length,
        unacknowledged: workspaceCascades.length,
      },
    };
  }),
});
