import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Brain,
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Database,
  DollarSign,
  ExternalLink,
  Filter,
  Landmark,
  LineChart as LineChartIcon,
  ListChecks,
  MapPinned,
  RefreshCw,
  ShieldCheck,
  Target,
  TrendingUp,
  UserCheck,
  Users,
  Wallet,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type ViewId = "executive" | "forecast" | "performance" | "isa" | "markets" | "sources" | "operations" | "trust";
type DateMode = "closing" | "contract" | "none";

type TransactionLinkOptions = {
  status?: "all" | "closed" | "under_contract" | "terminated";
  dateMode?: DateMode;
  agentId?: number | null;
  marketId?: number | null;
  leadSourceId?: number | null;
};

const NAVIGATION: Array<{ id: ViewId; label: string; shortLabel: string; description: string; icon: any }> = [
  { id: "executive", label: "Executive Command Center", shortLabel: "Command", description: "Verified outcomes, operating risks, and decision context.", icon: BarChart3 },
  { id: "forecast", label: "Pipeline, Forecast & Economics", shortLabel: "Forecast", description: "Current under-contract inventory and expected-close outlook.", icon: TrendingUp },
  { id: "performance", label: "People, Teams & Goals", shortLabel: "Performance", description: "Coach from linked production, execution, and goal evidence.", icon: Users },
  { id: "isa", label: "ISA & Lead Coverage", shortLabel: "ISA", description: "Assigned lead coverage and work queues by ISA book.", icon: UserCheck },
  { id: "markets", label: "Markets & Capacity", shortLabel: "Markets", description: "Market production, pipeline, capacity, and readiness signals.", icon: MapPinned },
  { id: "sources", label: "Sources & Partnerships", shortLabel: "Sources", description: "Observed attribution, lead volume, and closed outcomes.", icon: Landmark },
  { id: "operations", label: "Pipeline & Follow-Up", shortLabel: "Operations", description: "Resolve stalled records, overdue follow-ups, and work commitments.", icon: ListChecks },
  { id: "trust", label: "Data Trust & Administration", shortLabel: "Data trust", description: "Repair data and workflow gaps that weaken reporting confidence.", icon: ShieldCheck },
];

const CHART_COLORS = ["#0f766e", "#2563eb", "#7c3aed", "#d97706", "#0891b2", "#be185d", "#15803d", "#64748b"];
const PIPELINE_COLORS: Record<string, string> = {
  new_lead: "#2563eb",
  attempted_contact: "#7c3aed",
  nurture: "#d97706",
  active_client: "#0f766e",
  under_contract: "#0891b2",
  closed: "#15803d",
  dead: "#94a3b8",
};

function money(value: unknown, compact = false): string {
  if (value === null || value === undefined || value === "") return "—";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  if (compact && Math.abs(amount) >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (compact && Math.abs(amount) >= 1_000) return `$${(amount / 1_000).toFixed(0)}k`;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(amount);
}

function integer(value: unknown): string {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount.toLocaleString() : "—";
}

function percent(value: unknown, digits = 0): string {
  const amount = Number(value);
  return Number.isFinite(amount) ? `${(amount * 100).toFixed(digits)}%` : "—";
}

function signedPercent(value: unknown): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "No comparable prior period";
  return `${amount >= 0 ? "+" : ""}${amount.toFixed(1)}% vs. prior period`;
}

function dateLabel(value: unknown): string {
  if (!value) return "Not recorded";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "Not recorded";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function toDateInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function resolvePreset(preset: string) {
  const today = new Date();
  const to = toDateInput(today);
  if (preset === "all") return { dateFrom: "", dateTo: "" };
  const from = new Date(today);
  if (preset === "ytd") from.setMonth(0, 1);
  else if (preset === "last30") from.setDate(from.getDate() - 30);
  else if (preset === "last90") from.setDate(from.getDate() - 90);
  else if (preset === "last12") from.setFullYear(from.getFullYear() - 1);
  return { dateFrom: toDateInput(from), dateTo: to };
}

function uniqueRows<T extends Record<string, any>>(rows: T[], key: string): T[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const value = String(row?.[key] ?? "");
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function TrendPill({ value }: { value: unknown }) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return <span className="text-xs text-muted-foreground">No comparable prior period</span>;
  const positive = amount >= 0;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${positive ? "text-emerald-700" : "text-rose-700"}`}>
      {positive ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
      {signedPercent(amount)}
    </span>
  );
}

function MetricCard({
  label,
  value,
  note,
  trend,
  icon: Icon,
  accent = "teal",
  onClick,
}: {
  label: string;
  value: string;
  note?: string;
  trend?: unknown;
  icon: any;
  accent?: "teal" | "blue" | "amber" | "rose" | "violet" | "slate";
  onClick?: () => void;
}) {
  const accentMap = {
    teal: "bg-teal-50 text-teal-700 border-teal-100",
    blue: "bg-blue-50 text-blue-700 border-blue-100",
    amber: "bg-amber-50 text-amber-700 border-amber-100",
    rose: "bg-rose-50 text-rose-700 border-rose-100",
    violet: "bg-violet-50 text-violet-700 border-violet-100",
    slate: "bg-slate-50 text-slate-700 border-slate-200",
  };
  return (
    <Card
      className={`h-full ${onClick ? "cursor-pointer transition-all hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md" : ""}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(event) => {
        if (onClick && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onClick();
        }
      }}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
            <div className="mt-1.5 min-h-4">
              {trend !== undefined ? <TrendPill value={trend} /> : note ? <span className="text-xs leading-4 text-muted-foreground">{note}</span> : null}
            </div>
          </div>
          <span className={`rounded-xl border p-2.5 ${accentMap[accent]}`}><Icon className="h-4 w-4" /></span>
        </div>
        {onClick && <div className="mt-3 flex items-center text-[11px] font-medium text-primary">Open source records <ChevronRight className="ml-0.5 h-3.5 w-3.5" /></div>}
      </CardContent>
    </Card>
  );
}

