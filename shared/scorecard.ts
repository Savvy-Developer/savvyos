export type PeriodPerformanceKind = "best" | "worst";

export type PeriodPerformanceMarker = {
  kind: PeriodPerformanceKind;
  label: string;
  comparedPeriods: number;
};

export type TotalsMode = "cumulative" | "average";

type PeriodMetric = {
  frequency?: string | null;
  measurementPeriod?: string | null;
  performanceDirection?: string | null;
};

type ComparablePeriodValue = {
  id: string | number;
  actual: number | null | undefined;
  resultState?: string | null;
};

export const RECORD_MARKER_MIN_WEEKS = 4;

export function defaultTotalsMode(unit: string): TotalsMode {
  return unit === "percentage" || unit === "score" ? "average" : "cumulative";
}

export function displayFormatForUnit(unit: string) {
  if (unit === "dollars") return "currency";
  if (unit === "percentage") return "percentage";
  if (unit === "hours" || unit === "days") return "duration";
  return "number";
}

function utcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function addUtcDays(value: Date, days: number) {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function weekStartUtc(reference = new Date()) {
  const day = utcDay(reference);
  const weekday = day.getUTCDay();
  return addUtcDays(day, weekday === 0 ? -6 : 1 - weekday);
}

export function dateOnlyUtc(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function formatWeekLabel(start: Date) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(start);
}

export function listWeeks(count = 52, reference = new Date()) {
  const weeks: Array<{ start: string; end: string; label: string; isCurrent: boolean }> = [];
  let cursor = weekStartUtc(reference);
  const currentStart = dateOnlyUtc(weekStartUtc(new Date()));
  for (let index = 0; index < count; index += 1) {
    const start = dateOnlyUtc(cursor);
    const end = dateOnlyUtc(addUtcDays(cursor, 6));
    weeks.push({
      start,
      end,
      label: index === 0 && start === currentStart ? `This week · ${formatWeekLabel(cursor)}` : formatWeekLabel(cursor),
      isCurrent: start === currentStart,
    });
    cursor = addUtcDays(cursor, -7);
  }
  return weeks;
}

export function listTrailingWeeks(count = 8, reference = new Date()) {
  const weeks = listWeeks(count, reference);
  return [...weeks].reverse();
}

const sourceLabels: Record<string, string> = {
  tasks: "tasks assigned to the owner",
  transactions: "transactions owned by the owner",
  agent_connections: "agent connections owned by the owner",
};

const calculationVerbs: Record<string, string> = {
  count: "counts",
  unique_count: "counts unique",
  sum: "sums",
  average: "averages",
  weighted_average: "takes a weighted average of",
  percentage: "calculates the percentage of",
  latest: "uses the latest",
  formula: "calculates",
};

const dateFieldLabels: Record<string, string> = {
  createdAt: "created date",
  updatedAt: "updated date",
  dueDate: "due date",
  completedAt: "completed date",
  closingDate: "closing date",
  followUpDate: "follow-up date",
};

function formatFilterMap(filters?: Record<string, unknown> | null) {
  if (!filters) return "";
  return Object.entries(filters)
    .map(([field, value]) => {
      const rendered = Array.isArray(value) ? value.join(", ") : String(value);
      return `${field.replace(/_/g, " ")} = ${rendered}`;
    })
    .filter((part) => !part.endsWith("= "))
    .join("; ");
}

export function describeAutomaticCalculation(setup: {
  dataSource?: string | null;
  dateField?: string | null;
  calculation?: string | null;
  valueField?: string | null;
  weightField?: string | null;
  filters?: Record<string, unknown> | null;
  numeratorFilters?: Record<string, unknown> | null;
  denominatorFilters?: Record<string, unknown> | null;
  formulaExpression?: string | null;
  isCumulative?: boolean | null;
  cumulativeReset?: string | null;
}) {
  const source = sourceLabels[setup.dataSource ?? ""] ?? "approved SavvyOS records for the owner";
  const verb = calculationVerbs[setup.calculation ?? "count"] ?? "calculates";
  const dateLabel = dateFieldLabels[setup.dateField ?? ""] ?? "selected date";
  const valueField = setup.valueField ? ` ${setup.valueField}` : "";
  const weight = setup.calculation === "weighted_average" && setup.weightField ? ` weighted by ${setup.weightField}` : "";
  let text = `Automatically ${verb}${valueField} ${source} using the ${dateLabel} in the selected period${weight}.`;
  const filterText = formatFilterMap(setup.filters);
  if (filterText) text += ` Only records matching ${filterText} are included.`;
  if (setup.calculation === "percentage") {
    const numerator = formatFilterMap(setup.numeratorFilters);
    const denominator = formatFilterMap(setup.denominatorFilters);
    if (numerator) text += ` The numerator includes ${numerator}.`;
    if (denominator) text += ` The denominator includes ${denominator}.`;
  }
  if (setup.formulaExpression) text += ` The result is then combined with any manual inputs using ${setup.formulaExpression}.`;
  if (setup.isCumulative) {
    const reset = setup.cumulativeReset && setup.cumulativeReset !== "never" ? setup.cumulativeReset.replace(/_/g, " ") : "never";
    text += reset === "never" ? " Totals accumulate without resetting." : ` Totals accumulate and reset ${reset}.`;
  }
  return text;
}

export function describeMeasurableCalculation(metric: {
  metricType?: string | null;
  calculationDescription?: string | null;
  formulaExpression?: string | null;
  isCumulative?: boolean | null;
  cumulativeReset?: string | null;
}, autoConfig?: {
  dataSource?: string | null;
  dateField?: string | null;
  calculation?: string | null;
  valueField?: string | null;
  weightField?: string | null;
  filters?: Record<string, unknown> | null;
  numeratorFilters?: Record<string, unknown> | null;
  denominatorFilters?: Record<string, unknown> | null;
} | null) {
  if (metric.metricType === "automatic" || metric.metricType === "hybrid") {
    if (autoConfig) {
      return describeAutomaticCalculation({
        ...autoConfig,
        formulaExpression: metric.formulaExpression,
        isCumulative: metric.isCumulative,
        cumulativeReset: metric.cumulativeReset,
      });
    }
  }
  return (metric.calculationDescription ?? "").trim();
}

function periodNoun(metric: PeriodMetric) {
  const period = metric.measurementPeriod ?? metric.frequency ?? "weekly";
  if (period === "weekly") return "week";
  if (period === "monthly" || period === "month_to_date") return "month";
  if (period === "quarterly" || period === "quarter_to_date") return "quarter";
  if (period === "annually" || period === "year_to_date") return "year";
  return "week";
}

/**
 * Record icons appear only after four comparable reported periods. Ties and
 * missing weeks are ignored. The unique best week (direction-aware) is a
 * trophy; the unique worst week is the lowest-ever marker.
 */
export function periodToDatePerformance(values: ComparablePeriodValue[], metric: PeriodMetric & { performanceDirection?: string | null }) {
  const noun = periodNoun(metric);
  const reported = values.filter((value) => value.resultState === "reported" && value.actual != null && Number.isFinite(value.actual));
  const result = new Map<string | number, PeriodPerformanceMarker>();
  if (reported.length < RECORD_MARKER_MIN_WEEKS) return result;
  const actuals = reported.map((value) => value.actual as number);
  const bestValue = metric.performanceDirection === "lower" ? Math.min(...actuals) : Math.max(...actuals);
  const worstValue = metric.performanceDirection === "lower" ? Math.max(...actuals) : Math.min(...actuals);
  if (bestValue === worstValue) return result;
  const bestCount = reported.filter((value) => value.actual === bestValue).length;
  const worstCount = reported.filter((value) => value.actual === worstValue).length;
  for (const value of reported) {
    if (value.actual === bestValue && bestCount === 1) {
      result.set(value.id, { kind: "best", label: `Best ${noun} to date`, comparedPeriods: reported.length });
    } else if (value.actual === worstValue && worstCount === 1) {
      result.set(value.id, { kind: "worst", label: `Lowest ${noun} to date`, comparedPeriods: reported.length });
    }
  }
  return result;
}
