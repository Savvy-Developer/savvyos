import { and, asc, eq, lte, gte } from "drizzle-orm";
import { pulseCalendarConfig, pulseHolidays, pulseReportingPeriods } from "../../drizzle/schema";
import type { PulsePolicyDb } from "./policy";

export type CalendarSnapshot = {
  config: {
    id: number;
    timezone: string;
    fiscalYearStartMonth: number;
    operatingWeekStartsOn: number;
    dueWindowDays: number;
  };
  now: Date;
  localDate: string;
  operatingWeekStart: string;
  operatingWeekEnd: string;
  fiscalYear: number;
  isHoliday: boolean;
  inDueWindowEndsOn: string;
  reportingPeriods: Array<{ id: number; name: string; periodType: string; startsOn: string; endsOn: string }>;
};

function formatInTimeZone(date: Date, timezone: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, ...options }).format(date);
}

function localDateParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return { year: Number(get("year")), month: Number(get("month")), day: Number(get("day")), weekday: get("weekday") };
}

function dayOffset(weekday: string) {
  return ({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 } as Record<string, number>)[weekday] ?? 0;
}

function dateFromParts(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day));
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

/** Reads the sole active Pulse calendar configuration, creating no implicit calendar defaults. */
export async function getPulseCalendarConfig(db: PulsePolicyDb) {
  const rows = await db.select().from(pulseCalendarConfig).where(eq(pulseCalendarConfig.isActive, true)).orderBy(asc(pulseCalendarConfig.id)).limit(1);
  return rows[0] ?? null;
}

/**
 * The canonical calendar calculation. All fiscal, operating-week, holiday, reporting-period,
 * and due-window answers originate here rather than inside pages, reports, or work objects.
 */
export async function resolvePulseCalendar(db: PulsePolicyDb, now = new Date()): Promise<CalendarSnapshot | null> {
  const config = await getPulseCalendarConfig(db);
  if (!config) return null;

  const local = localDateParts(now, config.timezone);
  const localDay = dateFromParts(local.year, local.month, local.day);
  const localDate = isoDate(localDay);
  const weekday = dayOffset(local.weekday);
  const delta = (weekday - config.operatingWeekStartsOn + 7) % 7;
  const operatingWeekStart = new Date(localDay);
  operatingWeekStart.setUTCDate(operatingWeekStart.getUTCDate() - delta);
  const operatingWeekEnd = new Date(operatingWeekStart);
  operatingWeekEnd.setUTCDate(operatingWeekEnd.getUTCDate() + 6);
  const dueEnd = new Date(localDay);
  dueEnd.setUTCDate(dueEnd.getUTCDate() + Math.max(0, config.dueWindowDays));
  const fiscalYear = local.month >= config.fiscalYearStartMonth ? local.year : local.year - 1;

  const localCalendarDate = new Date(`${localDate}T00:00:00.000Z`);
  const [holidays, periods] = await Promise.all([
    db.select({ id: pulseHolidays.id }).from(pulseHolidays).where(and(eq(pulseHolidays.calendarConfigId, config.id), eq(pulseHolidays.holidayDate, localCalendarDate))).limit(1),
    db.select({ id: pulseReportingPeriods.id, name: pulseReportingPeriods.name, periodType: pulseReportingPeriods.periodType, startsOn: pulseReportingPeriods.startsOn, endsOn: pulseReportingPeriods.endsOn })
      .from(pulseReportingPeriods)
      .where(and(eq(pulseReportingPeriods.calendarConfigId, config.id), lte(pulseReportingPeriods.startsOn, localCalendarDate), gte(pulseReportingPeriods.endsOn, localCalendarDate)))
      .orderBy(asc(pulseReportingPeriods.startsOn)),
  ]);

  return {
    config: {
      id: config.id,
      timezone: config.timezone,
      fiscalYearStartMonth: config.fiscalYearStartMonth,
      operatingWeekStartsOn: config.operatingWeekStartsOn,
      dueWindowDays: config.dueWindowDays,
    },
    now,
    localDate,
    operatingWeekStart: isoDate(operatingWeekStart),
    operatingWeekEnd: isoDate(operatingWeekEnd),
    fiscalYear,
    isHoliday: holidays.length > 0,
    inDueWindowEndsOn: isoDate(dueEnd),
    reportingPeriods: periods.map((period: any) => ({
      ...period,
      startsOn: String(period.startsOn),
      endsOn: String(period.endsOn),
    })),
  };
}