function SectionHeader({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        {description && <p className="mt-1 max-w-4xl text-sm leading-6 text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="flex min-h-40 flex-col items-center justify-center rounded-lg border border-dashed bg-muted/20 px-5 text-center"><p className="font-medium">{title}</p><p className="mt-1 max-w-lg text-sm text-muted-foreground">{description}</p></div>;
}

function TableShell({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm">{children}</table></div>;
}

function TableHead({ children }: { children: React.ReactNode }) {
  return <thead className="border-b bg-muted/35 text-[11px] uppercase tracking-wide text-muted-foreground"><tr>{children}</tr></thead>;
}

function InsightBrief({ data, canRefresh, forceRefreshAllowed, refreshing, onRefresh, onOpenOperations, onOpenTrust }: {
  data: any;
  canRefresh: boolean;
  forceRefreshAllowed: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onOpenOperations: () => void;
  onOpenTrust: () => void;
}) {
  const insights = data?.insights ?? [];
  const iconByType: Record<string, any> = {
    warning: AlertTriangle,
    opportunity: TrendingUp,
    coaching: UserCheck,
    success: CheckCircle2,
    data_quality: Database,
  };
  return (
    <Card className="border-primary/15 bg-gradient-to-br from-primary/[0.04] via-background to-teal-50/60">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-3">
            <div className="rounded-xl bg-primary p-2.5 text-primary-foreground"><Brain className="h-5 w-5" /></div>
            <div>
              <CardTitle className="text-base">Evidence-grounded intelligence brief</CardTitle>
              <CardDescription className="mt-1">Interpretive signals are linked to SavvyOS operational facts and are not a substitute for source records or management judgment.</CardDescription>
            </div>
          </div>
          {canRefresh && (!insights.length || forceRefreshAllowed) && <Button size="sm" variant="outline" onClick={onRefresh} disabled={refreshing}><RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />{refreshing ? "Generating" : insights.length ? "Refresh brief" : "Generate brief"}</Button>}
        </div>
      </CardHeader>
      <CardContent>
        {data?.summary && <p className="mb-4 rounded-lg border bg-background/70 p-3 text-sm leading-6 text-muted-foreground">{data.summary}</p>}
        {!insights.length ? <EmptyState title="No cached intelligence brief for this scope" description={canRefresh ? "Generate a brief to synthesize the selected, authorized operational scope. The dashboards below remain the system of record." : "The dashboards below remain the system of record for this authorized scope."} /> : <div className="grid gap-3 lg:grid-cols-2">
          {insights.slice(0, 6).map((insight: any, index: number) => {
            const Icon = iconByType[insight.type] ?? Brain;
            return <div key={`${insight.title}-${index}`} className="rounded-xl border bg-background p-4">
              <div className="flex gap-3"><span className="h-fit rounded-lg bg-primary/10 p-2 text-primary"><Icon className="h-4 w-4" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{insight.title}</p><Badge variant={insight.priority === "high" ? "destructive" : "secondary"}>{insight.priority} priority</Badge></div><p className="mt-2 text-sm leading-5">{insight.observation}</p><p className="mt-2 text-sm leading-5 text-muted-foreground"><span className="font-medium text-foreground">Why it may matter: </span>{insight.explanation}</p><p className="mt-3 rounded-md bg-muted/45 p-2.5 text-xs leading-5"><span className="font-semibold">Owner: </span>{insight.owner}<br /><span className="font-semibold">Next action: </span>{insight.action}</p><div className="mt-3 flex flex-wrap gap-2">{(insight.evidence ?? []).slice(0, 3).map((evidence: any, evidenceIndex: number) => <button key={`${evidence.label}-${evidenceIndex}`} className="rounded border bg-muted/25 px-2 py-1 text-xs transition-colors hover:border-primary/40 hover:bg-primary/5" onClick={() => evidence.drilldown === "dataQuality" ? onOpenTrust() : onOpenOperations()}>{evidence.label}: <span className="font-semibold">{evidence.value}</span></button>)}</div></div></div>
            </div>;
          })}
        </div>}
      </CardContent>
    </Card>
  );
}

function ExecutiveDashboard({ workspace, insights, onTransactions, onNavigate, canRefreshInsights, forceRefreshAllowed, refreshing, onRefresh }: {
  workspace: any;
  insights: any;
  onTransactions: (options?: TransactionLinkOptions) => void;
  onNavigate: (view: ViewId) => void;
  canRefreshInsights: boolean;
  forceRefreshAllowed: boolean;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const summary = workspace.summary ?? {};
  const trend = workspace.trend ?? [];
  const reconciliation = workspace.canonicalTransactions?.reconciliation;
  const attention = uniqueRows([...(workspace.pipeline?.staleRecords ?? []), ...(workspace.pipeline?.overdueFollowUps ?? [])], "connectionId").slice(0, 6);
  const sourceChart = (workspace.sources ?? []).slice(0, 6).map((source: any) => ({ name: String(source.sourceName ?? "Unknown").slice(0, 18), gci: Number(source.gci ?? 0) }));
  return <div className="space-y-6">
    <SectionHeader title="Executive Command Center" description="Closed production is a closing-date flow. Under-contract inventory is a live snapshot, independently reconciled to the canonical Transactions page." />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Closed GCI" value={money(summary.gci, true)} trend={summary.gciTrendPct} icon={DollarSign} accent="teal" onClick={() => onTransactions({ status: "closed", dateMode: "closing" })} />
      <MetricCard label="Closings" value={integer(summary.closings)} trend={summary.closingsTrendPct} icon={CheckCircle2} accent="blue" onClick={() => onTransactions({ status: "closed", dateMode: "closing" })} />
      <MetricCard label="Closed volume" value={money(summary.volume, true)} trend={summary.volumeTrendPct} icon={Building2} accent="violet" onClick={() => onTransactions({ status: "closed", dateMode: "closing" })} />
      <MetricCard label="Under contract now" value={integer(summary.underContractCount)} note={reconciliation?.status === "pass" ? "Verified against Transactions" : "Review reconciliation status"} icon={Target} accent={reconciliation?.status === "pass" ? "blue" : "rose"} onClick={() => onTransactions({ status: "under_contract", dateMode: "none" })} />
    </div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Current pipeline value" value={money(summary.pipelineValue, true)} note="Purchase-price value; not revenue forecast" icon={TrendingUp} accent="blue" onClick={() => onTransactions({ status: "under_contract", dateMode: "none" })} />
      <MetricCard label="Stalled pipeline" value={integer(workspace.pipeline?.stalledCount)} note="Active 14+ days without qualifying activity" icon={AlertTriangle} accent="rose" onClick={() => onNavigate("operations")} />
      <MetricCard label="Overdue follow-ups" value={integer(workspace.pipeline?.overdueFollowUpCount)} note="Open records with a past due date" icon={CalendarClock} accent="amber" onClick={() => onNavigate("operations")} />
      <MetricCard label="Overdue tasks" value={integer(workspace.tasks?.overdueCount)} note="Explicit work commitments past due" icon={ClipboardCheck} accent="rose" onClick={() => onNavigate("operations")} />
    </div>
    <div className="grid gap-4 xl:grid-cols-3">
      <Card className="xl:col-span-2"><CardHeader><CardTitle className="text-base">Closed production trend</CardTitle><CardDescription>Monthly closed GCI by closing date in the selected period. This trend intentionally excludes transactions without a closing date.</CardDescription></CardHeader><CardContent>{trend.length ? <ResponsiveContainer width="100%" height={285}><AreaChart data={trend}><defs><linearGradient id="executiveGci" x1="0" x2="0" y1="0" y2="1"><stop offset="5%" stopColor="#0f766e" stopOpacity={0.34} /><stop offset="95%" stopColor="#0f766e" stopOpacity={0} /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="month" tick={{ fontSize: 11 }} /><YAxis tickFormatter={(value) => money(value, true)} tick={{ fontSize: 11 }} /><Tooltip formatter={(value: number) => money(value)} /><Area type="monotone" dataKey="gci" name="Closed GCI" stroke="#0f766e" strokeWidth={2.5} fill="url(#executiveGci)" /></AreaChart></ResponsiveContainer> : <EmptyState title="No closed production in this period" description="Change the reporting range or filters to compare available closed-transaction history." />}</CardContent></Card>
      <Card><CardHeader><CardTitle className="text-base">Metric integrity</CardTitle><CardDescription>Definitions and reconciliation state for the most decision-sensitive measures.</CardDescription></CardHeader><CardContent className="space-y-4"><div className={`rounded-lg border p-3 ${reconciliation?.status === "pass" ? "border-emerald-200 bg-emerald-50/60" : "border-rose-200 bg-rose-50/60"}`}><div className="flex items-center justify-between gap-3"><p className="font-medium">Under-contract snapshot</p><Badge variant={reconciliation?.status === "pass" ? "secondary" : "destructive"}>{reconciliation?.status === "pass" ? "Reconciled" : "Needs review"}</Badge></div><p className="mt-2 text-sm text-muted-foreground">Analytics {integer(reconciliation?.analyticsCount)} · Transactions {integer(reconciliation?.canonicalCount)}</p><button className="mt-3 text-xs font-medium text-primary hover:underline" onClick={() => onTransactions({ status: "under_contract", dateMode: "none" })}>Open canonical Transactions</button></div><div className="space-y-2 text-sm text-muted-foreground"><p><span className="font-medium text-foreground">Closed production:</span> closing-date flow for the selected period.</p><p><span className="font-medium text-foreground">Pipeline value:</span> current under-contract purchase-price value, not a revenue forecast.</p><p><span className="font-medium text-foreground">Finance:</span> payout economics remain role-gated.</p></div></CardContent></Card>
    </div>
    <div className="grid gap-4 xl:grid-cols-3">
      <Card className="xl:col-span-2"><CardHeader><CardTitle className="text-base">Immediate operating attention</CardTitle><CardDescription>Resolve the source records below; dashboard signals do not replace ownership or a dated next step.</CardDescription></CardHeader><CardContent>{attention.length ? <TableShell><TableHead><th className="px-3 py-2 text-left">Contact</th><th className="px-3 py-2 text-left">Agent</th><th className="px-3 py-2 text-left">Stage</th><th className="px-3 py-2 text-right">Idle days</th><th className="px-3 py-2 text-left">Follow-up</th><th className="px-3 py-2 text-right">Open</th></TableHead><tbody className="divide-y">{attention.map((record: any) => <tr key={record.connectionId} className="hover:bg-muted/30"><td className="px-3 py-3"><button className="font-medium text-primary hover:underline" onClick={() => onNavigate("operations")}>{record.contactName}</button><p className="text-xs text-muted-foreground">{record.sourceName ?? "No source"}</p></td><td className="px-3 py-3">{record.agentName}</td><td className="px-3 py-3"><Badge variant="secondary">{record.stageLabel}</Badge></td><td className="px-3 py-3 text-right">{integer(record.ageDays)}</td><td className="px-3 py-3">{dateLabel(record.followUpDate)}</td><td className="px-3 py-3 text-right"><Button variant="ghost" size="sm" onClick={() => onNavigate("operations")}><ExternalLink className="h-3.5 w-3.5" /></Button></td></tr>)}</tbody></TableShell> : <EmptyState title="No stalled or overdue pipeline record in this scope" description="Maintain dated follow-ups so the operating queue remains useful when exceptions emerge." />}</CardContent></Card>
      <Card><CardHeader><CardTitle className="text-base">Top observed source outcomes</CardTitle><CardDescription>Closed GCI is observed, not marketing return on spend.</CardDescription></CardHeader><CardContent>{sourceChart.length ? <ResponsiveContainer width="100%" height={260}><BarChart data={sourceChart} layout="vertical" margin={{ left: 8 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" tickFormatter={(value) => money(value, true)} tick={{ fontSize: 10 }} /><YAxis dataKey="name" type="category" width={112} tick={{ fontSize: 10 }} /><Tooltip formatter={(value: number) => money(value)} /><Bar dataKey="gci" name="Closed GCI" fill="#2563eb" radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer> : <EmptyState title="No attributed closed outcomes" description="Source performance appears once attribution and closings are recorded." />}</CardContent></Card>
    </div>
    <InsightBrief data={insights} canRefresh={canRefreshInsights} forceRefreshAllowed={forceRefreshAllowed} refreshing={refreshing} onRefresh={onRefresh} onOpenOperations={() => onNavigate("operations")} onOpenTrust={() => onNavigate("trust")} />
  </div>;
}

function ForecastDashboard({ workspace, onTransactions }: { workspace: any; onTransactions: (options?: TransactionLinkOptions) => void }) {
  const summary = workspace.summary ?? {};
  const canonical = workspace.canonicalTransactions ?? {};
  const snapshot = canonical.snapshot ?? {};
  const forecast = canonical.forecast ?? [];
  const canSeeFinance = Boolean(workspace.scope?.canSeeFinance);
  const forecastLabels: Record<string, string> = { overdue: "Past expected close", next_30: "Next 30 days", days_31_60: "31–60 days", days_61_90: "61–90 days", days_91_plus: "91+ days", missing_expected_close: "No expected close" };
  const barData = forecast.map((bucket: any) => ({ name: forecastLabels[bucket.bucket] ?? bucket.bucket, gci: Number(bucket.gci ?? 0), count: Number(bucket.count ?? 0) }));
  const underContractRows = (workspace.transactions?.rows ?? []).filter((row: any) => row.status === "under_contract");
  return <div className="space-y-6">
    <SectionHeader title="Pipeline, Forecast & Economics" description="Expected-close buckets describe current under-contract inventory. They are not probability-weighted forecasts and do not substitute for transaction-level review." />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Under contract now" value={integer(snapshot.underContractCount ?? summary.underContractCount)} note="Live transaction snapshot" icon={Target} accent="blue" onClick={() => onTransactions({ status: "under_contract", dateMode: "none" })} />
      <MetricCard label="Pipeline purchase value" value={money(snapshot.underContractVolume ?? summary.pipelineValue, true)} note="Not a revenue forecast" icon={Building2} accent="violet" onClick={() => onTransactions({ status: "under_contract", dateMode: "none" })} />
      <MetricCard label="Pipeline GCI" value={money(snapshot.underContractGci ?? summary.pipelineGci, true)} note="Recorded GCI on under-contract records" icon={DollarSign} accent="teal" onClick={() => onTransactions({ status: "under_contract", dateMode: "none" })} />
      {canSeeFinance ? <MetricCard label="Closed company dollars" value={money(summary.companyDollars, true)} note="Payout items for closed transactions" icon={Wallet} accent="amber" onClick={() => onTransactions({ status: "closed", dateMode: "closing" })} /> : <MetricCard label="Payout economics" value="Restricted" note="Visible only to authorized financial roles" icon={Wallet} accent="slate" />}
    </div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <MetricCard label="Missing expected close" value={integer(snapshot.missingExpectedCloseDateCount)} note="Under-contract records without an expected close date" icon={CalendarClock} accent="amber" onClick={() => onTransactions({ status: "under_contract", dateMode: "none" })} />
      <MetricCard label="Past expected close" value={integer(snapshot.pastExpectedCloseDateCount)} note="Transaction review needed; status may still be valid" icon={AlertTriangle} accent="rose" onClick={() => onTransactions({ status: "under_contract", dateMode: "none" })} />
      <MetricCard label="Median closed GCI" value={money(summary.medianGci, true)} note="Selected-period closing-date flow" icon={LineChartIcon} accent="teal" onClick={() => onTransactions({ status: "closed", dateMode: "closing" })} />
    </div>
    <div className="grid gap-4 xl:grid-cols-2">
      <Card><CardHeader><CardTitle className="text-base">Expected-close outlook</CardTitle><CardDescription>Recorded expected-close buckets for the current under-contract snapshot; missing or past dates are operational exception signals.</CardDescription></CardHeader><CardContent>{barData.some((item: any) => item.count > 0) ? <ResponsiveContainer width="100%" height={320}><BarChart data={barData} margin={{ left: 8 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} /><YAxis yAxisId="left" tickFormatter={(value) => money(value, true)} tick={{ fontSize: 10 }} /><YAxis yAxisId="right" orientation="right" allowDecimals={false} tick={{ fontSize: 10 }} /><Tooltip formatter={(value: number, name: string) => name === "GCI" ? money(value) : integer(value)} /><Bar yAxisId="left" dataKey="gci" name="GCI" fill="#0f766e" radius={[4, 4, 0, 0]} /><Bar yAxisId="right" dataKey="count" name="Transactions" fill="#93c5fd" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer> : <EmptyState title="No under-contract expected-close data" description="Set a status and expected close date on live transactions to populate the outlook." />}</CardContent></Card>
      <Card><CardHeader><CardTitle className="text-base">Interpretation guardrails</CardTitle><CardDescription>Use the transaction register to verify conditions that can change before a deal closes.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="rounded-lg border border-blue-100 bg-blue-50/50 p-3"><p className="font-medium text-blue-950">Forecast discipline</p><p className="mt-1 text-sm leading-5 text-blue-900">This dashboard shows recorded current inventory and dates. It does not apply probability weights, cancelation assumptions, or revenue-recognition logic.</p></div><div className="rounded-lg border p-3"><p className="font-medium">Open the operational source</p><p className="mt-1 text-sm text-muted-foreground">Use Transactions to confirm price, GCI, dates, status, payout integrity, and the exact client record before acting.</p><Button className="mt-3" variant="outline" size="sm" onClick={() => onTransactions({ status: "under_contract", dateMode: "none" })}>Open under-contract Transactions <ExternalLink className="ml-1.5 h-3.5 w-3.5" /></Button></div></CardContent></Card>
    </div>
    <Card><CardHeader><CardTitle className="text-base">Under-contract register</CardTitle><CardDescription>Compact linked analytical register. Use the canonical Transactions page for full sorting, editing, and payout detail.</CardDescription></CardHeader><CardContent>{underContractRows.length ? <TableShell><TableHead><th className="px-3 py-2 text-left">Transaction</th><th className="px-3 py-2 text-left">Client</th><th className="px-3 py-2 text-left">Agent</th><th className="px-3 py-2 text-left">Expected / closing</th><th className="px-3 py-2 text-right">Price</th><th className="px-3 py-2 text-right">GCI</th><th className="px-3 py-2 text-right">Open</th></TableHead><tbody className="divide-y">{underContractRows.slice(0, 50).map((row: any) => <tr key={row.id} className="hover:bg-muted/30"><td className="px-3 py-3 font-medium">{row.transactionNumber}</td><td className="px-3 py-3">{row.contactName}</td><td className="px-3 py-3">{row.agentName}</td><td className="px-3 py-3">{dateLabel(row.expectedClosingDate ?? row.closingDate)}</td><td className="px-3 py-3 text-right">{money(row.purchasePrice)}</td><td className="px-3 py-3 text-right font-medium">{money(row.grossCommissionIncome)}</td><td className="px-3 py-3 text-right"><Button variant="ghost" size="sm" onClick={() => onTransactions({ status: "under_contract", dateMode: "none", agentId: row.agentId })}><ExternalLink className="h-3.5 w-3.5" /></Button></td></tr>)}</tbody></TableShell> : <EmptyState title="No under-contract transaction in this scope" description="Change the reporting filters or review the canonical Transactions page." />}</CardContent></Card>
  </div>;
}

function PerformanceDashboard({ workspace, onTransactions, navigate }: { workspace: any; onTransactions: (options?: TransactionLinkOptions) => void; navigate: (path: string) => void }) {
  const people = workspace.people ?? [];
  const teams = workspace.teamLeaders ?? [];
  const atRisk = people.filter((person: any) => Number(person.execution?.stalledPipeline) > 0 || Number(person.execution?.overdueTasks) > 0 || Number(person.production?.gciTrendPct) < -10);
  const goalCoverage = workspace.growth?.annualGoalCoverage ?? {};
  return <div className="space-y-6">
    <SectionHeader title="People, Teams & Goals" description="Compare production and trend with current pipeline, task execution, recorded activity, coaching, and goals. Flags prompt review; they do not establish cause or individual performance conclusions." />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="People in scope" value={integer(people.length)} note="Active, authorized people" icon={Users} accent="blue" />
      <MetricCard label="Needs review" value={integer(atRisk.length)} note="Stalled pipeline, overdue work, or negative GCI trend" icon={AlertTriangle} accent="rose" />
      <MetricCard label="Annual goal coverage" value={`${integer(goalCoverage.peopleWithAnnualGciTargets)} / ${integer(goalCoverage.activePeople)}`} note="People with an annual GCI target" icon={Target} accent="teal" />
      <MetricCard label="Recorded coaching follow-ups" value={integer(people.filter((person: any) => person.coaching?.nextFollowUpDate).length)} note="Future date on leadership feedback" icon={UserCheck} accent="violet" />
    </div>
    <Card><CardHeader><CardTitle className="text-base">Linked person scorecards</CardTitle><CardDescription>Production is selected-period closed flow. Activity and coaching represent SavvyOS records only, not all work performed or all leadership interactions.</CardDescription></CardHeader><CardContent>{people.length ? <TableShell><TableHead><th className="px-3 py-2 text-left">Person</th><th className="px-3 py-2 text-left">Market / role</th><th className="px-3 py-2 text-right">Closed GCI</th><th className="px-3 py-2 text-right">Trend</th><th className="px-3 py-2 text-right">Pipeline / work</th><th className="px-3 py-2 text-left">Coaching</th><th className="px-3 py-2 text-right">Open</th></TableHead><tbody className="divide-y">{people.map((person: any) => <tr key={person.userId} className="hover:bg-muted/30"><td className="px-3 py-3"><button className="font-medium text-primary hover:underline" onClick={() => navigate(`/agents/${person.userId}`)}>{person.name}</button><p className="text-xs text-muted-foreground">{person.title ?? ""}</p></td><td className="px-3 py-3"><p className="capitalize">{person.role}</p><p className="text-xs text-muted-foreground">{person.marketName ?? "No market"}</p></td><td className="px-3 py-3 text-right"><button className="font-medium text-primary hover:underline" onClick={() => onTransactions({ status: "closed", dateMode: "closing", agentId: person.userId })}>{money(person.production?.currentGci)}</button><p className="text-xs text-muted-foreground">{integer(person.production?.currentClosings)} closing(s)</p></td><td className="px-3 py-3 text-right"><TrendPill value={person.production?.gciTrendPct} /></td><td className="px-3 py-3 text-right"><p>{integer(person.execution?.activePipeline)} active</p><p className={`text-xs ${Number(person.execution?.stalledPipeline) || Number(person.execution?.overdueTasks) ? "text-rose-700" : "text-muted-foreground"}`}>{integer(person.execution?.stalledPipeline)} stalled · {integer(person.execution?.overdueTasks)} overdue</p></td><td className="px-3 py-3"><p>{dateLabel(person.coaching?.lastCoachingAt)}</p><p className="text-xs text-muted-foreground">{person.coaching?.lastCoachName ? `by ${person.coaching.lastCoachName}` : "No recorded coach"}</p></td><td className="px-3 py-3 text-right"><Button variant="ghost" size="sm" onClick={() => navigate(`/agents/${person.userId}`)}><ExternalLink className="h-3.5 w-3.5" /></Button></td></tr>)}</tbody></TableShell> : <EmptyState title="No people in this scope" description="The current role and filters do not return an active person scorecard." />}</CardContent></Card>
    <div className="grid gap-4 xl:grid-cols-2">
      <Card><CardHeader><CardTitle className="text-base">Team-leader rollups</CardTitle><CardDescription>Group output uses members in the authorized scope, not an inferred company-wide team unless the viewer has that scope.</CardDescription></CardHeader><CardContent>{teams.length ? <TableShell><TableHead><th className="px-3 py-2 text-left">Group / leader</th><th className="px-3 py-2 text-right">Members</th><th className="px-3 py-2 text-right">Closings</th><th className="px-3 py-2 text-right">Closed GCI</th><th className="px-3 py-2 text-right">Under contract</th></TableHead><tbody className="divide-y">{teams.map((team: any) => <tr key={team.groupId}><td className="px-3 py-3"><p className="font-medium">{team.groupName}</p><p className="text-xs text-muted-foreground">{team.leaderName}</p></td><td className="px-3 py-3 text-right">{integer(team.memberCount)}</td><td className="px-3 py-3 text-right">{integer(team.closings)}</td><td className="px-3 py-3 text-right font-medium">{money(team.gci)}</td><td className="px-3 py-3 text-right">{integer(team.underContractCount)}</td></tr>)}</tbody></TableShell> : <EmptyState title="No visible team rollup" description="A group requires recorded membership within the current authorized scope." />}</CardContent></Card>
      <Card><CardHeader><CardTitle className="text-base">Annual goal progress</CardTitle><CardDescription>Selected-period closed GCI against the stored annual target. This is progress, not a full-year forecast.</CardDescription></CardHeader><CardContent className="space-y-3">{(goalCoverage.attainment ?? []).length ? (goalCoverage.attainment ?? []).slice(0, 10).map((person: any) => <button key={person.userId} className="block w-full rounded-lg border p-3 text-left transition-colors hover:border-primary/40 hover:bg-muted/25" onClick={() => navigate(`/agents/${person.userId}`)}><div className="flex items-center justify-between gap-3"><div><p className="font-medium">{person.name}</p><p className="text-xs text-muted-foreground">Target {person.gciTarget === null ? "not set" : money(person.gciTarget)}</p></div><span className="font-semibold">{person.gciAttainment === null ? "—" : percent(person.gciAttainment)}</span></div><Progress className="mt-2 h-2" value={Math.max(0, Math.min(100, Number(person.gciAttainment ?? 0) * 100))} /></button>) : <EmptyState title="No annual goals recorded" description="Set stored annual goals to enable goal-coverage review." />}</CardContent></Card>
    </div>
  </div>;
}

function IsaDashboard({ workspace, navigate }: { workspace: any; navigate: (path: string) => void }) {
  const isa = workspace.isa ?? {};
  const books = isa.isaBooks ?? [];
  return <div className="space-y-6">
    <SectionHeader title="ISA & Lead Coverage" description="Lead-assignment coverage is measured from current contact records in the authorized scope. “Active” work reflects non-closed agent-connection stages, not an unsupported ISA-status field." />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Contacts in scope" value={integer(isa.totalContacts)} note="Contacts matching the selected scope" icon={Users} accent="blue" />
      <MetricCard label="ISA assignment coverage" value={percent(isa.assignmentCoverage)} note={`${integer(isa.assignedContacts)} assigned · ${integer(isa.unassignedContacts)} unassigned`} icon={UserCheck} accent="teal" />
      <MetricCard label="Unassigned contacts" value={integer(isa.unassignedContacts)} note="Review ownership before expected follow-up work is lost" icon={AlertTriangle} accent="rose" onClick={() => navigate("/contacts")} />
      <MetricCard label="Average contact age" value={isa.averageContactAgeDays === null || isa.averageContactAgeDays === undefined ? "—" : `${Math.round(Number(isa.averageContactAgeDays))}d`} note="Age since contact creation" icon={CalendarClock} accent="amber" />
    </div>
    <Card><CardHeader><CardTitle className="text-base">ISA book coverage</CardTitle><CardDescription>Use each ISA’s contact book as a workload review starting point. Contacts can have multiple agent connections, so active-pipeline counts are deduplicated by contact.</CardDescription></CardHeader><CardContent>{books.length ? <TableShell><TableHead><th className="px-3 py-2 text-left">ISA</th><th className="px-3 py-2 text-right">Assigned contacts</th><th className="px-3 py-2 text-right">Active pipeline contacts</th><th className="px-3 py-2 text-right">Overdue follow-ups</th><th className="px-3 py-2 text-right">Average contact age</th><th className="px-3 py-2 text-right">Open</th></TableHead><tbody className="divide-y">{books.map((book: any) => <tr key={book.isaId} className="hover:bg-muted/30"><td className="px-3 py-3"><button className="font-medium text-primary hover:underline" onClick={() => navigate(`/agents/${book.isaId}`)}>{book.isaName}</button></td><td className="px-3 py-3 text-right">{integer(book.assignedContacts)}</td><td className="px-3 py-3 text-right">{integer(book.activeContacts)}</td><td className={`px-3 py-3 text-right ${Number(book.overdueFollowUps) ? "font-semibold text-rose-700" : ""}`}>{integer(book.overdueFollowUps)}</td><td className="px-3 py-3 text-right">{book.averageContactAgeDays === null ? "—" : `${Math.round(Number(book.averageContactAgeDays))}d`}</td><td className="px-3 py-3 text-right"><Button variant="ghost" size="sm" onClick={() => navigate(`/agents/${book.isaId}`)}><ExternalLink className="h-3.5 w-3.5" /></Button></td></tr>)}</tbody></TableShell> : <EmptyState title="No ISA assignment book in this scope" description="Record ISA assignments on contacts to enable book-level coverage review." />}</CardContent></Card>
    <Card><CardHeader><CardTitle className="text-base">Operating note</CardTitle><CardDescription>Coverage answers whether contacts have an assigned ISA—not whether every lead has been contacted or whether a given ISA caused a production outcome.</CardDescription></CardHeader><CardContent><div className="rounded-lg border border-amber-100 bg-amber-50/50 p-4 text-sm leading-6 text-amber-950">Resolve unassigned contacts at the source and use the Pipeline & Follow-Up dashboard to manage dated commitments. Do not infer ISA conversion or appointment performance unless the required activity history is stored and verified.</div></CardContent></Card>
  </div>;
}

function MarketsDashboard({ workspace, onTransactions }: { workspace: any; onTransactions: (options?: TransactionLinkOptions) => void }) {
  const markets = workspace.markets ?? [];
  const chartData = markets.slice(0, 8).map((market: any) => ({ name: String(market.marketName ?? "Market").slice(0, 16), gci: Number(market.gci ?? 0), pipeline: Number(market.underContractGci ?? 0) }));
  return <div className="space-y-6">
    <SectionHeader title="Markets & Capacity" description="Market rollups use the same selected-period closed flow and current under-contract snapshot definitions as the executive dashboard. Capacity fields are current configuration signals, not demand forecasts." />
    {!markets.length ? <EmptyState title="No market performance is available in this scope" description="ISA viewers do not receive market rollups, and other viewers only see markets represented in their authorized scope." /> : <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Visible markets" value={integer(markets.length)} note="Markets in authorized scope" icon={MapPinned} accent="blue" />
        <MetricCard label="Markets with closed GCI" value={integer(markets.filter((market: any) => Number(market.gci) > 0).length)} note="Selected-period closed production" icon={DollarSign} accent="teal" />
        <MetricCard label="Available agents" value={integer(markets.reduce((sum: number, market: any) => sum + Number(market.availableAgents ?? 0), 0))} note="Current market-assignment availability" icon={Users} accent="violet" />
        <MetricCard label="Active pipeline" value={integer(markets.reduce((sum: number, market: any) => sum + Number(market.activePipeline ?? 0), 0))} note="Current non-closed connection records" icon={Activity} accent="amber" />
      </div>
      <div className="grid gap-4 xl:grid-cols-2"><Card><CardHeader><CardTitle className="text-base">Closed GCI and under-contract GCI by market</CardTitle><CardDescription>Closed GCI is period flow; under-contract GCI is a current snapshot and should not be added to closed results.</CardDescription></CardHeader><CardContent><ResponsiveContainer width="100%" height={320}><BarChart data={chartData}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} /><YAxis tickFormatter={(value) => money(value, true)} tick={{ fontSize: 10 }} /><Tooltip formatter={(value: number) => money(value)} /><Bar dataKey="gci" name="Closed GCI" fill="#0f766e" radius={[4, 4, 0, 0]} /><Bar dataKey="pipeline" name="Under-contract GCI" fill="#93c5fd" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></CardContent></Card><Card><CardHeader><CardTitle className="text-base">Capacity interpretation</CardTitle><CardDescription>Only use capacity utilization where max lead capacity is configured.</CardDescription></CardHeader><CardContent className="space-y-3">{markets.slice(0, 6).map((market: any) => <div key={market.marketId} className="rounded-lg border p-3"><div className="flex items-center justify-between gap-3"><div><p className="font-medium">{market.marketName}</p><p className="text-xs text-muted-foreground">{integer(market.availableAgents)} available of {integer(market.assignedAgents)} assigned</p></div><span className="font-semibold">{market.capacityUtilization === null ? "—" : percent(market.capacityUtilization)}</span></div><Progress className="mt-2 h-2" value={Math.max(0, Math.min(100, Number(market.capacityUtilization ?? 0) * 100))} /></div>)}</CardContent></Card></div>
      <Card><CardHeader><CardTitle className="text-base">Market performance register</CardTitle><CardDescription>Open a scoped transaction register for production evidence. Goal progress is selected-period GCI versus the stored annual market goal and is not a year-end forecast.</CardDescription></CardHeader><CardContent><TableShell><TableHead><th className="px-3 py-2 text-left">Market</th><th className="px-3 py-2 text-right">Closings</th><th className="px-3 py-2 text-right">Closed GCI</th><th className="px-3 py-2 text-right">Goal progress</th><th className="px-3 py-2 text-right">Under contract</th><th className="px-3 py-2 text-right">Capacity</th><th className="px-3 py-2 text-right">Open</th></TableHead><tbody className="divide-y">{markets.map((market: any) => <tr key={market.marketId} className="hover:bg-muted/30"><td className="px-3 py-3"><p className="font-medium">{market.marketName}</p><p className="text-xs text-muted-foreground">{[market.state, market.region].filter(Boolean).join(" · ") || "—"}</p></td><td className="px-3 py-3 text-right">{integer(market.closings)}</td><td className="px-3 py-3 text-right"><button className="font-medium text-primary hover:underline" onClick={() => onTransactions({ status: "closed", dateMode: "closing", marketId: market.marketId })}>{money(market.gci)}</button></td><td className="px-3 py-3 text-right">{market.goalAttainment === null ? "—" : percent(market.goalAttainment)}</td><td className="px-3 py-3 text-right">{integer(market.underContractCount)}</td><td className="px-3 py-3 text-right">{market.capacityUtilization === null ? "—" : percent(market.capacityUtilization)}</td><td className="px-3 py-3 text-right"><Button variant="ghost" size="sm" onClick={() => onTransactions({ status: "closed", dateMode: "closing", marketId: market.marketId })}><ExternalLink className="h-3.5 w-3.5" /></Button></td></tr>)}</tbody></TableShell></CardContent></Card>
    </>}
  </div>;
}

function SourcesDashboard({ workspace, onTransactions }: { workspace: any; onTransactions: (options?: TransactionLinkOptions) => void }) {
  const sources = workspace.sources ?? [];
  const totalLeads = sources.reduce((sum: number, source: any) => sum + Number(source.leadCount ?? 0), 0);
  const totalGci = sources.reduce((sum: number, source: any) => sum + Number(source.gci ?? 0), 0);
  const chartData = sources.slice(0, 8).map((source: any) => ({ name: String(source.sourceName ?? "Unknown").slice(0, 18), gci: Number(source.gci ?? 0), leads: Number(source.leadCount ?? 0) }));
  const missingSource = workspace.dataQuality?.issues?.find((issue: any) => issue.key === "missingSource")?.count ?? 0;
  return <div className="space-y-6">
    <SectionHeader title="Sources & Partnerships" description="Compare observed contacts and closed outcomes with the selected date context. This page does not claim marketing ROI because SavvyOS does not store spend and validated cohort attribution necessary for that calculation." />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Attributed leads" value={integer(totalLeads)} note="Contacts created in the selected period" icon={Users} accent="blue" />
      <MetricCard label="Observed closed GCI" value={money(totalGci, true)} note="Closed transactions in the selected period" icon={DollarSign} accent="teal" />
      <MetricCard label="Sources with closings" value={integer(sources.filter((source: any) => Number(source.closings) > 0).length)} note="At least one observed closed transaction" icon={CheckCircle2} accent="violet" />
      <MetricCard label="Missing source attribution" value={integer(missingSource)} note="Limits source-level interpretation" icon={AlertTriangle} accent="amber" />
    </div>
    <div className="grid gap-4 xl:grid-cols-3"><Card className="xl:col-span-2"><CardHeader><CardTitle className="text-base">Top sources by observed closed GCI</CardTitle><CardDescription>Closed outcome value, not a return-on-ad-spend measure.</CardDescription></CardHeader><CardContent>{chartData.length ? <ResponsiveContainer width="100%" height={300}><BarChart data={chartData} layout="vertical" margin={{ left: 12 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" tickFormatter={(value) => money(value, true)} tick={{ fontSize: 10 }} /><YAxis dataKey="name" type="category" width={130} tick={{ fontSize: 10 }} /><Tooltip formatter={(value: number) => money(value)} /><Bar dataKey="gci" name="Closed GCI" fill="#2563eb" radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer> : <EmptyState title="No source outcomes in this scope" description="Source rows appear when contacts and closed transactions include attribution." />}</CardContent></Card><Card><CardHeader><CardTitle className="text-base">Timing limitation</CardTitle><CardDescription>Use these measures as observed yield only.</CardDescription></CardHeader><CardContent><p className="rounded-lg border border-amber-100 bg-amber-50/50 p-3 text-sm leading-6 text-amber-950">The numerator is selected-period closings while the denominator is selected-period created leads. Those records are not a cohort match. A close yield is shown with this limitation rather than being presented as a conversion claim.</p></CardContent></Card></div>
    <Card><CardHeader><CardTitle className="text-base">Source outcome register</CardTitle><CardDescription>Select a source to open the canonical Transactions page with its source filter and the current reporting period.</CardDescription></CardHeader><CardContent>{sources.length ? <TableShell><TableHead><th className="px-3 py-2 text-left">Source</th><th className="px-3 py-2 text-left">Parent</th><th className="px-3 py-2 text-right">Leads</th><th className="px-3 py-2 text-right">Closings</th><th className="px-3 py-2 text-right">Closed GCI</th><th className="px-3 py-2 text-right">GCI / lead</th><th className="px-3 py-2 text-right">Observed yield</th><th className="px-3 py-2 text-right">Open</th></TableHead><tbody className="divide-y">{sources.map((source: any) => <tr key={source.sourceId ?? source.sourceName} className="hover:bg-muted/30"><td className="px-3 py-3"><p className="font-medium">{source.sourceName}</p><p className="mt-0.5 max-w-sm text-xs text-muted-foreground">{source.metricWarning}</p></td><td className="px-3 py-3 text-muted-foreground">{source.parentSourceName ?? "—"}</td><td className="px-3 py-3 text-right">{integer(source.leadCount)}</td><td className="px-3 py-3 text-right">{integer(source.closings)}</td><td className="px-3 py-3 text-right"><button className="font-medium text-primary hover:underline" onClick={() => onTransactions({ status: "closed", dateMode: "closing", leadSourceId: source.sourceId })}>{money(source.gci)}</button></td><td className="px-3 py-3 text-right">{source.revenuePerLead === null ? "—" : money(source.revenuePerLead)}</td><td className="px-3 py-3 text-right">{source.observedCloseYield === null ? "—" : percent(source.observedCloseYield)}</td><td className="px-3 py-3 text-right"><Button variant="ghost" size="sm" disabled={!source.sourceId} onClick={() => onTransactions({ status: "closed", dateMode: "closing", leadSourceId: source.sourceId })}><ExternalLink className="h-3.5 w-3.5" /></Button></td></tr>)}</tbody></TableShell> : <EmptyState title="No sources match the selection" description="Add source attribution to contacts and transactions to support source-outcome review." />}</CardContent></Card>
  </div>;
}

function OperationsDashboard({ workspace, navigate }: { workspace: any; navigate: (path: string) => void }) {
  const pipeline = workspace.pipeline ?? {};
  const funnel = pipeline.funnel ?? [];
  const pieData = funnel.filter((stage: any) => Number(stage.count) > 0);
  const actionRows = uniqueRows([...(pipeline.staleRecords ?? []), ...(pipeline.overdueFollowUps ?? [])], "connectionId").slice(0, 100);
  const overdueTasks = (workspace.tasks?.overdue ?? []).slice(0, 30);
  return <div className="space-y-6">
    <SectionHeader title="Pipeline & Follow-Up" description="An operating queue for current execution. Open the underlying contact or task and establish ownership and a dated next step; current stage counts are not historical conversion rates." />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Active pipeline" value={integer(pipeline.activeCount)} note="Excludes closed and dead stages" icon={Activity} accent="blue" onClick={() => navigate("/contacts")} />
      <MetricCard label="Stalled 14+ days" value={integer(pipeline.stalledCount)} note="No qualifying activity since aging date" icon={AlertTriangle} accent="rose" onClick={() => navigate("/contacts")} />
      <MetricCard label="Overdue follow-ups" value={integer(pipeline.overdueFollowUpCount)} note="Recorded follow-up date is past due" icon={CalendarClock} accent="amber" onClick={() => navigate("/contacts")} />
      <MetricCard label="Overdue tasks" value={integer(workspace.tasks?.overdueCount)} note="Separate explicit work commitments" icon={ClipboardCheck} accent="rose" onClick={() => navigate("/tasks")} />
    </div>
    <div className="grid gap-4 xl:grid-cols-2"><Card><CardHeader><CardTitle className="text-base">Pipeline by current stage</CardTitle><CardDescription>Current record distribution, not stage-to-stage conversion or time-to-convert.</CardDescription></CardHeader><CardContent>{funnel.length ? <ResponsiveContainer width="100%" height={300}><BarChart data={funnel}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" tick={{ fontSize: 10 }} interval={0} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey="count" name="Current records" radius={[4, 4, 0, 0]}>{funnel.map((stage: any) => <Cell key={stage.stage} fill={PIPELINE_COLORS[stage.stage] ?? "#64748b"} />)}</Bar></BarChart></ResponsiveContainer> : <EmptyState title="No pipeline records in this scope" description="No active or historical connection record matches the selected filters." />}</CardContent></Card><Card><CardHeader><CardTitle className="text-base">Current stage mix</CardTitle><CardDescription>Use with the action queue to identify where work is concentrating.</CardDescription></CardHeader><CardContent>{pieData.length ? <ResponsiveContainer width="100%" height={300}><PieChart><Pie data={pieData} dataKey="count" nameKey="label" outerRadius={92} label={({ label, percent: share }) => `${label} ${(share * 100).toFixed(0)}%`}>{pieData.map((stage: any) => <Cell key={stage.stage} fill={PIPELINE_COLORS[stage.stage] ?? "#64748b"} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer> : <EmptyState title="No active-stage mix" description="No current pipeline connection matches the selection." />}</CardContent></Card></div>
    <Card><CardHeader><CardTitle className="text-base">Immediate pipeline action queue</CardTitle><CardDescription>Records are intentionally not summarized away. Open the contact to resolve the exact follow-up or inactivity gap.</CardDescription></CardHeader><CardContent>{actionRows.length ? <TableShell><TableHead><th className="px-3 py-2 text-left">Contact</th><th className="px-3 py-2 text-left">Agent</th><th className="px-3 py-2 text-left">Stage</th><th className="px-3 py-2 text-right">Idle days</th><th className="px-3 py-2 text-left">Follow-up</th><th className="px-3 py-2 text-left">Risk</th><th className="px-3 py-2 text-right">Open</th></TableHead><tbody className="divide-y">{actionRows.map((record: any) => <tr key={record.connectionId} className="hover:bg-muted/30"><td className="px-3 py-3"><button className="font-medium text-primary hover:underline" onClick={() => navigate(`/contacts/${record.contactId}`)}>{record.contactName}</button><p className="text-xs text-muted-foreground">{record.sourceName ?? "No source"}</p></td><td className="px-3 py-3">{record.agentName}</td><td className="px-3 py-3"><Badge variant="secondary">{record.stageLabel}</Badge></td><td className="px-3 py-3 text-right">{integer(record.ageDays)}</td><td className="px-3 py-3">{dateLabel(record.followUpDate)}</td><td className="px-3 py-3"><Badge variant={Number(record.ageDays) >= 14 ? "destructive" : "secondary"}>{Number(record.ageDays) >= 14 ? "Stalled" : "Follow-up overdue"}</Badge></td><td className="px-3 py-3 text-right"><Button variant="ghost" size="sm" onClick={() => navigate(`/contacts/${record.contactId}`)}><ExternalLink className="h-3.5 w-3.5" /></Button></td></tr>)}</tbody></TableShell> : <EmptyState title="No current pipeline exception" description="Continue recording dated follow-ups so future exceptions can be surfaced." />}</CardContent></Card>
    <Card><CardHeader><CardTitle className="text-base">Overdue task queue</CardTitle><CardDescription>Tasks are explicit commitments. Their absence or age should not be treated as a complete measure of effort.</CardDescription></CardHeader><CardContent>{overdueTasks.length ? <TableShell><TableHead><th className="px-3 py-2 text-left">Task</th><th className="px-3 py-2 text-left">Assignee</th><th className="px-3 py-2 text-left">Due</th><th className="px-3 py-2 text-left">Related record</th><th className="px-3 py-2 text-right">Open</th></TableHead><tbody className="divide-y">{overdueTasks.map((task: any) => <tr key={task.id} className="hover:bg-muted/30"><td className="px-3 py-3 font-medium">{task.title}</td><td className="px-3 py-3">{task.assigneeName}</td><td className="px-3 py-3">{dateLabel(task.dueDate)}</td><td className="px-3 py-3">{task.contactId ? <button className="text-primary hover:underline" onClick={() => navigate(`/contacts/${task.contactId}`)}>{task.contactName}</button> : task.transactionNumber ?? "—"}</td><td className="px-3 py-3 text-right"><Button variant="ghost" size="sm" onClick={() => navigate(`/tasks/${task.id}`)}><ExternalLink className="h-3.5 w-3.5" /></Button></td></tr>)}</tbody></TableShell> : <EmptyState title="No overdue task in this scope" description="Maintain task due dates and ownership to preserve a reliable operating queue." />}</CardContent></Card>
  </div>;
}

function TrustDashboard({ workspace, onTransactions, onNavigate }: { workspace: any; onTransactions: (options?: TransactionLinkOptions) => void; onNavigate: (view: ViewId) => void }) {
  const issues = workspace.dataQuality?.issues ?? [];
  const severityClass: Record<string, string> = { high: "bg-rose-50 text-rose-700 border-rose-100", medium: "bg-amber-50 text-amber-700 border-amber-100", low: "bg-blue-50 text-blue-700 border-blue-100" };
  const financialFlags = issues.filter((issue: any) => ["missingGci", "payoutIntegrityFlags", "missingPayouts"].includes(issue.key)).reduce((sum: number, issue: any) => sum + Number(issue.count ?? 0), 0);
  const attributionGaps = issues.filter((issue: any) => ["missingSource", "missingContactMethod"].includes(issue.key)).reduce((sum: number, issue: any) => sum + Number(issue.count ?? 0), 0);
  const executionGaps = issues.filter((issue: any) => ["stalePipeline", "overdueTasks"].includes(issue.key)).reduce((sum: number, issue: any) => sum + Number(issue.count ?? 0), 0);
  const resolveIssue = (issue: any) => {
    if (issue.drilldown === "transactions") onTransactions({ dateMode: "closing" });
    else if (issue.drilldown === "pipeline" || issue.drilldown === "tasks") onNavigate("operations");
    else if (issue.drilldown === "people") onNavigate("performance");
    else if (issue.drilldown === "sources") onNavigate("sources");
  };
  return <div className="space-y-6">
    <SectionHeader title="Data Trust & Administration" description="Reporting confidence depends on data completeness and operating hygiene. The exception register names current detected gaps and routes users back to the source workflow for repair." />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Surfaced exceptions" value={integer(workspace.dataQuality?.total)} note="Current quality and execution exceptions" icon={Database} accent="amber" />
      <MetricCard label="Financial integrity flags" value={integer(financialFlags)} note="May affect financial interpretation" icon={Wallet} accent="rose" onClick={() => onTransactions({ dateMode: "closing" })} />
      <MetricCard label="Attribution gaps" value={integer(attributionGaps)} note="Limits source-level analysis" icon={Landmark} accent="amber" onClick={() => onNavigate("sources")} />
      <MetricCard label="Execution gaps" value={integer(executionGaps)} note="Priority operating work" icon={Activity} accent="blue" onClick={() => onNavigate("operations")} />
    </div>
    <Card><CardHeader><CardTitle className="text-base">Exception register and repair priorities</CardTitle><CardDescription>Click an exception to open the appropriate dashboard or source records. A zero count is absence of this detector’s signal—not proof of complete data.</CardDescription></CardHeader><CardContent>{issues.length ? <div className="divide-y rounded-lg border">{issues.map((issue: any) => <button key={issue.key} className="flex w-full items-center gap-4 p-4 text-left transition-colors hover:bg-muted/30" onClick={() => resolveIssue(issue)}><span className={`rounded-lg border px-2 py-1 text-xs font-semibold capitalize ${severityClass[issue.severity] ?? severityClass.low}`}>{issue.severity}</span><div className="min-w-0 flex-1"><p className="font-medium">{issue.label}</p><p className="mt-0.5 text-xs text-muted-foreground">{issue.count > 0 ? "Open the related operating source and repair the underlying record or workflow." : "No current exception detected in this scope."}</p></div><span className="text-xl font-semibold">{integer(issue.count)}</span><ChevronRight className="h-4 w-4 text-primary" /></button>)}</div> : <EmptyState title="No quality exception surfaced" description="Continue reviewing data coverage; reporting confidence depends on complete source workflows." />}</CardContent></Card>
    <Card><CardHeader><CardTitle className="text-base">Administrative definition note</CardTitle><CardDescription>Metrics in this workspace deliberately distinguish temporal flows from live snapshots.</CardDescription></CardHeader><CardContent><div className="grid gap-3 md:grid-cols-3 text-sm"><div className="rounded-lg border bg-muted/20 p-3"><p className="font-medium">Closed production</p><p className="mt-1 text-muted-foreground">Closing-date flow inside the selected date range.</p></div><div className="rounded-lg border bg-muted/20 p-3"><p className="font-medium">Under contract</p><p className="mt-1 text-muted-foreground">Current inventory snapshot, not historical contract volume.</p></div><div className="rounded-lg border bg-muted/20 p-3"><p className="font-medium">Source yield</p><p className="mt-1 text-muted-foreground">Observed period metrics, not cohort conversion or ROI.</p></div></div></CardContent></Card>
  </div>;
}

export default function AnalyticsPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const isAdmin = user?.role === "admin";
  const [view, setView] = useState<ViewId>("executive");
  const [rangePreset, setRangePreset] = useState("ytd");
  const [dateFrom, setDateFrom] = useState(() => resolvePreset("ytd").dateFrom);
  const [dateTo, setDateTo] = useState(() => resolvePreset("ytd").dateTo);
  const [agentId, setAgentId] = useState("all");
  const [marketId, setMarketId] = useState("all");
  const [leadSourceId, setLeadSourceId] = useState("all");
  const [status, setStatus] = useState<"all" | "closed" | "under_contract" | "terminated">("all");
  const autoInsightScopes = useRef(new Set<string>());

  const queryInput = useMemo(() => ({
    dateFrom: dateFrom ? new Date(`${dateFrom}T00:00:00`).toISOString() : undefined,
    dateTo: dateTo ? new Date(`${dateTo}T23:59:59.999`).toISOString() : undefined,
    agentId: agentId === "all" ? undefined : Number(agentId),
    marketProfileId: marketId === "all" ? undefined : Number(marketId),
    leadSourceId: leadSourceId === "all" ? undefined : Number(leadSourceId),
    status,
  }), [agentId, dateFrom, dateTo, leadSourceId, marketId, status]);

  const workspaceQuery = trpc.analytics.workspace.useQuery(queryInput, { refetchInterval: 60_000, staleTime: 30_000 });
  const insightsQuery = trpc.analytics.workspaceInsights.useQuery(queryInput, { refetchInterval: 300_000, staleTime: 60_000 });
  const refreshInsight = trpc.analytics.refreshWorkspaceInsights.useMutation({
    onSuccess: () => utils.analytics.workspaceInsights.invalidate(queryInput),
  });
  const workspace = workspaceQuery.data as any;
  const canRefreshInsights = Boolean(workspace?.scope?.canRefreshInsights);
  const insightScopeKey = useMemo(() => JSON.stringify(queryInput), [queryInput]);

  useEffect(() => {
    const cached = insightsQuery.data as any;
    const hasCachedBrief = Boolean(cached?.insights?.length);
    if (!canRefreshInsights || workspaceQuery.isLoading || insightsQuery.isLoading || refreshInsight.isPending || hasCachedBrief || autoInsightScopes.current.has(insightScopeKey)) return;
    autoInsightScopes.current.add(insightScopeKey);
    refreshInsight.mutate({ ...queryInput, force: false });
  }, [canRefreshInsights, insightScopeKey, insightsQuery.data, insightsQuery.isLoading, queryInput, refreshInsight, workspaceQuery.isLoading]);

  const activeNav = NAVIGATION.find((item) => item.id === view) ?? NAVIGATION[0];
  const onPresetChange = (next: string) => {
    setRangePreset(next);
    if (next !== "custom") {
      const range = resolvePreset(next);
      setDateFrom(range.dateFrom);
      setDateTo(range.dateTo);
    }
  };
  const resetFilters = () => {
    const range = resolvePreset("ytd");
    setRangePreset("ytd");
    setDateFrom(range.dateFrom);
    setDateTo(range.dateTo);
    setAgentId("all");
    setMarketId("all");
    setLeadSourceId("all");
    setStatus("all");
  };
  const openTransactions = (options: TransactionLinkOptions = {}) => {
    const params = new URLSearchParams({ analytics: "1", status: options.status ?? status });
    const effectiveAgentId = options.agentId ?? (agentId === "all" ? null : Number(agentId));
    const effectiveMarketId = options.marketId ?? (marketId === "all" ? null : Number(marketId));
    const effectiveLeadSourceId = options.leadSourceId ?? (leadSourceId === "all" ? null : Number(leadSourceId));
    if (effectiveAgentId) params.set("agentId", String(effectiveAgentId));
    if (effectiveMarketId) params.set("marketId", String(effectiveMarketId));
    if (effectiveLeadSourceId) params.set("leadSourceId", String(effectiveLeadSourceId));
    const dateMode = options.dateMode ?? "closing";
    if (dateMode === "closing") {
      if (dateFrom) params.set("closingDateFrom", dateFrom);
      if (dateTo) params.set("closingDateTo", dateTo);
    } else if (dateMode === "contract") {
      if (dateFrom) params.set("contractDateFrom", dateFrom);
      if (dateTo) params.set("contractDateTo", dateTo);
    }
    navigate(`/transactions?${params.toString()}`);
  };
  const renderView = () => {
    const props = { workspace, onTransactions: openTransactions, navigate };
    if (view === "executive") return <ExecutiveDashboard workspace={workspace} insights={insightsQuery.data} onTransactions={openTransactions} onNavigate={setView} canRefreshInsights={canRefreshInsights} forceRefreshAllowed={isAdmin} refreshing={refreshInsight.isPending} onRefresh={() => refreshInsight.mutate({ ...queryInput, force: isAdmin })} />;
    if (view === "forecast") return <ForecastDashboard workspace={workspace} onTransactions={openTransactions} />;
    if (view === "performance") return <PerformanceDashboard {...props} />;
    if (view === "isa") return <IsaDashboard workspace={workspace} navigate={navigate} />;
    if (view === "markets") return <MarketsDashboard workspace={workspace} onTransactions={openTransactions} />;
    if (view === "sources") return <SourcesDashboard workspace={workspace} onTransactions={openTransactions} />;
    if (view === "operations") return <OperationsDashboard workspace={workspace} navigate={navigate} />;
    return <TrustDashboard workspace={workspace} onTransactions={openTransactions} onNavigate={setView} />;
  };

  return <div className="space-y-5">
    <PageHeader title="Analytics & Reporting" subtitle="Decision-grade reporting with explicit metric definitions, scope-aware access, and direct paths to the operational source records." />
    <Card className="border-primary/15"><CardContent className="p-4"><div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between"><div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"><div className="space-y-1"><Label className="text-xs">Reporting period</Label><Select value={rangePreset} onValueChange={onPresetChange}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ytd">Year to date</SelectItem><SelectItem value="last30">Last 30 days</SelectItem><SelectItem value="last90">Last 90 days</SelectItem><SelectItem value="last12">Last 12 months</SelectItem><SelectItem value="all">All history</SelectItem><SelectItem value="custom">Custom dates</SelectItem></SelectContent></Select></div><div className="space-y-1"><Label className="text-xs">From</Label><Input type="date" value={dateFrom} onChange={(event) => { setRangePreset("custom"); setDateFrom(event.target.value); }} className="h-9" /></div><div className="space-y-1"><Label className="text-xs">To</Label><Input type="date" value={dateTo} onChange={(event) => { setRangePreset("custom"); setDateTo(event.target.value); }} className="h-9" /></div><div className="space-y-1"><Label className="text-xs">Person</Label><SearchableSelect className="h-9 w-full" options={[{ value: "all", label: "All visible people" }, ...(workspace?.availableFilters?.agents ?? []).map((a: any) => ({ value: String(a.id), label: a.name }))]} value={agentId} onValueChange={setAgentId} placeholder="All visible people" searchPlaceholder="Search people…" /></div><div className="space-y-1"><Label className="text-xs">Market</Label><SearchableSelect className="h-9 w-full" options={[{ value: "all", label: "All visible markets" }, ...(workspace?.availableFilters?.markets ?? []).map((m: any) => ({ value: String(m.id), label: m.name }))]} value={marketId} onValueChange={setMarketId} placeholder="All visible markets" searchPlaceholder="Search markets…" disabled={!isAdmin} /></div><div className="space-y-1"><Label className="text-xs">Source / status</Label><div className="flex gap-1"><SearchableSelect className="h-9 min-w-0 flex-1" options={[{ value: "all", label: "All sources" }, ...(workspace?.availableFilters?.sources ?? []).map((s: any) => ({ value: String(s.id), label: s.name }))]} value={leadSourceId} onValueChange={setLeadSourceId} placeholder="Source" searchPlaceholder="Search sources…" /><Select value={status} onValueChange={(value) => setStatus(value as typeof status)}><SelectTrigger className="h-9 w-[112px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All</SelectItem><SelectItem value="closed">Closed</SelectItem><SelectItem value="under_contract">Under contract</SelectItem><SelectItem value="terminated">Terminated</SelectItem></SelectContent></Select></div></div></div><Button variant="outline" className="self-start xl:self-auto" onClick={resetFilters}><Filter className="mr-1.5 h-4 w-4" />Reset</Button></div><p className="mt-3 text-xs text-muted-foreground">{workspace?.scope?.label ?? "Loading authorized scope…"} · Filters narrow your authorized scope; they never expand access. Finance detail is role-gated.</p></CardContent></Card>
    {workspaceQuery.isLoading ? <div className="grid min-h-80 place-items-center rounded-xl border bg-muted/20"><div className="text-center"><RefreshCw className="mx-auto h-6 w-6 animate-spin text-primary" /><p className="mt-3 text-sm text-muted-foreground">Building the connected analytics workspace…</p></div></div> : workspaceQuery.error ? <Card className="border-rose-200"><CardContent className="p-6"><div className="flex gap-3"><AlertTriangle className="h-5 w-5 text-rose-600" /><div><p className="font-semibold">Analytics workspace could not be loaded.</p><p className="mt-1 text-sm text-muted-foreground">{workspaceQuery.error.message}</p><Button className="mt-3" size="sm" onClick={() => workspaceQuery.refetch()}>Try again</Button></div></div></CardContent></Card> : workspace && <div className="flex flex-col gap-5 2xl:flex-row"><aside className="2xl:w-64 2xl:shrink-0"><nav className="grid gap-1 sm:grid-cols-2 lg:grid-cols-4 2xl:block">{NAVIGATION.map((item) => { const Icon = item.icon; const active = item.id === view; return <button key={item.id} onClick={() => setView(item.id)} className={`rounded-lg p-3 text-left transition-colors 2xl:mb-1 2xl:w-full ${active ? "bg-primary text-primary-foreground shadow-sm" : "hover:bg-muted"}`}><div className="flex items-center gap-2"><Icon className="h-4 w-4" /><span className="text-sm font-medium">{item.shortLabel}</span></div><p className={`mt-1 hidden text-xs leading-4 2xl:block ${active ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{item.description}</p></button>; })}</nav></aside><main className="min-w-0 flex-1"><div className="mb-5 border-b pb-4"><div className="flex items-start gap-3"><span className="rounded-lg bg-primary/10 p-2 text-primary"><activeNav.icon className="h-5 w-5" /></span><div><h1 className="text-xl font-semibold tracking-tight">{activeNav.label}</h1><p className="mt-1 text-sm text-muted-foreground">{activeNav.description}</p></div></div></div>{renderView()}</main></div>}
  </div>;
}
