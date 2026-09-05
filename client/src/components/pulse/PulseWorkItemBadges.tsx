import { AlertTriangle, CheckCircle2, CircleDot, Clock3, Flag, Gauge, OctagonAlert, PauseCircle } from "lucide-react";

type BadgeProps = { value?: string | null; compact?: boolean; className?: string };

const priorityMeta: Record<string, { label: string; className: string }> = {
  low: { label: "Low", className: "border-slate-200 bg-slate-50 text-slate-700" },
  medium: { label: "Medium", className: "border-sky-200 bg-sky-50 text-sky-800" },
  high: { label: "High", className: "border-amber-200 bg-amber-50 text-amber-900" },
  urgent: { label: "Urgent", className: "border-rose-200 bg-rose-50 text-rose-800" },
};

const timeframeMeta: Record<string, { label: string; className: string; Icon: typeof Clock3 }> = {
  short_term: { label: "Short Term", className: "border-amber-200 bg-amber-50 text-amber-900", Icon: Clock3 },
  long_term: { label: "Long Term", className: "border-violet-200 bg-violet-50 text-violet-900", Icon: Gauge },
};

const statusMeta: Record<string, { label: string; className: string; Icon: typeof CircleDot }> = {
  not_started: { label: "Not Started", className: "border-slate-200 bg-slate-50 text-slate-700", Icon: CircleDot },
  in_progress: { label: "In Progress", className: "border-blue-200 bg-blue-50 text-blue-800", Icon: Clock3 },
  blocked: { label: "Blocked", className: "border-rose-200 bg-rose-50 text-rose-800", Icon: OctagonAlert },
  completed: { label: "Completed", className: "border-emerald-200 bg-emerald-50 text-emerald-800", Icon: CheckCircle2 },
  on_track: { label: "On Track", className: "border-emerald-200 bg-emerald-50 text-emerald-800", Icon: Gauge },
  at_risk: { label: "At Risk", className: "border-amber-200 bg-amber-50 text-amber-900", Icon: AlertTriangle },
  off_track: { label: "Off Track", className: "border-rose-200 bg-rose-50 text-rose-800", Icon: OctagonAlert },
  done: { label: "Done", className: "border-emerald-200 bg-emerald-50 text-emerald-800", Icon: CheckCircle2 },
  dropped: { label: "Dropped", className: "border-slate-200 bg-slate-100 text-slate-600", Icon: PauseCircle },
};

const base = "inline-flex items-center rounded-full border font-semibold whitespace-nowrap";

export function priorityBadgeClass(value?: string | null) {
  return priorityMeta[value ?? "medium"]?.className ?? priorityMeta.medium.className;
}

export function statusBadgeClass(value?: string | null) {
  return statusMeta[value ?? "not_started"]?.className ?? statusMeta.not_started.className;
}

export function priorityLabel(value?: string | null) {
  return priorityMeta[value ?? "medium"]?.label ?? priorityMeta.medium.label;
}

export function statusLabel(value?: string | null) {
  return statusMeta[value ?? "not_started"]?.label ?? statusMeta.not_started.label;
}

export function PulsePriorityBadge({ value, compact = false, className = "" }: BadgeProps) {
  const meta = priorityMeta[value ?? "medium"] ?? priorityMeta.medium;
  return <span className={`${base} ${meta.className} ${compact ? "gap-1 px-1.5 py-0.5 text-[11px]" : "gap-1.5 px-2 py-1 text-xs"} ${className}`} title={`Priority: ${meta.label}`}><Flag className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} aria-hidden="true" />{meta.label}</span>;
}

export function issueTimeframeLabel(value?: string | null) {
  return timeframeMeta[value ?? "short_term"]?.label ?? timeframeMeta.short_term.label;
}

export function PulseIssueTimeframeBadge({ value, compact = false, className = "" }: BadgeProps) {
  const meta = timeframeMeta[value ?? "short_term"] ?? timeframeMeta.short_term;
  const Icon = meta.Icon;
  return <span className={`${base} ${meta.className} ${compact ? "gap-1 px-1.5 py-0.5 text-[11px]" : "gap-1.5 px-2 py-1 text-xs"} ${className}`} title={`Issue timeframe: ${meta.label}`}><Icon className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} aria-hidden="true" />{meta.label}</span>;
}

export function PulseStatusBadge({ value, compact = false, className = "" }: BadgeProps) {
  const meta = statusMeta[value ?? "not_started"] ?? statusMeta.not_started;
  const Icon = meta.Icon;
  return <span className={`${base} ${meta.className} ${compact ? "gap-1 px-1.5 py-0.5 text-[11px]" : "gap-1.5 px-2 py-1 text-xs"} ${className}`} title={`Status: ${meta.label}`}><Icon className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} aria-hidden="true" />{meta.label}</span>;
}

export type IssueTimeframeFilterValue = "all" | "short_term" | "long_term";

export function PulseIssueTimeframeFilter({ value, onValueChange, className = "" }: { value: IssueTimeframeFilterValue; onValueChange: (value: IssueTimeframeFilterValue) => void; className?: string }) {
  const options: Array<{ value: IssueTimeframeFilterValue; label: string; className: string }> = [
    { value: "all", label: "All Issues", className: "border-slate-200 bg-slate-50 text-slate-700" },
    { value: "short_term", label: "Short Term", className: timeframeMeta.short_term.className },
    { value: "long_term", label: "Long Term", className: timeframeMeta.long_term.className },
  ];
  return <div className={`flex flex-wrap items-center gap-1.5 ${className}`} role="group" aria-label="Filter Issues by timeframe">{options.map((option) => <button key={option.value} type="button" onClick={() => onValueChange(option.value)} aria-pressed={value === option.value} className={`h-8 rounded-md border px-2.5 text-xs font-semibold transition-colors ${value === option.value ? option.className : "border-border bg-background text-muted-foreground hover:bg-muted"}`}>{option.label}</button>)}</div>;
}
