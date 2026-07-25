import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
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
  Lightbulb,
  LineChart as LineChartIcon,
  ListChecks,
  MapPin,
  RefreshCw,
  Target,
  TrendingDown,
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

type ViewId = "scorecard" | "transactions" | "sources" | "pipeline" | "people" | "growth" | "quality";
type DrillKind = "transactions" | "pipeline" | "tasks" | "people" | "sources" | "dataQuality";

type DrillState = {
  title: string;
  description: string;
  kind: DrillKind;
  rows: any[];
};

const NAVIGATION: Array<{ id: ViewId; label: string; shortLabel: string; description: string; icon: typeof BarChart3 }> = [
  { id: "scorecard", label: "Executive Scorecard & Attention", shortLabel: "Executive", description: "Business outcomes, risks, trends, and the weekly intelligence brief.", icon: BarChart3 },
  { id: "transactions", label: "Transactions & Financials", shortLabel: "Finance", description: "Transaction-level production, commission economics, and financial integrity.", icon: Wallet },
  { id: "sources", label: "Lead Sources & Partnerships", shortLabel: "Sources", description: "Observed source yield, production, and attribution coverage.", icon: Landmark },
  { id: "pipeline", label: "Pipeline & Follow-Up", shortLabel: "Pipeline", description: "Pipeline stages, aging, overdue follow-ups, and execution queues.", icon: ListChecks },
  { id: "people", label: "People & Execution", shortLabel: "People", description: "Production, trends, tasks, pipeline, activity, and coaching context by person.", icon: Users },
  { id: "growth", label: "Growth, Onboarding & Coaching", shortLabel: "Growth", description: "Goals, onboarding progress, coaching cadence, and market readiness.", icon: Target },
  { id: "quality", label: "Data Trust & Administration", shortLabel: "Data Trust", description: "Data-quality exceptions that affect reporting confidence and execution.", icon: Database },
];

const CHART_COLORS = ["#155e75", "#0f766e", "#2563eb", "#7c3aed", "#d97706", "#dc2626", "#0891b2", "#be185d"];
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
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  if (compact && Math.abs(number) >= 1_000_000) return `$${(number / 1_000_000).toFixed(1)}M`;
  if (compact && Math.abs(number) >= 1_000) return `$${(number / 1_000).toFixed(0)}k`;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(number);
}

function integer(value: unknown): string {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number.toLocaleString() : "—";
}

function percent(value: unknown, digits = 1): string {
  const number = Number(value);
  return Number.isFinite(number) ? `${(number * 100).toFixed(digits)}%` : "—";
}

function signedPercent(value: unknown): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return "No comparable prior period";
  return `${number >= 0 ? "+" : ""}${number.toFixed(1)}% vs. prior period`;
}

