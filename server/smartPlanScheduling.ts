export type SmartPlanSendWindow = {
  days: number[];
  startHour: number;
  endHour: number;
  timezone: string;
};

export type SmartPlanSendWindowInput = {
  days?: number[] | null;
  startHour?: number | null;
  endHour?: number | null;
  timezone?: string | null;
};

export const DEFAULT_SMART_PLAN_DELIVERY_WINDOW: SmartPlanSendWindow = {
  days: [0, 1, 2, 3, 4, 5, 6],
  startHour: 8,
  endHour: 20,
  timezone: "America/New_York",
};

export const LEGACY_BUSINESS_HOURS_WINDOW: SmartPlanSendWindow = {
  days: [1, 2, 3, 4, 5],
  startHour: 9,
  endHour: 18,
  timezone: "America/New_York",
};

function localDateParts(
  date: Date,
  timezone: string
): { weekday: number; hour: number } | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
      hour: "numeric",
      hourCycle: "h23",
    }).formatToParts(date);
    const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
      parts.find(part => part.type === "weekday")?.value ?? ""
    );
    const hour = Number(
      parts.find(part => part.type === "hour")?.value ?? Number.NaN
    );
    return weekday >= 0 && Number.isInteger(hour) ? { weekday, hour } : null;
  } catch {
    return null;
  }
}

export function normaliseSmartPlanSendWindow(
  input: SmartPlanSendWindowInput | null | undefined
): SmartPlanSendWindow {
  const days = Array.from(
    new Set(
      (input?.days ?? DEFAULT_SMART_PLAN_DELIVERY_WINDOW.days).filter(
        (day): day is number => Number.isInteger(day) && day >= 0 && day <= 6
      )
    )
  ).sort((a, b) => a - b);
  const startHour =
    Number.isInteger(input?.startHour) &&
    input!.startHour! >= 0 &&
    input!.startHour! <= 23
      ? input!.startHour!
      : DEFAULT_SMART_PLAN_DELIVERY_WINDOW.startHour;
  const endHour =
    Number.isInteger(input?.endHour) &&
    input!.endHour! >= 1 &&
    input!.endHour! <= 24
      ? input!.endHour!
      : DEFAULT_SMART_PLAN_DELIVERY_WINDOW.endHour;

  return {
    days: days.length ? days : DEFAULT_SMART_PLAN_DELIVERY_WINDOW.days,
    startHour,
    endHour,
    timezone: input?.timezone?.trim() || DEFAULT_SMART_PLAN_DELIVERY_WINDOW.timezone,
  };
}

export function isValidSmartPlanSendWindow(
  input: SmartPlanSendWindow
): boolean {
  return (
    input.days.length > 0 &&
    input.startHour >= 0 &&
    input.startHour <= 23 &&
    input.endHour >= 1 &&
    input.endHour <= 24 &&
    input.startHour < input.endHour
  );
}

/** Return true only while the supplied local day and hour fall in the enabled window. */
export function isWithinSmartPlanSendWindow(
  date: Date,
  input: SmartPlanSendWindow
): boolean {
  const parts = localDateParts(date, input.timezone);
  if (!parts) return true;
  return (
    input.days.includes(parts.weekday) &&
    parts.hour >= input.startHour &&
    parts.hour < input.endHour
  );
}

/**
 * Find the next whole-hour start inside a configured window. The Smart Plan worker
 * runs every five minutes; whole-hour boundaries make its deferred timestamps
 * predictable while preserving each step's configured delivery day and timezone.
 */
export function nextSmartPlanSendWindowStart(
  from: Date,
  input: SmartPlanSendWindow
): Date {
  const candidate = new Date(from);
  candidate.setMinutes(0, 0, 0);
  candidate.setHours(candidate.getHours() + 1);

  for (let hour = 0; hour < 8 * 24; hour += 1) {
    if (isWithinSmartPlanSendWindow(candidate, input)) return candidate;
    candidate.setHours(candidate.getHours() + 1);
  }
  return candidate;
}
