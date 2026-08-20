import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BellRing,
  CalendarClock,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  DatabaseZap,
  DollarSign,
  Filter,
  Gauge,
  Goal,
  LineChart as LineChartIcon,
  RefreshCw,
  Settings2,
  ShieldAlert,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
  XCircle,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip as UiTooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { trpc } from "@/lib/trpc";

type FilterState = {
  preset: string;
  dateFrom: string;
  dateTo: string;
  marketProfileId?: number;
  agentId?: number;
  isaId?: number;
  leadSourceId?: number;
  transactionType?: "buyer" | "seller" | "dual";
  pipelineStatus?: string;
  transactionStatus?: "under_contract" | "closed" | "terminated";
};

const FILTER_STORAGE_KEY = "savvyos.admin-command-center.filters.v1";
const EMPTY_VALUE = "__all__";

function utcDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function defaultFilters(): FilterState {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return { preset: "mtd", dateFrom: utcDate(start), dateTo: utcDate(now) };
}

function loadFilters(): FilterState {
  try {
    const stored = localStorage.getItem(FILTER_STORAGE_KEY);
    if (!stored) return defaultFilters();
    const parsed = JSON.parse(stored) as Partial<FilterState>;
    if (!parsed.dateFrom || !parsed.dateTo) return defaultFilters();
    return { ...defaultFilters(), ...parsed };
  } catch {
    return defaultFilters();
  }
}

function rangeForPreset(preset: string): Pick<FilterState, "dateFrom" | "dateTo"> {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = utcDate(today);
  const dateOffset = (days: number) => utcDate(new Date(today.getTime() - days * 86_400_000));
  if (preset === "today") return { dateFrom: end, dateTo: end };
  if (preset === "yesterday") return { dateFrom: dateOffset(1), dateTo: dateOffset(1) };
  if (preset === "last_7") return { dateFrom: dateOffset(6), dateTo: end };
  if (preset === "last_30") return { dateFrom: dateOffset(29), dateTo: end };
  if (preset === "trailing_90") return { dateFrom: dateOffset(89), dateTo: end };
  if (preset === "trailing_12") return { dateFrom: utcDate(new Date(Date.UTC(today.getUTCFullYear() - 1, today.getUTCMonth(), today.getUTCDate() + 1))), dateTo: end };
  if (preset === "qtd") {
    const quarterStartMonth = Math.floor(today.getUTCMonth() / 3) * 3;
    return { dateFrom: utcDate(new Date(Date.UTC(today.getUTCFullYear(), quarterStartMonth, 1))), dateTo: end };
  }
  if (preset === "ytd") return { dateFrom: utcDate(new Date(Date.UTC(today.getUTCFullYear(), 0, 1))), dateTo: end };
  return { dateFrom: utcDate(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))), dateTo: end };
}

function currency(value: unknown, compact = false) {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: compact ? 1 : 0,
  }).format(amount);
}

function integer(value: unknown) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Number(value ?? 0));
}

function percent(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount) ? `${amount.toFixed(0)}%` : "—";
}

