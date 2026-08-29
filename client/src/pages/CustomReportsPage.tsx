import { useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Database,
  Download,
  FilePlus2,
  Loader2,
  Play,
  RefreshCw,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import PageHeader from "@/components/PageHeader";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MultiSelect } from "@/components/ui/multi-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Dataset =
  | "transactions"
  | "contacts"
  | "proformas"
  | "appointments"
  | "tasks"
  | "website_activity";
type ReportMode = "aggregate" | "detail" | "comparison";
type ReportColumn = {
  key: string;
  label: string;
  type: "text" | "number";
  format?: "percent";
};
type ReportRow = Record<string, string | number | null>;
type ReportDefinition = {
  dataset: Dataset;
  mode: ReportMode;
  title: string;
  description: string;
  metrics: string[];
  groupBy: string;
  dateFrom: string | null;
  dateTo: string | null;
  dateBasis: "closing" | "contract" | "created";
  transactionStatus: "all" | "closed" | "under_contract" | "terminated";
  transactionType: "all" | "buyer" | "seller" | "dual";
  agentIds: number[];
  isaIds: number[];
  leadSourceIds: number[];
  emailFilter: "all" | "missing" | "present";
  detailColumns: string[];
  comparison: "none" | "prior_period";
  sortMetric: string;
  sortDirection: "asc" | "desc";
  limit: number;
};
type ReportResult = {
  definition: ReportDefinition;
  mode: ReportMode;
  columns: ReportColumn[];
  rows: ReportRow[];
  totalCount: number | null;
  isTruncated: boolean;
  summary: string;
  generatedAt: string;
  comparisonRange?: { from: string; to: string };
};
type ReportPlan = {
  prompt: string;
  definition: ReportDefinition;
  supportStatus: "supported" | "needs_clarification" | "unsupported";
  plannerMode: "ai" | "safe_fallback";
  preview: string;
  assumptions: string[];
  unsupportedConcepts: string[];
  clarification: string | null;
};
type GeneratedPayload = {
  prompt: string;
  report: ReportResult;
  savedReportId?: number;
};

const metricLabel = (value: string) => {
  const labels: Record<string, string> = {
    average_purchase_price: "Average Purchase Price",
    average_gross_commission: "Average Gross Commission",
    average_cash_flow: "Average Annual Cash Flow",
    average_cash_on_cash: "Average Cash-on-Cash Return",
    gross_commission: "Gross Commission",
    savvy_net: "Savvy Net",
  };
  return (
    labels[value] ??
    value.replace(/_/g, " ").replace(/\b\w/g, letter => letter.toUpperCase())
  );
};

const groupLabel = (value: string) =>
  value === "none"
    ? "No grouping"
    : value.replace(/_/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());

const datasetLabel: Record<Dataset, string> = {
  transactions: "Transactions",
  contacts: "Contacts",
  proformas: "Pro formas",
  appointments: "Appointments",
  tasks: "Tasks",
  website_activity: "Website activity",
};

const groupOptions: Record<Dataset, Array<{ value: string; label: string }>> = {
  transactions: [
    { value: "none", label: "No grouping" },
    { value: "agent", label: "Agent" },
    { value: "transaction_status", label: "Transaction status" },
    { value: "transaction_type", label: "Representation type" },
    { value: "closing_month", label: "Month" },
    { value: "lead_source", label: "Lead source" },
  ],
  contacts: [
    { value: "none", label: "No grouping" },
    { value: "lead_source", label: "Lead source" },
    { value: "contact_status", label: "Contact status" },
    { value: "contact_state", label: "State" },
    { value: "contact_created_month", label: "Month created" },
    { value: "assigned_isa", label: "Assigned ISA" },
  ],
  proformas: [
    { value: "none", label: "No grouping" },
    { value: "proforma_creator", label: "Creator" },
    { value: "proforma_status", label: "Status" },
    { value: "proforma_created_month", label: "Month created" },
  ],
  appointments: [
    { value: "none", label: "No grouping" },
    { value: "appointment_isa", label: "Assigned ISA" },
    { value: "appointment_agent", label: "Agent" },
    { value: "appointment_month", label: "Month" },
    { value: "lead_source", label: "Lead source" },
  ],
  tasks: [
    { value: "none", label: "No grouping" },
    { value: "task_assignee", label: "Assignee" },
    { value: "task_status", label: "Status" },
    { value: "task_type", label: "Task type" },
    { value: "task_created_month", label: "Month created" },
  ],
  website_activity: [
    { value: "none", label: "No grouping" },
    { value: "activity_type", label: "Activity type" },
    { value: "activity_created_month", label: "Month" },
    { value: "lead_source", label: "Lead source" },
    { value: "assigned_isa", label: "Assigned ISA" },
  ],
};

