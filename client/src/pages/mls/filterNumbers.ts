export type NumericKind = "currency" | "integer" | "decimal";

export function sanitizeNumericInput(input: string, kind: NumericKind): string {
  const digits = input.replace(/[^0-9.]/g, "");
  if (kind === "integer") return digits.replace(/\./g, "").slice(0, 12);
  const [whole, ...fraction] = digits.split(".");
  return `${whole.slice(0, 12)}${fraction.length ? `.${fraction.join("").slice(0, 2)}` : ""}`;
}

export function formatNumericFilter(value: number | undefined, kind: NumericKind): string {
  if (value === undefined || !Number.isFinite(value)) return "";
  if (kind === "currency") return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: kind === "integer" ? 0 : 2 }).format(value);
}

export function parseNumericFilter(input: string, kind: NumericKind, min: number, max: number): { value?: number; error?: string } {
  const cleaned = sanitizeNumericInput(input, kind);
  if (!cleaned || cleaned === ".") return {};
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < min || value > max || (kind === "integer" && !Number.isInteger(value))) {
    return { error: `Enter a value from ${formatNumericFilter(min, kind)} to ${formatNumericFilter(max, kind)}.` };
  }
  return { value };
}
