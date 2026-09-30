export const TODO_DUE_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function startOfToday(now: Date) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function validDateForYear(year: number, monthIndex: number, day: number) {
  const date = new Date(year, monthIndex, day, 12);
  return date.getMonth() === monthIndex && date.getDate() === day ? date : null;
}

/**
 * Resolves a chosen month/day to the next matching calendar date. This lets
 * the compact selector omit a year while keeping due dates unambiguous.
 */
export function inferTodoDueDate(
  monthIndex: number,
  day: number,
  now = new Date()
) {
  if (!Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    throw new Error("A valid month is required");
  }
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw new Error("A valid day is required");
  }

  const today = startOfToday(now);
  for (let year = now.getFullYear(); year <= now.getFullYear() + 8; year += 1) {
    const candidate = validDateForYear(year, monthIndex, day);
    if (candidate && candidate >= today) return candidate;
  }

  throw new Error("Unable to infer a valid due date");
}

/** Includes leap-day when it occurs in one of the next inferred due years. */
export function maxTodoDueDay(monthIndex: number, now = new Date()) {
  if (!Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    throw new Error("A valid month is required");
  }

  let maximum = 0;
  for (let year = now.getFullYear(); year <= now.getFullYear() + 8; year += 1) {
    maximum = Math.max(maximum, new Date(year, monthIndex + 1, 0).getDate());
  }
  return maximum;
}

export function formatTodoDueMonthDay(value: Date | string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}