const currencyMetrics = new Set([
  "purchase_volume",
  "gross_commission",
  "savvy_net",
  "average_purchase_price",
  "average_gross_commission",
  "average_cash_flow",
]);
const fractionPercentMetrics = new Set(["average_cash_on_cash"]);

function formatValue(
  value: string | number | null | undefined,
  column: ReportColumn
): string {
  if (value === null || value === undefined || value === "") return "—";
  if (column.type !== "number") return String(value);
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "—";
  if (column.format === "percent") return `${numeric.toFixed(1)}%`;
  if (fractionPercentMetrics.has(column.key))
    return `${(numeric * 100).toFixed(1)}%`;
  if (currencyMetrics.has(column.key)) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(numeric);
  }
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
    numeric
  );
}

function downloadCsv(result: ReportResult) {
  const escape = (value: unknown) =>
    `"${String(value ?? "").replaceAll('"', '""')}"`;
  const rows = [
    result.columns.map(column => escape(column.label)).join(","),
    ...result.rows.map(row =>
      result.columns.map(column => escape(row[column.key])).join(",")
    ),
  ];
  const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = `${
    result.definition.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "custom-report"
  }.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(href);
}

function PlanStatus({ plan }: { plan: ReportPlan }) {
  const supported = plan.supportStatus === "supported";
  const needsClarification = plan.supportStatus === "needs_clarification";
  const Icon = supported ? CheckCircle2 : AlertTriangle;
  const color = supported
    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
    : needsClarification
      ? "border-amber-200 bg-amber-50 text-amber-950"
      : "border-rose-200 bg-rose-50 text-rose-950";
  const title = supported
    ? "Ready to run"
    : needsClarification
      ? "One choice needed before running"
      : "This request is not supported safely yet";

  return (
    <Card className={color}>
      <CardContent className="p-5">
        <div className="flex items-start gap-3">
          <Icon className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold">{title}</p>
              {plan.plannerMode === "safe_fallback" && (
                <Badge
                  variant="outline"
                  className="border-current bg-white/60 text-current"
                >
                  Safe fallback planner
                </Badge>
              )}
            </div>
            <p className="mt-1 text-sm leading-6">
              {plan.supportStatus === "unsupported"
                ? plan.clarification
                : plan.preview}
            </p>
            {plan.assumptions.length > 0 && (
              <p className="mt-2 text-xs leading-5 opacity-85">
                <span className="font-semibold">Assumption:</span>{" "}
                {plan.assumptions.join(" ")}
              </p>
            )}
            {plan.unsupportedConcepts.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {plan.unsupportedConcepts.map(concept => (
                  <Badge
                    key={concept}
                    variant="outline"
                    className="border-current/30 bg-white/50 text-current"
                  >
                    {concept}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function BuilderControls({
  definition,
  filters,
  disabled,
  onChange,
}: {
  definition: ReportDefinition;
  filters: any;
  disabled: boolean;
  onChange: (patch: Partial<ReportDefinition>) => void;
}) {
  const leadSources = filters?.leadSources ?? [];
  const parents = new Map(
    leadSources
      .filter((source: any) => !source.parentId)
      .map((source: any) => [source.id, source.name])
  );
  const sourceOptions = leadSources.map((source: any) => ({
    value: String(source.id),
    label: source.parentId
      ? `${parents.get(source.parentId) ?? "Unassigned category"} → ${source.name}`
      : source.name,
  }));
  const supportsAgentFilter = [
    "transactions",
    "proformas",
    "appointments",
    "tasks",
    "website_activity",
  ].includes(definition.dataset);
  const supportsIsaFilter = [
    "contacts",
    "appointments",
    "website_activity",
  ].includes(definition.dataset);
  const supportsSourceFilter = [
    "transactions",
    "contacts",
    "appointments",
    "website_activity",
  ].includes(definition.dataset);
  const dateBasisLabel =
    definition.dateBasis === "closing"
      ? "Closing date"
      : definition.dateBasis === "contract"
        ? "Contract date"
        : "Created date";

  return (
    <Card className="border-primary/15">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <SlidersHorizontal className="h-4 w-4 text-indigo-600" /> Review &
          adjust report plan
        </CardTitle>
        <CardDescription>
          These controls show exactly what SavvyOS will use. Changing a named
          scope here is safer than relying on the AI to guess it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">
            <Database className="mr-1 h-3.5 w-3.5" />{" "}
            {datasetLabel[definition.dataset]}
          </Badge>
          <Badge variant="secondary">
            {definition.mode === "detail"
              ? "Detail list"
              : definition.mode === "comparison"
                ? "Period comparison"
                : "Aggregate report"}
          </Badge>
          <Badge variant="outline">
            {definition.mode === "detail"
              ? "Contacts missing email"
              : `By ${groupLabel(definition.groupBy)}`}
          </Badge>
          {definition.metrics.map(metric => (
            <Badge key={metric} variant="outline">
              {metricLabel(metric)}
            </Badge>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="custom-report-from" className="text-xs">
              From
            </Label>
            <Input
              id="custom-report-from"
              type="date"
              value={definition.dateFrom ?? ""}
              disabled={disabled}
              onChange={event =>
                onChange({ dateFrom: event.target.value || null })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="custom-report-to" className="text-xs">
              To
            </Label>
            <Input
              id="custom-report-to"
              type="date"
              value={definition.dateTo ?? ""}
              disabled={disabled}
              onChange={event =>
                onChange({ dateTo: event.target.value || null })
              }
            />
          </div>
          {definition.dataset === "transactions" && (
            <div className="space-y-1.5">
              <Label className="text-xs">Date basis</Label>
              <Select
                value={definition.dateBasis}
                disabled={disabled}
                onValueChange={value =>
                  onChange({
                    dateBasis: value as ReportDefinition["dateBasis"],
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder={dateBasisLabel} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="closing">Closing date</SelectItem>
                  <SelectItem value="contract">Contract date</SelectItem>
                  <SelectItem value="created">Created date</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          {definition.mode === "aggregate" && (
            <div className="space-y-1.5">
              <Label className="text-xs">Group results by</Label>
              <Select
                value={definition.groupBy}
                disabled={disabled}
                onValueChange={value => onChange({ groupBy: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {groupOptions[definition.dataset].map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="custom-report-limit" className="text-xs">
              Rows to display
            </Label>
            <Input
              id="custom-report-limit"
              type="number"
              min={1}
              max={100}
              value={definition.limit}
              disabled={disabled}
              onChange={event =>
                onChange({
                  limit: Math.min(
                    100,
                    Math.max(1, Number(event.target.value) || 1)
                  ),
                })
              }
            />
          </div>
        </div>
        {(supportsSourceFilter || supportsAgentFilter || supportsIsaFilter) && (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {supportsSourceFilter && (
              <div className="space-y-1.5">
                <Label className="text-xs">Lead sources</Label>
                <MultiSelect
                  className="w-full"
                  options={sourceOptions}
                  value={definition.leadSourceIds.map(String)}
                  disabled={disabled}
                  onValueChange={values =>
                    onChange({ leadSourceIds: values.map(Number) })
                  }
                  placeholder="All lead sources"
                  searchPlaceholder="Search lead sources…"
                  maxDisplay={2}
                />
              </div>
            )}
            {supportsAgentFilter && (
              <div className="space-y-1.5">
                <Label className="text-xs">
                  {definition.dataset === "tasks" ? "Assignees" : "Agents"}
                </Label>
                <MultiSelect
                  className="w-full"
                  options={(filters?.agents ?? []).map((person: any) => ({
                    value: String(person.id),
                    label: person.name,
                  }))}
                  value={definition.agentIds.map(String)}
                  disabled={disabled}
                  onValueChange={values =>
                    onChange({ agentIds: values.map(Number) })
                  }
                  placeholder={
                    definition.dataset === "tasks"
                      ? "All assignees"
                      : "All agents"
                  }
                  searchPlaceholder="Search people…"
                  maxDisplay={2}
                />
              </div>
            )}
            {supportsIsaFilter && (
              <div className="space-y-1.5">
                <Label className="text-xs">Assigned ISAs</Label>
                <MultiSelect
                  className="w-full"
                  options={(filters?.isas ?? []).map((person: any) => ({
                    value: String(person.id),
                    label: person.name,
                  }))}
                  value={definition.isaIds.map(String)}
                  disabled={disabled}
                  onValueChange={values =>
                    onChange({ isaIds: values.map(Number) })
                  }
                  placeholder="All ISAs"
                  searchPlaceholder="Search ISAs…"
                  maxDisplay={2}
                />
              </div>
            )}
          </div>
        )}
        {definition.dataset === "transactions" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Status</Label>
              <Select
                value={definition.transactionStatus}
                disabled={disabled}
                onValueChange={value =>
                  onChange({
                    transactionStatus:
                      value as ReportDefinition["transactionStatus"],
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                  <SelectItem value="under_contract">Under contract</SelectItem>
                  <SelectItem value="terminated">Terminated</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Representation</Label>
              <Select
                value={definition.transactionType}
                disabled={disabled}
                onValueChange={value =>
                  onChange({
                    transactionType:
                      value as ReportDefinition["transactionType"],
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Buyer, seller, and dual</SelectItem>
                  <SelectItem value="buyer">Buyer</SelectItem>
                  <SelectItem value="seller">Seller</SelectItem>
                  <SelectItem value="dual">Dual agency</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
        <p className="text-xs leading-5 text-muted-foreground">
          <span className="font-medium text-foreground">Scope:</span>{" "}
          {definition.dateFrom ?? "All time"} → {definition.dateTo ?? "Today"} ·{" "}
          {definition.dataset === "transactions"
            ? dateBasisLabel
            : "Created date"}{" "}
          · At most 100 rows can be displayed at once.
        </p>
      </CardContent>
    </Card>
  );
}

export default function CustomReportsPage() {
  const [prompt, setPrompt] = useState("");
  const [plan, setPlan] = useState<ReportPlan | null>(null);
  const [generated, setGenerated] = useState<GeneratedPayload | null>(null);
  const [saveName, setSaveName] = useState("");
  const [savedReportId, setSavedReportId] = useState<number | null>(null);
  const [reportPendingDeletion, setReportPendingDeletion] = useState<{
    id: number;
    name: string;
  } | null>(null);
  const utils = trpc.useUtils();
  const suggestionsQuery = trpc.customReports.suggestions.useQuery();
  const filtersQuery = trpc.customReports.filters.useQuery();
  const savedReportsQuery = trpc.customReports.list.useQuery();

  const planMutation = trpc.customReports.plan.useMutation({
    onSuccess: payload => {
      const typed = payload as ReportPlan;
      setPlan(typed);
      setGenerated(null);
      setSavedReportId(null);
      setSaveName(typed.definition.title);
      if (typed.supportStatus === "unsupported")
        toast.error(
          "SavvyOS stopped an unsupported report request before it could produce a misleading result."
        );
      else if (typed.supportStatus === "needs_clarification")
        toast.message(
          "Choose the requested scope, then run the verified report."
        );
      else toast.success("Report plan ready for review.");
    },
    onError: error => toast.error(error.message),
  });
  const executeMutation = trpc.customReports.execute.useMutation({
    onSuccess: payload => {
      const typed = payload as GeneratedPayload;
      setGenerated(typed);
      toast.success("Verified report generated.");
    },
    onError: error => toast.error(error.message),
  });
  const rerunMutation = trpc.customReports.runDefinition.useMutation({
    onSuccess: payload => {
      setGenerated(payload as GeneratedPayload);
      toast.success("Report data refreshed.");
    },
    onError: error => toast.error(error.message),
  });
  const runSavedMutation = trpc.customReports.runSaved.useMutation({
    onSuccess: payload => {
      const typed = payload as GeneratedPayload;
      const definition = typed.report.definition;
      setGenerated(typed);
      setPrompt(typed.prompt);
      setPlan({
        prompt: typed.prompt,
        definition,
        supportStatus: "supported",
        plannerMode: "ai",
        preview: typed.report.summary,
        assumptions: [],
        unsupportedConcepts: [],
        clarification: null,
      });
      setSavedReportId(typed.savedReportId ?? null);
      setSaveName(definition.title);
      toast.success("Saved report refreshed.");
    },
    onError: error => toast.error(error.message),
  });
  const saveMutation = trpc.customReports.save.useMutation({
    onSuccess: payload => {
      utils.customReports.list.invalidate();
      setSavedReportId((payload as { id: number }).id);
      toast.success("Report saved to the shared library.");
    },
    onError: error => toast.error(error.message),
  });
  const updateMutation = trpc.customReports.update.useMutation({
    onSuccess: () => {
      utils.customReports.list.invalidate();
      toast.success("Saved report updated.");
    },
    onError: error => toast.error(error.message),
  });
  const removeMutation = trpc.customReports.remove.useMutation({
    onSuccess: () => {
      utils.customReports.list.invalidate();
      setReportPendingDeletion(null);
      toast.success("Saved report removed.");
    },
    onError: error => toast.error(error.message),
  });

  const running =
    planMutation.isPending ||
    executeMutation.isPending ||
    rerunMutation.isPending ||
    runSavedMutation.isPending;
  const saving = saveMutation.isPending || updateMutation.isPending;
  const report = generated?.report;
  const chartData = useMemo(() => {
    if (!report || report.mode === "detail" || report.rows.length < 2)
      return [];
    const metric =
      report.mode === "comparison"
        ? "current_period"
        : report.definition.sortMetric;
    return report.rows
      .slice(0, 12)
      .map(row => ({
        label: String(row.group_label ?? "All matching records"),
        value: Number(row[metric] ?? 0),
      }));
  }, [report]);
  const kpis = useMemo(() => {
    if (!report || report.mode !== "aggregate") return [];
    return report.columns
      .filter(column => column.type === "number")
      .slice(0, 4)
      .map(column => ({
        column,
        value: report.rows.reduce(
          (total, row) => total + Number(row[column.key] ?? 0),
          0
        ),
      }));
  }, [report]);

  const updatePlanDefinition = (patch: Partial<ReportDefinition>) => {
    setPlan(current => {
      if (!current) return current;
      const definition = { ...current.definition, ...patch };
      const nowScoped = Boolean(
        definition.agentIds.length ||
          definition.isaIds.length ||
          definition.leadSourceIds.length
      );
      return current.supportStatus === "needs_clarification" && nowScoped
        ? {
            ...current,
            definition,
            supportStatus: "supported",
            clarification: null,
            assumptions: [
              ...current.assumptions,
              "A visible report scope has been selected.",
            ],
          }
        : { ...current, definition };
    });
  };
  const createPlan = () => {
    if (prompt.trim().length < 12) return;
    planMutation.mutate({ prompt: prompt.trim() });
  };
  const runPlan = () => {
    if (!plan || plan.supportStatus === "unsupported") return;
    executeMutation.mutate({
      prompt: plan.prompt,
      definition: plan.definition as any,
    });
  };
  const saveReport = () => {
    if (!plan || !saveName.trim()) return;
    const payload = {
      name: saveName.trim(),
      prompt: plan.prompt,
      definition: plan.definition as any,
    };
    if (savedReportId) updateMutation.mutate({ id: savedReportId, ...payload });
    else saveMutation.mutate(payload);
  };

  return (
    <div className="space-y-6 pb-10">
      <PageHeader
        title="Custom AI Report"
        subtitle="Describe the question. SavvyOS will show the exact, safeguarded report plan before it runs."
      />

      <Card className="border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-emerald-50">
        <CardContent className="flex items-start gap-3 p-5">
          <div className="rounded-lg bg-indigo-100 p-2 text-indigo-700">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <p className="font-medium text-slate-900">
              Verified reporting, not black-box answers
            </p>
            <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-600">
              AI interprets your question, but SavvyOS runs only a reviewed,
              allowlisted report definition. If a request needs data this page
              cannot safely produce, it will explain the gap instead of
              substituting a different answer.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-indigo-600" /> Ask for a
                    report
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Start with the outcome you need. You will review the source,
                    scope, and calculations before any report runs.
                  </CardDescription>
                </div>
                <Badge
                  variant="outline"
                  className="w-fit border-indigo-200 bg-indigo-50 text-indigo-700"
                >
                  Plan → review → run
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={prompt}
                onChange={event => setPrompt(event.target.value)}
                placeholder="Example: Show contacts missing an email address by lead source for the last 30 days."
                className="min-h-[132px] resize-y"
                maxLength={2000}
              />
              <div className="flex flex-wrap gap-2">
                {(suggestionsQuery.data ?? []).map(suggestion => (
                  <Button
                    key={suggestion}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-auto whitespace-normal py-2 text-left text-xs"
                    onClick={() => {
                      setPrompt(suggestion);
                      setPlan(null);
                      setGenerated(null);
                    }}
                  >
                    <Sparkles className="mr-1.5 h-3.5 w-3.5 shrink-0 text-indigo-600" />{" "}
                    {suggestion}
                  </Button>
                ))}
              </div>
              <div className="flex justify-end">
                <Button
                  onClick={createPlan}
                  disabled={running || prompt.trim().length < 12}
                  className="min-w-44"
                >
                  {planMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="mr-2 h-4 w-4" />
                  )}
                  Create report plan
                </Button>
              </div>
            </CardContent>
          </Card>

          {plan && (
            <>
              <PlanStatus plan={plan} />
              {plan.supportStatus !== "unsupported" && (
                <BuilderControls
                  definition={plan.definition}
                  filters={filtersQuery.data}
                  disabled={running || filtersQuery.isLoading}
                  onChange={updatePlanDefinition}
                />
              )}
              {plan.supportStatus === "needs_clarification" && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  {plan.clarification}
                </p>
              )}
              {plan.supportStatus === "supported" && (
                <div className="flex justify-end">
                  <Button
                    onClick={runPlan}
                    disabled={running || filtersQuery.isLoading}
                    className="min-w-40"
                  >
                    {executeMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="mr-2 h-4 w-4" />
                    )}
                    Run verified report
                  </Button>
                </div>
              )}
              {plan.supportStatus === "needs_clarification" && (
                <div className="flex justify-end">
                  <Button
                    onClick={runPlan}
                    disabled={
                      running ||
                      filtersQuery.isLoading ||
                      !(
                        plan.definition.agentIds.length ||
                        plan.definition.isaIds.length ||
                        plan.definition.leadSourceIds.length
                      )
                    }
                    className="min-w-40"
                  >
                    {executeMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="mr-2 h-4 w-4" />
                    )}
                    Run after scoping
                  </Button>
                </div>
              )}
            </>
          )}

          {report && (
            <>
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <CardTitle>{report.definition.title}</CardTitle>
                      <CardDescription className="mt-1 max-w-3xl">
                        {report.definition.description}
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          rerunMutation.mutate({
                            definition: report.definition as any,
                          })
                        }
                        disabled={running}
                      >
                        {rerunMutation.isPending ? (
                          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="mr-1.5 h-4 w-4" />
                        )}
                        Refresh data
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => downloadCsv(report)}
                      >
                        <Download className="mr-1.5 h-4 w-4" />
                        Export CSV
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">
                      {datasetLabel[report.definition.dataset]}
                    </Badge>
                    <Badge variant="secondary">
                      {report.mode === "detail"
                        ? "Detail list"
                        : report.mode === "comparison"
                          ? "Current vs. prior period"
                          : `By ${groupLabel(report.definition.groupBy)}`}
                    </Badge>
                    <Badge variant="secondary">
                      {report.definition.dateFrom ?? "All time"} →{" "}
                      {report.definition.dateTo ?? "Today"}
                    </Badge>
                  </div>
                  <p className="text-sm leading-6 text-muted-foreground">
                    {report.summary} Generated{" "}
                    {new Date(report.generatedAt).toLocaleString()}.
                  </p>
                  {report.isTruncated && (
                    <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      {report.totalCount === null
                        ? `This grouped view reached its ${report.rows.length.toLocaleString()}-row display limit and may omit additional results.`
                        : `Showing the first ${report.rows.length.toLocaleString()} of ${report.totalCount.toLocaleString()} matching records.`}{" "}
                      Increase the row limit (up to 100) or narrow the scope
                      before exporting.
                    </p>
                  )}
                  {kpis.length > 0 && (
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      {kpis.map(({ column, value }) => (
                        <div
                          key={column.key}
                          className="rounded-lg border bg-muted/20 p-3"
                        >
                          <p className="text-xs font-medium text-muted-foreground">
                            Total {column.label}
                          </p>
                          <p className="mt-1 text-lg font-semibold tabular-nums">
                            {formatValue(value, column)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="max-h-[520px] overflow-auto rounded-md border">
                    <table className="w-full min-w-[680px] text-sm">
                      <thead className="sticky top-0 bg-muted/95 text-left">
                        <tr>
                          {report.columns.map(column => (
                            <th
                              key={column.key}
                              className="px-4 py-3 font-medium"
                            >
                              {column.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {report.rows.map((row, index) => (
                          <tr
                            key={`${row.group_key}-${index}`}
                            className="hover:bg-muted/40"
                          >
                            {report.columns.map(column => (
                              <td
                                key={column.key}
                                className={`px-4 py-3 ${column.type === "number" ? "font-medium tabular-nums" : ""}`}
                              >
                                {formatValue(row[column.key], column)}
                              </td>
                            ))}
                          </tr>
                        ))}
                        {report.rows.length === 0 && (
                          <tr>
                            <td
                              colSpan={report.columns.length}
                              className="px-4 py-10 text-center text-muted-foreground"
                            >
                              No records match this verified report definition.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    CSV export contains the rows currently shown in this
                    verified view.
                  </p>
                </CardContent>
              </Card>

              {chartData.length > 1 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <BarChart3 className="h-4 w-4 text-indigo-600" />
                      {report.mode === "comparison"
                        ? "Current-period lead volume by source"
                        : `${metricLabel(report.definition.sortMetric)} by ${groupLabel(report.definition.groupBy)}`}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={chartData}
                        margin={{ top: 8, right: 16, left: 0, bottom: 44 }}
                      >
                        <CartesianGrid vertical={false} strokeDasharray="3 3" />
                        <XAxis
                          dataKey="label"
                          tick={{ fontSize: 11 }}
                          interval={0}
                          angle={-22}
                          textAnchor="end"
                          height={64}
                        />
                        <YAxis tick={{ fontSize: 11 }} width={72} />
                        <Tooltip
                          formatter={(value: number) =>
                            new Intl.NumberFormat("en-US", {
                              maximumFractionDigits: 0,
                            }).format(value)
                          }
                        />
                        <Bar
                          dataKey="value"
                          fill="#4f46e5"
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {plan && plan.supportStatus !== "unsupported" && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      {savedReportId
                        ? "Update saved report"
                        : "Save this report"}
                    </CardTitle>
                    <CardDescription>
                      {savedReportId
                        ? "Save the adjusted definition back to the shared report library."
                        : "Save the verified definition for repeatable reporting."}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <div className="flex-1 space-y-2">
                      <Label htmlFor="custom-report-name">Report name</Label>
                      <Input
                        id="custom-report-name"
                        value={saveName}
                        onChange={event => setSaveName(event.target.value)}
                        maxLength={255}
                      />
                    </div>
                    <Button
                      onClick={saveReport}
                      disabled={saving || !saveName.trim()}
                    >
                      {saving ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="mr-2 h-4 w-4" />
                      )}
                      {savedReportId ? "Update report" : "Save report"}
                    </Button>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FilePlus2 className="h-4 w-4 text-indigo-600" />
              Saved reports
            </CardTitle>
            <CardDescription>
              Shared, reusable report definitions. Refresh a report to review
              the current data.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {savedReportsQuery.isLoading && (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
            {savedReportsQuery.error && (
              <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">
                {savedReportsQuery.error.message}
              </p>
            )}
            {!savedReportsQuery.isLoading &&
              !savedReportsQuery.error &&
              (savedReportsQuery.data ?? []).length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Save a verified report to make it available here.
                </p>
              )}
            {(savedReportsQuery.data ?? []).map((saved: any) => (
              <div key={saved.id} className="rounded-lg border p-3">
                <p className="line-clamp-2 text-sm font-medium">{saved.name}</p>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {saved.prompt}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {saved.lastRunAt
                    ? `Last run ${new Date(saved.lastRunAt).toLocaleDateString()}`
                    : "Not yet refreshed from the library"}
                </p>
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1"
                    onClick={() => runSavedMutation.mutate({ id: saved.id })}
                    disabled={running}
                  >
                    {runSavedMutation.isPending ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Play className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Run
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="px-2.5 text-rose-600 hover:text-rose-700"
                    onClick={() =>
                      setReportPendingDeletion({
                        id: saved.id,
                        name: saved.name,
                      })
                    }
                    disabled={removeMutation.isPending}
                    aria-label={`Delete ${saved.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <AlertDialog
        open={Boolean(reportPendingDeletion)}
        onOpenChange={open => {
          if (!open && !removeMutation.isPending)
            setReportPendingDeletion(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove saved report?</AlertDialogTitle>
            <AlertDialogDescription>
              {reportPendingDeletion
                ? `“${reportPendingDeletion.name}” will be removed from the shared report library. This cannot be undone.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={removeMutation.isPending}
              onClick={event => {
                event.preventDefault();
                if (reportPendingDeletion)
                  removeMutation.mutate({ id: reportPendingDeletion.id });
              }}
            >
              {removeMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Remove report
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
