export const LEGACY_FREQUENCIES = ["weekly", "monthly", "quarterly", "annually"] as const;
export const MEASUREMENT_PERIODS = [
  "weekly",
  "monthly",
  "quarterly",
  "annually",
  "month_to_date",
  "quarter_to_date",
  "year_to_date",
  "rolling",
  "per_event",
  "current_snapshot",
] as const;
export const REVIEW_FREQUENCIES = ["weekly", "monthly", "quarterly", "annually", "as_needed"] as const;
export const COMPARISON_RULES = ["at_least", "at_most", "within_range", "exactly", "informational"] as const;
export const RESULT_STATES = ["reported", "missing", "not_due", "no_eligible_activity"] as const;
export const CALCULATION_METHODS = ["count", "unique_count", "sum", "average", "weighted_average", "percentage", "formula", "latest"] as const;

export type LegacyFrequency = (typeof LEGACY_FREQUENCIES)[number];
export type MeasurementPeriod = (typeof MEASUREMENT_PERIODS)[number];
export type ComparisonRule = (typeof COMPARISON_RULES)[number];
export type ResultState = (typeof RESULT_STATES)[number];
export type FilterMap = Record<string, string | number | boolean | Array<string | number>>;

type PeriodMetric = {
  frequency: LegacyFrequency;
  measurementPeriod?: string | null;
  rollingDays?: number | null;
  isCumulative?: boolean;
  cumulativeReset?: "monthly" | "quarterly" | "annually" | "never" | null;
};

type Target = {
  targetValue?: number | null;
  targetMinimum?: number | null;
  targetMaximum?: number | null;
  comparisonRule?: string | null;
  warningThreshold?: number | null;
  performanceDirection?: string | null;
};

export function dayStart(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

export function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function periodBounds(frequency: LegacyFrequency, reference = new Date()) {
  const day = dayStart(reference);
  if (frequency === "weekly") {
    const weekday = day.getUTCDay();
    const start = addDays(day, weekday === 0 ? -6 : 1 - weekday);
    return { start, end: addDays(start, 7) };
  }
  if (frequency === "monthly") {
    const start = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1));
    return { start, end: new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + 1, 1)) };
  }
  if (frequency === "quarterly") {
    const month = Math.floor(day.getUTCMonth() / 3) * 3;
    const start = new Date(Date.UTC(day.getUTCFullYear(), month, 1));
    return { start, end: new Date(Date.UTC(day.getUTCFullYear(), month + 3, 1)) };
  }
  const start = new Date(Date.UTC(day.getUTCFullYear(), 0, 1));
  return { start, end: new Date(Date.UTC(day.getUTCFullYear() + 1, 0, 1)) };
}

export function priorPeriod(frequency: LegacyFrequency, reference: Date) {
  if (frequency === "weekly") return addDays(reference, -7);
  if (frequency === "monthly") return new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() - 1, 1));
  if (frequency === "quarterly") return new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() - 3, 1));
  return new Date(Date.UTC(reference.getUTCFullYear() - 1, 0, 1));
}

export function currentMeasurementPeriod(metric: PeriodMetric): MeasurementPeriod {
  const candidate = metric.measurementPeriod as MeasurementPeriod | undefined;
  return MEASUREMENT_PERIODS.includes(candidate as MeasurementPeriod) ? candidate! : metric.frequency as MeasurementPeriod;
}

export function isEventMetric(metric: PeriodMetric) {
  return currentMeasurementPeriod(metric) === "per_event";
}

export function isSnapshotMetric(metric: PeriodMetric) {
  return currentMeasurementPeriod(metric) === "current_snapshot";
}

export function metricPeriodBounds(metric: PeriodMetric, reference = new Date()) {
  const measurementPeriod = currentMeasurementPeriod(metric);
  const day = dayStart(reference);
  if (measurementPeriod === "month_to_date") {
    return { start: new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1)), end: addDays(day, 1) };
  }
  if (measurementPeriod === "quarter_to_date") {
    const month = Math.floor(day.getUTCMonth() / 3) * 3;
    return { start: new Date(Date.UTC(day.getUTCFullYear(), month, 1)), end: addDays(day, 1) };
  }
  if (measurementPeriod === "year_to_date") {
    return { start: new Date(Date.UTC(day.getUTCFullYear(), 0, 1)), end: addDays(day, 1) };
  }
  if (measurementPeriod === "rolling") {
    const days = Math.max(1, Math.min(730, metric.rollingDays ?? 30));
    return { start: addDays(day, -(days - 1)), end: addDays(day, 1) };
  }
  if (measurementPeriod === "per_event" || measurementPeriod === "current_snapshot") {
    return { start: day, end: addDays(day, 1) };
  }
  const standard = measurementPeriod === "weekly" || measurementPeriod === "monthly" || measurementPeriod === "quarterly" ? measurementPeriod : metric.frequency;
  const display = periodBounds(standard, reference);
  if (!metric.isCumulative || !metric.cumulativeReset) return display;
  if (metric.cumulativeReset === "never") return { start: new Date(Date.UTC(2000, 0, 1)), end: display.end };
  return { start: periodBounds(metric.cumulativeReset, reference).start, end: display.end };
}

