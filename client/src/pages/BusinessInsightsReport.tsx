import {
  AlertTriangle,
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  Clock3,
  DatabaseZap,
  Lightbulb,
  RefreshCw,
  ShieldCheck,
  Target,
  TrendingUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Drilldown = "agents" | "leaders" | "transactions" | "tasks" | "isa" | "sources" | "markets" | "onboarding";

type Evidence = {
  label: string;
  value: string;
  report: string;
  drilldown: Drilldown;
};

type Insight = {
  type: "risk" | "opportunity" | "performance" | "coaching" | "data_quality";
  priority: "high" | "medium" | "low";
  confidence: "high" | "medium" | "limited";
  title: string;
  observation: string;
  hypothesis: string;
  businessImpact: string;
  owner: string;
  nextAction: string;
  connectedSignals: string[];
  evidence: Evidence[];
};

export type BusinessInsightsData = {
  executiveSummary: string;
  companyHealth: { label: "strong" | "stable" | "watch" | "at_risk"; score: number; rationale: string };
  keyThemes: string[];
  insights: Insight[];
  dataQualityNote: string;
  generationMethod: "model" | "deterministic";
  generatedAt?: string;
  expiresAt?: string;
  isStale?: boolean;
  status?: "ready" | "refreshing" | "failed";
  model?: string | null;
  refreshReason?: "manual" | "scheduled" | "automatic" | null;
  errorMessage?: string | null;
};

function formatTimestamp(value?: string) {
  if (!value) return "Not generated yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

const typeStyle: Record<Insight["type"], { label: string; className: string; icon: typeof AlertTriangle }> = {
  risk: { label: "Risk", className: "border-rose-200 bg-rose-50 text-rose-700", icon: AlertTriangle },
  opportunity: { label: "Opportunity", className: "border-emerald-200 bg-emerald-50 text-emerald-700", icon: TrendingUp },
  performance: { label: "Performance", className: "border-sky-200 bg-sky-50 text-sky-700", icon: CheckCircle2 },
  coaching: { label: "Coaching", className: "border-violet-200 bg-violet-50 text-violet-700", icon: Target },
  data_quality: { label: "Data quality", className: "border-amber-200 bg-amber-50 text-amber-700", icon: DatabaseZap },
};

const healthStyle: Record<BusinessInsightsData["companyHealth"]["label"], { label: string; className: string }> = {
  strong: { label: "Strong", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  stable: { label: "Stable", className: "border-sky-200 bg-sky-50 text-sky-700" },
  watch: { label: "Watch", className: "border-amber-200 bg-amber-50 text-amber-700" },
  at_risk: { label: "At risk", className: "border-rose-200 bg-rose-50 text-rose-700" },
};

function confidenceClass(value: Insight["confidence"]) {
  if (value === "high") return "text-emerald-700";
  if (value === "medium") return "text-amber-700";
  return "text-muted-foreground";
}

function EmptyState({ onRefresh, isRefreshing, canRefresh }: { onRefresh: () => void; isRefreshing: boolean; canRefresh: boolean }) {
  return <Card className="border-primary/20 bg-gradient-to-br from-primary/[0.06] via-background to-background"><CardContent className="flex flex-col items-center p-10 text-center"><span className="rounded-2xl bg-primary/10 p-4 text-primary"><BrainCircuit className="h-8 w-8" /></span><h2 className="mt-5 text-lg font-semibold">Create the first company-wide insight brief</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">The refresh assembles aggregate SavvyOS reporting facts across production, pipeline, ISA appointments, tasks, commissions, Savvy Net, onboarding, markets, and lead sources. GPT-5.5 then creates one shared, evidence-grounded executive analysis for the organization.</p><Button className="mt-6" onClick={onRefresh} disabled={isRefreshing || !canRefresh}><RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />{isRefreshing ? "Generating shared analysis…" : canRefresh ? "Generate AI Business Insights" : "Awaiting administrator refresh"}</Button><p className="mt-3 text-xs text-muted-foreground">The completed result is shared with every authenticated user and renews weekly. Only administrators can initiate a manual refresh.</p></CardContent></Card>;
}

export function BusinessInsightsReport({ data, isRefreshing, refreshError, onRefresh }: {
  data: BusinessInsightsData | null | undefined;
  isRefreshing: boolean;
  refreshError?: string | null;
  onRefresh: () => void;
  canRefresh: boolean;
}) {
  if (!data || !data.insights?.length) return <EmptyState onRefresh={onRefresh} isRefreshing={isRefreshing} canRefresh={canRefresh} />;
  const health = healthStyle[data.companyHealth.label] ?? healthStyle.watch;
  const featured = data.insights.slice(0, 3);
  const remaining = data.insights.slice(3);

  return <div className="space-y-6">
    <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/[0.09] via-background to-background shadow-sm"><CardContent className="p-5 sm:p-6"><div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between"><div className="max-w-4xl"><div className="flex flex-wrap items-center gap-2"><Badge className="gap-1.5 bg-primary text-primary-foreground"><BrainCircuit className="h-3.5 w-3.5" />AI Business Insights</Badge><Badge variant="outline" className={health.className}>{health.label} company health · {Math.max(0, Math.min(100, Number(data.companyHealth.score ?? 0)))}/100</Badge>{data.generationMethod === "model" ? <Badge variant="outline" className="border-violet-200 bg-violet-50 text-violet-700">{data.model ?? "GPT-5.5"} synthesis</Badge> : <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">Evidence fallback</Badge>}</div><h2 className="mt-4 text-xl font-semibold tracking-tight sm:text-2xl">A shared executive read on SavvyOS performance</h2><p className="mt-2 text-sm leading-6 text-muted-foreground sm:text-base">{data.executiveSummary}</p><p className="mt-3 text-xs leading-5 text-muted-foreground">{data.companyHealth.rationale}</p></div><div className="flex min-w-[220px] flex-col gap-3 rounded-xl border bg-background/75 p-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Shared cache</p><p className="mt-1 text-sm font-medium">Updated {formatTimestamp(data.generatedAt)}</p><p className="mt-1 text-xs text-muted-foreground">{data.isStale ? "Refresh is due; showing the last completed analysis." : `Next automatic refresh after ${formatTimestamp(data.expiresAt)}`}</p></div><Button onClick={onRefresh} disabled={isRefreshing || !canRefresh} size="sm" className="w-full"><RefreshCw className={`mr-2 h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />{isRefreshing ? "Refreshing…" : canRefresh ? "Refresh for everyone" : "Admin refresh only"}</Button></div></div>{(isRefreshing || refreshError || data.status === "failed") && <div className={`mt-5 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs leading-5 ${refreshError || data.status === "failed" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-sky-200 bg-sky-50 text-sky-800"}`}>{refreshError || data.status === "failed" ? <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <RefreshCw className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin" />}<span>{refreshError || data.errorMessage || "A fresh shared analysis is being generated. Continue using the last completed cache; every authenticated user will see the new result when it is ready."}</span></div>}</CardContent></Card>

    <section className="space-y-3"><div className="flex items-end justify-between gap-4"><div><h2 className="text-base font-semibold">Management themes</h2><p className="mt-1 text-sm text-muted-foreground">The highest-leverage cross-report patterns surfaced from the current company fact pack.</p></div><span className="hidden rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground sm:block">Weekly shared analysis</span></div><div className="grid gap-3 md:grid-cols-3">{data.keyThemes.map((theme, index) => <Card key={`${theme}-${index}`} className="border-border/80"><CardContent className="flex gap-3 p-4"><span className="mt-0.5 rounded-lg bg-primary/10 p-2 text-primary"><Lightbulb className="h-4 w-4" /></span><p className="text-sm leading-6">{theme}</p></CardContent></Card>)}</div></section>

    <section className="space-y-3"><div><h2 className="text-base font-semibold">Priority actions and connected signals</h2><p className="mt-1 text-sm text-muted-foreground">Each insight links the observed pattern, a bounded hypothesis, and a recommended owner action. Evidence badges take you to the relevant report.</p></div><div className="grid gap-4 xl:grid-cols-3">{featured.map((insight, index) => <InsightCard key={`${insight.title}-${index}`} insight={insight} featured />)}</div>{remaining.length > 0 && <div className="grid gap-4 lg:grid-cols-2">{remaining.map((insight, index) => <InsightCard key={`${insight.title}-${index}`} insight={insight} />)}</div>}</section>

    <Card className="border-amber-200 bg-amber-50/45"><CardContent className="flex gap-3 p-4"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" /><div><p className="text-sm font-semibold text-amber-950">Evidence and interpretation guardrails</p><p className="mt-1 text-sm leading-6 text-amber-900/80">{data.dataQualityNote}</p><p className="mt-1 text-xs leading-5 text-amber-900/70">This analysis is generated from aggregate reporting facts. It labels correlations as hypotheses, keeps current pipeline separate from date-scoped outcomes, and does not send client names, contact details, property addresses, notes, or record-level evidence to the model.</p></div></CardContent></Card>
  </div>;
}

function InsightCard({ insight, featured = false }: { insight: Insight; featured?: boolean }) {
  const style = typeStyle[insight.type] ?? typeStyle.performance;
  const Icon = style.icon;
  return <Card className={`h-full border-border/80 shadow-sm ${featured ? "border-primary/20" : ""}`}><CardHeader className="space-y-3 pb-3"><div className="flex items-start justify-between gap-3"><Badge variant="outline" className={`gap-1.5 ${style.className}`}><Icon className="h-3.5 w-3.5" />{style.label}</Badge><span className="text-right text-xs text-muted-foreground"><span className="font-semibold uppercase tracking-wide">{insight.priority}</span><br /><span className={confidenceClass(insight.confidence)}>{insight.confidence} confidence</span></span></div><CardTitle className="text-base leading-6">{insight.title}</CardTitle><CardDescription className="leading-5">{insight.observation}</CardDescription></CardHeader><CardContent className="space-y-4"><div className="rounded-lg bg-muted/55 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Connected signals</p><div className="mt-2 flex flex-wrap gap-1.5">{insight.connectedSignals.map((signal) => <span key={signal} className="rounded-full border bg-background px-2 py-0.5 text-xs text-muted-foreground">{signal}</span>)}</div></div><div className="space-y-2 text-sm leading-6"><p><span className="font-semibold">Working hypothesis: </span>{insight.hypothesis}</p><p><span className="font-semibold">Business impact: </span>{insight.businessImpact}</p><p><span className="font-semibold">Owner: </span>{insight.owner}</p><p className="rounded-lg border border-primary/15 bg-primary/[0.045] p-3"><span className="font-semibold">This week: </span>{insight.nextAction}</p></div><div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Supporting evidence</p><div className="flex flex-wrap gap-2">{insight.evidence.map((item, index) => <a key={`${item.label}-${index}`} href={`/analytics?report=${item.drilldown}`} className="group inline-flex items-center gap-1 rounded-full border bg-background px-2.5 py-1 text-xs transition hover:border-primary/40 hover:bg-primary/[0.04]"><span className="font-medium">{item.label}:</span> <span className="text-muted-foreground">{item.value}</span><ArrowRight className="h-3 w-3 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" /></a>)}</div></div></CardContent></Card>;
}
