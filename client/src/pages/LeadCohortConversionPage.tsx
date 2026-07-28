import { useEffect, useMemo, useRef } from "react";
import { useLocation } from "wouter";
import {
  BarChart3,
  Brain,
  CalendarClock,
  ChevronRight,
  ExternalLink,
  Filter,
  GitBranch,
  Loader2,
  RefreshCw,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  Bar,
  BarChart,
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type DatePreset = "mtd" | "qtd" | "ytd" | "last12" | "all" | "custom";
type LifecycleStage = "all" | "new_lead" | "attempted_contact" | "nurture" | "active_client" | "under_contract" | "closed" | "dead";

function localDay(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function startOfMonth(date = new Date()): string { return localDay(new Date(date.getFullYear(), date.getMonth(), 1)); }
function startOfQuarter(date = new Date()): string { return localDay(new Date(date.getFullYear(), Math.floor(date.getMonth() / 3) * 3, 1)); }
function startOfYear(date = new Date()): string { return localDay(new Date(date.getFullYear(), 0, 1)); }
function startOfTrailingTwelveMonths(date = new Date()): string { return localDay(new Date(date.getFullYear(), date.getMonth() - 11, 1)); }

function money(value: unknown, compact = false): string {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return "—";
  if (compact && Math.abs(amount) >= 1_000_000) return `$${(amount / 1_000_000).toFixed(Math.abs(amount) >= 10_000_000 ? 0 : 1)}M`;
  if (compact && Math.abs(amount) >= 1_000) return `$${(amount / 1_000).toFixed(Math.abs(amount) >= 100_000 ? 0 : 1)}K`;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(amount);
}

function percent(value: unknown): string {
  const amount = Number(value);
  return Number.isFinite(amount) ? `${amount.toFixed(1)}%` : "—";
}

function integer(value: unknown): string {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? Math.round(amount).toLocaleString() : "—";
}

function days(value: unknown): string {
  const amount = Number(value);
  return Number.isFinite(amount) ? `${Math.round(amount)} days` : "—";
}

function monthLabel(value: string): string {
  if (!/^\d{4}-\d{2}$/.test(value)) return value || "—";
  const [year, month] = value.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

function dateLabel(value: unknown): string {
  if (!value) return "—";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function titleCase(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function MetricCard({ title, value, detail, icon: Icon, accent = "text-primary" }: { title: string; value: string; detail: string; icon: typeof BarChart3; accent?: string }) {
  return <Card className="h-full"><CardContent className="p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p><p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p></div><span className={`rounded-lg bg-muted p-2 ${accent}`}><Icon className="h-4 w-4" /></span></div></CardContent></Card>;
}

function TableShell({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[860px] text-sm">{children}</table></div>;
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="rounded-lg border border-dashed p-8 text-center"><p className="font-medium">{title}</p><p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">{description}</p></div>;
}

function CohortBrief({ data, onEvidence, onSource, onAgent }: { data: any; onEvidence: () => void; onSource: () => void; onAgent: () => void }) {
  const insights = data?.insights ?? [];
  const actionFor = (drilldown: string) => drilldown === "source" ? onSource : drilldown === "agent" ? onAgent : onEvidence;
  return <Card className="border-primary/15 bg-gradient-to-br from-primary/[0.045] via-background to-sky-50/50"><CardHeader className="pb-3"><div className="flex gap-3"><span className="h-fit rounded-xl bg-primary p-2.5 text-primary-foreground"><Brain className="h-5 w-5" /></span><div><CardTitle className="text-base">Cohort intelligence brief</CardTitle><CardDescription className="mt-1">Evidence-grounded interpretation of this acquisition cohort. It connects lead ownership, source attribution, observed contract/close outcomes, timing, and downstream production without treating current pipeline stages as historical conversion events.</CardDescription></div></div></CardHeader><CardContent>{data?.summary && <p className="mb-4 rounded-lg border bg-background/70 p-3 text-sm leading-6 text-muted-foreground">{data.summary}</p>}{!insights.length ? <EmptyState title="No cohort intelligence is available" description="The report metrics and contact evidence below remain the source of truth for this acquisition cohort." /> : <div className="grid gap-3 lg:grid-cols-2">{insights.map((insight: any, index: number) => <div key={`${insight.title}-${index}`} className="rounded-xl border bg-background p-4"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{insight.title}</p><Badge variant={insight.priority === "high" ? "destructive" : "secondary"}>{insight.priority} priority</Badge><Badge variant="outline">{insight.confidence} confidence</Badge></div><p className="mt-2 text-sm leading-5">{insight.observation}</p><p className="mt-2 text-sm leading-5 text-muted-foreground"><span className="font-medium text-foreground">How it connects: </span>{insight.explanation}</p><p className="mt-3 rounded-md bg-muted/45 p-2.5 text-xs leading-5"><span className="font-semibold">Owner: </span>{insight.owner}<br /><span className="font-semibold">Next action: </span>{insight.action}</p><div className="mt-3 flex flex-wrap gap-2">{(insight.evidence ?? []).slice(0, 3).map((evidence: any, evidenceIndex: number) => <button type="button" key={`${evidence.label}-${evidenceIndex}`} onClick={actionFor(evidence.drilldown)} className="rounded border bg-muted/25 px-2 py-1 text-xs transition hover:border-primary/40 hover:bg-primary/5">{evidence.label}: <span className="font-semibold">{evidence.value}</span></button>)}</div></div>)}</div>}{data?.dataQualityNote && <p className="mt-4 text-xs leading-5 text-muted-foreground"><span className="font-medium text-foreground">Data confidence: </span>{data.dataQualityNote}</p>}{data?.generationMethod === "deterministic" && <p className="mt-2 text-xs text-muted-foreground">This initial brief uses deterministic, source-bound cohort signals. It will not invent stage history that SavvyOS does not retain.</p>}</CardContent></Card>;
}

export default function LeadCohortConversionPage() {
  const [location, navigate] = useLocation();
  const url = useMemo(() => new URLSearchParams(location.includes("?") ? location.slice(location.indexOf("?") + 1) : ""), [location]);
  const today = localDay(new Date());
  const dateFrom = url.get("from") ?? startOfYear();
  const dateTo = url.get("to") ?? today;
  const preset = (url.get("preset") ?? "ytd") as DatePreset;
  const agentId = url.get("agentId") ?? "all";
  const leadSourceId = url.get("leadSourceId") ?? "all";
  const lifecycleStage = (url.get("stage") ?? "all") as LifecycleStage;

  const setQuery = (patch: Record<string, string | null>, replace = true) => {
    const next = new URLSearchParams(url);
    Object.entries(patch).forEach(([key, value]) => { if (!value) next.delete(key); else next.set(key, value); });
    const query = next.toString();
    navigate(`/analytics/lead-cohorts${query ? `?${query}` : ""}`, { replace });
  };

  const setPreset = (nextPreset: DatePreset) => {
    if (nextPreset === "custom") return setQuery({ preset: "custom" });
    if (nextPreset === "all") return setQuery({ preset: "all", from: null, to: null });
    const from = nextPreset === "mtd" ? startOfMonth() : nextPreset === "qtd" ? startOfQuarter() : nextPreset === "last12" ? startOfTrailingTwelveMonths() : startOfYear();
    setQuery({ preset: nextPreset, from, to: today });
  };

  const input = useMemo(() => ({
    dateFrom: preset === "all" ? undefined : dateFrom,
    dateTo: preset === "all" ? undefined : dateTo,
    agentId: agentId === "all" ? undefined : Number(agentId),
    leadSourceId: leadSourceId === "all" ? undefined : Number(leadSourceId),
    lifecycleStage: lifecycleStage === "all" ? undefined : lifecycleStage,
  }), [agentId, dateFrom, dateTo, leadSourceId, lifecycleStage, preset]);
  const utils = trpc.useUtils();
  const reportQuery = trpc.analytics.leadCohortConversion.useQuery(input, { refetchInterval: 60_000, staleTime: 30_000 });
  const insightsQuery = trpc.analytics.leadCohortConversionInsights.useQuery(input, { refetchInterval: 300_000, staleTime: 60_000 });
  const refreshInsights = trpc.analytics.refreshLeadCohortConversionInsights.useMutation({
    onSuccess: () => utils.analytics.leadCohortConversionInsights.invalidate(input),
  });
  const autoInsightScopes = useRef(new Set<string>());
  const insightScopeKey = useMemo(() => JSON.stringify(input), [input]);
  useEffect(() => {
    const cached = insightsQuery.data as any;
    const needsBrief = !cached?.insights?.length || Boolean(cached?.isStale);
    if (reportQuery.isLoading || insightsQuery.isLoading || refreshInsights.isPending || !needsBrief || autoInsightScopes.current.has(insightScopeKey)) return;
    autoInsightScopes.current.add(insightScopeKey);
    refreshInsights.mutate({ ...input, force: false });
  }, [input, insightScopeKey, insightsQuery.data, insightsQuery.isLoading, refreshInsights, reportQuery.isLoading]);
  const report = reportQuery.data as any;
  const cohortIntelligence = (insightsQuery.data as any) ?? report?.intelligence;
  const summary = report?.summary;
  const monthly = (report?.monthly ?? []).map((row: any) => ({ ...row, label: monthLabel(row.month), contractConversion: row.contractConversionPct, closeConversion: row.closeConversionPct }));
  const activeFilters = preset !== "ytd" || agentId !== "all" || leadSourceId !== "all" || lifecycleStage !== "all";
  const clearFilters = () => navigate(`/analytics/lead-cohorts?preset=ytd&from=${startOfYear()}&to=${today}`, { replace: true });
  const goToEvidence = () => document.getElementById("cohort-evidence")?.scrollIntoView({ behavior: "smooth", block: "start" });
  const goToSources = () => document.getElementById("cohort-sources")?.scrollIntoView({ behavior: "smooth", block: "start" });
  const goToAgents = () => document.getElementById("cohort-agents")?.scrollIntoView({ behavior: "smooth", block: "start" });
  const openContact = (contactId: number) => navigate(`/contacts/${contactId}?analytics=1&report=lead-cohort-conversion&returnTo=${encodeURIComponent(location)}`);

  if (reportQuery.isLoading) return <div className="flex min-h-[360px] items-center justify-center"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading lead cohort intelligence…</div></div>;
  if (reportQuery.error) return <div className="rounded-lg border border-destructive/35 bg-destructive/5 p-5"><p className="font-semibold">Lead Cohort Conversion could not load</p><p className="mt-1 text-sm text-muted-foreground">{reportQuery.error.message}</p><Button className="mt-3" size="sm" variant="outline" onClick={() => reportQuery.refetch()}><RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Retry</Button></div>;

  return <div className="space-y-5">
    <PageHeader title="Lead Cohort Conversion & Sales Cycle" subtitle="A fixed acquisition cohort and its observed downstream outcomes. Measure what leads created in a period ultimately contract, close, produce, and take to mature—without confusing today’s pipeline counts for historical conversion." actions={<Badge variant="secondary" className="h-7 gap-1"><GitBranch className="h-3.5 w-3.5" /> Deep report 02</Badge>} />

    <Card className="border-primary/15"><CardContent className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold">Analytics report library</p><p className="text-xs text-muted-foreground">Each report owns its metric grain, filters, evidence, and interpretation.</p></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => navigate("/analytics")}>01 · Transaction Intelligence</Button><Button size="sm" variant="default">02 · Lead Cohort Conversion</Button></div></CardContent></Card>

    <Card className="border-primary/15"><CardContent className="p-4"><div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between"><div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"><div className="space-y-1"><Label className="text-xs">Lead acquisition cohort</Label><Select value={preset} onValueChange={(value) => setPreset(value as DatePreset)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="mtd">Month to date</SelectItem><SelectItem value="qtd">Quarter to date</SelectItem><SelectItem value="ytd">Year to date</SelectItem><SelectItem value="last12">Trailing 12 months</SelectItem><SelectItem value="all">All cohorts</SelectItem><SelectItem value="custom">Custom range</SelectItem></SelectContent></Select></div><div className="space-y-1"><Label className="text-xs">Cohort start</Label><Input type="date" value={dateFrom} disabled={preset === "all"} onChange={(event) => setQuery({ preset: "custom", from: event.target.value || null })} /></div><div className="space-y-1"><Label className="text-xs">Cohort end</Label><Input type="date" value={dateTo} disabled={preset === "all"} onChange={(event) => setQuery({ preset: "custom", to: event.target.value || null })} /></div><div className="space-y-1"><Label className="text-xs">First owner</Label><Select value={agentId} onValueChange={(value) => setQuery({ agentId: value === "all" ? null : value })}><SelectTrigger><SelectValue placeholder="All first owners" /></SelectTrigger><SelectContent><SelectItem value="all">All first owners</SelectItem>{(report?.availableFilters?.agents ?? []).map((agent: any) => <SelectItem key={agent.id} value={String(agent.id)}>{agent.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1"><Label className="text-xs">Lead source</Label><Select value={leadSourceId} onValueChange={(value) => setQuery({ leadSourceId: value === "all" ? null : value })}><SelectTrigger><SelectValue placeholder="All sources" /></SelectTrigger><SelectContent><SelectItem value="all">All sources</SelectItem>{(report?.availableFilters?.sources ?? []).map((source: any) => <SelectItem key={source.id} value={String(source.id)}>{source.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1"><Label className="text-xs">Current lifecycle state</Label><Select value={lifecycleStage} onValueChange={(value) => setQuery({ stage: value === "all" ? null : value })}><SelectTrigger><SelectValue placeholder="All current states" /></SelectTrigger><SelectContent><SelectItem value="all">All current states</SelectItem>{(report?.availableFilters?.lifecycleStages ?? []).map((stage: string) => <SelectItem key={stage} value={stage}>{titleCase(stage)}</SelectItem>)}</SelectContent></Select></div></div>{activeFilters && <Button variant="ghost" size="sm" onClick={clearFilters}><Filter className="mr-1.5 h-3.5 w-3.5" /> Clear cohort filters</Button>}</div><p className="mt-3 text-xs leading-5 text-muted-foreground"><span className="font-medium text-foreground">Filter semantics:</span> dates select contacts by <strong>lead-created date</strong>. First owner, source, and current lifecycle filters narrow that same cohort. Contract/close dates are outcomes observed to date and are not used as the cohort denominator.</p></CardContent></Card>

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"><MetricCard title="Cohort leads" value={integer(summary?.cohortLeads)} detail="Contacts created in the selected acquisition range" icon={Users} /><MetricCard title="Ever contracted" value={percent(summary?.contractConversionPct)} detail={`${integer(summary?.contractedContacts)} unique cohort contacts with a valid first contract`} icon={Target} accent="text-indigo-600" /><MetricCard title="Observed close conversion" value={percent(summary?.closeConversionPct)} detail={`${integer(summary?.closedContacts)} unique cohort contacts with a valid first closing`} icon={TrendingUp} accent="text-emerald-600" /><MetricCard title="Average days to contract" value={days(summary?.averageDaysToContract)} detail="Lead-created date to first valid contract date" icon={CalendarClock} accent="text-amber-600" /><MetricCard title="Average days to close" value={days(summary?.averageDaysToClose)} detail="Lead-created date to first valid closing date" icon={CalendarClock} accent="text-sky-600" /><MetricCard title="Downstream closed volume" value={money(summary?.closedVolume, true)} detail={`${integer(summary?.closedUnits)} closed units tied to this cohort`} icon={BarChart3} accent="text-purple-600" /></section>

    <div className="space-y-2"><div className="flex justify-end"><Button size="sm" variant="outline" onClick={() => refreshInsights.mutate({ ...input, force: true })} disabled={refreshInsights.isPending}><RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${refreshInsights.isPending ? "animate-spin" : ""}`} />{refreshInsights.isPending ? "Generating brief" : cohortIntelligence?.insights?.length ? "Refresh brief" : "Generate brief"}</Button></div><CohortBrief data={cohortIntelligence} onEvidence={goToEvidence} onSource={goToSources} onAgent={goToAgents} /></div>

    <section className="grid gap-5 xl:grid-cols-[1.45fr_0.95fr]"><Card><CardHeader><CardTitle className="text-base">Cohort maturation by lead-created month</CardTitle><CardDescription>Each point begins with leads acquired in that month. The two rates are observed to date, so newer cohorts have had less time to mature.</CardDescription></CardHeader><CardContent>{monthly.length ? <div className="h-72"><ResponsiveContainer width="100%" height="100%"><LineChart data={monthly}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" tickLine={false} axisLine={false} /><YAxis tickFormatter={(value) => `${value}%`} tickLine={false} axisLine={false} /><Tooltip formatter={(value: number) => percent(value)} /><Legend /><Line type="monotone" dataKey="contractConversion" name="Contract conversion" stroke="#4f46e5" strokeWidth={2.2} dot={{ r: 3 }} /><Line type="monotone" dataKey="closeConversion" name="Close conversion" stroke="#059669" strokeWidth={2.2} dot={{ r: 3 }} /></LineChart></ResponsiveContainer></div> : <EmptyState title="No cohort rows match these filters" description="Broaden the acquisition range or clear a source, owner, or lifecycle filter." />}</CardContent></Card><Card><CardHeader><CardTitle className="text-base">Current lifecycle distribution</CardTitle><CardDescription>Current status of selected cohort contacts. This is an operational worklist distribution—not a historical conversion funnel.</CardDescription></CardHeader><CardContent>{(report?.currentStages ?? []).some((row: any) => row.contacts > 0) ? <div className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={(report?.currentStages ?? []).map((row: any) => ({ ...row, label: titleCase(row.stage) }))} layout="vertical" margin={{ left: 18 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} /><YAxis type="category" dataKey="label" width={106} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} /><Tooltip formatter={(value: number) => integer(value)} /><Bar dataKey="contacts" name="Current contacts" fill="#2563eb" radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer></div> : <EmptyState title="No current lifecycle data" description="Selected cohort contacts do not have a current connection or ISA status available." />}</CardContent></Card></section>

    <section className="grid gap-5 xl:grid-cols-2"><Card id="cohort-sources"><CardHeader><CardTitle className="text-base">Source cohort outcomes</CardTitle><CardDescription>Acquisition-source comparison with conversion, timing, downstream production, and recorded Savvy Net. It intentionally does not claim ROI because spend is not recorded.</CardDescription></CardHeader><CardContent>{(report?.sources ?? []).length ? <TableShell><thead className="bg-muted/45 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-3 py-3">Source</th><th className="px-3 py-3 text-right">Leads</th><th className="px-3 py-3 text-right">Contract</th><th className="px-3 py-3 text-right">Close</th><th className="px-3 py-3 text-right">Days to close</th><th className="px-3 py-3 text-right">Volume</th></tr></thead><tbody>{(report?.sources ?? []).map((row: any) => <tr key={`${row.id}-${row.name}`} className="border-t"><td className="px-3 py-3 font-medium">{row.name}</td><td className="px-3 py-3 text-right tabular-nums">{integer(row.cohortLeads)}</td><td className="px-3 py-3 text-right tabular-nums">{percent(row.contractConversionPct)}</td><td className="px-3 py-3 text-right tabular-nums">{percent(row.closeConversionPct)}</td><td className="px-3 py-3 text-right tabular-nums">{days(row.averageDaysToClose)}</td><td className="px-3 py-3 text-right font-medium tabular-nums">{money(row.closedVolume, true)}</td></tr>)}</tbody></TableShell> : <EmptyState title="No source outcomes for this cohort" description="Review attribution completeness or broaden the cohort filters." />}</CardContent></Card>
      <Card id="cohort-agents"><CardHeader><CardTitle className="text-base">First-owner cohort scorecards</CardTitle><CardDescription>Production and conversion by the first recorded agent connection. Use substantial cohort sizes and contact evidence before drawing coaching conclusions.</CardDescription></CardHeader><CardContent>{(report?.agents ?? []).length ? <TableShell><thead className="bg-muted/45 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-3 py-3">First owner</th><th className="px-3 py-3 text-right">Leads</th><th className="px-3 py-3 text-right">Contract</th><th className="px-3 py-3 text-right">Close</th><th className="px-3 py-3 text-right">Closed units</th><th className="px-3 py-3 text-right">Net</th></tr></thead><tbody>{(report?.agents ?? []).map((row: any) => <tr key={`${row.id}-${row.name}`} className="border-t"><td className="px-3 py-3 font-medium">{row.name}</td><td className="px-3 py-3 text-right tabular-nums">{integer(row.cohortLeads)}</td><td className="px-3 py-3 text-right tabular-nums">{percent(row.contractConversionPct)}</td><td className="px-3 py-3 text-right tabular-nums">{percent(row.closeConversionPct)}</td><td className="px-3 py-3 text-right tabular-nums">{integer(row.closedUnits)}</td><td className="px-3 py-3 text-right font-medium tabular-nums">{money(row.recordedSavvyNet, true)}</td></tr>)}</tbody></TableShell> : <EmptyState title="No owner cohort scorecards for this scope" description="No selected cohort contacts have a first recorded agent connection." />}</CardContent></Card></section>

    <Card id="cohort-evidence"><CardHeader><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><CardTitle className="text-base">Cohort contact evidence</CardTitle><CardDescription>Each row is a source contact in the fixed acquisition cohort. Open a person to inspect the operational record; browser back returns to this exact report filter state.</CardDescription></div><Badge variant="outline">Showing {Math.min((report?.evidence ?? []).length, 150)} of {integer(report?.evidenceTotal)}</Badge></div></CardHeader><CardContent>{(report?.evidence ?? []).length ? <TableShell><thead className="bg-muted/45 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-3 py-3">Lead</th><th className="px-3 py-3">Created / source</th><th className="px-3 py-3">First owner</th><th className="px-3 py-3">Current state</th><th className="px-3 py-3">Observed outcome</th><th className="px-3 py-3 text-right">Days to close</th><th className="px-3 py-3 text-right">Closed volume</th></tr></thead><tbody>{(report?.evidence ?? []).map((row: any) => <tr key={row.contactId} className="border-t transition-colors hover:bg-muted/25"><td className="px-3 py-3"><button type="button" onClick={() => openContact(row.contactId)} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">{row.contactName}<ExternalLink className="h-3.5 w-3.5" /></button></td><td className="px-3 py-3"><div>{dateLabel(row.createdAt)}</div><div className="text-xs text-muted-foreground">{row.sourceName}</div></td><td className="px-3 py-3">{row.ownerName}</td><td className="px-3 py-3"><Badge variant="outline">{titleCase(row.lifecycleStage)}</Badge></td><td className="px-3 py-3"><div className="font-medium">{row.convertedToClose ? "Closed" : row.convertedToContract ? "Contracted" : "No observed contract"}</div><div className="text-xs text-muted-foreground">{row.convertedToClose ? dateLabel(row.firstClosingDate) : row.convertedToContract ? dateLabel(row.firstContractDate) : "—"}</div></td><td className="px-3 py-3 text-right tabular-nums">{days(row.daysToClose)}</td><td className="px-3 py-3 text-right font-medium tabular-nums">{money(row.closedVolume, true)}</td></tr>)}</tbody></TableShell> : <EmptyState title="No cohort contacts match this report scope" description="Clear filters or widen the lead-created date range to inspect contact-level evidence." />}</CardContent></Card>

    <Card><CardHeader><CardTitle className="text-base">Metric interpretation and limits</CardTitle><CardDescription>Definitions are visible because useful reporting must remain auditable.</CardDescription></CardHeader><CardContent className="grid gap-3 md:grid-cols-2">{Object.entries(report?.definitions ?? {}).map(([key, value]) => <div key={key} className="rounded-lg border p-3"><p className="text-sm font-semibold">{titleCase(key)}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{String(value)}</p></div>)}</CardContent></Card>
  </div>;
}
