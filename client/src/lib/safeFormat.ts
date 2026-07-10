import { format, isValid } from "date-fns";

/**
 * Normalise a raw DB value to a UTC Date object.
 * MySQL/TiDB returns timestamps WITHOUT a timezone suffix (e.g. "2026-07-08 21:43:23").
 * `new Date("2026-07-08 21:43:23")` is parsed as LOCAL time by most browsers — wrong.
 * We normalise by replacing the space with "T" and appending "Z" so the value is always UTC.
 */
function toUtcDate(dateVal: unknown): Date | null {
  if (dateVal == null || dateVal === "") return null;
  if (dateVal instanceof Date) return isValid(dateVal) ? dateVal : null;
  let s = String(dateVal);
  // MySQL format "YYYY-MM-DD HH:MM:SS" → treat as UTC
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(s)) {
    s = s.replace(" ", "T") + (s.endsWith("Z") ? "" : "Z");
  }
  const d = new Date(s);
  return isValid(d) ? d : null;
}

/**
 * Extract the YYYY-MM-DD date string in Eastern Time from a UTC Date.
 * Used so that date-only fields (listDate, dueDate, etc.) display the correct
 * calendar day even when stored as midnight UTC (which is the previous day in ET).
 */
function utcToEtDateString(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d); // returns "YYYY-MM-DD"
}

/**
 * Format a date-only value (e.g. listDate, closingDate, dueDate).
 *
 * Handles two cases:
 *  1. Pure date string "YYYY-MM-DD" — parse as local noon to avoid UTC rollover.
 *  2. DB timestamp with time component "YYYY-MM-DD HH:MM:SS" — parse as UTC,
 *     then extract the date portion in Eastern Time before formatting.
 *     This prevents midnight-UTC values from rolling back to the previous day in EST.
 */
export function safeFormatDate(dateVal: unknown, fmt: string, fallback = "—"): string {
  if (dateVal == null || dateVal === "") return fallback;

  let d: Date;

  if (dateVal instanceof Date) {
    d = dateVal;
  } else {
    const s = String(dateVal);

    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      // Pure date string — parse as local noon to avoid UTC rollover
      const [y, m, day] = s.split("-").map(Number);
      d = new Date(y, m - 1, day, 12, 0, 0);
    } else {
      // Has time component — parse as UTC, then get the ET date string
      const utc = toUtcDate(s);
      if (!utc) return fallback;
      // Re-parse the ET date string as local noon so date-fns format works correctly
      const etDate = utcToEtDateString(utc); // "YYYY-MM-DD"
      const [y, m, day] = etDate.split("-").map(Number);
      d = new Date(y, m - 1, day, 12, 0, 0);
    }
  }

  return isValid(d) ? format(d, fmt) : fallback;
}

/**
 * Format a datetime value as Eastern Time (America/New_York), which automatically
 * handles both EST (UTC-5) and EDT (UTC-4) daylight saving transitions.
 * Appends the timezone abbreviation (ET) to the output.
 *
 * @param dateVal - UTC timestamp from DB (Date object, ISO string, or MySQL "YYYY-MM-DD HH:MM:SS")
 * @param opts    - Intl.DateTimeFormat options (defaults to date + time, no seconds)
 * @param fallback - Value to return if dateVal is null/invalid
 */
export function safeFormatET(
  dateVal: unknown,
  opts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  },
  fallback = "—"
): string {
  const d = toUtcDate(dateVal);
  if (!d) return fallback;
  try {
    const formatted = new Intl.DateTimeFormat("en-US", {
      ...opts,
      timeZone: "America/New_York",
    }).format(d);
    return `${formatted} ET`;
  } catch {
    return fallback;
  }
}

/**
 * Format a date-only value as Eastern Time (date portion only, no time).
 * Safe for fields like listDate, closingDate, contractDate.
 */
export function safeFormatDateET(dateVal: unknown, fallback = "—"): string {
  return safeFormatET(
    dateVal,
    { month: "short", day: "numeric", year: "numeric" },
    fallback
  );
}

/**
 * Legacy default export — behaves like the original safeFormat but uses UTC-aware parsing.
 * Prefer safeFormatDate() for date-only fields and safeFormatET() for datetime fields.
 */
export function safeFormat(dateVal: unknown, fmt: string, fallback = "—"): string {
  return safeFormatDate(dateVal, fmt, fallback);
}
