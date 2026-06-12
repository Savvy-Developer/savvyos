import { format, isValid } from "date-fns";

/**
 * Safely format a date value. Returns "—" if the value is null, undefined, or invalid.
 */
export function safeFormat(dateVal: unknown, fmt: string, fallback = "—"): string {
  if (dateVal == null || dateVal === "") return fallback;
  const d = dateVal instanceof Date ? dateVal : new Date(dateVal as any);
  return isValid(d) ? format(d, fmt) : fallback;
}
