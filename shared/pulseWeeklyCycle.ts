const PULSE_OPERATING_TIME_ZONE = "America/New_York";

function easternCalendarDay(reference = new Date()) {
  const parts = new Map(
    new Intl.DateTimeFormat("en-US", {
      timeZone: PULSE_OPERATING_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(reference)
      .filter(part => part.type !== "literal")
      .map(part => [part.type, Number(part.value)])
  );

  return new Date(
    Date.UTC(
      parts.get("year") ?? 0,
      (parts.get("month") ?? 1) - 1,
      parts.get("day") ?? 1
    )
  );
}

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

/**
 * Pulse's operational week starts at 12:00 AM Saturday in the product's
 * operating timezone. Date columns are stored without a timezone, so the
 * returned UTC-midnight value represents that local calendar date.
 */
export function pulseWeeklyCycleStart(reference = new Date()) {
  const day = easternCalendarDay(reference);
  return addDays(day, -((day.getUTCDay() + 1) % 7));
}

/** Returns the inclusive Saturday–Friday operational window used by Pulse. */
export function pulseWeeklyCycle(reference = new Date()) {
  const start = pulseWeeklyCycleStart(reference);
  const end = addDays(start, 6);
  return {
    start,
    end,
    startDate: dateOnly(start),
    endDate: dateOnly(end),
  };
}
