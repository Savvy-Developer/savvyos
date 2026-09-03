import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  Activity,
  AlertTriangle,
  ArrowDownUp,
  ArrowRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  DatabaseZap,
  ExternalLink,
  Flame,
  GitBranch,
  Loader2,
  PhoneCall,
  RefreshCw,
  Target,
  TrendingUp,
  UserRoundCheck,
  UsersRound,
} from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { trpc } from "@/lib/trpc";
import PageHeader from "@/components/PageHeader";
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
import { Label } from "@/components/ui/label";
import { MultiSelect } from "@/components/ui/multi-select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import IsmAppointmentsTab from "./ism/IsmAppointmentsTab";
import IsmCallsTab from "./ism/IsmCallsTab";
import IsmActivitiesTab from "./ism/IsmActivitiesTab";
import IsmTasksTab from "./ism/IsmTasksTab";
import IsaStatsPage from "./isa/IsaStatsPage";

type QueueKey =
  | "recentUnassigned"
  | "untouchedAssigned"
  | "staleLeads"
  | "overdueTasks";
type SortKey =
  | "isaName"
  | "activeBook"
  | "newAssigned"
  | "newLeads"
  | "nurture"
  | "activeClients"
  | "untouched"
  | "staleSevenDays"
  | "openTasks"
  | "overdueTasks"
  | "callAttempts"
  | "connectedThirtySeconds"
  | "talkMinutes"
  | "callMatchRate";

type SortState = { key: SortKey; direction: "asc" | "desc" };
type RangePreset = "last7" | "last30" | "mtd" | "qtd" | "custom";

type MetricDefinition = {
  label: string;
  description: string;
  confidence: "trusted" | "provisional";
};

function localDay(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function initialRange() {
  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - 29);
  return { dateFrom: localDay(from), dateTo: localDay(today) };
}

function number(value: unknown): string {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? Math.round(amount).toLocaleString() : "—";
}

function decimal(value: unknown, digits = 1): string {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount.toFixed(digits) : "—";
}

function percentage(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  const amount = Number(value);
  return Number.isFinite(amount) ? `${amount.toFixed(1)}%` : "—";
}

function dateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
}

function ageLabel(hours: number | null | undefined): string {
  const value = Number(hours ?? 0);
  if (!Number.isFinite(value) || value <= 0) return "Just now";
  if (value < 24) return `${Math.round(value)}h`;
  const days = value / 24;
  return days < 14
    ? `${days.toFixed(days < 2 ? 1 : 0)}d`
    : `${Math.round(days / 7)}w`;
}

function titleCase(value: string | null | undefined): string {
  return (value ?? "Unknown")
    .replace(/_/g, " ")
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

function confidenceBadge(confidence: "trusted" | "provisional") {
  return confidence === "trusted"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : "border-amber-200 bg-amber-50 text-amber-700";
}

function statusTone(status: "healthy" | "warning" | "critical") {
  if (status === "healthy")
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "warning")
    return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-rose-200 bg-rose-50 text-rose-700";
}