function dateLabel(value: unknown): string {
  if (!value) return "Not recorded";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "Not recorded";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function relativeAge(value: unknown): string {
  if (!value) return "Not recorded";
  const timestamp = new Date(String(value)).getTime();
  if (Number.isNaN(timestamp)) return "Not recorded";
  const days = Math.max(0, Math.floor((Date.now() - timestamp) / 86_400_000));
  return days === 0 ? "Today" : `${days}d ago`;
}

function truncate(value: unknown, length = 50): string {
  const stringValue = String(value ?? "");
  return stringValue.length > length ? `${stringValue.slice(0, length - 1)}…` : stringValue;
}

function toDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function resolvePreset(preset: string) {
  const today = new Date();
  const to = toDateInput(today);
  if (preset === "all") return { dateFrom: "", dateTo: "" };
  const from = new Date(today);
  if (preset === "ytd") {
    from.setMonth(0, 1);
  } else if (preset === "last30") {
    from.setDate(from.getDate() - 30);
  } else if (preset === "last90") {
    from.setDate(from.getDate() - 90);
  } else if (preset === "last12") {
    from.setFullYear(from.getFullYear() - 1);
  }
  return { dateFrom: toDateInput(from), dateTo: to };
}

function TrendPill({ value }: { value: unknown }) {
  const number = Number(value);
  if (!Number.isFinite(number)) return <span className="text-xs text-muted-foreground">No comparable prior period</span>;
  const positive = number >= 0;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${positive ? "text-emerald-700" : "text-rose-700"}`}>
      {positive ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
      {signedPercent(number)}
    </span>
  );
}

function MetricCard({
  label,
  value,
  note,
  trend,
  icon: Icon,
  onClick,
  accent = "teal",
}: {
  label: string;
  value: string;
  note?: string;
  trend?: unknown;
  icon: typeof DollarSign;
  onClick?: () => void;
  accent?: "teal" | "blue" | "amber" | "rose" | "violet";
}) {
  const accentMap = {
    teal: "bg-teal-50 text-teal-700 border-teal-100",
    blue: "bg-blue-50 text-blue-700 border-blue-100",
    amber: "bg-amber-50 text-amber-700 border-amber-100",
    rose: "bg-rose-50 text-rose-700 border-rose-100",
    violet: "bg-violet-50 text-violet-700 border-violet-100",
  };
  return (
    <Card
      className={`transition-all ${onClick ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-md focus-within:ring-2 focus-within:ring-primary/25" : ""}`}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
            <div className="mt-1.5 min-h-4">{trend !== undefined ? <TrendPill value={trend} /> : note ? <span className="text-xs text-muted-foreground">{note}</span> : null}</div>
          </div>
          <span className={`rounded-xl border p-2.5 ${accentMap[accent]}`}><Icon className="h-4 w-4" /></span>
        </div>
        {onClick && <div className="mt-3 flex items-center text-[11px] font-medium text-primary">View evidence <ChevronRight className="ml-0.5 h-3.5 w-3.5" /></div>}
      </CardContent>
    </Card>
  );
}

function SectionHeader({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {description && <p className="mt-0.5 max-w-3xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="flex min-h-40 flex-col items-center justify-center rounded-lg border border-dashed bg-muted/20 px-5 text-center"><p className="font-medium">{title}</p><p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p></div>;
}

function TableShell({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm">{children}</table></div>;
}

function TableHead({ children }: { children: React.ReactNode }) {
  return <thead className="border-b bg-muted/35 text-[11px] uppercase tracking-wide text-muted-foreground"><tr>{children}</tr></thead>;
}

function DrilldownDialog({ drill, onClose, navigate }: { drill: DrillState | null; onClose: () => void; navigate: (path: string) => void }) {
  if (!drill) return null;
  const rows = drill.rows ?? [];
  return (
    <Dialog open={Boolean(drill)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[85vh] max-w-6xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{drill.title}</DialogTitle>
          <DialogDescription>{drill.description}</DialogDescription>
        </DialogHeader>
        {rows.length === 0 ? <EmptyState title="No records in this selection" description="The selected filters did not return an underlying record for this metric." /> : (
          <TableShell>
            <TableHead>
              {drill.kind === "transactions" && <><th className="px-3 py-2 text-left">Transaction</th><th className="px-3 py-2 text-left">Client</th><th className="px-3 py-2 text-left">Agent</th><th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2 text-right">GCI</th><th className="px-3 py-2 text-right">Company</th><th className="px-3 py-2 text-right">Open</th></>}
              {drill.kind === "pipeline" && <><th className="px-3 py-2 text-left">Contact</th><th className="px-3 py-2 text-left">Agent</th><th className="px-3 py-2 text-left">Stage</th><th className="px-3 py-2 text-left">Last activity</th><th className="px-3 py-2 text-left">Follow-up</th><th className="px-3 py-2 text-right">Open</th></>}
              {drill.kind === "tasks" && <><th className="px-3 py-2 text-left">Task</th><th className="px-3 py-2 text-left">Assignee</th><th className="px-3 py-2 text-left">Due</th><th className="px-3 py-2 text-left">Related record</th><th className="px-3 py-2 text-right">Open</th></>}
              {drill.kind === "people" && <><th className="px-3 py-2 text-left">Person</th><th className="px-3 py-2 text-left">Role</th><th className="px-3 py-2 text-right">Current GCI</th><th className="px-3 py-2 text-right">Stalled</th><th className="px-3 py-2 text-left">Last coaching</th><th className="px-3 py-2 text-right">Open</th></>}
              {(drill.kind === "sources" || drill.kind === "dataQuality") && <><th className="px-3 py-2 text-left">Exception / source</th><th className="px-3 py-2 text-left">Details</th><th className="px-3 py-2 text-right">Count</th></>}
            </TableHead>
            <tbody className="divide-y">
              {rows.slice(0, 150).map((row, index) => {
                if (drill.kind === "transactions") return <tr key={row.id ?? index} className="hover:bg-muted/30"><td className="px-3 py-3 font-medium">{row.transactionNumber}</td><td className="px-3 py-3"><button className="text-primary hover:underline" onClick={() => navigate(`/contacts/${row.contactId}`)}>{row.contactName}</button></td><td className="px-3 py-3">{row.agentName}</td><td className="px-3 py-3"><Badge variant="secondary">{row.status}</Badge></td><td className="px-3 py-3 text-right font-medium">{money(row.grossCommissionIncome)}</td><td className="px-3 py-3 text-right">{money(row.companyDollars)}</td><td className="px-3 py-3 text-right"><Button variant="ghost" size="sm" onClick={() => navigate(`/transactions/${row.id}`)}><ExternalLink className="h-3.5 w-3.5" /></Button></td></tr>;
                if (drill.kind === "pipeline") return <tr key={row.connectionId ?? index} className="hover:bg-muted/30"><td className="px-3 py-3"><button className="font-medium text-primary hover:underline" onClick={() => navigate(`/contacts/${row.contactId}`)}>{row.contactName}</button></td><td className="px-3 py-3">{row.agentName}</td><td className="px-3 py-3"><Badge variant="secondary">{row.stageLabel}</Badge></td><td className="px-3 py-3">{row.ageDays}d ago</td><td className="px-3 py-3">{dateLabel(row.followUpDate)}</td><td className="px-3 py-3 text-right"><Button variant="ghost" size="sm" onClick={() => navigate(`/contacts/${row.contactId}`)}><ExternalLink className="h-3.5 w-3.5" /></Button></td></tr>;
                if (drill.kind === "tasks") return <tr key={row.id ?? index} className="hover:bg-muted/30"><td className="px-3 py-3 font-medium">{row.title}</td><td className="px-3 py-3">{row.assigneeName}</td><td className="px-3 py-3">{dateLabel(row.dueDate)}</td><td className="px-3 py-3">{row.contactId ? <button className="text-primary hover:underline" onClick={() => navigate(`/contacts/${row.contactId}`)}>{row.contactName}</button> : row.transactionId ? row.transactionNumber : "—"}</td><td className="px-3 py-3 text-right"><Button variant="ghost" size="sm" onClick={() => navigate(`/tasks/${row.id}`)}><ExternalLink className="h-3.5 w-3.5" /></Button></td></tr>;
                if (drill.kind === "people") return <tr key={row.userId ?? index} className="hover:bg-muted/30"><td className="px-3 py-3"><button className="font-medium text-primary hover:underline" onClick={() => navigate(`/agents/${row.userId}`)}>{row.name}</button></td><td className="px-3 py-3 capitalize">{row.role}</td><td className="px-3 py-3 text-right">{money(row.production?.currentGci)}</td><td className="px-3 py-3 text-right">{integer(row.execution?.stalledPipeline)}</td><td className="px-3 py-3">{dateLabel(row.coaching?.lastCoachingAt)}</td><td className="px-3 py-3 text-right"><Button variant="ghost" size="sm" onClick={() => navigate(`/agents/${row.userId}`)}><ExternalLink className="h-3.5 w-3.5" /></Button></td></tr>;
                return <tr key={row.key ?? row.sourceId ?? index}><td className="px-3 py-3 font-medium">{row.label ?? row.sourceName ?? "Exception"}</td><td className="px-3 py-3 text-muted-foreground">{row.metricWarning ?? row.severity ?? "Review the underlying records"}</td><td className="px-3 py-3 text-right font-semibold">{integer(row.count ?? row.leadCount ?? 0)}</td></tr>;
              })}
            </tbody>
          </TableShell>
        )}
      </DialogContent>
    </Dialog>
  );
}

function IntelligencePanel({ data, canRefresh, forceRefreshAllowed, onRefresh, refreshing, onNavigate }: { data: any; canRefresh: boolean; forceRefreshAllowed: boolean; onRefresh: () => void; refreshing: boolean; onNavigate: (kind: DrillKind) => void }) {
  const insights = data?.insights ?? [];
  const hasInsights = insights.length > 0;
  const typeVisual: Record<string, { icon: typeof Lightbulb; className: string }> = {
    warning: { icon: AlertTriangle, className: "bg-rose-50 border-rose-100 text-rose-800" },
    opportunity: { icon: Lightbulb, className: "bg-blue-50 border-blue-100 text-blue-800" },
    coaching: { icon: UserCheck, className: "bg-violet-50 border-violet-100 text-violet-800" },
    success: { icon: CheckCircle2, className: "bg-emerald-50 border-emerald-100 text-emerald-800" },
    data_quality: { icon: Database, className: "bg-amber-50 border-amber-100 text-amber-800" },
  };
  return (
    <Card className="border-primary/15 bg-gradient-to-br from-primary/[0.035] via-background to-teal-50/50">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-3">
            <div className="rounded-xl bg-primary p-2.5 text-primary-foreground"><Brain className="h-5 w-5" /></div>
            <div>
              <CardTitle className="text-base">Evidence-grounded intelligence brief</CardTitle>
              <CardDescription className="mt-1">Generated on first view for an authorized scope, cached by filter scope, refreshed at least weekly, and explicitly linked to evidence rather than treated as a source of truth.</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {data?.generatedAt && <span className="text-xs text-muted-foreground">Generated {relativeAge(data.generatedAt)}</span>}
            {canRefresh && (!hasInsights || forceRefreshAllowed) && <Button size="sm" variant="outline" onClick={onRefresh} disabled={refreshing}><RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />{refreshing ? "Generating" : hasInsights ? "Refresh now" : "Generate analysis"}</Button>}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {data?.summary && <p className="rounded-lg border bg-background/70 p-3 text-sm leading-6 text-muted-foreground">{data.summary}</p>}
        {insights.length === 0 ? <EmptyState title="Preparing the intelligence brief" description={canRefresh ? "This exact, authorized filter scope is being analyzed and then cached for reuse. If it does not appear, use Generate analysis to retry." : "The operational reports below remain available for this authorized scope."} /> : (
          <div className="grid gap-3 lg:grid-cols-2">
            {insights.map((insight: any, index: number) => {
              const visual = typeVisual[insight.type] ?? typeVisual.opportunity;
              const Icon = visual.icon;
              return <div key={`${insight.title}-${index}`} className="rounded-xl border bg-background p-4 shadow-sm">
                <div className="flex gap-3">
                  <span className={`h-fit rounded-lg border p-2 ${visual.className}`}><Icon className="h-4 w-4" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{insight.title}</h3><Badge variant={insight.priority === "high" ? "destructive" : "secondary"}>{insight.priority} priority</Badge><span className="text-[11px] text-muted-foreground">{insight.confidence} confidence</span></div>
                    <p className="mt-2 text-sm leading-5">{insight.observation}</p>
                    <p className="mt-2 text-sm leading-5 text-muted-foreground"><span className="font-medium text-foreground">Why it may matter: </span>{insight.explanation}</p>
                    <div className="mt-3 rounded-md bg-muted/45 p-2.5 text-xs"><span className="font-semibold">Owner: </span>{insight.owner}<br /><span className="font-semibold">Next action: </span>{insight.action}</div>
                    {insight.connectedSignals?.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{insight.connectedSignals.map((signal: string) => <Badge key={signal} variant="outline" className="text-[10px]">{signal}</Badge>)}</div>}
                    {insight.evidence?.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{insight.evidence.map((evidence: any, evidenceIndex: number) => <button key={`${evidence.label}-${evidenceIndex}`} onClick={() => onNavigate(evidence.drilldown)} className="rounded border bg-muted/20 px-2 py-1 text-left text-[11px] transition-colors hover:border-primary/40 hover:bg-primary/5"><span className="text-muted-foreground">{evidence.label}: </span><span className="font-semibold">{evidence.value}</span><span className="ml-1 text-primary">View</span></button>)}</div>}
                  </div>
                </div>
              </div>;
            })}
          </div>
        )}
        {data?.dataQualityNote && <p className="border-t pt-3 text-xs leading-5 text-muted-foreground"><span className="font-semibold">Confidence note:</span> {data.dataQualityNote}</p>}
      </CardContent>
    </Card>
  );
}

function ExecutiveView({ workspace, insights, canRefreshInsights, forceRefreshAllowed, onRefresh, refreshing, openDrill, navigateTo }: { workspace: any; insights: any; canRefreshInsights: boolean; forceRefreshAllowed: boolean; onRefresh: () => void; refreshing: boolean; openDrill: (title: string, description: string, kind: DrillKind, rows: any[]) => void; navigateTo: (kind: DrillKind) => void }) {
  const summary = workspace.summary;
  const trend = workspace.trend ?? [];
  const canSeeFinance = Boolean(workspace.scope?.canSeeFinance);
  const sourceChart = (workspace.sources ?? []).slice(0, 6).map((source: any) => ({ name: truncate(source.sourceName, 16), gci: Number(source.gci ?? 0), leads: Number(source.leadCount ?? 0) }));
  return <div className="space-y-6">
    <SectionHeader title="Executive Scorecard & Attention" description="Start with outcomes, then open the underlying records. Every positive or negative movement must be interpreted with its comparable period and evidence." />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Closed GCI" value={money(summary.gci, true)} trend={summary.gciTrendPct} icon={DollarSign} accent="teal" onClick={() => openDrill("Closed GCI evidence", "Transactions included in the selected date range and scope.", "transactions", workspace.transactions.rows.filter((row: any) => row.status === "closed"))} />
      <MetricCard label="Closings" value={integer(summary.closings)} trend={summary.closingsTrendPct} icon={CheckCircle2} accent="blue" onClick={() => openDrill("Closed transactions", "Every transaction supporting the selected closings total.", "transactions", workspace.transactions.rows.filter((row: any) => row.status === "closed"))} />
      <MetricCard label="Closed volume" value={money(summary.volume, true)} trend={summary.volumeTrendPct} icon={Building2} accent="violet" onClick={() => openDrill("Closed-volume evidence", "Transaction-level records behind the selected volume total.", "transactions", workspace.transactions.rows.filter((row: any) => row.status === "closed"))} />
      <MetricCard label={canSeeFinance ? "Company dollars" : "Company-dollar detail"} value={canSeeFinance ? money(summary.companyDollars, true) : "Restricted"} note={canSeeFinance ? "Payout items to Savvy STR Agents" : "Payout economics are available only to authorized financial roles."} icon={Wallet} accent="amber" onClick={canSeeFinance ? () => openDrill("Company-dollar evidence", "Payout-based company dollars by transaction. Review payout integrity flags before treating this as finalized economics.", "transactions", workspace.transactions.rows) : undefined} />
    </div>
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Under-contract records" value={integer(summary.underContractCount)} note={`${money(summary.pipelineValue, true)} purchase-price value`} icon={Target} accent="blue" onClick={() => openDrill("Under-contract records", "Current under-contract records in the selected scope; purchase price is not a revenue forecast.", "transactions", workspace.transactions.rows.filter((row: any) => row.status === "under_contract"))} />
      <MetricCard label="Stalled pipeline" value={integer(workspace.pipeline.stalledCount)} note="Active 14+ days without qualifying activity" icon={AlertTriangle} accent="rose" onClick={() => openDrill("Stalled pipeline", "Active pipeline records with no qualifying activity for at least 14 days.", "pipeline", workspace.pipeline.staleRecords)} />
      <MetricCard label="Overdue follow-ups" value={integer(workspace.pipeline.overdueFollowUpCount)} note="Active records with an overdue follow-up date" icon={CalendarClock} accent="amber" onClick={() => openDrill("Overdue follow-ups", "Active pipeline records whose recorded follow-up date is in the past.", "pipeline", workspace.pipeline.overdueFollowUps)} />
      <MetricCard label="Overdue tasks" value={integer(workspace.tasks.overdueCount)} note="Open tasks past their due date" icon={ClipboardCheck} accent="rose" onClick={() => openDrill("Overdue tasks", "Open tasks past their recorded due date.", "tasks", workspace.tasks.overdue)} />
    </div>
    <IntelligencePanel data={insights} canRefresh={canRefreshInsights} forceRefreshAllowed={forceRefreshAllowed} onRefresh={onRefresh} refreshing={refreshing} onNavigate={navigateTo} />
    <div className="grid gap-4 xl:grid-cols-3">
      <Card className="xl:col-span-2"><CardHeader><CardTitle className="text-base">Closed production trend</CardTitle><CardDescription>Monthly closed GCI and volume. The selection controls the date window; no trend is drawn for records without a closing date.</CardDescription></CardHeader><CardContent>{trend.length === 0 ? <EmptyState title="No closed production in this window" description="Change the period or filters to compare available transaction history." /> : <ResponsiveContainer width="100%" height={300}><AreaChart data={trend}><defs><linearGradient id="gciArea" x1="0" x2="0" y1="0" y2="1"><stop offset="5%" stopColor="#0f766e" stopOpacity={0.34}/><stop offset="95%" stopColor="#0f766e" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="month" tick={{ fontSize: 11 }}/><YAxis tickFormatter={(value) => money(value, true)} tick={{ fontSize: 11 }}/><Tooltip formatter={(value: number) => money(value)} /><Area type="monotone" dataKey="gci" name="Closed GCI" stroke="#0f766e" strokeWidth={2.5} fill="url(#gciArea)" /></AreaChart></ResponsiveContainer>}</CardContent></Card>
      <Card><CardHeader><CardTitle className="text-base">Decision context</CardTitle><CardDescription>Distribution of current operating attention.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="grid grid-cols-2 gap-3 text-center"><div className="rounded-lg bg-muted/50 p-3"><p className="text-xl font-semibold">{integer(workspace.pipeline.activeCount)}</p><p className="text-xs text-muted-foreground">Active pipeline</p></div><div className="rounded-lg bg-muted/50 p-3"><p className="text-xl font-semibold">{integer(workspace.dataQuality.total)}</p><p className="text-xs text-muted-foreground">Data exceptions</p></div></div><div className="border-t pt-3 text-sm text-muted-foreground"><p><span className="font-medium text-foreground">Average GCI:</span> {money(summary.averageGci)}</p><p className="mt-2"><span className="font-medium text-foreground">Median closed GCI:</span> {money(summary.medianGci)}</p><p className="mt-2 text-xs">Averages are sensitive to a small number of large deals; use the median with the transaction drill-down before judging normal deal size.</p></div></CardContent></Card>
    </div>
    <Card><CardHeader><CardTitle className="text-base">Top sources by selected-period closed GCI</CardTitle><CardDescription>Observed yield, not marketing ROI: SavvyOS does not currently store spend or cohort attribution sufficient for return-on-ad-spend claims.</CardDescription></CardHeader><CardContent>{sourceChart.length === 0 ? <EmptyState title="No attributed source outcomes" description="There are no source-attributed closings in the selected scope." /> : <ResponsiveContainer width="100%" height={260}><BarChart data={sourceChart} layout="vertical" margin={{ left: 20 }}><CartesianGrid strokeDasharray="3 3" horizontal={false}/><XAxis type="number" tickFormatter={(value) => money(value, true)} tick={{ fontSize: 11 }}/><YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 11 }}/><Tooltip formatter={(value: number) => money(value)} /><Bar dataKey="gci" name="Closed GCI" fill="#2563eb" radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer>}</CardContent></Card>
  </div>;
}

function TransactionsView({ workspace, openDrill, navigate }: { workspace: any; openDrill: (title: string, description: string, kind: DrillKind, rows: any[]) => void; navigate: (path: string) => void }) {
  const transactions = workspace.transactions;
  const rows = transactions.rows ?? [];
  const aggregates = transactions.aggregates ?? {};
  const canSeeFinance = Boolean(workspace.scope?.canSeeFinance);
  return <div className="space-y-6">
    <SectionHeader title="Transactions & Financials" description="This page separates production totals from payout economics. All totals can be opened to their transaction records; payout figures carry integrity context rather than pretending every commission is finalized." />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Transactions in selection" value={integer(aggregates.count)} note="All statuses included by the selected filter" icon={ListChecks} accent="blue" onClick={() => openDrill("All selected transactions", "The complete transaction register for this reporting selection.", "transactions", rows)} />
      <MetricCard label="Total GCI" value={money(aggregates.totalGci, true)} note="Sum of transaction GCI" icon={DollarSign} accent="teal" onClick={() => openDrill("GCI transaction register", "Underlying transactions for the total GCI sum.", "transactions", rows)} />
      <MetricCard label="Average / median GCI" value={`${money(aggregates.averageGci, true)} / ${money(aggregates.medianGci, true)}`} note="Use median to reduce outlier influence" icon={LineChartIcon} accent="violet" onClick={() => openDrill("GCI distribution records", "Transaction-level evidence for the average and median calculations.", "transactions", rows)} />
      <MetricCard label={canSeeFinance ? "Total company dollars" : "Company-dollar detail"} value={canSeeFinance ? money(aggregates.totalCompanyDollars, true) : "Restricted"} note={canSeeFinance ? "Sum of Savvy payout items" : "Payout economics are available only to authorized financial roles."} icon={Wallet} accent="amber" onClick={canSeeFinance ? () => openDrill("Company-dollar records", "Payout-derived company dollars; inspect flags and transaction details for exceptions.", "transactions", rows) : undefined} />
    </div>
    <Card><CardHeader><CardTitle className="text-base">Transaction register</CardTitle><CardDescription>Click a client, agent, or transaction to reach the underlying SavvyOS record. Sorting remains available in the full transaction workspace; this is a linked analytical register.</CardDescription></CardHeader><CardContent>{rows.length === 0 ? <EmptyState title="No transactions match this selection" description="Change the period, status, user, market, or source filter to inspect another set of records." /> : <TableShell><TableHead><th className="px-3 py-2 text-left">Transaction</th><th className="px-3 py-2 text-left">Client</th><th className="px-3 py-2 text-left">Agent</th><th className="px-3 py-2 text-left">Source</th><th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2 text-right">Price</th><th className="px-3 py-2 text-right">GCI</th>{canSeeFinance && <th className="px-3 py-2 text-right">Company $</th>}<th className="px-3 py-2 text-right">Open</th></TableHead><tbody className="divide-y">{rows.map((row: any) => <tr key={row.id} className="transition-colors hover:bg-muted/35"><td className="px-3 py-3 font-medium"><button className="text-primary hover:underline" onClick={() => navigate(`/transactions/${row.id}`)}>{row.transactionNumber}</button><p className="mt-0.5 text-xs text-muted-foreground">{dateLabel(row.closingDate ?? row.contractDate)}</p></td><td className="px-3 py-3"><button className="text-primary hover:underline" onClick={() => navigate(`/contacts/${row.contactId}`)}>{row.contactName}</button></td><td className="px-3 py-3"><button className="text-primary hover:underline" onClick={() => navigate(`/agents/${row.agentId}`)}>{row.agentName}</button></td><td className="px-3 py-3 text-muted-foreground">{row.sourceName}</td><td className="px-3 py-3"><Badge variant={row.status === "closed" ? "default" : "secondary"}>{row.status.replaceAll("_", " ")}</Badge>{canSeeFinance && row.payoutIntegrityFlag && <Badge variant="destructive" className="ml-1">Payout flag</Badge>}</td><td className="px-3 py-3 text-right">{money(row.purchasePrice)}</td><td className="px-3 py-3 text-right font-medium">{money(row.grossCommissionIncome)}</td>{canSeeFinance && <td className="px-3 py-3 text-right">{money(row.companyDollars)}</td>}<td className="px-3 py-3 text-right"><Button variant="ghost" size="sm" onClick={() => navigate(`/transactions/${row.id}`)}><ExternalLink className="h-3.5 w-3.5" /></Button></td></tr>)}</tbody></TableShell>}</CardContent></Card>
  </div>;
}

function SourcesView({ workspace, setLeadSourceId, goTransactions }: { workspace: any; setLeadSourceId: (value: string) => void; goTransactions: () => void }) {
  const sources = workspace.sources ?? [];
  const totalLeads = sources.reduce((sum: number, source: any) => sum + Number(source.leadCount ?? 0), 0);
  const totalGci = sources.reduce((sum: number, source: any) => sum + Number(source.gci ?? 0), 0);
  return <div className="space-y-6">
    <SectionHeader title="Lead Sources & Partnerships" description="Use this page to compare observed lead volume, closed production, average deal economics, and attributed yield. It does not call any metric ROI unless SavvyOS has spend and a valid cohort-attribution model." />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label="Attributed leads" value={integer(totalLeads)} note="Contacts created in the selected period" icon={Users} accent="blue" /><MetricCard label="Attributed closed GCI" value={money(totalGci, true)} note="Transactions closed in the selected period" icon={DollarSign} accent="teal" /><MetricCard label="Sources with outcomes" value={integer(sources.filter((source: any) => Number(source.closings) > 0).length)} note="At least one observed closing" icon={CheckCircle2} accent="violet" /><MetricCard label="Unattributed data risk" value={integer(workspace.dataQuality.issues.find((issue: any) => issue.key === "missingSource")?.count)} note="Contacts without a recorded source" icon={AlertTriangle} accent="amber" /></div>
    <Card><CardHeader><CardTitle className="text-base">Source outcome table</CardTitle><CardDescription>“Observed close yield” is selected-period closings ÷ selected-period leads, shown with an explicit timing limitation. Click a row to apply the source filter and inspect linked transactions.</CardDescription></CardHeader><CardContent>{sources.length === 0 ? <EmptyState title="No source records match this selection" description="Source outcomes will appear when contacts and closed transactions have recorded attribution." /> : <TableShell><TableHead><th className="px-3 py-2 text-left">Source</th><th className="px-3 py-2 text-left">Parent</th><th className="px-3 py-2 text-right">Leads</th><th className="px-3 py-2 text-right">Closings</th><th className="px-3 py-2 text-right">Closed GCI</th><th className="px-3 py-2 text-right">GCI / lead</th><th className="px-3 py-2 text-right">Observed yield</th><th className="px-3 py-2 text-right">Explore</th></TableHead><tbody className="divide-y">{sources.map((source: any) => <tr key={source.sourceId ?? source.sourceName} className="cursor-pointer transition-colors hover:bg-muted/35" onClick={() => { if (source.sourceId) { setLeadSourceId(String(source.sourceId)); goTransactions(); } }}><td className="px-3 py-3 font-medium">{source.sourceName}<p className="mt-0.5 max-w-[270px] text-xs font-normal text-muted-foreground">{source.metricWarning}</p></td><td className="px-3 py-3 text-muted-foreground">{source.parentSourceName ?? "—"}</td><td className="px-3 py-3 text-right">{integer(source.leadCount)}</td><td className="px-3 py-3 text-right">{integer(source.closings)}</td><td className="px-3 py-3 text-right font-medium">{money(source.gci)}</td><td className="px-3 py-3 text-right">{source.revenuePerLead === null ? "—" : money(source.revenuePerLead)}</td><td className="px-3 py-3 text-right">{source.observedCloseYield === null ? "—" : percent(source.observedCloseYield)}</td><td className="px-3 py-3 text-right"><ChevronRight className="ml-auto h-4 w-4 text-primary" /></td></tr>)}</tbody></TableShell>}</CardContent></Card>
  </div>;
}

function PipelineView({ workspace, openDrill, navigate }: { workspace: any; openDrill: (title: string, description: string, kind: DrillKind, rows: any[]) => void; navigate: (path: string) => void }) {
  const pipeline = workspace.pipeline;
  const funnel = pipeline.funnel ?? [];
  const pieData = funnel.filter((stage: any) => Number(stage.count) > 0);
  return <div className="space-y-6">
    <SectionHeader title="Pipeline & Follow-Up" description="The operating page for active records. It prioritizes dated commitments and aging over dashboard theater, and every exception opens to the associated contact record." />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label="Active pipeline" value={integer(pipeline.activeCount)} note="Excludes closed and dead stages" icon={Activity} accent="blue" onClick={() => openDrill("Active pipeline records", "All active connection records in the selected scope.", "pipeline", pipeline.allRecords.filter((record: any) => !["closed", "dead"].includes(record.stage)))} /><MetricCard label="Stalled 14+ days" value={integer(pipeline.stalledCount)} note="No qualifying activity since the aging date" icon={AlertTriangle} accent="rose" onClick={() => openDrill("Stalled pipeline", "Open these contacts and set a clearly owned next step.", "pipeline", pipeline.staleRecords)} /><MetricCard label="Overdue follow-ups" value={integer(pipeline.overdueFollowUpCount)} note="Follow-up date is past due" icon={CalendarClock} accent="amber" onClick={() => openDrill("Overdue follow-ups", "Contacts with a recorded but overdue follow-up date.", "pipeline", pipeline.overdueFollowUps)} /><MetricCard label="Overdue tasks" value={integer(workspace.tasks.overdueCount)} note="Separate explicit work commitments" icon={ClipboardCheck} accent="rose" onClick={() => openDrill("Overdue tasks", "Open tasks past their due date in the current scope.", "tasks", workspace.tasks.overdue)} /></div>
    <div className="grid gap-4 xl:grid-cols-2"><Card><CardHeader><CardTitle className="text-base">Pipeline by stage</CardTitle><CardDescription>Current-state counts—not conversion rates. Stage history is not stored sufficiently to claim stage-to-stage conversion timing.</CardDescription></CardHeader><CardContent>{funnel.length === 0 ? <EmptyState title="No pipeline records" description="No connections match the selected filters." /> : <ResponsiveContainer width="100%" height={300}><BarChart data={funnel}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="label" tick={{ fontSize: 10 }} interval={0}/><YAxis allowDecimals={false} tick={{ fontSize: 11 }}/><Tooltip /><Bar dataKey="count" name="Current records" radius={[4, 4, 0, 0]}>{funnel.map((entry: any) => <Cell key={entry.stage} fill={PIPELINE_COLORS[entry.stage] ?? "#64748b"} />)}</Bar></BarChart></ResponsiveContainer>}</CardContent></Card><Card><CardHeader><CardTitle className="text-base">Current stage mix</CardTitle><CardDescription>Use with the action queues to identify where records are concentrating.</CardDescription></CardHeader><CardContent>{pieData.length === 0 ? <EmptyState title="No active stage data" description="No connection records match this selection." /> : <ResponsiveContainer width="100%" height={300}><PieChart><Pie data={pieData} dataKey="count" nameKey="label" outerRadius={92} label={({ label, percent: pct }) => `${label} ${(pct * 100).toFixed(0)}%`}>{pieData.map((entry: any) => <Cell key={entry.stage} fill={PIPELINE_COLORS[entry.stage] ?? "#64748b"} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer>}</CardContent></Card></div>
    <Card><CardHeader><CardTitle className="text-base">Immediate action queue</CardTitle><CardDescription>Records are intentionally not summarized away. Click a contact to open the exact CRM record and resolve the gap.</CardDescription></CardHeader><CardContent>{pipeline.staleRecords.length === 0 && pipeline.overdueFollowUps.length === 0 ? <EmptyState title="No stalled or overdue pipeline exception" description="Continue maintaining dated follow-ups so the system can identify future risks." /> : <TableShell><TableHead><th className="px-3 py-2 text-left">Contact</th><th className="px-3 py-2 text-left">Agent</th><th className="px-3 py-2 text-left">Stage</th><th className="px-3 py-2 text-right">Idle days</th><th className="px-3 py-2 text-left">Follow-up</th><th className="px-3 py-2 text-left">Risk</th><th className="px-3 py-2 text-right">Open</th></TableHead><tbody className="divide-y">{[...pipeline.staleRecords, ...pipeline.overdueFollowUps].filter((row: any, index: number, list: any[]) => list.findIndex((candidate: any) => candidate.connectionId === row.connectionId) === index).slice(0, 75).map((row: any) => <tr key={row.connectionId} className="hover:bg-muted/35"><td className="px-3 py-3"><button className="font-medium text-primary hover:underline" onClick={() => navigate(`/contacts/${row.contactId}`)}>{row.contactName}</button><p className="text-xs text-muted-foreground">{row.sourceName}</p></td><td className="px-3 py-3">{row.agentName}</td><td className="px-3 py-3"><Badge variant="secondary">{row.stageLabel}</Badge></td><td className="px-3 py-3 text-right">{row.ageDays}</td><td className="px-3 py-3">{dateLabel(row.followUpDate)}</td><td className="px-3 py-3"><Badge variant={row.ageDays >= 14 ? "destructive" : "secondary"}>{row.ageDays >= 14 ? "Stalled" : "Follow-up overdue"}</Badge></td><td className="px-3 py-3 text-right"><Button variant="ghost" size="sm" onClick={() => navigate(`/contacts/${row.contactId}`)}><ExternalLink className="h-3.5 w-3.5" /></Button></td></tr>)}</tbody></TableShell>}</CardContent></Card>
  </div>;
}

function PeopleView({ workspace, openDrill, navigate }: { workspace: any; openDrill: (title: string, description: string, kind: DrillKind, rows: any[]) => void; navigate: (path: string) => void }) {
  const people = workspace.people ?? [];
  const atRisk = people.filter((person: any) => Number(person.execution?.stalledPipeline) > 0 || Number(person.execution?.overdueTasks) > 0 || (person.production?.gciTrendPct ?? 0) < -10);
  return <div className="space-y-6">
    <SectionHeader title="People & Execution" description="A coachable, evidence-linked scorecard. This page connects production and trend to current pipeline, tasks, recorded activity, coaching context, onboarding, and goals without asserting that one signal caused another." />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label="People in current scope" value={integer(people.length)} note="Active people visible to this viewer" icon={Users} accent="blue" onClick={() => openDrill("People in scope", "All active people included in this viewer's authorized analytics scope.", "people", people)} /><MetricCard label="With stalled pipeline" value={integer(people.filter((person: any) => Number(person.execution?.stalledPipeline) > 0).length)} note="Review assigned records before coaching" icon={AlertTriangle} accent="rose" onClick={() => openDrill("People with stalled pipeline", "People with one or more 14+ day inactive pipeline records.", "people", people.filter((person: any) => Number(person.execution?.stalledPipeline) > 0))} /><MetricCard label="Coached in recorded history" value={integer(people.filter((person: any) => person.coaching?.lastCoachingAt).length)} note="Leadership-feedback records only" icon={UserCheck} accent="violet" onClick={() => openDrill("People with coaching history", "People with at least one recorded leadership-feedback entry.", "people", people.filter((person: any) => person.coaching?.lastCoachingAt))} /><MetricCard label="Needs attention" value={integer(atRisk.length)} note="Negative trend, stalled pipeline, or overdue work" icon={Target} accent="amber" onClick={() => openDrill("People needing attention", "These flags initiate review; they do not determine a person's performance or a causal diagnosis.", "people", atRisk)} /></div>
    <Card><CardHeader><CardTitle className="text-base">Linked person scorecards</CardTitle><CardDescription>Production reflects selected-period closed transactions; prior production is the comparable preceding date window. Recorded activity is communications authored in the selected period and should not be treated as all work performed.</CardDescription></CardHeader><CardContent>{people.length === 0 ? <EmptyState title="No people in scope" description="The current role and filters do not return active people." /> : <TableShell><TableHead><th className="px-3 py-2 text-left">Person</th><th className="px-3 py-2 text-left">Market / role</th><th className="px-3 py-2 text-right">Current GCI</th><th className="px-3 py-2 text-right">Trend</th><th className="px-3 py-2 text-right">Pipeline</th><th className="px-3 py-2 text-right">Work</th><th className="px-3 py-2 text-left">Last coaching</th><th className="px-3 py-2 text-right">Open</th></TableHead><tbody className="divide-y">{people.map((person: any) => <tr key={person.userId} className="transition-colors hover:bg-muted/35"><td className="px-3 py-3"><button className="font-medium text-primary hover:underline" onClick={() => navigate(`/agents/${person.userId}`)}>{person.name}</button><p className="text-xs text-muted-foreground">{person.title ?? ""}</p></td><td className="px-3 py-3"><p className="capitalize">{person.role}</p><p className="text-xs text-muted-foreground">{person.marketName ?? "No market"}</p></td><td className="px-3 py-3 text-right"><p className="font-medium">{money(person.production?.currentGci)}</p><p className="text-xs text-muted-foreground">{integer(person.production?.currentClosings)} closing(s)</p></td><td className="px-3 py-3 text-right"><TrendPill value={person.production?.gciTrendPct} /></td><td className="px-3 py-3 text-right"><p>{integer(person.execution?.activePipeline)} active</p><p className={`text-xs ${Number(person.execution?.stalledPipeline) > 0 ? "text-rose-700" : "text-muted-foreground"}`}>{integer(person.execution?.stalledPipeline)} stalled</p></td><td className="px-3 py-3 text-right"><p>{integer(person.execution?.openTasks)} open</p><p className={`text-xs ${Number(person.execution?.overdueTasks) > 0 ? "text-rose-700" : "text-muted-foreground"}`}>{integer(person.execution?.overdueTasks)} overdue</p></td><td className="px-3 py-3"><p>{dateLabel(person.coaching?.lastCoachingAt)}</p><p className="text-xs text-muted-foreground">{person.coaching?.lastCoachName ? `by ${person.coaching.lastCoachName}` : "No recorded coach"}</p></td><td className="px-3 py-3 text-right"><Button variant="ghost" size="sm" onClick={() => navigate(`/agents/${person.userId}`)}><ExternalLink className="h-3.5 w-3.5" /></Button></td></tr>)}</tbody></TableShell>}</CardContent></Card>
  </div>;
}

function GrowthView({ workspace, navigate }: { workspace: any; navigate: (path: string) => void }) {
  const people = workspace.people ?? [];
  const growth = workspace.growth;
  const attainmentRows = growth?.annualGoalCoverage?.attainment ?? [];
  const onboarding = growth?.onboarding ?? [];
  const markets = growth?.markets ?? [];
  return <div className="space-y-6">
    <SectionHeader title="Growth, Onboarding & Coaching" description="A current-data view of goal coverage, onboarding work, recorded coaching cadence, and market configuration. It avoids inventing recruiting funnel, appointment, or license-status metrics that SavvyOS does not presently store." />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label="Annual GCI goal coverage" value={`${integer(growth?.annualGoalCoverage?.peopleWithAnnualGciTargets)} / ${integer(growth?.annualGoalCoverage?.activePeople)}`} note="People with an annual goal record" icon={Target} accent="teal" /><MetricCard label="In-progress onboarding" value={integer(onboarding.length)} note="Instances / remaining tasks currently recorded" icon={ClipboardCheck} accent="blue" /><MetricCard label="Recorded coaching follow-ups" value={integer(people.filter((person: any) => person.coaching?.nextFollowUpDate).length)} note="Future follow-up date on leadership feedback" icon={UserCheck} accent="violet" /><MetricCard label="Configured markets" value={integer(markets.length)} note="Market-profile records visible to administrators" icon={MapPin} accent="amber" /></div>
    <div className="grid gap-4 xl:grid-cols-2"><Card><CardHeader><CardTitle className="text-base">Annual goal progress</CardTitle><CardDescription>Annual target attainment uses selected-period closed production against the current-year annual goal. It is not a full-year forecast.</CardDescription></CardHeader><CardContent className="space-y-4">{attainmentRows.length === 0 ? <EmptyState title="No goal records" description="Set annual goals to enable goal-coverage and attainment review." /> : attainmentRows.map((row: any) => <button key={row.userId} onClick={() => navigate(`/agents/${row.userId}`)} className="block w-full rounded-lg border p-3 text-left transition-colors hover:border-primary/40 hover:bg-muted/25"><div className="flex items-center justify-between gap-3"><div><p className="font-medium">{row.name}</p><p className="text-xs text-muted-foreground">Target {row.gciTarget === null ? "not set" : money(row.gciTarget)}</p></div><span className="font-semibold">{row.gciAttainment === null ? "—" : percent(row.gciAttainment, 0)}</span></div><Progress className="mt-2 h-2" value={Math.max(0, Math.min(100, Number(row.gciAttainment ?? 0) * 100))} /></button>)}</CardContent></Card><Card><CardHeader><CardTitle className="text-base">Onboarding & coaching follow-through</CardTitle><CardDescription>These fields are only as current as the recorded onboarding and leadership-feedback workflows.</CardDescription></CardHeader><CardContent>{onboarding.length === 0 ? <EmptyState title="No active onboarding exception" description="No person in this scope has an in-progress onboarding status or remaining onboarding task." /> : <div className="space-y-2">{onboarding.map((person: any) => <button key={person.userId} onClick={() => navigate(`/agents/${person.userId}`)} className="flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors hover:border-primary/40 hover:bg-muted/25"><div><p className="font-medium">{person.name}</p><p className="text-xs text-muted-foreground">{person.onboarding.status ?? "No status"} · {integer(person.onboarding.remainingTasks)} remaining task(s)</p></div><ChevronRight className="h-4 w-4 text-primary" /></button>)}</div>}</CardContent></Card></div>
    {markets.length > 0 && <Card><CardHeader><CardTitle className="text-base">Market configuration & readiness</CardTitle><CardDescription>Configuration evidence from existing market and agent-profile records. “Licenses expiring soon” reflects a stored expiration date only; it is not a statement of license validity.</CardDescription></CardHeader><CardContent><TableShell><TableHead><th className="px-3 py-2 text-left">Market</th><th className="px-3 py-2 text-left">Region</th><th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2 text-right">Assigned agents</th><th className="px-3 py-2 text-right">Annual GCI target</th><th className="px-3 py-2 text-right">License dates within 90d</th></TableHead><tbody className="divide-y">{markets.map((market: any) => <tr key={market.id}><td className="px-3 py-3 font-medium">{market.name}<p className="text-xs text-muted-foreground">{market.state}</p></td><td className="px-3 py-3">{market.region ?? "—"}</td><td className="px-3 py-3"><Badge variant="secondary">{market.status}</Badge></td><td className="px-3 py-3 text-right">{integer(market.assignedAgents)}</td><td className="px-3 py-3 text-right">{market.annualGciGoal === null ? "—" : money(market.annualGciGoal)}</td><td className="px-3 py-3 text-right">{integer(market.licensesExpiringSoon)}</td></tr>)}</tbody></TableShell></CardContent></Card>}
  </div>;
}

function QualityView({ workspace, openDrill }: { workspace: any; openDrill: (title: string, description: string, kind: DrillKind, rows: any[]) => void }) {
  const issues = workspace.dataQuality?.issues ?? [];
  const severityClass: Record<string, string> = { high: "bg-rose-50 text-rose-700 border-rose-100", medium: "bg-amber-50 text-amber-700 border-amber-100", low: "bg-blue-50 text-blue-700 border-blue-100" };
  return <div className="space-y-6">
    <SectionHeader title="Data Trust & Administration" description="Report confidence comes from complete records and operational hygiene. These are not vanity scores: each exception is tied to a repair path and its downstream reporting impact." />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label="Total surfaced exceptions" value={integer(workspace.dataQuality?.total)} note="Sum of current quality and execution exceptions" icon={Database} accent="amber" onClick={() => openDrill("All data-quality exceptions", "Aggregate exception counts currently detected in the selected scope.", "dataQuality", issues)} /><MetricCard label="Financial integrity flags" value={integer(issues.filter((issue: any) => ["missingGci", "payoutIntegrityFlags", "missingPayouts"].includes(issue.key)).reduce((sum: number, issue: any) => sum + Number(issue.count ?? 0), 0))} note="Can change finance interpretation" icon={Wallet} accent="rose" /><MetricCard label="Attribution gaps" value={integer(issues.filter((issue: any) => ["missingSource", "missingContactMethod"].includes(issue.key)).reduce((sum: number, issue: any) => sum + Number(issue.count ?? 0), 0))} note="Limits source-level interpretation" icon={Landmark} accent="amber" /><MetricCard label="Execution gaps" value={integer(issues.filter((issue: any) => ["stalePipeline", "overdueTasks"].includes(issue.key)).reduce((sum: number, issue: any) => sum + Number(issue.count ?? 0), 0))} note="Priority operating work" icon={Activity} accent="blue" /></div>
    <Card><CardHeader><CardTitle className="text-base">Exception register and repair priorities</CardTitle><CardDescription>Click an issue to open the appropriate record group. Some categories currently support aggregate evidence only; the application preserves that limitation rather than creating an unsupported record list.</CardDescription></CardHeader><CardContent>{issues.length === 0 ? <EmptyState title="No quality exceptions surfaced" description="Continue reviewing data coverage; absence of a detected issue is not proof of complete or accurate data." /> : <div className="divide-y rounded-lg border">{issues.map((issue: any) => <button key={issue.key} className="flex w-full items-center gap-4 p-4 text-left transition-colors hover:bg-muted/30" onClick={() => {
      const kind = issue.drilldown as DrillKind;
      const rows = kind === "transactions" ? workspace.transactions.rows : kind === "pipeline" ? workspace.pipeline.staleRecords : kind === "tasks" ? workspace.tasks.overdue : kind === "people" ? workspace.people : kind === "sources" ? workspace.sources : issues;
      openDrill(issue.label, "Review linked records or the current aggregate evidence and repair the source workflow.", kind, rows);
    }}><span className={`rounded-lg border px-2 py-1 text-xs font-semibold capitalize ${severityClass[issue.severity] ?? severityClass.low}`}>{issue.severity}</span><div className="min-w-0 flex-1"><p className="font-medium">{issue.label}</p><p className="mt-0.5 text-xs text-muted-foreground">{issue.count > 0 ? "Open evidence and repair the data or operational workflow at the source." : "No current exception in this selection."}</p></div><span className="text-xl font-semibold">{integer(issue.count)}</span><ChevronRight className="h-4 w-4 text-primary" /></button>)}</div>}</CardContent></Card>
  </div>;
}

export default function AnalyticsPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const isAdmin = user?.role === "admin";
  const [view, setView] = useState<ViewId>("scorecard");
  const [rangePreset, setRangePreset] = useState("ytd");
  const [dateFrom, setDateFrom] = useState(() => resolvePreset("ytd").dateFrom);
  const [dateTo, setDateTo] = useState(() => resolvePreset("ytd").dateTo);
  const [agentId, setAgentId] = useState("all");
  const [marketId, setMarketId] = useState("all");
  const [leadSourceId, setLeadSourceId] = useState("all");
  const [status, setStatus] = useState("all");
  const [drill, setDrill] = useState<DrillState | null>(null);
  const autoInsightScopes = useRef(new Set<string>());

  const queryInput = useMemo(() => ({
    dateFrom: dateFrom ? new Date(`${dateFrom}T00:00:00`).toISOString() : undefined,
    dateTo: dateTo ? new Date(`${dateTo}T23:59:59.999`).toISOString() : undefined,
    agentId: agentId === "all" ? undefined : Number(agentId),
    marketProfileId: marketId === "all" ? undefined : Number(marketId),
    leadSourceId: leadSourceId === "all" ? undefined : Number(leadSourceId),
    status: status as "all" | "closed" | "under_contract" | "terminated",
  }), [dateFrom, dateTo, agentId, marketId, leadSourceId, status]);

  const workspaceQuery = trpc.analytics.workspace.useQuery(queryInput, { refetchInterval: 60_000, staleTime: 30_000 });
  const insightsQuery = trpc.analytics.workspaceInsights.useQuery(queryInput, { refetchInterval: 300_000, staleTime: 60_000 });
  const refreshInsight = trpc.analytics.refreshWorkspaceInsights.useMutation({
    onSuccess: () => {
      utils.analytics.workspaceInsights.invalidate(queryInput);
    },
  });

  const workspace = workspaceQuery.data as any;
  const canRefreshInsights = Boolean(workspace?.scope?.canRefreshInsights);
  const insightScopeKey = useMemo(() => JSON.stringify(queryInput), [queryInput]);

  // A new authorized scope receives one cache-building request on first view.
  // A ref prevents render/refetch loops; after that, the seven-day cache and
  // administrator-only forced refresh govern model usage.
  useEffect(() => {
    const cached = insightsQuery.data as any;
    const hasCachedBrief = Boolean(cached?.insights?.length);
    if (!canRefreshInsights || workspaceQuery.isLoading || insightsQuery.isLoading || refreshInsight.isPending || hasCachedBrief || autoInsightScopes.current.has(insightScopeKey)) return;
    autoInsightScopes.current.add(insightScopeKey);
    refreshInsight.mutate({ ...queryInput, force: false });
  }, [canRefreshInsights, insightScopeKey, insightsQuery.data, insightsQuery.isLoading, queryInput, refreshInsight, workspaceQuery.isLoading]);
  const activeNav = NAVIGATION.find((item) => item.id === view) ?? NAVIGATION[0];
  const openDrill = (title: string, description: string, kind: DrillKind, rows: any[]) => setDrill({ title, description, kind, rows });
  const onPresetChange = (next: string) => {
    setRangePreset(next);
    if (next !== "custom") {
      const range = resolvePreset(next);
      setDateFrom(range.dateFrom);
      setDateTo(range.dateTo);
    }
  };
  const navigateEvidence = (kind: DrillKind) => {
    const pageByKind: Record<DrillKind, ViewId> = { transactions: "transactions", pipeline: "pipeline", tasks: "pipeline", people: "people", sources: "sources", dataQuality: "quality" };
    setView(pageByKind[kind]);
  };

  return <div className="space-y-5">
    <PageHeader title="Analytics & Reporting" subtitle="A linked decision workspace: outcomes → operating evidence → accountable action. Metrics are scope-controlled, filter-aware, and drillable to SavvyOS records." />
    <Card className="border-primary/15"><CardContent className="p-4"><div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between"><div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"><div className="space-y-1"><Label className="text-xs">Reporting period</Label><Select value={rangePreset} onValueChange={onPresetChange}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ytd">Year to date</SelectItem><SelectItem value="last30">Last 30 days</SelectItem><SelectItem value="last90">Last 90 days</SelectItem><SelectItem value="last12">Last 12 months</SelectItem><SelectItem value="all">All history</SelectItem><SelectItem value="custom">Custom dates</SelectItem></SelectContent></Select></div><div className="space-y-1"><Label className="text-xs">From</Label><Input type="date" value={dateFrom} onChange={(event) => { setRangePreset("custom"); setDateFrom(event.target.value); }} className="h-9" /></div><div className="space-y-1"><Label className="text-xs">To</Label><Input type="date" value={dateTo} onChange={(event) => { setRangePreset("custom"); setDateTo(event.target.value); }} className="h-9" /></div><div className="space-y-1"><Label className="text-xs">Person</Label><Select value={agentId} onValueChange={setAgentId}><SelectTrigger className="h-9"><SelectValue placeholder="All visible people" /></SelectTrigger><SelectContent><SelectItem value="all">All visible people</SelectItem>{(workspace?.availableFilters?.agents ?? []).map((person: any) => <SelectItem key={person.id} value={String(person.id)}>{person.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1"><Label className="text-xs">Market</Label><Select value={marketId} onValueChange={setMarketId} disabled={!isAdmin}><SelectTrigger className="h-9"><SelectValue placeholder="All visible markets" /></SelectTrigger><SelectContent><SelectItem value="all">All visible markets</SelectItem>{(workspace?.availableFilters?.markets ?? []).map((market: any) => <SelectItem key={market.id} value={String(market.id)}>{market.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1"><Label className="text-xs">Source / status</Label><div className="flex gap-1"><Select value={leadSourceId} onValueChange={setLeadSourceId}><SelectTrigger className="h-9 min-w-0 flex-1"><SelectValue placeholder="Source" /></SelectTrigger><SelectContent><SelectItem value="all">All sources</SelectItem>{(workspace?.availableFilters?.sources ?? []).map((source: any) => <SelectItem key={source.id} value={String(source.id)}>{source.name}</SelectItem>)}</SelectContent></Select><Select value={status} onValueChange={setStatus}><SelectTrigger className="h-9 w-[105px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All</SelectItem><SelectItem value="closed">Closed</SelectItem><SelectItem value="under_contract">Under contract</SelectItem><SelectItem value="terminated">Terminated</SelectItem></SelectContent></Select></div></div></div><Button variant="outline" className="self-start xl:self-auto" onClick={() => { setRangePreset("ytd"); const range = resolvePreset("ytd"); setDateFrom(range.dateFrom); setDateTo(range.dateTo); setAgentId("all"); setMarketId("all"); setLeadSourceId("all"); setStatus("all"); }}><Filter className="mr-1.5 h-4 w-4" />Reset</Button></div><p className="mt-3 text-xs text-muted-foreground">{workspace?.scope?.label ?? "Loading authorized scope…"} · Filters narrow this viewer’s authorized scope; they never expand access. Financial payout detail is controlled by role.</p></CardContent></Card>
    {workspaceQuery.isLoading ? <div className="grid min-h-80 place-items-center rounded-xl border bg-muted/20"><div className="text-center"><RefreshCw className="mx-auto h-6 w-6 animate-spin text-primary" /><p className="mt-3 text-sm text-muted-foreground">Building the connected analytics workspace…</p></div></div> : workspaceQuery.error ? <Card className="border-rose-200"><CardContent className="p-6"><div className="flex gap-3"><AlertTriangle className="h-5 w-5 text-rose-600" /><div><p className="font-semibold">Analytics workspace could not be loaded.</p><p className="mt-1 text-sm text-muted-foreground">{workspaceQuery.error.message}</p><Button className="mt-3" size="sm" onClick={() => workspaceQuery.refetch()}>Try again</Button></div></div></CardContent></Card> : workspace && <div className="flex flex-col gap-5 2xl:flex-row"><aside className="2xl:w-64 2xl:shrink-0"><nav className="grid gap-1 sm:grid-cols-2 lg:grid-cols-4 2xl:block">{NAVIGATION.map((item) => { const Icon = item.icon; const active = item.id === view; return <button key={item.id} onClick={() => setView(item.id)} className={`rounded-lg p-3 text-left transition-colors 2xl:mb-1 2xl:w-full ${active ? "bg-primary text-primary-foreground shadow-sm" : "hover:bg-muted"}`}><div className="flex items-center gap-2"><Icon className="h-4 w-4" /><span className="text-sm font-medium 2xl:hidden">{item.shortLabel}</span><span className="hidden text-sm font-medium 2xl:block">{item.shortLabel}</span></div><p className={`mt-1 hidden text-xs leading-4 2xl:block ${active ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{item.description}</p></button>; })}</nav></aside><main className="min-w-0 flex-1"><div className="mb-5 border-b pb-4"><div className="flex items-start gap-3"><span className="rounded-lg bg-primary/10 p-2 text-primary"><activeNav.icon className="h-5 w-5" /></span><div><h1 className="text-xl font-semibold tracking-tight">{activeNav.label}</h1><p className="mt-1 text-sm text-muted-foreground">{activeNav.description}</p></div></div></div>{view === "scorecard" && <ExecutiveView workspace={workspace} insights={insightsQuery.data} canRefreshInsights={canRefreshInsights} forceRefreshAllowed={isAdmin} onRefresh={() => refreshInsight.mutate({ ...queryInput, force: isAdmin })} refreshing={refreshInsight.isPending} openDrill={openDrill} navigateTo={navigateEvidence} />}{view === "transactions" && <TransactionsView workspace={workspace} openDrill={openDrill} navigate={navigate} />}{view === "sources" && <SourcesView workspace={workspace} setLeadSourceId={setLeadSourceId} goTransactions={() => setView("transactions")} />}{view === "pipeline" && <PipelineView workspace={workspace} openDrill={openDrill} navigate={navigate} />}{view === "people" && <PeopleView workspace={workspace} openDrill={openDrill} navigate={navigate} />}{view === "growth" && <GrowthView workspace={workspace} navigate={navigate} />}{view === "quality" && <QualityView workspace={workspace} openDrill={openDrill} />}</main></div>}
    <DrilldownDialog drill={drill} onClose={() => setDrill(null)} navigate={navigate} />
  </div>;
}
