/**
 * Canonical SavvyOS phone handling.
 *
 * SavvyOS stores and presents U.S. phone numbers as `(xxx) xxx-xxxx`.
 * Blank values remain null; country-code-prefixed U.S. numbers are accepted
 * only when they contain a single leading `1` and normalize to ten digits.
 */
export const US_PHONE_FORMAT = "(xxx) xxx-xxxx";

export function phoneDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export function normalizeUsPhoneDigits(value: string): string | null {
  const digits = phoneDigits(value.trim());
  if (digits.length === 10) return digits;
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return null;
}

export function formatUsPhoneDigits(digits: string): string {
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
}

export function formatUsPhone(value: string | null | undefined): string {
  if (!value || !value.trim()) return "";
  const digits = normalizeUsPhoneDigits(value);
  return digits ? formatUsPhoneDigits(digits) : value.trim();
}

/**
 * Converts a submitted value to SavvyOS's canonical storage format.
 * Returns null for blank input and throws for a populated non-U.S. or malformed value.
 */
export function normalizeOptionalUsPhone(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value.trim() === "") return null;
  const digits = normalizeUsPhoneDigits(value);
  if (!digits) {
    throw new Error(`Phone number must contain exactly 10 digits and use ${US_PHONE_FORMAT}.`);
  }
  return formatUsPhoneDigits(digits);
}

export function isValidOptionalUsPhone(value: string | null | undefined): boolean {
  if (value === null || value === undefined || value.trim() === "") return true;
  return normalizeUsPhoneDigits(value) !== null;
}

/** Formats partially typed or pasted input while retaining only one U.S. 10-digit number. */
export function formatUsPhoneInput(value: string | null | undefined): string {
  const input = value ?? "";
  const rawDigits = phoneDigits(input);
  const digits = rawDigits.length > 10 && rawDigits.startsWith("1")
    ? rawDigits.slice(1, 11)
    : rawDigits.slice(0, 10);

  if (!digits) return "";
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return formatUsPhoneDigits(digits);
}

/** Normalizes the named phone fields of an insert/update payload before persistence. */
export function normalizePhoneFields<T extends object>(data: T, fields: readonly string[]): T {
  const normalized = { ...data } as Record<string, unknown>;
  const source = data as Record<string, unknown>;

  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(source, field)) continue;
    const value = source[field];
    if (value === undefined) continue;
    if (value !== null && typeof value !== "string") {
      throw new Error(`Phone field ${field} must be a string or null.`);
    }
    normalized[field] = normalizeOptionalUsPhone(value);
  }

  return normalized as T;
}
