export const WEBINAR_TIMEZONES = [
  { value: "America/New_York", label: "Eastern Time" },
  { value: "America/Chicago", label: "Central Time" },
  { value: "America/Denver", label: "Mountain Time" },
  { value: "America/Phoenix", label: "Arizona Time" },
  { value: "America/Los_Angeles", label: "Pacific Time" },
  { value: "America/Anchorage", label: "Alaska Time" },
  { value: "Pacific/Honolulu", label: "Hawaii Time" },
] as const;

export type WebinarTimezone = (typeof WEBINAR_TIMEZONES)[number]["value"];

const LOCAL_DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

function safeTimezone(timezone: string | null | undefined): string {
  const candidate = timezone?.trim();
  if (!candidate) return "America/New_York";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format();
    return candidate;
  } catch {
    return "America/New_York";
  }
}

function dateTimeParts(value: Date | string, timezone: string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: safeTimezone(timezone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(part => part.type === type)?.value ?? "";

  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
    second: read("second"),
  };
}

export function isSupportedWebinarTimezone(
  value: string
): value is WebinarTimezone {
  return WEBINAR_TIMEZONES.some(timezone => timezone.value === value);
}

export function webinarTimezoneLabel(
  timezone: string,
  value: Date | string = new Date()
): string {
  const zone = safeTimezone(timezone);
  const configured = WEBINAR_TIMEZONES.find(item => item.value === zone);
  const date = value instanceof Date ? value : new Date(value);
  const abbreviation = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    timeZoneName: "short",
  })
    .formatToParts(Number.isNaN(date.getTime()) ? new Date() : date)
    .find(part => part.type === "timeZoneName")?.value;

  return `${configured?.label ?? zone}${abbreviation ? ` (${abbreviation})` : ""}`;
}

/** Returns the exact local value required by a datetime-local input for the saved webinar timezone. */
export function webinarDateTimeLocalValue(
  value: Date | string,
  timezone: string
): string {
  const parts = dateTimeParts(value, timezone);
  if (!parts) return "";
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/** Returns the local calendar date for an instant in the selected webinar timezone. */
export function webinarDateKey(value: Date | string, timezone: string): string {
  const parts = dateTimeParts(value, timezone);
  if (!parts) return "";
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** Formats the submitted webinar instant in its own saved timezone, including the timezone abbreviation. */
export function formatWebinarDateTime(
  value: Date | string,
  timezone: string,
  options: { includeWeekday?: boolean; includeYear?: boolean } = {}
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  const zone = safeTimezone(timezone);
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    ...(options.includeWeekday ? { weekday: "long" as const } : {}),
    month: "short",
    day: "numeric",
    ...(options.includeYear === false ? {} : { year: "numeric" }),
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);

  return formatted;
}

/** Formats only the submitted webinar clock time, including the timezone abbreviation. */
export function formatWebinarTime(
  value: Date | string,
  timezone: string
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-US", {
    timeZone: safeTimezone(timezone),
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

/** Formats only the submitted webinar date in its saved timezone. */
export function formatWebinarDate(
  value: Date | string,
  timezone: string
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-US", {
    timeZone: safeTimezone(timezone),
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

/**
 * Converts a datetime-local value into a UTC instant while retaining the wall
 * time the submitter entered in the selected IANA timezone.
 */
export function webinarDateTimeToUtc(value: string, timezone: string): Date {
  const match = value.match(LOCAL_DATE_TIME_PATTERN);
  if (!match) throw new Error("Enter a valid webinar date and time.");
  if (!isSupportedWebinarTimezone(timezone)) {
    throw new Error("Select a supported webinar timezone.");
  }

  const [, year, month, day, hour, minute] = match;
  const localAsUtc = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    0
  );

  // A timezone's offset can change around daylight-saving boundaries. Iterating
  // from the entered wall time resolves the matching UTC instant without relying
  // on the server or browser's local timezone.
  let instant = localAsUtc;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = dateTimeParts(new Date(instant), timezone);
    if (!parts) throw new Error("Enter a valid webinar date and time.");
    const observedLocalAsUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second)
    );
    const adjustment = localAsUtc - observedLocalAsUtc;
    if (adjustment === 0) break;
    instant += adjustment;
  }

  const result = new Date(instant);
  if (webinarDateTimeLocalValue(result, timezone) !== value) {
    throw new Error(
      "That local time does not exist in the selected timezone because of daylight saving time. Choose another time."
    );
  }
  return result;
}

export function hasMinimumWebinarLeadTime(
  startTime: Date,
  now = new Date(),
  minimumDays = 14
): boolean {
  return (
    startTime.getTime() >= now.getTime() + minimumDays * 24 * 60 * 60 * 1000
  );
}