export function formatPeriod(metric: PeriodMetric, start: Date, end?: Date) {
  const period = currentMeasurementPeriod(metric);
  if (period === "weekly") return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(start);
  if (period === "monthly" || period === "month_to_date") return `${new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" }).format(start)}${period === "month_to_date" ? " MTD" : ""}`;
  if (period === "quarterly" || period === "quarter_to_date") return `Q${Math.floor(start.getUTCMonth() / 3) + 1} ${start.getUTCFullYear()}${period === "quarter_to_date" ? " QTD" : ""}`;
  if (period === "year_to_date") return `${start.getUTCFullYear()} YTD`;
  if (period === "rolling") return `Rolling ${Math.max(1, metric.rollingDays ?? 30)} days`;
  if (period === "current_snapshot") return "Current snapshot";
  if (period === "per_event") return end ? `Latest event through ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(end)}` : "Latest event";
  return String(start.getUTCFullYear());
}

export function matchesFilters(row: Record<string, unknown>, filters?: FilterMap | null): boolean {
  if (!filters) return true;
  return Object.entries(filters).every(([key, expected]) => {
    const actual = row[key];
    return Array.isArray(expected) ? expected.map(String).includes(String(actual)) : String(actual) === String(expected);
  });
}

function numericValue(row: Record<string, unknown>, field?: string | null) {
  const number = Number(field ? row[field] : 0);
  return Number.isFinite(number) ? number : 0;
}

export type AggregateResult = {
  value: number | null;
  recordCount: number;
  numerator?: number;
  denominator?: number;
  resultState?: ResultState;
};

export function aggregateRows(
  rows: Record<string, unknown>[],
  calculation: "count" | "unique_count" | "sum" | "average" | "weighted_average" | "percentage" | "latest",
  valueField?: string | null,
  numeratorFilters?: FilterMap | null,
  denominatorFilters?: FilterMap | null,
  weightField?: string | null
): AggregateResult {
  if (calculation === "count") return { value: rows.length, recordCount: rows.length };
  if (calculation === "unique_count") {
    const ids = new Set(rows.map((row) => String(row.id ?? JSON.stringify(row))));
    return { value: ids.size, recordCount: ids.size };
  }
  if (calculation === "sum") return { value: rows.reduce((sum, row) => sum + numericValue(row, valueField), 0), recordCount: rows.length };
  if (calculation === "average") return { value: rows.length ? rows.reduce((sum, row) => sum + numericValue(row, valueField), 0) / rows.length : 0, recordCount: rows.length };
  if (calculation === "weighted_average") {
    const denominator = rows.reduce((sum, row) => sum + numericValue(row, weightField), 0);
    if (!denominator) return { value: null, recordCount: rows.length, denominator, resultState: "no_eligible_activity" };
    return { value: rows.reduce((sum, row) => sum + numericValue(row, valueField) * numericValue(row, weightField), 0) / denominator, recordCount: rows.length, denominator };
  }
  if (calculation === "latest") {
    const sorted = [...rows].sort((a, b) => new Date(String(b.updatedAt ?? b.createdAt ?? 0)).getTime() - new Date(String(a.updatedAt ?? a.createdAt ?? 0)).getTime());
    return { value: sorted.length ? numericValue(sorted[0], valueField) : null, recordCount: rows.length, ...(sorted.length ? {} : { resultState: "missing" as const }) };
  }
  const denominatorRows = rows.filter((row) => matchesFilters(row, denominatorFilters));
  const numeratorRows = rows.filter((row) => matchesFilters(row, numeratorFilters));
  const denominator = denominatorRows.length;
  const numerator = numeratorRows.length;
  if (!denominator) return { value: null, recordCount: 0, numerator, denominator, resultState: "no_eligible_activity" };
  return { value: (numerator / denominator) * 100, recordCount: denominator, numerator, denominator };
}

