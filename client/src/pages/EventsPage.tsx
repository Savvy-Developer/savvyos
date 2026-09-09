import { useMemo, useRef, useState } from "react";
import {
  format,
  isValid,
  parseISO,
  startOfMonth,
  addMonths,
  differenceInCalendarDays,
} from "date-fns";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  ExternalLink,
  Loader2,
  Plus,
  RefreshCw,
  Settings2,
  ShieldAlert,
  Trash2,
  UsersRound,
} from "lucide-react";

type EventRecord = any;
type SponsorRecord = any;
type Overview = any;

const TIER_OPTIONS = [
  ["1", "Tier 1: Executed"],
  ["2", "Tier 2: Managed"],
  ["3", "Tier 3: Attended or sponsored"],
  ["4", "Tier 4: Under evaluation"],
] as const;
const STATUS_OPTIONS = [
  "Idea",
  "Approved",
  "Contracted",
  "In build",
  "Selling",
  "Signed",
  "Committed",
  "Not started",
  "Date unconfirmed",
  "Date TBD",
  "Decision live",
  "Evaluating",
  "Conflict",
  "Pivoting",
  "Closed",
];
const SHARE_STATUS_OPTIONS = [
  ["not_agreed", "Not agreed"],
  ["verbal", "Verbal"],
  ["written", "Written"],
] as const;
const ASK_STAGE_OPTIONS = [
  ["signed", "Signed"],
  ["invoiced", "Invoiced"],
  ["verbal", "Verbal"],
  ["proposed", "Proposed"],
  ["target", "Target"],
  ["partner", "Cost share"],
  ["speaker", "Speaker"],
] as const;
const HEADCOUNT_SOURCES = [
  "Swoogo: Agent",
  "Swoogo: Speaker",
  "Swoogo: Sponsor",
  "Swoogo: Staff",
  "Swoogo: Guest",
  "Manual",
  "Organizer",
];

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function money(value: unknown) {
  const parsed = asNumber(value);
  return parsed === null
    ? "—"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
      }).format(parsed);
}

function dateValue(value: unknown) {
  if (!value) return null;
  const parsed =
    typeof value === "string"
      ? parseISO(value.slice(0, 10))
      : new Date(value as string);
  return isValid(parsed) ? parsed : null;
}

function dateLabel(value: unknown, includeYear = true) {
  const parsed = dateValue(value);
  return parsed ? format(parsed, includeYear ? "MMM d, yyyy" : "MMM d") : "—";
}

function daysUntil(value: unknown) {
  const parsed = dateValue(value);
  return parsed ? differenceInCalendarDays(parsed, new Date()) : null;
}

function tierLabel(tier: number) {
  return (
    TIER_OPTIONS.find(([value]) => Number(value) === Number(tier))?.[1] ??
    `Tier ${tier}`
  );
}

function stageClass(stage: string | null | undefined) {
  const classes: Record<string, string> = {
    signed: "border-emerald-200 bg-emerald-50 text-emerald-700",
    invoiced: "border-amber-200 bg-amber-50 text-amber-700",
    verbal: "border-orange-200 bg-orange-50 text-orange-700",
    proposed: "border-slate-200 bg-slate-50 text-slate-700",
    target: "border-dashed border-slate-300 bg-white text-slate-500",
    partner: "border-violet-200 bg-violet-50 text-violet-700",
    speaker: "border-cyan-200 bg-cyan-50 text-cyan-700",
  };
  return classes[stage ?? ""] ?? "border-slate-200 bg-slate-50 text-slate-700";
}

function tierClass(tier: number) {
  return (
    (
      {
        1: "bg-cyan-400 text-slate-950",
        2: "bg-slate-900 text-white",
        3: "bg-violet-600 text-white",
        4: "border border-dashed border-slate-400 bg-white text-slate-500",
      } as Record<number, string>
    )[tier] ?? "bg-slate-100 text-slate-700"
  );
}

function deadlineTone(value: unknown) {
  const days = daysUntil(value);
  if (days !== null && days <= 30) return "border-l-rose-500";
  if (days !== null && days <= 90) return "border-l-amber-500";
  return "border-l-cyan-600";
}

