import { useEffect, useMemo, useRef, useState } from "react";
import {
  format,
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
import { SearchableSelect } from "@/components/ui/searchable-select";
import ProjectDetailPage from "@/pages/ProjectDetailPage";
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  ExternalLink,
  FileText,
  Loader2,
  Plus,
  Pencil,
  RefreshCw,
  Settings2,
  ShieldAlert,
  Trash2,
  Upload,
  UsersRound,
} from "lucide-react";

type EventRecord = any;
type SponsorRecord = any;
type Overview = any;

const TIER_OPTIONS = [
  ["1", "Tier 1: Executed"],
  ["2", "Tier 2: Managed"],
  ["3", "Tier 3: Attended or sponsored"],
  ["4", "Under evaluation"],
] as const;

const TIER_DETAILS: Record<
  number,
  { label: string; description: string; badgeClass: string; barClass: string }
> = {
  1: {
    label: "Tier 1 · Executed",
    description: "Savvy runs and manages the event.",
    badgeClass: "border-cyan-200 bg-cyan-100 text-cyan-950",
    barClass: "bg-cyan-500 text-slate-950",
  },
  2: {
    label: "Tier 2 · Managed",
    description: "Savvy oversees it while an external party runs it.",
    badgeClass: "border-blue-200 bg-blue-950 text-white",
    barClass: "bg-blue-900 text-white",
  },
  3: {
    label: "Tier 3 · Attended or sponsored",
    description: "An external event where Savvy participates.",
    badgeClass: "border-violet-200 bg-violet-100 text-violet-950",
    barClass: "bg-violet-600 text-white",
  },
  4: {
    label: "Under evaluation",
    description:
      "A prospective event with no confirmed commitment or timeline.",
    badgeClass: "border-amber-200 bg-amber-100 text-amber-950",
    barClass: "bg-amber-400 text-amber-950",
  },
};
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
const EXPENSE_STATUS_OPTIONS = [
  ["planned", "Planned"],
  ["invoiced", "Invoiced"],
  ["paid", "Paid"],
  ["reimbursed", "Reimbursed"],
  ["void", "Void"],
] as const;
const DELIVERABLE_STATUS_OPTIONS = [
  ["not_started", "Not started"],
  ["booked", "Booked"],
  ["delivered", "Delivered"],
] as const;
const DELIVERABLE_TYPE_OPTIONS = [
  ["contractual", "Contractual"],
  ["courtesy", "Courtesy"],
] as const;
const DELIVERABLE_CHANGE_OPTIONS = [
  ["dropped", "Dropped"],
  ["substituted", "Substituted"],
] as const;

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
        minimumFractionDigits: Number.isInteger(parsed) ? 0 : 2,
        maximumFractionDigits: 2,
      }).format(parsed);
}

function eventHeadcount(event: EventRecord) {
  const components = event.components ?? [];
  const missing = components.filter(
    (component: any) => asNumber(component.count) === null
  ).length;
  const componentTotal =
    components.length && missing === 0
      ? components.reduce(
          (sum: number, component: any) =>
            sum + (asNumber(component.count) ?? 0),
          0
        )
      : null;
  const working = asNumber(event.workingHeadcount);
  return {
    count: working ?? componentTotal,
    source:
      working !== null
        ? "Working headcount"
        : componentTotal !== null
          ? "Sum of components"
          : components.length
            ? `${missing} component${missing === 1 ? "" : "s"} uncounted`
            : "No components yet",
    missing,
  };
}

function eventSponsorMetrics(event: EventRecord, sponsors: SponsorRecord[]) {
  const asks = sponsors.flatMap(sponsor =>
    (sponsor.asks ?? [])
      .filter((ask: any) => Number(ask.eventId) === Number(event.id))
      .map((ask: any) => ({ sponsor, ask }))
  );
  const bookedStages = new Set(["signed", "invoiced"]);
  const activeStages = new Set(["target", "proposed", "verbal"]);
  const booked = asks
    .filter(({ ask }) => bookedStages.has(ask.stage))
    .reduce((sum, { ask }) => sum + (asNumber(ask.amount) ?? 0), 0);
  const active = asks
    .filter(({ ask }) => activeStages.has(ask.stage))
    .reduce((sum, { ask }) => sum + (asNumber(ask.amount) ?? 0), 0);
  return {
    booked,
    active,
    activeCount: asks.filter(({ ask }) => activeStages.has(ask.stage)).length,
    bookedCount: asks.filter(({ ask }) => bookedStages.has(ask.stage)).length,
  };
}

function eventFinancials(event: EventRecord, sponsors: SponsorRecord[]) {
  const sponsor = eventSponsorMetrics(event, sponsors);
  // The sponsor ledger is the live source once an event has a booked
  // commitment. Older event rows with no sponsor commitments retain their
  // existing manual booked-revenue value as a migration bridge.
  const sponsorIncome = sponsor.bookedCount
    ? sponsor.booked
    : (asNumber(event.revenueBooked) ?? 0);
  const revenue = sponsorIncome;
  const expenses = asNumber(event.committedCost) ?? 0;
  return {
    ...sponsor,
    sponsorIncome,
    revenue,
    expenses,
    profitLoss: revenue - expenses,
  };
}

/** Date columns are calendar dates, not UTC instants. Rebuild at local noon so
 * browser time zones cannot roll an event or deadline backward one day. */
function dateKey(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(String(value));
  return match?.[1] ?? null;
}

