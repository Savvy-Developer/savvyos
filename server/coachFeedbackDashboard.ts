import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { coachingFeedbackResponses, users } from "../drizzle/schema";
import { getDb } from "./db";
import { addEasternDays, easternDateKey, easternDateTimeToUtc, getEasternTimeParts } from "./agentProductionReportScheduler";

const EASTERN_TIME_ZONE = "America/New_York";
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export type CoachFeedbackDashboardFilter = {
  fromDate?: string;
  toDate?: string;
  includeTest?: boolean;
};

export type CoachFeedbackDashboardAggregate = {
  coachId: number;
  coachName: string;
  responseCount: number;
  overallAverage: number | null;
  prioritiesAverage: number | null;
  clarityAverage: number | null;
  supportAverage: number | null;
  comments: Array<{ helpful: string | null; improvement: string | null; additional: string | null; isTest: boolean }>;
};

export type CoachFeedbackDashboard = {
  fromDate: string;
  toDate: string;
  periodLabel: string;
  includeTest: boolean;
  aggregates: CoachFeedbackDashboardAggregate[];
  overall: {
    responseCount: number;
    overallAverage: number | null;
    prioritiesAverage: number | null;
    clarityAverage: number | null;
    supportAverage: number | null;
  };
};

export type CoachFeedbackHistoryItem = {
  id: number;
  coachName: string;
  submittedAt: Date;
  sessionWeekStart: Date;
  overallRating: number;
  prioritiesRating: number;
  clarityRating: number;
  supportRating: number;
  helpfulComment: string | null;
  improvementComment: string | null;
  additionalComment: string | null;
  isTest: boolean;
};

function weekdayIndex(weekday: string): number {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
}

function currentEasternWeekStart(asOf = new Date()): string {
  const eastern = getEasternTimeParts(asOf);
  const daysSinceMonday = (weekdayIndex(eastern.weekday) - 1 + 7) % 7;
  return addEasternDays(easternDateKey(eastern), -daysSinceMonday);
}

function assertDateKey(value: string | undefined, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (!DATE_KEY.test(value)) throw new TRPCError({ code: "BAD_REQUEST", message: `${field} must use YYYY-MM-DD.` });
  return value;
}

function dateLabel(dateKey: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: EASTERN_TIME_ZONE, month: "short", day: "numeric", year: "numeric" })
    .format(easternDateTimeToUtc(dateKey, 0, 0, 0));
}

function normalizeFilter(filter: CoachFeedbackDashboardFilter = {}, asOf = new Date()) {
  const fromDate = assertDateKey(filter.fromDate, "From date") ?? currentEasternWeekStart(asOf);
  const toDate = assertDateKey(filter.toDate, "To date") ?? easternDateKey(getEasternTimeParts(asOf));
  if (fromDate > toDate) throw new TRPCError({ code: "BAD_REQUEST", message: "The from date must be on or before the to date." });
  return {
    fromDate,
    toDate,
    includeTest: filter.includeTest ?? true,
    start: easternDateTimeToUtc(fromDate, 0, 0, 0),
    endExclusive: easternDateTimeToUtc(addEasternDays(toDate, 1), 0, 0, 0),
    periodLabel: fromDate === toDate ? dateLabel(fromDate) : `${dateLabel(fromDate)} – ${dateLabel(toDate)}`,
  };
}

function average(value: unknown): number | null {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? Math.round(numberValue * 10) / 10 : null;
}

function conditionsForRange(filter: ReturnType<typeof normalizeFilter>) {
  return filter.includeTest
    ? [gte(coachingFeedbackResponses.submittedAt, filter.start), lt(coachingFeedbackResponses.submittedAt, filter.endExclusive)]
    : [gte(coachingFeedbackResponses.submittedAt, filter.start), lt(coachingFeedbackResponses.submittedAt, filter.endExclusive), eq(coachingFeedbackResponses.isTest, false)];
}

