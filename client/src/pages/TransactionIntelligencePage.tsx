import { useEffect, useMemo, useRef } from "react";
import { useLocation } from "wouter";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Brain,
  ChevronRight,
  CircleDollarSign,
  ExternalLink,
  Filter,
  Landmark,
  Loader2,
  MapPin,
  ReceiptText,
  RefreshCw,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { trpc } from "@/lib/trpc";
import PageHeader from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type TransactionType = "all" | "buyer" | "seller" | "dual";
type DatePreset = "mtd" | "qtd" | "ytd" | "last12" | "all" | "custom";

type TransactionLinkOptions = {
  status?: "closed" | "under_contract";
  agentId?: number;
  marketId?: number;
  leadSourceId?: number;
  transactionType?: Exclude<TransactionType, "all">;
  includeClosedDateRange?: boolean;
};

function localDay(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function startOfMonth(date = new Date()): string {
  return localDay(new Date(date.getFullYear(), date.getMonth(), 1));
}

function startOfQuarter(date = new Date()): string {
  return localDay(new Date(date.getFullYear(), Math.floor(date.getMonth() / 3) * 3, 1));
}

function startOfYear(date = new Date()): string {
  return localDay(new Date(date.getFullYear(), 0, 1));
}

function startOfTrailingTwelveMonths(date = new Date()): string {
  return localDay(new Date(date.getFullYear(), date.getMonth() - 11, 1));
}

function money(value: unknown, compact = false): string {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return "—";
  if (compact && Math.abs(amount) >= 1_000_000) return `$${(amount / 1_000_000).toFixed(Math.abs(amount) >= 10_000_000 ? 0 : 1)}M`;
  if (compact && Math.abs(amount) >= 1_000) return `$${(amount / 1_000).toFixed(Math.abs(amount) >= 100_000 ? 0 : 1)}K`;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(amount);
}

function percent(value: unknown, digits = 1): string {
  const amount = Number(value);
  return Number.isFinite(amount) ? `${amount.toFixed(digits)}%` : "—";
}

function integer(value: unknown): string {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? Math.round(amount).toLocaleString() : "—";
}

function monthLabel(value: string): string {
  if (!/^\d{4}-\d{2}$/.test(value)) return value || "—";
  const [year, month] = value.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

function dateLabel(value: unknown): string {
  if (!value) return "—";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function Delta({ value, label = "vs. prior period" }: { value: number | null | undefined; label?: string }) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return <p className="mt-1 text-xs text-muted-foreground">No comparable prior period</p>;
  }
  const positive = value >= 0;
  return <p className={`mt-1 flex items-center gap-1 text-xs ${positive ? "text-emerald-700" : "text-rose-700"}`}>
    {positive ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
    <span className="font-medium">{percent(Math.abs(value))}</span> {label}
  </p>;
}

function MetricCard({
  title,
  value,
  detail,
  delta,
  icon: Icon,
  onClick,
  accent = "text-primary",
}: {
  title: string;
  value: string;
  detail: string;
  delta?: number | null;
  icon: typeof BarChart3;
  onClick?: () => void;
  accent?: string;
}) {
  const content = <Card className={onClick ? "group h-full cursor-pointer transition hover:border-primary/40 hover:shadow-sm" : "h-full"}>
    <CardContent className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
          {delta !== undefined && <Delta value={delta} />}
        </div>
        <span className={`rounded-lg bg-muted p-2 ${accent}`}><Icon className="h-4 w-4" /></span>
      </div>
    </CardContent>
  </Card>;
  return onClick ? <button type="button" className="text-left" onClick={onClick}>{content}</button> : content;
}

function TableShell({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[720px] text-sm">{children}</table></div>;
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="rounded-lg border border-dashed p-8 text-center"><p className="font-medium">{title}</p><p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">{description}</p></div>;
}

function TransactionIntelligenceBrief({
  data,
  refreshing,
  onRefresh,
  onOpenTransactions,
  onOpenPipeline,
}: {
  data: any;
  refreshing: boolean;
  onRefresh: () => void;
  onOpenTransactions: () => void;
  onOpenPipeline: () => void;
}) {
  const insights = data?.insights ?? [];
  return <Card className="border-primary/15 bg-gradient-to-br from-primary/[0.045] via-background to-emerald-50/60">
    <CardHeader className="pb-3"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="flex gap-3"><span className="h-fit rounded-xl bg-primary p-2.5 text-primary-foreground"><Brain className="h-5 w-5" /></span><div><CardTitle className="text-base">Transaction intelligence brief</CardTitle><CardDescription className="mt-1">Evidence-grounded interpretation of this exact report scope. It connects closed production, economics, pipeline timing, sources, and data confidence without replacing the source records.</CardDescription></div></div><Button size="sm" variant="outline" onClick={onRefresh} disabled={refreshing}><RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />{refreshing ? "Generating" : insights.length ? "Refresh brief" : "Generate brief"}</Button></div></CardHeader>
    <CardContent>{data?.summary && <p className="mb-4 rounded-lg border bg-background/70 p-3 text-sm leading-6 text-muted-foreground">{data.summary}</p>}{!insights.length ? <EmptyState title="No intelligence brief is cached for this report scope" description="Generate a brief to receive evidence-linked operational signals. The production, economics, and transaction records below remain the system of record." /> : <div className="grid gap-3 lg:grid-cols-2">{insights.slice(0, 4).map((insight: any, index: number) => <div key={`${insight.title}-${index}`} className="rounded-xl border bg-background p-4"><div className="flex gap-3"><span className="h-fit rounded-lg bg-primary/10 p-2 text-primary"><Brain className="h-4 w-4" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{insight.title}</p><Badge variant={insight.priority === "high" ? "destructive" : "secondary"}>{insight.priority} priority</Badge><Badge variant="outline">{insight.confidence} confidence</Badge></div><p className="mt-2 text-sm leading-5">{insight.observation}</p><p className="mt-2 text-sm leading-5 text-muted-foreground"><span className="font-medium text-foreground">How it connects: </span>{insight.explanation}</p><p className="mt-3 rounded-md bg-muted/45 p-2.5 text-xs leading-5"><span className="font-semibold">Owner: </span>{insight.owner}<br /><span className="font-semibold">Next action: </span>{insight.action}</p><div className="mt-3 flex flex-wrap gap-2">{(insight.evidence ?? []).slice(0, 3).map((evidence: any, evidenceIndex: number) => <button type="button" key={`${evidence.label}-${evidenceIndex}`} className="rounded border bg-muted/25 px-2 py-1 text-xs transition-colors hover:border-primary/40 hover:bg-primary/5" onClick={() => evidence.drilldown === "pipeline" ? onOpenPipeline() : onOpenTransactions()}>{evidence.label}: <span className="font-semibold">{evidence.value}</span></button>)}</div></div></div></div>)}</div>}{data?.dataQualityNote && <p className="mt-4 text-xs leading-5 text-muted-foreground"><span className="font-medium text-foreground">Data confidence: </span>{data.dataQualityNote}</p>}{data?.generationMethod === "deterministic" && <p className="mt-2 text-xs text-muted-foreground">This brief is currently using deterministic report signals because a model-generated interpretation is not available for this scope.</p>}</CardContent>
  </Card>;
}

export default function TransactionIntelligencePage() {
  const [location, navigate] = useLocation();
  const url = useMemo(() => new URLSearchParams(location.includes("?") ? location.slice(location.indexOf("?") + 1) : ""), [location]);
  const today = localDay(new Date());

  const dateFrom = url.get("from") ?? startOfYear();
  const dateTo = url.get("to") ?? today;
  const agentId = url.get("agentId") ?? "all";
  const marketId = url.get("marketId") ?? "all";
  const leadSourceId = url.get("leadSourceId") ?? "all";
  const transactionType = (url.get("transactionType") ?? "all") as TransactionType;
  const preset = (url.get("preset") ?? "ytd") as DatePreset;

  const setQuery = (patch: Record<string, string | null>, replace = true) => {
    const next = new URLSearchParams(url);
    for (const [key, value] of Object.entries(patch)) {
      if (!value) next.delete(key);
      else next.set(key, value);
    }
    const serialized = next.toString();
    navigate(`/analytics${serialized ? `?${serialized}` : ""}`, { replace });
  };

  const setPreset = (nextPreset: DatePreset) => {
    if (nextPreset === "custom") {
      setQuery({ preset: "custom" });
      return;
    }
    if (nextPreset === "all") {
      setQuery({ preset: "all", from: null, to: null });
      return;
    }
    const nextFrom = nextPreset === "mtd" ? startOfMonth()
      : nextPreset === "qtd" ? startOfQuarter()
        : nextPreset === "last12" ? startOfTrailingTwelveMonths()
          : startOfYear();
    setQuery({ preset: nextPreset, from: nextFrom, to: today });
  };

  const queryInput = useMemo(() => ({
    dateFrom: preset === "all" ? undefined : dateFrom,
    dateTo: preset === "all" ? undefined : dateTo,
    agentId: agentId === "all" ? undefined : Number(agentId),
    marketProfileId: marketId === "all" ? undefined : Number(marketId),
    leadSourceId: leadSourceId === "all" ? undefined : Number(leadSourceId),
    transactionType: transactionType === "all" ? undefined : transactionType,
  }), [agentId, dateFrom, dateTo, leadSourceId, marketId, preset, transactionType]);

  const utils = trpc.useUtils();
  const reportQuery = trpc.analytics.transactionIntelligence.useQuery(queryInput, {
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const insightsQuery = trpc.analytics.transactionIntelligenceInsights.useQuery(queryInput, {
    refetchInterval: 300_000,
    staleTime: 60_000,
  });
  const refreshInsights = trpc.analytics.refreshTransactionIntelligenceInsights.useMutation({
    onSuccess: () => utils.analytics.transactionIntelligenceInsights.invalidate(queryInput),
  });
  const autoInsightScopes = useRef(new Set<string>());
  const insightScopeKey = useMemo(() => JSON.stringify(queryInput), [queryInput]);
  useEffect(() => {
    const cached = insightsQuery.data as any;
    const needsBrief = !cached?.insights?.length || Boolean(cached?.isStale);
    if (reportQuery.isLoading || insightsQuery.isLoading || refreshInsights.isPending || !needsBrief || autoInsightScopes.current.has(insightScopeKey)) return;
    autoInsightScopes.current.add(insightScopeKey);
    refreshInsights.mutate({ ...queryInput, force: false });
  }, [insightScopeKey, insightsQuery.data, insightsQuery.isLoading, queryInput, refreshInsights, reportQuery.isLoading]);
  const report = reportQuery.data as any;

  const hasActiveFilters = preset !== "ytd" || agentId !== "all" || marketId !== "all" || leadSourceId !== "all" || transactionType !== "all";
  const clearFilters = () => navigate(`/analytics?preset=ytd&from=${startOfYear()}&to=${today}`, { replace: true });

  const openTransactions = (options: TransactionLinkOptions = {}) => {
    const params = new URLSearchParams({ analytics: "1", status: options.status ?? "closed", report: "transaction-intelligence", returnTo: location });
    const resolvedAgentId = options.agentId ?? (agentId === "all" ? undefined : Number(agentId));
    const resolvedMarketId = options.marketId ?? (marketId === "all" ? undefined : Number(marketId));
    const resolvedLeadSourceId = options.leadSourceId ?? (leadSourceId === "all" ? undefined : Number(leadSourceId));
    const resolvedType = options.transactionType ?? (transactionType === "all" ? undefined : transactionType);
    if (resolvedAgentId) params.set("agentId", String(resolvedAgentId));
    if (resolvedMarketId) params.set("marketId", String(resolvedMarketId));
    if (resolvedLeadSourceId) params.set("leadSourceId", String(resolvedLeadSourceId));
    if (resolvedType) params.set("transactionType", resolvedType);
    if (options.status !== "under_contract" && options.includeClosedDateRange !== false && preset !== "all") {
      params.set("closingDateFrom", dateFrom);
      params.set("closingDateTo", dateTo);
    }
    navigate(`/transactions?${params.toString()}`);
  };

  const actuals = report?.actuals;
  const pipeline = report?.pipeline;
  const prior = report?.prior;
  const monthly = (report?.monthly ?? []).map((row: any) => ({ ...row, label: monthLabel(row.month) }));
  const transactions = report?.evidence ?? [];

  return <div className="space-y-5">
    <PageHeader
      title="Transaction Intelligence & Economics"
      subtitle="Closed production by closing date, live under-contract inventory, and recorded transaction economics. Every measure links to its operational source records."
      actions={<Badge variant="secondary" className="h-7 gap-1"><ReceiptText className="h-3.5 w-3.5" /> Deep report 01</Badge>}
    />

    <Card className="border-primary/15">
      <CardContent className="p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <div className="space-y-1"><Label className="text-xs">Closed actuals period</Label><Select value={preset} onValueChange={(value) => setPreset(value as DatePreset)}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="mtd">Month to date</SelectItem><SelectItem value="qtd">Quarter to date</SelectItem><SelectItem value="ytd">Year to date</SelectItem><SelectItem value="last12">Trailing 12 months</SelectItem><SelectItem value="all">All closed history</SelectItem><SelectItem value="custom">Custom dates</SelectItem></SelectContent></Select></div>
            <div className="space-y-1"><Label className="text-xs">Close date from</Label><Input type="date" value={preset === "all" ? "" : dateFrom} disabled={preset === "all"} onChange={(event) => setQuery({ preset: "custom", from: event.target.value })} className="h-9" /></div>
            <div className="space-y-1"><Label className="text-xs">Close date to</Label><Input type="date" value={preset === "all" ? "" : dateTo} disabled={preset === "all"} onChange={(event) => setQuery({ preset: "custom", to: event.target.value })} className="h-9" /></div>
            <div className="space-y-1"><Label className="text-xs">Agent</Label><Select value={agentId} onValueChange={(value) => setQuery({ agentId: value === "all" ? null : value })}><SelectTrigger className="h-9"><SelectValue placeholder="All agents" /></SelectTrigger><SelectContent><SelectItem value="all">All agents</SelectItem>{(report?.availableFilters?.agents ?? []).map((agent: any) => <SelectItem key={agent.id} value={String(agent.id)}>{agent.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label className="text-xs">Market</Label><Select value={marketId} onValueChange={(value) => setQuery({ marketId: value === "all" ? null : value })}><SelectTrigger className="h-9"><SelectValue placeholder="All markets" /></SelectTrigger><SelectContent><SelectItem value="all">All markets</SelectItem>{(report?.availableFilters?.markets ?? []).map((market: any) => <SelectItem key={market.id} value={String(market.id)}>{market.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label className="text-xs">Source / side</Label><div className="flex gap-1"><Select value={leadSourceId} onValueChange={(value) => setQuery({ leadSourceId: value === "all" ? null : value })}><SelectTrigger className="h-9 min-w-0 flex-1"><SelectValue placeholder="Source" /></SelectTrigger><SelectContent><SelectItem value="all">All sources</SelectItem>{(report?.availableFilters?.sources ?? []).map((source: any) => <SelectItem key={source.id} value={String(source.id)}>{source.parentId ? `↳ ${source.name}` : source.name}</SelectItem>)}</SelectContent></Select><Select value={transactionType} onValueChange={(value) => setQuery({ transactionType: value === "all" ? null : value })}><SelectTrigger className="h-9 w-[102px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All sides</SelectItem><SelectItem value="buyer">Buyer</SelectItem><SelectItem value="seller">Seller</SelectItem><SelectItem value="dual">Dual</SelectItem></SelectContent></Select></div></div>
          </div>
          <Button variant="outline" className="self-start xl:self-auto" disabled={!hasActiveFilters} onClick={clearFilters}><X className="mr-1.5 h-4 w-4" />Reset</Button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground"><span><strong className="text-foreground">Closed actuals:</strong> closing-date flow for the selected period.</span><span><strong className="text-foreground">Pipeline:</strong> live under-contract snapshot, not date-limited.</span><span><strong className="text-foreground">Savvy Net:</strong> recorded Savvy/EXP payout items, with coverage shown.</span></div>
      </CardContent>
    </Card>

    {reportQuery.isLoading ? <div className="grid min-h-80 place-items-center rounded-xl border bg-muted/20"><div className="text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" /><p className="mt-3 text-sm text-muted-foreground">Calculating transaction intelligence…</p></div></div> : reportQuery.error ? <Card className="border-rose-200"><CardContent className="flex gap-3 p-6"><AlertTriangle className="h-5 w-5 shrink-0 text-rose-600" /><div><p className="font-semibold">Transaction Intelligence could not be loaded.</p><p className="mt-1 text-sm text-muted-foreground">{reportQuery.error.message}</p><Button className="mt-3" size="sm" onClick={() => reportQuery.refetch()}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Try again</Button></div></CardContent></Card> : report && <>
      <TransactionIntelligenceBrief data={insightsQuery.data} refreshing={refreshInsights.isPending} onRefresh={() => refreshInsights.mutate({ ...queryInput, force: true })} onOpenTransactions={() => openTransactions()} onOpenPipeline={() => openTransactions({ status: "under_contract", includeClosedDateRange: false })} />
      <section aria-labelledby="actuals-heading" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Closed actuals</p><h2 id="actuals-heading" className="text-lg font-semibold tracking-tight">Production, volume, and transaction economics</h2></div><Button variant="outline" size="sm" onClick={() => openTransactions()}><ExternalLink className="mr-1.5 h-3.5 w-3.5" />Open all matching closings</Button></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard title="Closed units" value={integer(actuals?.units)} detail="Closed transactions in period" delta={prior?.changes?.unitsPct} icon={ReceiptText} onClick={() => openTransactions()} />
          <MetricCard title="Closed volume" value={money(actuals?.volume, true)} detail="Purchase-price volume" delta={prior?.changes?.volumePct} icon={Landmark} onClick={() => openTransactions()} accent="text-blue-700" />
          <MetricCard title="Avg. purchase price" value={money(actuals?.averagePurchasePrice, true)} detail="Across recorded purchase prices" icon={BarChart3} onClick={() => openTransactions()} accent="text-violet-700" />
          <MetricCard title="GCI" value={money(actuals?.gci, true)} detail="Recorded gross commission income" delta={prior?.changes?.gciPct} icon={CircleDollarSign} onClick={() => openTransactions()} accent="text-amber-700" />
          <MetricCard title="Recorded Savvy Net" value={money(actuals?.recordedSavvyNet, true)} detail={`${percent(actuals?.payoutCoveragePct)} payout coverage`} delta={prior?.changes?.recordedSavvyNetPct} icon={TrendingUp} onClick={() => openTransactions()} accent="text-emerald-700" />
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-5">
        <Card className="xl:col-span-3"><CardHeader className="pb-2"><CardTitle className="text-base">Monthly closed production</CardTitle><CardDescription>Units and volume by actual closing month. GCI and Savvy Net remain available in the evidence and economics sections below.</CardDescription></CardHeader><CardContent>{monthly.length ? <ResponsiveContainer width="100%" height={310}><ComposedChart data={monthly} margin={{ left: 4, right: 8, top: 8 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" tick={{ fontSize: 11 }} /><YAxis yAxisId="money" tickFormatter={(value) => money(value, true)} tick={{ fontSize: 11 }} /><YAxis yAxisId="units" orientation="right" allowDecimals={false} tick={{ fontSize: 11 }} /><Tooltip formatter={(value: number, name: string) => name === "Closed units" ? integer(value) : money(value)} /><Legend wrapperStyle={{ fontSize: 12 }} /><Bar yAxisId="money" dataKey="volume" name="Closed volume" fill="#2563eb" radius={[4, 4, 0, 0]} /><Line yAxisId="units" type="monotone" dataKey="units" name="Closed units" stroke="#0f766e" strokeWidth={2.5} dot={{ r: 3 }} /></ComposedChart></ResponsiveContainer> : <EmptyState title="No closed transaction history in this scope" description="Change the period or filters to view recorded closing-date production." />}</CardContent></Card>
        <Card className="xl:col-span-2"><CardHeader className="pb-2"><CardTitle className="text-base">Live under-contract inventory</CardTitle><CardDescription>Current pipeline inventory is intentionally separate from closed actuals and never limited by the selected closing period.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="grid grid-cols-2 gap-3"><div className="rounded-lg bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Under-contract units</p><p className="mt-1 text-xl font-semibold tabular-nums">{integer(pipeline?.units)}</p></div><div className="rounded-lg bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Under-contract volume</p><p className="mt-1 text-xl font-semibold tabular-nums">{money(pipeline?.volume, true)}</p></div></div><div className="space-y-2 rounded-lg border p-3 text-sm"><div className="flex justify-between gap-4"><span className="text-muted-foreground">Avg. purchase price</span><span className="font-medium tabular-nums">{money(pipeline?.averagePurchasePrice)}</span></div><div className="flex justify-between gap-4"><span className="text-muted-foreground">Recorded GCI</span><span className="font-medium tabular-nums">{money(pipeline?.recordedGci)}</span></div><div className="flex justify-between gap-4"><span className="text-muted-foreground">Past expected close</span><span className={pipeline?.pastExpectedCloseDateCount ? "font-medium text-rose-700" : "font-medium"}>{integer(pipeline?.pastExpectedCloseDateCount)}</span></div><div className="flex justify-between gap-4"><span className="text-muted-foreground">No expected close date</span><span className={pipeline?.missingExpectedCloseDateCount ? "font-medium text-amber-700" : "font-medium"}>{integer(pipeline?.missingExpectedCloseDateCount)}</span></div></div><Button variant="outline" size="sm" className="w-full" onClick={() => openTransactions({ status: "under_contract", includeClosedDateRange: false })}><ExternalLink className="mr-1.5 h-3.5 w-3.5" />Open live under-contract records</Button></CardContent></Card>
      </div>

      <section className="grid gap-5 xl:grid-cols-5" aria-labelledby="economics-heading">
        <Card className="xl:col-span-3"><CardHeader className="pb-2"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Recorded economics</p><CardTitle id="economics-heading" className="text-base">GCI and payout bridge</CardTitle><CardDescription>These are recorded amounts, not an earnings projection. Savvy Net is the recorded payout to Savvy STR Agents and EXP.</CardDescription></div><Badge variant={actuals?.payoutCoveragePct === 100 ? "secondary" : "outline"}>{percent(actuals?.payoutCoveragePct)} payout coverage</Badge></div></CardHeader><CardContent><div className="space-y-2"><div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2.5"><span className="font-medium">Recorded GCI</span><span className="font-semibold tabular-nums">{money(actuals?.gci)}</span></div><div className="flex items-center justify-between rounded-lg border px-3 py-2.5 text-sm"><span className="text-muted-foreground">Average recorded commission rate</span><span className="font-medium tabular-nums">{percent(actuals?.averageCommissionRate)}</span></div><div className="grid gap-2 sm:grid-cols-2"><div className="flex justify-between rounded-lg border px-3 py-2 text-sm"><span className="text-muted-foreground">Agent payouts</span><span className="tabular-nums">{money(actuals?.agentPayouts)}</span></div><div className="flex justify-between rounded-lg border px-3 py-2 text-sm"><span className="text-muted-foreground">Referral payouts</span><span className="tabular-nums">{money(actuals?.referralPayouts)}</span></div><div className="flex justify-between rounded-lg border px-3 py-2 text-sm"><span className="text-muted-foreground">Group-leader payouts</span><span className="tabular-nums">{money(actuals?.groupLeaderPayouts)}</span></div><div className="flex justify-between rounded-lg border px-3 py-2 text-sm"><span className="text-muted-foreground">ISA bonuses / other</span><span className="tabular-nums">{money(Number(actuals?.isaBonuses ?? 0) + Number(actuals?.otherPayouts ?? 0))}</span></div></div><div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-3"><div><p className="font-medium text-emerald-950">Recorded Savvy Net</p><p className="text-xs text-emerald-800">Average across payout-recorded closings: {money(actuals?.averageRecordedSavvyNet)}</p></div><span className="text-lg font-semibold tabular-nums text-emerald-950">{money(actuals?.recordedSavvyNet)}</span></div><div className={`flex justify-between rounded-lg px-3 py-2 text-sm ${Number(actuals?.unallocatedGci) ? "bg-amber-50 text-amber-950" : "bg-muted/50"}`}><span>GCI not allocated by recorded payouts</span><span className="font-medium tabular-nums">{money(actuals?.unallocatedGci)}</span></div></div></CardContent></Card>
        <Card className="xl:col-span-2"><CardHeader className="pb-2"><CardTitle className="text-base">Data confidence</CardTitle><CardDescription>These exceptions limit how confidently economics and source comparisons can be interpreted.</CardDescription></CardHeader><CardContent className="space-y-3"><div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Transactions with any payout record</p><p className="mt-1 text-2xl font-semibold tabular-nums">{integer(actuals?.recordedPayoutTransactions)} <span className="text-sm font-normal text-muted-foreground">of {integer(actuals?.units)}</span></p><p className="mt-1 text-xs text-muted-foreground">Coverage: {percent(actuals?.payoutCoveragePct)}. Do not treat a missing payout as zero Savvy Net.</p></div><div className="grid grid-cols-2 gap-2 text-sm"><div className="rounded-lg bg-muted/50 p-3"><p className="text-muted-foreground">Missing price</p><p className="mt-1 text-lg font-semibold">{integer(actuals?.missingPriceCount)}</p></div><div className="rounded-lg bg-muted/50 p-3"><p className="text-muted-foreground">Missing GCI</p><p className="mt-1 text-lg font-semibold">{integer(actuals?.missingGciCount)}</p></div><div className="rounded-lg bg-muted/50 p-3"><p className="text-muted-foreground">Unattributed source</p><p className="mt-1 text-lg font-semibold">{integer(actuals?.missingLeadSourceCount)}</p></div><div className={`rounded-lg p-3 ${actuals?.payoutIntegrityCount ? "bg-rose-50" : "bg-muted/50"}`}><p className="text-muted-foreground">Payout integrity flags</p><p className={`mt-1 text-lg font-semibold ${actuals?.payoutIntegrityCount ? "text-rose-700" : ""}`}>{integer(actuals?.payoutIntegrityCount)}</p></div></div></CardContent></Card>
      </section>

      <section className="space-y-3" aria-labelledby="mix-heading"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Transaction mix</p><h2 id="mix-heading" className="text-lg font-semibold tracking-tight">Buyer, seller, and dual production</h2></div><div className="grid gap-3 md:grid-cols-3">{(report?.byTransactionType ?? []).map((side: any) => <Card key={side.transactionType} className="h-full"><CardContent className="p-4"><div className="flex items-center justify-between"><p className="font-medium capitalize">{side.transactionType} side</p><Badge variant="outline">{integer(side.units)} units</Badge></div><p className="mt-3 text-xl font-semibold tabular-nums">{money(side.volume, true)}</p><p className="mt-1 text-xs text-muted-foreground">Volume · avg. price {money(side.averagePurchasePrice, true)}</p><div className="mt-3 grid grid-cols-3 gap-2 text-sm"><div><p className="text-xs text-muted-foreground">GCI</p><p className="font-medium tabular-nums">{money(side.gci, true)}</p></div><div><p className="text-xs text-muted-foreground">Avg. commission</p><p className="font-medium tabular-nums">{percent(side.averageCommissionRate)}</p></div><div><p className="text-xs text-muted-foreground">Recorded Net</p><p className="font-medium tabular-nums">{money(side.recordedSavvyNet, true)}</p></div></div><Button variant="ghost" size="sm" className="mt-3 -ml-2" onClick={() => openTransactions({ transactionType: side.transactionType })}>View source records <ChevronRight className="ml-1 h-3.5 w-3.5" /></Button></CardContent></Card>)}</div></section>

      <div className="grid gap-5 2xl:grid-cols-2">
        <Card><CardHeader className="pb-2"><CardTitle className="text-base">Agent production and pipeline</CardTitle><CardDescription>Closed actuals in the selected period beside current under-contract inventory. Use agent profiles for the linked individual scorecard.</CardDescription></CardHeader><CardContent>{report?.agents?.length ? <TableShell><thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="px-3 py-2 text-left font-medium">Agent</th><th className="px-3 py-2 text-right font-medium">Closed</th><th className="px-3 py-2 text-right font-medium">Volume</th><th className="px-3 py-2 text-right font-medium">Avg. price</th><th className="px-3 py-2 text-right font-medium">Savvy Net</th><th className="px-3 py-2 text-right font-medium">UC volume</th><th className="px-3 py-2 text-right font-medium">Open</th></tr></thead><tbody className="divide-y">{report.agents.map((agent: any) => <tr key={agent.agentId} className="hover:bg-muted/30"><td className="px-3 py-3"><button className="font-medium text-primary hover:underline" onClick={() => navigate(`/agents/${agent.agentId}`)}>{agent.agentName}</button><p className="mt-0.5 text-xs text-muted-foreground">{integer(agent.underContractUnits)} UC · {integer(agent.pastExpectedCloseDateCount)} past due</p></td><td className="px-3 py-3 text-right tabular-nums">{integer(agent.closedUnits)}</td><td className="px-3 py-3 text-right tabular-nums">{money(agent.closedVolume, true)}</td><td className="px-3 py-3 text-right tabular-nums">{money(agent.averagePurchasePrice, true)}</td><td className="px-3 py-3 text-right tabular-nums">{money(agent.recordedSavvyNet, true)}</td><td className="px-3 py-3 text-right tabular-nums">{money(agent.underContractVolume, true)}</td><td className="px-3 py-3 text-right"><Button variant="ghost" size="sm" aria-label={`Open ${agent.agentName} transactions`} onClick={() => openTransactions({ agentId: agent.agentId })}><ExternalLink className="h-3.5 w-3.5" /></Button></td></tr>)}</tbody></TableShell> : <EmptyState title="No agent production in this scope" description="Closed production and current under-contract inventory will appear when matching records exist." />}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-base">Closed source contribution</CardTitle><CardDescription>Observed closed outcomes by attributed lead source. Cost and ROI remain intentionally unavailable until spend is recorded.</CardDescription></CardHeader><CardContent>{report?.sources?.length ? <ResponsiveContainer width="100%" height={310}><BarChart data={report.sources.slice(0, 8)} layout="vertical" margin={{ left: 8, right: 16 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" tickFormatter={(value) => money(value, true)} tick={{ fontSize: 10 }} /><YAxis dataKey="sourceName" type="category" width={125} tick={{ fontSize: 10 }} /><Tooltip formatter={(value: number) => money(value)} /><Bar dataKey="closedVolume" name="Closed volume" fill="#7c3aed" radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer> : <EmptyState title="No attributed closed outcomes in this scope" description="Source contribution will appear when closed transactions are linked to lead-source data." />}<div className="mt-3 flex flex-wrap gap-2">{(report?.sources ?? []).slice(0, 6).map((source: any) => source.leadSourceId ? <Button key={source.leadSourceId} variant="outline" size="sm" onClick={() => openTransactions({ leadSourceId: source.leadSourceId })}>{source.sourceName} <ChevronRight className="ml-1 h-3.5 w-3.5" /></Button> : <Badge key={source.sourceName} variant="outline">Unattributed {integer(source.closedUnits)} units</Badge>)}</div></CardContent></Card>
      </div>

      <section className="space-y-3" aria-labelledby="evidence-heading"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Evidence register</p><h2 id="evidence-heading" className="text-lg font-semibold tracking-tight">Closed source records</h2><p className="mt-1 text-sm text-muted-foreground">A visible record-level sample of the exact closed population behind the report. Use the full link for every matching record.</p></div><Button variant="outline" size="sm" onClick={() => openTransactions()}><ExternalLink className="mr-1.5 h-3.5 w-3.5" />View all matching records</Button></div>{transactions.length ? <TableShell><thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="px-3 py-2 text-left font-medium">Transaction</th><th className="px-3 py-2 text-left font-medium">Closed</th><th className="px-3 py-2 text-left font-medium">Agent</th><th className="px-3 py-2 text-left font-medium">Source</th><th className="px-3 py-2 text-right font-medium">Price</th><th className="px-3 py-2 text-right font-medium">GCI</th><th className="px-3 py-2 text-right font-medium">Savvy Net</th><th className="px-3 py-2 text-right font-medium">Open</th></tr></thead><tbody className="divide-y">{transactions.map((transaction: any) => <tr key={transaction.transactionId} className="hover:bg-muted/30"><td className="px-3 py-3"><button className="font-medium text-primary hover:underline" onClick={() => navigate(`/transactions/${transaction.transactionId}`)}>{transaction.transactionNumber}</button><p className="mt-0.5 max-w-[260px] truncate text-xs text-muted-foreground">{transaction.property} · {transaction.transactionType}</p></td><td className="px-3 py-3">{dateLabel(transaction.closingDate)}</td><td className="px-3 py-3">{transaction.agentName}</td><td className="px-3 py-3">{transaction.sourceName}</td><td className="px-3 py-3 text-right tabular-nums">{money(transaction.purchasePrice)}</td><td className="px-3 py-3 text-right tabular-nums">{money(transaction.gci)}</td><td className="px-3 py-3 text-right tabular-nums">{money(transaction.recordedSavvyNet)}</td><td className="px-3 py-3 text-right"><Button variant="ghost" size="sm" aria-label={`Open ${transaction.transactionNumber}`} onClick={() => navigate(`/transactions/${transaction.transactionId}`)}><ExternalLink className="h-3.5 w-3.5" /></Button></td></tr>)}</tbody></TableShell> : <EmptyState title="No closed source records in this scope" description="Adjust the closed-actuals period or focused filters to inspect matching transaction evidence." />}</section>
    </>}
  </div>;
}