function dateValue(value: unknown) {
  const key = dateKey(value);
  if (!key) return null;
  const [year, month, day] = key.split("-").map(Number);
  const parsed = new Date(year, month - 1, day, 12, 0, 0, 0);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
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
  return TIER_DETAILS[tier]?.barClass ?? "bg-slate-100 text-slate-700";
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
      : `${prefix}${numeric.toLocaleString("en-US", {
          minimumFractionDigits: Number.isInteger(numeric) ? 0 : 2,
          maximumFractionDigits: 2,
        })}${suffix}`;
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
  const iso = dateKey(value) ?? "";
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
            value={event.headcountNote}
            onSave={headcountNote => updateEvent({ headcountNote })}
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
                <InlineText
                  value={component.sourceType}
                  onSave={sourceType => {
                    if (sourceType) updateComponent(component, { sourceType });
                  }}
                  placeholder="Manual"
                  ariaLabel={`${component.label} source`}
                  className="text-xs text-muted-foreground"
                />
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  Use{" "}
                  <span className="font-medium">Swoogo: Registration type</span>{" "}
                  to let verified webhooks refresh this component.
                </p>
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

type EventDraft = {
  name: string;
  tier: string;
  status: string;
  startDate: string;
  endDate: string;
  counterpart: string;
  ownerName: string;
  city: string;
  venue: string;
  workingHeadcount: string;
  headcountNote: string;
  notes: string;
};

function eventToDraft(event?: EventRecord | null): EventDraft {
  return {
    name: event?.name ?? "",
    tier: String(event?.tier ?? 2),
    status: event?.status ?? "Idea",
    startDate: dateKey(event?.startDate) ?? "",
    endDate: dateKey(event?.endDate) ?? "",
    counterpart: event?.counterpart ?? "",
    ownerName: event?.ownerName ?? "",
    city: event?.city ?? "",
    venue: event?.venue ?? "",
    workingHeadcount:
      event?.workingHeadcount === null || event?.workingHeadcount === undefined
        ? ""
        : String(event.workingHeadcount),
    headcountNote: event?.headcountNote ?? "",
    notes: event?.notes ?? "",
  };
}

function EventEditorDialog({
  open,
  onOpenChange,
  event,
  onSave,
  isSaving,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: EventRecord | null;
  onSave: (event: EventRecord | null, patch: any) => void;
  isSaving: boolean;
}) {
  const [draft, setDraft] = useState<EventDraft>(() => eventToDraft(event));

  useEffect(() => {
    if (open) setDraft(eventToDraft(event));
  }, [open, event?.id, event?.version]);

  const updateDraft = <Key extends keyof EventDraft>(
    key: Key,
    value: EventDraft[Key]
  ) => setDraft(current => ({ ...current, [key]: value }));

  const submit = (submission: React.FormEvent<HTMLFormElement>) => {
    submission.preventDefault();
    if (!draft.name.trim()) {
      toast.error("Give this event a name before saving it.");
      return;
    }
    if (draft.startDate && draft.endDate && draft.endDate < draft.startDate) {
      toast.error("The end date cannot be before the start date.");
      return;
    }
    const parsedHeadcount = draft.workingHeadcount.trim()
      ? Number(draft.workingHeadcount)
      : null;
    if (
      parsedHeadcount !== null &&
      (!Number.isInteger(parsedHeadcount) || parsedHeadcount < 0)
    ) {
      toast.error("Headcount must be a whole, non-negative number.");
      return;
    }
    onSave(event, {
      name: draft.name.trim(),
      tier: Number(draft.tier),
      status: draft.status,
      startDate: draft.startDate || null,
      endDate: draft.endDate || null,
      counterpart: draft.counterpart.trim() || null,
      ownerName: draft.ownerName.trim() || null,
      city: draft.city.trim() || null,
      venue: draft.venue.trim() || null,
      workingHeadcount: parsedHeadcount,
      headcountNote: draft.headcountNote.trim() || null,
      notes: draft.notes.trim() || null,
    });
  };

  const fieldClass = "h-9 bg-background";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{event ? "Edit event" : "Add event"}</DialogTitle>
          <DialogDescription>
            Keep the operating record tight. The timeline, profile, obligations,
            headcount, and sponsor activity all reference this event.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-5" onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5 sm:col-span-2">
              <span className="text-sm font-medium">Event name</span>
              <Input
                value={draft.name}
                onChange={item => updateDraft("name", item.target.value)}
                placeholder="e.g. STR Summit 2027"
                className={fieldClass}
                autoFocus
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-sm font-medium">Operating tier</span>
              <Select
                value={draft.tier}
                onValueChange={value => updateDraft("tier", value)}
              >
                <SelectTrigger className={fieldClass}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIER_OPTIONS.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="space-y-1.5">
              <span className="text-sm font-medium">Status</span>
              <Select
                value={draft.status}
                onValueChange={value => updateDraft("status", value)}
              >
                <SelectTrigger className={fieldClass}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(status => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="space-y-1.5">
              <span className="text-sm font-medium">Start date</span>
              <Input
                type="date"
                value={draft.startDate}
                onChange={item => updateDraft("startDate", item.target.value)}
                className={fieldClass}
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-sm font-medium">End date</span>
              <Input
                type="date"
                value={draft.endDate}
                onChange={item => updateDraft("endDate", item.target.value)}
                className={fieldClass}
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-sm font-medium">Point of contact</span>
              <Input
                value={draft.counterpart}
                onChange={item => updateDraft("counterpart", item.target.value)}
                placeholder="External organizer or main contact"
                className={fieldClass}
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-sm font-medium">Savvy owner</span>
              <Input
                value={draft.ownerName}
                onChange={item => updateDraft("ownerName", item.target.value)}
                placeholder="Internal owner"
                className={fieldClass}
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-sm font-medium">Current headcount</span>
              <Input
                type="number"
                min="0"
                step="1"
                value={draft.workingHeadcount}
                onChange={item =>
                  updateDraft("workingHeadcount", item.target.value)
                }
                placeholder="Not set"
                className={fieldClass}
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-sm font-medium">City / market</span>
              <Input
                value={draft.city}
                onChange={item => updateDraft("city", item.target.value)}
                placeholder="City, State"
                className={fieldClass}
              />
            </label>
            <label className="space-y-1.5 sm:col-span-2">
              <span className="text-sm font-medium">Venue</span>
              <Input
                value={draft.venue}
                onChange={item => updateDraft("venue", item.target.value)}
                placeholder="Venue or location detail"
                className={fieldClass}
              />
            </label>
            <label className="space-y-1.5 sm:col-span-2">
              <span className="text-sm font-medium">Headcount context</span>
              <Textarea
                value={draft.headcountNote}
                onChange={item =>
                  updateDraft("headcountNote", item.target.value)
                }
                placeholder="Minimum, assumptions, or booking constraints"
                className="min-h-20 bg-background"
              />
            </label>
            <label className="space-y-1.5 sm:col-span-2">
              <span className="text-sm font-medium">Operational notes</span>
              <Textarea
                value={draft.notes}
                onChange={item => updateDraft("notes", item.target.value)}
                placeholder="What the team needs to know"
                className="min-h-24 bg-background"
              />
            </label>
          </div>
          <div className="flex items-center justify-end gap-2 border-t pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {event ? "Save changes" : "Add event"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ProfileDatum({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail?: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border bg-slate-50/70 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 break-words text-sm font-semibold text-slate-950">
        {value}
      </p>
      {detail && (
        <p className="mt-1 break-words text-xs text-muted-foreground">
          {detail}
        </p>
      )}
    </div>
  );
}

function EventProjectWorkspace({
  eventId,
  onChanged,
}: {
  eventId: number;
  onChanged: () => void;
}) {
  const utils = trpc.useUtils();
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [projectId, setProjectId] = useState("");
  const { data: linked, isLoading } = trpc.events.projects.linked.useQuery(
    { eventId },
    { staleTime: 0 }
  );
  const { data: candidates = [], isLoading: candidatesLoading } =
    trpc.events.projects.candidates.useQuery(undefined, {
      enabled: linkDialogOpen,
      staleTime: 0,
    });
  const refresh = () => {
    void utils.events.projects.linked.invalidate({ eventId });
    void utils.events.projects.candidates.invalidate();
    onChanged();
  };
  const linkProject = trpc.events.projects.link.useMutation({
    onSuccess: () => {
      toast.success("Project linked to this Event.");
      setLinkDialogOpen(false);
      setProjectId("");
      refresh();
    },
    onError: error => toast.error(error.message),
  });
  const unlinkProject = trpc.events.projects.unlink.useMutation({
    onSuccess: () => {
      toast.success("Project unlinked from this Event.");
      refresh();
    },
    onError: error => toast.error(error.message),
  });

  const candidateOptions = (candidates as any[]).map(project => ({
    value: String(project.id),
    label: project.title,
    description: [project.status?.replaceAll("_", " "), project.dueDate ? `Due ${dateLabel(project.dueDate)}` : null]
      .filter(Boolean)
      .join(" · "),
  }));

  return (
    <section className="rounded-xl border bg-slate-50/50 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Planning project</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Event planning work stays in Projects and uses the same Project tasks.
          </p>
        </div>
        {linked?.state === "unlinked" ? (
          <Button size="sm" onClick={() => setLinkDialogOpen(true)}>
            Link project
          </Button>
        ) : null}
        {linked?.state === "accessible" ? (
          <Button
            size="sm"
            variant="outline"
            disabled={unlinkProject.isPending}
            onClick={() => {
              if (
                window.confirm(
                  "Unlink this Project? The Project and all of its tasks will stay unchanged."
                )
              ) {
                unlinkProject.mutate({ eventId });
              }
            }}
          >
            Unlink
          </Button>
        ) : null}
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading Project planning…
        </div>
      ) : null}
      {linked?.state === "unlinked" ? (
        <p className="mt-4 rounded-lg border border-dashed bg-background px-4 py-5 text-sm text-muted-foreground">
          No Project is linked to this Event yet.
        </p>
      ) : null}
      {linked?.state === "restricted" ? (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-5 text-sm text-amber-950">
          A Project is linked to this Event. You do not have access to its planning workspace.
        </p>
      ) : null}
      {linked?.state === "accessible" ? (
        <div className="mt-4 border-t pt-4">
          <ProjectDetailPage embeddedProjectId={linked.project.id} />
        </div>
      ) : null}

      <Dialog
        open={linkDialogOpen}
        onOpenChange={open => {
          setLinkDialogOpen(open);
          if (!open) setProjectId("");
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Link a Project</DialogTitle>
            <DialogDescription>
              Choose an existing Events Project. Projects are created in Projects first.
            </DialogDescription>
          </DialogHeader>
          {candidatesLoading ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading available Projects…
            </div>
          ) : candidateOptions.length === 0 ? (
            <p className="rounded-md border border-dashed bg-muted/20 px-4 py-5 text-sm text-muted-foreground">
              No Events projects available. Create one in Projects first.
            </p>
          ) : (
            <SearchableSelect
              options={candidateOptions}
              value={projectId}
              onValueChange={setProjectId}
              placeholder="Choose an Events Project…"
              searchPlaceholder="Search Projects…"
              emptyText="No matching Events Projects."
              showSelectedDescription
            />
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setLinkDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!projectId || linkProject.isPending}
              onClick={() =>
                linkProject.mutate({ eventId, projectId: Number(projectId) })
              }
            >
              {linkProject.isPending ? "Linking…" : "Link project"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function EventProfileDialog({
  event,
  sponsors,
  claims,
  onOpenChange,
  onEdit,
  onProjectLinkChanged,
}: {
  event: EventRecord | null;
  sponsors: SponsorRecord[];
  claims: any[];
  onOpenChange: (open: boolean) => void;
  onEdit: (event: EventRecord) => void;
  onProjectLinkChanged: () => void;
}) {
  if (!event) return null;
  const tier = Number(event.tier);
  const tierDetail = TIER_DETAILS[tier] ?? TIER_DETAILS[4];
  const components = event.components ?? [];
  const completeComponentCount = components.every(
    (component: any) => asNumber(component.count) !== null
  );
  const componentTotal =
    components.length && completeComponentCount
      ? components.reduce(
          (sum: number, component: any) =>
            sum + (asNumber(component.count) ?? 0),
          0
        )
      : null;
  const headcount = asNumber(event.workingHeadcount) ?? componentTotal;
  const financials = eventFinancials(event, sponsors);
  const relatedAsks = sponsors.flatMap(sponsor =>
    (sponsor.asks ?? [])
      .filter((ask: any) => Number(ask.eventId) === Number(event.id))
      .map((ask: any) => ({ sponsor, ask }))
  );
  const relatedClaims = claims.filter(
    claim => Number(claim.eventId) === Number(event.id)
  );
  const eventDate = dateValue(event.startDate)
    ? event.endDate && dateKey(event.endDate) !== dateKey(event.startDate)
      ? `${dateLabel(event.startDate)} – ${dateLabel(event.endDate)}`
      : dateLabel(event.startDate)
    : "No confirmed timeline";

  return (
    <Dialog open={Boolean(event)} onOpenChange={onOpenChange}>
      <DialogContent className="h-[min(92vh,1000px)] w-[min(96vw,1400px)] max-w-[calc(100%-2rem)] overflow-hidden p-0 sm:!max-w-none">
        <div className="flex h-full min-h-0 flex-col">
          <DialogHeader className="shrink-0 border-b px-5 pt-5 pb-4 pr-12 sm:px-7 sm:pt-7 sm:pb-5 sm:pr-14">
            <div className="grid min-w-0 gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
              <div className="min-w-0">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={tierDetail.badgeClass}>
                    {tierDetail.label}
                  </Badge>
                  <Badge
                    variant="outline"
                    className="border-slate-200 bg-slate-50 text-slate-700"
                  >
                    {event.status}
                  </Badge>
                </div>
                <DialogTitle className="break-words text-2xl leading-tight tracking-tight sm:text-3xl">
                  {event.name}
                </DialogTitle>
                <DialogDescription className="mt-2 break-words leading-relaxed">
                  {tierDetail.description}
                </DialogDescription>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0"
                onClick={() => onEdit(event)}
              >
                <Pencil className="mr-1.5 h-4 w-4" />
                Edit event
              </Button>
            </div>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-5 overflow-x-hidden overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <ProfileDatum label="Dates" value={eventDate} />
              <ProfileDatum
                label="Point of contact"
                value={event.counterpart || "Not assigned"}
              />
              <ProfileDatum
                label="Headcount"
                value={headcount === null ? "Not set" : headcount}
                detail={
                  event.workingHeadcount !== null &&
                  event.workingHeadcount !== undefined
                    ? "Current working headcount"
                    : componentTotal !== null
                      ? "Calculated from components"
                      : undefined
                }
              />
              <ProfileDatum
                label="Savvy owner"
                value={event.ownerName || "Not assigned"}
              />
              <ProfileDatum
                label="Location"
                value={event.city || "Not set"}
                detail={event.venue || undefined}
              />
            </section>

            <EventProjectWorkspace
              eventId={event.id}
              onChanged={onProjectLinkChanged}
            />

            <section className="grid gap-4 lg:grid-cols-2">
              <Card className="min-w-0">
                <CardHeader className="border-b pb-3">
                  <CardTitle className="text-base">Event record</CardTitle>
                  <CardDescription>
                    Commercial and operating context attached to this event.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 p-4 sm:grid-cols-2">
                  <ProfileDatum
                    label="Revenue target"
                    value={money(event.revenueTarget)}
                  />
                  <ProfileDatum
                    label="Sponsor income"
                    value={money(financials.sponsorIncome)}
                    detail="Signed or invoiced commitments"
                  />
                  <ProfileDatum
                    label="Committed cost"
                    value={money(event.committedCost)}
                    detail={`${(event.expenses ?? []).length} expense ledger line${(event.expenses ?? []).length === 1 ? "" : "s"}`}
                  />
                  <ProfileDatum
                    label="Revenue share"
                    value={
                      asNumber(event.savvyRevenueShare) === null
                        ? "Not set"
                        : `${asNumber(event.savvyRevenueShare)}%`
                    }
                    detail={event.shareStatus || undefined}
                  />
                  <ProfileDatum
                    label="Registration"
                    value={event.registrationPlatform || "Not set"}
                    detail={
                      event.swoogoEventId
                        ? `Swoogo: ${event.swoogoEventId}`
                        : undefined
                    }
                  />
                  <ProfileDatum
                    label="Headcount guarantee"
                    value={
                      asNumber(event.headcountGuarantee) === null
                        ? "Not set"
                        : asNumber(event.headcountGuarantee)!
                    }
                    detail={event.headcountGuaranteeVendor || undefined}
                  />
                  <ProfileDatum
                    label="Current P/L"
                    value={money(financials.profitLoss)}
                    detail="Sponsor income less committed cost"
                  />
                </CardContent>
              </Card>
              <Card className="min-w-0">
                <CardHeader className="border-b pb-3">
                  <CardTitle className="text-base">Notes</CardTitle>
                </CardHeader>
                <CardContent className="break-words p-4 text-sm leading-relaxed text-muted-foreground">
                  {event.notes || "No operating notes have been added."}
                </CardContent>
              </Card>
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
              <Card className="min-w-0">
                <CardHeader className="border-b pb-3">
                  <CardTitle className="text-base">
                    Headcount components ({components.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="divide-y p-0">
                  {components.length ? (
                    components.map((component: any) => (
                      <div
                        key={component.id}
                        className="flex items-center justify-between gap-3 p-3 text-sm"
                      >
                        <div className="min-w-0">
                          <p className="break-words font-medium">
                            {component.label}
                          </p>
                          <p className="break-words text-xs text-muted-foreground">
                            {component.sourceType}
                          </p>
                        </div>
                        <p className="font-semibold tabular-nums">
                          {asNumber(component.count) === null
                            ? "Not counted"
                            : component.count}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="p-4 text-sm text-muted-foreground">
                      No source-level headcount components.
                    </p>
                  )}
                </CardContent>
              </Card>
              <Card className="min-w-0">
                <CardHeader className="border-b pb-3">
                  <CardTitle className="text-base">
                    Obligations ({(event.obligations ?? []).length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="divide-y p-0">
                  {(event.obligations ?? []).length ? (
                    event.obligations.map((obligation: any) => (
                      <div key={obligation.id} className="p-3 text-sm">
                        <div className="flex items-start justify-between gap-3">
                          <p className="min-w-0 break-words font-medium leading-tight">
                            {obligation.title}
                          </p>
                          <p className="shrink-0 text-xs font-semibold">
                            {money(obligation.amountAtRisk)}
                          </p>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {dateLabel(obligation.dueDate)}
                          {obligation.amountNote
                            ? ` · ${obligation.amountNote}`
                            : ""}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="p-4 text-sm text-muted-foreground">
                      No obligations linked to this event.
                    </p>
                  )}
                </CardContent>
              </Card>
              <Card className="min-w-0">
                <CardHeader className="border-b pb-3">
                  <CardTitle className="text-base">
                    Sponsor activity ({relatedAsks.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="divide-y p-0">
                  {relatedAsks.length || relatedClaims.length ? (
                    <>
                      {relatedAsks.map(({ sponsor, ask }) => (
                        <div
                          key={`${sponsor.id}-${ask.id}`}
                          className="flex items-center justify-between gap-3 p-3 text-sm"
                        >
                          <div className="min-w-0">
                            <p className="break-words font-medium">
                              {sponsor.companyName}
                            </p>
                            <p className="break-words text-xs text-muted-foreground">
                              {sponsor.category || "Uncategorized"}
                              {ask.sponsorshipTier
                                ? ` · ${ask.sponsorshipTier}`
                                : ""}
                              {(ask.deliverables ?? []).length
                                ? ` · ${(ask.deliverables ?? []).filter((deliverable: any) => deliverable.status === "delivered").length}/${(ask.deliverables ?? []).length} deliverables delivered`
                                : " · No deliverables added"}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold">{money(ask.amount)}</p>
                            <Badge
                              variant="outline"
                              className={`mt-1 ${stageClass(ask.stage)}`}
                            >
                              {ask.stage}
                            </Badge>
                          </div>
                        </div>
                      ))}
                      {relatedClaims.map(claim => (
                        <div key={`claim-${claim.id}`} className="p-3 text-sm">
                          <p className="break-words font-medium">
                            {claim.category} exclusivity
                          </p>
                          <p className="mt-1 break-words text-xs text-muted-foreground">
                            {claim.sponsor?.companyName ||
                              claim.holderName ||
                              "Unclaimed"}
                            {claim.isWritten ? " · Written" : " · Not written"}
                          </p>
                        </div>
                      ))}
                    </>
                  ) : (
                    <p className="p-4 text-sm text-muted-foreground">
                      No sponsor asks or exclusivity records.
                    </p>
                  )}
                </CardContent>
              </Card>
            </section>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Timeline({
  events,
  onCreate,
  onEdit,
  onDelete,
  onOpen,
}: {
  events: EventRecord[];
  onCreate: () => void;
  onEdit: (event: EventRecord) => void;
  onDelete: (event: EventRecord) => void;
  onOpen: (event: EventRecord) => void;
}) {
  const first = useMemo(
    () =>
      events
        .filter(event => dateValue(event.startDate))
        .map(event => dateValue(event.startDate)!)
        .sort((a, b) => a.getTime() - b.getTime())[0] ?? new Date(),
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
              Click an event to open its profile. Add, edit, or delete an event
              from this timeline without leaving the operating view.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={onCreate}>
              <Plus className="mr-1.5 h-4 w-4" />
              Add event
            </Button>
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
        <CardContent className="space-y-5 overflow-x-auto p-5">
          <div
            className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4"
            aria-label="Event tier legend"
          >
            {[1, 2, 3, 4].map(tier => {
              const detail = TIER_DETAILS[tier];
              return (
                <div
                  key={tier}
                  className="flex items-start gap-2 rounded-lg border bg-card p-3"
                >
                  <span
                    className={`mt-1 h-3 w-3 shrink-0 rounded-sm ${tierClass(tier)}`}
                  />
                  <div>
                    <p className="text-sm font-semibold">{detail.label}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                      {detail.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="min-w-[960px]">
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
            <p className="mb-4 text-sm font-medium">{rangeLabel}</p>
            {[1, 2, 3, 4].map(tier => {
              const tierEvents = inWindow.filter(
                event => Number(event.tier) === tier
              );
              const detail = TIER_DETAILS[tier];
              return (
                <div key={tier} className="mb-5 rounded-lg border p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <span
                      className={`h-2.5 w-2.5 rounded-sm ${tierClass(tier)}`}
                    />
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                      {detail.label}
                    </p>
                    <span className="text-xs text-muted-foreground">
                      {tierEvents.length
                        ? `${tierEvents.length} scheduled`
                        : "No dates in this view"}
                    </span>
                  </div>
                  {tierEvents.length ? (
                    tierEvents.map(event => {
                      const start = dateValue(event.startDate)!;
                      const end = dateValue(event.endDate ?? event.startDate)!;
                      const rawLeft =
                        (differenceInCalendarDays(start, windowStart) /
                          rangeDays) *
                        100;
                      const rawRight =
                        ((differenceInCalendarDays(end, windowStart) + 1) /
                          rangeDays) *
                        100;
                      const left = Math.max(0, rawLeft);
                      const width = Math.max(
                        2.2,
                        Math.min(100, rawRight) - left
                      );
                      const actionLeft = Math.min(83, left + width + 1);
                      return (
                        <div
                          key={event.id}
                          className="relative mb-2 h-10 rounded bg-slate-50/80 last:mb-0"
                        >
                          <button
                            type="button"
                            onClick={() => onOpen(event)}
                            className={`absolute top-1 flex h-8 items-center rounded px-2 text-left text-xs font-semibold shadow-sm transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 ${tierClass(tier)}`}
                            style={{ left: `${left}%`, width: `${width}%` }}
                            title={`Open ${event.name}: ${dateLabel(event.startDate)} to ${dateLabel(event.endDate ?? event.startDate)}`}
                            aria-label={`Open ${event.name}`}
                          >
                            <span className="truncate">
                              {width > 11 ? event.name : ""}
                            </span>
                          </button>
                          <div
                            className="absolute top-1 flex h-8 max-w-[280px] items-center gap-1"
                            style={{ left: `${actionLeft}%` }}
                          >
                            <button
                              type="button"
                              onClick={() => onOpen(event)}
                              className="truncate rounded px-1 text-left text-xs font-medium hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
                              title={`Open ${event.name}`}
                            >
                              {event.name}
                            </button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 shrink-0 text-slate-600 hover:bg-cyan-100 hover:text-cyan-800"
                              onClick={() => onEdit(event)}
                              aria-label={`Edit ${event.name}`}
                              title={`Edit ${event.name}`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 shrink-0 text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                              onClick={() => onDelete(event)}
                              aria-label={`Delete ${event.name}`}
                              title={`Delete ${event.name}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="py-2 text-sm text-muted-foreground">
                      No {detail.label.toLowerCase()} events in this date range.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex-row flex-wrap items-end justify-between gap-3">
          <div>
            <CardTitle className="text-base">No confirmed timeline</CardTitle>
            <CardDescription>
              These events stay visible without inventing dates. Under
              evaluation records belong here until a timeline is confirmed.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={onCreate}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add event
          </Button>
        </CardHeader>
        <CardContent>
          {undated.length ? (
            <ul className="space-y-3">
              {undated.map(event => {
                const detail =
                  TIER_DETAILS[Number(event.tier)] ?? TIER_DETAILS[4];
                return (
                  <li
                    key={event.id}
                    className="flex items-start justify-between gap-3 rounded-lg border p-3"
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
                      onClick={() => onOpen(event)}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`h-2.5 w-2.5 rounded-sm ${tierClass(Number(event.tier))}`}
                        />
                        <p className="font-medium hover:underline">
                          {event.name}
                        </p>
                        <Badge variant="outline" className={detail.badgeClass}>
                          {detail.label}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {event.status} · {event.city || "Location not set"}
                      </p>
                    </button>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => onEdit(event)}
                        aria-label={`Edit ${event.name}`}
                        title={`Edit ${event.name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <DeleteButton
                        label={event.name}
                        onDelete={() => onDelete(event)}
                      />
                    </div>
                  </li>
                );
              })}
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
  const datedObligations = obligations.map(obligation => ({
    ...obligation,
    daysRemaining: daysUntil(obligation.dueDate),
  }));
  const upcoming = datedObligations
    .filter(item => item.daysRemaining !== null && item.daysRemaining >= 0)
    .sort(
      (a, b) =>
        a.daysRemaining! - b.daysRemaining! ||
        (dateKey(a.dueDate) ?? "").localeCompare(dateKey(b.dueDate) ?? "")
    );
  const past = datedObligations
    .filter(item => item.daysRemaining !== null && item.daysRemaining < 0)
    .sort(
      (a, b) =>
        b.daysRemaining! - a.daysRemaining! ||
        (dateKey(b.dueDate) ?? "").localeCompare(dateKey(a.dueDate) ?? "")
    );
  const undated = datedObligations.filter(item => item.daysRemaining === null);
  const deadlineGroups = [
    {
      key: "upcoming",
      label: "Upcoming",
      detail: "Sorted by nearest date",
      items: upcoming,
    },
    {
      key: "past",
      label: "Past due",
      detail: "Needs re-dating, completion, or escalation",
      items: past,
    },
    {
      key: "undated",
      label: "No date",
      detail: "Cannot enter the deadline queue until dated",
      items: undated,
    },
  ];
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
            {deadlineGroups.map((group, groupIndex) => (
              <div key={group.key} className={groupIndex ? "border-t" : ""}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 bg-slate-50 px-4 py-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                    {group.label}{" "}
                    <span className="ml-1 text-muted-foreground">
                      ({group.items.length})
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {group.detail}
                  </p>
                </div>
                {group.items.length ? (
                  group.items.map(item => (
                    <div
                      key={item.id}
                      className={`grid gap-3 border-l-4 p-4 md:grid-cols-[120px_minmax(0,1fr)_180px_40px] ${deadlineTone(item.dueDate)}`}
                    >
                      <div>
                        <InlineDate
                          value={item.dueDate}
                          onSave={dueDate =>
                            updateObligation(item, { dueDate })
                          }
                          ariaLabel={`${item.title} due date`}
                        />
                        <p className="text-xs text-muted-foreground">
                          {item.daysRemaining === null
                            ? "Undated"
                            : item.daysRemaining < 0
                              ? `${Math.abs(item.daysRemaining)} days ago`
                              : `${item.daysRemaining} days`}
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
                              updateObligation(item, {
                                eventId: Number(eventId),
                              })
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
                              updateObligation(item, {
                                isPayable: value === "yes",
                              })
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
                  ))
                ) : (
                  <p className="px-4 py-5 text-sm text-muted-foreground">
                    {group.key === "upcoming"
                      ? "No upcoming dated obligations."
                      : group.key === "past"
                        ? "No past-due obligations."
                        : "Every obligation has a date."}
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function expenseStatusClass(status: string | null | undefined) {
  const classes: Record<string, string> = {
    planned: "border-slate-200 bg-slate-50 text-slate-700",
    invoiced: "border-amber-200 bg-amber-50 text-amber-700",
    paid: "border-emerald-200 bg-emerald-50 text-emerald-700",
    reimbursed: "border-cyan-200 bg-cyan-50 text-cyan-700",
    void: "border-slate-200 bg-slate-100 text-slate-500",
  };
  return classes[status ?? ""] ?? classes.planned;
}

function deliverableStatusClass(status: string | null | undefined) {
  const classes: Record<string, string> = {
    not_started: "border-slate-200 bg-slate-50 text-slate-700",
    booked: "border-cyan-200 bg-cyan-50 text-cyan-800",
    delivered: "border-emerald-200 bg-emerald-50 text-emerald-700",
  };
  return classes[status ?? ""] ?? classes.not_started;
}

function deliverableTypeClass(type: string | null | undefined) {
  return type === "contractual"
    ? "border-rose-200 bg-rose-50 text-rose-800"
    : "border-violet-200 bg-violet-50 text-violet-800";
}

function DeliverableChangeRecord({
  deliverable,
  recordChange,
}: {
  deliverable: any;
  recordChange: (deliverable: any, input: any) => void;
}) {
  const [changeType, setChangeType] = useState(deliverable.changeType ?? "");
  const [writtenNotice, setWrittenNotice] = useState(
    deliverable.changeNotice ?? ""
  );
  const [noticeSentAt, setNoticeSentAt] = useState(
    dateKey(deliverable.changeNoticeSentAt) ?? ""
  );
  useEffect(() => {
    setChangeType(deliverable.changeType ?? "");
    setWrittenNotice(deliverable.changeNotice ?? "");
    setNoticeSentAt(dateKey(deliverable.changeNoticeSentAt) ?? "");
  }, [
    deliverable.id,
    deliverable.version,
    deliverable.changeType,
    deliverable.changeNotice,
    deliverable.changeNoticeSentAt,
  ]);
  const changed = Boolean(changeType);
  const contractual = deliverable.deliverableType === "contractual";
  const requiresNotice = changed && contractual;
  const missingNotice =
    requiresNotice && (!writtenNotice.trim() || !noticeSentAt);
  return (
    <div
      className={`mt-3 rounded-md border p-3 ${changed && contractual ? "border-rose-200 bg-rose-50/60" : "border-slate-200 bg-slate-50/70"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">
            Change record
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {contractual
              ? "A dropped or substituted contractual promise requires written notice and the date it was sent."
              : "Courtesy changes are retained here for operating history; written notice is optional."}
          </p>
        </div>
        {changed ? (
          <Badge
            variant="outline"
            className={
              missingNotice
                ? "border-rose-300 bg-rose-100 text-rose-800"
                : "border-amber-200 bg-amber-100 text-amber-800"
            }
          >
            {missingNotice
              ? "Written notice missing"
              : contractual
                ? "Change recorded"
                : "Courtesy change logged"}
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="border-slate-200 bg-white text-slate-600"
          >
            No change recorded
          </Badge>
        )}
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-[minmax(150px,0.45fr)_minmax(0,1fr)_150px_auto] md:items-end">
        <label className="space-y-1">
          <span className="text-xs font-medium">Change</span>
          <Select
            value={changeType || "__none"}
            onValueChange={value =>
              setChangeType(value === "__none" ? "" : value)
            }
          >
            <SelectTrigger className="h-8 w-full bg-white text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">No change</SelectItem>
              {DELIVERABLE_CHANGE_OPTIONS.map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium">Written notice sent</span>
          <Textarea
            value={writtenNotice}
            onChange={event => setWrittenNotice(event.target.value)}
            placeholder={
              changed
                ? "State what was sent to the sponsor"
                : "No notice needed while unchanged"
            }
            disabled={!changed}
            className="min-h-8 resize-y bg-white py-1.5 text-sm"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium">Sent date</span>
          <Input
            type="date"
            value={noticeSentAt}
            onChange={event => setNoticeSentAt(event.target.value)}
            disabled={!changed}
            className="h-8 bg-white text-sm"
          />
        </label>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant={changed ? "default" : "outline"}
            disabled={changed && missingNotice}
            onClick={() =>
              recordChange(deliverable, {
                changeType: changeType || null,
                writtenNotice: writtenNotice.trim() || null,
                noticeSentAt: noticeSentAt || null,
              })
            }
          >
            {changed ? "Save record" : "Confirm none"}
          </Button>
        </div>
      </div>
      {changed && missingNotice ? (
        <p className="mt-2 text-xs font-medium text-rose-700">
          {contractual
            ? "This contractual change cannot be saved until the written notice and sent date are captured."
            : ""}
        </p>
      ) : null}
    </div>
  );
}

function DeliverableTracker({
  ask,
  createDeliverable,
  updateDeliverable,
  deleteDeliverable,
  recordDeliverableChange,
}: {
  ask: any;
  createDeliverable: (input: any) => void;
  updateDeliverable: (deliverable: any, patch: any) => void;
  deleteDeliverable: (deliverable: any) => void;
  recordDeliverableChange: (deliverable: any, input: any) => void;
}) {
  const deliverables = ask.deliverables ?? [];
  const delivered = deliverables.filter(
    (deliverable: any) => deliverable.status === "delivered"
  ).length;
  const open = deliverables.length - delivered;
  const changed = deliverables.filter((deliverable: any) =>
    Boolean(deliverable.changeType)
  ).length;
  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-3 py-3">
        <div>
          <p className="text-sm font-semibold">Sponsor deliverables</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {deliverables.length
              ? `${delivered} delivered · ${open} open · ${changed} change record${changed === 1 ? "" : "s"}`
              : "Track every sponsor promise by status, type, and change record."}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() =>
            createDeliverable({
              sponsorAskId: ask.id,
              title: "New deliverable",
              status: "not_started",
              deliverableType: "contractual",
            })
          }
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add deliverable
        </Button>
      </div>
      {deliverables.length ? (
        <div className="divide-y">
          {deliverables.map((deliverable: any) => (
            <div key={deliverable.id} className="min-w-0 p-3">
              <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(140px,0.68fr)_minmax(145px,0.68fr)_minmax(110px,0.55fr)_minmax(0,0.65fr)_auto] lg:items-center">
                <div className="min-w-0">
                  <InlineText
                    value={deliverable.title}
                    onSave={title => {
                      if (title) updateDeliverable(deliverable, { title });
                    }}
                    ariaLabel="deliverable title"
                    className="block max-w-full font-medium not-italic"
                  />
                  <InlineText
                    value={deliverable.description}
                    onSave={description =>
                      updateDeliverable(deliverable, { description })
                    }
                    placeholder="Add details"
                    ariaLabel={`${deliverable.title} details`}
                    className="mt-1 block max-w-full text-xs not-italic"
                  />
                </div>
                <div className="min-w-0">
                  <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Status
                  </p>
                  <InlineSelect
                    value={deliverable.status}
                    options={DELIVERABLE_STATUS_OPTIONS}
                    onSave={status =>
                      updateDeliverable(deliverable, { status })
                    }
                    ariaLabel={`${deliverable.title} status`}
                    className={`w-full border px-2 ${deliverableStatusClass(deliverable.status)}`}
                  />
                </div>
                <div className="min-w-0">
                  <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Type
                  </p>
                  <InlineSelect
                    value={deliverable.deliverableType}
                    options={DELIVERABLE_TYPE_OPTIONS}
                    onSave={deliverableType =>
                      updateDeliverable(deliverable, { deliverableType })
                    }
                    ariaLabel={`${deliverable.title} type`}
                    className={`w-full border px-2 ${deliverableTypeClass(deliverable.deliverableType)}`}
                  />
                </div>
                <div className="min-w-0">
                  <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Due
                  </p>
                  <InlineDate
                    value={deliverable.dueDate}
                    onSave={dueDate =>
                      updateDeliverable(deliverable, { dueDate })
                    }
                    placeholder="No due date"
                    ariaLabel={`${deliverable.title} due date`}
                  />
                </div>
                <div className="min-w-0">
                  <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Owner
                  </p>
                  <InlineText
                    value={deliverable.ownerName}
                    onSave={ownerName =>
                      updateDeliverable(deliverable, { ownerName })
                    }
                    placeholder="Assign owner"
                    ariaLabel={`${deliverable.title} owner`}
                    className="block max-w-full not-italic"
                  />
                </div>
                <DeleteButton
                  label={deliverable.title}
                  onDelete={() => deleteDeliverable(deliverable)}
                />
              </div>
              <DeliverableChangeRecord
                deliverable={deliverable}
                recordChange={recordDeliverableChange}
              />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ExpenseTracker({
  events,
  createExpense,
  updateExpense,
  deleteExpense,
  uploadInvoice,
}: {
  events: EventRecord[];
  createExpense: (input: any) => void;
  updateExpense: (expense: any, patch: any) => void;
  deleteExpense: (expense: any) => void;
  uploadInvoice: (eventId: number, file: File) => Promise<void>;
}) {
  const [scope, setScope] = useState("all");
  const [entryEventId, setEntryEventId] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!events.length) return;
    const valid = events.some(event => String(event.id) === entryEventId);
    if (!valid) setEntryEventId(String(events[0].id));
  }, [events, entryEventId]);

  const eventById = new Map(events.map(event => [Number(event.id), event]));
  const rows = events
    .flatMap(event =>
      (event.expenses ?? []).map((expense: any) => ({ event, expense }))
    )
    .filter(
      ({ event }) => scope === "all" || String(event.id) === String(scope)
    );
  const activeExpenses = rows.filter(
    ({ expense }) => expense.status !== "void"
  );
  const total = activeExpenses.reduce(
    (sum, { expense }) => sum + (asNumber(expense.amount) ?? 0),
    0
  );
  const paid = rows
    .filter(({ expense }) => ["paid", "reimbursed"].includes(expense.status))
    .reduce((sum, { expense }) => sum + (asNumber(expense.amount) ?? 0), 0);
  const invoiceCount = rows.filter(
    ({ expense }) => expense.invoiceFileUrl
  ).length;
  const targetEvent = eventById.get(Number(entryEventId));
  const scopeLabel =
    scope === "all"
      ? "Portfolio-level expense ledger"
      : (eventById.get(Number(scope))?.name ?? "Event expense ledger");

  const handleInvoice = async (file: File) => {
    if (!targetEvent) {
      toast.error("Select the event that owns this invoice first.");
      return;
    }
    setIsUploading(true);
    try {
      await uploadInvoice(targetEvent.id, file);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-xl border bg-slate-50/70 p-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Expenses</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {scopeLabel}. Every line is tied to a single event, while portfolio
            view rolls the full event ledger together.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:w-[520px]">
          <label className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">
              View ledger
            </span>
            <Select
              value={scope}
              onValueChange={value => {
                setScope(value);
                if (value !== "all") setEntryEventId(value);
              }}
            >
              <SelectTrigger aria-label="Expense ledger view">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All events</SelectItem>
                {events.map(event => (
                  <SelectItem key={event.id} value={String(event.id)}>
                    {event.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">
              Add invoice or expense to
            </span>
            <Select value={entryEventId} onValueChange={setEntryEventId}>
              <SelectTrigger aria-label="Event for new expense">
                <SelectValue placeholder="Select event" />
              </SelectTrigger>
              <SelectContent>
                {events.map(event => (
                  <SelectItem key={event.id} value={String(event.id)}>
                    {event.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Expenses in view"
          value={money(total)}
          detail={`${activeExpenses.length} active line${activeExpenses.length === 1 ? "" : "s"}`}
        />
        <Metric
          label="Paid or reimbursed"
          value={money(paid)}
          detail="Cash status from the expense ledger"
        />
        <Metric
          label="Open or invoiced"
          value={money(Math.max(total - paid, 0))}
          detail="Planned or invoiced spend"
        />
        <Metric
          label="Attached invoices"
          value={String(invoiceCount)}
          detail="Stored against event expenses"
        />
      </section>

      <section className="flex flex-wrap justify-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,image/jpeg,image/png,image/webp"
          onChange={event => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void handleInvoice(file);
          }}
        />
        <Button
          variant="outline"
          disabled={!targetEvent || isUploading}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="mr-1.5 h-4 w-4" />
          {isUploading ? "Uploading invoice…" : "Upload invoice"}
        </Button>
        <Button
          disabled={!targetEvent}
          onClick={() => {
            if (!targetEvent) return;
            createExpense({
              eventId: targetEvent.id,
              description: "New expense",
              category: "Other",
              status: "planned",
            });
          }}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Add expense
        </Button>
      </section>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="bg-slate-950 text-left text-xs uppercase tracking-wide text-slate-100">
              <tr>
                {scope === "all" ? <th className="px-3 py-3">Event</th> : null}
                <th className="px-3 py-3">Date</th>
                <th className="px-3 py-3">Vendor</th>
                <th className="px-3 py-3">Expense</th>
                <th className="px-3 py-3">Category</th>
                <th className="px-3 py-3 text-right">Amount</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Invoice</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map(({ event, expense }) => (
                  <tr key={expense.id} className="border-b align-top">
                    {scope === "all" ? (
                      <td className="max-w-48 px-3 py-3 font-medium">
                        <span className="block break-words">{event.name}</span>
                      </td>
                    ) : null}
                    <td className="px-3 py-3">
                      <InlineDate
                        value={expense.expenseDate}
                        onSave={expenseDate =>
                          updateExpense(expense, { expenseDate })
                        }
                        ariaLabel={`${expense.description} expense date`}
                      />
                    </td>
                    <td className="max-w-44 px-3 py-3">
                      <InlineText
                        value={expense.vendorName}
                        onSave={vendorName =>
                          updateExpense(expense, { vendorName })
                        }
                        placeholder="Add vendor"
                        ariaLabel={`${expense.description} vendor`}
                        className="block max-w-full break-words not-italic"
                      />
                    </td>
                    <td className="max-w-56 px-3 py-3">
                      <InlineText
                        value={expense.description}
                        onSave={description => {
                          if (description)
                            updateExpense(expense, { description });
                        }}
                        ariaLabel="expense description"
                        className="block max-w-full break-words font-medium not-italic"
                      />
                      {expense.categorizationNote ? (
                        <p className="mt-1 max-w-56 text-xs leading-relaxed text-muted-foreground">
                          {expense.categorizationNote}
                        </p>
                      ) : null}
                    </td>
                    <td className="max-w-44 px-3 py-3">
                      <InlineText
                        value={expense.category}
                        onSave={category => {
                          if (category) updateExpense(expense, { category });
                        }}
                        ariaLabel={`${expense.description} category`}
                        className="block max-w-full break-words not-italic"
                      />
                    </td>
                    <td className="px-3 py-3 text-right">
                      <InlineNumber
                        value={expense.amount}
                        onSave={amount => updateExpense(expense, { amount })}
                        prefix="$"
                        placeholder="Set amount"
                        ariaLabel={`${expense.description} amount`}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <InlineSelect
                        value={expense.status}
                        options={EXPENSE_STATUS_OPTIONS}
                        onSave={status => updateExpense(expense, { status })}
                        ariaLabel={`${expense.description} status`}
                        className={`border px-2 ${expenseStatusClass(expense.status)}`}
                      />
                    </td>
                    <td className="px-3 py-3">
                      {expense.invoiceFileUrl ? (
                        <a
                          href={expense.invoiceFileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded text-cyan-700 hover:underline"
                        >
                          <FileText className="h-4 w-4" />
                          <span className="max-w-32 truncate">
                            {expense.invoiceFileName || "Open invoice"}
                          </span>
                        </a>
                      ) : (
                        <span className="text-muted-foreground">No file</span>
                      )}
                    </td>
                    <td>
                      <DeleteButton
                        label={expense.description}
                        onDelete={() => deleteExpense(expense)}
                      />
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={scope === "all" ? 9 : 8}
                    className="px-4 py-12 text-center text-sm text-muted-foreground"
                  >
                    No expenses in this view. Add a line or upload an invoice to
                    begin the ledger.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function SponsorPaymentObligations({
  ask,
  sponsor,
  event,
  obligations,
  createObligation,
  updateObligation,
  deleteObligation,
}: {
  ask: any;
  sponsor: SponsorRecord;
  event: EventRecord;
  obligations: any[];
  createObligation: (input: any) => void;
  updateObligation: (obligation: any, patch: any) => void;
  deleteObligation: (obligation: any) => void;
}) {
  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-3 py-3">
        <div>
          <p className="text-sm font-semibold">Sponsor payment obligations</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Deposit and balance dates are obligations. They appear in the
            portfolio Radar with venue balances and quote expiries.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            ["Deposit due", "Sponsor deposit"],
            ["Balance due", "Sponsor balance"],
          ].map(([label, amountNote]) => (
            <Button
              key={label}
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                createObligation({
                  eventId: event.id,
                  sponsorId: sponsor.id,
                  sponsorAskId: ask.id,
                  title: `${sponsor.companyName} ${label.toLowerCase()}`,
                  amountAtRisk: null,
                  amountNote,
                  isPayable: true,
                  ownerName: "",
                  status: "Open",
                  consequence:
                    "Sponsor payment is due; follow up with the sponsor and confirm the commitment terms.",
                })
              }
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              {label}
            </Button>
          ))}
        </div>
      </div>
      {obligations.length ? (
        <div className="divide-y">
          {obligations.map((obligation: any) => (
            <div
              key={obligation.id}
              className="grid min-w-0 gap-3 p-3 lg:grid-cols-[minmax(0,1.2fr)_130px_130px_minmax(0,0.8fr)_120px_auto] lg:items-center"
            >
              <div className="min-w-0">
                <InlineText
                  value={obligation.title}
                  onSave={title => {
                    if (title) updateObligation(obligation, { title });
                  }}
                  ariaLabel={`${sponsor.companyName} payment obligation title`}
                  className="block max-w-full font-medium not-italic"
                />
                <InlineText
                  value={obligation.consequence}
                  onSave={consequence =>
                    updateObligation(obligation, { consequence })
                  }
                  placeholder="What happens if this date is missed?"
                  multiline
                  ariaLabel={`${sponsor.companyName} payment obligation consequence`}
                  className="mt-1 block max-w-full text-xs not-italic"
                />
              </div>
              <div className="min-w-0">
                <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Due
                </p>
                <InlineDate
                  value={obligation.dueDate}
                  onSave={dueDate => updateObligation(obligation, { dueDate })}
                  ariaLabel={`${sponsor.companyName} payment due date`}
                />
              </div>
              <div className="min-w-0 text-right">
                <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Amount
                </p>
                <InlineNumber
                  value={obligation.amountAtRisk}
                  onSave={amountAtRisk =>
                    updateObligation(obligation, { amountAtRisk })
                  }
                  prefix="$"
                  placeholder="Set amount"
                  ariaLabel={`${sponsor.companyName} payment amount`}
                />
              </div>
              <div className="min-w-0">
                <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Owner
                </p>
                <InlineText
                  value={obligation.ownerName}
                  onSave={ownerName =>
                    updateObligation(obligation, { ownerName })
                  }
                  placeholder="Assign owner"
                  ariaLabel={`${sponsor.companyName} payment obligation owner`}
                  className="block max-w-full not-italic"
                />
              </div>
              <div className="min-w-0">
                <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Status
                </p>
                <InlineSelect
                  value={obligation.status}
                  options={[
                    ["Open", "Open"],
                    ["Closed", "Closed"],
                  ]}
                  onSave={status => updateObligation(obligation, { status })}
                  ariaLabel={`${sponsor.companyName} payment obligation status`}
                  className="w-full border px-2"
                />
              </div>
              <DeleteButton
                label={`${sponsor.companyName} payment obligation`}
                onDelete={() => deleteObligation(obligation)}
              />
            </div>
          ))}
        </div>
      ) : (
        <p className="p-3 text-sm text-muted-foreground">
          No deposit or balance due dates are set for this sponsor commitment.
        </p>
      )}
    </div>
  );
}

type SponsorCartItem = {
  eventId: number;
  sponsorshipTier: string;
  amount: string;
  stage: string;
};

function SponsorProfileWorkspace({
  sponsor,
  events,
  updateSponsor,
  deleteSponsor,
  upsertAsk,
  deleteAsk,
  createDeliverable,
  updateDeliverable,
  deleteDeliverable,
  recordDeliverableChange,
  createObligation,
  updateObligation,
  deleteObligation,
}: {
  sponsor: SponsorRecord | null;
  events: EventRecord[];
  updateSponsor: (sponsor: SponsorRecord, patch: any) => void;
  deleteSponsor: (sponsor: SponsorRecord) => void;
  upsertAsk: (
    sponsor: SponsorRecord,
    event: EventRecord,
    ask: any,
    patch: any
  ) => void;
  deleteAsk: (ask: any) => void;
  createDeliverable: (input: any) => void;
  updateDeliverable: (deliverable: any, patch: any) => void;
  deleteDeliverable: (deliverable: any) => void;
  recordDeliverableChange: (deliverable: any, input: any) => void;
  createObligation: (input: any) => void;
  updateObligation: (obligation: any, patch: any) => void;
  deleteObligation: (obligation: any) => void;
}) {
  const [statusTab, setStatusTab] = useState("all");
  const [cart, setCart] = useState<SponsorCartItem[]>([]);

  useEffect(() => {
    setStatusTab("all");
    setCart([]);
  }, [sponsor?.id]);

  if (!sponsor) return null;
  const asks = sponsor.asks ?? [];
  const eventFor = (eventId: number) =>
    events.find(event => Number(event.id) === Number(eventId));
  const tabAsks = (tab: string) =>
    asks.filter((ask: any) => {
      if (tab === "all") return true;
      if (tab === "proposed")
        return ["proposed", "target", "verbal"].includes(ask.stage);
      if (tab === "invoiced") return ask.stage === "invoiced";
      if (tab === "signed") return ask.stage === "signed";
      return ["partner", "speaker"].includes(ask.stage);
    });
  const linkedEventIds = new Set(asks.map((ask: any) => Number(ask.eventId)));
  const availableEvents = events.filter(
    event =>
      !linkedEventIds.has(Number(event.id)) &&
      !cart.some(item => Number(item.eventId) === Number(event.id))
  );
  const addToCart = (event: EventRecord) =>
    setCart(items => [
      ...items,
      {
        eventId: event.id,
        sponsorshipTier: "",
        amount: "",
        stage: "proposed",
      },
    ]);
  const updateCart = (eventId: number, patch: Partial<SponsorCartItem>) =>
    setCart(items =>
      items.map(item =>
        item.eventId === eventId ? { ...item, ...patch } : item
      )
    );
  const saveCart = () => {
    if (!cart.length) return;
    for (const item of cart) {
      const amount = item.amount.trim() === "" ? null : Number(item.amount);
      if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
        return toast.error("Each sponsorship amount must be zero or greater.");
      }
      const event = eventFor(item.eventId);
      if (!event)
        return toast.error("One event in this cart no longer exists.");
    }
    cart.forEach(item => {
      const event = eventFor(item.eventId)!;
      upsertAsk(sponsor, event, null, {
        sponsorshipTier: item.sponsorshipTier.trim() || null,
        amount: item.amount.trim() === "" ? null : Number(item.amount),
        stage: item.stage,
      });
    });
    toast.success(
      `${cart.length} sponsorship commitment${cart.length === 1 ? "" : "s"} added.`
    );
    setCart([]);
  };

  const CommitmentCard = ({ ask }: { ask: any }) => {
    const event = eventFor(Number(ask.eventId));
    if (!event) return null;
    const tier = TIER_DETAILS[Number(event.tier)] ?? TIER_DETAILS[4];
    return (
      <div className="min-w-0 rounded-lg border bg-slate-50/70 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`h-2.5 w-2.5 shrink-0 rounded-sm ${tierClass(Number(event.tier))}`}
              />
              <p className="break-words font-semibold">{event.name}</p>
              <Badge variant="outline" className={tier.badgeClass}>
                {tier.label}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {dateValue(event.startDate)
                ? dateLabel(event.startDate)
                : "Timeline unconfirmed"}
            </p>
          </div>
          <DeleteButton
            label={`${sponsor.companyName} commitment for ${event.name}`}
            onDelete={() => deleteAsk(ask)}
          />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="min-w-0 space-y-1">
            <span className="text-xs font-medium text-muted-foreground">
              Sponsorship tier
            </span>
            <InlineText
              value={ask.sponsorshipTier}
              onSave={sponsorshipTier =>
                upsertAsk(sponsor, event, ask, { sponsorshipTier })
              }
              placeholder="Set tier"
              ariaLabel={`${sponsor.companyName} sponsorship tier for ${event.name}`}
              className="block w-full border border-slate-200 bg-white px-2 py-1.5 text-sm not-italic"
            />
          </label>
          <label className="min-w-0 space-y-1">
            <span className="text-xs font-medium text-muted-foreground">
              Commitment amount
            </span>
            <InlineNumber
              value={ask.amount}
              onSave={amount => upsertAsk(sponsor, event, ask, { amount })}
              prefix="$"
              placeholder="Set amount"
              ariaLabel={`${sponsor.companyName} commitment amount for ${event.name}`}
              className="block w-full border border-slate-200 bg-white px-2 py-1.5 text-left not-italic"
            />
          </label>
          <label className="min-w-0 space-y-1">
            <span className="text-xs font-medium text-muted-foreground">
              Commitment status
            </span>
            <InlineSelect
              value={ask.stage}
              options={ASK_STAGE_OPTIONS}
              onSave={stage => upsertAsk(sponsor, event, ask, { stage })}
              ariaLabel={`${sponsor.companyName} status for ${event.name}`}
              className={`w-full border px-2 ${stageClass(ask.stage)}`}
            />
          </label>
        </div>
        <DeliverableTracker
          ask={ask}
          createDeliverable={createDeliverable}
          updateDeliverable={updateDeliverable}
          deleteDeliverable={deleteDeliverable}
          recordDeliverableChange={recordDeliverableChange}
        />
        <SponsorPaymentObligations
          ask={ask}
          sponsor={sponsor}
          event={event}
          obligations={(event.obligations ?? []).filter(
            (obligation: any) =>
              Number(obligation.sponsorAskId) === Number(ask.id)
          )}
          createObligation={createObligation}
          updateObligation={updateObligation}
          deleteObligation={deleteObligation}
        />
      </div>
    );
  };

  const outstandingDeliverables = asks.reduce(
    (total: number, ask: any) =>
      total +
      (ask.deliverables ?? []).filter(
        (deliverable: any) =>
          !["delivered", "waived"].includes(deliverable.status)
      ).length,
    0
  );
  const openPaymentObligations = asks.reduce((total: number, ask: any) => {
    const event = events.find(
      event => Number(event.id) === Number(ask.eventId)
    );
    const count = (event?.obligations ?? []).filter(
      (obligation: any) =>
        Number(obligation.sponsorAskId) === Number(ask.id) &&
        obligation.status !== "Closed"
    ).length;
    return total + count;
  }, 0);
  const bookedSponsorValue = asks
    .filter((ask: any) => ["signed", "invoiced"].includes(ask.stage))
    .reduce(
      (total: number, ask: any) => total + (asNumber(ask.amount) ?? 0),
      0
    );

  return (
    <section className="min-w-0 overflow-hidden rounded-xl border bg-card shadow-sm">
      <header className="border-b bg-slate-50/70 px-5 py-5 sm:px-6">
        <div className="grid min-w-0 gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
          <div className="min-w-0">
            <h2 className="break-words text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">
              {sponsor.companyName}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              One company record, with simultaneous commitments across any
              number of events and sponsorship tiers.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 text-rose-700 hover:bg-rose-50 hover:text-rose-700"
            onClick={() => deleteSponsor(sponsor)}
          >
            <Trash2 className="mr-1.5 h-4 w-4" />
            Delete company
          </Button>
        </div>
      </header>

      <div className="space-y-6 p-5 sm:p-6">
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <ProfileDatum
            label="Booked sponsor value"
            value={money(bookedSponsorValue)}
            detail="Signed or invoiced"
          />
          <ProfileDatum
            label="Open pipeline"
            value={String(tabAsks("proposed").length)}
            detail="Proposed, verbal, or target"
          />
          <ProfileDatum
            label="Active commitments"
            value={String(asks.length)}
            detail="Across all events"
          />
          <ProfileDatum
            label="Open payment obligations"
            value={String(openPaymentObligations)}
            detail={`${outstandingDeliverables} deliverable${outstandingDeliverables === 1 ? "" : "s"} still open`}
          />
        </section>
        <section className="grid gap-3 sm:grid-cols-2">
          <ProfileDatum
            label="Primary contact"
            value={sponsor.contactName || "Not assigned"}
          />
          <ProfileDatum
            label="Category"
            value={sponsor.category || "Not set"}
          />
        </section>
        <section className="grid gap-3 sm:grid-cols-3">
          <label className="space-y-1.5">
            <span className="text-sm font-medium">Company name</span>
            <InlineText
              value={sponsor.companyName}
              onSave={companyName => {
                if (companyName) updateSponsor(sponsor, { companyName });
              }}
              ariaLabel={`${sponsor.companyName} company name`}
              className="block w-full border bg-white px-2 py-2 not-italic"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-sm font-medium">Primary contact</span>
            <InlineText
              value={sponsor.contactName}
              onSave={contactName => updateSponsor(sponsor, { contactName })}
              placeholder="Add primary contact"
              ariaLabel={`${sponsor.companyName} primary contact`}
              className="block w-full border bg-white px-2 py-2 not-italic"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-sm font-medium">Company category</span>
            <InlineText
              value={sponsor.category}
              onSave={category => updateSponsor(sponsor, { category })}
              placeholder="Add company category"
              ariaLabel={`${sponsor.companyName} category`}
              className="block w-full border bg-white px-2 py-2 not-italic"
            />
          </label>
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)]">
          <Card className="min-w-0">
            <CardHeader className="border-b pb-4">
              <CardTitle className="text-base">Commitments by status</CardTitle>
              <CardDescription>
                Each commitment belongs to one event and has its own sponsorship
                tier, amount, and commercial status.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4">
              <Tabs value={statusTab} onValueChange={setStatusTab}>
                <TabsList className="h-auto w-full justify-start overflow-x-auto">
                  {[
                    ["all", "All"],
                    ["proposed", "Proposed"],
                    ["invoiced", "Invoiced"],
                    ["signed", "Signed"],
                    ["other", "Other"],
                  ].map(([value, label]) => (
                    <TabsTrigger key={value} value={value}>
                      {label}{" "}
                      <span className="ml-1 rounded-full bg-muted px-1.5 text-xs">
                        {tabAsks(value).length}
                      </span>
                    </TabsTrigger>
                  ))}
                </TabsList>
                {["all", "proposed", "invoiced", "signed", "other"].map(tab => (
                  <TabsContent key={tab} value={tab} className="mt-4 space-y-3">
                    {tabAsks(tab).length ? (
                      tabAsks(tab).map((ask: any) => (
                        <CommitmentCard key={ask.id} ask={ask} />
                      ))
                    ) : (
                      <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                        {tab === "all"
                          ? "No commitments yet."
                          : `No ${tab === "other" ? "other" : tab} commitments yet.`}
                      </p>
                    )}
                  </TabsContent>
                ))}
              </Tabs>
            </CardContent>
          </Card>

          <Card className="min-w-0">
            <CardHeader className="border-b pb-4">
              <CardTitle className="text-base">Add to event</CardTitle>
              <CardDescription>
                Build commitments here, then add them to the sponsor record.
                Signed and invoiced entries immediately update the event P/L.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 p-4">
              {cart.length ? (
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Commitment cart ({cart.length})
                  </p>
                  {cart.map(item => {
                    const event = eventFor(item.eventId);
                    if (!event) return null;
                    return (
                      <div key={item.eventId} className="rounded-lg border p-3">
                        <div className="flex items-start justify-between gap-2">
                          <p className="min-w-0 break-words text-sm font-semibold">
                            {event.name}
                          </p>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0 text-rose-600"
                            onClick={() =>
                              setCart(items =>
                                items.filter(
                                  entry => entry.eventId !== item.eventId
                                )
                              )
                            }
                            aria-label={`Remove ${event.name} from commitment cart`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="mt-3 grid gap-2">
                          <Input
                            value={item.sponsorshipTier}
                            onChange={event =>
                              updateCart(item.eventId, {
                                sponsorshipTier: event.target.value,
                              })
                            }
                            placeholder="Sponsorship tier, e.g. Gold"
                            aria-label={`${event.name} sponsorship tier`}
                            className="h-9 text-sm"
                          />
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.amount}
                            onChange={event =>
                              updateCart(item.eventId, {
                                amount: event.target.value,
                              })
                            }
                            placeholder="Commitment amount"
                            aria-label={`${event.name} commitment amount`}
                            className="h-9 text-sm"
                          />
                          <Select
                            value={item.stage}
                            onValueChange={stage =>
                              updateCart(item.eventId, { stage })
                            }
                          >
                            <SelectTrigger
                              className="h-9 w-full text-sm"
                              aria-label={`${event.name} commitment status`}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {ASK_STAGE_OPTIONS.map(([value, label]) => (
                                <SelectItem key={value} value={value}>
                                  {label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    );
                  })}
                  <Button className="w-full" onClick={saveCart}>
                    Add {cart.length} to sponsor record
                  </Button>
                </div>
              ) : null}
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Available events
                </p>
                {availableEvents.length ? (
                  availableEvents.map(event => {
                    const tier =
                      TIER_DETAILS[Number(event.tier)] ?? TIER_DETAILS[4];
                    return (
                      <div
                        key={event.id}
                        className="flex min-w-0 items-center justify-between gap-3 rounded-lg border p-3"
                      >
                        <div className="min-w-0">
                          <p className="break-words text-sm font-medium">
                            {event.name}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {tier.label}
                          </p>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="shrink-0"
                          onClick={() => addToCart(event)}
                        >
                          <Plus className="mr-1 h-3.5 w-3.5" />
                          Add
                        </Button>
                      </div>
                    );
                  })
                ) : (
                  <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                    This sponsor is already tied to every current event.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </section>
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
  createDeliverable,
  updateDeliverable,
  deleteDeliverable,
  recordDeliverableChange,
  createObligation,
  updateObligation,
  deleteObligation,
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
  createDeliverable: (input: any) => void;
  updateDeliverable: (deliverable: any, patch: any) => void;
  deleteDeliverable: (deliverable: any) => void;
  recordDeliverableChange: (deliverable: any, input: any) => void;
  createObligation: (input: any) => void;
  updateObligation: (obligation: any, patch: any) => void;
  deleteObligation: (obligation: any) => void;
  createSponsor: () => void;
  updateClaim: (claim: any, patch: any) => void;
  deleteClaim: (claim: any) => void;
  createClaim: () => void;
  updateUnaffiliated: (contact: any, patch: any) => void;
  deleteUnaffiliated: (contact: any) => void;
  createUnaffiliated: () => void;
}) {
  const [profileSponsorId, setProfileSponsorId] = useState<number | null>(
    () => sponsors[0]?.id ?? null
  );
  const [sponsorSearch, setSponsorSearch] = useState("");
  useEffect(() => {
    if (!sponsors.length) {
      if (profileSponsorId !== null) setProfileSponsorId(null);
      return;
    }
    if (!sponsors.some(sponsor => sponsor.id === profileSponsorId))
      setProfileSponsorId(sponsors[0].id);
  }, [sponsors, profileSponsorId]);
  const visibleSponsors = sponsors.filter(sponsor =>
    `${sponsor.companyName} ${sponsor.contactName ?? ""}`
      .toLowerCase()
      .includes(sponsorSearch.trim().toLowerCase())
  );
  const eventOptions = events.map(
    event => [String(event.id), event.name] as const
  );
  const profileSponsor =
    sponsors.find(sponsor => sponsor.id === profileSponsorId) ?? null;
  return (
    <div className="space-y-8">
      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Sponsors</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Select a company at left. Its commitments, money, and delivery
              work stay visible in the main workspace.
            </p>
          </div>
          <Button size="sm" onClick={createSponsor}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add sponsor
          </Button>
        </div>
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(260px,0.27fr)_minmax(0,0.73fr)]">
          <aside className="min-w-0 xl:sticky xl:top-4">
            <Card className="overflow-hidden">
              <CardHeader className="border-b p-4">
                <CardTitle className="text-base">Company roster</CardTitle>
                <CardDescription>
                  Company and primary contact only.
                </CardDescription>
                <Input
                  value={sponsorSearch}
                  onChange={event => setSponsorSearch(event.target.value)}
                  placeholder="Find a company"
                  aria-label="Find sponsor company"
                  className="mt-2 h-9"
                />
              </CardHeader>
              <CardContent className="max-h-[68vh] space-y-1 overflow-y-auto p-2">
                {visibleSponsors.length ? (
                  visibleSponsors.map(sponsor => {
                    const selected = sponsor.id === profileSponsorId;
                    return (
                      <button
                        key={sponsor.id}
                        type="button"
                        onClick={() => setProfileSponsorId(sponsor.id)}
                        className={`w-full rounded-lg px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 ${selected ? "bg-cyan-50 ring-1 ring-cyan-200" : "hover:bg-slate-50"}`}
                      >
                        <p className="break-words text-sm font-semibold text-slate-950">
                          {sponsor.companyName}
                        </p>
                        <p className="mt-1 break-words text-xs text-muted-foreground">
                          {sponsor.contactName ||
                            "Primary contact not assigned"}
                        </p>
                      </button>
                    );
                  })
                ) : (
                  <p className="p-3 text-sm text-muted-foreground">
                    No sponsor matches that search.
                  </p>
                )}
              </CardContent>
            </Card>
          </aside>
          <div className="min-w-0">
            {profileSponsor ? (
              <SponsorProfileWorkspace
                sponsor={profileSponsor}
                events={events}
                updateSponsor={updateSponsor}
                deleteSponsor={deleteSponsor}
                upsertAsk={upsertAsk}
                deleteAsk={deleteAsk}
                createDeliverable={createDeliverable}
                updateDeliverable={updateDeliverable}
                deleteDeliverable={deleteDeliverable}
                recordDeliverableChange={recordDeliverableChange}
                createObligation={createObligation}
                updateObligation={updateObligation}
                deleteObligation={deleteObligation}
              />
            ) : (
              <Card className="p-10 text-center text-sm text-muted-foreground">
                Select a company to open its sponsor workspace.
              </Card>
            )}
          </div>
        </div>
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
                          roster.map((sponsor, index) => (
                            <span
                              key={sponsor.id}
                              className={`mr-1 ${sponsor.companyName === claimedName ? "font-semibold text-cyan-800" : conflict ? "font-medium text-rose-700" : ""}`}
                            >
                              {sponsor.companyName}
                              {index < roster.length - 1 ? ", " : ""}
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

function EventOperationsRecord({
  event,
  sponsors,
  openProfile,
  openEdit,
  updateEvent,
  updateComponent,
  deleteComponent,
  addComponent,
}: {
  event: EventRecord;
  sponsors: SponsorRecord[];
  openProfile: (event: EventRecord) => void;
  openEdit: (event: EventRecord) => void;
  updateEvent: (patch: any) => void;
  updateComponent: (component: any, patch: any) => void;
  deleteComponent: (component: any) => void;
  addComponent: (eventId: number) => void;
}) {
  const tier = TIER_DETAILS[Number(event.tier)] ?? TIER_DETAILS[4];
  const financials = eventFinancials(event, sponsors);
  const headcount = eventHeadcount(event);
  const pAndLTone =
    financials.profitLoss < 0 ? "text-rose-700" : "text-emerald-700";
  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="flex flex-col gap-4 border-b bg-slate-50/70 p-4 lg:flex-row lg:items-start lg:justify-between">
        <button
          type="button"
          onClick={() => openProfile(event)}
          className="min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`h-2.5 w-2.5 rounded-sm ${tierClass(Number(event.tier))}`}
            />
            <h2 className="break-words text-lg font-semibold hover:underline">
              {event.name}
            </h2>
            <Badge variant="outline" className={tier.badgeClass}>
              {tier.label}
            </Badge>
            <Badge
              variant="outline"
              className="border-slate-200 bg-white text-slate-700"
            >
              {event.status}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {dateValue(event.startDate)
              ? event.endDate &&
                dateKey(event.endDate) !== dateKey(event.startDate)
                ? `${dateLabel(event.startDate)} – ${dateLabel(event.endDate)}`
                : dateLabel(event.startDate)
              : "Timeline not confirmed"}
            {event.city ? ` · ${event.city}` : ""}
          </p>
        </button>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => openProfile(event)}
          >
            Open record
          </Button>
          <Button size="sm" variant="outline" onClick={() => openEdit(event)}>
            <Pencil className="mr-1.5 h-4 w-4" />
            Edit
          </Button>
        </div>
      </div>
      <div className="grid divide-y sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-5">
        <div className="min-w-0 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Total sponsor income
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums">
            {money(financials.sponsorIncome)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {financials.bookedCount
              ? `${financials.bookedCount} signed or invoiced ask${financials.bookedCount === 1 ? "" : "s"}`
              : "No signed or invoiced asks"}
          </p>
        </div>
        <div className="min-w-0 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Active sponsorships selling
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums">
            {money(financials.active)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {financials.activeCount
              ? `${financials.activeCount} active ask${financials.activeCount === 1 ? "" : "s"}`
              : "No active asks"}
          </p>
        </div>
        <div className="min-w-0 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Headcount
          </p>
          <p
            className={`mt-1 text-xl font-semibold tabular-nums ${headcount.count === null ? "text-amber-700" : ""}`}
          >
            {headcount.count === null ? "Not counted" : headcount.count}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {headcount.source}
          </p>
        </div>
        <div className="min-w-0 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Committed expense
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums">
            {money(financials.expenses)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Current contractual or planned cost
          </p>
        </div>
        <div className="min-w-0 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Current P/L
          </p>
          <p className={`mt-1 text-xl font-semibold tabular-nums ${pAndLTone}`}>
            {money(financials.profitLoss)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Booked revenue less committed expense
          </p>
        </div>
      </div>
      <div className="border-t bg-white p-4">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">
              Custom headcount components
            </h3>
            <p className="text-xs text-muted-foreground">
              Dyl can name and count any component manually. Set the source to
              <span className="font-medium"> Swoogo: Registration type</span> to
              refresh only that component through verified Swoogo webhooks.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => addComponent(event.id)}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Add component
          </Button>
        </div>
        <HeadcountCard
          event={event}
          updateEvent={updateEvent}
          updateComponent={updateComponent}
          deleteComponent={deleteComponent}
          addComponent={addComponent}
        />
      </div>
    </section>
  );
}

function EventsHub({
  events,
  sponsors,
  openProfile,
  openEdit,
  updateEvent,
  updateComponent,
  deleteComponent,
  addComponent,
  createEvent,
}: {
  events: EventRecord[];
  sponsors: SponsorRecord[];
  openProfile: (event: EventRecord) => void;
  openEdit: (event: EventRecord) => void;
  updateEvent: (event: EventRecord, patch: any) => void;
  updateComponent: (component: any, patch: any) => void;
  deleteComponent: (component: any) => void;
  addComponent: (eventId: number) => void;
  createEvent: () => void;
}) {
  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Event records</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Every event is its own financial and operating record. Sponsor
            income and active asks are calculated from the sponsor ledger; costs
            and P/L stay tied to the event itself.
          </p>
        </div>
        <Button onClick={createEvent}>
          <Plus className="mr-1.5 h-4 w-4" />
          Add event
        </Button>
      </section>
      {events.length ? (
        events.map(event => (
          <EventOperationsRecord
            key={event.id}
            event={event}
            sponsors={sponsors}
            openProfile={openProfile}
            openEdit={openEdit}
            updateEvent={patch => updateEvent(event, patch)}
            updateComponent={updateComponent}
            deleteComponent={deleteComponent}
            addComponent={addComponent}
          />
        ))
      ) : (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center">
            <p className="font-medium">No event records yet.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Add the first event to start tracking sponsorship, cost, and
              components.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function EventsOverview({
  events,
  sponsors,
  openProfile,
}: {
  events: EventRecord[];
  sponsors: SponsorRecord[];
  openProfile: (event: EventRecord) => void;
}) {
  const rollup = events.reduce(
    (totals, event) => {
      const financials = eventFinancials(event, sponsors);
      return {
        revenue: totals.revenue + financials.revenue,
        expenses: totals.expenses + financials.expenses,
        sponsorIncome: totals.sponsorIncome + financials.sponsorIncome,
        activeSelling: totals.activeSelling + financials.active,
      };
    },
    { revenue: 0, expenses: 0, sponsorIncome: 0, activeSelling: 0 }
  );
  const profitLoss = rollup.revenue - rollup.expenses;
  const externalCommitments = events
    .filter(event => Number(event.tier) === 3)
    .reduce((sum, event) => sum + (asNumber(event.committedCost) ?? 0), 0);

  return (
    <div className="space-y-6">
      <section className="grid overflow-hidden rounded-xl border bg-border sm:grid-cols-2 xl:grid-cols-5">
        <Metric
          value={money(rollup.sponsorIncome)}
          label="Aggregate sponsor income"
          detail="Signed, invoiced, or legacy booked sponsor revenue."
        />
        <Metric
          value={money(rollup.expenses)}
          label="Aggregate committed expense"
          detail="Contracted or planned costs across the portfolio."
          tone={rollup.expenses ? "warning" : "default"}
        />
        <Metric
          value={money(profitLoss)}
          label="Portfolio P/L"
          detail="Booked revenue less committed expense."
          tone={profitLoss < 0 ? "danger" : "default"}
        />
        <Metric
          value={money(rollup.activeSelling)}
          label="Active sponsorships selling"
          detail="Target, proposed, and verbal asks still in play."
        />
        <Metric
          value={money(externalCommitments)}
          label="Outstanding commitments to other events"
          detail="Tier 3 commitments to external events, including the $105,000 current baseline."
          tone={externalCommitments ? "warning" : "default"}
        />
      </section>

      <section>
        <div className="mb-3">
          <h2 className="text-xl font-semibold">Event financials</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Revenue, expense, and P/L are visible event by event. Open a record
            to manage the underlying sponsors, obligations, and components.
          </p>
        </div>
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-sm">
              <thead className="bg-slate-950 text-left text-xs uppercase tracking-wide text-slate-100">
                <tr>
                  <th className="px-4 py-3">Event</th>
                  <th className="px-4 py-3 text-right">Sponsor income</th>
                  <th className="px-4 py-3 text-right">Active selling</th>
                  <th className="px-4 py-3 text-right">Booked revenue</th>
                  <th className="px-4 py-3 text-right">Committed expense</th>
                  <th className="px-4 py-3 text-right">P/L</th>
                  <th className="px-4 py-3">Headcount</th>
                </tr>
              </thead>
              <tbody>
                {events.map(event => {
                  const financials = eventFinancials(event, sponsors);
                  const headcount = eventHeadcount(event);
                  return (
                    <tr
                      key={event.id}
                      className="border-b last:border-b-0 hover:bg-slate-50"
                    >
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => openProfile(event)}
                          className="flex min-w-0 items-center gap-2 text-left font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
                        >
                          <span
                            className={`h-2.5 w-2.5 shrink-0 rounded-sm ${tierClass(Number(event.tier))}`}
                          />
                          <span className="max-w-64 truncate">
                            {event.name}
                          </span>
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">
                        {money(financials.sponsorIncome)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {money(financials.active)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {money(financials.revenue)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {money(financials.expenses)}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-semibold tabular-nums ${financials.profitLoss < 0 ? "text-rose-700" : "text-emerald-700"}`}
                      >
                        {money(financials.profitLoss)}
                      </td>
                      <td className="px-4 py-3">
                        {headcount.count === null
                          ? headcount.source
                          : `${headcount.count} · ${headcount.source}`}
                      </td>
                    </tr>
                  );
                })}
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
          <h2 className="text-xl font-semibold">Portfolio position</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Portfolio-wide event administration. Tier describes operating
            responsibility, not priority, and never supplies a revenue-share
            default.
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
          <CardTitle className="text-base">Swoogo component boundary</CardTitle>
          <CardDescription>
            Swoogo webhooks trigger a full recount only for components whose
            source is explicitly mapped as{" "}
            <code>Swoogo: Registration type</code>. Manual and Organizer
            components are never overwritten, and unknown registration types
            remain visible in integration activity for correction.
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
            label="Mapped component sync"
            good={integration?.countedSourceAutomationEnabled}
            goodText="Ready for mapped components"
            waitingText="Requires both Swoogo API credentials and a webhook token"
          />
        </div>
        <Card className="border-cyan-200 bg-cyan-50">
          <CardContent className="flex gap-3 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-cyan-700" />
            <div>
              <p className="font-medium text-cyan-950">
                Map only the components Swoogo should own
              </p>
              <p className="mt-1 text-sm text-cyan-900">
                Name a component however Dyl needs it, then set its source to
                <code> Swoogo: Registration type</code>, using the exact
                registration type in Swoogo. A verified webhook triggers a full
                recount for those mapped components only. Manual and Organizer
                counts never change from provider deliveries.
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
                          className={
                            activity.status === "processed"
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : activity.status === "failed"
                                ? "border-rose-200 bg-rose-50 text-rose-700"
                                : "border-amber-200 bg-amber-50 text-amber-700"
                          }
                        >
                          {activity.status === "processed"
                            ? "Synced"
                            : activity.status === "failed"
                              ? "Needs attention"
                              : "Awaiting sync"}
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
          optionally <code>SWOOGO_WEBHOOK_HEADER</code>. Configure a JSON
          registrant create/update webhook to deliver POSTs to{" "}
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
  const [profileEventId, setProfileEventId] = useState<number | null>(null);
  const [editingEventId, setEditingEventId] = useState<number | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const refresh = () => void utils.events.overview.invalidate();
  const mutationOptions = {
    onSuccess: refresh,
    onError: (error: any) =>
      toast.error(
        error.message ?? "Unable to save this Events Console change."
      ),
  };
  const createEvent = trpc.events.createEvent.useMutation(mutationOptions);
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
  const createExpenseMutation =
    trpc.events.createExpense.useMutation(mutationOptions);
  const updateExpenseMutation =
    trpc.events.updateExpense.useMutation(mutationOptions);
  const deleteExpenseMutation =
    trpc.events.deleteExpense.useMutation(mutationOptions);
  const createDeliverableMutation =
    trpc.events.createDeliverable.useMutation(mutationOptions);
  const updateDeliverableMutation =
    trpc.events.updateDeliverable.useMutation(mutationOptions);
  const deleteDeliverableMutation =
    trpc.events.deleteDeliverable.useMutation(mutationOptions);
  const recordDeliverableChangeMutation =
    trpc.events.recordDeliverableChange.useMutation(mutationOptions);
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
  const nextObligation = events
    .flatMap((event: any) =>
      (event.obligations ?? []).map((obligation: any) => ({
        ...obligation,
        event,
      }))
    )
    .filter((obligation: any) => (daysUntil(obligation.dueDate) ?? -1) >= 0)
    .sort(
      (a: any, b: any) =>
        (daysUntil(a.dueDate) ?? Number.MAX_SAFE_INTEGER) -
          (daysUntil(b.dueDate) ?? Number.MAX_SAFE_INTEGER) ||
        (dateKey(a.dueDate) ?? "").localeCompare(dateKey(b.dueDate) ?? "")
    )[0];

  const updateEvent = (event: any, patch: any) =>
    updateEventMutation.mutate({ id: event.id, version: event.version, patch });
  const openCreateEvent = () => {
    setEditingEventId(null);
    setEditorOpen(true);
  };
  const openEditEvent = (event: EventRecord) => {
    setEditingEventId(event.id);
    setEditorOpen(true);
  };
  const saveEventFromTimeline = (event: EventRecord | null, patch: any) => {
    if (event) {
      updateEventMutation.mutate(
        { id: event.id, version: event.version, patch },
        {
          onSuccess: () => {
            toast.success("Event updated.");
            setEditorOpen(false);
            refresh();
          },
        }
      );
      return;
    }
    createEvent.mutate(patch, {
      onSuccess: () => {
        toast.success("Event added to the timeline.");
        setEditorOpen(false);
        refresh();
      },
    });
  };
  const deleteEvent = (event: any) => {
    if (
      window.confirm(
        `Delete ${event.name}? Its obligations, headcount, claims, and asks will be removed too.`
      )
    ) {
      if (profileEventId === event.id) setProfileEventId(null);
      if (editingEventId === event.id) setEditorOpen(false);
      deleteEventMutation.mutate({ id: event.id, version: event.version });
    }
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
      sponsorshipTier:
        patch.sponsorshipTier !== undefined
          ? patch.sponsorshipTier
          : (ask?.sponsorshipTier ?? null),
      amount: patch.amount !== undefined ? patch.amount : asNumber(ask?.amount),
      stage: patch.stage ?? ask?.stage ?? "proposed",
    });
  const deleteAsk = (ask: any) =>
    deleteAskMutation.mutate({ id: ask.id, version: ask.version });
  const updateExpense = (expense: any, patch: any) =>
    updateExpenseMutation.mutate({
      id: expense.id,
      version: expense.version,
      patch,
    });
  const deleteExpense = (expense: any) =>
    deleteExpenseMutation.mutate({ id: expense.id, version: expense.version });
  const updateDeliverable = (deliverable: any, patch: any) =>
    updateDeliverableMutation.mutate({
      id: deliverable.id,
      version: deliverable.version,
      patch,
    });
  const deleteDeliverable = (deliverable: any) =>
    deleteDeliverableMutation.mutate({
      id: deliverable.id,
      version: deliverable.version,
    });
  const recordDeliverableChange = (deliverable: any, input: any) =>
    recordDeliverableChangeMutation.mutate({
      id: deliverable.id,
      version: deliverable.version,
      ...input,
    });
  const uploadEventInvoice = async (eventId: number, file: File) => {
    const form = new FormData();
    form.append("eventId", String(eventId));
    form.append("file", file);
    const response = await fetch("/api/events/upload-invoice", {
      method: "POST",
      body: form,
      credentials: "include",
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error ?? "Invoice upload failed.");
    toast.success("Invoice uploaded and added to the event expense ledger.");
    refresh();
  };
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
    <div className="mx-auto w-full max-w-[1800px] space-y-6 pb-10">
      <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 via-[#07364a] to-cyan-900 px-6 py-7 text-white">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-cyan-100">
              <CalendarDays className="h-5 w-5" />
              <span className="text-sm font-medium">
                Events financial + operations control
              </span>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">
              Savvy Events Console
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-cyan-50/80">
              One financial and operating record per event. Track revenue,
              expense, sponsorship, components, and commitments without losing
              the tier view.
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
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="h-auto w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview">
            <CircleDollarSign className="mr-1.5 h-4 w-4" />
            Events overview
          </TabsTrigger>
          <TabsTrigger value="records">
            <CalendarDays className="mr-1.5 h-4 w-4" />
            Event records{" "}
            <span className="ml-1.5 rounded-full bg-muted px-1.5 text-xs">
              {events.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="portfolio">
            <ExternalLink className="mr-1.5 h-4 w-4" />
            Portfolio position
          </TabsTrigger>
          <TabsTrigger value="timeline">
            <Clock3 className="mr-1.5 h-4 w-4" />
            Timeline
          </TabsTrigger>
          <TabsTrigger value="expenses">
            <FileText className="mr-1.5 h-4 w-4" />
            Expenses
          </TabsTrigger>
          <TabsTrigger value="sponsors">
            <UsersRound className="mr-1.5 h-4 w-4" />
            Sponsors{" "}
            <span className="ml-1.5 rounded-full bg-muted px-1.5 text-xs">
              {overview?.sponsors?.length ?? 0}
            </span>
          </TabsTrigger>
          <TabsTrigger value="radar">
            <AlertTriangle className="mr-1.5 h-4 w-4" />
            Radar
          </TabsTrigger>
          <TabsTrigger value="model">
            <ExternalLink className="mr-1.5 h-4 w-4" />
            Data model
          </TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <EventsOverview
            events={events}
            sponsors={overview?.sponsors ?? []}
            openProfile={event => setProfileEventId(event.id)}
          />
        </TabsContent>
        <TabsContent value="records">
          <EventsHub
            events={events}
            sponsors={overview?.sponsors ?? []}
            openProfile={event => setProfileEventId(event.id)}
            openEdit={openEditEvent}
            updateEvent={updateEvent}
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
            createEvent={openCreateEvent}
          />
        </TabsContent>
        <TabsContent value="portfolio">
          <EventsTable
            events={events}
            updateEvent={updateEvent}
            deleteEvent={deleteEvent}
            createEvent={openCreateEvent}
          />
        </TabsContent>
        <TabsContent value="timeline">
          <Timeline
            events={events}
            onCreate={openCreateEvent}
            onEdit={openEditEvent}
            onDelete={deleteEvent}
            onOpen={event => setProfileEventId(event.id)}
          />
        </TabsContent>
        <TabsContent value="expenses">
          <ExpenseTracker
            events={events}
            createExpense={input => createExpenseMutation.mutate(input)}
            updateExpense={updateExpense}
            deleteExpense={deleteExpense}
            uploadInvoice={async (eventId, file) => {
              try {
                await uploadEventInvoice(eventId, file);
              } catch (error: any) {
                toast.error(error.message ?? "Invoice upload failed.");
                throw error;
              }
            }}
          />
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
            createDeliverable={input => createDeliverableMutation.mutate(input)}
            updateDeliverable={updateDeliverable}
            deleteDeliverable={deleteDeliverable}
            recordDeliverableChange={recordDeliverableChange}
            createObligation={input => createObligation.mutate(input)}
            updateObligation={updateObligation}
            deleteObligation={deleteObligation}
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
      <EventProfileDialog
        event={
          events.find((event: EventRecord) => event.id === profileEventId) ??
          null
        }
        sponsors={overview?.sponsors ?? []}
        claims={overview?.claims ?? []}
        onOpenChange={open => {
          if (!open) setProfileEventId(null);
        }}
        onEdit={event => {
          setProfileEventId(null);
          openEditEvent(event);
        }}
        onProjectLinkChanged={refresh}
      />
      <EventEditorDialog
        open={editorOpen}
        onOpenChange={open => {
          setEditorOpen(open);
          if (!open) setEditingEventId(null);
        }}
        event={
          events.find((event: EventRecord) => event.id === editingEventId) ??
          null
        }
        onSave={saveEventFromTimeline}
        isSaving={createEvent.isPending || updateEventMutation.isPending}
      />
    </div>
  );
}
