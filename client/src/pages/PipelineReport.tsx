import { useMemo, useState } from "react";
import { Activity, AlertTriangle, CalendarClock, CheckCircle2, ClipboardList, Workflow } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type PipelineReportProps = { data: any };
type SortDirection = "asc" | "desc";

function number(value: unknown): string {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? Math.round(amount).toLocaleString() : "—";
}

function percentage(value: unknown): string {
  const amount = Number(value);
  return Number.isFinite(amount) ? `${amount.toFixed(1)}%` : "—";
}

function day(value: unknown): string {
  if (!value) return "—";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function titleCase(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, match => match.toUpperCase());
}

function age(value: unknown): string {
  const days = Number(value ?? 0);
  return Number.isFinite(days) ? `${Math.round(days)}d` : "—";
}

function Metric({ label, value, description, icon: Icon, tone = "text-primary" }: { label: string; value: string; description: string; icon: typeof Workflow; tone?: string }) {
  return <Card className="h-full border-border/80 shadow-sm"><CardContent className="p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p></div><span className={`rounded-xl bg-muted p-2.5 ${tone}`}><Icon className="h-4 w-4" /></span></div></CardContent></Card>;
}

function Attention({ label, value, description, icon: Icon, tone }: { label: string; value: number; description: string; icon: typeof AlertTriangle; tone: "rose" | "amber" | "sky" | "violet" }) {
  const colors = { rose: "border-rose-200 bg-rose-50/60 text-rose-700", amber: "border-amber-200 bg-amber-50/60 text-amber-700", sky: "border-sky-200 bg-sky-50/60 text-sky-700", violet: "border-violet-200 bg-violet-50/60 text-violet-700" };
  return <a href="/pipeline" className="block"><Card className={`h-full transition hover:-translate-y-0.5 hover:shadow-sm ${colors[tone]}`}><CardContent className="p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-2xl font-semibold tabular-nums">{number(value)}</p><p className="mt-1 text-sm font-semibold">{label}</p><p className="mt-1 text-xs leading-5 opacity-80">{description}</p></div><Icon className="h-5 w-5 shrink-0" /></div></CardContent></Card></a>;
}

function SortHeader({ label, column, sortColumn, direction, onSort, className = "px-3 py-3 text-right font-semibold" }: { label: string; column: string; sortColumn: string; direction: SortDirection; onSort: (column: string) => void; className?: string }) {
  const active = sortColumn === column;
  return <th className={className}><button type="button" onClick={() => onSort(column)} className="inline-flex items-center justify-end gap-1 text-inherit hover:text-foreground">{label}<span className={`text-[10px] ${active ? "text-primary" : "text-muted-foreground/70"}`}>{active ? (direction === "desc" ? "↓" : "↑") : "↕"}</span></button></th>;
}

const stageTone: Record<string, string> = {
  new_lead: "border-sky-200 bg-sky-50 text-sky-800",
  attempted_contact: "border-indigo-200 bg-indigo-50 text-indigo-800",
  nurture: "border-amber-200 bg-amber-50 text-amber-800",
  active_client: "border-violet-200 bg-violet-50 text-violet-800",
  under_contract: "border-emerald-200 bg-emerald-50 text-emerald-800",
  closed: "border-emerald-200 bg-emerald-50 text-emerald-800",
  dead: "border-slate-200 bg-slate-50 text-slate-700",
  do_not_contact: "border-rose-200 bg-rose-50 text-rose-800",
};

