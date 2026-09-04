import { useMemo } from "react";
import { useLocation } from "wouter";
import {
  AlertTriangle,
  BarChart3,
  BrainCircuit,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  ExternalLink,
  Filter,
  Loader2,
  MessageSquareWarning,
  PhoneCall,
  RefreshCw,
  Target,
  TrendingUp,
  UsersRound,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import PageHeader from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type DatePreset = "last30" | "last90" | "ytd" | "custom";

function localDay(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function startOfYear(date = new Date()): string {
  return localDay(new Date(date.getFullYear(), 0, 1));
}

function dateForPreset(preset: DatePreset) {
  const today = new Date();
  if (preset === "last30") return { from: localDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29)), to: localDay(today) };
  if (preset === "last90") return { from: localDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 89)), to: localDay(today) };
  if (preset === "ytd") return { from: startOfYear(today), to: localDay(today) };
  return null;
}

function integer(value: unknown): string {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? Math.round(number).toLocaleString() : "—";
}

function percent(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toFixed(1)}%` : "—";
}

function money(value: unknown, compact = false): string {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return "—";
  if (compact && Math.abs(amount) >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (compact && Math.abs(amount) >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(amount);
}

function hours(value: unknown): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  if (amount < 1) return `${Math.round(amount * 60)}m`;
  return `${amount.toFixed(amount >= 10 ? 0 : 1)}h`;
}

function title(value: string | null | undefined): string {
  return (value ?? "Unknown").replace(/_/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());
}

function MetricCard({ label, value, detail, icon: Icon, tone = "text-primary" }: { label: string; value: string; detail: string; icon: typeof BarChart3; tone?: string }) {
  return <Card className="border-border/80 shadow-sm"><CardContent className="p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p></div><span className={`rounded-xl bg-muted p-2.5 ${tone}`}><Icon className="h-4 w-4" /></span></div></CardContent></Card>;
}

function TableShell({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[760px] text-sm">{children}</table></div>;
}

function Empty({ title, description }: { title: string; description: string }) {
  return <div className="rounded-lg border border-dashed p-8 text-center"><p className="font-medium">{title}</p><p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">{description}</p></div>;
}

export default function ConversationIntelligencePage() {
  const [location, navigate] = useLocation();
  const params = useMemo(() => new URLSearchParams(location.includes("?") ? location.slice(location.indexOf("?") + 1) : ""), [location]);
  const defaultDates = dateForPreset("last90")!;
  const preset = (params.get("preset") ?? "last90") as DatePreset;
  const dateFrom = params.get("from") ?? defaultDates.from;
  const dateTo = params.get("to") ?? defaultDates.to;
  const agentId = params.get("agentId") ?? "all";
  const leadSourceId = params.get("leadSourceId") ?? "all";
  const direction = params.get("direction") ?? "all";
  const transcript = params.get("transcript") ?? "all";
  const intentTier = params.get("intent") ?? "all";
  const targetMarket = params.get("market") ?? "";
  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key));
    navigate(`/analytics/conversation-intelligence${next.toString() ? `?${next.toString()}` : ""}`, { replace: true });
  };
  const setPreset = (next: DatePreset) => {
    const range = dateForPreset(next);
    if (range) update({ preset: next, from: range.from, to: range.to });
    else update({ preset: next });
  };
  const input = useMemo(() => ({
    dateFrom,
    dateTo,
    agentId: agentId === "all" ? undefined : Number(agentId),
    leadSourceId: leadSourceId === "all" ? undefined : Number(leadSourceId),
    direction: direction === "all" ? undefined : direction as "inbound" | "outbound",
    hasTranscript: transcript === "yes" ? true : transcript === "no" ? false : undefined,
    intentTier: intentTier === "all" ? undefined : intentTier as "priority" | "active" | "nurture" | "unknown",
    targetMarket: targetMarket.trim() || undefined,
  }), [agentId, dateFrom, dateTo, direction, intentTier, leadSourceId, targetMarket, transcript]);
  const utils = trpc.useUtils();
  const reportQuery = trpc.analytics.conversationIntelligence.useQuery(input, { staleTime: 30_000, refetchInterval: 60_000 });
  const queueBackfill = trpc.contacts.queueIntelligenceBackfill.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.queued} historical transcript${data.queued === 1 ? "" : "s"} queued for Contact Intelligence.`);
      utils.analytics.conversationIntelligence.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const report = reportQuery.data as any;
  const summary = report?.summary ?? {};
  const activeFilters = preset !== "last90" || agentId !== "all" || leadSourceId !== "all" || direction !== "all" || transcript !== "all" || intentTier !== "all" || Boolean(targetMarket);
  const openContact = (contactId: number) => navigate(`/contacts/${contactId}?analytics=1&report=conversation-intelligence&returnTo=${encodeURIComponent(location)}`);
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  if (reportQuery.isLoading) return <div className="flex min-h-[360px] items-center justify-center"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading Conversation Intelligence…</div></div>;
  if (reportQuery.error) return <Card className="border-destructive/40"><CardContent className="p-5"><p className="font-semibold">Conversation Intelligence could not load</p><p className="mt-1 text-sm text-muted-foreground">{reportQuery.error.message}</p><Button className="mt-3" size="sm" variant="outline" onClick={() => reportQuery.refetch()}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Retry</Button></CardContent></Card>;

  return <div className="space-y-5">
    <PageHeader
      title="Conversation & Revenue Intelligence"
      subtitle="Native Aircall conversations linked to Contact Intelligence, follow-up risk, and observed CRM outcomes. Every finding shows coverage and remains an evidence-led association—not a claim of causality."
      actions={<Badge variant="secondary" className="h-7 gap-1"><BrainCircuit className="h-3.5 w-3.5" /> Deep report 03</Badge>}
    />

    <Card className="border-primary/15"><CardContent className="flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:justify-between"><div><p className="text-sm font-semibold">Analytics report library</p><p className="text-xs text-muted-foreground">This report turns existing native conversation evidence into an auditable operating view.</p></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => navigate("/analytics")}>01 · Reporting suite</Button><Button size="sm" variant="outline" onClick={() => navigate("/analytics/lead-cohorts")}>02 · Lead cohort conversion</Button><Button size="sm">03 · Conversation Intelligence</Button></div></CardContent></Card>

    <Card className="border-primary/15 shadow-sm"><CardContent className="p-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7"><div className="space-y-1"><Label className="text-xs">Call date range</Label><Select value={preset} onValueChange={(value) => setPreset(value as DatePreset)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="last30">Last 30 days</SelectItem><SelectItem value="last90">Last 90 days</SelectItem><SelectItem value="ytd">Year to date</SelectItem><SelectItem value="custom">Custom range</SelectItem></SelectContent></Select></div><div className="space-y-1"><Label className="text-xs">From</Label><Input type="date" value={dateFrom} onChange={(event) => update({ preset: "custom", from: event.target.value || null })} /></div><div className="space-y-1"><Label className="text-xs">To</Label><Input type="date" value={dateTo} onChange={(event) => update({ preset: "custom", to: event.target.value || null })} /></div><div className="space-y-1"><Label className="text-xs">Current owner</Label><SearchableSelect className="w-full" value={agentId} options={[{ value: "all", label: "All current owners" }, ...(report?.availableFilters?.agents ?? []).map((agent: any) => ({ value: String(agent.id), label: agent.name }))]} onValueChange={(value) => update({ agentId: value === "all" ? null : value })} placeholder="All current owners" searchPlaceholder="Search staff…" /></div><div className="space-y-1"><Label className="text-xs">Lead source</Label><SearchableSelect className="w-full" value={leadSourceId} options={[{ value: "all", label: "All lead sources" }, ...(report?.availableFilters?.sources ?? []).map((source: any) => ({ value: String(source.id), label: source.name }))]} onValueChange={(value) => update({ leadSourceId: value === "all" ? null : value })} placeholder="All lead sources" searchPlaceholder="Search sources…" /></div><div className="space-y-1"><Label className="text-xs">Conversation</Label><div className="flex gap-2"><Select value={direction} onValueChange={(value) => update({ direction: value === "all" ? null : value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All directions</SelectItem><SelectItem value="inbound">Inbound</SelectItem><SelectItem value="outbound">Outbound</SelectItem></SelectContent></Select><Select value={transcript} onValueChange={(value) => update({ transcript: value === "all" ? null : value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Any transcript</SelectItem><SelectItem value="yes">Has transcript</SelectItem><SelectItem value="no">No transcript</SelectItem></SelectContent></Select></div></div><div className="space-y-1"><Label className="text-xs">Intelligence</Label><div className="flex gap-2"><Select value={intentTier} onValueChange={(value) => update({ intent: value === "all" ? null : value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All intent tiers</SelectItem><SelectItem value="priority">Priority</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="nurture">Nurture</SelectItem><SelectItem value="unknown">Unknown</SelectItem></SelectContent></Select><Input value={targetMarket} onChange={(event) => update({ market: event.target.value || null })} placeholder="Market" /></div></div></div><div className="mt-4 flex flex-wrap items-center justify-between gap-2"><p className="max-w-4xl text-xs leading-5 text-muted-foreground"><span className="font-medium text-foreground">Filter semantics:</span> dates filter call activity. Contact enrichment and CRM outcomes are observed for the same matched contacts. Source, owner, and intent are their present recorded values; they do not reconstruct historic ownership or causality.</p><div className="flex gap-2">{activeFilters && <Button size="sm" variant="ghost" onClick={() => navigate(`/analytics/conversation-intelligence?preset=last90&from=${defaultDates.from}&to=${defaultDates.to}`, { replace: true })}><Filter className="mr-1.5 h-3.5 w-3.5" />Reset</Button>}<Button size="sm" variant="outline" onClick={() => queueBackfill.mutate({ limit: 25 })} disabled={queueBackfill.isPending}><RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${queueBackfill.isPending ? "animate-spin" : ""}`} />{queueBackfill.isPending ? "Queueing…" : "Queue 25-pilot backfill"}</Button></div></div></CardContent></Card>

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label="Native transcript coverage" value={percent(summary.transcriptCoveragePct)} detail={`${integer(summary.transcriptCalls)} of ${integer(summary.eligibleCalls)} matched calls in scope`} icon={PhoneCall} /><MetricCard label="Profile enrichment" value={percent(summary.enrichmentCoveragePct)} detail={`${integer(summary.enrichedContacts)} of ${integer(summary.transcriptContacts)} transcript contacts`} icon={BrainCircuit} tone="text-violet-600" /><MetricCard label="Priority contacts" value={integer(summary.priorityContacts)} detail={`${percent(summary.priorityRatePct)} of transcript contacts; evidence-based triage, not a close probability`} icon={Target} tone="text-amber-600" /><MetricCard label="Average first-call speed" value={hours(summary.averageSpeedToLeadHours)} detail="Lead creation to first recorded matched Aircall call" icon={CalendarClock} tone="text-sky-600" /></section>

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label="Recorded appointments" value={integer(summary.appointments)} detail={`${percent(summary.appointmentRatePct)} of matched contacts with current appointment evidence`} icon={ClipboardCheck} tone="text-indigo-600" /><MetricCard label="Observed contracts" value={integer(summary.contractedContacts)} detail={`${percent(summary.contractRatePct)} of contacts following the first scoped call`} icon={TrendingUp} tone="text-emerald-600" /><MetricCard label="Observed GCI" value={money(summary.closedGci, true)} detail={`${integer(summary.closedContacts)} chronologically valid observed closes`} icon={CircleDollarSign} tone="text-emerald-600" /><MetricCard label="Recorded Savvy Net" value={money(summary.recordedSavvyNet, true)} detail="Only payout rows recorded in SavvyOS; not future revenue" icon={CircleDollarSign} tone="text-primary" /></section>

    <Card className="border-primary/15 bg-gradient-to-br from-primary/[0.045] via-background to-sky-50/50"><CardHeader className="pb-3"><div className="flex gap-3"><span className="h-fit rounded-xl bg-primary p-2.5 text-primary-foreground"><BrainCircuit className="h-5 w-5" /></span><div><CardTitle className="text-base">How to use this report</CardTitle><CardDescription className="mt-1">Start with coverage. Then use the action queue to recover clear follow-up opportunities, the funnel to locate observed loss points, and the source/market sections to prioritize real estate demand and intake improvements.</CardDescription></div></div></CardHeader><CardContent className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => scrollTo("action-queue")}>Open action queue</Button><Button size="sm" variant="outline" onClick={() => scrollTo("revenue-path")}>Review revenue path</Button><Button size="sm" variant="outline" onClick={() => scrollTo("objections")}>Review objections</Button><Button size="sm" variant="outline" onClick={() => scrollTo("sources-markets")}>Review sources & markets</Button>{summary.failedJobs > 0 && <Badge variant="destructive" className="h-8 gap-1"><AlertTriangle className="h-3.5 w-3.5" />{integer(summary.failedJobs)} extraction job{summary.failedJobs === 1 ? "" : "s"} need review</Badge>}{summary.unlinkedCalls > 0 && <Badge variant="outline" className="h-8 gap-1"><AlertTriangle className="h-3.5 w-3.5" />{integer(summary.unlinkedCalls)} unmatched Aircall call{summary.unlinkedCalls === 1 ? "" : "s"} excluded</Badge>}</CardContent></Card>

    <section id="action-queue" className="grid gap-5 xl:grid-cols-[1.3fr_0.7fr]"><Card><CardHeader><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><CardTitle className="text-base">Immediate action queue</CardTitle><CardDescription>Priority contacts from analyzed native transcripts. Rows without an open task are review opportunities; SavvyOS has not created client outreach, tasks, or stage changes automatically.</CardDescription></div><Badge variant="outline">{integer((report?.actionQueue ?? []).length)} in scope</Badge></div></CardHeader><CardContent>{report?.actionQueue?.length ? <TableShell><thead className="bg-muted/45 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-3 py-3">Contact / owner</th><th className="px-3 py-3">Evidence-led next action</th><th className="px-3 py-3">Last call</th><th className="px-3 py-3 text-right">Work state</th></tr></thead><tbody>{report.actionQueue.map((row: any) => <tr key={row.contactId} className="border-t transition-colors hover:bg-muted/25"><td className="px-3 py-3"><button type="button" className="inline-flex items-center gap-1 font-medium text-primary hover:underline" onClick={() => openContact(row.contactId)}>{row.contactName}<ExternalLink className="h-3.5 w-3.5" /></button><p className="mt-0.5 text-xs text-muted-foreground">{row.agentName} · {row.leadSourceName} · {integer(row.intentScore)}/100</p></td><td className="max-w-[350px] px-3 py-3 text-sm leading-5">{row.nextBestAction || row.promisedNextStep || "Review the evidence and agree one specific next action."}</td><td className="px-3 py-3 text-xs text-muted-foreground">{row.lastCallAt ?? "—"}</td><td className="px-3 py-3 text-right">{row.hasOpenTask ? <Badge variant="secondary">Open task exists</Badge> : <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">Review needed</Badge>}</td></tr>)}</tbody></TableShell> : <Empty title="No priority follow-up queue in this scope" description="Broaden the date range, queue a pilot backfill, or wait for new completed native transcripts to be enriched." />}</CardContent></Card><Card><CardHeader><CardTitle className="text-base">Coverage & quality</CardTitle><CardDescription>Interpret the operational findings in proportion to the available native evidence.</CardDescription></CardHeader><CardContent className="space-y-3"><div className="rounded-lg border p-3"><p className="text-sm font-semibold">{percent(summary.transcriptCoveragePct)} transcript coverage</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Calls without a completed native transcript remain visible in the coverage denominator but cannot provide Contact Intelligence signals.</p></div><div className="rounded-lg border p-3"><p className="text-sm font-semibold">{percent(summary.enrichmentCoveragePct)} profile enrichment</p><p className="mt-1 text-xs leading-5 text-muted-foreground">The durable extraction worker processes native transcript evidence at low concurrency and retains retries or failures for review.</p></div><div className="rounded-lg border p-3"><p className="text-sm font-semibold">Human CRM fields remain protected</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Profile updates refresh only derived intelligence and the AI contact briefing. Buy boxes, tasks, assignments, lifecycle stages, transactions, and consent require people or existing workflows.</p></div></CardContent></Card></section>

    <section id="revenue-path" className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]"><Card><CardHeader><CardTitle className="text-base">Observed conversation-to-revenue path</CardTitle><CardDescription>Counts show a transparent contact-level path from calls to later recorded CRM outcomes. It is not a multi-touch attribution model and does not establish causality.</CardDescription></CardHeader><CardContent><div className="h-[320px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={report?.funnel ?? []} margin={{ top: 12, right: 16, bottom: 72, left: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="stage" interval={0} angle={-32} textAnchor="end" height={90} tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} /><Tooltip formatter={(value: number) => integer(value)} /><Bar dataKey="count" name="Contacts / calls" radius={[5, 5, 0, 0]}>{(report?.funnel ?? []).map((_: any, index: number) => <Cell key={index} fill={["#0f766e", "#2563eb", "#7c3aed", "#d97706", "#4f46e5", "#059669", "#047857"][index] ?? "#2563eb"} />)}</Bar></BarChart></ResponsiveContainer></div></CardContent></Card><Card><CardHeader><CardTitle className="text-base">Intent, coaching, and follow-up integrity</CardTitle><CardDescription>Use these comparisons to identify questions or follow-up habits to inspect. Do not treat small samples, missing transcripts, or current ownership as definitive staff performance conclusions.</CardDescription></CardHeader><CardContent>{report?.coaching?.length ? <TableShell><thead className="bg-muted/45 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-3 py-3">Current owner</th><th className="px-3 py-3 text-right">Transcript contacts</th><th className="px-3 py-3 text-right">Priority</th><th className="px-3 py-3 text-right">Appointments</th><th className="px-3 py-3 text-right">Observed closes</th></tr></thead><tbody>{report.coaching.map((row: any) => <tr key={`${row.agentId}-${row.agentName}`} className="border-t"><td className="px-3 py-3 font-medium">{row.agentName}</td><td className="px-3 py-3 text-right tabular-nums">{integer(row.transcriptContacts)}</td><td className="px-3 py-3 text-right tabular-nums">{integer(row.priorityContacts)}</td><td className="px-3 py-3 text-right tabular-nums">{integer(row.appointments)}</td><td className="px-3 py-3 text-right tabular-nums">{integer(row.closedContacts)}</td></tr>)}</tbody></TableShell> : <Empty title="No owner comparison is available" description="Current ownership has not been recorded for the selected call scope." />}</CardContent></Card></section>

    <section id="objections" className="grid gap-5 xl:grid-cols-2"><Card><CardHeader><CardTitle className="text-base">Objection intelligence</CardTitle><CardDescription>Open or unresolved conversation friction as reflected in evidence-linked profile signals. Review the linked contact and source call before drawing a coaching or content conclusion.</CardDescription></CardHeader><CardContent>{report?.objections?.length ? <TableShell><thead className="bg-muted/45 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-3 py-3">Stated objection</th><th className="px-3 py-3 text-right">Contacts</th><th className="px-3 py-3 text-right">Mentions</th><th className="px-3 py-3 text-right">Priority</th></tr></thead><tbody>{report.objections.map((row: any, index: number) => <tr key={`${row.objection}-${index}`} className="border-t"><td className="max-w-[420px] px-3 py-3 leading-5">{row.objection}</td><td className="px-3 py-3 text-right tabular-nums">{integer(row.contacts)}</td><td className="px-3 py-3 text-right tabular-nums">{integer(row.mentions)}</td><td className="px-3 py-3 text-right tabular-nums">{integer(row.priorityContacts)}</td></tr>)}</tbody></TableShell> : <Empty title="No objection signals are available" description="As native transcripts are enriched, stated unresolved objections will appear here with coverage context." />}</CardContent></Card><Card><CardHeader><CardTitle className="text-base">Operational guardrails</CardTitle><CardDescription>Contact Intelligence is designed as a reviewable sales-assist system.</CardDescription></CardHeader><CardContent className="space-y-3"><div className="flex gap-3 rounded-lg border p-3"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /><p className="text-sm leading-5"><span className="font-semibold">Automatic:</span> derived profile, evidence links, profile freshness, intent explanation, data-quality counts, and AI contact briefing.</p></div><div className="flex gap-3 rounded-lg border p-3"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /><p className="text-sm leading-5"><span className="font-semibold">Human controlled:</span> CRM canonical data, assignments, lifecycle stage, buy box, tasks, appointments, consent, financial records, and client communication.</p></div><div className="flex gap-3 rounded-lg border p-3"><MessageSquareWarning className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" /><p className="text-sm leading-5"><span className="font-semibold">Evidence first:</span> every extracted signal is stored with its native Aircall call and a source excerpt for staff review.</p></div></CardContent></Card></section>

    <section id="sources-markets" className="grid gap-5 xl:grid-cols-2"><Card><CardHeader><CardTitle className="text-base">Lead-source conversation quality</CardTitle><CardDescription>Source comparison connects call volume, native transcript coverage, priority qualification, appointments, and observed recorded GCI. It intentionally does not claim marketing ROI because spend is not in this report.</CardDescription></CardHeader><CardContent>{report?.sources?.length ? <TableShell><thead className="bg-muted/45 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-3 py-3">Lead source</th><th className="px-3 py-3 text-right">Calls</th><th className="px-3 py-3 text-right">Transcript</th><th className="px-3 py-3 text-right">Priority</th><th className="px-3 py-3 text-right">Appointments</th><th className="px-3 py-3 text-right">Observed GCI</th></tr></thead><tbody>{report.sources.map((row: any) => <tr key={`${row.leadSourceId}-${row.leadSourceName}`} className="border-t"><td className="px-3 py-3 font-medium">{row.leadSourceName}</td><td className="px-3 py-3 text-right tabular-nums">{integer(row.calls)}</td><td className="px-3 py-3 text-right tabular-nums">{percent(row.calls ? (row.transcriptCalls / row.calls) * 100 : null)}</td><td className="px-3 py-3 text-right tabular-nums">{integer(row.priorityContacts)}</td><td className="px-3 py-3 text-right tabular-nums">{integer(row.appointments)}</td><td className="px-3 py-3 text-right font-medium tabular-nums">{money(row.observedGci, true)}</td></tr>)}</tbody></TableShell> : <Empty title="No source comparison is available" description="No matched Aircall conversations are available in the selected scope." />}</CardContent></Card><Card><CardHeader><CardTitle className="text-base">Market-demand intelligence</CardTitle><CardDescription>Stated target-market signals from native conversations. It helps prioritize coverage, inventory outreach, education, and agent expertise; it is not a market forecast.</CardDescription></CardHeader><CardContent>{report?.markets?.length ? <TableShell><thead className="bg-muted/45 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-3 py-3">Stated market</th><th className="px-3 py-3 text-right">Contacts</th><th className="px-3 py-3 text-right">Priority</th><th className="px-3 py-3 text-right">Observed closes</th><th className="px-3 py-3 text-right">Observed GCI</th></tr></thead><tbody>{report.markets.map((row: any, index: number) => <tr key={`${row.market}-${index}`} className="border-t"><td className="px-3 py-3 font-medium">{row.market}</td><td className="px-3 py-3 text-right tabular-nums">{integer(row.contacts)}</td><td className="px-3 py-3 text-right tabular-nums">{integer(row.priorityContacts)}</td><td className="px-3 py-3 text-right tabular-nums">{integer(row.closedContacts)}</td><td className="px-3 py-3 text-right font-medium tabular-nums">{money(row.observedGci, true)}</td></tr>)}</tbody></TableShell> : <Empty title="No market-demand signals are available" description="Target markets appear after the source transcript has been enriched and the conversation contains specific location evidence." />}</CardContent></Card></section>

    <Card id="conversation-evidence"><CardHeader><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><CardTitle className="text-base">Conversation evidence register</CardTitle><CardDescription>Open a person to review the Contact Intelligence profile, original native transcript, recorded tasks, and CRM outcome context. The report does not expose raw transcript text in aggregate views.</CardDescription></div><Badge variant="outline">Showing {Math.min((report?.evidence ?? []).length, 150)} transcript calls</Badge></div></CardHeader><CardContent>{report?.evidence?.length ? <TableShell><thead className="bg-muted/45 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-3 py-3">Contact</th><th className="px-3 py-3">Call context</th><th className="px-3 py-3">Intent</th><th className="px-3 py-3">Current evidence</th><th className="px-3 py-3">Owner / source</th></tr></thead><tbody>{report.evidence.map((row: any) => <tr key={row.aircallCallId} className="border-t transition-colors hover:bg-muted/25"><td className="px-3 py-3"><button type="button" className="inline-flex items-center gap-1 font-medium text-primary hover:underline" onClick={() => openContact(row.contactId)}>{row.contactName}<ExternalLink className="h-3.5 w-3.5" /></button><p className="mt-0.5 text-xs text-muted-foreground">{row.startedAt ?? "—"} · {title(row.direction)} · {integer(row.duration)}s</p></td><td className="px-3 py-3 text-sm"><p>{row.targetMarkets || "Market not established"}</p><p className="mt-0.5 text-xs text-muted-foreground">Timeline: {row.timeline || "Not discussed"}</p></td><td className="px-3 py-3"><Badge variant={row.intentTier === "priority" ? "default" : "outline"}>{title(row.intentTier)} · {integer(row.intentScore)}</Badge><p className="mt-1 text-xs text-muted-foreground">{title(row.confidence)} confidence</p></td><td className="max-w-[360px] px-3 py-3 text-sm leading-5">{row.nextBestAction || "Review the evidence-linked contact profile."}</td><td className="px-3 py-3 text-sm"><p>{row.agentName}</p><p className="mt-0.5 text-xs text-muted-foreground">{row.leadSourceName}</p></td></tr>)}</tbody></TableShell> : <Empty title="No transcript evidence is available" description="Queue a historical pilot or wait for a completed native Aircall transcript to be matched to a contact." />}</CardContent></Card>

    <Card><CardHeader><CardTitle className="text-base">Metric definitions and limits</CardTitle><CardDescription>Definitions stay visible so the operating report remains auditable and conservative.</CardDescription></CardHeader><CardContent className="grid gap-3 md:grid-cols-2">{Object.entries(report?.definitions ?? {}).map(([key, value]) => <div key={key} className="rounded-lg border p-3"><p className="text-sm font-semibold">{title(key)}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{String(value)}</p></div>)}</CardContent></Card>
  </div>;
}
