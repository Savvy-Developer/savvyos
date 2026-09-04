/**
 * Shared formatting utilities for consistent display across SavvyOS.
 * All functions are pure and safe to call with null/undefined.
 */

// Re-export formatPhone from inputFormatters for convenience
export { formatPhone } from "@/lib/inputFormatters";

/**
 * Format an email address to lowercase.
 */
export function formatEmail(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw.trim().toLowerCase();
}

/**
 * Format a street address to title case.
 * e.g. "123 MAIN ST" → "123 Main St"
 */
export function formatStreet(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Format city/state/zip into a single line.
 * e.g. formatCityStateZip("nashville", "TN", "37201") → "Nashville, TN 37201"
 */
export function formatCityStateZip(
  city: string | null | undefined,
  state: string | null | undefined,
  zip: string | null | undefined
): string {
  const parts: string[] = [];
  if (city) {
    parts.push(
      city
        .trim()
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase())
    );
  }
  const statePart = state ? state.trim().toUpperCase() : null;
  const zipPart = zip ? zip.trim() : null;
  if (statePart && zipPart) {
    parts.push(`${statePart} ${zipPart}`);
  } else if (statePart) {
    parts.push(statePart);
  } else if (zipPart) {
    parts.push(zipPart);
  }
  return parts.join(", ");
}

/**
 * Format a full address block (street + city/state/zip).
 * Returns an array of lines for multi-line display.
 */
export function formatAddressLines(opts: {
  street?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}): string[] {
  const lines: string[] = [];
  if (opts.street) lines.push(formatStreet(opts.street));
  const csz = formatCityStateZip(opts.city, opts.state, opts.zip);
  if (csz) lines.push(csz);
  return lines;
}

/**
 * Format a name to title case.
 */
export function formatName(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Format a dollar amount.
 * e.g. formatCurrency(12345.6) → "$12,345.60"
 */
export function formatCurrency(
  amount: number | string | null | undefined,
  opts?: { decimals?: number; symbol?: string }
): string {
  if (amount === null || amount === undefined || amount === "") return "";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "";
  const decimals = opts?.decimals ?? 0;
  const symbol = opts?.symbol ?? "$";
  return `${symbol}${num.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

/**
 * Format a percentage.
 * e.g. formatPercent(3.5) → "3.50%"
 */
export function formatPercent(
  value: number | string | null | undefined,
  decimals = 2
): string {
  if (value === null || value === undefined || value === "") return "";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "";
  return `${num.toFixed(decimals)}%`;
}

/**
 * Format an instant in 12-hour Eastern Time. The time-zone abbreviation resolves
 * to EDT or EST automatically for the represented date.
 */
export function formatEasternDateTime(
  value: Date | string | number | null | undefined,
  options: { includeYear?: boolean } = {}
): string {
  if (value === null || value === undefined || value === "") return "Unknown time";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    ...(options.includeYear === false ? {} : { year: "numeric" }),
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  }).format(date);
}

/**
 * Format a recurring HH:mm schedule value as a 12-hour Eastern clock time.
 * Recurring schedules have no date, so the stable zone label is ET rather
 * than an incorrect fixed EDT or EST abbreviation.
 */
export function formatEasternClockTime(value: string | null | undefined): string {
  if (!value) return "";
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!match) return value;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return value;
  const meridiem = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${meridiem} ET`;
}
