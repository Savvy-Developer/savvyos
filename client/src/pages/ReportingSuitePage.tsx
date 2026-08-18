import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  ExternalLink,
  Flag,
  Landmark,
  Loader2,
  RefreshCw,
  TrendingUp,
  UserRound,
  UsersRound,
  UserPlus,
  MapPinned,
  ListChecks,
  PhoneCall,
  Workflow,
  BrainCircuit,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  IsaActivitiesReport,
  LeadSourcesReport,
  MarketAnalyticsReport,
  OnboardingReport,
  TasksReport,
} from "./ReportingExpansionViews";
import { BusinessInsightsReport } from "./BusinessInsightsReport";
import { SavvyOsAdoptionReport } from "./SavvyOsAdoptionReport";
import PageHeader from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { MultiSelect } from "@/components/ui/multi-select";
import { Skeleton } from "@/components/ui/skeleton";

type ReportKind = "agents" | "leaders" | "transactions" | "onboarding" | "markets" | "tasks" | "isa" | "sources" | "adoption" | "business_insights";

type QueryPatch = Record<string, string | null | undefined>;

const reportTabs: Array<{ id: ReportKind; label: string; description: string; icon: typeof UsersRound }> = [
  { id: "agents", label: "Agent Performance", description: "Production, financial contribution, and operational follow-through by agent.", icon: UsersRound },
  { id: "leaders", label: "Group Leader Review", description: "Coaching priorities and team health for group-leader conversations.", icon: UserRound },
  { id: "transactions", label: "Transaction Statistics", description: "Production mix, conversion outcomes, commissions, and transaction quality.", icon: BriefcaseBusiness },
  { id: "onboarding", label: "Agent Onboarding", description: "Progression, completion time, and early-adoption risk across agent onboarding plans.", icon: UserPlus },
  { id: "markets", label: "Market Analytics", description: "Geographic production, capacity, coverage, and market-level financial contribution.", icon: MapPinned },
  { id: "tasks", label: "Task Execution", description: "Workload flow, completion, aging, ownership, and overdue operational work.", icon: ListChecks },
  { id: "isa", label: "ISA Activities", description: "Pipeline movement, ISA coverage, session activity, and next-step follow-up intelligence.", icon: PhoneCall },
  { id: "sources", label: "Lead Sources", description: "Acquisition volume, quality, conversion, GCI, and Savvy net by source.", icon: Workflow },
  { id: "adoption", label: "SavvyOS Adoption", description: "Agent sign-in, CRM engagement, pipeline stewardship, and practical platform adoption signals.", icon: Activity },
  { id: "business_insights", label: "AI Business Insights", description: "A shared weekly executive synthesis that connects production, pipeline, ISA, task, source, and financial signals.", icon: BrainCircuit },
];

const statusColors: Record<string, string> = {
  closed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  under_contract: "bg-sky-50 text-sky-700 border-sky-200",
  terminated: "bg-rose-50 text-rose-700 border-rose-200",
  buyer: "bg-indigo-50 text-indigo-700 border-indigo-200",
  seller: "bg-amber-50 text-amber-700 border-amber-200",
  dual: "bg-violet-50 text-violet-700 border-violet-200",
};

const chartColors = ["#1F6D5B", "#3B82F6", "#D97706", "#8B5CF6", "#E11D48"];