function InlineText({
  value,
  onSave,
  placeholder = "Not set",
  className = "",
  multiline = false,
  ariaLabel,
}: {
  value: string | null | undefined;
  onSave: (value: string | null) => void;
  placeholder?: string;
  className?: string;
  multiline?: boolean;
  ariaLabel: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const start = () => {
    setDraft(value ?? "");
    setEditing(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  };
  const commit = () => {
    const next = draft.trim() || null;
    setEditing(false);
    if (next !== (value ?? null)) onSave(next);
  };
  const cancel = () => {
    setDraft(value ?? "");
    setEditing(false);
  };
  if (editing) {
    const props = {
      ref: inputRef as any,
      value: draft,
      onChange: (
        event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
      ) => setDraft(event.target.value),
      onBlur: commit,
      onKeyDown: (
        event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>
      ) => {
        if (event.key === "Escape") {
          event.preventDefault();
          cancel();
        }
        if (!multiline && event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
      },
      "aria-label": ariaLabel,
      className: multiline ? "min-h-20 w-full text-sm" : "h-8 min-w-24 text-sm",
    };
    return multiline ? (
      <Textarea {...(props as any)} />
    ) : (
      <Input {...(props as any)} />
    );
  }
  return (
    <button
      type="button"
      onClick={start}
      onKeyDown={event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          start();
        }
      }}
      className={`inline rounded px-1 -mx-1 text-left hover:bg-cyan-50 hover:ring-1 hover:ring-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 ${value ? "" : "italic text-muted-foreground"} ${className}`}
      aria-label={`Edit ${ariaLabel}`}
    >
      {value || placeholder}
    </button>
  );
}

function InlineNumber({
  value,
  onSave,
  placeholder = "Not set",
  prefix = "",
  suffix = "",
  className = "",
  ariaLabel,
}: {
  value: number | string | null | undefined;
  onSave: (value: number | null) => void;
  placeholder?: string;
  prefix?: string;
  suffix?: string;
  className?: string;
  ariaLabel: string;
}) {
  const numeric = asNumber(value);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(numeric === null ? "" : String(numeric));
  const inputRef = useRef<HTMLInputElement>(null);
  const start = () => {
    setDraft(numeric === null ? "" : String(numeric));
    setEditing(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  };
  const commit = () => {
    const next = draft.trim() === "" ? null : Number(draft);
    if (next !== null && (!Number.isFinite(next) || next < 0)) {
      toast.error("Enter a non-negative number or clear the value.");
      inputRef.current?.focus();
      return;
    }
    setEditing(false);
    if (next !== numeric) onSave(next);
  };
  if (editing)
    return (
      <Input
        ref={inputRef}
        type="number"
        min="0"
        step="0.01"
        value={draft}
        onChange={event => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={event => {
          if (event.key === "Escape") {
            setDraft(numeric === null ? "" : String(numeric));
            setEditing(false);
          }
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
        aria-label={ariaLabel}
        className="h-8 min-w-20 text-right text-sm"
      />
    );
  const text =
    numeric === null
      ? placeholder
      : `${prefix}${numeric.toLocaleString("en-US", { maximumFractionDigits: 2 })}${suffix}`;
  return (
    <button
      type="button"
      onClick={start}
      className={`inline rounded px-1 -mx-1 text-right tabular-nums hover:bg-cyan-50 hover:ring-1 hover:ring-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 ${numeric === null ? "italic text-muted-foreground" : ""} ${className}`}
      aria-label={`Edit ${ariaLabel}`}
    >
      {text}
    </button>
  );
}

function InlineDate({
  value,
  onSave,
  placeholder = "Set date",
  ariaLabel,
}: {
  value: string | null | undefined;
  onSave: (value: string | null) => void;
  placeholder?: string;
  ariaLabel: string;
}) {
  const iso = value ? String(value).slice(0, 10) : "";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(iso);
  const inputRef = useRef<HTMLInputElement>(null);
  const start = () => {
    setDraft(iso);
    setEditing(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  };
  const commit = () => {
    setEditing(false);
    const next = draft || null;
    if (next !== (iso || null)) onSave(next);
  };
  if (editing)
    return (
      <Input
        ref={inputRef}
        type="date"
        value={draft}
        onChange={event => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={event => {
          if (event.key === "Escape") {
            setDraft(iso);
            setEditing(false);
          }
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
        aria-label={ariaLabel}
        className="h-8 w-36 text-sm"
      />
    );
  return (
    <button
      type="button"
      onClick={start}
      className={`inline rounded px-1 -mx-1 text-left hover:bg-cyan-50 hover:ring-1 hover:ring-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 ${iso ? "" : "italic text-muted-foreground"}`}
      aria-label={`Edit ${ariaLabel}`}
    >
      {iso ? dateLabel(iso) : placeholder}
    </button>
  );
}

function InlineSelect({
  value,
  options,
  onSave,
  placeholder = "Not set",
  className = "",
  ariaLabel,
}: {
  value: string | number | null | undefined;
  options: readonly (readonly [string, string])[];
  onSave: (value: string) => void;
  placeholder?: string;
  className?: string;
  ariaLabel: string;
}) {
  const normalized = value === null || value === undefined ? "" : String(value);
  return (
    <Select
      value={normalized || "__empty"}
      onValueChange={next => onSave(next === "__empty" ? "" : next)}
    >
      <SelectTrigger
        aria-label={ariaLabel}
        className={`h-7 w-auto max-w-52 border-transparent bg-transparent px-1 py-0 shadow-none hover:border-cyan-200 hover:bg-cyan-50 focus:ring-cyan-500 ${className}`}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__empty">{placeholder}</SelectItem>
        {options.map(([optionValue, label]) => (
          <SelectItem key={optionValue} value={optionValue}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function DeleteButton({
  label,
  onDelete,
  disabled = false,
}: {
  label: string;
  onDelete: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8 text-muted-foreground hover:bg-rose-50 hover:text-rose-600"
      onClick={onDelete}
      disabled={disabled}
      aria-label={`Delete ${label}`}
      title={`Delete ${label}`}
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  );
}

function Metric({
  value,
  label,
  detail,
  tone = "default",
}: {
  value: string | number;
  label: string;
  detail: string;
  tone?: "default" | "warning" | "danger";
}) {
  const color =
    tone === "danger"
      ? "text-rose-600"
      : tone === "warning"
        ? "text-amber-700"
        : "text-slate-950";
  return (
    <div className="bg-card p-4">
      <p
        className={`text-2xl font-semibold tracking-tight tabular-nums ${color}`}
      >
        {value}
      </p>
      <p className="mt-1 text-sm font-medium">{label}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        {detail}
      </p>
    </div>
  );
}

function HeadcountCard({
  event,
  updateEvent,
  updateComponent,
  deleteComponent,
  addComponent,
}: {
  event: EventRecord;
  updateEvent: (patch: any) => void;
  updateComponent: (component: any, patch: any) => void;
  deleteComponent: (component: any) => void;
  addComponent: (eventId: number) => void;
}) {
  const components = event.components ?? [];
  const missing = components.filter(
    (component: any) => asNumber(component.count) === null
  ).length;
  const total = missing
    ? null
    : components.reduce(
        (sum: number, component: any) => sum + (asNumber(component.count) ?? 0),
        0
      );
  const guarantee = asNumber((event as any).headcountGuarantee);
  const difference =
    total !== null && guarantee !== null ? total - guarantee : null;
  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b bg-slate-50/70 pb-4">
        <CardTitle className="text-base">{event.name} headcount</CardTitle>
        <CardDescription>
          <InlineText
            value={event.notes}
            onSave={notes => updateEvent({ notes })}
            multiline
            ariaLabel={`${event.name} headcount note`}
            placeholder="Add the headcount context"
          />
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="grid divide-y sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-3">
          {components.map((component: any) => (
            <div key={component.id} className="group relative min-h-32 p-4">
              <DeleteButton
                label={component.label}
                onDelete={() => deleteComponent(component)}
              />
              <div
                className={`text-2xl font-semibold tabular-nums ${asNumber(component.count) === null ? "text-rose-600" : ""}`}
              >
                <InlineNumber
                  value={component.count}
                  onSave={count => updateComponent(component, { count })}
                  placeholder="Not counted"
                  ariaLabel={`${component.label} count`}
                />
              </div>
              <p className="mt-1 text-sm font-medium">
                <InlineText
                  value={component.label}
                  onSave={label => {
                    if (label) updateComponent(component, { label });
                  }}
                  ariaLabel="headcount component label"
                />
              </p>
              <div className="mt-2">
                <InlineSelect
                  value={component.sourceType}
                  options={HEADCOUNT_SOURCES.map(
                    source => [source, source] as const
                  )}
                  onSave={sourceType =>
                    updateComponent(component, { sourceType })
                  }
                  ariaLabel={`${component.label} source`}
                />
              </div>
            </div>
          ))}
          <button
            type="button"
            className="min-h-32 p-4 text-left text-sm font-medium text-cyan-700 hover:bg-cyan-50"
            onClick={() => addComponent(event.id)}
          >
            <Plus className="mb-2 h-4 w-4" />
            Add component
          </button>
        </div>
        <div className="grid border-t bg-slate-100/70 sm:grid-cols-3">
          <div className="p-4">
            <p
              className={`text-lg font-semibold ${total === null ? "text-rose-600" : ""}`}
            >
              {total === null ? "Cannot compute" : total}
            </p>
            <p className="text-xs text-muted-foreground">
              {total === null
                ? `${missing} component${missing === 1 ? "" : "s"} uncounted`
                : "Contracted total"}
            </p>
          </div>
          <div className="p-4">
            <p className="text-lg font-semibold">
              <InlineNumber
                value={event.headcountGuarantee}
                onSave={headcountGuarantee =>
                  updateEvent({ headcountGuarantee })
                }
                placeholder="Set"
                ariaLabel={`${event.name} headcount guarantee`}
              />
            </p>
            <p className="text-xs text-muted-foreground">Guarantee</p>
          </div>
          <div className="p-4">
            <p
              className={`text-lg font-semibold ${difference !== null && difference > 0 ? "text-rose-600" : ""}`}
            >
              {difference === null
                ? "—"
                : `${difference > 0 ? "+" : ""}${difference}`}
            </p>
            <p className="text-xs text-muted-foreground">Against guarantee</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Timeline({
  events,
  onDelete,
}: {
  events: EventRecord[];
  onDelete: (event: EventRecord) => void;
}) {
  const first = useMemo(
    () =>
      events
        .filter(event => dateValue(event.startDate))
        .map(event => dateValue(event.startDate)!)
        .sort((a, b) => a.getTime() - b.getTime())[0] ?? new Date(),
    [events]
  );
  const last = useMemo(
    () =>
      events
        .filter(event => dateValue(event.endDate ?? event.startDate))
        .map(event => dateValue(event.endDate ?? event.startDate)!)
        .sort((a, b) => b.getTime() - a.getTime())[0] ??
      addMonths(new Date(), 6),
    [events]
  );
  const [anchor, setAnchor] = useState(startOfMonth(first));
  const [months, setMonths] = useState(12);
  const windowStart = startOfMonth(anchor);
  const windowEnd = addMonths(windowStart, months);
  const rangeDays = Math.max(
    1,
    differenceInCalendarDays(windowEnd, windowStart)
  );
  const monthLabels = Array.from({ length: months }, (_, index) =>
    addMonths(windowStart, index)
  );
  const inWindow = events.filter(event => {
    const start = dateValue(event.startDate);
    const end = dateValue(event.endDate ?? event.startDate);
    return start && end && end >= windowStart && start < windowEnd;
  });
  const undated = events.filter(event => !dateValue(event.startDate));
  const rangeLabel = `${format(windowStart, "MMMM yyyy")} to ${format(addMonths(windowEnd, -1), "MMMM yyyy")}`;
  return (
    <div className="space-y-5">
      <Card className="overflow-hidden">
        <CardHeader className="flex-row flex-wrap items-end justify-between gap-4 border-b pb-4">
          <div>
            <CardTitle className="text-base">Portfolio timeline</CardTitle>
            <CardDescription>
              Grouped by operating tier. Click directly in the Events table to
              edit a record.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() =>
                setAnchor(
                  addMonths(anchor, -Math.max(1, Math.floor(months / 2)))
                )
              }
              aria-label="Earlier timeline"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAnchor(startOfMonth(new Date()))}
            >
              Today
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() =>
                setAnchor(
                  addMonths(anchor, Math.max(1, Math.floor(months / 2)))
                )
              }
              aria-label="Later timeline"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Select
              value={String(months)}
              onValueChange={value => setMonths(Number(value))}
            >
              <SelectTrigger className="h-9 w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[6, 12, 18, 24, 36].map(value => (
                  <SelectItem key={value} value={String(value)}>
                    {value} months
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto p-5">
          <div className="min-w-[860px]">
            <div
              className="mb-3 grid border-b pb-2 text-xs text-muted-foreground"
              style={{
                gridTemplateColumns: `repeat(${months}, minmax(0, 1fr))`,
              }}
            >
              {monthLabels.map(month => (
                <div
                  key={month.toISOString()}
                  className="border-l px-1 first:border-l-0"
                >
                  {format(month, months > 18 ? "MMM yy" : "MMM yyyy")}
                </div>
              ))}
            </div>
            <p className="mb-3 text-sm font-medium">{rangeLabel}</p>
            {[1, 2, 3, 4].map(tier => {
              const tierEvents = inWindow.filter(
                event => Number(event.tier) === tier
              );
              if (!tierEvents.length) return null;
              return (
                <div key={tier} className="mb-5">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {tierLabel(tier)}
                  </p>
                  {tierEvents.map(event => {
                    const start = dateValue(event.startDate)!;
                    const end = dateValue(event.endDate ?? event.startDate)!;
                    const rawLeft =
                      (differenceInCalendarDays(start, windowStart) /
                        rangeDays) *
                      100;
                    const rawRight =
                      (differenceInCalendarDays(end, windowStart) / rangeDays) *
                      100;
                    const left = Math.max(0, rawLeft);
                    const width = Math.max(1.5, Math.min(100, rawRight) - left);
                    return (
                      <div
                        key={event.id}
                        className="relative mb-2 h-9 rounded bg-slate-50"
                      >
                        <div
                          className={`absolute top-1.5 flex h-6 items-center rounded px-2 text-xs font-semibold ${tierClass(tier)}`}
                          style={{ left: `${left}%`, width: `${width}%` }}
                          title={`${event.name}: ${dateLabel(event.startDate)} to ${dateLabel(event.endDate ?? event.startDate)}`}
                        >
                          {width > 10 ? event.name : ""}
                        </div>
                        <span
                          className="absolute top-2 text-xs font-medium"
                          style={{ left: `${Math.min(92, left + width + 1)}%` }}
                        >
                          {event.name}
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Not on the timeline yet</CardTitle>
          <CardDescription>
            These records remain visible without pretending their dates are
            known.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {undated.length ? (
            <ul className="space-y-3">
              {undated.map(event => (
                <li
                  key={event.id}
                  className="flex items-start justify-between gap-3 rounded-lg border p-3"
                >
                  <div>
                    <p className="font-medium">{event.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {event.status} · {event.city || "Location not set"}
                    </p>
                  </div>
                  <DeleteButton
                    label={event.name}
                    onDelete={() => onDelete(event)}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              Every event has a confirmed start date.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Radar({
  events,
  alerts,
  updateObligation,
  deleteObligation,
  addObligation,
}: {
  events: EventRecord[];
  alerts: any[];
  updateObligation: (obligation: any, patch: any) => void;
  deleteObligation: (obligation: any) => void;
  addObligation: (eventId: number) => void;
}) {
  const obligations = events.flatMap(event =>
    (event.obligations ?? []).map((obligation: any) => ({
      ...obligation,
      event,
    }))
  );
  const upcoming = obligations
    .filter(obligation => (daysUntil(obligation.dueDate) ?? -1) >= 0)
    .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
  const undatedOrPast = obligations.filter(
    obligation => (daysUntil(obligation.dueDate) ?? -1) < 0
  );
  const months = Array.from({ length: 6 }, (_, index) =>
    addMonths(startOfMonth(new Date()), index)
  );
  const eventOptions = events.map(
    event => [String(event.id), event.name] as const
  );
  return (
    <div className="space-y-6">
      <section>
        <div className="mb-3">
          <h2 className="text-lg font-semibold">What expires next</h2>
          <p className="text-sm text-muted-foreground">
            Every dated obligation across the portfolio, sorted by how soon it
            bites. Amount is what is owed or lost if the date passes unhandled.
          </p>
        </div>
        <div className="grid overflow-hidden rounded-xl border bg-border sm:grid-cols-2 xl:grid-cols-6">
          {months.map(month => {
            const monthItems = upcoming.filter(item => {
              const due = dateValue(item.dueDate);
              return (
                due &&
                due.getFullYear() === month.getFullYear() &&
                due.getMonth() === month.getMonth()
              );
            });
            const payable = monthItems
              .filter(item => item.isPayable)
              .reduce(
                (sum, item) => sum + (asNumber(item.amountAtRisk) ?? 0),
                0
              );
            return (
              <div key={month.toISOString()} className="min-h-44 bg-card p-3">
                <p className="font-semibold">{format(month, "MMMM")}</p>
                <p className="mb-3 text-xs text-muted-foreground">
                  {monthItems.length
                    ? `${monthItems.length} date${monthItems.length === 1 ? "" : "s"}${payable ? ` · ${money(payable)} payable` : " · nothing quantified"}`
                    : "Clear"}
                </p>
                {monthItems.length ? (
                  monthItems.map(item => (
                    <div
                      key={item.id}
                      className={`mb-2 border-l-4 pl-2 ${deadlineTone(item.dueDate)}`}
                    >
                      <p className="text-xs text-muted-foreground">
                        {dateLabel(item.dueDate, false)}
                      </p>
                      <p className="text-sm font-medium leading-tight">
                        {item.title}
                      </p>
                      <p className="mt-0.5 text-xs font-semibold">
                        {asNumber(item.amountAtRisk) === null
                          ? item.amountNote || "Unquantified"
                          : money(item.amountAtRisk)}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No dated obligations.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>
      <section>
        <h2 className="mb-3 text-lg font-semibold">Open conflicts</h2>
        <div className="grid gap-3">
          {alerts.map(alert => (
            <Card
              key={alert.id}
              className={`border-l-4 ${alert.level === "blocking" ? "border-l-rose-500" : "border-l-amber-500"}`}
            >
              <CardContent className="p-4">
                <Badge
                  variant="outline"
                  className={
                    alert.level === "blocking"
                      ? "border-rose-200 bg-rose-50 text-rose-700"
                      : "border-amber-200 bg-amber-50 text-amber-700"
                  }
                >
                  {alert.level === "blocking" ? "Blocking" : "Warning"}
                </Badge>
                <h3 className="mt-2 font-semibold">{alert.title}</h3>
                {alert.body && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {alert.body}
                  </p>
                )}
                {alert.secondaryBody && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {alert.secondaryBody}
                  </p>
                )}
                {alert.source && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Source: {alert.source}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Deadline queue</h2>
            <p className="text-sm text-muted-foreground">
              Click a value to edit it. Changes save when you press Enter, Tab,
              or leave the value.
            </p>
          </div>
          <Select onValueChange={eventId => addObligation(Number(eventId))}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Add obligation" />
            </SelectTrigger>
            <SelectContent>
              {eventOptions.map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  For {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Card>
          <CardContent className="divide-y p-0">
            {[...upcoming, ...undatedOrPast].map(item => (
              <div
                key={item.id}
                className={`grid gap-3 border-l-4 p-4 md:grid-cols-[120px_minmax(0,1fr)_180px_40px] ${deadlineTone(item.dueDate)}`}
              >
                <div>
                  <InlineDate
                    value={item.dueDate}
                    onSave={dueDate => updateObligation(item, { dueDate })}
                    ariaLabel={`${item.title} due date`}
                  />
                  <p className="text-xs text-muted-foreground">
                    {daysUntil(item.dueDate) === null
                      ? "Undated"
                      : daysUntil(item.dueDate)! < 0
                        ? `${Math.abs(daysUntil(item.dueDate)!)} days ago`
                        : `${daysUntil(item.dueDate)} days`}
                  </p>
                </div>
                <div>
                  <p className="font-medium">
                    <InlineText
                      value={item.title}
                      onSave={title => {
                        if (title) updateObligation(item, { title });
                      }}
                      ariaLabel="obligation title"
                    />
                  </p>
                  <div className="mt-1">
                    <InlineSelect
                      value={item.eventId}
                      options={eventOptions}
                      onSave={eventId =>
                        updateObligation(item, { eventId: Number(eventId) })
                      }
                      ariaLabel="obligation event"
                    />
                  </div>
                  <div className="mt-1">
                    <InlineText
                      value={item.consequence}
                      onSave={consequence =>
                        updateObligation(item, { consequence })
                      }
                      multiline
                      ariaLabel={`${item.title} consequence`}
                      placeholder="Describe the consequence"
                    />
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold">
                    <InlineNumber
                      value={item.amountAtRisk}
                      onSave={amountAtRisk =>
                        updateObligation(item, { amountAtRisk })
                      }
                      prefix="$"
                      ariaLabel={`${item.title} amount at risk`}
                    />
                  </p>
                  <p className="mt-1 text-xs">
                    <InlineText
                      value={item.amountNote}
                      onSave={amountNote =>
                        updateObligation(item, { amountNote })
                      }
                      ariaLabel={`${item.title} amount label`}
                      placeholder="Add amount label"
                    />
                  </p>
                  <div className="mt-2">
                    <InlineSelect
                      value={item.isPayable ? "yes" : "no"}
                      options={[
                        ["yes", "Payable"],
                        ["no", "Not payable"],
                      ]}
                      onSave={value =>
                        updateObligation(item, { isPayable: value === "yes" })
                      }
                      ariaLabel={`${item.title} payment status`}
                    />
                  </div>
                </div>
                <DeleteButton
                  label={item.title}
                  onDelete={() => deleteObligation(item)}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function SponsorGrid({
  events,
  sponsors,
  claims,
  unaffiliated,
  updateSponsor,
  deleteSponsor,
  upsertAsk,
  deleteAsk,
  createSponsor,
  updateClaim,
  deleteClaim,
  createClaim,
  updateUnaffiliated,
  deleteUnaffiliated,
  createUnaffiliated,
}: {
  events: EventRecord[];
  sponsors: SponsorRecord[];
  claims: any[];
  unaffiliated: any[];
  updateSponsor: (sponsor: any, patch: any) => void;
  deleteSponsor: (sponsor: any) => void;
  upsertAsk: (sponsor: any, event: any, ask: any, patch: any) => void;
  deleteAsk: (ask: any) => void;
  createSponsor: () => void;
  updateClaim: (claim: any, patch: any) => void;
  deleteClaim: (claim: any) => void;
  createClaim: () => void;
  updateUnaffiliated: (contact: any, patch: any) => void;
  deleteUnaffiliated: (contact: any) => void;
  createUnaffiliated: () => void;
}) {
  const matrixEvents = events.filter(event => Number(event.tier) < 4);
  const eventOptions = events.map(
    event => [String(event.id), event.name] as const
  );
  return (
    <div className="space-y-8">
      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">
              Who we are asking, and for how much
            </h2>
            <p className="text-sm text-muted-foreground">
              The annual total is what one company is being asked for across the
              active portfolio.
            </p>
          </div>
          <Button size="sm" onClick={createSponsor}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add sponsor
          </Button>
        </div>
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-sm">
              <thead className="bg-slate-950 text-left text-xs uppercase tracking-wide text-slate-100">
                <tr>
                  <th className="px-3 py-3">Company</th>
                  <th className="px-3 py-3">Category</th>
                  {matrixEvents.map(event => (
                    <th key={event.id} className="px-3 py-3 text-right">
                      {event.name}
                    </th>
                  ))}
                  <th className="px-3 py-3 text-right">Annual ask</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {sponsors.map(sponsor => {
                  const total = (sponsor.asks ?? []).reduce(
                    (sum: number, ask: any) =>
                      sum + (asNumber(ask.amount) ?? 0),
                    0
                  );
                  return (
                    <tr
                      key={sponsor.id}
                      className="border-b align-top hover:bg-slate-50"
                    >
                      <td className="px-3 py-3 font-medium">
                        <InlineText
                          value={sponsor.companyName}
                          onSave={companyName => {
                            if (companyName)
                              updateSponsor(sponsor, { companyName });
                          }}
                          ariaLabel="sponsor company"
                        />
                        <p className="mt-1 text-xs font-normal text-muted-foreground">
                          <InlineText
                            value={sponsor.contactName}
                            onSave={contactName =>
                              updateSponsor(sponsor, { contactName })
                            }
                            ariaLabel={`${sponsor.companyName} contact`}
                            placeholder="Add contact"
                          />
                        </p>
                      </td>
                      <td className="px-3 py-3">
                        <InlineText
                          value={sponsor.category}
                          onSave={category =>
                            updateSponsor(sponsor, { category })
                          }
                          ariaLabel={`${sponsor.companyName} category`}
                          placeholder="Add category"
                        />
                        <p className="mt-1 max-w-48 text-xs text-muted-foreground">
                          <InlineText
                            value={sponsor.notes}
                            onSave={notes => updateSponsor(sponsor, { notes })}
                            multiline
                            ariaLabel={`${sponsor.companyName} note`}
                            placeholder="Add note"
                          />
                        </p>
                      </td>
                      {matrixEvents.map(event => {
                        const ask = (sponsor.asks ?? []).find(
                          (candidate: any) => candidate.eventId === event.id
                        );
                        return (
                          <td key={event.id} className="px-3 py-3 text-right">
                            <div className="flex flex-col items-end gap-1">
                              {ask ? (
                                <>
                                  <InlineNumber
                                    value={ask.amount}
                                    onSave={amount =>
                                      upsertAsk(sponsor, event, ask, { amount })
                                    }
                                    prefix="$"
                                    ariaLabel={`${sponsor.companyName} ask for ${event.name}`}
                                  />
                                  <InlineSelect
                                    value={ask.stage}
                                    options={ASK_STAGE_OPTIONS}
                                    onSave={stage =>
                                      upsertAsk(sponsor, event, ask, { stage })
                                    }
                                    className={`border ${stageClass(ask.stage)}`}
                                    ariaLabel={`${sponsor.companyName} stage for ${event.name}`}
                                  />
                                  <button
                                    type="button"
                                    className="text-xs text-rose-600 hover:underline"
                                    onClick={() => deleteAsk(ask)}
                                  >
                                    Remove
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  className="text-xs text-cyan-700 hover:underline"
                                  onClick={() =>
                                    upsertAsk(sponsor, event, null, {
                                      amount: null,
                                      stage: "proposed",
                                    })
                                  }
                                >
                                  Add
                                </button>
                              )}
                            </div>
                          </td>
                        );
                      })}
                      <td className="px-3 py-3 text-right font-semibold tabular-nums">
                        {total ? money(total) : "—"}
                      </td>
                      <td>
                        <DeleteButton
                          label={sponsor.companyName}
                          onDelete={() => deleteSponsor(sponsor)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-slate-100 font-semibold">
                <tr>
                  <td colSpan={2} className="px-3 py-3">
                    Committed and proposed by event
                  </td>
                  {matrixEvents.map(event => (
                    <td
                      key={event.id}
                      className="px-3 py-3 text-right tabular-nums"
                    >
                      {money(
                        sponsors.reduce(
                          (sum: number, sponsor: any) =>
                            sum +
                            (asNumber(
                              (sponsor.asks ?? []).find(
                                (ask: any) => ask.eventId === event.id
                              )?.amount
                            ) ?? 0),
                          0
                        )
                      )}
                    </td>
                  ))}
                  <td className="px-3 py-3 text-right tabular-nums">
                    {money(
                      sponsors.reduce(
                        (sum: number, sponsor: any) =>
                          sum +
                          (sponsor.asks ?? []).reduce(
                            (row: number, ask: any) =>
                              row + (asNumber(ask.amount) ?? 0),
                            0
                          ),
                        0
                      )
                    )}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      </section>
      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Category exclusivity</h2>
            <p className="text-sm text-muted-foreground">
              Claims are local to one event. A claim at Savvy Summit never
              blocks another event.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={createClaim}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add claim
          </Button>
        </div>
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-slate-950 text-left text-xs uppercase tracking-wide text-slate-100">
                <tr>
                  <th className="px-3 py-3">Category</th>
                  <th className="px-3 py-3">Event</th>
                  <th className="px-3 py-3">Claimed by</th>
                  <th className="px-3 py-3">In writing</th>
                  <th className="px-3 py-3">Roster at this event</th>
                  <th className="px-3 py-3">Notes</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {claims.map(claim => {
                  const claimedName =
                    claim.sponsor?.companyName ??
                    claim.holderName ??
                    "Unclaimed";
                  const roster = sponsors.filter(
                    sponsor =>
                      sponsor.category?.toLowerCase() ===
                        claim.category?.toLowerCase() &&
                      (sponsor.asks ?? []).some(
                        (ask: any) => ask.eventId === claim.eventId
                      )
                  );
                  const conflict =
                    claimedName !== "Unclaimed" &&
                    roster.some(sponsor => sponsor.companyName !== claimedName);
                  return (
                    <tr
                      key={claim.id}
                      className={`border-b align-top ${conflict || (!claim.isWritten && claimedName !== "Unclaimed") ? "bg-rose-50/50" : ""}`}
                    >
                      <td className="px-3 py-3 font-medium">
                        <InlineText
                          value={claim.category}
                          onSave={category => {
                            if (category) updateClaim(claim, { category });
                          }}
                          ariaLabel="claim category"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <InlineSelect
                          value={claim.eventId}
                          options={eventOptions}
                          onSave={eventId =>
                            updateClaim(claim, { eventId: Number(eventId) })
                          }
                          ariaLabel={`${claim.category} claim event`}
                        />
                      </td>
                      <td className="px-3 py-3">
                        <InlineText
                          value={
                            claimedName === "Unclaimed" ? null : claimedName
                          }
                          onSave={holderName =>
                            updateClaim(claim, { holderName, sponsorId: null })
                          }
                          ariaLabel={`${claim.category} holder`}
                          placeholder="Unclaimed"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <InlineSelect
                          value={claim.isWritten ? "yes" : "no"}
                          options={[
                            ["yes", "Yes"],
                            ["no", "No"],
                          ]}
                          onSave={value =>
                            updateClaim(claim, { isWritten: value === "yes" })
                          }
                          ariaLabel={`${claim.category} written status`}
                          className={`border ${claim.isWritten ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}
                        />
                      </td>
                      <td className="max-w-64 px-3 py-3">
                        {roster.length ? (
                          roster.map(sponsor => (
                            <span
                              key={sponsor.id}
                              className={`mr-1 ${sponsor.companyName === claimedName ? "font-semibold text-cyan-800" : conflict ? "font-medium text-rose-700" : ""}`}
                            >
                              {sponsor.companyName}
                            </span>
                          ))
                        ) : (
                          <span className="text-muted-foreground">
                            Nobody yet
                          </span>
                        )}
                        {conflict && (
                          <p className="mt-1 text-xs text-rose-700">
                            Exclusivity is claimed here while another sponsor in
                            the category has an ask.
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">
                        <InlineText
                          value={claim.notes}
                          onSave={notes => updateClaim(claim, { notes })}
                          multiline
                          ariaLabel={`${claim.category} claim notes`}
                          placeholder="Add note"
                        />
                      </td>
                      <td>
                        <DeleteButton
                          label={`${claim.category} claim`}
                          onDelete={() => deleteClaim(claim)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </section>
      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">
              Contacts with no current affiliation
            </h2>
            <p className="text-sm text-muted-foreground">
              Kept separate so these prospects stay findable without entering
              sponsor totals.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={createUnaffiliated}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add contact
          </Button>
        </div>
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
              <thead className="bg-slate-950 text-left text-xs uppercase tracking-wide text-slate-100">
                <tr>
                  <th className="px-3 py-3">Company</th>
                  <th className="px-3 py-3">Category</th>
                  <th className="px-3 py-3">Contact</th>
                  <th className="px-3 py-3">Standing</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {unaffiliated.map(contact => (
                  <tr key={contact.id} className="border-b align-top">
                    <td className="px-3 py-3 font-medium">
                      <InlineText
                        value={contact.companyName}
                        onSave={companyName => {
                          if (companyName)
                            updateUnaffiliated(contact, { companyName });
                        }}
                        ariaLabel="unaffiliated company"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <InlineText
                        value={contact.category}
                        onSave={category =>
                          updateUnaffiliated(contact, { category })
                        }
                        ariaLabel={`${contact.companyName} category`}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <InlineText
                        value={contact.contactName}
                        onSave={contactName =>
                          updateUnaffiliated(contact, { contactName })
                        }
                        ariaLabel={`${contact.companyName} contact`}
                      />
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">
                      <InlineText
                        value={contact.notes}
                        onSave={notes => updateUnaffiliated(contact, { notes })}
                        multiline
                        ariaLabel={`${contact.companyName} standing`}
                      />
                    </td>
                    <td>
                      <DeleteButton
                        label={contact.companyName}
                        onDelete={() => deleteUnaffiliated(contact)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </section>
    </div>
  );
}

function EventsTable({
  events,
  updateEvent,
  deleteEvent,
  createEvent,
}: {
  events: EventRecord[];
  updateEvent: (event: EventRecord, patch: any) => void;
  deleteEvent: (event: EventRecord) => void;
  createEvent: () => void;
}) {
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Portfolio position</h2>
          <p className="text-sm text-muted-foreground">
            Tier describes operating responsibility—not priority—and never
            supplies a revenue-share default.
          </p>
        </div>
        <Button size="sm" onClick={createEvent}>
          <Plus className="mr-1.5 h-4 w-4" />
          Add event
        </Button>
      </div>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1150px] text-sm">
            <thead className="bg-slate-950 text-left text-xs uppercase tracking-wide text-slate-100">
              <tr>
                <th className="px-3 py-3">Event</th>
                <th className="px-3 py-3">Tier</th>
                <th className="px-3 py-3">When</th>
                <th className="px-3 py-3">Where</th>
                <th className="px-3 py-3 text-right">Savvy share</th>
                <th className="px-3 py-3">Swoogo sync</th>
                <th className="px-3 py-3">Status</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {events.map(event => (
                <tr
                  key={event.id}
                  className="border-b align-top hover:bg-slate-50"
                >
                  <td className="px-3 py-3 font-medium">
                    <InlineText
                      value={event.name}
                      onSave={name => {
                        if (name) updateEvent(event, { name });
                      }}
                      ariaLabel="event name"
                    />
                    <p className="mt-1 max-w-80 text-xs font-normal text-muted-foreground">
                      <InlineText
                        value={event.notes}
                        onSave={notes => updateEvent(event, { notes })}
                        multiline
                        ariaLabel={`${event.name} note`}
                        placeholder="Add note"
                      />
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`mr-1 inline-block h-2.5 w-2.5 rounded-sm ${tierClass(Number(event.tier))}`}
                    />
                    <InlineSelect
                      value={event.tier}
                      options={TIER_OPTIONS}
                      onSave={tier =>
                        updateEvent(event, { tier: Number(tier) })
                      }
                      ariaLabel={`${event.name} tier`}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <InlineDate
                      value={event.startDate}
                      onSave={startDate => updateEvent(event, { startDate })}
                      placeholder="Unconfirmed"
                      ariaLabel={`${event.name} start date`}
                    />
                    <span className="text-muted-foreground"> – </span>
                    <InlineDate
                      value={event.endDate}
                      onSave={endDate => updateEvent(event, { endDate })}
                      placeholder="End"
                      ariaLabel={`${event.name} end date`}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <InlineText
                      value={event.city}
                      onSave={city => updateEvent(event, { city })}
                      ariaLabel={`${event.name} city`}
                      placeholder="Add city"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      <InlineText
                        value={event.venue}
                        onSave={venue => updateEvent(event, { venue })}
                        ariaLabel={`${event.name} venue`}
                        placeholder="Add venue"
                      />
                    </p>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <p className="font-semibold">
                      <InlineNumber
                        value={event.savvyRevenueShare}
                        onSave={savvyRevenueShare =>
                          updateEvent(event, { savvyRevenueShare })
                        }
                        suffix="%"
                        ariaLabel={`${event.name} Savvy revenue share`}
                      />
                    </p>
                    <InlineSelect
                      value={event.shareStatus}
                      options={SHARE_STATUS_OPTIONS}
                      onSave={shareStatus =>
                        updateEvent(event, { shareStatus: shareStatus || null })
                      }
                      ariaLabel={`${event.name} revenue share agreement status`}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <InlineText
                      value={event.swoogoEventId}
                      onSave={swoogoEventId =>
                        updateEvent(event, { swoogoEventId })
                      }
                      ariaLabel={`${event.name} Swoogo event ID`}
                      placeholder="Not synced"
                      className={
                        event.swoogoEventId
                          ? "rounded border border-emerald-200 bg-emerald-50 text-emerald-700"
                          : ""
                      }
                    />
                  </td>
                  <td className="px-3 py-3">
                    <InlineSelect
                      value={event.status}
                      options={STATUS_OPTIONS.map(
                        status => [status, status] as const
                      )}
                      onSave={status => updateEvent(event, { status })}
                      ariaLabel={`${event.name} status`}
                      className="border border-slate-200 bg-slate-50"
                    />
                  </td>
                  <td>
                    <DeleteButton
                      label={event.name}
                      onDelete={() => deleteEvent(event)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );
}

function DataModel() {
  const models = [
    [
      "Event",
      "One row per event. Tier drives task workflows and reporting; it does not set money.",
      [
        "Execution tier — Executed, managed, attended/sponsored, or under evaluation",
        "Dates and timezone — nullable when not confirmed",
        "Internal owner, counterpart, platform, and optional Swoogo sync ID",
        "Savvy revenue share — blank until a human enters agreement terms",
        "Committed cost and paid-to-date context",
      ],
    ],
    [
      "Headcount",
      "One component per counted source, never a single input total.",
      [
        "Each component carries a source: Swoogo type, Manual, or Organizer",
        "Null means not counted; zero is an actual reported value",
        "Total refuses to calculate until every component has a value",
        "Guarantee is compared only after a full total exists",
      ],
    ],
    [
      "Obligation",
      "Every dated commitment belongs to an event and is sorted by consequence.",
      [
        "Deposit, balance, cancellation window, guarantee, quote expiry, launch, or deliverable",
        "Date and amount at risk are independently nullable",
        "Owner, status, and plain-language consequence remain available for workflow",
      ],
    ],
    [
      "Sponsor",
      "Sponsors live above individual events so the rolling ask across rooms stays visible.",
      [
        "Company, contacts, category, and notes",
        "One ask per event with amount and stage",
        "Category exclusivity is event-local—not portfolio-wide",
        "Unattached prospects stay outside sponsor totals",
      ],
    ],
  ];
  return (
    <div className="space-y-4">
      <Card className="border-l-4 border-l-amber-500 bg-amber-50/60">
        <CardHeader>
          <CardTitle className="text-base">
            Tier is execution load, not priority
          </CardTitle>
          <CardDescription>
            The number says how much work Savvy does, nothing else. A large Tier
            3 expense can be more consequential than a Tier 1 event because
            someone else runs it.
          </CardDescription>
        </CardHeader>
      </Card>
      {models.map(([name, description, fields]) => (
        <Card key={name as string}>
          <CardHeader>
            <CardTitle className="text-base">{name as string}</CardTitle>
            <CardDescription>{description as string}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {(fields as string[]).map(field => (
                <li key={field} className="border-l-2 border-cyan-300 pl-3">
                  {field}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Automation boundary</CardTitle>
          <CardDescription>
            Webhook delivery and source-verification records are ready.
            Automated headcount aggregation remains intentionally disabled until
            the organization confirms whether speakers and sponsors also hold
            registrant records, the exact Swoogo type IDs/names, and
            de-duplication ownership.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}

function IntegrationSettings({
  open,
  onOpenChange,
  integration,
  syncActivity,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  integration: any;
  syncActivity: any[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-cyan-700" />
            Swoogo integration settings
          </DialogTitle>
          <DialogDescription>
            Credentials remain in SavvyOS service configuration. This screen
            never exposes tokens or secrets.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <StatusItem
            label="Swoogo API credentials"
            good={integration?.apiConfigured}
            goodText="Configured"
            waitingText="Awaiting SWOOGO_CREDENTIALS_B64 or consumer key/secret"
          />
          <StatusItem
            label="Webhook shared header"
            good={integration?.webhookConfigured}
            goodText={`Configured (${integration?.webhookHeader ?? "x-savvy-webhook-token"})`}
            waitingText="Awaiting SWOOGO_WEBHOOK_TOKEN"
          />
          <StatusItem
            label="Token status"
            good={integration?.token?.hasToken}
            goodText="Active in process"
            waitingText={
              integration?.apiConfigured
                ? "Will refresh on first provider request"
                : "Unavailable until API credentials are configured"
            }
          />
          <StatusItem
            label="Headcount automation"
            good={false}
            goodText=""
            waitingText="Deliberately paused pending source-model confirmation"
          />
        </div>
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="flex gap-3 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
            <div>
              <p className="font-medium text-amber-900">
                Source model confirmation is required
              </p>
              <p className="mt-1 text-sm text-amber-800">
                Swoogo can send registrant, speaker, and sponsor webhooks.
                Before counting, confirm which sources represent unique people
                and how cross-source duplicates are resolved. Until then,
                webhook deliveries are acknowledged, debounced, and stored as
                verification activity only—no Manual or Organizer component can
                be overwritten.
              </p>
            </div>
          </CardContent>
        </Card>
        <div>
          <h3 className="mb-2 text-sm font-semibold">
            Recent provider activity
          </h3>
          {syncActivity.length ? (
            <div className="max-h-48 overflow-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Received</th>
                    <th className="px-3 py-2">Provider event</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {syncActivity.map(activity => (
                    <tr key={activity.id} className="border-t">
                      <td className="px-3 py-2">
                        {activity.receivedAt
                          ? new Date(activity.receivedAt).toLocaleString()
                          : "—"}
                      </td>
                      <td className="px-3 py-2">{activity.providerEventId}</td>
                      <td className="px-3 py-2">{activity.eventType}</td>
                      <td className="px-3 py-2">
                        <Badge
                          variant="outline"
                          className="border-amber-200 bg-amber-50 text-amber-700"
                        >
                          Awaiting confirmation
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              No Swoogo activity has been received yet.
            </p>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Required environment variables: <code>SWOOGO_CREDENTIALS_B64</code>{" "}
          (or consumer key/secret), <code>SWOOGO_WEBHOOK_TOKEN</code>, and
          optionally <code>SWOOGO_WEBHOOK_HEADER</code>. Configure Swoogo to
          deliver JSON POSTs to{" "}
          <code>https://os.savvy-agents.com/api/webhooks/swoogo</code>.
        </p>
      </DialogContent>
    </Dialog>
  );
}

function StatusItem({
  label,
  good,
  goodText,
  waitingText,
}: {
  label: string;
  good: boolean;
  goodText: string;
  waitingText: string;
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${good ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={`mt-1 text-sm font-semibold ${good ? "text-emerald-700" : "text-slate-700"}`}
      >
        {good ? goodText : waitingText}
      </p>
    </div>
  );
}

export default function EventsPage() {
  const utils = trpc.useUtils();
  const { data, isLoading, error, isFetching } = trpc.events.overview.useQuery(
    undefined,
    { staleTime: 15_000 }
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const refresh = () => void utils.events.overview.invalidate();
  const mutationOptions = {
    onSuccess: refresh,
    onError: (error: any) =>
      toast.error(
        error.message ?? "Unable to save this Events Console change."
      ),
  };
  const createEvent = trpc.events.createEvent.useMutation({
    ...mutationOptions,
    onSuccess: () => {
      toast.success("Event added. Click its values to continue editing.");
      refresh();
    },
  });
  const updateEventMutation =
    trpc.events.updateEvent.useMutation(mutationOptions);
  const deleteEventMutation = trpc.events.deleteEvent.useMutation({
    ...mutationOptions,
    onSuccess: () => {
      toast.success("Event deleted.");
      refresh();
    },
  });
  const createComponent =
    trpc.events.createComponent.useMutation(mutationOptions);
  const updateComponentMutation =
    trpc.events.updateComponent.useMutation(mutationOptions);
  const deleteComponentMutation =
    trpc.events.deleteComponent.useMutation(mutationOptions);
  const createObligation =
    trpc.events.createObligation.useMutation(mutationOptions);
  const updateObligationMutation =
    trpc.events.updateObligation.useMutation(mutationOptions);
  const deleteObligationMutation =
    trpc.events.deleteObligation.useMutation(mutationOptions);
  const createSponsorMutation =
    trpc.events.createSponsor.useMutation(mutationOptions);
  const updateSponsorMutation =
    trpc.events.updateSponsor.useMutation(mutationOptions);
  const deleteSponsorMutation =
    trpc.events.deleteSponsor.useMutation(mutationOptions);
  const upsertAskMutation =
    trpc.events.upsertSponsorAsk.useMutation(mutationOptions);
  const deleteAskMutation =
    trpc.events.deleteSponsorAsk.useMutation(mutationOptions);
  const createClaimMutation =
    trpc.events.createClaim.useMutation(mutationOptions);
  const updateClaimMutation =
    trpc.events.updateClaim.useMutation(mutationOptions);
  const deleteClaimMutation =
    trpc.events.deleteClaim.useMutation(mutationOptions);
  const createUnaffiliatedMutation =
    trpc.events.createUnaffiliated.useMutation(mutationOptions);
  const updateUnaffiliatedMutation =
    trpc.events.updateUnaffiliated.useMutation(mutationOptions);
  const deleteUnaffiliatedMutation =
    trpc.events.deleteUnaffiliated.useMutation(mutationOptions);

  if (isLoading)
    return (
      <div className="flex min-h-[45vh] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    );
  if (error)
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-destructive" />
        <h1 className="mt-3 text-lg font-semibold">
          Events Console restricted
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{error.message}</p>
      </div>
    );
  const overview = data as Overview;
  const events = overview?.events ?? [];
  const operatingEvents = events.filter((event: any) =>
    [1, 2].includes(Number(event.tier))
  );
  const sponsorshipBooked = operatingEvents.reduce(
    (sum: number, event: any) => sum + (asNumber(event.revenueBooked) ?? 0),
    0
  );
  const sponsorshipTarget = operatingEvents.reduce(
    (sum: number, event: any) => sum + (asNumber(event.revenueTarget) ?? 0),
    0
  );
  const sponsorOthers = events
    .filter((event: any) => Number(event.tier) === 3)
    .reduce(
      (sum: number, event: any) => sum + (asNumber(event.committedCost) ?? 0),
      0
    );
  const missingShare = events.filter(
    (event: any) =>
      Number(event.tier) === 2 && asNumber(event.savvyRevenueShare) === null
  ).length;
  const nextObligation = events
    .flatMap((event: any) =>
      (event.obligations ?? []).map((obligation: any) => ({
        ...obligation,
        event,
      }))
    )
    .filter((obligation: any) => (daysUntil(obligation.dueDate) ?? -1) >= 0)
    .sort((a: any, b: any) =>
      String(a.dueDate).localeCompare(String(b.dueDate))
    )[0];

  const updateEvent = (event: any, patch: any) =>
    updateEventMutation.mutate({ id: event.id, version: event.version, patch });
  const deleteEvent = (event: any) => {
    if (
      window.confirm(
        `Delete ${event.name}? Its obligations, headcount, claims, and asks will be removed too.`
      )
    )
      deleteEventMutation.mutate({ id: event.id, version: event.version });
  };
  const updateComponent = (component: any, patch: any) =>
    updateComponentMutation.mutate({
      id: component.id,
      version: component.version,
      patch,
    });
  const deleteComponent = (component: any) =>
    deleteComponentMutation.mutate({
      id: component.id,
      version: component.version,
    });
  const updateObligation = (obligation: any, patch: any) =>
    updateObligationMutation.mutate({
      id: obligation.id,
      version: obligation.version,
      patch,
    });
  const deleteObligation = (obligation: any) =>
    deleteObligationMutation.mutate({
      id: obligation.id,
      version: obligation.version,
    });
  const updateSponsor = (sponsor: any, patch: any) =>
    updateSponsorMutation.mutate({
      id: sponsor.id,
      version: sponsor.version,
      patch,
    });
  const deleteSponsor = (sponsor: any) => {
    if (
      window.confirm(`Delete ${sponsor.companyName} and all of its event asks?`)
    )
      deleteSponsorMutation.mutate({
        id: sponsor.id,
        version: sponsor.version,
      });
  };
  const upsertAsk = (sponsor: any, event: any, ask: any, patch: any) =>
    upsertAskMutation.mutate({
      sponsorId: sponsor.id,
      eventId: event.id,
      amount: patch.amount !== undefined ? patch.amount : asNumber(ask?.amount),
      stage: patch.stage ?? ask?.stage ?? "proposed",
    });
  const deleteAsk = (ask: any) =>
    deleteAskMutation.mutate({ id: ask.id, version: ask.version });
  const updateClaim = (claim: any, patch: any) =>
    updateClaimMutation.mutate({ id: claim.id, version: claim.version, patch });
  const deleteClaim = (claim: any) =>
    deleteClaimMutation.mutate({ id: claim.id, version: claim.version });
  const updateUnaffiliated = (contact: any, patch: any) =>
    updateUnaffiliatedMutation.mutate({
      id: contact.id,
      version: contact.version,
      patch,
    });
  const deleteUnaffiliated = (contact: any) =>
    deleteUnaffiliatedMutation.mutate({
      id: contact.id,
      version: contact.version,
    });

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 pb-10">
      <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 via-[#07364a] to-cyan-900 px-6 py-7 text-white">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-cyan-100">
              <CalendarDays className="h-5 w-5" />
              <span className="text-sm font-medium">
                Master tier operations control
              </span>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">
              Savvy Events Console
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-cyan-50/80">
              One portfolio record per event, whether Savvy executes, manages,
              sponsors, attends, or is still evaluating it.
            </p>
          </div>
          <div className="border-l-2 border-cyan-400 pl-4">
            <p className="text-xs uppercase tracking-wide text-cyan-100">
              Next money deadline
            </p>
            <p className="mt-1 font-medium">
              {nextObligation
                ? `${dateLabel(nextObligation.dueDate, false)} — ${nextObligation.title}`
                : "Nothing dated"}
            </p>
            <p className="text-sm text-cyan-100">
              {nextObligation
                ? `${daysUntil(nextObligation.dueDate)} days · ${nextObligation.event.name}`
                : "Add an obligation to begin the radar."}
            </p>
          </div>
        </div>
      </section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          All portfolio values are editable inline. Press{" "}
          <kbd className="rounded border bg-muted px-1.5 py-0.5 text-xs">
            Enter
          </kbd>{" "}
          or leave a field to save;{" "}
          <kbd className="rounded border bg-muted px-1.5 py-0.5 text-xs">
            Esc
          </kbd>{" "}
          reverts.
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refresh()}
            disabled={isFetching}
          >
            <RefreshCw
              className={`mr-1.5 h-4 w-4 ${isFetching ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings2 className="mr-1.5 h-4 w-4" />
            Settings
          </Button>
        </div>
      </div>
      <Tabs defaultValue="radar" className="space-y-6">
        <TabsList className="h-auto w-full justify-start overflow-x-auto">
          <TabsTrigger value="radar">
            <AlertTriangle className="mr-1.5 h-4 w-4" />
            Radar
          </TabsTrigger>
          <TabsTrigger value="timeline">
            <Clock3 className="mr-1.5 h-4 w-4" />
            Timeline{" "}
            <span className="ml-1.5 rounded-full bg-muted px-1.5 text-xs">
              {events.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="sponsors">
            <UsersRound className="mr-1.5 h-4 w-4" />
            Sponsors{" "}
            <span className="ml-1.5 rounded-full bg-muted px-1.5 text-xs">
              {overview?.sponsors?.length ?? 0}
            </span>
          </TabsTrigger>
          <TabsTrigger value="events">
            <CircleDollarSign className="mr-1.5 h-4 w-4" />
            Events
          </TabsTrigger>
          <TabsTrigger value="model">
            <ExternalLink className="mr-1.5 h-4 w-4" />
            Data model
          </TabsTrigger>
        </TabsList>
        <TabsContent value="radar">
          <Radar
            events={events}
            alerts={overview?.alerts ?? []}
            updateObligation={updateObligation}
            deleteObligation={deleteObligation}
            addObligation={eventId =>
              createObligation.mutate({ eventId, title: "New obligation" })
            }
          />
        </TabsContent>
        <TabsContent value="timeline">
          <Timeline events={events} onDelete={deleteEvent} />
        </TabsContent>
        <TabsContent value="sponsors">
          <SponsorGrid
            events={events}
            sponsors={overview?.sponsors ?? []}
            claims={overview?.claims ?? []}
            unaffiliated={overview?.unaffiliated ?? []}
            updateSponsor={updateSponsor}
            deleteSponsor={deleteSponsor}
            upsertAsk={upsertAsk}
            deleteAsk={deleteAsk}
            createSponsor={() =>
              createSponsorMutation.mutate({ companyName: "New sponsor" })
            }
            updateClaim={updateClaim}
            deleteClaim={deleteClaim}
            createClaim={() => {
              const event = events[0];
              if (!event)
                return toast.error(
                  "Add an event before adding an exclusivity claim."
                );
              createClaimMutation.mutate({
                eventId: event.id,
                category: "New category",
              });
            }}
            updateUnaffiliated={updateUnaffiliated}
            deleteUnaffiliated={deleteUnaffiliated}
            createUnaffiliated={() =>
              createUnaffiliatedMutation.mutate({ companyName: "New contact" })
            }
          />
        </TabsContent>
        <TabsContent value="events" className="space-y-6">
          <div className="grid overflow-hidden rounded-xl border bg-border md:grid-cols-4">
            <Metric
              value={money(sponsorshipBooked)}
              label="Sponsorship booked"
              detail="Signed or invoiced only. Verbal commitments excluded."
            />
            <Metric
              value={money(sponsorshipTarget)}
              label="Sponsorship at sellout"
              detail="Across events Savvy executes or manages."
            />
            <Metric
              value={money(sponsorOthers)}
              label="Committed to sponsor others"
              detail="Every Tier 3 commitment, contracted."
            />
            <Metric
              value={missingShare}
              label="Tier 2 events with no share set"
              detail="Blank on purpose. A partner agreement sets it, not the tier."
              tone={missingShare ? "warning" : "default"}
            />
          </div>
          <div className="space-y-5">
            {events
              .filter((event: any) => (event.components ?? []).length > 0)
              .map((event: any) => (
                <HeadcountCard
                  key={event.id}
                  event={event}
                  updateEvent={patch => updateEvent(event, patch)}
                  updateComponent={updateComponent}
                  deleteComponent={deleteComponent}
                  addComponent={eventId =>
                    createComponent.mutate({
                      eventId,
                      label: "New component",
                      sourceType: "Manual",
                      count: null,
                    })
                  }
                />
              ))}
            {events
              .filter((event: any) => (event.components ?? []).length === 0)
              .map((event: any) => (
                <Card key={event.id} className="border-dashed">
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div>
                      <p className="font-medium">{event.name}</p>
                      <p className="text-sm text-muted-foreground">
                        No headcount components. Add them only if Savvy carries
                        a guarantee or needs a source-based count.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        createComponent.mutate({
                          eventId: event.id,
                          label: "New component",
                          sourceType: "Manual",
                          count: null,
                        })
                      }
                    >
                      <Plus className="mr-1.5 h-4 w-4" />
                      Add headcount
                    </Button>
                  </CardContent>
                </Card>
              ))}
          </div>
          <EventsTable
            events={events}
            updateEvent={updateEvent}
            deleteEvent={deleteEvent}
            createEvent={() =>
              createEvent.mutate({ name: "New event", tier: 2, status: "Idea" })
            }
          />
        </TabsContent>
        <TabsContent value="model">
          <DataModel />
        </TabsContent>
      </Tabs>
      <IntegrationSettings
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        integration={overview?.integration}
        syncActivity={overview?.syncActivity ?? []}
      />
    </div>
  );
}