function SummaryMetric({
  label,
  value,
  detail,
  icon: Icon,
  tone,
  definition,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Activity;
  tone: string;
  definition?: MetricDefinition;
}) {
  return (
    <Card className="border-border/80 shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {label}
              </p>
              {definition && (
                <Badge
                  variant="outline"
                  className={`px-1.5 py-0 text-[10px] ${confidenceBadge(definition.confidence)}`}
                  title={definition.description}
                >
                  {definition.confidence}
                </Badge>
              )}
            </div>
            <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">
              {value}
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {detail}
            </p>
          </div>
          <span className={`shrink-0 rounded-xl bg-muted p-2.5 ${tone}`}>
            <Icon className="h-4 w-4" />
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function AttentionCard({
  label,
  count,
  detail,
  icon: Icon,
  tone,
  onClick,
}: {
  label: string;
  count: number;
  detail: string;
  icon: typeof Activity;
  tone: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group rounded-xl border bg-card p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <span className={`rounded-xl p-2.5 ${tone}`}>
          <Icon className="h-4 w-4" />
        </span>
        <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
      </div>
      <p className="mt-4 text-2xl font-semibold tabular-nums">
        {number(count)}
      </p>
      <p className="mt-1 text-sm font-semibold">{label}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
    </button>
  );
}

function SortHeader({
  label,
  column,
  sort,
  onSort,
  align = "right",
  title,
}: {
  label: string;
  column: SortKey;
  sort: SortState;
  onSort: (column: SortKey) => void;
  align?: "left" | "right";
  title?: string;
}) {
  const selected = sort.key === column;
  return (
    <th
      className={`px-3 py-3 ${align === "left" ? "text-left" : "text-right"} font-semibold`}
      title={title}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className={`inline-flex items-center gap-1 transition hover:text-foreground ${align === "right" ? "ml-auto" : ""} ${selected ? "text-foreground" : ""}`}
      >
        <span>{label}</span>
        <ArrowDownUp
          className={`h-3.5 w-3.5 ${selected ? "text-primary" : "opacity-50"}`}
        />
      </button>
    </th>
  );
}

function QueueDialog({
  queueKey,
  data,
  onOpenChange,
  onNavigate,
  dateFrom,
  dateTo,
  selectedIsaIds,
  leadSourceId,
}: {
  queueKey: QueueKey | null;
  data: any;
  onOpenChange: (open: boolean) => void;
  onNavigate: (path: string) => void;
  dateFrom: string;
  dateTo: string;
  selectedIsaIds: string[];
  leadSourceId: string;
}) {
  if (!queueKey) return null;
  const config: Record<
    QueueKey,
    { title: string; description: string; rows: any[]; destination?: string }
  > = {
    recentUnassigned: {
      title: "Recent unassigned contacts",
      description:
        "Contacts created in the selected period without an ISA owner. Eligibility is not yet modeled, so review source and intent before assignment.",
      rows: data.attention.recentUnassigned,
      destination: `/contacts?isa=unassigned&addedFrom=${dateFrom}&addedTo=${dateTo}${leadSourceId !== "all" ? `&leadSource=${leadSourceId}` : ""}`,
    },
    untouchedAssigned: {
      title: "Assigned but untouched",
      description:
        "Recently created assigned contacts with no linked communication at or after creation. Unmatched Aircall activity may not be represented.",
      rows: data.attention.untouchedAssigned,
    },
    staleLeads: {
      title: "Active leads stale over 7 days",
      description:
        "Current active-book contacts with no linked communication in the last seven days.",
      rows: data.attention.staleLeads,
    },
    overdueTasks: {
      title: "Overdue ISA follow-ups",
      description:
        "Pending or in-progress ISA tasks whose due date has passed.",
      rows: data.attention.overdueTasks,
      destination: `/tasks?analytics=1&status=overdue${selectedIsaIds.length === 1 ? `&assignedToId=${selectedIsaIds[0]}` : ""}`,
    },
  };
  const selected = config[queueKey];
  const isTask = queueKey === "overdueTasks";

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-5xl overflow-hidden p-0">
        <DialogHeader className="border-b px-5 py-4 pr-12">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <DialogTitle>{selected.title}</DialogTitle>
              <DialogDescription className="mt-1 max-w-3xl leading-5">
                {selected.description}
              </DialogDescription>
            </div>
            {selected.destination && (
              <Button
                variant="outline"
                size="sm"
                className="w-fit shrink-0"
                onClick={() => onNavigate(selected.destination!)}
              >
                Open operational page{" "}
                <ExternalLink className="ml-2 h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </DialogHeader>
        <div className="max-h-[calc(85vh-8rem)] overflow-auto">
          {selected.rows.length ? (
            <table className="w-full min-w-[760px] text-sm">
              <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
                <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 text-left">
                    {isTask ? "Task" : "Contact"}
                  </th>
                  <th className="px-3 py-3 text-left">ISA / status</th>
                  <th className="px-3 py-3 text-left">Context</th>
                  <th className="px-3 py-3 text-right">Age</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {selected.rows.map((row: any) => {
                  const id = isTask
                    ? row.taskId
                    : row.contactId;
                  const contactId = row.contactId ?? null;
                  const target = isTask
                    ? `/tasks/${row.taskId}`
                    : contactId
                      ? `/contacts/${contactId}`
                      : "/contacts";
                  return (
                    <tr
                      key={`${queueKey}-${id}`}
                      className="border-b last:border-0 hover:bg-muted/25"
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium">
                          {isTask ? row.title : row.contactName}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {isTask
                            ? (row.contactName ?? "No linked contact")
                            : (row.email ?? row.phone ?? "No contact detail")}
                        </p>
                      </td>
                      <td className="px-3 py-3">
                        <p>{row.isaName ?? "Unassigned"}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {isTask
                            ? titleCase(row.priority)
                            : titleCase(row.isaStatus)}
                        </p>
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">
                        {isTask
                          ? `Due ${dateTime(row.dueDate)}`
                          : row.sourceName}
                      </td>
                      <td className="px-3 py-3 text-right font-medium tabular-nums">
                        {ageLabel(row.ageHours)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onNavigate(target)}
                        >
                          Open <ArrowRight className="ml-1 h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="flex min-h-52 flex-col items-center justify-center p-8 text-center text-muted-foreground">
              <CheckCircle2 className="mb-3 h-8 w-8 text-emerald-600" />
              <p className="font-medium text-foreground">
                No items in this queue
              </p>
              <p className="mt-1 text-sm">
                The selected scope is currently clear.
              </p>
            </div>
          )}
          {selected.rows.length >= 50 && (
            <p className="border-t px-5 py-3 text-xs text-muted-foreground">
              Showing the 50 oldest records. Use the operational destination for
              the complete list where available.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function IsmDashboardPage() {
  const [, navigate] = useLocation();
  const defaultRange = initialRange();
  const [dateFrom, setDateFrom] = useState(defaultRange.dateFrom);
  const [dateTo, setDateTo] = useState(defaultRange.dateTo);
  const [preset, setPreset] = useState<RangePreset>("last30");
  const [selectedIsaIds, setSelectedIsaIds] = useState<string[]>([]);
  const [leadSourceId, setLeadSourceId] = useState("all");
  const [selectedQueue, setSelectedQueue] = useState<QueueKey | null>(null);
  const [activeTab, setActiveTab] = useState<"operations" | "tasks" | "performance" | "appointments" | "calls" | "activities">("operations");
  const [sort, setSort] = useState<SortState>({
    key: "staleSevenDays",
    direction: "desc",
  });

  const query = trpc.analytics.ismDashboard.useQuery(
    {
      dateFrom,
      dateTo,
      isaIds: selectedIsaIds.length ? selectedIsaIds.map(Number) : undefined,
      leadSourceId: leadSourceId !== "all" ? Number(leadSourceId) : undefined,
    },
    { staleTime: 30_000, refetchInterval: 60_000, refetchOnWindowFocus: false }
  );

  const data = query.data as any;

  const applyPreset = (next: Exclude<RangePreset, "custom">) => {
    const today = new Date();
    const from = new Date(today);
    if (next === "last7") from.setDate(today.getDate() - 6);
    if (next === "last30") from.setDate(today.getDate() - 29);
    if (next === "mtd") from.setDate(1);
    if (next === "qtd") from.setMonth(Math.floor(today.getMonth() / 3) * 3, 1);
    setPreset(next);
    setDateFrom(localDay(from));
    setDateTo(localDay(today));
  };

  const updateDate = (field: "from" | "to", value: string) => {
    setPreset("custom");
    if (field === "from") setDateFrom(value);
    else setDateTo(value);
  };

  const scorecard = useMemo(() => {
    if (!data?.scorecard) return [];
    const value = (row: any, key: SortKey): string | number => {
      if (key === "isaName") return row.isaName;
      if (key === "callMatchRate") return row.callMatchRate ?? -1;
      return Number(row[key] ?? 0);
    };
    return [...data.scorecard].sort((left: any, right: any) => {
      const leftValue = value(left, sort.key);
      const rightValue = value(right, sort.key);
      const comparison =
        typeof leftValue === "string" && typeof rightValue === "string"
          ? leftValue.localeCompare(rightValue)
          : Number(leftValue) - Number(rightValue);
      if (comparison !== 0)
        return sort.direction === "asc" ? comparison : -comparison;
      return left.isaName.localeCompare(right.isaName);
    });
  }, [data?.scorecard, sort]);

  const updateSort = (key: SortKey) => {
    setSort(current =>
      current.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, direction: key === "isaName" ? "asc" : "desc" }
    );
  };

  if (query.isLoading && !data) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Inside Sales Manager"
          subtitle="Loading team operations, queues, and data health…"
        />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-40 rounded-xl" />
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  if (query.error || !data) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Inside Sales Manager"
          subtitle="Team operations, follow-up health, and performance context."
        />
        <Card className="border-rose-200">
          <CardContent className="flex min-h-72 flex-col items-center justify-center p-8 text-center">
            <AlertTriangle className="mb-3 h-9 w-9 text-rose-600" />
            <p className="text-lg font-semibold">
              Unable to load the ISM Dashboard
            </p>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              {query.error?.message ?? "No dashboard data was returned."}
            </p>
            <Button className="mt-5" onClick={() => query.refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Try again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const definitions = data.definitions as Record<string, MetricDefinition>;
  const sourceOptions = [
    { value: "all", label: "All lead sources" },
    ...(data.filters.leadSources ?? []).map((source: any) => ({
      value: String(source.id),
      label: source.parentName
        ? `${source.parentName} → ${source.name}`
        : source.name,
    })),
  ];
  const isaOptions = (data.filters.isas ?? []).map((isa: any) => ({
    value: String(isa.id),
    label: isa.name,
    description: isa.title ?? isa.managerName ?? undefined,
  }));

  const queueCards: Array<{
    key: QueueKey;
    label: string;
    count: number;
    detail: string;
    icon: typeof Activity;
    tone: string;
  }> = [
    {
      key: "recentUnassigned",
      label: "Recent unassigned",
      count: data.summary.recentUnassigned,
      detail: "Review source and assign eligible leads.",
      icon: UsersRound,
      tone: "bg-rose-50 text-rose-700",
    },
    {
      key: "untouchedAssigned",
      label: "Assigned but untouched",
      count: data.summary.untouched,
      detail: "Provisional queue from linked communications.",
      icon: PhoneCall,
      tone: "bg-amber-50 text-amber-700",
    },
    {
      key: "overdueTasks",
      label: "Overdue follow-ups",
      count: data.summary.overdueFollowUps,
      detail: "Open ISA tasks past their due date.",
      icon: Clock3,
      tone: "bg-rose-50 text-rose-700",
    },
    {
      key: "staleLeads",
      label: "Stale over 7 days",
      count: data.summary.staleSevenDays,
      detail: "Active-book leads without a recent linked touch.",
      icon: Flame,
      tone: "bg-amber-50 text-amber-700",
    },
  ];

  const sourceTotal = (data.sourceMix ?? []).reduce(
    (sum: number, row: any) => sum + Number(row.contacts ?? 0),
    0
  );
  return (
    <div className="space-y-6 pb-10">
      <PageHeader
        title="Inside Sales Manager"
        subtitle="Daily triage, team execution, workload health, and the data quality behind every decision."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => query.refetch()}
              disabled={query.isFetching}
            >
              {query.isFetching ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Refresh
            </Button>
            <Button size="sm" onClick={() => navigate("/analytics?report=isa")}>
              <BarChart3 className="mr-2 h-4 w-4" />
              Full ISA Reporting
            </Button>
          </div>
        }
      />

      <Tabs value={activeTab} onValueChange={value => setActiveTab(value as "operations" | "tasks" | "performance" | "appointments" | "calls" | "activities")}>
        <TabsList>
          <TabsTrigger value="operations">Operations</TabsTrigger>
          <TabsTrigger value="tasks"><ClipboardCheck className="h-4 w-4" />ISA Tasks</TabsTrigger>
          <TabsTrigger value="performance"><TrendingUp className="h-4 w-4" />ISA Performance</TabsTrigger>
          <TabsTrigger value="appointments"><CalendarDays className="h-4 w-4" />ISA Appts</TabsTrigger>
          <TabsTrigger value="activities"><Activity className="h-4 w-4" />Activities</TabsTrigger>
          <TabsTrigger value="calls"><PhoneCall className="h-4 w-4" />Calls</TabsTrigger>
        </TabsList>
      </Tabs>

      {activeTab === "tasks" ? (
        <IsmTasksTab />
      ) : activeTab === "performance" ? (
        <IsaStatsPage />
      ) : activeTab === "appointments" ? (
        <IsmAppointmentsTab />
      ) : activeTab === "activities" ? (
        <IsmActivitiesTab />
      ) : activeTab === "calls" ? (
        <IsmCallsTab />
      ) : (
        <>
      <section className="rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/[0.09] via-background to-cyan-50/60 p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                Manager operating cockpit
              </p>
              <Badge variant="secondary" className="gap-1">
                <UserRoundCheck className="h-3.5 w-3.5" />
                {number(data.summary.activeIsas)} selected ISA
                {data.summary.activeIsas === 1 ? "" : "s"}
              </Badge>
              <Badge variant="outline">
                Updated {dateTime(data.generatedAt)}
              </Badge>
            </div>
            <h2 className="mt-2 text-xl font-semibold tracking-tight">
              Start with exceptions. Use the scorecard to diagnose the cause.
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Queue counts drive operational action; team rows explain workload,
              follow-up, session, and call patterns. Provisional metrics remain
              explicitly labeled while SavvyOS strengthens assignment, touch,
              and appointment event tracking.
            </p>
          </div>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:w-[560px]">
            <div className="space-y-1.5">
              <Label className="text-xs">ISAs</Label>
              <MultiSelect
                options={isaOptions}
                value={selectedIsaIds}
                onValueChange={setSelectedIsaIds}
                placeholder="All active ISAs"
                searchPlaceholder="Search ISAs…"
                maxDisplay={2}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Lead source</Label>
              <SearchableSelect
                options={sourceOptions}
                value={leadSourceId}
                onValueChange={setLeadSourceId}
                placeholder="All lead sources"
                searchPlaceholder="Search lead sources…"
              />
            </div>
          </div>
        </div>
      </section>

      <Card>
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="grid grid-cols-2 gap-3 sm:flex sm:items-end">
              <div className="space-y-1.5">
                <Label htmlFor="ism-from" className="text-xs">
                  From
                </Label>
                <Input
                  id="ism-from"
                  type="date"
                  className="h-9"
                  value={dateFrom}
                  onChange={event => updateDate("from", event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ism-to" className="text-xs">
                  To
                </Label>
                <Input
                  id="ism-to"
                  type="date"
                  className="h-9"
                  value={dateTo}
                  onChange={event => updateDate("to", event.target.value)}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ["last7", "Last 7 days"],
                  ["last30", "Last 30 days"],
                  ["mtd", "Month to date"],
                  ["qtd", "Quarter to date"],
                ] as const
              ).map(([value, label]) => (
                <Button
                  key={value}
                  type="button"
                  size="sm"
                  variant={preset === value ? "default" : "outline"}
                  onClick={() => applyPreset(value)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs leading-5 text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{data.scope.note}</span>
          </div>
        </CardContent>
      </Card>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-rose-600" />
          <h2 className="text-base font-semibold">Needs attention now</h2>
          <Badge variant="secondary">Action queues</Badge>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {queueCards.map(item => (
            <AttentionCard
              key={item.key}
              label={item.label}
              count={item.count}
              detail={item.detail}
              icon={item.icon}
              tone={item.tone}
              onClick={() => setSelectedQueue(item.key)}
            />
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold">Team health</h2>
          <Badge variant="outline">
            {dateFrom} → {dateTo}
          </Badge>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <SummaryMetric
            label="Recent contacts"
            value={number(data.summary.recentContacts)}
            detail="Created in the selected period"
            icon={UsersRound}
            tone="text-sky-700"
          />
          <SummaryMetric
            label="Assignment coverage"
            value={percentage(data.summary.assignmentCoverageRate)}
            detail={`${number(data.summary.recentAssigned)} currently assigned`}
            icon={UserRoundCheck}
            tone="text-violet-700"
            definition={definitions.assignmentCoverage}
          />
          <SummaryMetric
            label="Active book"
            value={number(data.summary.activeBook)}
            detail="Current active-status assigned contacts"
            icon={GitBranch}
            tone="text-primary"
            definition={definitions.activeBook}
          />
          <SummaryMetric
            label="Open follow-ups"
            value={number(data.summary.openFollowUps)}
            detail={`${number(data.summary.overdueFollowUps)} overdue`}
            icon={ClipboardCheck}
            tone="text-amber-700"
            definition={definitions.overdueFollowUps}
          />
          <SummaryMetric
            label="Aircall attempts"
            value={number(data.summary.callAttempts)}
            detail={`${decimal(data.summary.talkMinutes)} talk minutes`}
            icon={PhoneCall}
            tone="text-indigo-700"
            definition={definitions.callAttempts}
          />
          <SummaryMetric
            label="Aircall match rate"
            value={percentage(data.summary.callMatchRate)}
            detail="Matched records ÷ all attributed calls"
            icon={DatabaseZap}
            tone="text-rose-700"
            definition={definitions.callMatchRate}
          />
          <SummaryMetric
            label="Stale active leads"
            value={number(data.summary.staleSevenDays)}
            detail={`${number(data.summary.untouched)} recent assigned leads untouched`}
            icon={Flame}
            tone="text-orange-700"
            definition={definitions.staleSevenDays}
          />
        </div>
      </section>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-base">ISA team scorecard</CardTitle>
              <CardDescription>
                Sortable workload, follow-up, and call indicators.
                Click an ISA name or metric to open the underlying operational
                view.
              </CardDescription>
            </div>
            <Badge variant="secondary">No composite ranking</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1600px] text-sm">
              <thead>
                <tr className="border-y bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <SortHeader
                    label="ISA"
                    column="isaName"
                    sort={sort}
                    onSort={updateSort}
                    align="left"
                  />
                  <SortHeader
                    label="Active book"
                    column="activeBook"
                    sort={sort}
                    onSort={updateSort}
                    title="Current assigned contacts in active statuses"
                  />
                  <SortHeader
                    label="Assigned intake"
                    column="newAssigned"
                    sort={sort}
                    onSort={updateSort}
                    title="Selected-period contacts currently assigned to this ISA"
                  />
                  <SortHeader
                    label="New"
                    column="newLeads"
                    sort={sort}
                    onSort={updateSort}
                  />
                  <SortHeader
                    label="Nurture"
                    column="nurture"
                    sort={sort}
                    onSort={updateSort}
                  />
                  <SortHeader
                    label="Active client"
                    column="activeClients"
                    sort={sort}
                    onSort={updateSort}
                  />
                  <SortHeader
                    label="Untouched"
                    column="untouched"
                    sort={sort}
                    onSort={updateSort}
                    title="Provisional: no linked communication after creation"
                  />
                  <SortHeader
                    label="Stale 7d"
                    column="staleSevenDays"
                    sort={sort}
                    onSort={updateSort}
                    title="Provisional: no linked communication in 7 days"
                  />
                  <SortHeader
                    label="Open tasks"
                    column="openTasks"
                    sort={sort}
                    onSort={updateSort}
                  />
                  <SortHeader
                    label="Overdue"
                    column="overdueTasks"
                    sort={sort}
                    onSort={updateSort}
                  />
                  <SortHeader
                    label="Calls"
                    column="callAttempts"
                    sort={sort}
                    onSort={updateSort}
                  />
                  <SortHeader
                    label="30s+"
                    column="connectedThirtySeconds"
                    sort={sort}
                    onSort={updateSort}
                    title="Duration proxy, not canonical connected-call rate"
                  />
                  <SortHeader
                    label="Talk min"
                    column="talkMinutes"
                    sort={sort}
                    onSort={updateSort}
                  />
                  <SortHeader
                    label="Match rate"
                    column="callMatchRate"
                    sort={sort}
                    onSort={updateSort}
                  />
                </tr>
              </thead>
              <tbody>
                {scorecard.map((isa: any) => (
                  <tr
                    key={isa.isaId}
                    className="border-b last:border-0 hover:bg-muted/25"
                  >
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        className="text-left hover:text-primary"
                        onClick={() => navigate(`/contacts?isa=${isa.isaId}`)}
                      >
                        <p className="font-semibold">{isa.isaName}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {isa.title ??
                            (isa.managerName
                              ? `Reports to ${isa.managerName}`
                              : "ISA")}
                        </p>
                      </button>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <button
                        className="font-medium tabular-nums hover:text-primary"
                        onClick={() => navigate(`/contacts?isa=${isa.isaId}`)}
                      >
                        {number(isa.activeBook)}
                      </button>
                    </td>
                    <td className="px-3 py-3 text-right font-medium tabular-nums">
                      {number(isa.newAssigned)}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <button
                        className="tabular-nums hover:text-primary"
                        onClick={() =>
                          navigate(
                            `/contacts?isa=${isa.isaId}&isaStatus=new_lead`
                          )
                        }
                      >
                        {number(isa.newLeads)}
                      </button>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <button
                        className="tabular-nums hover:text-primary"
                        onClick={() =>
                          navigate(
                            `/contacts?isa=${isa.isaId}&isaStatus=nurture`
                          )
                        }
                      >
                        {number(isa.nurture)}
                      </button>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <button
                        className="tabular-nums hover:text-primary"
                        onClick={() =>
                          navigate(
                            `/contacts?isa=${isa.isaId}&isaStatus=active_client`
                          )
                        }
                      >
                        {number(isa.activeClients)}
                      </button>
                    </td>
                    <td
                      className={`px-3 py-3 text-right font-medium tabular-nums ${isa.untouched > 0 ? "text-amber-700" : ""}`}
                    >
                      {number(isa.untouched)}
                    </td>
                    <td
                      className={`px-3 py-3 text-right font-medium tabular-nums ${isa.staleSevenDays > 0 ? "text-amber-700" : ""}`}
                    >
                      {number(isa.staleSevenDays)}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <button
                        className="tabular-nums hover:text-primary"
                        onClick={() =>
                          navigate(
                            `/tasks?analytics=1&status=all&assignedToId=${isa.isaId}`
                          )
                        }
                      >
                        {number(isa.openTasks)}
                      </button>
                    </td>
                    <td
                      className={`px-3 py-3 text-right font-medium tabular-nums ${isa.overdueTasks > 0 ? "text-rose-700" : ""}`}
                    >
                      <button
                        onClick={() =>
                          navigate(
                            `/tasks?analytics=1&status=overdue&assignedToId=${isa.isaId}`
                          )
                        }
                      >
                        {number(isa.overdueTasks)}
                      </button>
                    </td>
                    <td className="px-3 py-3 text-right font-medium tabular-nums">
                      {number(isa.callAttempts)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {number(isa.connectedThirtySeconds)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {decimal(isa.talkMinutes)}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <Badge
                        variant="outline"
                        className={`tabular-nums ${isa.callMatchRate !== null && isa.callMatchRate >= 90 ? "border-emerald-200 bg-emerald-50 text-emerald-700" : isa.callMatchRate !== null && isa.callMatchRate >= 75 ? "border-amber-200 bg-amber-50 text-amber-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}
                      >
                        {percentage(isa.callMatchRate)}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!scorecard.length && (
            <div className="p-10 text-center text-sm text-muted-foreground">
              No active ISAs match this scope.
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="h-4 w-4 text-primary" />
              Weekly operating trend
            </CardTitle>
            <CardDescription>
              Selected-period assigned intake, Aircall attempts, completed
              ISA tasks.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.trend?.length ? (
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={data.trend}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    fontSize={11}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    fontSize={11}
                    allowDecimals={false}
                  />
                  <Tooltip formatter={(value: number) => number(value)} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="assignedLeads"
                    name="Assigned intake"
                    stroke="#3B82F6"
                    strokeWidth={2.5}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="callAttempts"
                    name="Aircall attempts"
                    stroke="#7C3AED"
                    strokeWidth={2.5}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="completedTasks"
                    name="Completed tasks"
                    stroke="#D97706"
                    strokeWidth={2.5}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-80 items-center justify-center text-sm text-muted-foreground">
                No trend data in this range.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <GitBranch className="h-4 w-4 text-primary" />
              Lead-source mix
            </CardTitle>
            <CardDescription>
              Recent intake and current progression by source. Source mix is
              teamwide for the selected period.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[360px] overflow-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="sticky top-0 bg-muted/95">
                  <tr className="border-y text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 text-left">Source</th>
                    <th className="px-3 py-3 text-right">Leads</th>
                    <th className="px-3 py-3 text-right">Assigned</th>
                    <th className="px-3 py-3 text-right">Active+</th>
                    <th className="px-4 py-3 text-right">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.sourceMix ?? []).map((source: any) => (
                    <tr
                      key={`${source.sourceId}-${source.sourceName}`}
                      className="border-b last:border-0"
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium">{source.sourceName}</p>
                        {source.parentName && (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {source.parentName}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {number(source.contacts)}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {number(source.assigned)}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {number(
                          Number(source.activeClients) +
                            Number(source.underContract) +
                            Number(source.closed)
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {sourceTotal
                          ? `${((Number(source.contacts) / sourceTotal) * 100).toFixed(1)}%`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!data.sourceMix?.length && (
              <p className="p-8 text-center text-sm text-muted-foreground">
                No lead-source data matches this scope.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <DatabaseZap className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold">Data health</h2>
            <Badge variant="secondary">Visible by design</Badge>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/analytics?report=isa")}
          >
            Investigate in Reporting <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.dataHealth.map((item: any) => (
            <Card key={item.key} className="border-border/80">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{item.label}</p>
                    <p className="mt-2 text-2xl font-semibold tabular-nums">
                      {item.rate !== null && item.denominator
                        ? percentage(item.rate)
                        : number(item.value)}
                    </p>
                  </div>
                  <Badge variant="outline" className={statusTone(item.status)}>
                    {titleCase(item.status)}
                  </Badge>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Badge
                    variant="outline"
                    className={confidenceBadge(item.confidence)}
                  >
                    {item.confidence}
                  </Badge>
                  {item.denominator !== undefined && (
                    <span className="text-xs text-muted-foreground">
                      {number(item.value)} of {number(item.denominator)}
                    </span>
                  )}
                </div>
                <p className="mt-3 text-xs leading-5 text-muted-foreground">
                  {item.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <Card className="border-dashed">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">How to use this dashboard</CardTitle>
          <CardDescription>
            This page separates manager action from deeper analysis and
            deliberately avoids a composite ISA ranking.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg bg-muted/30 p-3">
            <p className="text-sm font-semibold">1. Clear exceptions</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Start with recent unassigned records, stuck sessions, and overdue
              follow-ups.
            </p>
          </div>
          <div className="rounded-lg bg-muted/30 p-3">
            <p className="text-sm font-semibold">2. Compare context</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Use the scorecard, source mix, and trend together before drawing
              conclusions.
            </p>
          </div>
          <div className="rounded-lg bg-muted/30 p-3">
            <p className="text-sm font-semibold">3. Drill to evidence</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Open contacts, tasks, and the ISA report rather than managing from
              an isolated summary number.
            </p>
          </div>
        </CardContent>
      </Card>

      <QueueDialog
        queueKey={selectedQueue}
        data={data}
        onOpenChange={open => {
          if (!open) setSelectedQueue(null);
        }}
        onNavigate={path => {
          setSelectedQueue(null);
          navigate(path);
        }}
        dateFrom={dateFrom}
        dateTo={dateTo}
        selectedIsaIds={selectedIsaIds}
        leadSourceId={leadSourceId}
      />
        </>
      )}
    </div>
  );
}
