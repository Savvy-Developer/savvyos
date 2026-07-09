import { format, isValid } from "date-fns";

/**
 * Safely format a date value. Returns "—" if the value is null, undefined, or invalid.
 *
 * IMPORTANT: MySQL/TiDB returns timestamps WITHOUT a timezone suffix (e.g. "2026-07-08 21:43:23").
 * `new Date("2026-07-08 21:43:23")` is parsed as LOCAL time by most browsers, which is wrong —
 * the DB stores UTC. We normalise by replacing the space with "T" and appending "Z" so the
 * browser always treats the value as UTC before applying any local-timezone rendering.
 */
function toUtcDate(dateVal: unknown): Date | null {
  if (dateVal == null || dateVal === "") return null;
  if (dateVal instanceof Date) return dateVal;
  let s = String(dateVal);
  // MySQL format "YYYY-MM-DD HH:MM:SS" → treat as UTC
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(s)) {
    s = s.replace(" ", "T") + (s.endsWith("Z") ? "" : "Z");
  }
  const d = new Date(s);
  return isValid(d) ? d : null;
}

/**
 * Format a date-only value (e.g. listDate, closingDate) using date-fns.
 * Date-only strings like "2025-07-09" are parsed as midnight UTC by the JS engine,
 * which rolls back to the previous day in negative-offset timezones (EST/EDT).
 * We work around this by shifting to local noon before formatting.
 */
export function safeFormatDate(dateVal: unknown, fmt: string, fallback = "—"): string {
  if (dateVal == null || dateVal === "") return fallback;
  let d: Date;
  if (dateVal instanceof Date) {
    d = dateVal;
  } else {
    const s = String(dateVal);
    // Pure date string "YYYY-MM-DD" — parse as local noon to avoid UTC rollover
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const [y, m, day] = s.split("-").map(Number);
      d = new Date(y, m - 1, day, 12, 0, 0);
    } else {
      // Has time component — treat as UTC then render in local time
      const utc = toUtcDate(s);
      if (!utc) return fallback;
      d = utc;
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