function tokenizeFormula(expression: string) {
  const tokens: string[] = [];
  const matcher = /^\s*([A-Za-z][A-Za-z0-9_]*|(?:\d+\.?\d*|\.\d+)|[()+\-*/])/;
  let index = 0;
  while (index < expression.length) {
    const match = expression.slice(index).match(matcher);
    if (!match) throw new Error("Use only input names, numbers, parentheses, and +, -, *, or / in the formula.");
    tokens.push(match[1]);
    index += match[0].length;
  }
  return tokens;
}

export function evaluateFormula(expression: string, inputs: Record<string, number | null | undefined>) {
  const tokens = tokenizeFormula(expression);
  let position = 0;
  const readFactor = (): number => {
    const token = tokens[position++];
    if (token === "(") {
      const value = readExpression();
      if (tokens[position++] !== ")") throw new Error("Formula has an unmatched parenthesis.");
      return value;
    }
    if (token === "-") return -readFactor();
    if (token && /^\d|^\.\d/.test(token)) return Number(token);
    if (token && /^[A-Za-z]/.test(token)) {
      const value = inputs[token];
      if (value == null || !Number.isFinite(value)) throw new Error(`Enter a valid value for ${token}.`);
      return value;
    }
    throw new Error("Formula is incomplete.");
  };
  const readTerm = (): number => {
    let value = readFactor();
    while (["*", "/"].includes(tokens[position])) {
      const operation = tokens[position++];
      const next = readFactor();
      if (operation === "/" && next === 0) throw new Error("Formula denominator is zero.");
      value = operation === "*" ? value * next : value / next;
    }
    return value;
  };
  const readExpression = (): number => {
    let value = readTerm();
    while (["+", "-"].includes(tokens[position])) {
      const operation = tokens[position++];
      const next = readTerm();
      value = operation === "+" ? value + next : value - next;
    }
    return value;
  };
  const result = readExpression();
  if (position !== tokens.length || !Number.isFinite(result)) throw new Error("Formula could not be calculated.");
  return result;
}

export function targetLabel(target: Target, format: (value: number) => string) {
  const rule = target.comparisonRule ?? (target.performanceDirection === "lower" ? "at_most" : "at_least");
  if (rule === "informational") return "Informational";
  if (rule === "within_range") return target.targetMinimum == null || target.targetMaximum == null ? "Target unset" : `Between ${format(target.targetMinimum)} and ${format(target.targetMaximum)}`;
  if (target.targetValue == null) return "Target unset";
  if (rule === "at_most") return `No more than ${format(target.targetValue)}`;
  if (rule === "exactly") return `Exactly ${format(target.targetValue)}`;
  return `At least ${format(target.targetValue)}`;
}

export function scoreResult(actual: number | null, resultState: string | null | undefined, target: Target) {
  if (resultState && resultState !== "reported") return { status: resultState, onTarget: null as boolean | null };
  if (actual == null) return { status: "missing", onTarget: null as boolean | null };
  const rule = target.comparisonRule ?? (target.performanceDirection === "lower" ? "at_most" : "at_least");
  if (rule === "informational") return { status: "informational", onTarget: null as boolean | null };
  if (rule === "within_range") {
    if (target.targetMinimum == null || target.targetMaximum == null) return { status: "target_unset", onTarget: null as boolean | null };
    const onTarget = actual >= target.targetMinimum && actual <= target.targetMaximum;
    return { status: onTarget ? "on_target" : "off_target", onTarget };
  }
  if (target.targetValue == null) return { status: "target_unset", onTarget: null as boolean | null };
  const onTarget = rule === "at_most" ? actual <= target.targetValue : rule === "exactly" ? actual === target.targetValue : actual >= target.targetValue;
  if (onTarget) return { status: "on_target", onTarget: true };
  const warning = target.warningThreshold;
  const warningApplies = warning != null && (rule === "at_most" ? actual <= warning : rule === "at_least" ? actual >= warning : false);
  return { status: warningApplies ? "warning" : "off_target", onTarget: false };
}

export { periodToDatePerformance } from "@shared/scorecard";
export type { PeriodPerformanceMarker } from "@shared/scorecard";

export function trendPhrase(values: Array<number | null>, frequency: LegacyFrequency) {
  const [current, prior, older] = values;
  if (current == null || prior == null) return null;
  const unit = frequency === "weekly" ? "week" : frequency === "monthly" ? "month" : frequency === "quarterly" ? "quarter" : "year";
  const direction = current > prior ? "up" : current < prior ? "down" : "flat";
  if (older != null && ((current > prior && prior > older) || (current < prior && prior < older))) return `3rd ${unit} ${direction === "up" ? "rising" : "declining"}`;
  return direction === "flat" ? "Holding steady" : `${direction === "up" ? "Trending up" : "Trending down"}`;
}