function dateLabel(date: string | Date | null | undefined) {
  if (!date) return "Not scheduled";
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? "Not scheduled" : parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function stageLabel(stage: string) {
  return stage.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusColor(status: string | null | undefined) {
  if (status === "on_track" || status === "on_pace" || status === "available") return "bg-emerald-100 text-emerald-800";
  if (status === "watch" || status === "needs_coaching" || status === "not_configured") return "bg-amber-100 text-amber-800";
  if (status === "at_risk" || status === "capacity_constrained") return "bg-rose-100 text-rose-800";
  return "bg-slate-100 text-slate-700";
}

function severityColor(severity: string) {
  return severity === "high" ? "bg-rose-100 text-rose-800 border-rose-200" : severity === "medium" ? "bg-amber-100 text-amber-800 border-amber-200" : "bg-slate-100 text-slate-700 border-slate-200";
}

function MetricCard({
  title,
  value,
  goal,
  change,
  status,
  description,
  onClick,
  trend,
  icon: Icon,
}: {
  title: string;
  value: string;
  goal?: string;
  change?: number | null;
  status?: string;
  description: string;
  onClick?: () => void;
  trend?: Array<{ period: string; gci?: number; volume?: number; units?: number }>;
  icon: React.ElementType;
}) {
  const trendUp = change !== null && change !== undefined && change >= 0;
  return (
    <Card className={onClick ? "group border-slate-200 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md cursor-pointer" : "border-slate-200 shadow-sm"} onClick={onClick}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {title}
              <UiTooltip>
                <TooltipTrigger asChild><CircleAlert className="h-3.5 w-3.5 cursor-help text-slate-400" /></TooltipTrigger>
                <TooltipContent className="max-w-64 text-xs">{description}</TooltipContent>
              </UiTooltip>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-slate-950">{value}</div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
              {goal && <span className="text-slate-500">{goal}</span>}
              {change !== null && change !== undefined && (
                <span className={trendUp ? "inline-flex items-center font-semibold text-emerald-700" : "inline-flex items-center font-semibold text-rose-700"}>
                  {trendUp ? <TrendingUp className="mr-0.5 h-3.5 w-3.5" /> : <TrendingDown className="mr-0.5 h-3.5 w-3.5" />}
                  {percent(Math.abs(change))} vs prior period
                </span>
              )}
              {status && <Badge className={`border-0 px-1.5 py-0 text-[10px] ${statusColor(status)}`}>{status.replace(/_/g, " ")}</Badge>}
            </div>
          </div>
          <div className="rounded-xl bg-slate-100 p-2.5 text-slate-700"><Icon className="h-5 w-5" /></div>
        </div>
        {trend && trend.length > 1 && (
          <div className="mt-3 h-9 opacity-85">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend}><Line type="monotone" dataKey="gci" stroke="#0f766e" strokeWidth={2} dot={false} /></LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SectionHeading({ title, detail, action }: { title: string; detail: string; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
      <div><h2 className="text-base font-bold text-slate-950">{title}</h2><p className="mt-0.5 text-sm text-slate-500">{detail}</p></div>
      {action}
    </div>
  );
}

function EmptySection({ message }: { message: string }) {
  return <div className="flex min-h-28 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 px-6 text-center text-sm text-slate-500">{message}</div>;
}

export default function AdminDashboard() {
  const [, navigate] = useLocation();
  const [filters, setFilters] = useState<FilterState>(loadFilters);
  const [goalDialogOpen, setGoalDialogOpen] = useState(false);
  const [goalDraft, setGoalDraft] = useState({ companyGciGoal: "", companyVolumeGoal: "", companyUnitsGoal: "", newLeadSlaHours: "24", pipelineStaleDays: "14" });
  const utils = trpc.useUtils();

  useEffect(() => { localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filters)); }, [filters]);

  const queryInput = useMemo(() => ({
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    ...(filters.marketProfileId ? { marketProfileId: filters.marketProfileId } : {}),
    ...(filters.agentId ? { agentId: filters.agentId } : {}),
    ...(filters.isaId ? { isaId: filters.isaId } : {}),
    ...(filters.leadSourceId ? { leadSourceId: filters.leadSourceId } : {}),
    ...(filters.transactionType ? { transactionType: filters.transactionType } : {}),
    ...(filters.pipelineStatus ? { pipelineStatus: filters.pipelineStatus as any } : {}),
    ...(filters.transactionStatus ? { transactionStatus: filters.transactionStatus } : {}),
  }), [filters]);

  const { data, isLoading, isFetching, error, refetch } = trpc.analytics.adminCommandCenter.useQuery(queryInput);
  const { data: filterOptions } = trpc.analytics.adminCommandCenterFilters.useQuery();
  const reviewMutation = trpc.analytics.reviewAdminCommandCenterAlert.useMutation({
    onSuccess: () => utils.analytics.adminCommandCenter.invalidate(),
  });
  const settingsMutation = trpc.analytics.updateAdminCommandCenterSettings.useMutation({
    onSuccess: () => { utils.analytics.adminCommandCenter.invalidate(); setGoalDialogOpen(false); },
  });

  const openGoalSettings = () => {
    const settings = data?.settings as any;
    setGoalDraft({
      companyGciGoal: settings?.companyGciGoal?.toString() ?? "",
      companyVolumeGoal: settings?.companyVolumeGoal?.toString() ?? "",
      companyUnitsGoal: settings?.companyUnitsGoal?.toString() ?? "",
      newLeadSlaHours: settings?.newLeadSlaHours?.toString() ?? "24",
      pipelineStaleDays: settings?.pipelineStaleDays?.toString() ?? "14",
    });
    setGoalDialogOpen(true);
  };

  const setPreset = (preset: string) => {
    if (preset === "custom") { setFilters((previous) => ({ ...previous, preset })); return; }
    setFilters((previous) => ({ ...previous, preset, ...rangeForPreset(preset) }));
  };
  const updateNumberFilter = (key: "marketProfileId" | "agentId" | "isaId" | "leadSourceId", value: string) => {
    setFilters((previous) => ({ ...previous, [key]: value === EMPTY_VALUE ? undefined : Number(value) }));
  };
  const actionQuery = new URLSearchParams({ dateFrom: filters.dateFrom, dateTo: filters.dateTo }).toString();
  const executive = data?.executive as any;
  const forecast = data?.forecast as any;
  const queue = (data?.actionQueue?.items ?? []) as any[];
  const insights = (data?.insights ?? []) as any[];
  const access = data?.access as any;
  const trend = (executive?.trend ?? []) as any[];

  if (error) {
    return <div className="mx-auto max-w-3xl py-20"><Card className="border-rose-200"><CardContent className="p-8 text-center"><ShieldAlert className="mx-auto mb-3 h-9 w-9 text-rose-600" /><h1 className="text-lg font-semibold text-slate-950">Admin Dashboard unavailable</h1><p className="mt-2 text-sm text-slate-600">{error.message}</p><Button className="mt-5" onClick={() => refetch()}>Try again</Button></CardContent></Card></div>;
  }

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-7 pb-8">
        <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2"><Badge className="border-0 bg-teal-100 text-teal-800">ADMIN COMMAND CENTER</Badge>{isFetching && <RefreshCw className="h-3.5 w-3.5 animate-spin text-slate-400" />}</div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-950">Company operating health</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">A data-grounded view of production, scheduled closings, operational risks, and the actions leadership should take today.</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500"><Clock3 className="h-3.5 w-3.5" />Data updated {data?.generatedAt ? new Date(data.generatedAt).toLocaleString() : "—"}<Button variant="outline" size="sm" className="ml-2" onClick={() => refetch()}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Refresh</Button></div>
        </header>

        <Card className="sticky top-0 z-40 border-slate-200 bg-white/98 shadow-md backdrop-blur supports-[backdrop-filter]:bg-white/90">
          <CardContent className="p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500"><Filter className="h-3.5 w-3.5" />Global dashboard filters</div>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
              <Select value={filters.preset} onValueChange={setPreset}><SelectTrigger><SelectValue placeholder="Time period" /></SelectTrigger><SelectContent>
                <SelectItem value="today">Today</SelectItem><SelectItem value="yesterday">Yesterday</SelectItem><SelectItem value="last_7">Last 7 days</SelectItem><SelectItem value="last_30">Last 30 days</SelectItem><SelectItem value="mtd">Month to date</SelectItem><SelectItem value="qtd">Quarter to date</SelectItem><SelectItem value="ytd">Year to date</SelectItem><SelectItem value="trailing_90">Trailing 90 days</SelectItem><SelectItem value="trailing_12">Trailing 12 months</SelectItem><SelectItem value="custom">Custom range</SelectItem>
              </SelectContent></Select>
              <Select value={filters.marketProfileId?.toString() ?? EMPTY_VALUE} onValueChange={(value) => updateNumberFilter("marketProfileId", value)}><SelectTrigger><SelectValue placeholder="All markets" /></SelectTrigger><SelectContent><SelectItem value={EMPTY_VALUE}>All markets</SelectItem>{(filterOptions?.markets ?? []).map((market: any) => <SelectItem key={market.id} value={String(market.id)}>{market.name}</SelectItem>)}</SelectContent></Select>
              <Select value={filters.agentId?.toString() ?? EMPTY_VALUE} onValueChange={(value) => updateNumberFilter("agentId", value)}><SelectTrigger><SelectValue placeholder="All agents" /></SelectTrigger><SelectContent><SelectItem value={EMPTY_VALUE}>All agents</SelectItem>{(filterOptions?.agents ?? []).map((agent: any) => <SelectItem key={agent.id} value={String(agent.id)}>{agent.name}</SelectItem>)}</SelectContent></Select>
              <Select value={filters.isaId?.toString() ?? EMPTY_VALUE} onValueChange={(value) => updateNumberFilter("isaId", value)}><SelectTrigger><SelectValue placeholder="All ISAs" /></SelectTrigger><SelectContent><SelectItem value={EMPTY_VALUE}>All ISAs</SelectItem>{(filterOptions?.isas ?? []).map((isa: any) => <SelectItem key={isa.id} value={String(isa.id)}>{isa.name}</SelectItem>)}</SelectContent></Select>
              <Select value={filters.leadSourceId?.toString() ?? EMPTY_VALUE} onValueChange={(value) => updateNumberFilter("leadSourceId", value)}><SelectTrigger><SelectValue placeholder="All sources" /></SelectTrigger><SelectContent><SelectItem value={EMPTY_VALUE}>All sources</SelectItem>{(filterOptions?.leadSources ?? []).map((source: any) => <SelectItem key={source.id} value={String(source.id)}>{source.name}</SelectItem>)}</SelectContent></Select>
              <Select value={filters.transactionType ?? EMPTY_VALUE} onValueChange={(value) => setFilters((previous) => ({ ...previous, transactionType: value === EMPTY_VALUE ? undefined : value as FilterState["transactionType"] }))}><SelectTrigger><SelectValue placeholder="Buyer / seller" /></SelectTrigger><SelectContent><SelectItem value={EMPTY_VALUE}>Buyer and seller</SelectItem><SelectItem value="buyer">Buyer</SelectItem><SelectItem value="seller">Seller</SelectItem><SelectItem value="dual">Dual</SelectItem></SelectContent></Select>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
              <Input aria-label="From date" type="date" value={filters.dateFrom} onChange={(event) => setFilters((previous) => ({ ...previous, preset: "custom", dateFrom: event.target.value }))} />
              <Input aria-label="To date" type="date" value={filters.dateTo} onChange={(event) => setFilters((previous) => ({ ...previous, preset: "custom", dateTo: event.target.value }))} />
              <Select value={filters.pipelineStatus ?? EMPTY_VALUE} onValueChange={(value) => setFilters((previous) => ({ ...previous, pipelineStatus: value === EMPTY_VALUE ? undefined : value }))}><SelectTrigger><SelectValue placeholder="Pipeline stage" /></SelectTrigger><SelectContent><SelectItem value={EMPTY_VALUE}>All pipeline stages</SelectItem>{["new_lead", "attempted_contact", "nurture", "active_client", "under_contract", "closed", "dead", "do_not_contact"].map((stage) => <SelectItem key={stage} value={stage}>{stageLabel(stage)}</SelectItem>)}</SelectContent></Select>
              <Select value={filters.transactionStatus ?? EMPTY_VALUE} onValueChange={(value) => setFilters((previous) => ({ ...previous, transactionStatus: value === EMPTY_VALUE ? undefined : value as FilterState["transactionStatus"] }))}><SelectTrigger><SelectValue placeholder="Transaction status" /></SelectTrigger><SelectContent><SelectItem value={EMPTY_VALUE}>All transaction statuses</SelectItem><SelectItem value="under_contract">Under contract</SelectItem><SelectItem value="closed">Closed</SelectItem><SelectItem value="terminated">Terminated</SelectItem></SelectContent></Select>
              <Button variant="outline" onClick={() => setFilters(defaultFilters())}>Reset filters</Button>
              <Button variant="outline" onClick={() => navigate(`/analytics?${actionQuery}`)}><BarChart3 className="mr-1.5 h-4 w-4" />Open reports</Button>
            </div>
          </CardContent>
        </Card>

        {isLoading ? <DashboardSkeleton /> : <>
          {executive && access?.financial ? <section>
            <SectionHeading title="Executive performance snapshot" detail={`Closed production from ${dateLabel(filters.dateFrom)} through ${dateLabel(filters.dateTo)}. Goal pace is prorated against the selected calendar-year target.`} action={<Button variant="outline" size="sm" onClick={openGoalSettings}><Settings2 className="mr-1.5 h-4 w-4" />Goal settings</Button>} />
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard title="Closed GCI" value={currency(executive.closed.gci)} goal={executive.goalProgress.gci.goal ? `${percent(executive.goalProgress.gci.percent)} of pace goal` : "Goal not configured"} change={executive.changes.gci} status={executive.goalProgress.gci.status} description="Gross commission income from transactions with a closing date in the selected period." trend={trend.map((row) => ({ ...row, gci: row.closedGci }))} icon={DollarSign} onClick={() => navigate(`/transaction-reporting?${actionQuery}&status=closed`)} />
              <MetricCard title="Closed volume" value={currency(executive.closed.volume, true)} goal={executive.goalProgress.volume.goal ? `${percent(executive.goalProgress.volume.percent)} of pace goal` : "Goal not configured"} change={executive.changes.volume} status={executive.goalProgress.volume.status} description="Purchase price volume on closed transactions dated in the selected period." trend={trend.map((row) => ({ ...row, gci: row.closedVolume }))} icon={LineChartIcon} onClick={() => navigate(`/transaction-reporting?${actionQuery}&status=closed`)} />
              <MetricCard title="Closed units" value={integer(executive.closed.units)} goal={executive.goalProgress.units.goal ? `${percent(executive.goalProgress.units.percent)} of pace goal` : "Goal not configured"} change={executive.changes.units} status={executive.goalProgress.units.status} description="Count of closed transactions with a closing date in the selected period." trend={trend.map((row) => ({ ...row, gci: row.closedUnits }))} icon={Target} onClick={() => navigate(`/transaction-reporting?${actionQuery}&status=closed`)} />
              <MetricCard title="Active under contract" value={currency(executive.activeContracts.volume, true)} goal={`${integer(executive.activeContracts.units)} units`} description="Current under-contract sales volume, regardless of selected date, limited by the active dashboard filters." icon={Gauge} onClick={() => navigate(`/transaction-reporting?${actionQuery}&status=under_contract`)} />
            </div>
          </section> : <RestrictedSection title="Executive performance snapshot" message="Financial production is hidden because the simulated or current administrator does not have both Transactions and Commission & Payouts access." />}

          <section className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
            <Card className="border-slate-200 shadow-sm"><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><BellRing className="h-4 w-4 text-teal-700" />Executive brief</CardTitle><CardDescription>Prioritized deterministic signals, grounded in the selected SavvyOS data.</CardDescription></CardHeader><CardContent className="space-y-2">
              {insights.length ? insights.map((insight) => <button key={insight.id} onClick={() => insight.actionUrl.startsWith("#") ? document.querySelector(insight.actionUrl)?.scrollIntoView({ behavior: "smooth" }) : navigate(insight.actionUrl)} className="w-full rounded-lg border border-slate-200 p-3 text-left transition hover:border-teal-300 hover:bg-teal-50/40"><div className="flex items-start gap-2"><div className={`mt-0.5 rounded-md p-1.5 ${insight.kind === "risk" ? "bg-rose-100 text-rose-700" : insight.kind === "win" ? "bg-emerald-100 text-emerald-700" : insight.kind === "opportunity" ? "bg-teal-100 text-teal-700" : "bg-amber-100 text-amber-700"}`}>{insight.kind === "risk" ? <AlertTriangle className="h-3.5 w-3.5" /> : insight.kind === "win" ? <TrendingUp className="h-3.5 w-3.5" /> : <Target className="h-3.5 w-3.5" />}</div><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><p className="text-sm font-semibold text-slate-900">{insight.title}</p><ChevronRight className="h-4 w-4 shrink-0 text-slate-400" /></div><p className="mt-1 text-xs font-medium text-slate-700">{insight.metric} <span className="font-normal text-slate-500">· {insight.context}</span></p><p className="mt-1 text-xs text-slate-600"><span className="font-semibold">Next:</span> {insight.recommendedAction}</p></div></div></button>) : <EmptySection message="No material deterministic changes were identified for this filter view." />}
            </CardContent></Card>
            <Card className="border-slate-200 shadow-sm"><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><CalendarClock className="h-4 w-4 text-teal-700" />Scheduled close forecast</CardTitle><CardDescription>Under-contract production with recorded closing dates. This is not a pipeline-conversion prediction.</CardDescription></CardHeader><CardContent className="grid grid-cols-3 gap-2">
              {[{ label: "Next 30", data: forecast?.days30 }, { label: "Next 60", data: forecast?.days60 }, { label: "Next 90", data: forecast?.days90 }].map((window) => <div key={window.label} className="rounded-lg bg-slate-50 p-3"><div className="text-xs font-medium text-slate-500">{window.label} days</div><div className="mt-1 text-lg font-bold text-slate-950">{integer(window.data?.units)}</div><div className="text-xs text-slate-500">{currency(window.data?.gci, true)} GCI</div></div>)}
              <Button variant="outline" size="sm" className="col-span-3 mt-1" onClick={() => navigate(`/transaction-reporting?${actionQuery}&status=under_contract`)}>Review scheduled production <ArrowRight className="ml-1.5 h-3.5 w-3.5" /></Button>
            </CardContent></Card>
          </section>

          <section id="needs-attention">
            <SectionHeading title="Needs attention now" detail="Prioritized operational work, not a raw recency list. Reviewed or actively snoozed items do not appear in your queue." action={<Badge className={`border ${queue.length ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{queue.length ? `${queue.length} active items` : "Queue clear"}</Badge>} />
            <Card className="border-slate-200 shadow-sm"><CardContent className="p-0">
              {queue.length ? <div className="divide-y divide-slate-100">{queue.slice(0, 10).map((item) => <div key={item.alertKey} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center"><div className="flex min-w-0 flex-1 items-start gap-3"><Badge className={`mt-0.5 border px-1.5 py-0.5 text-[10px] uppercase ${severityColor(item.severity)}`}>{item.severity}</Badge><div className="min-w-0"><button className="text-left text-sm font-semibold text-slate-900 hover:text-teal-700" onClick={() => navigate(item.actionUrl)}>{item.title}</button><p className="mt-0.5 text-xs text-slate-600">{item.detail}</p><div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500"><span>{item.age}</span>{item.owner && <span>Owner: {item.owner}</span>}{item.estimatedImpact !== null && <span>Value: {currency(item.estimatedImpact, true)}</span>}</div></div></div><div className="flex shrink-0 items-center gap-2"><Button size="sm" variant="outline" onClick={() => navigate(item.actionUrl)}>{item.actionLabel}</Button><Button size="sm" variant="ghost" disabled={reviewMutation.isPending} onClick={() => reviewMutation.mutate({ alertKey: item.alertKey, status: "reviewed" })}><Check className="mr-1 h-3.5 w-3.5" />Reviewed</Button><Button size="sm" variant="ghost" disabled={reviewMutation.isPending} onClick={() => reviewMutation.mutate({ alertKey: item.alertKey, status: "snoozed", snoozedUntil: new Date(Date.now() + 86_400_000).toISOString() })}>Snooze</Button></div></div>)}</div> : <EmptySection message="No unresolved deterministic exceptions match your current filters." />}
            </CardContent></Card>
          </section>

          <section className="grid gap-5 2xl:grid-cols-[1.2fr_0.8fr]">
            <ProductionTrendPanel trend={trend} navigate={navigate} actionQuery={actionQuery} />
            <Card className="border-slate-200 shadow-sm"><CardHeader className="pb-2"><CardTitle className="text-base">Closings calendar</CardTitle><CardDescription>Next 30 days of scheduled under-contract production and outstanding work.</CardDescription></CardHeader><CardContent className="space-y-2">{forecast?.closings?.length ? forecast.closings.slice(0, 6).map((closing: any) => <button key={closing.id} className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-left hover:border-teal-300 hover:bg-teal-50/30" onClick={() => navigate(`/transactions/${closing.id}`)}><div><p className="text-sm font-semibold text-slate-900">{closing.clientName || `Transaction #${closing.id}`}</p><p className="text-xs text-slate-500">{dateLabel(closing.closingDate)} · {closing.ownerName || "Owner missing"}</p></div><div className="text-right"><p className="text-sm font-semibold text-slate-900">{currency(closing.purchasePrice, true)}</p>{closing.overdueTaskCount > 0 && <span className="text-xs font-medium text-rose-700">{closing.overdueTaskCount} overdue task{closing.overdueTaskCount > 1 ? "s" : ""}</span>}</div></button>) : <EmptySection message="No under-contract closing date falls within the next 30 days." />}</CardContent></Card>
          </section>

          <Tabs defaultValue="pipeline" className="space-y-4">
            <TabsList className="h-auto w-full justify-start overflow-x-auto bg-transparent p-0"><TabsTrigger value="pipeline" className="data-[state=active]:bg-slate-900 data-[state=active]:text-white">Funnel & pipeline</TabsTrigger><TabsTrigger value="sources" className="data-[state=active]:bg-slate-900 data-[state=active]:text-white">Sources</TabsTrigger><TabsTrigger value="agents" className="data-[state=active]:bg-slate-900 data-[state=active]:text-white">Agent health</TabsTrigger><TabsTrigger value="isas" className="data-[state=active]:bg-slate-900 data-[state=active]:text-white">ISA outcomes</TabsTrigger><TabsTrigger value="markets" className="data-[state=active]:bg-slate-900 data-[state=active]:text-white">Markets</TabsTrigger><TabsTrigger value="quality" className="data-[state=active]:bg-slate-900 data-[state=active]:text-white">Data quality</TabsTrigger></TabsList>
            <TabsContent value="pipeline"><PipelinePanel pipeline={data?.pipeline as any} allowed={Boolean(access?.pipeline)} navigate={navigate} actionQuery={actionQuery} /></TabsContent>
            <TabsContent value="sources"><SourcesPanel sources={data?.sources as any[]} allowed={Boolean(access?.contacts && access?.financial)} navigate={navigate} actionQuery={actionQuery} /></TabsContent>
            <TabsContent value="agents"><AgentsPanel agents={data?.agents as any[]} allowed={Boolean(access?.users && access?.financial)} navigate={navigate} /></TabsContent>
            <TabsContent value="isas"><IsasPanel isas={data?.isas as any[]} allowed={Boolean(access?.users && access?.contacts)} navigate={navigate} /></TabsContent>
            <TabsContent value="markets"><MarketsPanel markets={data?.markets as any[]} allowed={Boolean(access?.markets && access?.financial)} navigate={navigate} /></TabsContent>
            <TabsContent value="quality"><QualityPanel quality={data?.quality as any} limitations={data?.limitations ?? []} allowed={Boolean(access?.contacts || access?.financial)} navigate={navigate} /></TabsContent>
          </Tabs>
        </>}
      </div>

      <Dialog open={goalDialogOpen} onOpenChange={setGoalDialogOpen}><DialogContent><DialogHeader><DialogTitle id="goal-settings">Command-center goals and thresholds</DialogTitle><DialogDescription>Targets are annual company settings. Dashboard pace is prorated to the selected period. Thresholds are used by the deterministic action queue.</DialogDescription></DialogHeader><div className="grid gap-4 py-2 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="company-gci-goal">Annual company GCI goal</Label><Input id="company-gci-goal" inputMode="decimal" value={goalDraft.companyGciGoal} onChange={(event) => setGoalDraft((previous) => ({ ...previous, companyGciGoal: event.target.value }))} placeholder="e.g. 2500000" /></div><div className="space-y-1.5"><Label htmlFor="company-volume-goal">Annual company volume goal</Label><Input id="company-volume-goal" inputMode="decimal" value={goalDraft.companyVolumeGoal} onChange={(event) => setGoalDraft((previous) => ({ ...previous, companyVolumeGoal: event.target.value }))} placeholder="e.g. 100000000" /></div><div className="space-y-1.5"><Label htmlFor="company-units-goal">Annual company units goal</Label><Input id="company-units-goal" inputMode="numeric" value={goalDraft.companyUnitsGoal} onChange={(event) => setGoalDraft((previous) => ({ ...previous, companyUnitsGoal: event.target.value }))} placeholder="e.g. 120" /></div><div className="space-y-1.5"><Label htmlFor="lead-sla">New-lead SLA (hours)</Label><Input id="lead-sla" type="number" min="1" value={goalDraft.newLeadSlaHours} onChange={(event) => setGoalDraft((previous) => ({ ...previous, newLeadSlaHours: event.target.value }))} /></div><div className="space-y-1.5"><Label htmlFor="stale-days">Active client stale threshold (days)</Label><Input id="stale-days" type="number" min="1" value={goalDraft.pipelineStaleDays} onChange={(event) => setGoalDraft((previous) => ({ ...previous, pipelineStaleDays: event.target.value }))} /></div></div><DialogFooter><Button variant="outline" onClick={() => setGoalDialogOpen(false)}>Cancel</Button><Button disabled={settingsMutation.isPending} onClick={() => settingsMutation.mutate({ goalYear: new Date(filters.dateTo).getUTCFullYear(), companyGciGoal: goalDraft.companyGciGoal ? Number(goalDraft.companyGciGoal) : null, companyVolumeGoal: goalDraft.companyVolumeGoal ? Number(goalDraft.companyVolumeGoal) : null, companyUnitsGoal: goalDraft.companyUnitsGoal ? Number(goalDraft.companyUnitsGoal) : null, newLeadSlaHours: Number(goalDraft.newLeadSlaHours) || 24, pipelineStaleDays: Number(goalDraft.pipelineStaleDays) || 14 })}>{settingsMutation.isPending ? "Saving…" : "Save command-center settings"}</Button></DialogFooter></DialogContent></Dialog>
    </TooltipProvider>
  );
}

function ProductionTrendPanel({ trend, navigate, actionQuery }: { trend: any[]; navigate: (to: string) => void; actionQuery: string }) {
  const [metric, setMetric] = useState<"gci" | "volume" | "units">("gci");
  const totals = trend.reduce((summary, row) => ({
    closedGci: summary.closedGci + Number(row.closedGci ?? 0),
    underContractGci: summary.underContractGci + Number(row.underContractGci ?? 0),
    closedVolume: summary.closedVolume + Number(row.closedVolume ?? 0),
    underContractVolume: summary.underContractVolume + Number(row.underContractVolume ?? 0),
    closedUnits: summary.closedUnits + Number(row.closedUnits ?? 0),
    underContractUnits: summary.underContractUnits + Number(row.underContractUnits ?? 0),
  }), { closedGci: 0, underContractGci: 0, closedVolume: 0, underContractVolume: 0, closedUnits: 0, underContractUnits: 0 });
  const config = {
    gci: { title: "GCI", closed: "closedGci", underContract: "underContractGci", formatter: (value: number) => currency(value, true), detail: "Commission income by scheduled closing month." },
    volume: { title: "Volume", closed: "closedVolume", underContract: "underContractVolume", formatter: (value: number) => currency(value, true), detail: "Purchase-price volume by scheduled closing month." },
    units: { title: "Units", closed: "closedUnits", underContract: "underContractUnits", formatter: (value: number) => integer(value), detail: "Transaction counts by scheduled closing month." },
  }[metric];

  return <Card className="border-slate-200 shadow-sm"><CardHeader className="pb-2"><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle className="text-base">Revenue trend and scheduled production</CardTitle><CardDescription>Compare closed production with under-contract scheduled production by closing month. Use the metric controls to review GCI, volume, and units.</CardDescription></div><Button variant="outline" size="sm" onClick={() => navigate(`/transaction-reporting?${actionQuery}`)}>Transaction reporting <ArrowRight className="ml-1.5 h-3.5 w-3.5" /></Button></div></CardHeader><CardContent>{trend.length ? <><div className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-4"><div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Closed GCI</p><p className="mt-1 text-lg font-bold text-slate-950">{currency(totals.closedGci, true)}</p></div><div className="rounded-lg border border-teal-100 bg-teal-50/50 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-teal-800">Under-contract GCI</p><p className="mt-1 text-lg font-bold text-slate-950">{currency(totals.underContractGci, true)}</p></div><div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Closed units</p><p className="mt-1 text-lg font-bold text-slate-950">{integer(totals.closedUnits)}</p></div><div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Under-contract units</p><p className="mt-1 text-lg font-bold text-slate-950">{integer(totals.underContractUnits)}</p></div></div><Tabs value={metric} onValueChange={(value) => setMetric(value as "gci" | "volume" | "units")}><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><TabsList className="h-auto bg-slate-100 p-1"><TabsTrigger value="gci">GCI</TabsTrigger><TabsTrigger value="volume">Volume</TabsTrigger><TabsTrigger value="units">Units</TabsTrigger></TabsList><div className="flex items-center gap-3 text-xs"><span className="inline-flex items-center gap-1.5 text-slate-600"><span className="h-2.5 w-2.5 rounded-full bg-emerald-600" />Closed</span><span className="inline-flex items-center gap-1.5 text-slate-600"><span className="h-2.5 w-2.5 rounded-full bg-teal-400" />Under contract</span></div></div><TabsContent value="gci" className="mt-0"><ResponsiveContainer width="100%" height={260}><LineChart data={trend} margin={{ left: 8, right: 16, top: 10 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" /><XAxis dataKey="period" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} /><YAxis tickFormatter={(value) => currency(value, true)} tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} width={68} /><Tooltip formatter={(value: number) => currency(value)} /><Line type="monotone" dataKey="closedGci" name="Closed GCI" stroke="#059669" strokeWidth={3} dot={{ r: 3, fill: "#059669" }} /><Line type="monotone" dataKey="underContractGci" name="Under-contract GCI" stroke="#2dd4bf" strokeWidth={3} strokeDasharray="6 4" dot={{ r: 3, fill: "#2dd4bf" }} /></LineChart></ResponsiveContainer></TabsContent><TabsContent value="volume" className="mt-0"><ResponsiveContainer width="100%" height={260}><LineChart data={trend} margin={{ left: 8, right: 16, top: 10 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" /><XAxis dataKey="period" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} /><YAxis tickFormatter={(value) => currency(value, true)} tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} width={68} /><Tooltip formatter={(value: number) => currency(value)} /><Line type="monotone" dataKey="closedVolume" name="Closed volume" stroke="#059669" strokeWidth={3} dot={{ r: 3, fill: "#059669" }} /><Line type="monotone" dataKey="underContractVolume" name="Under-contract volume" stroke="#2dd4bf" strokeWidth={3} strokeDasharray="6 4" dot={{ r: 3, fill: "#2dd4bf" }} /></LineChart></ResponsiveContainer></TabsContent><TabsContent value="units" className="mt-0"><ResponsiveContainer width="100%" height={260}><BarChart data={trend} margin={{ left: 8, right: 16, top: 10 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" /><XAxis dataKey="period" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} /><YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} width={38} /><Tooltip formatter={(value: number) => integer(value)} /><Bar dataKey="closedUnits" name="Closed units" fill="#059669" radius={[4, 4, 0, 0]} /><Bar dataKey="underContractUnits" name="Under-contract units" fill="#2dd4bf" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></TabsContent></Tabs><div className="mt-3 grid gap-2 border-t border-slate-100 pt-3 text-xs sm:grid-cols-3"><p className="text-slate-500"><span className="font-semibold text-slate-700">Closed volume:</span> {currency(totals.closedVolume, true)}</p><p className="text-slate-500"><span className="font-semibold text-slate-700">Under-contract volume:</span> {currency(totals.underContractVolume, true)}</p><p className="text-slate-500"><span className="font-semibold text-slate-700">Current view:</span> {config.detail}</p></div></> : <EmptySection message="No closed or under-contract production matches the current dashboard filters." />}</CardContent></Card>;
}

function PipelinePanel({ pipeline, allowed, navigate, actionQuery }: { pipeline: any; allowed: boolean; navigate: (to: string) => void; actionQuery: string }) {
  if (!allowed) return <RestrictedSection title="Lead-to-close operating funnel" message="Pipeline and contact visibility is required for this section." />;
  const cohort = pipeline?.cohort ?? [];
  const current = pipeline?.current ?? [];
  const chart = cohort.map((row: any) => ({ name: stageLabel(row.stage), count: row.count }));
  return <section><SectionHeading title="Lead-to-close operating funnel" detail="Connections created in the selected period, grouped by current pipeline stage. SavvyOS does not yet store canonical stage-history events, so this view intentionally does not claim stage-to-stage conversion." action={<Button variant="outline" size="sm" onClick={() => navigate(`/pipeline?${actionQuery}`)}>Open pipeline <ArrowRight className="ml-1.5 h-3.5 w-3.5" /></Button>} /><div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]"><Card className="border-slate-200 shadow-sm"><CardContent className="p-4">{chart.length ? <ResponsiveContainer width="100%" height={250}><BarChart data={chart} layout="vertical" margin={{ left: 34, right: 12 }}><CartesianGrid horizontal={false} stroke="#e2e8f0" /><XAxis type="number" tick={{ fontSize: 11 }} /><YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey="count" fill="#0f766e" radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer> : <EmptySection message="No connections match the selected cohort." />}</CardContent></Card><Card className="border-slate-200 shadow-sm"><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[620px] text-sm"><thead className="border-b bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Current stage</th><th className="px-4 py-3 text-right">Cohort count</th><th className="px-4 py-3 text-right">Current count</th><th className="px-4 py-3 text-right">Avg. age</th><th className="px-4 py-3 text-right">Beyond 14d</th></tr></thead><tbody>{current.map((row: any) => { const selected = cohort.find((item: any) => item.stage === row.stage); return <tr key={row.stage} className="border-b last:border-0"><td className="px-4 py-3 font-medium text-slate-900">{stageLabel(row.stage)}</td><td className="px-4 py-3 text-right text-slate-700">{integer(selected?.count)}</td><td className="px-4 py-3 text-right text-slate-700">{integer(row.count)}</td><td className="px-4 py-3 text-right text-slate-700">{row.averageAgeDays.toFixed(1)} days</td><td className="px-4 py-3 text-right"><span className={row.staleCount ? "font-semibold text-rose-700" : "text-slate-500"}>{integer(row.staleCount)}</span></td></tr>; })}</tbody></table></div></CardContent></Card></div></section>;
}

function SourcesPanel({ sources, allowed, navigate, actionQuery }: { sources: any[]; allowed: boolean; navigate: (to: string) => void; actionQuery: string }) {
  if (!allowed) return <RestrictedSection title="Lead source and partner performance" message="Contact and financial visibility is required for source-performance analysis." />;
  return <section><SectionHeading title="Lead source and partner performance" detail="Lead counts use contact creation date; production uses transaction closing date. The date bases are intentionally kept separate." action={<Button variant="outline" size="sm" onClick={() => navigate(`/analytics?${actionQuery}`)}>Source reporting <ArrowRight className="ml-1.5 h-3.5 w-3.5" /></Button>} /><Card className="border-slate-200 shadow-sm"><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead className="border-b bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Source</th><th className="px-4 py-3 text-right">Leads</th><th className="px-4 py-3 text-right">Closed units</th><th className="px-4 py-3 text-right">Close rate</th><th className="px-4 py-3 text-right">Closed GCI</th><th className="px-4 py-3 text-right">GCI / lead</th></tr></thead><tbody>{sources.length ? sources.map((source) => <tr key={source.id} className="border-b last:border-0 hover:bg-slate-50"><td className="px-4 py-3 font-medium text-slate-900">{source.name}</td><td className="px-4 py-3 text-right">{integer(source.leads)}</td><td className="px-4 py-3 text-right">{integer(source.closedUnits)}</td><td className="px-4 py-3 text-right">{percent(source.closeRate)}</td><td className="px-4 py-3 text-right font-medium">{currency(source.closedGci)}</td><td className="px-4 py-3 text-right">{source.gciPerLead === null ? "—" : currency(source.gciPerLead)}</td></tr>) : <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-500">No attributed source performance matches this view.</td></tr>}</tbody></table></div></CardContent></Card></section>;
}

function AgentsPanel({ agents, allowed, navigate }: { agents: any[]; allowed: boolean; navigate: (to: string) => void }) {
  if (!allowed) return <RestrictedSection title="Agent performance and health" message="User and financial visibility is required for agent health." />;
  return <section><SectionHeading title="Agent performance and health" detail="A transparent operating classification using rolling 90-day units and stale active-client workload. Agent-level goals are shown only where configured." /><Card className="border-slate-200 shadow-sm"><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[930px] text-sm"><thead className="border-b bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Agent</th><th className="px-4 py-3 text-right">30 / 60 / 90d units</th><th className="px-4 py-3 text-right">90d GCI</th><th className="px-4 py-3 text-right">Active clients</th><th className="px-4 py-3 text-right">Stale clients</th><th className="px-4 py-3 text-right">Under contract</th><th className="px-4 py-3">Operating status</th></tr></thead><tbody>{agents.map((agent) => <tr key={agent.id} className="border-b last:border-0 hover:bg-slate-50"><td className="px-4 py-3"><button onClick={() => navigate(`/agents/${agent.id}`)} className="font-semibold text-slate-900 hover:text-teal-700">{agent.name}</button><p className="text-xs text-slate-500">{agent.marketName || "Market not assigned"}</p></td><td className="px-4 py-3 text-right">{agent.units30} / {agent.units60} / <span className="font-semibold">{agent.units90}</span></td><td className="px-4 py-3 text-right">{currency(agent.gci90)}</td><td className="px-4 py-3 text-right">{agent.activeClients}</td><td className="px-4 py-3 text-right"><span className={agent.staleClients ? "font-semibold text-rose-700" : "text-slate-500"}>{agent.staleClients}</span></td><td className="px-4 py-3 text-right">{agent.underContractUnits}</td><td className="px-4 py-3"><Badge className={`border-0 ${statusColor(agent.health)}`}>{agent.health.replace(/_/g, " ")}</Badge></td></tr>)}</tbody></table></div></CardContent></Card></section>;
}

function IsasPanel({ isas, allowed, navigate }: { isas: any[]; allowed: boolean; navigate: (to: string) => void }) {
  if (!allowed) return <RestrictedSection title="ISA performance" message="User and contact visibility is required for ISA-attributed operations." />;
  return <section><SectionHeading title="ISA downstream outcomes" detail="Only contacts with an assigned ISA are included. Appointment-set and closed-unit influence are shown; unsupported call, response-time, and appointment-held metrics are intentionally omitted." /><Card className="border-slate-200 shadow-sm"><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[800px] text-sm"><thead className="border-b bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">ISA</th><th className="px-4 py-3 text-right">Assigned leads</th><th className="px-4 py-3 text-right">Appointments set</th><th className="px-4 py-3 text-right">Active connections</th><th className="px-4 py-3 text-right">Stale active clients</th><th className="px-4 py-3 text-right">Closed units influenced</th></tr></thead><tbody>{isas.length ? isas.map((isa) => <tr key={isa.id} className="border-b last:border-0 hover:bg-slate-50"><td className="px-4 py-3"><button className="font-semibold text-slate-900 hover:text-teal-700" onClick={() => navigate(`/users/${isa.id}`)}>{isa.name}</button></td><td className="px-4 py-3 text-right">{integer(isa.assignedLeads)}</td><td className="px-4 py-3 text-right">{integer(isa.appointmentsSet)}</td><td className="px-4 py-3 text-right">{integer(isa.activeConnections)}</td><td className="px-4 py-3 text-right"><span className={isa.staleActiveClients ? "font-semibold text-rose-700" : "text-slate-500"}>{integer(isa.staleActiveClients)}</span></td><td className="px-4 py-3 text-right font-semibold">{integer(isa.closedUnitsInfluenced)}</td></tr>) : <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-500">No active ISAs match this attribution view.</td></tr>}</tbody></table></div></CardContent></Card></section>;
}

function MarketsPanel({ markets, allowed, navigate }: { markets: any[]; allowed: boolean; navigate: (to: string) => void }) {
  if (!allowed) return <RestrictedSection title="Market health" message="Market, user, and financial visibility is required for market-health analysis." />;
  return <section><SectionHeading title="Market health" detail="Market attribution follows the transaction owner’s primary market. Capacity status is shown only where Market Agent Assignments have been configured." /><Card className="border-slate-200 shadow-sm"><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[960px] text-sm"><thead className="border-b bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Market</th><th className="px-4 py-3 text-right">Active agents</th><th className="px-4 py-3 text-right">Productive agents</th><th className="px-4 py-3 text-right">Closed units</th><th className="px-4 py-3 text-right">Closed GCI</th><th className="px-4 py-3 text-right">Under contract</th><th className="px-4 py-3">Capacity status</th></tr></thead><tbody>{markets.map((market) => <tr key={market.id} className="border-b last:border-0 hover:bg-slate-50"><td className="px-4 py-3"><button className="font-semibold text-slate-900 hover:text-teal-700" onClick={() => navigate(`/analytics/market/${market.id}`)}>{market.name}</button><p className="text-xs text-slate-500">{market.state}</p></td><td className="px-4 py-3 text-right">{market.activeAgents}</td><td className="px-4 py-3 text-right">{market.productiveAgents}</td><td className="px-4 py-3 text-right">{market.closedUnits}</td><td className="px-4 py-3 text-right font-medium">{currency(market.closedGci)}</td><td className="px-4 py-3 text-right">{market.underContractUnits}</td><td className="px-4 py-3"><Badge className={`border-0 ${statusColor(market.capacityStatus)}`}>{market.capacityStatus.replace(/_/g, " ")}</Badge></td></tr>)}</tbody></table></div></CardContent></Card></section>;
}

function QualityPanel({ quality, limitations, allowed, navigate }: { quality: any; limitations: string[]; allowed: boolean; navigate: (to: string) => void }) {
  if (!allowed) return <RestrictedSection title="Data quality and system health" message="Contact or financial visibility is required for data-quality analysis." />;
  const issues = [{ label: "Missing lead source", value: quality?.missingLeadSource ?? 0, path: "/contacts" }, { label: "Missing contact method", value: quality?.missingContactMethod ?? 0, path: "/contacts" }, { label: "Missing ISA assignment", value: quality?.missingIsaAssignment ?? 0, path: "/contacts" }, { label: "Under-contract records missing closing date", value: quality?.missingClosingDate ?? 0, path: "/transactions" }, { label: "Under-contract records missing financial fields", value: quality?.missingFinancialFields ?? 0, path: "/transactions" }];
  return <section><SectionHeading title="Data quality and system health" detail="Reporting exceptions that can affect operational follow-up, attribution, or executive decision-making." /><div className="grid gap-4 lg:grid-cols-[1fr_0.9fr]"><Card className="border-slate-200 shadow-sm"><CardContent className="p-3">{issues.map((issue) => <button key={issue.label} onClick={() => navigate(issue.path)} className="flex w-full items-center justify-between rounded-lg px-3 py-3 text-left hover:bg-slate-50"><span className="text-sm font-medium text-slate-800">{issue.label}</span><span className={issue.value ? "text-lg font-bold text-rose-700" : "text-lg font-bold text-emerald-700"}>{integer(issue.value)}</span></button>)}</CardContent></Card><Card className="border-amber-200 bg-amber-50/40 shadow-sm"><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base text-amber-950"><DatabaseZap className="h-4 w-4" />Known data limitations</CardTitle><CardDescription className="text-amber-800">The command center omits unsupported metrics rather than inferring them.</CardDescription></CardHeader><CardContent className="space-y-2">{limitations.map((limitation) => <p key={limitation} className="text-xs leading-5 text-amber-900">{limitation}</p>)}</CardContent></Card></div></section>;
}

function RestrictedSection({ title, message }: { title: string; message: string }) {
  return <section><SectionHeading title={title} detail="Permission-scoped dashboard section" /><Card className="border-slate-200"><CardContent className="flex min-h-32 items-center gap-3 p-6"><ShieldAlert className="h-6 w-6 text-slate-400" /><p className="text-sm text-slate-600">{message}</p></CardContent></Card></section>;
}

function DashboardSkeleton() {
  return <div className="space-y-6"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-44" />)}</div><div className="grid gap-4 xl:grid-cols-2"><Skeleton className="h-72" /><Skeleton className="h-72" /></div><Skeleton className="h-96" /></div>;
}