function localDay(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function startOfYear(date = new Date()): string {
  return localDay(new Date(date.getFullYear(), 0, 1));
}



type DatePreset = "ytd" | "last_year" | "last_90" | "this_quarter" | "last_quarter" | "this_month" | "last_month" | "last_30" | "custom";

const datePresetOptions: Array<{ value: DatePreset; label: string }> = [
  { value: "ytd", label: "Year to date" },
  { value: "last_year", label: "Last year" },
  { value: "last_90", label: "Last 90 days" },
  { value: "this_quarter", label: "This quarter" },
  { value: "last_quarter", label: "Last quarter" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "last_30", label: "Last 30 days" },
  { value: "custom", label: "Custom range" },
];

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function startOfQuarter(date = new Date()): Date {
  return new Date(date.getFullYear(), Math.floor(date.getMonth() / 3) * 3, 1);
}

function dateRangeForPreset(preset: DatePreset, today = new Date()): { from: string; to: string } | null {
  const end = localDay(today);
  if (preset === "custom") return null;
  if (preset === "ytd") return { from: startOfYear(today), to: end };
  if (preset === "last_30") return { from: localDay(addDays(today, -29)), to: end };
  if (preset === "last_90") return { from: localDay(addDays(today, -89)), to: end };
  if (preset === "this_quarter") return { from: localDay(startOfQuarter(today)), to: end };
  if (preset === "this_month") return { from: localDay(new Date(today.getFullYear(), today.getMonth(), 1)), to: end };
  if (preset === "last_month") {
    const firstOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lastOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
    return { from: localDay(firstOfLastMonth), to: localDay(lastOfLastMonth) };
  }
  if (preset === "last_year") return { from: localDay(new Date(today.getFullYear() - 1, 0, 1)), to: localDay(new Date(today.getFullYear() - 1, 11, 31)) };
  const thisQuarter = startOfQuarter(today);
  return { from: localDay(new Date(thisQuarter.getFullYear(), thisQuarter.getMonth() - 3, 1)), to: localDay(addDays(thisQuarter, -1)) };
}

function currentAnalyticsReturnUrl(): string {
  if (typeof window === "undefined") return "/analytics";
  return window.location.pathname + window.location.search;
}

function money(value: unknown, compact = false): string {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return "—";
  if (compact && Math.abs(amount) >= 1_000_000) return `$${(amount / 1_000_000).toFixed(Math.abs(amount) >= 10_000_000 ? 0 : 1)}M`;
  if (compact && Math.abs(amount) >= 1_000) return `$${(amount / 1_000).toFixed(Math.abs(amount) >= 100_000 ? 0 : 1)}K`;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(amount);
}

function number(value: unknown): string {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? Math.round(amount).toLocaleString() : "—";
}

function percentage(value: unknown, digits = 1): string {
  const amount = Number(value);
  return Number.isFinite(amount) ? `${amount.toFixed(digits)}%` : "—";
}

function day(value: unknown): string {
  if (!value) return "—";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function monthLabel(value: string): string {
  if (!/^\d{4}-\d{2}$/.test(value)) return value || "—";
  const [year, month] = value.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

function nonZeroPotential(value: unknown): number | null {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) && amount !== 0 ? amount : null;
}

function monthlyTrendData(monthly: any[]) {
  return monthly.map((row: any) => ({
    ...row,
    label: monthLabel(row.month),
    underContract: nonZeroPotential(row.underContract),
    futureVolume: nonZeroPotential(row.futureVolume),
    futureGci: nonZeroPotential(row.futureGci),
    futureSavvyNet: nonZeroPotential(row.futureSavvyNet),
  }));
}

function productionTrendTooltip(value: unknown, key: string): string {
  return ["units", "Units", "closings", "Closings", "Closed units", "underContract", "Under Contract"].includes(key) ? number(value) : money(value);
}

function titleCase(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

function buildTransactionUrl(filters: Record<string, unknown>, patch: Record<string, string | undefined> = {}) {
  const params = new URLSearchParams({ analytics: "1", report: "reporting", returnTo: currentAnalyticsReturnUrl() });
  if (filters.agentId) params.set("agentId", String(filters.agentId));
  if (Array.isArray(filters.agentIds) && filters.agentIds.length) params.set("agentIds", (filters.agentIds as number[]).join(","));
  if (filters.groupLeaderId) params.set("groupLeaderId", String(filters.groupLeaderId));
  if (filters.includeLeaderStats) params.set("includeLeaderStats", "true");
  if (filters.marketProfileId) params.set("marketId", String(filters.marketProfileId));
  if (filters.isaId) params.set("isaId", String(filters.isaId));
  if (Array.isArray(filters.isaIds) && filters.isaIds.length) params.set("isaIds", (filters.isaIds as number[]).join(","));
  if (filters.leadSourceId) params.set("leadSourceId", String(filters.leadSourceId));
  if (Array.isArray(filters.leadSourceIds) && filters.leadSourceIds.length) params.set("leadSourceIds", (filters.leadSourceIds as number[]).join(","));
  if (filters.transactionType && filters.transactionType !== "all") params.set("transactionType", String(filters.transactionType));
  if (filters.status && filters.status !== "all") params.set("status", String(filters.status));
  const dateFrom = typeof filters.dateFrom === "string" ? filters.dateFrom : undefined;
  const dateTo = typeof filters.dateTo === "string" ? filters.dateTo : undefined;
  const currentReviewScope = Boolean(patch.flagNoClosingDate || patch.flagPastClosingDate || patch.flagPayoutIntegrity);
  if (!currentReviewScope && filters.dateBasis === "contract") {
    if (dateFrom) params.set("contractDateFrom", dateFrom);
    if (dateTo) params.set("contractDateTo", dateTo);
  } else if (!currentReviewScope) {
    if (dateFrom) params.set("closingDateFrom", dateFrom);
    if (dateTo) params.set("closingDateTo", dateTo);
  }
  Object.entries(patch).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return "/transactions?" + params.toString();
}

function buildTaskUrl(filters: Record<string, unknown>, patch: Record<string, string | undefined> = {}) {
  const params = new URLSearchParams({ analytics: "1", report: "reporting", returnTo: currentAnalyticsReturnUrl(), status: "overdue" });
  if (filters.agentId) params.set("assignedToId", String(filters.agentId));
  if (Array.isArray(filters.agentIds) && filters.agentIds.length) params.set("agentIds", (filters.agentIds as number[]).join(","));
  if (filters.groupLeaderId) params.set("groupLeaderId", String(filters.groupLeaderId));
  if (filters.includeLeaderStats) params.set("includeLeaderStats", "true");
  Object.entries(patch).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return "/tasks?" + params.toString();
}

function Delta({ value }: { value?: number | null }) {
  if (value === null || value === undefined || !Number.isFinite(value)) return <p className="mt-1 text-xs text-muted-foreground">No comparable prior period</p>;
  const positive = value >= 0;
  return <p className={`mt-1 flex items-center gap-1 text-xs font-medium ${positive ? "text-emerald-700" : "text-rose-700"}`}>
    {positive ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
    {percentage(Math.abs(value))} vs. prior period
  </p>;
}

function MetricCard({
  label,
  value,
  description,
  delta,
  icon: Icon,
  tone = "text-primary",
}: {
  label: string;
  value: string;
  description: string;
  delta?: number | null;
  icon: typeof CircleDollarSign;
  tone?: string;
}) {
  return <Card className="h-full border-border/80 shadow-sm"><CardContent className="p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-2 truncate text-2xl font-semibold tracking-tight tabular-nums">{value}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>{delta !== undefined && <Delta value={delta} />}</div><span className={`rounded-xl bg-muted p-2.5 ${tone}`}><Icon className="h-4 w-4" /></span></div></CardContent></Card>;
}

function FlagCard({
  label,
  value,
  description,
  icon: Icon,
  href,
  tone = "amber",
  displayValue,
}: {
  label: string;
  value: number;
  description: string;
  icon: typeof AlertTriangle;
  href: string;
  tone?: "rose" | "amber" | "sky" | "violet";
  displayValue?: string;
}) {
  const colors = {
    rose: "border-rose-200 bg-rose-50/60 text-rose-700",
    amber: "border-amber-200 bg-amber-50/60 text-amber-700",
    sky: "border-sky-200 bg-sky-50/60 text-sky-700",
    violet: "border-violet-200 bg-violet-50/60 text-violet-700",
  };
  return <a href={href} className="block"><Card className={`h-full transition hover:-translate-y-0.5 hover:shadow-sm ${colors[tone]}`}><CardContent className="p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-2xl font-semibold tabular-nums">{displayValue ?? number(value)}</p><p className="mt-1 text-sm font-semibold">{label}</p><p className="mt-1 text-xs leading-5 opacity-80">{description}</p></div><Icon className="h-5 w-5 shrink-0" /></div></CardContent></Card></a>;
}

function SectionHeader({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-base font-semibold tracking-tight">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{description}</p></div>{action}</div>;
}

function ChartEmpty({ label }: { label: string }) {
  return <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">No {label.toLowerCase()} is available for this scope.</div>;
}

function ReportingFilters({
  activeReport,
  params,
  filters,
  update,
}: {
  activeReport: ReportKind;
  params: URLSearchParams;
  filters: any;
  update: (patch: QueryPatch) => void;
}) {
  if (activeReport === "business_insights" || activeReport === "adoption") return null;
  const today = localDay(new Date());
  const selectedPreset = (params.get("preset") ?? "ytd") as DatePreset;
  const selectedAgents = params.get("agentIds") ? params.get("agentIds")!.split(",") : [];
  const selectedLeader = params.get("groupLeaderId") ?? "all";
  const selectedStatus = params.get("status") ?? "all";
  const selectedType = params.get("transactionType") ?? "all";
  const selectedIsas = params.get("isaIds") ? params.get("isaIds")!.split(",") : [];
  const selectedLeadSources = params.get("leadSourceIds") ? params.get("leadSourceIds")!.split(",") : [];
  const dateBasis = params.get("dateBasis") ?? "closing";
  const includeLeaderStats = params.get("includeLeaderStats") === "true";
  const isTransaction = activeReport === "transactions";
  const isIsa = activeReport === "isa";
  const isSource = activeReport === "sources";
  const showAgent = activeReport !== "leaders" && activeReport !== "markets";
  const showLeader = activeReport === "leaders";
  const leadSources = filters?.leadSources ?? [];
  const parents = new Map(leadSources.filter((source: any) => !source.parentId).map((source: any) => [source.id, source.name]));
  const sourceLabel = (source: any) => source.parentId ? String(parents.get(source.parentId) ?? "Unassigned category") + " → " + source.name + " (sub-source)" : source.name + " (category)";
  const setPreset = (value: string) => {
    const preset = value as DatePreset;
    const range = dateRangeForPreset(preset);
    update(range ? { preset, from: range.from, to: range.to, page: null } : { preset, page: null });
  };

  return (
    <Card className="border-primary/15 shadow-sm">
      <CardContent className="p-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Date range</Label>
            <Select value={selectedPreset} onValueChange={setPreset}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{datePresetOptions.map((preset) => <SelectItem key={preset.value} value={preset.value}>{preset.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="report-from" className="text-xs">From</Label>
            <Input id="report-from" type="date" className="h-8 text-xs" value={params.get("from") ?? startOfYear()} onChange={(event) => update({ preset: "custom", from: event.target.value, page: null })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="report-to" className="text-xs">To</Label>
            <Input id="report-to" type="date" className="h-8 text-xs" value={params.get("to") ?? today} onChange={(event) => update({ preset: "custom", to: event.target.value, page: null })} />
          </div>
          {isTransaction && (
            <div className="space-y-1">
              <Label className="text-xs">Date basis</Label>
              <Select value={dateBasis} onValueChange={(value) => update({ dateBasis: value, page: null })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="closing">Closing date</SelectItem>
                  <SelectItem value="contract">Contract date</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          {showAgent && (
            <div className="space-y-1">
              <Label className="text-xs">Agents</Label>
              <MultiSelect
                className="min-w-[180px] text-xs"
                options={(filters?.agents ?? []).map((a: any) => ({ value: String(a.id), label: a.name }))}
                value={selectedAgents}
                onValueChange={(values) => update({ agentIds: values.length ? values.join(",") : null, agentId: null, page: null })}
                placeholder="All agents"
                searchPlaceholder="Search agents…"
                maxDisplay={2}
              />
            </div>
          )}
          {showLeader && (
            <div className="space-y-1">
              <Label className="text-xs">Group leader</Label>
              <SearchableSelect
                className="h-8 text-xs w-48"
                options={[{ value: "all", label: "All group leaders" }, ...(filters?.groupLeaders ?? []).map((l: any) => ({ value: String(l.id), label: l.name }))]}
                value={selectedLeader}
                onValueChange={(value) => update({ groupLeaderId: value === "all" ? null : value, page: null })}
                placeholder="All group leaders"
                searchPlaceholder="Search leaders…"
              />
            </div>
          )}
          {showLeader && (
            <label className="flex h-8 items-center gap-2 rounded-md border border-input px-3 text-xs font-medium self-end">
              <input type="checkbox" checked={includeLeaderStats} disabled={selectedLeader === "all"} onChange={(event) => update({ includeLeaderStats: event.target.checked ? "true" : null, page: null })} />
              Include leader's own stats
            </label>
          )}
          {isIsa && (
            <div className="space-y-1">
              <Label className="text-xs">ISA owners</Label>
              <MultiSelect
                className="min-w-[180px] text-xs"
                options={(filters?.isas ?? []).map((i: any) => ({ value: String(i.id), label: i.name }))}
                value={selectedIsas}
                onValueChange={(values) => update({ isaIds: values.length ? values.join(",") : null, isaId: null, page: null })}
                placeholder="All ISA owners"
                searchPlaceholder="Search ISAs…"
                maxDisplay={2}
              />
            </div>
          )}
          {isSource && (
            <div className="space-y-1">
              <Label className="text-xs">Lead sources</Label>
              <MultiSelect
                className="min-w-[220px] text-xs"
                options={leadSources.map((s: any) => ({ value: String(s.id), label: sourceLabel(s) }))}
                value={selectedLeadSources}
                onValueChange={(values) => update({ leadSourceIds: values.length ? values.join(",") : null, leadSourceId: null, page: null })}
                placeholder="All lead sources"
                searchPlaceholder="Search sources…"
                maxDisplay={2}
              />
            </div>
          )}
          {isTransaction && (
            <>
              <div className="space-y-1">
                <Label className="text-xs">Status</Label>
                <Select value={selectedStatus} onValueChange={(value) => update({ status: value, page: null })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                    <SelectItem value="under_contract">Under contract</SelectItem>
                    <SelectItem value="terminated">Terminated</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Representation</Label>
                <Select value={selectedType} onValueChange={(value) => update({ transactionType: value, page: null })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Buyer + seller + dual</SelectItem>
                    <SelectItem value="buyer">Buyer</SelectItem>
                    <SelectItem value="seller">Seller</SelectItem>
                    <SelectItem value="dual">Dual agency</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
          <Button variant="ghost" size="sm" className="h-8 self-end shrink-0 text-xs" onClick={() => update({ preset: "ytd", from: startOfYear(), to: today, agentId: null, agentIds: null, groupLeaderId: null, includeLeaderStats: null, marketProfileId: null, isaId: null, isaIds: null, leadSourceId: null, leadSourceIds: null, status: "all", transactionType: "all", dateBasis: "closing", page: null })}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />Reset
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ColumnShare({ value, total }: { value: unknown; total: unknown }) {
  const numericValue = Number(value ?? 0);
  const numericTotal = Number(total ?? 0);
  const share = Number.isFinite(numericValue) && Number.isFinite(numericTotal) && numericTotal > 0
    ? (numericValue / numericTotal) * 100
    : null;

  return <span className="text-xs font-medium text-muted-foreground">({share === null ? "—" : percentage(share)})</span>;
}

function AgentMetric({ value, total, children }: { value: unknown; total: unknown; children: React.ReactNode }) {
  return <span className="inline-flex items-baseline justify-end gap-1.5 whitespace-nowrap">{children}<ColumnShare value={value} total={total} /></span>;
}

function SortableMetricHeader({ label, column, sortColumn, sortDirection, onSort, className = "px-3 py-3 text-right font-semibold" }: { label: string; column: string; sortColumn: string; sortDirection: "asc" | "desc"; onSort: (column: string) => void; className?: string }) {
  const isActive = sortColumn === column;
  const directionMark = isActive ? (sortDirection === "desc" ? "↓" : "↑") : "↕";
  return <th className={className}><button type="button" onClick={() => onSort(column)} className="inline-flex items-center justify-end gap-1 text-inherit hover:text-foreground" aria-label={`Sort by ${label}${isActive ? `, ${sortDirection === "desc" ? "descending" : "ascending"}` : ""}`}>{label}<span className={`text-[10px] ${isActive ? "text-primary" : "text-muted-foreground/70"}`} aria-hidden="true">{directionMark}</span></button></th>;
}

function AgentReport({ data }: { data: any }) {
  const { production, change, flags, monthly, agents, flaggedTransactions, overdueTasks, filters } = data;
  const [comparisonSort, setComparisonSort] = useState({ column: "grossCommission", direction: "desc" as "asc" | "desc" });
  const [showZeroOnlyAgents, setShowZeroOnlyAgents] = useState(false);
  const totals = agents.reduce((sum: { closings: number; volume: number; grossCommission: number; savvyNet: number; underContract: number; overdueTasks: number; flags: number }, agent: any) => {
    const flagCount = Number(agent.commissionFlags ?? 0) + Number(agent.pastExpectedCloseDate ?? 0) + Number(agent.noExpectedCloseDate ?? 0);
    return {
      closings: sum.closings + Number(agent.closings ?? 0),
      volume: sum.volume + Number(agent.volume ?? 0),
      grossCommission: sum.grossCommission + Number(agent.grossCommission ?? 0),
      savvyNet: sum.savvyNet + Number(agent.savvyNet ?? 0),
      underContract: sum.underContract + Number(agent.underContract ?? 0),
      overdueTasks: sum.overdueTasks + Number(agent.overdueTasks ?? 0),
      flags: sum.flags + flagCount,
    };
  }, { closings: 0, volume: 0, grossCommission: 0, savvyNet: 0, underContract: 0, overdueTasks: 0, flags: 0 });
  const comparisonRows = agents.map((agent: any) => ({ agent, flagCount: Number(agent.commissionFlags ?? 0) + Number(agent.pastExpectedCloseDate ?? 0) + Number(agent.noExpectedCloseDate ?? 0) }));
  const zeroOnlyComparisonRows = comparisonRows.filter(({ agent, flagCount }: { agent: any; flagCount: number }) => [agent.closings, agent.volume, agent.grossCommission, agent.savvyNet, agent.underContract, agent.overdueTasks, flagCount].every((value) => Number(value ?? 0) === 0));
  const comparisonMetricValue = (row: { agent: any; flagCount: number }, column: string) => column === "flags" ? row.flagCount : Number(row.agent[column] ?? 0);
  const visibleComparisonRows = [...(showZeroOnlyAgents ? comparisonRows : comparisonRows.filter((row: { agent: any; flagCount: number }) => !zeroOnlyComparisonRows.includes(row)))].sort((left, right) => {
    const difference = comparisonMetricValue(left, comparisonSort.column) - comparisonMetricValue(right, comparisonSort.column);
    return comparisonSort.direction === "desc" ? -difference : difference;
  });
  const toggleComparisonSort = (column: string) => setComparisonSort((current) => ({ column, direction: current.column === column && current.direction === "desc" ? "asc" : "desc" }));

  return <div className="space-y-7">
    <section className="space-y-3">
      <SectionHeader title="Performance pulse" description="Closed production in the selected closing-date range, with a comparable prior period." />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Closings" value={number(production.closings)} description="Closed transactions" delta={change.closings} icon={CheckCircle2} tone="text-emerald-700" />
        <MetricCard label="Volume" value={money(production.volume, true)} description="Closed purchase volume" delta={change.volume} icon={Landmark} tone="text-sky-700" />
        <MetricCard label="Gross commission" value={money(production.grossCommission, true)} description="Recorded transaction GCI" delta={change.grossCommission} icon={CircleDollarSign} tone="text-indigo-700" />
        <MetricCard label="Savvy net" value={money(production.savvyNet, true)} description="Recorded Savvy payout items" delta={change.savvyNet} icon={TrendingUp} tone="text-primary" />
        <MetricCard label="Avg. GCI" value={money(production.averageGci, true)} description="Per closed transaction" delta={change.averageGci} icon={BarChart3} tone="text-violet-700" />
      </div>
    </section>

    <section className="space-y-3">
      <SectionHeader title="Operational attention" description="Live operational risks are intentionally shown outside the closed-period production totals." />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <FlagCard label="Overdue tasks" value={flags.overdueTasks} description="Open tasks past their due date" icon={ClipboardList} href={buildTaskUrl(filters)} tone="rose" />
        <FlagCard label="Commission flags" value={flags.commissionFlags} description="Transactions requiring payout review" icon={Flag} href={buildTransactionUrl(filters, { flagPayoutIntegrity: "true" })} tone="violet" />
        <FlagCard label="Past expected close" value={flags.pastExpectedCloseDate} description="Open deals past their close date" icon={CalendarClock} href={buildTransactionUrl(filters, { status: "under_contract", flagPastClosingDate: "true" })} tone="rose" />
        <FlagCard label="No expected close" value={flags.noExpectedCloseDate} description="Open deals missing a close date" icon={AlertTriangle} href={buildTransactionUrl(filters, { status: "under_contract", flagNoClosingDate: "true" })} tone="amber" />
      </div>
    </section>

    <section className="grid gap-5 xl:grid-cols-[1.45fr_0.95fr]">
      <Card>
        <CardHeader><CardTitle className="text-base">Production momentum</CardTitle><CardDescription>Monthly closed volume and closings, with current Under Contract potential grouped by projected close timing.</CardDescription></CardHeader>
        <CardContent>{monthly.length ? <ResponsiveContainer width="100%" height={280}><ComposedChart data={monthlyTrendData(monthly)} margin={{ left: 0, right: 12, top: 6, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} /><YAxis yAxisId="volume" tickFormatter={(value) => money(value, true)} tickLine={false} axisLine={false} width={62} fontSize={11} /><YAxis yAxisId="closings" orientation="right" tickLine={false} axisLine={false} width={26} fontSize={11} /><Tooltip filterNull formatter={(value: number, key: string) => productionTrendTooltip(value, key)} labelFormatter={(label) => "Month: " + label} /><Legend /><Bar yAxisId="volume" dataKey="volume" name="Volume" fill="#1F6D5B" radius={[5, 5, 0, 0]} /><Bar yAxisId="volume" dataKey="futureVolume" name="Under Contract volume" fill="#0EA5A4" fillOpacity={0.65} radius={[5, 5, 0, 0]} /><Line yAxisId="closings" type="monotone" dataKey="closings" name="Closings" stroke="#2563EB" strokeWidth={2.5} dot={{ r: 3 }} /><Line yAxisId="closings" type="monotone" dataKey="underContract" name="Under Contract" stroke="#8B5CF6" strokeWidth={2.25} strokeDasharray="6 4" dot={{ r: 2 }} /></ComposedChart></ResponsiveContainer> : <ChartEmpty label="monthly production" />}</CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Financial contribution</CardTitle><CardDescription>Closed gross commission and recorded Savvy net by month, alongside current Under Contract potential.</CardDescription></CardHeader>
        <CardContent>{monthly.length ? <ResponsiveContainer width="100%" height={280}><LineChart data={monthlyTrendData(monthly)} margin={{ left: 0, right: 12, top: 6, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} /><YAxis tickFormatter={(value) => money(value, true)} tickLine={false} axisLine={false} width={62} fontSize={11} /><Tooltip filterNull formatter={(value: number) => money(value)} /><Legend /><Line type="monotone" dataKey="grossCommission" name="Gross commission" stroke="#4338CA" strokeWidth={2.5} dot={false} /><Line type="monotone" dataKey="savvyNet" name="Savvy net" stroke="#1F6D5B" strokeWidth={2.5} dot={false} /><Line type="monotone" dataKey="futureGci" name="Under Contract GCI" stroke="#8B5CF6" strokeWidth={2.25} strokeDasharray="6 4" dot={false} /><Line type="monotone" dataKey="futureSavvyNet" name="Under Contract Savvy net" stroke="#0EA5A4" strokeWidth={2.25} strokeDasharray="6 4" dot={false} /></LineChart></ResponsiveContainer> : <ChartEmpty label="monthly financial data" />}</CardContent>
      </Card>
    </section>

    <section className="space-y-3">
      <SectionHeader title="Agent comparison" description="Ranked production and current follow-through signals for the selected scope. Select a metric header to sort; parenthetical percentages show each agent’s share of its metric column." />
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] text-sm">
              <thead><tr className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground"><th className="px-4 py-3 text-left font-semibold">Agent</th><SortableMetricHeader label="Closings" column="closings" sortColumn={comparisonSort.column} sortDirection={comparisonSort.direction} onSort={toggleComparisonSort} /><SortableMetricHeader label="Volume" column="volume" sortColumn={comparisonSort.column} sortDirection={comparisonSort.direction} onSort={toggleComparisonSort} /><SortableMetricHeader label="Gross commission" column="grossCommission" sortColumn={comparisonSort.column} sortDirection={comparisonSort.direction} onSort={toggleComparisonSort} /><SortableMetricHeader label="Savvy net" column="savvyNet" sortColumn={comparisonSort.column} sortDirection={comparisonSort.direction} onSort={toggleComparisonSort} /><SortableMetricHeader label="UC" column="underContract" sortColumn={comparisonSort.column} sortDirection={comparisonSort.direction} onSort={toggleComparisonSort} /><SortableMetricHeader label="Overdue" column="overdueTasks" sortColumn={comparisonSort.column} sortDirection={comparisonSort.direction} onSort={toggleComparisonSort} /><SortableMetricHeader label="Flags" column="flags" sortColumn={comparisonSort.column} sortDirection={comparisonSort.direction} onSort={toggleComparisonSort} /><th className="px-4 py-3" /></tr></thead>
              <tbody>{visibleComparisonRows.map(({ agent, flagCount }: { agent: any; flagCount: number }) => <tr key={agent.agentId} className="border-b last:border-0 hover:bg-muted/25">
                <td className="px-4 py-3"><p className="font-medium">{agent.agentName}</p><p className="mt-0.5 text-xs text-muted-foreground">Avg. GCI {money(agent.averageGci, true)}</p></td>
                <td className="px-3 py-3 text-right font-medium tabular-nums"><AgentMetric value={agent.closings} total={totals.closings}>{number(agent.closings)}</AgentMetric></td>
                <td className="px-3 py-3 text-right tabular-nums"><AgentMetric value={agent.volume} total={totals.volume}>{money(agent.volume, true)}</AgentMetric></td>
                <td className="px-3 py-3 text-right font-medium tabular-nums"><AgentMetric value={agent.grossCommission} total={totals.grossCommission}>{money(agent.grossCommission, true)}</AgentMetric></td>
                <td className="px-3 py-3 text-right tabular-nums"><AgentMetric value={agent.savvyNet} total={totals.savvyNet}>{money(agent.savvyNet, true)}</AgentMetric></td>
                <td className="px-3 py-3 text-right tabular-nums"><AgentMetric value={agent.underContract} total={totals.underContract}>{number(agent.underContract)}</AgentMetric></td>
                <td className="px-3 py-3 text-right tabular-nums">{agent.overdueTasks ? <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">{number(agent.overdueTasks)}</Badge> : number(0)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{flagCount ? <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">{number(flagCount)}</Badge> : <span className="text-muted-foreground">0</span>}</td>
                <td className="px-4 py-3 text-right"><a href={buildTransactionUrl(filters, { agentId: String(agent.agentId), status: "closed" })} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">Records <ExternalLink className="h-3.5 w-3.5" /></a></td>
              </tr>)}</tbody>
            </table>
          </div>
          {zeroOnlyComparisonRows.length > 0 && <div className="border-t px-4 py-3"><button type="button" onClick={() => setShowZeroOnlyAgents((visible) => !visible)} className="text-xs font-semibold text-primary hover:underline">{showZeroOnlyAgents ? "Hide agents with all 0's" : "Show agents with all 0's"}</button>{!showZeroOnlyAgents && <span className="ml-2 text-xs text-muted-foreground">{number(zeroOnlyComparisonRows.length)} hidden</span>}</div>}
        </CardContent>
      </Card>
    </section>

    <section className="grid gap-5 xl:grid-cols-2">
      <Card><CardHeader><CardTitle className="text-base">Flagged transactions</CardTitle><CardDescription>Prioritized current records needing an owner’s review.</CardDescription></CardHeader><CardContent className="space-y-2">{flaggedTransactions.length ? flaggedTransactions.map((tx: any) => <a key={tx.transactionId} href={"/transactions/" + tx.transactionId} className="flex items-center justify-between gap-3 rounded-lg border p-3 transition hover:border-primary/35 hover:bg-muted/20"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-semibold">{tx.contactName}</p><Badge variant="outline" className={statusColors[tx.status] ?? ""}>{titleCase(tx.status)}</Badge></div><p className="mt-1 truncate text-xs text-muted-foreground">{tx.agentName} · {tx.propertyAddress ?? "No property address"} · {tx.flagLabel}</p></div><div className="shrink-0 text-right"><p className="text-sm font-semibold">{money(tx.grossCommission, true)}</p><p className="text-xs text-muted-foreground">{day(tx.closingDate)}</p></div></a>) : <p className="py-6 text-center text-sm text-muted-foreground">No current transaction flags in this scope.</p>}</CardContent></Card>
      <Card><CardHeader><CardTitle className="text-base">Overdue task queue</CardTitle><CardDescription>Open work that needs ownership or a new due date.</CardDescription></CardHeader><CardContent className="space-y-2">{overdueTasks.length ? overdueTasks.map((task: any) => <a key={task.taskId} href={"/tasks/" + task.taskId} className="flex items-center justify-between gap-3 rounded-lg border p-3 transition hover:border-primary/35 hover:bg-muted/20"><div className="min-w-0"><div className="flex items-center gap-2"><p className="truncate text-sm font-semibold">{task.title}</p><Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">{titleCase(task.priority)}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{task.agentName}{task.transactionId ? " · linked to transaction" : ""}</p></div><div className="shrink-0 text-right"><p className="text-xs font-semibold text-rose-700">Due {day(task.dueDate)}</p></div></a>) : <p className="py-6 text-center text-sm text-muted-foreground">No overdue tasks in this scope.</p>}</CardContent></Card>
    </section>
  </div>;
}

function GroupLeaderReport({ data, selectedLeaderId }: { data: any; selectedLeaderId: string }) {
  const { production, change, flags, monthly, groups, coaching, filters } = data;
  const selectedGroups = selectedLeaderId === "all" ? groups : groups.filter((group: any) => String(group.leaderId) === selectedLeaderId);
  const leaderName = selectedGroups.length === 1 ? selectedGroups[0].leaderName : selectedGroups.length > 1 ? "Selected group leader" : "All group leaders";
  const teamFlags = coaching.reduce((total: number, agent: any) => total + agent.commissionFlags + agent.pastExpectedCloseDate + agent.noExpectedCloseDate, 0);
  return <div className="space-y-7"><section className="rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/[0.08] via-background to-emerald-50/60 p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Group Leader Review</p><h2 className="mt-1 text-xl font-semibold tracking-tight">{leaderName}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Use this view to prepare a concrete, evidence-backed coaching conversation: production context, financial contribution, team follow-through, and the next issue to address for each agent.</p></div><Badge variant="secondary" className="h-7 w-fit">{number(coaching.length)} agents in scope</Badge></div></section><section className="space-y-3"><SectionHeader title="Team snapshot" description="Closed production is date-scoped; operational attention is current-state work." /><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><MetricCard label="Closings" value={number(production.closings)} description="Closed production" delta={change.closings} icon={CheckCircle2} tone="text-emerald-700" /><MetricCard label="Volume" value={money(production.volume, true)} description="Closed purchase volume" delta={change.volume} icon={Landmark} tone="text-sky-700" /><MetricCard label="Gross commission" value={money(production.grossCommission, true)} description="Recorded transaction GCI" delta={change.grossCommission} icon={CircleDollarSign} tone="text-indigo-700" /><MetricCard label="Savvy net" value={money(production.savvyNet, true)} description="Recorded Savvy payout items" delta={change.savvyNet} icon={TrendingUp} tone="text-primary" /><MetricCard label="Under contract" value={number(coaching.reduce((sum: number, agent: any) => sum + agent.underContract, 0))} description="Current open transactions" icon={BriefcaseBusiness} tone="text-violet-700" /></div></section><section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><FlagCard label="Overdue tasks" value={flags.overdueTasks} description="Follow-through debt across team members" icon={ClipboardList} href={buildTaskUrl(filters)} tone="rose" /><FlagCard label="Financial review" value={flags.commissionFlags} description="Commission flags requiring review" icon={Flag} href={buildTransactionUrl(filters, { flagPayoutIntegrity: "true" })} tone="violet" /><FlagCard label="Past expected close" value={flags.pastExpectedCloseDate} description="Open deals needing a reset" icon={CalendarClock} href={buildTransactionUrl(filters, { status: "under_contract", flagPastClosingDate: "true" })} tone="rose" /><FlagCard label="Close-date hygiene" value={flags.noExpectedCloseDate} description="Open deals missing an expected close" icon={AlertTriangle} href={buildTransactionUrl(filters, { status: "under_contract", flagNoClosingDate: "true" })} tone="amber" /></section><section className="grid gap-5 xl:grid-cols-[1.05fr_1.45fr]"><Card><CardHeader><CardTitle className="text-base">Team momentum</CardTitle><CardDescription>Monthly closed volume and closings for the selected group-leader scope, with current Under Contract potential grouped by projected close timing.</CardDescription></CardHeader><CardContent>{monthly.length ? <ResponsiveContainer width="100%" height={290}><ComposedChart data={monthlyTrendData(monthly)} margin={{ left: 0, right: 8, top: 6, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} /><YAxis yAxisId="volume" tickFormatter={(value) => money(value, true)} tickLine={false} axisLine={false} width={60} fontSize={11} /><YAxis yAxisId="closings" orientation="right" tickLine={false} axisLine={false} width={26} fontSize={11} /><Tooltip filterNull formatter={(value: number, key: string) => productionTrendTooltip(value, key)} /><Bar yAxisId="volume" dataKey="volume" name="Volume" fill="#1F6D5B" radius={[5, 5, 0, 0]} /><Bar yAxisId="volume" dataKey="futureVolume" name="Under Contract volume" fill="#0EA5A4" fillOpacity={0.65} radius={[5, 5, 0, 0]} /><Line yAxisId="closings" type="monotone" dataKey="closings" name="Closings" stroke="#2563EB" strokeWidth={2.5} dot={{ r: 3 }} /><Line yAxisId="closings" type="monotone" dataKey="underContract" name="Under Contract" stroke="#8B5CF6" strokeWidth={2.25} strokeDasharray="6 4" dot={{ r: 2 }} /></ComposedChart></ResponsiveContainer> : <ChartEmpty label="team trend data" />}</CardContent></Card><Card><CardHeader><CardTitle className="text-base">Group coverage</CardTitle><CardDescription>Configured groups included in this review.</CardDescription></CardHeader><CardContent className="space-y-3">{selectedGroups.length ? selectedGroups.map((group: any) => <div key={group.groupId} className="rounded-xl border p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{group.groupName}</p><p className="mt-1 text-xs text-muted-foreground">Leader: {group.leaderName}</p></div><Badge variant="secondary">{number(group.memberCount)} members</Badge></div></div>) : <p className="py-8 text-center text-sm text-muted-foreground">No group is configured for this selection.</p>}<div className="rounded-lg bg-muted/50 p-3 text-sm"><p className="font-semibold">Conversation starting point</p><p className="mt-1 leading-6 text-muted-foreground">There are <span className="font-semibold text-foreground">{number(teamFlags)} live transaction flag{teamFlags === 1 ? "" : "s"}</span> and <span className="font-semibold text-foreground">{number(flags.overdueTasks)} overdue task{flags.overdueTasks === 1 ? "" : "s"}</span> in this team scope.</p></div></CardContent></Card></section><section className="space-y-3"><SectionHeader title="Coaching queue" description="Start with the highest-priority agent; prompts are deterministic and traceable to the displayed metrics." /><div className="grid gap-3 lg:grid-cols-2">{coaching.map((agent: any) => <Card key={agent.agentId} className={agent.priority === "high" ? "border-rose-200" : agent.priority === "medium" ? "border-amber-200" : ""}><CardContent className="p-4"><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{agent.agentName}</p><Badge variant="outline" className={agent.priority === "high" ? "border-rose-200 bg-rose-50 text-rose-700" : agent.priority === "medium" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}>{agent.priority === "healthy" ? "On track" : `${titleCase(agent.priority)} attention`}</Badge></div><p className="mt-2 text-sm leading-6 text-muted-foreground">{agent.prompt}</p></div><a href={buildTransactionUrl(filters, { agentId: String(agent.agentId), status: "closed" })} className="shrink-0 text-primary"><ExternalLink className="h-4 w-4" /></a></div><div className="mt-4 grid grid-cols-4 gap-2 text-center"><div className="rounded-md bg-muted/55 px-2 py-2"><p className="text-xs text-muted-foreground">Closed</p><p className="mt-1 font-semibold">{number(agent.closings)}</p></div><div className="rounded-md bg-muted/55 px-2 py-2"><p className="text-xs text-muted-foreground">UC</p><p className="mt-1 font-semibold">{number(agent.underContract)}</p></div><div className="rounded-md bg-muted/55 px-2 py-2"><p className="text-xs text-muted-foreground">Overdue</p><p className="mt-1 font-semibold">{number(agent.overdueTasks)}</p></div><div className="rounded-md bg-muted/55 px-2 py-2"><p className="text-xs text-muted-foreground">GCI</p><p className="mt-1 font-semibold">{money(agent.grossCommission, true)}</p></div></div></CardContent></Card>)}</div></section></div>;
}

function TransactionReport({ data, update }: { data: any; update: (patch: QueryPatch) => void }) {
  const { summary, flags, statuses, pipeline, representationByStatus = [], transactionTypes, monthly, agentOutcomes = [], evidence, pagination, filters } = data;
  const [outcomesSort, setOutcomesSort] = useState({ column: "grossCommission", direction: "desc" as "asc" | "desc" });
  const [showZeroOnlyOutcomeAgents, setShowZeroOnlyOutcomeAgents] = useState(false);
  const contributionTotal = representationByStatus.reduce((total: number, row: any) => total + Number(row.grossCommission ?? 0), 0);
  const outcomeTotals = agentOutcomes.reduce((sum: { units: number; closings: number; terminations: number; grossCommission: number; savvyNet: number }, agent: any) => ({
    units: sum.units + Number(agent.units ?? 0),
    closings: sum.closings + Number(agent.closings ?? 0),
    terminations: sum.terminations + Number(agent.terminations ?? 0),
    grossCommission: sum.grossCommission + Number(agent.grossCommission ?? 0),
    savvyNet: sum.savvyNet + Number(agent.savvyNet ?? 0),
  }), { units: 0, closings: 0, terminations: 0, grossCommission: 0, savvyNet: 0 });
  const zeroOnlyOutcomeAgents = agentOutcomes.filter((agent: any) => [agent.units, agent.closings, agent.terminations, agent.grossCommission, agent.savvyNet].every((value) => Number(value ?? 0) === 0));
  const outcomeMetricValue = (agent: any, column: string) => column === "terminations" ? (Number(agent.closings) > 0 ? Number(agent.terminations) / Number(agent.closings) : 0) : Number(agent[column] ?? 0);
  const visibleOutcomeAgents = [...(showZeroOnlyOutcomeAgents ? agentOutcomes : agentOutcomes.filter((agent: any) => !zeroOnlyOutcomeAgents.includes(agent)))].sort((left: any, right: any) => {
    const difference = outcomeMetricValue(left, outcomesSort.column) - outcomeMetricValue(right, outcomesSort.column);
    return outcomesSort.direction === "desc" ? -difference : difference;
  });
  const toggleOutcomesSort = (column: string) => setOutcomesSort((current) => ({ column, direction: current.column === column && current.direction === "desc" ? "asc" : "desc" }));
  const isTerminationView = filters.status === "terminated";
  const monthlyTitle = isTerminationView ? "Monthly terminations" : "Monthly production";
  const monthlyDescription = isTerminationView ? "Terminated transactions by month in the selected date range; Under Contract potential remains a current pipeline series." : "Closed volume, units, gross commission, and Savvy net over the selected period, alongside current Under Contract potential.";
  const deepLink = (patch: QueryPatch) => {
    const params = new URLSearchParams(window.location.search);
    params.set("report", "transactions");
    Object.entries(patch).forEach(([key, value]) => {
      if (value === null || value === undefined || value === "") params.delete(key);
      else params.set(key, value);
    });
    return "/analytics?" + params.toString();
  };

  return <div className="space-y-7">
    <section className="space-y-3">
      <SectionHeader title="Transaction performance" description={(filters.dateBasis === "contract" ? "Contract-date" : "Closing-date") + " performance for the selected period. All deltas compare with the immediately preceding period of equal length."} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Period units" value={number(summary.units)} description="Transactions in the selected period" delta={summary.change?.units} icon={BriefcaseBusiness} tone="text-sky-700" />
        <MetricCard label="Closed" value={number(summary.closedUnits)} description="Closed transactions in the selected period" delta={summary.change?.closings} icon={CheckCircle2} tone="text-emerald-700" />
        <MetricCard label="Volume" value={money(summary.volume, true)} description="Purchase volume in the selected period" delta={summary.change?.volume} icon={Landmark} tone="text-sky-700" />
        <MetricCard label="Gross commission" value={money(summary.grossCommission, true)} description="Recorded transaction GCI" delta={summary.change?.grossCommission} icon={CircleDollarSign} tone="text-indigo-700" />
        <MetricCard label="Savvy net" value={money(summary.savvyNet, true)} description="Recorded Savvy payout items" delta={summary.change?.savvyNet} icon={TrendingUp} tone="text-primary" />
        <MetricCard label="Avg. GCI" value={money(summary.averageGci, true)} description="Per selected-period transaction" delta={summary.change?.averageGci} icon={BarChart3} tone="text-violet-700" />
        <MetricCard label="Days to close" value={summary.averageDaysToClose === null ? "—" : String(Math.round(summary.averageDaysToClose))} description="Average contract to close" delta={summary.change?.averageDaysToClose} icon={CalendarClock} tone="text-amber-700" />
        <MetricCard label="Current under contract" value={number(pipeline?.units)} description="Live pipeline snapshot; not date-filtered" icon={BriefcaseBusiness} tone="text-sky-700" />
      </div>
    </section>

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <FlagCard label="Termination rate" value={summary.terminationRate ?? 0} displayValue={summary.terminationRate === null ? "—" : percentage(summary.terminationRate)} description={summary.terminationRate === null ? "Available when all statuses are selected" : "Terminated ÷ closed plus terminated"} icon={TrendingUp} href={buildTransactionUrl(filters, { status: "terminated" })} tone="rose" />
      <FlagCard label="Commission flags" value={flags.commissionFlags} description="Current review flags; not date-filtered" icon={Flag} href={buildTransactionUrl(filters, { flagPayoutIntegrity: "true" })} tone="violet" />
      <FlagCard label="Past expected close" value={flags.pastExpectedCloseDate} description="Current under-contract pipeline; not date-filtered" icon={CalendarClock} href={buildTransactionUrl(filters, { status: "under_contract", flagPastClosingDate: "true" })} tone="rose" />
      <FlagCard label="No expected close" value={flags.noExpectedCloseDate} description="Current under-contract pipeline; not date-filtered" icon={AlertTriangle} href={buildTransactionUrl(filters, { status: "under_contract", flagNoClosingDate: "true" })} tone="amber" />
    </section>

    <section className="space-y-3">
      <SectionHeader title="Focused transaction views" description="Open a deliberately narrowed report for terminations, representation, production, or review flags." />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <a href={deepLink({ status: "terminated", page: null })}><Card className="h-full transition hover:-translate-y-0.5 hover:shadow-sm"><CardContent className="p-4"><p className="text-sm font-semibold">Termination analysis</p><p className="mt-1 text-xs text-muted-foreground">Monthly trend and terminated source records.</p></CardContent></Card></a>
        <a href={deepLink({ status: "all", transactionType: "buyer", page: null })}><Card className="h-full transition hover:-translate-y-0.5 hover:shadow-sm"><CardContent className="p-4"><p className="text-sm font-semibold">Representation analysis</p><p className="mt-1 text-xs text-muted-foreground">Buyer, seller, and dual contribution views.</p></CardContent></Card></a>
        <a href={deepLink({ status: "closed", page: null })}><Card className="h-full transition hover:-translate-y-0.5 hover:shadow-sm"><CardContent className="p-4"><p className="text-sm font-semibold">Monthly production</p><p className="mt-1 text-xs text-muted-foreground">Closed production, GCI, Savvy net, and per-agent evidence.</p></CardContent></Card></a>
        <a href={deepLink({ status: "under_contract", page: null })}><Card className="h-full transition hover:-translate-y-0.5 hover:shadow-sm"><CardContent className="p-4"><p className="text-sm font-semibold">Commission & close flags</p><p className="mt-1 text-xs text-muted-foreground">Live pipeline review and payout integrity flags.</p></CardContent></Card></a>
      </div>
    </section>

    <section className="grid gap-5 xl:grid-cols-[1.45fr_0.95fr]">
      <Card>
        <CardHeader><CardTitle className="text-base">{monthlyTitle}</CardTitle><CardDescription>{monthlyDescription}</CardDescription></CardHeader>
        <CardContent>{monthly.length ? <ResponsiveContainer width="100%" height={300}><LineChart data={monthlyTrendData(monthly)} margin={{ left: 0, right: 10, top: 6, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} /><YAxis yAxisId="money" tickFormatter={(value) => money(value, true)} tickLine={false} axisLine={false} width={60} fontSize={11} /><YAxis yAxisId="units" orientation="right" tickLine={false} axisLine={false} width={26} fontSize={11} /><Tooltip filterNull formatter={(value: number, key: string) => productionTrendTooltip(value, key)} /><Legend /><Line yAxisId="money" type="monotone" dataKey="volume" name="Volume" stroke="#0284C7" strokeWidth={2.25} dot={false} /><Line yAxisId="money" type="monotone" dataKey="grossCommission" name="Gross commission" stroke="#4338CA" strokeWidth={2.5} dot={false} /><Line yAxisId="money" type="monotone" dataKey="savvyNet" name="Savvy net" stroke="#1F6D5B" strokeWidth={2.5} dot={false} /><Line yAxisId="money" type="monotone" dataKey="futureVolume" name="Under Contract volume" stroke="#0EA5A4" strokeWidth={2.25} strokeDasharray="6 4" dot={false} /><Line yAxisId="money" type="monotone" dataKey="futureGci" name="Under Contract GCI" stroke="#8B5CF6" strokeWidth={2.25} strokeDasharray="6 4" dot={false} /><Line yAxisId="money" type="monotone" dataKey="futureSavvyNet" name="Under Contract Savvy net" stroke="#14B8A6" strokeWidth={2.25} strokeDasharray="6 4" dot={false} /><Line yAxisId="units" type="monotone" dataKey="units" name="Units" stroke="#D97706" strokeWidth={2.25} dot={{ r: 2 }} /><Line yAxisId="units" type="monotone" dataKey="underContract" name="Under Contract" stroke="#8B5CF6" strokeWidth={2.25} strokeDasharray="6 4" dot={{ r: 2 }} /></LineChart></ResponsiveContainer> : <ChartEmpty label="monthly transaction data" />}</CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Representation mix</CardTitle><CardDescription>Buyer, seller, and dual-agency units in the selected period.</CardDescription></CardHeader>
        <CardContent>{transactionTypes.length ? <ResponsiveContainer width="100%" height={300}><PieChart><Pie data={transactionTypes.map((row: any) => ({ ...row, label: titleCase(row.transactionType) }))} dataKey="units" nameKey="label" cx="50%" cy="46%" outerRadius={86} innerRadius={52} paddingAngle={3}>{transactionTypes.map((_row: any, index: number) => <Cell key={index} fill={chartColors[index]} />)}</Pie><Tooltip formatter={(value: number) => number(value)} /><Legend verticalAlign="bottom" iconType="circle" /></PieChart></ResponsiveContainer> : <ChartEmpty label="representation mix" />}</CardContent>
      </Card>
    </section>

    <section className="grid gap-5 xl:grid-cols-2">
      <Card>
        <CardHeader><CardTitle className="text-base">Period outcomes</CardTitle><CardDescription>Closed and terminated activity is constrained to the selected date range. The separate pipeline figure is live.</CardDescription></CardHeader>
        <CardContent className="p-0 overflow-x-auto"><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground"><th className="px-4 py-3 text-left">Status</th><th className="px-3 py-3 text-right">Units</th><th className="px-3 py-3 text-right">Volume</th><th className="px-3 py-3 text-right">GCI</th><th className="px-4 py-3 text-right">Savvy net</th></tr></thead><tbody>{statuses.map((row: any) => <tr key={row.status} className="border-b last:border-0"><td className="px-4 py-3"><Badge variant="outline" className={statusColors[row.status] ?? ""}>{titleCase(row.status)}</Badge></td><td className="px-3 py-3 text-right tabular-nums">{number(row.units)}</td><td className="px-3 py-3 text-right tabular-nums">{money(row.volume, true)}</td><td className="px-3 py-3 text-right tabular-nums">{money(row.grossCommission, true)}</td><td className="px-4 py-3 text-right tabular-nums">{money(row.savvyNet, true)}</td></tr>)}</tbody></table></div><div className="border-t bg-sky-50/55 px-4 py-3"><div className="flex items-center justify-between gap-4"><div><p className="text-sm font-semibold text-sky-900">Current under-contract pipeline</p><p className="text-xs text-sky-800">Live status inventory, intentionally independent of the selected date range.</p></div><div className="text-right"><p className="text-lg font-semibold text-sky-900">{number(pipeline?.units)} units</p><p className="text-xs text-sky-800">{money(pipeline?.grossCommission, true)} GCI</p></div></div></div></CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Representation contribution</CardTitle><CardDescription>Contribution by representation and outcome status, including GCI share.</CardDescription></CardHeader>
        <CardContent className="p-0 overflow-x-auto"><div className="max-h-[360px] overflow-auto"><table className="w-full text-sm"><thead className="sticky top-0 bg-muted/95"><tr className="border-b text-xs uppercase tracking-wide text-muted-foreground"><th className="px-4 py-3 text-left">Status</th><th className="px-3 py-3 text-left">Representation</th><th className="px-3 py-3 text-right">Units</th><th className="px-3 py-3 text-right">GCI</th><th className="px-4 py-3 text-right">GCI share</th></tr></thead><tbody>{representationByStatus.map((row: any, index: number) => <tr key={row.status + "-" + row.transactionType + "-" + index} className="border-b last:border-0"><td className="px-4 py-3"><Badge variant="outline" className={statusColors[row.status] ?? ""}>{titleCase(row.status)}</Badge></td><td className="px-3 py-3">{titleCase(row.transactionType)}</td><td className="px-3 py-3 text-right tabular-nums">{number(row.units)}</td><td className="px-3 py-3 text-right tabular-nums">{money(row.grossCommission, true)}</td><td className="px-4 py-3 text-right font-medium tabular-nums">{contributionTotal ? percentage((Number(row.grossCommission) / contributionTotal) * 100) : "—"}</td></tr>)}{!representationByStatus.length && <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">No representation contribution is available for this scope.</td></tr>}</tbody></table></div></CardContent>
      </Card>
    </section>

    <section className="space-y-3">
      <SectionHeader title={isTerminationView ? "Terminations by agent" : "Outcomes by agent"} description={isTerminationView ? "Date-scoped terminations ranked by agent. Select a metric header to sort; the terminated percentage is terminated outcomes divided by that agent’s closed outcomes." : "Date-scoped closed and terminated outcomes by agent, with direct source-record access. Select a metric header to sort; the terminated percentage is terminated outcomes divided by that agent’s closed outcomes."} />
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-sm"><thead><tr className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground"><th className="px-4 py-3 text-left">Agent</th><SortableMetricHeader label="Units" column="units" sortColumn={outcomesSort.column} sortDirection={outcomesSort.direction} onSort={toggleOutcomesSort} /><SortableMetricHeader label="Closed" column="closings" sortColumn={outcomesSort.column} sortDirection={outcomesSort.direction} onSort={toggleOutcomesSort} /><SortableMetricHeader label="Terminated rate" column="terminations" sortColumn={outcomesSort.column} sortDirection={outcomesSort.direction} onSort={toggleOutcomesSort} /><SortableMetricHeader label="GCI" column="grossCommission" sortColumn={outcomesSort.column} sortDirection={outcomesSort.direction} onSort={toggleOutcomesSort} /><SortableMetricHeader label="Savvy net" column="savvyNet" sortColumn={outcomesSort.column} sortDirection={outcomesSort.direction} onSort={toggleOutcomesSort} className="px-4 py-3 text-right font-semibold" /></tr></thead><tbody>{visibleOutcomeAgents.map((agent: any) => <tr key={String(agent.agentId) + agent.agentName} className="border-b last:border-0 hover:bg-muted/25"><td className="px-4 py-3 font-medium">{agent.agentId ? <a href={buildTransactionUrl(filters, { agentId: String(agent.agentId) })} className="text-primary hover:underline">{agent.agentName}</a> : agent.agentName}</td><td className="px-3 py-3 text-right tabular-nums"><AgentMetric value={agent.units} total={outcomeTotals.units}>{number(agent.units)}</AgentMetric></td><td className="px-3 py-3 text-right tabular-nums"><AgentMetric value={agent.closings} total={outcomeTotals.closings}>{number(agent.closings)}</AgentMetric></td><td className="px-3 py-3 text-right font-medium tabular-nums"><span className="inline-flex items-baseline justify-end gap-1.5 whitespace-nowrap">{number(agent.terminations)}<span className="text-xs font-medium text-muted-foreground">({Number(agent.closings) > 0 ? percentage((Number(agent.terminations) / Number(agent.closings)) * 100) : "—"})</span></span></td><td className="px-3 py-3 text-right tabular-nums"><AgentMetric value={agent.grossCommission} total={outcomeTotals.grossCommission}>{money(agent.grossCommission, true)}</AgentMetric></td><td className="px-4 py-3 text-right tabular-nums"><AgentMetric value={agent.savvyNet} total={outcomeTotals.savvyNet}>{money(agent.savvyNet, true)}</AgentMetric></td></tr>)}{!visibleOutcomeAgents.length && <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">No agent outcomes are available for this scope.</td></tr>}</tbody></table></div>
          {zeroOnlyOutcomeAgents.length > 0 && <div className="border-t px-4 py-3"><button type="button" onClick={() => setShowZeroOnlyOutcomeAgents((visible) => !visible)} className="text-xs font-semibold text-primary hover:underline">{showZeroOnlyOutcomeAgents ? "Hide agents with all 0's" : "Show agents with all 0's"}</button>{!showZeroOnlyOutcomeAgents && <span className="ml-2 text-xs text-muted-foreground">{number(zeroOnlyOutcomeAgents.length)} hidden</span>}</div>}
        </CardContent>
      </Card>
    </section>

    <section className="space-y-3">
      <SectionHeader title="Transaction evidence" description="Page through the individual source records behind the selected period metrics and filters." action={<Badge variant="secondary">{number(pagination.total)} records</Badge>} />
      <Card>
        <CardContent className="p-0 overflow-x-auto"><div className="overflow-x-auto"><table className="w-full min-w-[1120px] text-sm"><thead><tr className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground"><th className="px-4 py-3 text-left">Client / transaction</th><th className="px-3 py-3 text-left">Agent</th><th className="px-3 py-3 text-left">Type</th><th className="px-3 py-3 text-left">Status</th><th className="px-3 py-3 text-left">Dates</th><th className="px-3 py-3 text-right">Volume</th><th className="px-3 py-3 text-right">GCI</th><th className="px-3 py-3 text-right">Savvy net</th><th className="px-4 py-3 text-left">Flags</th></tr></thead><tbody>{evidence.map((tx: any) => <tr key={tx.transactionId} className="border-b last:border-0 hover:bg-muted/25"><td className="px-4 py-3"><a href={"/transactions/" + tx.transactionId} className="font-semibold text-primary hover:underline">{tx.contactName}</a><p className="mt-0.5 max-w-[220px] truncate text-xs text-muted-foreground">{tx.propertyAddress ?? tx.transactionNumber ?? "No property address"}</p></td><td className="px-3 py-3">{tx.agentName}</td><td className="px-3 py-3"><Badge variant="outline" className={statusColors[tx.transactionType] ?? ""}>{titleCase(tx.transactionType)}</Badge></td><td className="px-3 py-3"><Badge variant="outline" className={statusColors[tx.status] ?? ""}>{titleCase(tx.status)}</Badge></td><td className="px-3 py-3 text-xs"><p>Contract: {day(tx.contractDate)}</p><p className="mt-1">Close: {day(tx.closingDate)}</p></td><td className="px-3 py-3 text-right tabular-nums">{money(tx.volume, true)}</td><td className="px-3 py-3 text-right font-medium tabular-nums">{money(tx.grossCommission, true)}</td><td className="px-3 py-3 text-right tabular-nums">{money(tx.savvyNet, true)}</td><td className="px-4 py-3"><div className="flex max-w-[200px] flex-wrap gap-1">{tx.commissionFlag && <Badge variant="outline" className="border-violet-200 bg-violet-50 text-violet-700">Commission</Badge>}{tx.pastExpectedCloseDate && <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">Past close</Badge>}{tx.missingExpectedCloseDate && <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">No close date</Badge>}{!tx.commissionFlag && !tx.pastExpectedCloseDate && !tx.missingExpectedCloseDate && <span className="text-xs text-muted-foreground">—</span>}</div></td></tr>)}</tbody></table></div>{!evidence.length && <p className="py-10 text-center text-sm text-muted-foreground">No transactions match this scope.</p>}<div className="flex items-center justify-between border-t px-4 py-3"><p className="text-xs text-muted-foreground">Page {pagination.page} of {pagination.totalPages}</p><div className="flex gap-2"><Button variant="outline" size="sm" disabled={pagination.page <= 1} onClick={() => update({ page: String(pagination.page - 1) })}><ChevronLeft className="mr-1 h-3.5 w-3.5" />Previous</Button><Button variant="outline" size="sm" disabled={pagination.page >= pagination.totalPages} onClick={() => update({ page: String(pagination.page + 1) })}>Next<ChevronRight className="ml-1 h-3.5 w-3.5" /></Button></div></div></CardContent>
      </Card>
    </section>
  </div>;
}

function LoadingReport() {
  return <div className="space-y-5"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-32" />)}</div><div className="grid gap-5 xl:grid-cols-2"><Skeleton className="h-[360px]" /><Skeleton className="h-[360px]" /></div><Skeleton className="h-[420px]" /></div>;
}

export default function ReportingSuitePage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  // Wouter exposes the pathname here; keep query-string report state explicitly reactive.
  const [search, setSearch] = useState(() => window.location.search);
  useEffect(() => {
    const syncSearch = () => setSearch(window.location.search);
    window.addEventListener("popstate", syncSearch);
    return () => window.removeEventListener("popstate", syncSearch);
  }, []);
  const params = useMemo(() => new URLSearchParams(search.startsWith("?") ? search.slice(1) : search), [search]);
  const activeReport = (params.get("report") ?? "agents") as ReportKind;
  const today = localDay(new Date());
  const baseFilters = useMemo(() => ({
    dateFrom: params.get("from") ?? startOfYear(),
    dateTo: params.get("to") ?? today,
    dateBasis: (params.get("dateBasis") ?? "closing") as "closing" | "contract",
    agentId: params.get("agentId") && params.get("agentId") !== "all" ? Number(params.get("agentId")) : undefined,
    agentIds: params.get("agentIds") ? params.get("agentIds")!.split(",").map(Number).filter((n) => n > 0) : undefined,
    groupLeaderId: params.get("groupLeaderId") && params.get("groupLeaderId") !== "all" ? Number(params.get("groupLeaderId")) : undefined,
    marketProfileId: params.get("marketProfileId") && params.get("marketProfileId") !== "all" ? Number(params.get("marketProfileId")) : undefined,
    isaId: params.get("isaId") && params.get("isaId") !== "all" ? Number(params.get("isaId")) : undefined,
    isaIds: params.get("isaIds") ? params.get("isaIds")!.split(",").map(Number).filter((n) => n > 0) : undefined,
    leadSourceId: params.get("leadSourceId") && params.get("leadSourceId") !== "all" ? Number(params.get("leadSourceId")) : undefined,
    leadSourceIds: params.get("leadSourceIds") ? params.get("leadSourceIds")!.split(",").map(Number).filter((n) => n > 0) : undefined,
    status: (params.get("status") ?? "all") as "all" | "closed" | "under_contract" | "terminated",
    transactionType: (params.get("transactionType") ?? "all") as "all" | "buyer" | "seller" | "dual",
  }), [params, today]);
  const page = Math.max(1, Number(params.get("page") ?? "1"));
  const filtersQuery = trpc.analytics.reportingFilters.useQuery(undefined, { staleTime: 5 * 60_000 });
  const groupFilters = { ...baseFilters, agentId: undefined, agentIds: undefined };
  const marketFilters = { ...baseFilters, agentId: undefined, agentIds: undefined, groupLeaderId: undefined, marketProfileId: undefined };
  const agentQuery = trpc.analytics.agentReport.useQuery(baseFilters, { enabled: activeReport === "agents", staleTime: 20_000 });
  const groupQuery = trpc.analytics.groupLeaderReport.useQuery(groupFilters, { enabled: activeReport === "leaders", staleTime: 20_000 });
  const transactionQuery = trpc.analytics.transactionStatisticsReport.useQuery({ ...baseFilters, page, limit: 25 }, { enabled: activeReport === "transactions", staleTime: 20_000 });
  const onboardingQuery = trpc.analytics.agentOnboardingReport.useQuery({ ...baseFilters, page, limit: 25 }, { enabled: activeReport === "onboarding", staleTime: 20_000 });
  const marketQuery = trpc.analytics.marketAnalyticsReport.useQuery(marketFilters, { enabled: activeReport === "markets", staleTime: 20_000 });
  const tasksQuery = trpc.analytics.tasksReport.useQuery({ ...baseFilters, page, limit: 25 }, { enabled: activeReport === "tasks", staleTime: 20_000 });
  const isaQuery = trpc.analytics.isaActivitiesReport.useQuery({ ...baseFilters, page, limit: 25 }, { enabled: activeReport === "isa", staleTime: 20_000 });
  const sourcesQuery = trpc.analytics.leadSourcesReport.useQuery({ ...baseFilters, limit: 500 }, { enabled: activeReport === "sources", staleTime: 20_000 });
  const adoptionQuery = trpc.analytics.savvyOsAdoptionReport.useQuery(undefined, { enabled: activeReport === "adoption", staleTime: 20_000 });
  const businessInsightsQuery = trpc.analytics.businessInsights.useQuery(undefined, { enabled: activeReport === "business_insights", staleTime: 60_000, refetchOnWindowFocus: false });
  const utils = trpc.useUtils();
  const refreshBusinessInsights = trpc.analytics.refreshBusinessInsights.useMutation({
    onSuccess: () => utils.analytics.businessInsights.invalidate(),
  });

  const update = (patch: QueryPatch) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") next.delete(key);
      else next.set(key, value);
    });
    const serialized = next.toString();
    setSearch(serialized ? `?${serialized}` : "");
    navigate(`/analytics${serialized ? `?${serialized}` : ""}`, { replace: true });
  };

  const selectReport = (report: ReportKind) => update({ report, page: null });
  const activeConfig = reportTabs.find((tab) => tab.id === activeReport) ?? reportTabs[0];
  const queryByReport = {
    agents: agentQuery,
    leaders: groupQuery,
    transactions: transactionQuery,
    onboarding: onboardingQuery,
    markets: marketQuery,
    tasks: tasksQuery,
    isa: isaQuery,
    sources: sourcesQuery,
    adoption: adoptionQuery,
    business_insights: businessInsightsQuery,
  };
  const activeQuery = queryByReport[activeReport] ?? agentQuery;
  const reportData = activeQuery.data as any;

  const reportNeedsFilters = activeReport !== "business_insights" && activeReport !== "adoption";

  return <div className="space-y-4 pb-8"><PageHeader title="Reporting" subtitle="A decision-ready suite for production, agent adoption, operational follow-through, and company-wide intelligence." actions={<Badge variant="secondary" className="h-7 gap-1"><BarChart3 className="h-3.5 w-3.5" /> Reporting suite</Badge>} /><div className="flex flex-wrap gap-1.5">{reportTabs.map((tab) => { const Icon = tab.icon; const isActive = tab.id === activeReport; return <button key={tab.id} type="button" onClick={() => selectReport(tab.id)} className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${isActive ? "border-primary bg-primary text-primary-foreground shadow-sm" : "bg-background text-muted-foreground hover:border-primary/35 hover:bg-muted/25 hover:text-foreground"}`}><Icon className="h-3.5 w-3.5 shrink-0" />{tab.label}</button>; })}</div><ReportingFilters activeReport={activeReport} params={params} filters={filtersQuery.data} update={update} />{(reportNeedsFilters && filtersQuery.isLoading) || activeQuery.isLoading ? <LoadingReport /> : activeQuery.error ? <Card className="border-rose-200"><CardContent className="flex flex-col items-center gap-3 p-10 text-center"><AlertTriangle className="h-7 w-7 text-rose-600" /><div><p className="font-semibold">Unable to load {activeConfig.label}</p><p className="mt-1 text-sm text-muted-foreground">{activeQuery.error.message}</p></div><Button variant="outline" onClick={() => activeQuery.refetch()}>Try again</Button></CardContent></Card> : activeReport === "business_insights" ? <BusinessInsightsReport data={businessInsightsQuery.data as any} isRefreshing={refreshBusinessInsights.isPending} refreshError={refreshBusinessInsights.error?.message} onRefresh={() => refreshBusinessInsights.mutate()} canRefresh={user?.role === "admin"} /> : reportData ? <>{activeReport === "agents" && <AgentReport data={reportData} />}{activeReport === "leaders" && <GroupLeaderReport data={reportData} selectedLeaderId={params.get("groupLeaderId") ?? "all"} />}{activeReport === "transactions" && <TransactionReport data={reportData} update={update} />}{activeReport === "onboarding" && <OnboardingReport data={reportData} update={update} />}{activeReport === "markets" && <MarketAnalyticsReport data={reportData} />}{activeReport === "tasks" && <TasksReport data={reportData} update={update} />}{activeReport === "isa" && <IsaActivitiesReport data={reportData} update={update} />}{activeReport === "sources" && <LeadSourcesReport data={reportData} update={update} />}{activeReport === "adoption" && <SavvyOsAdoptionReport data={reportData} />}</> : <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">No report data is available for this scope.</CardContent></Card>}</div>;
}
