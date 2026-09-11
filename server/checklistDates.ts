export type ChecklistTargetType = "transaction" | "listing";
export type ChecklistDueAnchor =
  | "target_created"
  | "under_contract"
  | "closing"
  | "listing_live";

export type ChecklistDateTarget = {
  targetType: ChecklistTargetType;
  createdAt: Date | string | null;
  contractDate?: Date | string | null;
  closingDate?: Date | string | null;
  listDate?: Date | string | null;
};

export const DEFAULT_CHECKLIST_TIMEZONE = "America/New_York";

/**
 * Normalizes a persisted calendar date or timestamp to noon UTC. Noon avoids
 * the previous/next-date drift that midnight values can acquire in local zones.
 */
export function toNoonUtc(value: Date | string | null | undefined): Date | null {
  if (!value) return null;

  if (typeof value === "string") {
    const calendarMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if (calendarMatch) {
      const [, year, month, day] = calendarMatch;
      const result = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12));
      return Number.isNaN(result.getTime()) ? null : result;
    }
  }

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(
    Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate(), 12)
  );
}

/** Applies a signed number of UTC calendar days and preserves noon UTC. */
export function addCalendarDaysAtNoonUtc(
  value: Date | string | null | undefined,
  offsetDays: number
): Date | null {
  const normalized = toNoonUtc(value);
  if (!normalized) return null;
  normalized.setUTCDate(normalized.getUTCDate() + offsetDays);
  return normalized;
}

/** Converts an event instant to its Eastern business date, then stores noon UTC. */
export function eventToNoonUtc(
  value: Date | string | null | undefined,
  timezone = DEFAULT_CHECKLIST_TIMEZONE
): Date | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(parsed);
  const valueOf = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find(part => part.type === type)?.value);
  return new Date(
    Date.UTC(valueOf("year"), valueOf("month") - 1, valueOf("day"), 12)
  );
}

export function resolveChecklistAnchor(
  target: ChecklistDateTarget,
  anchor: ChecklistDueAnchor | null | undefined,
  options: { underContractEventAt?: Date | string | null } = {}
): Date | null {
  if (!anchor) return null;

  switch (anchor) {
    case "target_created":
      return eventToNoonUtc(target.createdAt);
    case "under_contract":
      return options.underContractEventAt
        ? eventToNoonUtc(options.underContractEventAt)
        : toNoonUtc(target.contractDate);
    case "closing":
      // An unknown closing date is intentionally not inferred from any other anchor.
      return toNoonUtc(target.closingDate);
    case "listing_live":
      return target.targetType === "listing" ? toNoonUtc(target.listDate) : null;
  }
}

export function resolveChecklistDueDate(
  target: ChecklistDateTarget,
  anchor: ChecklistDueAnchor | null | undefined,
  offsetDays: number,
  options: { underContractEventAt?: Date | string | null } = {}
): Date | null {
  return addCalendarDaysAtNoonUtc(
    resolveChecklistAnchor(target, anchor, options),
    offsetDays
  );
}
