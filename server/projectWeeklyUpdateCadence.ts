const EASTERN_TIME_ZONE = "America/New_York";

type EasternWeekday = "Sun" | "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat";

type EasternTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: EasternWeekday;
};

function value(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes
) {
  const part = parts.find(item => item.type === type)?.value;
  if (!part) throw new Error(`Missing ${type} in Eastern date conversion.`);
  return Number(part);
}

function weekday(parts: Intl.DateTimeFormatPart[]): EasternWeekday {
  const value = parts.find(item => item.type === "weekday")?.value;
  if (
    !value ||
    !["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].includes(value)
  ) {
    throw new Error("Missing weekday in Eastern date conversion.");
  }
  return value as EasternWeekday;
}

function easternParts(now: Date): EasternTimeParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN_TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23",
  }).formatToParts(now);

  return {
    year: value(parts, "year"),
    month: value(parts, "month"),
    day: value(parts, "day"),
    hour: value(parts, "hour"),
    minute: value(parts, "minute"),
    second: value(parts, "second"),
    weekday: weekday(parts),
  };
}

function dateKey(parts: Pick<EasternTimeParts, "year" | "month" | "day">) {
  return [
    parts.year,
    String(parts.month).padStart(2, "0"),
    String(parts.day).padStart(2, "0"),
  ].join("-");
}

function addEasternDays(key: string, days: number) {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days, 12));
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function easternDateTimeToUtc(
  key: string,
  hour: number,
  minute = 0,
  second = 0
) {
  const [year, month, day] = key.split("-").map(Number);
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  const local = easternParts(new Date(utcGuess));
  const interpretedAsUtc = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute,
    local.second
  );
  return new Date(utcGuess - (interpretedAsUtc - utcGuess));
}

function mondayOffset(day: EasternWeekday) {
  const index = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(day);
  return (index + 6) % 7;
}

/** A Projects reporting week starts on Monday and closes Thursday at 6:00 PM Eastern. */
export function getProjectWeeklyUpdatePeriod(now = new Date()) {
  const eastern = easternParts(now);
  const weekOf = addEasternDays(
    dateKey(eastern),
    -mondayOffset(eastern.weekday)
  );
  const deadline = easternDateTimeToUtc(addEasternDays(weekOf, 3), 18);
  const weekEnd = easternDateTimeToUtc(addEasternDays(weekOf, 7), 0);
  const isLate = now.getTime() > deadline.getTime();
  const weekLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN_TIME_ZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(easternDateTimeToUtc(weekOf, 12));

  return {
    weekOf,
    weekLabel: `Week of ${weekLabel}`,
    deadline,
    weekEnd,
    isLate,
  };
}

export function isProjectWeeklyUpdateLate(updatedAt: Date, deadline: Date) {
  return updatedAt.getTime() > deadline.getTime();
}
