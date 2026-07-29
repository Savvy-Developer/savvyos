import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
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
import {
  IsaActivitiesReport,
  LeadSourcesReport,
  MarketAnalyticsReport,
  OnboardingReport,
  TasksReport,
} from "./ReportingExpansionViews";
import PageHeader from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

type ReportKind = "agents" | "leaders" | "transactions" | "onboarding" | "markets" | "tasks" | "isa" | "sources";

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

function titleCase(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

function buildTransactionUrl(filters: Record<string, unknown>, patch: Record<string, string | undefined> = {}) {
  const params = new URLSearchParams();
  if (filters.agentId) params.set("agentId", String(filters.agentId));
  if (filters.transactionType && filters.transactionType !== "all") params.set("transactionType", String(filters.transactionType));
  if (filters.status && filters.status !== "all") params.set("status", String(filters.status));
  const dateFrom = typeof filters.dateFrom === "string" ? filters.dateFrom : undefined;
  const dateTo = typeof filters.dateTo === "string" ? filters.dateTo : undefined;
  if (filters.dateBasis === "contract") {
    if (dateFrom) params.set("contractDateFrom", dateFrom);
    if (dateTo) params.set("contractDateTo", dateTo);
  } else {
    if (dateFrom) params.set("closingDateFrom", dateFrom);
    if (dateTo) params.set("closingDateTo", dateTo);
  }
  Object.entries(patch).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return `/transactions?${params.toString()}`;
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
  const today = localDay(new Date());
  const selectedAgent = params.get("agentId") ?? "all";
  const selectedLeader = params.get("groupLeaderId") ?? "all";
  const selectedStatus = params.get("status") ?? "all";
  const selectedType = params.get("transactionType") ?? "all";
  const selectedMarket = params.get("marketProfileId") ?? "all";
  const selectedIsa = params.get("isaId") ?? "all";
  const selectedLeadSource = params.get("leadSourceId") ?? "all";
  const dateBasis = params.get("dateBasis") ?? "closing";
  const isTransaction = activeReport === "transactions";
  const isMarket = activeReport === "markets";
  const isIsa = activeReport === "isa";
  const isSource = activeReport === "sources";

  return <Card className="border-primary/15 shadow-sm"><CardContent className="p-4"><div className="flex flex-col gap-4"><div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold">Report scope</p><p className="text-xs text-muted-foreground">Filters persist in the link and update every metric, chart, and evidence queue.</p></div><Button variant="ghost" size="sm" onClick={() => update({ from: startOfYear(), to: today, agentId: null, groupLeaderId: null, marketProfileId: null, isaId: null, leadSourceId: null, status: "all", transactionType: "all", dateBasis: "closing", page: null })}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Reset scope</Button></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"><div className="space-y-1.5"><Label htmlFor="report-from" className="text-xs">From</Label><Input id="report-from" type="date" value={params.get("from") ?? startOfYear()} onChange={(event) => update({ from: event.target.value, page: null })} /></div><div className="space-y-1.5"><Label htmlFor="report-to" className="text-xs">To</Label><Input id="report-to" type="date" value={params.get("to") ?? today} onChange={(event) => update({ to: event.target.value, page: null })} /></div>{isTransaction && <div className="space-y-1.5"><Label className="text-xs">Date basis</Label><Select value={dateBasis} onValueChange={(value) => update({ dateBasis: value, page: null })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="closing">Closing date</SelectItem><SelectItem value="contract">Contract date</SelectItem></SelectContent></Select></div>}<div className="space-y-1.5"><Label className="text-xs">Agent</Label><Select value={selectedAgent} onValueChange={(value) => update({ agentId: value === "all" ? null : value, page: null })}><SelectTrigger><SelectValue placeholder="All agents" /></SelectTrigger><SelectContent><SelectItem value="all">All agents</SelectItem>{(filters?.agents ?? []).map((agent: any) => <SelectItem key={agent.id} value={String(agent.id)}>{agent.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label className="text-xs">Group leader</Label><Select value={selectedLeader} onValueChange={(value) => update({ groupLeaderId: value === "all" ? null : value, page: null })}><SelectTrigger><SelectValue placeholder="All group leaders" /></SelectTrigger><SelectContent><SelectItem value="all">All group leaders</SelectItem>{(filters?.groupLeaders ?? []).map((leader: any) => <SelectItem key={leader.id} value={String(leader.id)}>{leader.name}</SelectItem>)}</SelectContent></Select></div>{isMarket && <div className="space-y-1.5"><Label className="text-xs">Market</Label><Select value={selectedMarket} onValueChange={(value) => update({ marketProfileId: value === "all" ? null : value, page: null })}><SelectTrigger><SelectValue placeholder="All markets" /></SelectTrigger><SelectContent><SelectItem value="all">All markets</SelectItem>{(filters?.markets ?? []).map((market: any) => <SelectItem key={market.id} value={String(market.id)}>{market.name}</SelectItem>)}</SelectContent></Select></div>}{isIsa && <div className="space-y-1.5"><Label className="text-xs">ISA owner</Label><Select value={selectedIsa} onValueChange={(value) => update({ isaId: value === "all" ? null : value, page: null })}><SelectTrigger><SelectValue placeholder="All ISA owners" /></SelectTrigger><SelectContent><SelectItem value="all">All ISA owners</SelectItem>{(filters?.isas ?? []).map((isa: any) => <SelectItem key={isa.id} value={String(isa.id)}>{isa.name}</SelectItem>)}</SelectContent></Select></div>}{isSource && <div className="space-y-1.5"><Label className="text-xs">Lead source</Label><Select value={selectedLeadSource} onValueChange={(value) => update({ leadSourceId: value === "all" ? null : value, page: null })}><SelectTrigger><SelectValue placeholder="All lead sources" /></SelectTrigger><SelectContent><SelectItem value="all">All lead sources</SelectItem>{(filters?.leadSources ?? []).map((source: any) => <SelectItem key={source.id} value={String(source.id)}>{source.name}</SelectItem>)}</SelectContent></Select></div>}{isTransaction && <><div className="space-y-1.5"><Label className="text-xs">Status</Label><Select value={selectedStatus} onValueChange={(value) => update({ status: value, page: null })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="closed">Closed</SelectItem><SelectItem value="under_contract">Under contract</SelectItem><SelectItem value="terminated">Terminated</SelectItem></SelectContent></Select></div><div className="space-y-1.5"><Label className="text-xs">Representation</Label><Select value={selectedType} onValueChange={(value) => update({ transactionType: value, page: null })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Buyer + seller + dual</SelectItem><SelectItem value="buyer">Buyer</SelectItem><SelectItem value="seller">Seller</SelectItem><SelectItem value="dual">Dual agency</SelectItem></SelectContent></Select></div></>}</div></div></CardContent></Card>;
}

function AgentReport({ data }: { data: any }) {
  const { production, change, flags, monthly, agents, flaggedTransactions, overdueTasks, filters } = data;
  return <div className="space-y-7"><section className="space-y-3"><SectionHeader title="Performance pulse" description="Closed production in the selected closing-date range, with a comparable prior period." /><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><MetricCard label="Closings" value={number(production.closings)} description="Closed transactions" delta={change.closings} icon={CheckCircle2} tone="text-emerald-700" /><MetricCard label="Volume" value={money(production.volume, true)} description="Closed purchase volume" delta={change.volume} icon={Landmark} tone="text-sky-700" /><MetricCard label="Gross commission" value={money(production.grossCommission, true)} description="Recorded transaction GCI" delta={change.grossCommission} icon={CircleDollarSign} tone="text-indigo-700" /><MetricCard label="Savvy net" value={money(production.savvyNet, true)} description="Recorded Savvy payout items" delta={change.savvyNet} icon={TrendingUp} tone="text-primary" /><MetricCard label="Avg. GCI" value={money(production.averageGci, true)} description="Per closed transaction" icon={BarChart3} tone="text-violet-700" /></div></section><section className="space-y-3"><SectionHeader title="Operational attention" description="Live operational risks are intentionally shown outside the closed-period production totals." /><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><FlagCard label="Overdue tasks" value={flags.overdueTasks} description="Open tasks past their due date" icon={ClipboardList} href="/tasks" tone="rose" /><FlagCard label="Commission flags" value={flags.commissionFlags} description="Transactions requiring payout review" icon={Flag} href={buildTransactionUrl(filters, { flagPayoutIntegrity: "true" })} tone="violet" /><FlagCard label="Past expected close" value={flags.pastExpectedCloseDate} description="Open deals past their close date" icon={CalendarClock} href={buildTransactionUrl(filters, { status: "under_contract", flagPastClosingDate: "true" })} tone="rose" /><FlagCard label="No expected close" value={flags.noExpectedCloseDate} description="Open deals missing a close date" icon={AlertTriangle} href={buildTransactionUrl(filters, { status: "under_contract", flagNoClosingDate: "true" })} tone="amber" /></div></section><section className="grid gap-5 xl:grid-cols-[1.45fr_0.95fr]"><Card><CardHeader><CardTitle className="text-base">Production momentum</CardTitle><CardDescription>Monthly closed volume and closings in the selected date range.</CardDescription></CardHeader><CardContent>{monthly.length ? <ResponsiveContainer width="100%" height={280}><ComposedChart data={monthly.map((row: any) => ({ ...row, label: monthLabel(row.month) }))} margin={{ left: 0, right: 12, top: 6, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} /><YAxis yAxisId="volume" tickFormatter={(value) => money(value, true)} tickLine={false} axisLine={false} width={62} fontSize={11} /><YAxis yAxisId="closings" orientation="right" tickLine={false} axisLine={false} width={26} fontSize={11} /><Tooltip formatter={(value: number, key: string) => key === "volume" ? money(value) : number(value)} labelFormatter={(label) => `Month: ${label}`} /><Legend /><Bar yAxisId="volume" dataKey="volume" name="Volume" fill="#1F6D5B" radius={[5, 5, 0, 0]} /><Line yAxisId="closings" type="monotone" dataKey="closings" name="Closings" stroke="#2563EB" strokeWidth={2.5} dot={{ r: 3 }} /></ComposedChart></ResponsiveContainer> : <ChartEmpty label="monthly production" />}</CardContent></Card><Card><CardHeader><CardTitle className="text-base">Financial contribution</CardTitle><CardDescription>Gross commission and recorded Savvy net by month.</CardDescription></CardHeader><CardContent>{monthly.length ? <ResponsiveContainer width="100%" height={280}><LineChart data={monthly.map((row: any) => ({ ...row, label: monthLabel(row.month) }))} margin={{ left: 0, right: 12, top: 6, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} /><YAxis tickFormatter={(value) => money(value, true)} tickLine={false} axisLine={false} width={62} fontSize={11} /><Tooltip formatter={(value: number) => money(value)} /><Legend /><Line type="monotone" dataKey="grossCommission" name="Gross commission" stroke="#4338CA" strokeWidth={2.5} dot={false} /><Line type="monotone" dataKey="savvyNet" name="Savvy net" stroke="#1F6D5B" strokeWidth={2.5} dot={false} /></LineChart></ResponsiveContainer> : <ChartEmpty label="monthly financial data" />}</CardContent></Card></section><section className="space-y-3"><SectionHeader title="Agent comparison" description="Ranked production and current follow-through signals for the selected scope." /><Card><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[1120px] text-sm"><thead><tr className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground"><th className="px-4 py-3 text-left font-semibold">Agent</th><th className="px-3 py-3 text-right font-semibold">Closings</th><th className="px-3 py-3 text-right font-semibold">Volume</th><th className="px-3 py-3 text-right font-semibold">Gross commission</th><th className="px-3 py-3 text-right font-semibold">Savvy net</th><th className="px-3 py-3 text-right font-semibold">UC</th><th className="px-3 py-3 text-right font-semibold">Overdue</th><th className="px-3 py-3 text-right font-semibold">Flags</th><th className="px-4 py-3" /></tr></thead><tbody>{agents.map((agent: any) => { const flagCount = agent.commissionFlags + agent.pastExpectedCloseDate + agent.noExpectedCloseDate; return <tr key={agent.agentId} className="border-b last:border-0 hover:bg-muted/25"><td className="px-4 py-3"><p className="font-medium">{agent.agentName}</p><p className="mt-0.5 text-xs text-muted-foreground">Avg. GCI {money(agent.averageGci, true)}</p></td><td className="px-3 py-3 text-right font-medium tabular-nums">{number(agent.closings)}</td><td className="px-3 py-3 text-right tabular-nums">{money(agent.volume, true)}</td><td className="px-3 py-3 text-right font-medium tabular-nums">{money(agent.grossCommission, true)}</td><td className="px-3 py-3 text-right tabular-nums">{money(agent.savvyNet, true)}</td><td className="px-3 py-3 text-right tabular-nums">{number(agent.underContract)}</td><td className="px-3 py-3 text-right tabular-nums">{agent.overdueTasks ? <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">{number(agent.overdueTasks)}</Badge> : "—"}</td><td className="px-3 py-3 text-right tabular-nums">{flagCount ? <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">{number(flagCount)}</Badge> : <CheckCircle2 className="ml-auto h-4 w-4 text-emerald-600" />}</td><td className="px-4 py-3 text-right"><a href={`/transactions?agentId=${agent.agentId}`} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">Records <ExternalLink className="h-3.5 w-3.5" /></a></td></tr>; })}</tbody></table></div></CardContent></Card></section><section className="grid gap-5 xl:grid-cols-2"><Card><CardHeader><CardTitle className="text-base">Flagged transactions</CardTitle><CardDescription>Prioritized current records needing an owner’s review.</CardDescription></CardHeader><CardContent className="space-y-2">{flaggedTransactions.length ? flaggedTransactions.map((tx: any) => <a key={tx.transactionId} href={`/transactions/${tx.transactionId}`} className="flex items-center justify-between gap-3 rounded-lg border p-3 transition hover:border-primary/35 hover:bg-muted/20"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-semibold">{tx.contactName}</p><Badge variant="outline" className={statusColors[tx.status] ?? ""}>{titleCase(tx.status)}</Badge></div><p className="mt-1 truncate text-xs text-muted-foreground">{tx.agentName} · {tx.propertyAddress ?? "No property address"} · {tx.flagLabel}</p></div><div className="shrink-0 text-right"><p className="text-sm font-semibold">{money(tx.grossCommission, true)}</p><p className="text-xs text-muted-foreground">{day(tx.closingDate)}</p></div></a>) : <p className="py-6 text-center text-sm text-muted-foreground">No current transaction flags in this scope.</p>}</CardContent></Card><Card><CardHeader><CardTitle className="text-base">Overdue task queue</CardTitle><CardDescription>Open work that needs ownership or a new due date.</CardDescription></CardHeader><CardContent className="space-y-2">{overdueTasks.length ? overdueTasks.map((task: any) => <a key={task.taskId} href={`/tasks/${task.taskId}`} className="flex items-center justify-between gap-3 rounded-lg border p-3 transition hover:border-primary/35 hover:bg-muted/20"><div className="min-w-0"><div className="flex items-center gap-2"><p className="truncate text-sm font-semibold">{task.title}</p><Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">{titleCase(task.priority)}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{task.agentName}{task.transactionId ? " · linked to transaction" : ""}</p></div><div className="shrink-0 text-right"><p className="text-xs font-semibold text-rose-700">Due {day(task.dueDate)}</p></div></a>) : <p className="py-6 text-center text-sm text-muted-foreground">No overdue tasks in this scope.</p>}</CardContent></Card></section></div>;
}

function GroupLeaderReport({ data, selectedLeaderId }: { data: any; selectedLeaderId: string }) {
  const { production, flags, monthly, groups, coaching, filters } = data;
  const selectedGroups = selectedLeaderId === "all" ? groups : groups.filter((group: any) => String(group.leaderId) === selectedLeaderId);
  const leaderName = selectedGroups.length === 1 ? selectedGroups[0].leaderName : selectedGroups.length > 1 ? "Selected group leader" : "All group leaders";
  const teamFlags = coaching.reduce((total: number, agent: any) => total + agent.commissionFlags + agent.pastExpectedCloseDate + agent.noExpectedCloseDate, 0);
  return <div className="space-y-7"><section className="rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/[0.08] via-background to-emerald-50/60 p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Group Leader Review</p><h2 className="mt-1 text-xl font-semibold tracking-tight">{leaderName}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Use this view to prepare a concrete, evidence-backed coaching conversation: production context, financial contribution, team follow-through, and the next issue to address for each agent.</p></div><Badge variant="secondary" className="h-7 w-fit">{number(coaching.length)} agents in scope</Badge></div></section><section className="space-y-3"><SectionHeader title="Team snapshot" description="Closed production is date-scoped; operational attention is current-state work." /><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><MetricCard label="Closings" value={number(production.closings)} description="Closed production" icon={CheckCircle2} tone="text-emerald-700" /><MetricCard label="Volume" value={money(production.volume, true)} description="Closed purchase volume" icon={Landmark} tone="text-sky-700" /><MetricCard label="Gross commission" value={money(production.grossCommission, true)} description="Recorded transaction GCI" icon={CircleDollarSign} tone="text-indigo-700" /><MetricCard label="Savvy net" value={money(production.savvyNet, true)} description="Recorded Savvy payout items" icon={TrendingUp} tone="text-primary" /><MetricCard label="Under contract" value={number(coaching.reduce((sum: number, agent: any) => sum + agent.underContract, 0))} description="Current open transactions" icon={BriefcaseBusiness} tone="text-violet-700" /></div></section><section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><FlagCard label="Overdue tasks" value={flags.overdueTasks} description="Follow-through debt across team members" icon={ClipboardList} href="/tasks" tone="rose" /><FlagCard label="Financial review" value={flags.commissionFlags} description="Commission flags requiring review" icon={Flag} href={buildTransactionUrl(filters, { flagPayoutIntegrity: "true" })} tone="violet" /><FlagCard label="Past expected close" value={flags.pastExpectedCloseDate} description="Open deals needing a reset" icon={CalendarClock} href={buildTransactionUrl(filters, { status: "under_contract", flagPastClosingDate: "true" })} tone="rose" /><FlagCard label="Close-date hygiene" value={flags.noExpectedCloseDate} description="Open deals missing an expected close" icon={AlertTriangle} href={buildTransactionUrl(filters, { status: "under_contract", flagNoClosingDate: "true" })} tone="amber" /></section><section className="grid gap-5 xl:grid-cols-[1.05fr_1.45fr]"><Card><CardHeader><CardTitle className="text-base">Team momentum</CardTitle><CardDescription>Monthly closed volume and closings for the selected group-leader scope.</CardDescription></CardHeader><CardContent>{monthly.length ? <ResponsiveContainer width="100%" height={290}><ComposedChart data={monthly.map((row: any) => ({ ...row, label: monthLabel(row.month) }))} margin={{ left: 0, right: 8, top: 6, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} /><YAxis yAxisId="volume" tickFormatter={(value) => money(value, true)} tickLine={false} axisLine={false} width={60} fontSize={11} /><YAxis yAxisId="closings" orientation="right" tickLine={false} axisLine={false} width={26} fontSize={11} /><Tooltip formatter={(value: number, key: string) => key === "volume" ? money(value) : number(value)} /><Bar yAxisId="volume" dataKey="volume" name="Volume" fill="#1F6D5B" radius={[5, 5, 0, 0]} /><Line yAxisId="closings" type="monotone" dataKey="closings" name="Closings" stroke="#2563EB" strokeWidth={2.5} dot={{ r: 3 }} /></ComposedChart></ResponsiveContainer> : <ChartEmpty label="team trend data" />}</CardContent></Card><Card><CardHeader><CardTitle className="text-base">Group coverage</CardTitle><CardDescription>Configured groups included in this review.</CardDescription></CardHeader><CardContent className="space-y-3">{selectedGroups.length ? selectedGroups.map((group: any) => <div key={group.groupId} className="rounded-xl border p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{group.groupName}</p><p className="mt-1 text-xs text-muted-foreground">Leader: {group.leaderName}</p></div><Badge variant="secondary">{number(group.memberCount)} members</Badge></div></div>) : <p className="py-8 text-center text-sm text-muted-foreground">No group is configured for this selection.</p>}<div className="rounded-lg bg-muted/50 p-3 text-sm"><p className="font-semibold">Conversation starting point</p><p className="mt-1 leading-6 text-muted-foreground">There are <span className="font-semibold text-foreground">{number(teamFlags)} live transaction flag{teamFlags === 1 ? "" : "s"}</span> and <span className="font-semibold text-foreground">{number(flags.overdueTasks)} overdue task{flags.overdueTasks === 1 ? "" : "s"}</span> in this team scope.</p></div></CardContent></Card></section><section className="space-y-3"><SectionHeader title="Coaching queue" description="Start with the highest-priority agent; prompts are deterministic and traceable to the displayed metrics." /><div className="grid gap-3 lg:grid-cols-2">{coaching.map((agent: any) => <Card key={agent.agentId} className={agent.priority === "high" ? "border-rose-200" : agent.priority === "medium" ? "border-amber-200" : ""}><CardContent className="p-4"><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{agent.agentName}</p><Badge variant="outline" className={agent.priority === "high" ? "border-rose-200 bg-rose-50 text-rose-700" : agent.priority === "medium" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}>{agent.priority === "healthy" ? "On track" : `${titleCase(agent.priority)} attention`}</Badge></div><p className="mt-2 text-sm leading-6 text-muted-foreground">{agent.prompt}</p></div><a href={`/transactions?agentId=${agent.agentId}`} className="shrink-0 text-primary"><ExternalLink className="h-4 w-4" /></a></div><div className="mt-4 grid grid-cols-4 gap-2 text-center"><div className="rounded-md bg-muted/55 px-2 py-2"><p className="text-xs text-muted-foreground">Closed</p><p className="mt-1 font-semibold">{number(agent.closings)}</p></div><div className="rounded-md bg-muted/55 px-2 py-2"><p className="text-xs text-muted-foreground">UC</p><p className="mt-1 font-semibold">{number(agent.underContract)}</p></div><div className="rounded-md bg-muted/55 px-2 py-2"><p className="text-xs text-muted-foreground">Overdue</p><p className="mt-1 font-semibold">{number(agent.overdueTasks)}</p></div><div className="rounded-md bg-muted/55 px-2 py-2"><p className="text-xs text-muted-foreground">GCI</p><p className="mt-1 font-semibold">{money(agent.grossCommission, true)}</p></div></div></CardContent></Card>)}</div></section></div>;
}

function TransactionReport({ data, update }: { data: any; update: (patch: QueryPatch) => void }) {
  const { summary, flags, statuses, transactionTypes, monthly, evidence, pagination, filters } = data;
  return <div className="space-y-7"><section className="space-y-3"><SectionHeader title="Transaction performance" description={`${filters.dateBasis === "contract" ? "Contract-date" : "Closing-date"} metrics for the selected transaction scope.`} /><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7"><MetricCard label="Units" value={number(summary.units)} description="Transactions in scope" delta={summary.change?.units} icon={BriefcaseBusiness} tone="text-sky-700" /><MetricCard label="Closed" value={number(summary.closedUnits)} description="Closed transactions" delta={summary.change?.closings} icon={CheckCircle2} tone="text-emerald-700" /><MetricCard label="Volume" value={money(summary.volume, true)} description="Purchase volume" delta={summary.change?.volume} icon={Landmark} tone="text-sky-700" /><MetricCard label="Gross commission" value={money(summary.grossCommission, true)} description="Recorded transaction GCI" delta={summary.change?.grossCommission} icon={CircleDollarSign} tone="text-indigo-700" /><MetricCard label="Savvy net" value={money(summary.savvyNet, true)} description="Recorded Savvy payout items" delta={summary.change?.savvyNet} icon={TrendingUp} tone="text-primary" /><MetricCard label="Avg. GCI" value={money(summary.averageGci, true)} description="Per transaction" icon={BarChart3} tone="text-violet-700" /><MetricCard label="Days to close" value={summary.averageDaysToClose === null ? "—" : `${Math.round(summary.averageDaysToClose)}`} description="Avg. contract to close" icon={CalendarClock} tone="text-amber-700" /></div></section><section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><FlagCard label="Termination rate" value={summary.terminationRate ?? 0} displayValue={summary.terminationRate === null ? "—" : percentage(summary.terminationRate)} description={summary.terminationRate === null ? "Available when all statuses are selected" : "Terminated ÷ closed plus terminated"} icon={TrendingUp} href={buildTransactionUrl(filters, { status: "terminated" })} tone="rose" /><FlagCard label="Commission flags" value={flags.commissionFlags} description="Transactions requiring payout review" icon={Flag} href={buildTransactionUrl(filters, { flagPayoutIntegrity: "true" })} tone="violet" /><FlagCard label="Past expected close" value={flags.pastExpectedCloseDate} description="Under contract and beyond close date" icon={CalendarClock} href={buildTransactionUrl(filters, { status: "under_contract", flagPastClosingDate: "true" })} tone="rose" /><FlagCard label="No expected close" value={flags.noExpectedCloseDate} description="Under contract without close date" icon={AlertTriangle} href={buildTransactionUrl(filters, { status: "under_contract", flagNoClosingDate: "true" })} tone="amber" /></section><section className="grid gap-5 xl:grid-cols-[1.45fr_0.95fr]"><Card><CardHeader><CardTitle className="text-base">Monthly production</CardTitle><CardDescription>Volume, units, gross commission, and Savvy net trend over the selected date basis.</CardDescription></CardHeader><CardContent>{monthly.length ? <ResponsiveContainer width="100%" height={300}><LineChart data={monthly.map((row: any) => ({ ...row, label: monthLabel(row.month) }))} margin={{ left: 0, right: 10, top: 6, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} /><YAxis yAxisId="money" tickFormatter={(value) => money(value, true)} tickLine={false} axisLine={false} width={60} fontSize={11} /><YAxis yAxisId="units" orientation="right" tickLine={false} axisLine={false} width={26} fontSize={11} /><Tooltip formatter={(value: number, key: string) => key === "units" || key === "closings" ? number(value) : money(value)} /><Legend /><Line yAxisId="money" type="monotone" dataKey="grossCommission" name="Gross commission" stroke="#4338CA" strokeWidth={2.5} dot={false} /><Line yAxisId="money" type="monotone" dataKey="savvyNet" name="Savvy net" stroke="#1F6D5B" strokeWidth={2.5} dot={false} /><Line yAxisId="units" type="monotone" dataKey="units" name="Units" stroke="#D97706" strokeWidth={2.25} dot={{ r: 2 }} /></LineChart></ResponsiveContainer> : <ChartEmpty label="monthly transaction data" />}</CardContent></Card><Card><CardHeader><CardTitle className="text-base">Representation mix</CardTitle><CardDescription>Buyer, seller, and dual-agency units in the selected scope.</CardDescription></CardHeader><CardContent>{transactionTypes.length ? <ResponsiveContainer width="100%" height={300}><PieChart><Pie data={transactionTypes.map((row: any) => ({ ...row, label: titleCase(row.transactionType) }))} dataKey="units" nameKey="label" cx="50%" cy="46%" outerRadius={86} innerRadius={52} paddingAngle={3}>{transactionTypes.map((_row: any, index: number) => <Cell key={index} fill={chartColors[index]} />)}</Pie><Tooltip formatter={(value: number) => number(value)} /><Legend verticalAlign="bottom" iconType="circle" /></PieChart></ResponsiveContainer> : <ChartEmpty label="representation mix" />}</CardContent></Card></section><section className="grid gap-5 xl:grid-cols-2"><Card><CardHeader><CardTitle className="text-base">Outcome mix</CardTitle><CardDescription>Units, volume, gross commission, and Savvy net by status.</CardDescription></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground"><th className="px-4 py-3 text-left">Status</th><th className="px-3 py-3 text-right">Units</th><th className="px-3 py-3 text-right">Volume</th><th className="px-3 py-3 text-right">GCI</th><th className="px-4 py-3 text-right">Savvy net</th></tr></thead><tbody>{statuses.map((row: any) => <tr key={row.status} className="border-b last:border-0"><td className="px-4 py-3"><Badge variant="outline" className={statusColors[row.status] ?? ""}>{titleCase(row.status)}</Badge></td><td className="px-3 py-3 text-right tabular-nums">{number(row.units)}</td><td className="px-3 py-3 text-right tabular-nums">{money(row.volume, true)}</td><td className="px-3 py-3 text-right tabular-nums">{money(row.grossCommission, true)}</td><td className="px-4 py-3 text-right tabular-nums">{money(row.savvyNet, true)}</td></tr>)}</tbody></table></div></CardContent></Card><Card><CardHeader><CardTitle className="text-base">Representation contribution</CardTitle><CardDescription>Commission contribution by buyer, seller, and dual-agency transactions.</CardDescription></CardHeader><CardContent>{transactionTypes.length ? <ResponsiveContainer width="100%" height={260}><BarChart data={transactionTypes.map((row: any) => ({ ...row, label: titleCase(row.transactionType) }))} layout="vertical" margin={{ left: 14, right: 10, top: 6, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" tickFormatter={(value) => money(value, true)} tickLine={false} axisLine={false} fontSize={11} /><YAxis dataKey="label" type="category" tickLine={false} axisLine={false} width={68} fontSize={11} /><Tooltip formatter={(value: number) => money(value)} /><Bar dataKey="grossCommission" name="Gross commission" fill="#4338CA" radius={[0, 5, 5, 0]} /></BarChart></ResponsiveContainer> : <ChartEmpty label="representation contribution" />}</CardContent></Card></section><section className="space-y-3"><SectionHeader title="Transaction evidence" description="Page through the individual source records behind the filters, metrics, and flags." action={<Badge variant="secondary">{number(pagination.total)} records</Badge>} /><Card><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[1120px] text-sm"><thead><tr className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground"><th className="px-4 py-3 text-left">Client / transaction</th><th className="px-3 py-3 text-left">Agent</th><th className="px-3 py-3 text-left">Type</th><th className="px-3 py-3 text-left">Status</th><th className="px-3 py-3 text-left">Dates</th><th className="px-3 py-3 text-right">Volume</th><th className="px-3 py-3 text-right">GCI</th><th className="px-3 py-3 text-right">Savvy net</th><th className="px-4 py-3 text-left">Flags</th></tr></thead><tbody>{evidence.map((tx: any) => <tr key={tx.transactionId} className="border-b last:border-0 hover:bg-muted/25"><td className="px-4 py-3"><a href={`/transactions/${tx.transactionId}`} className="font-semibold text-primary hover:underline">{tx.contactName}</a><p className="mt-0.5 max-w-[220px] truncate text-xs text-muted-foreground">{tx.propertyAddress ?? tx.transactionNumber ?? "No property address"}</p></td><td className="px-3 py-3">{tx.agentName}</td><td className="px-3 py-3"><Badge variant="outline" className={statusColors[tx.transactionType] ?? ""}>{titleCase(tx.transactionType)}</Badge></td><td className="px-3 py-3"><Badge variant="outline" className={statusColors[tx.status] ?? ""}>{titleCase(tx.status)}</Badge></td><td className="px-3 py-3 text-xs"><p>Contract: {day(tx.contractDate)}</p><p className="mt-1">Close: {day(tx.closingDate)}</p></td><td className="px-3 py-3 text-right tabular-nums">{money(tx.volume, true)}</td><td className="px-3 py-3 text-right font-medium tabular-nums">{money(tx.grossCommission, true)}</td><td className="px-3 py-3 text-right tabular-nums">{money(tx.savvyNet, true)}</td><td className="px-4 py-3"><div className="flex max-w-[200px] flex-wrap gap-1">{tx.commissionFlag && <Badge variant="outline" className="border-violet-200 bg-violet-50 text-violet-700">Commission</Badge>}{tx.pastExpectedCloseDate && <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">Past close</Badge>}{tx.missingExpectedCloseDate && <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">No close date</Badge>}{!tx.commissionFlag && !tx.pastExpectedCloseDate && !tx.missingExpectedCloseDate && <span className="text-xs text-muted-foreground">—</span>}</div></td></tr>)}</tbody></table></div>{!evidence.length && <p className="py-10 text-center text-sm text-muted-foreground">No transactions match this scope.</p>}<div className="flex items-center justify-between border-t px-4 py-3"><p className="text-xs text-muted-foreground">Page {pagination.page} of {pagination.totalPages}</p><div className="flex gap-2"><Button variant="outline" size="sm" disabled={pagination.page <= 1} onClick={() => update({ page: String(pagination.page - 1) })}><ChevronLeft className="mr-1 h-3.5 w-3.5" />Previous</Button><Button variant="outline" size="sm" disabled={pagination.page >= pagination.totalPages} onClick={() => update({ page: String(pagination.page + 1) })}>Next<ChevronRight className="ml-1 h-3.5 w-3.5" /></Button></div></div></CardContent></Card></section></div>;
}

function LoadingReport() {
  return <div className="space-y-5"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-32" />)}</div><div className="grid gap-5 xl:grid-cols-2"><Skeleton className="h-[360px]" /><Skeleton className="h-[360px]" /></div><Skeleton className="h-[420px]" /></div>;
}

export default function ReportingSuitePage() {
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
    groupLeaderId: params.get("groupLeaderId") && params.get("groupLeaderId") !== "all" ? Number(params.get("groupLeaderId")) : undefined,
    marketProfileId: params.get("marketProfileId") && params.get("marketProfileId") !== "all" ? Number(params.get("marketProfileId")) : undefined,
    isaId: params.get("isaId") && params.get("isaId") !== "all" ? Number(params.get("isaId")) : undefined,
    leadSourceId: params.get("leadSourceId") && params.get("leadSourceId") !== "all" ? Number(params.get("leadSourceId")) : undefined,
    status: (params.get("status") ?? "all") as "all" | "closed" | "under_contract" | "terminated",
    transactionType: (params.get("transactionType") ?? "all") as "all" | "buyer" | "seller" | "dual",
  }), [params, today]);
  const page = Math.max(1, Number(params.get("page") ?? "1"));
  const filtersQuery = trpc.analytics.reportingFilters.useQuery(undefined, { staleTime: 5 * 60_000 });
  const agentQuery = trpc.analytics.agentReport.useQuery(baseFilters, { enabled: activeReport === "agents", staleTime: 20_000 });
  const groupQuery = trpc.analytics.groupLeaderReport.useQuery(baseFilters, { enabled: activeReport === "leaders", staleTime: 20_000 });
  const transactionQuery = trpc.analytics.transactionStatisticsReport.useQuery({ ...baseFilters, page, limit: 25 }, { enabled: activeReport === "transactions", staleTime: 20_000 });
  const onboardingQuery = trpc.analytics.agentOnboardingReport.useQuery({ ...baseFilters, page, limit: 25 }, { enabled: activeReport === "onboarding", staleTime: 20_000 });
  const marketQuery = trpc.analytics.marketAnalyticsReport.useQuery(baseFilters, { enabled: activeReport === "markets", staleTime: 20_000 });
  const tasksQuery = trpc.analytics.tasksReport.useQuery({ ...baseFilters, page, limit: 25 }, { enabled: activeReport === "tasks", staleTime: 20_000 });
  const isaQuery = trpc.analytics.isaActivitiesReport.useQuery({ ...baseFilters, page, limit: 25 }, { enabled: activeReport === "isa", staleTime: 20_000 });
  const sourcesQuery = trpc.analytics.leadSourcesReport.useQuery({ ...baseFilters, page, limit: 25 }, { enabled: activeReport === "sources", staleTime: 20_000 });

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
  };
  const activeQuery = queryByReport[activeReport] ?? agentQuery;
  const reportData = activeQuery.data as any;

  return <div className="space-y-6 pb-8"><PageHeader title="Reporting" subtitle="A decision-ready suite for agent production, group leader coaching, and transaction performance." actions={<Badge variant="secondary" className="h-7 gap-1"><BarChart3 className="h-3.5 w-3.5" /> Reporting suite</Badge>} /><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{reportTabs.map((tab) => { const Icon = tab.icon; const isActive = tab.id === activeReport; return <button key={tab.id} type="button" onClick={() => selectReport(tab.id)} className={`rounded-xl border p-4 text-left transition ${isActive ? "border-primary bg-primary/[0.055] shadow-sm" : "bg-background hover:border-primary/35 hover:bg-muted/25"}`}><div className="flex items-start justify-between gap-3"><span className={`rounded-lg p-2 ${isActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}><Icon className="h-4 w-4" /></span>{isActive && <Badge>Active</Badge>}</div><p className="mt-4 text-sm font-semibold">{tab.label}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{tab.description}</p></button>; })}</div><ReportingFilters activeReport={activeReport} params={params} filters={filtersQuery.data} update={update} />{filtersQuery.isLoading || activeQuery.isLoading ? <LoadingReport /> : activeQuery.error ? <Card className="border-rose-200"><CardContent className="flex flex-col items-center gap-3 p-10 text-center"><AlertTriangle className="h-7 w-7 text-rose-600" /><div><p className="font-semibold">Unable to load {activeConfig.label}</p><p className="mt-1 text-sm text-muted-foreground">{activeQuery.error.message}</p></div><Button variant="outline" onClick={() => activeQuery.refetch()}>Try again</Button></CardContent></Card> : reportData ? <>{activeReport === "agents" && <AgentReport data={reportData} />}{activeReport === "leaders" && <GroupLeaderReport data={reportData} selectedLeaderId={params.get("groupLeaderId") ?? "all"} />}{activeReport === "transactions" && <TransactionReport data={reportData} update={update} />}{activeReport === "onboarding" && <OnboardingReport data={reportData} update={update} />}{activeReport === "markets" && <MarketAnalyticsReport data={reportData} />}{activeReport === "tasks" && <TasksReport data={reportData} update={update} />}{activeReport === "isa" && <IsaActivitiesReport data={reportData} update={update} />}{activeReport === "sources" && <LeadSourcesReport data={reportData} update={update} />}</> : <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">No report data is available for this scope.</CardContent></Card>}</div>;
}
