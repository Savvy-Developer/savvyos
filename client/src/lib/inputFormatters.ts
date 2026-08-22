import {
  formatUsPhone,
  formatUsPhoneInput,
  isValidOptionalUsPhone,
  normalizeOptionalUsPhone,
  phoneDigits,
} from "@shared/phone";

/** Shared input formatting and validation helpers. */

// ─── Phone ────────────────────────────────────────────────────────────────────

/** Strip everything except digits. */
export function digitsOnly(value: string): string {
  return phoneDigits(value);
}

/**
 * Format a typed or pasted U.S. number as `(xxx) xxx-xxxx`.
 * The field accepts at most ten U.S. digits, with an optional leading country code.
 */
export function formatPhone(value: string): string {
  return formatUsPhoneInput(value);
}

/** Formats an existing stored value for display without mutating it. */
export function formatPhoneDisplay(value: string | null | undefined): string {
  return formatUsPhone(value);
}

/** Returns true for a blank optional value or a valid ten-digit U.S. phone number. */
export function isValidPhone(value: string): boolean {
  return isValidOptionalUsPhone(value);
}

/** Converts a blank value to null and every populated value to `(xxx) xxx-xxxx`. */
export function normalisePhone(value: string | null | undefined): string | null {
  return normalizeOptionalUsPhone(value);
}

// ─── Email ────────────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Returns true for blank (optional) or a structurally valid email. */
export function isValidEmail(value: string): boolean {
  if (!value || value.trim() === "") return true;
  return EMAIL_RE.test(value.trim());
}

// ─── Currency ─────────────────────────────────────────────────────────────────

/**
 * Format a raw numeric string or number to "$1,234,567".
 * Used for display only — the underlying value stored/sent is the raw number string.
 */
export function formatCurrency(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const num = typeof value === "number" ? value : parseFloat(String(value).replace(/[^0-9.]/g, ""));
  if (isNaN(num)) return "";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(num));
}

/** Strip currency formatting to a plain numeric string suitable for storage. */
export function parseCurrencyInput(value: string): string {
  return value.replace(/[^0-9.]/g, "");
}

/** Format a currency input with thousands separators and no cents. */
export function formatCurrencyInput(value: string): string {
  const stripped = value.replace(/[^0-9]/g, "");
  if (!stripped) return "";
  const intPart = stripped.replace(/^0+(?=\d)/, "");
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// ─── Percentage ───────────────────────────────────────────────────────────────

/** Format a percentage as `X.XX%`. */
export function formatPercent(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const num = typeof value === "string" ? parseFloat(String(value).replace(/[^0-9.]/g, "")) : value;
  if (isNaN(num)) return "";
  return `${num}%`;
}