export async function buildCoachFeedbackDashboard(filterInput: CoachFeedbackDashboardFilter = {}): Promise<CoachFeedbackDashboard> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
  const filter = normalizeFilter(filterInput);
  const where = and(...conditionsForRange(filter));

  const grouped = await db.select({
    coachId: coachingFeedbackResponses.coachId,
    coachName: users.name,
    responseCount: sql<number>`COUNT(*)`,
    overallAverage: sql<number>`AVG(${coachingFeedbackResponses.overallRating})`,
    prioritiesAverage: sql<number>`AVG(${coachingFeedbackResponses.prioritiesRating})`,
    clarityAverage: sql<number>`AVG(${coachingFeedbackResponses.clarityRating})`,
    supportAverage: sql<number>`AVG(${coachingFeedbackResponses.supportRating})`,
  })
    .from(coachingFeedbackResponses)
    .innerJoin(users, eq(coachingFeedbackResponses.coachId, users.id))
    .where(where)
    .groupBy(coachingFeedbackResponses.coachId, users.name);

  const commentRows = await db.select({
    coachId: coachingFeedbackResponses.coachId,
    helpful: coachingFeedbackResponses.helpfulComment,
    improvement: coachingFeedbackResponses.improvementComment,
    additional: coachingFeedbackResponses.additionalComment,
    isTest: coachingFeedbackResponses.isTest,
  })
    .from(coachingFeedbackResponses)
    .where(where)
    .orderBy(desc(coachingFeedbackResponses.submittedAt), desc(coachingFeedbackResponses.id));

  const commentsByCoach = new Map<number, CoachFeedbackDashboardAggregate["comments"]>();
  for (const row of commentRows) {
    if (![row.helpful, row.improvement, row.additional].some((value) => Boolean(value?.trim()))) continue;
    const comments = commentsByCoach.get(row.coachId) ?? [];
    comments.push({ helpful: row.helpful, improvement: row.improvement, additional: row.additional, isTest: row.isTest });
    commentsByCoach.set(row.coachId, comments);
  }

  const aggregates = grouped.map((row) => ({
    coachId: row.coachId,
    coachName: row.coachName?.trim() || "Coach",
    responseCount: Number(row.responseCount),
    overallAverage: average(row.overallAverage),
    prioritiesAverage: average(row.prioritiesAverage),
    clarityAverage: average(row.clarityAverage),
    supportAverage: average(row.supportAverage),
    comments: commentsByCoach.get(row.coachId) ?? [],
  })).sort((left, right) => left.coachName.localeCompare(right.coachName));

  const totalCount = aggregates.reduce((sum, aggregate) => sum + aggregate.responseCount, 0);
  const weightedAverage = (key: "overallAverage" | "prioritiesAverage" | "clarityAverage" | "supportAverage") => {
    if (!totalCount) return null;
    const weighted = aggregates.reduce((sum, aggregate) => sum + (aggregate[key] ?? 0) * aggregate.responseCount, 0);
    return Math.round((weighted / totalCount) * 10) / 10;
  };

  return {
    fromDate: filter.fromDate,
    toDate: filter.toDate,
    periodLabel: filter.periodLabel,
    includeTest: filter.includeTest,
    aggregates,
    overall: {
      responseCount: totalCount,
      overallAverage: weightedAverage("overallAverage"),
      prioritiesAverage: weightedAverage("prioritiesAverage"),
      clarityAverage: weightedAverage("clarityAverage"),
      supportAverage: weightedAverage("supportAverage"),
    },
  };
}

export async function listCoachFeedbackHistory(filterInput: CoachFeedbackDashboardFilter = {}): Promise<{ fromDate: string; toDate: string; periodLabel: string; includeTest: boolean; items: CoachFeedbackHistoryItem[] }> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
  const filter = normalizeFilter(filterInput);
  const items = await db.select({
    id: coachingFeedbackResponses.id,
    coachName: users.name,
    submittedAt: coachingFeedbackResponses.submittedAt,
    sessionWeekStart: coachingFeedbackResponses.sessionWeekStart,
    overallRating: coachingFeedbackResponses.overallRating,
    prioritiesRating: coachingFeedbackResponses.prioritiesRating,
    clarityRating: coachingFeedbackResponses.clarityRating,
    supportRating: coachingFeedbackResponses.supportRating,
    helpfulComment: coachingFeedbackResponses.helpfulComment,
    improvementComment: coachingFeedbackResponses.improvementComment,
    additionalComment: coachingFeedbackResponses.additionalComment,
    isTest: coachingFeedbackResponses.isTest,
  })
    .from(coachingFeedbackResponses)
    .innerJoin(users, eq(coachingFeedbackResponses.coachId, users.id))
    .where(and(...conditionsForRange(filter)))
    .orderBy(desc(coachingFeedbackResponses.submittedAt), desc(coachingFeedbackResponses.id))
    .limit(1000);

  return {
    fromDate: filter.fromDate,
    toDate: filter.toDate,
    periodLabel: filter.periodLabel,
    includeTest: filter.includeTest,
    items: items.map((row) => ({
      ...row,
      coachName: row.coachName?.trim() || "Coach",
      submittedAt: row.submittedAt,
      isTest: row.isTest,
    })),
  };
}