export default function PipelineReport({ data }: PipelineReportProps) {
  const { summary, stageDistribution, agents } = data;
  const [sort, setSort] = useState<{ column: string; direction: SortDirection }>({ column: "openCount", direction: "desc" });
  const stageTotal = stageDistribution.reduce((total: number, stage: any) => total + Number(stage.count ?? 0), 0);
  const rows = useMemo(() => [...agents].sort((left: any, right: any) => {
    const leftValue = sort.column === "agentName" ? String(left.agentName).toLowerCase() : Number(left[sort.column] ?? 0);
    const rightValue = sort.column === "agentName" ? String(right.agentName).toLowerCase() : Number(right[sort.column] ?? 0);
    const difference = typeof leftValue === "string" && typeof rightValue === "string" ? leftValue.localeCompare(rightValue) : Number(leftValue) - Number(rightValue);
    return sort.direction === "desc" ? -difference : difference;
  }), [agents, sort]);
  const toggleSort = (column: string) => setSort(current => ({ column, direction: current.column === column && current.direction === "desc" ? "asc" : "desc" }));

  return <div className="space-y-7">
    <section className="rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/[0.08] via-background to-sky-50/60 p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Live Pipeline Snapshot</p><h2 className="mt-1 text-xl font-semibold tracking-tight">Pipeline health by agent</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Track active inventory, follow-up coverage, activity freshness, and stage mix across the agent team. Terminal records remain visible for context but do not count toward open-pipeline health.</p></div><Badge variant="secondary" className="h-7 w-fit">{number(agents.length)} agents in scope</Badge></div></section>

    <section><div className="mb-3"><h2 className="text-base font-semibold tracking-tight">Pipeline pulse</h2><p className="mt-1 text-sm text-muted-foreground">Current CRM inventory and the signals most likely to need attention.</p></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><Metric label="Open pipeline" value={number(summary.openCount)} description="Non-terminal client connections" icon={Workflow} /><Metric label="Follow-up coverage" value={summary.followUpCoverage === null ? "—" : percentage(summary.followUpCoverage)} description={`${number(summary.scheduledFollowUps)} open records have a next step`} icon={CalendarClock} tone="text-sky-700" /><Metric label="Appointments set" value={number(summary.appointments)} description="Connections with an appointment recorded" icon={CheckCircle2} tone="text-emerald-700" /><Metric label="Avg. activity age" value={age(summary.averageAgeDays)} description="Since qualifying lead activity" icon={Activity} tone="text-violet-700" /><Metric label="Critical inactivity" value={number(summary.criticalCount)} description="Open records idle for 30+ days" icon={AlertTriangle} tone="text-rose-700" /></div></section>

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Attention label="Overdue follow-ups" value={Number(summary.overdueFollowUps ?? 0)} description="Open records with a past-due next step" icon={CalendarClock} tone="rose" /><Attention label="Due today" value={Number(summary.dueToday ?? 0)} description="Open records requiring a touch today" icon={ClipboardList} tone="sky" /><Attention label="Missing follow-up" value={Number(summary.missingFollowUps ?? 0)} description="Open records without a scheduled next step" icon={AlertTriangle} tone="amber" /><Attention label="Stale activity" value={Number(summary.staleCount ?? 0) + Number(summary.olderCount ?? 0)} description="Open records idle for at least 7 days" icon={Activity} tone="violet" /></section>

    <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]"><Card><CardHeader><CardTitle className="text-base">Stage distribution</CardTitle><CardDescription>Every connection in scope, including terminal records, grouped by its current pipeline stage.</CardDescription></CardHeader><CardContent className="space-y-3">{stageDistribution.map((stage: any) => <div key={stage.stage} className="grid grid-cols-[132px_1fr_auto] items-center gap-3"><Badge variant="outline" className={`justify-center ${stageTone[stage.stage] ?? ""}`}>{titleCase(stage.stage)}</Badge><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${stageTotal ? (Number(stage.count) / stageTotal) * 100 : 0}%` }} /></div><span className="text-sm font-semibold tabular-nums">{number(stage.count)} <span className="text-xs font-medium text-muted-foreground">{stageTotal ? percentage((Number(stage.count) / stageTotal) * 100) : "—"}</span></span></div>)}</CardContent></Card><Card><CardHeader><CardTitle className="text-base">Activity freshness</CardTitle><CardDescription>Open connections by days since qualifying lead activity.</CardDescription></CardHeader><CardContent className="space-y-3">{[{ label: "Fresh · 0–2 days", value: summary.freshCount, tone: "bg-emerald-500" }, { label: "Idle · 3–6 days", value: summary.idleCount, tone: "bg-sky-500" }, { label: "Stale · 7–13 days", value: summary.staleCount, tone: "bg-amber-500" }, { label: "Aging · 14–29 days", value: summary.olderCount, tone: "bg-orange-500" }, { label: "Critical · 30+ days", value: summary.criticalCount, tone: "bg-rose-500" }].map(band => <div key={band.label} className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${band.tone}`} /><span className="text-sm">{band.label}</span></div><span className="font-semibold tabular-nums">{number(band.value)}</span></div>)}</CardContent></Card></section>

    <section><div className="mb-3"><h2 className="text-base font-semibold tracking-tight">Agent pipeline scorecard</h2><p className="mt-1 text-sm text-muted-foreground">Sort the table to surface the agent and stewardship signal that needs attention first.</p></div><Card><CardContent className="overflow-x-auto p-0"><table className="w-full min-w-[1400px] text-sm"><thead><tr className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground"><SortHeader label="Agent" column="agentName" sortColumn={sort.column} direction={sort.direction} onSort={toggleSort} className="px-4 py-3 text-left font-semibold" /><SortHeader label="Open" column="openCount" sortColumn={sort.column} direction={sort.direction} onSort={toggleSort} /><SortHeader label="New" column="newLeads" sortColumn={sort.column} direction={sort.direction} onSort={toggleSort} /><SortHeader label="Nurture" column="nurture" sortColumn={sort.column} direction={sort.direction} onSort={toggleSort} /><SortHeader label="Active" column="activeClient" sortColumn={sort.column} direction={sort.direction} onSort={toggleSort} /><SortHeader label="UC" column="underContract" sortColumn={sort.column} direction={sort.direction} onSort={toggleSort} /><SortHeader label="Appts." column="appointments" sortColumn={sort.column} direction={sort.direction} onSort={toggleSort} /><SortHeader label="Overdue" column="overdueFollowUps" sortColumn={sort.column} direction={sort.direction} onSort={toggleSort} /><SortHeader label="No next step" column="missingFollowUps" sortColumn={sort.column} direction={sort.direction} onSort={toggleSort} /><SortHeader label="Stale 7+d" column="staleCount" sortColumn={sort.column} direction={sort.direction} onSort={toggleSort} /><SortHeader label="Critical 30+d" column="criticalCount" sortColumn={sort.column} direction={sort.direction} onSort={toggleSort} /><SortHeader label="Avg. age" column="averageAgeDays" sortColumn={sort.column} direction={sort.direction} onSort={toggleSort} /><SortHeader label="Oldest" column="oldestAgeDays" sortColumn={sort.column} direction={sort.direction} onSort={toggleSort} /><SortHeader label="Total" column="total" sortColumn={sort.column} direction={sort.direction} onSort={toggleSort} /></tr></thead><tbody>{rows.map((agent: any) => <tr key={agent.agentId} className="border-b last:border-0 hover:bg-muted/25"><td className="px-4 py-3"><a href={`/pipeline?agentId=${agent.agentId}`} className="font-semibold text-primary hover:underline">{agent.agentName}</a><p className="mt-0.5 text-xs text-muted-foreground">Last activity {day(agent.latestActivityAt)}</p></td><td className="px-3 py-3 text-right font-semibold tabular-nums">{number(agent.openCount)}</td><td className="px-3 py-3 text-right tabular-nums">{number(agent.newLeads)}</td><td className="px-3 py-3 text-right tabular-nums">{number(agent.nurture)}</td><td className="px-3 py-3 text-right tabular-nums">{number(agent.activeClient)}</td><td className="px-3 py-3 text-right tabular-nums">{number(agent.underContract)}</td><td className="px-3 py-3 text-right tabular-nums">{number(agent.appointments)}</td><td className="px-3 py-3 text-right tabular-nums">{agent.overdueFollowUps ? <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">{number(agent.overdueFollowUps)}</Badge> : number(0)}</td><td className="px-3 py-3 text-right tabular-nums">{agent.missingFollowUps ? <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">{number(agent.missingFollowUps)}</Badge> : number(0)}</td><td className="px-3 py-3 text-right tabular-nums">{agent.staleCount ? <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">{number(agent.staleCount)}</Badge> : number(0)}</td><td className="px-3 py-3 text-right tabular-nums">{agent.criticalCount ? <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">{number(agent.criticalCount)}</Badge> : number(0)}</td><td className="px-3 py-3 text-right tabular-nums">{age(agent.averageAgeDays)}</td><td className="px-3 py-3 text-right tabular-nums">{age(agent.oldestAgeDays)}</td><td className="px-4 py-3 text-right tabular-nums">{number(agent.total)}</td></tr>)}{!rows.length && <tr><td colSpan={14} className="px-4 py-10 text-center text-sm text-muted-foreground">No agents match this pipeline scope.</td></tr>}</tbody></table><div className="border-t bg-muted/20 px-4 py-3 text-xs text-muted-foreground">Open pipeline excludes <span className="font-medium text-foreground">Closed</span>, <span className="font-medium text-foreground">Dead</span>, and <span className="font-medium text-foreground">Do not contact</span> records.</div></CardContent></Card></section>
  </div>;
}
