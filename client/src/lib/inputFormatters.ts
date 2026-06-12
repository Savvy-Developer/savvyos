/**
 * Shared input formatting and validation helpers.
 *
 * Phone format:  flexible — accepts plain digits (9+) or formatted strings like (111) 222-3333
 * Currency:      $1,234,567.89  (stored as raw numeric string, displayed formatted)
 * Email:         standard RFC-ish validation
 */

// ─── Phone ────────────────────────────────────────────────────────────────────

/** Strip everything except digits */
export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * Format a raw digit string (or partially-typed string) into (NXX) NXX-XXXX.
 * Only applies formatting when the input is exactly 10 digits; otherwise returns
 * the value as-is so plain digit strings (9 digits, international, etc.) pass through.
 */
export function formatPhone(value: string): string {
  if (!value) return "";
  const digits = digitsOnly(value);
  // Only auto-format standard 10-digit US numbers
  if (digits.length === 10 && value === digits) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  // Return value unchanged (already formatted, international, or partial)
  return value;
}

/**
 * Returns true if the value is a valid phone number.
 * Accepts:
 *   - Empty / blank (optional field)
 *   - Plain digits: 9 or more digits (e.g. "123456789", "1234567890")
 *   - US formatted: (NXX) NXX-XXXX
 *   - Common formats: dashes, dots, spaces, optional country code
 */
export function isValidPhone(value: string): boolean {
  if (!value || value.trim() === "") return true; // optional field
  const digits = digitsOnly(value.trim());
  // Accept anything with 9 or more digits (covers US 10-digit, international, and plain 9-digit)
  return digits.length >= 9;
}

/** Normalise a pasted/typed phone — returns the value trimmed, or null if blank */
export function normalisePhone(value: string | null | undefined): string | null {
  if (!value || value.trim() === "") return null;
  return value.trim();
}

// ─── Email ────────────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Returns true for blank (optional) or a structurally valid email */
export function isValidEmail(value: string): boolean {
  if (!value || value.trim() === "") return true;
  return EMAIL_RE.test(value.trim());
}

// ─── Currency ─────────────────────────────────────────────────────────────────

/**
 * Format a raw numeric string or number to "$1,234,567.89".
 * Used for display only — the underlying value stored/sent is the raw number string.
 */
export function formatCurrency(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const num = typeof value === "number" ? value : parseFloat(String(value).replace(/[^0-9.]/g, ""));
  if (isNaN(num)) return "";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

/**
 * Strip currency formatting to a plain numeric string suitable for storage.
 * "$1,234,567.89" → "1234567.89"
 */
export function parseCurrencyInput(value: string): string {
  return value.replace(/[^0-9.]/g, "");
}

/**
 * Format as the user types a currency field.
 * Strips non-numeric chars (except "."), keeps at most one decimal point.
 */
export function formatCurrencyInput(value: string): string {
  // Strip everything except digits and the first decimal point
  const stripped = value.replace(/[^0-9.]/g, "");
  const parts = stripped.split(".");
  const intPart = parts[0].replace(/^0+(?=\d)/, ""); // remove leading zeros
  const decPart = parts.length > 1 ? "." + parts[1].slice(0, 2) : "";
  // Add thousands separators to the integer part
  const formatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return formatted ? `$${formatted}${decPart}` : decPart ? `$0${decPart}` : "";
}

// ─── Percentage ───────────────────────────────────────────────────────────────

/** Format a commission rate string as "X.XX%" */
export function formatPercent(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const num = typeof value === "number" ? value : parseFloat(String(value).replace(/[^0-9.]/g, ""));
  if (isNaN(num)) return "";
  return `${num}%`;
}
