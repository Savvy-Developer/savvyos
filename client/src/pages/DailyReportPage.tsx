import { trpc } from "@/lib/trpc";
import { AlertCircle, ArrowRight, CheckCircle2, Clock3, Flame, Loader2, Sparkles, TrendingUp } from "lucide-react";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const priorityStyles = {
  critical: "border-red-200 bg-red-50 text-red-800",
  high: "border-amber-200 bg-amber-50 text-amber-800",
  medium: "border-sky-200 bg-sky-50 text-sky-800",
} as const;

function formatDate(value: string | null): string {
  if (!value) return "No due date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No due date";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" }).format(date);
}

function MetricCard({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "warning" | "danger" | "accent" }) {
  const toneClasses = {
    default: "border-border",
    warning: "border-amber-200 bg-amber-50/60",
    danger: "border-red-200 bg-red-50/60",
    accent: "border-cyan-200 bg-cyan-50/60",
  };
  return (
    <Card className={toneClasses[tone]}>
      <CardContent className="p-4">
        <div className="text-2xl font-bold tracking-tight">{value}</div>
        <div className="mt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  );
}

export default function DailyReportPage() {
  const [, navigate] = useLocation();
  const reportQuery = trpc.dailyReport.getLive.useQuery(undefined, { refetchOnWindowFocus: true });
  const report = reportQuery.data;

  if (reportQuery.isLoading) {
    return <div className="flex min-h-[45vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (reportQuery.isError || !report) {
    return (
      <div className="mx-auto max-w-3xl py-16 text-center">
        <AlertCircle className="mx-auto mb-4 h-9 w-9 text-destructive" />
        <h1 className="text-xl font-semibold">Your daily report is unavailable</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">Please refresh the page or review your Tasks and Pipeline directly while SavvyOS reconnects.</p>
        <Button className="mt-5" onClick={() => reportQuery.refetch()}>Try again</Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-10">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-cyan-700"><Sparkles className="h-4 w-4" /> Daily operating view</div>
          <h1 className="text-3xl font-bold tracking-tight">Good evening, {report.agent.name.split(" ")[0]}</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">A live snapshot of the priorities, pipeline signals, and SavvyOS updates most likely to affect your next move.</p>
        </div>
        <div className="rounded-lg border bg-muted/40 px-3 py-2 text-right text-xs text-muted-foreground">
          <div className="font-medium text-foreground">Current as of</div>
          <div>{report.asOfLabel}</div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <MetricCard label="Overdue tasks" value={report.metrics.overdueTasks} tone={report.metrics.overdueTasks > 0 ? "danger" : "default"} />
        <MetricCard label="Overdue follow-ups" value={report.metrics.overdueFollowUps} tone={report.metrics.overdueFollowUps > 0 ? "warning" : "default"} />
        <MetricCard label="Hot leads" value={report.metrics.hotLeads} tone={report.metrics.hotLeads > 0 ? "accent" : "default"} />
        <MetricCard label="Active pipeline" value={report.metrics.activeLeads} />
        <MetricCard label="Open tasks" value={report.metrics.openTasks} />
        <MetricCard label="Under contract" value={report.metrics.currentUnderContract} tone={report.metrics.currentUnderContract > 0 ? "accent" : "default"} />
      </div>

      <Card className="overflow-hidden border-cyan-200">
        <CardHeader className="border-b bg-gradient-to-r from-cyan-50 to-background pb-4">
          <div className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-cyan-700" /><CardTitle>Suggested next moves</CardTitle></div>
          <CardDescription>{report.aiGenerated ? "AI-generated, evidence-based recommendations from your current SavvyOS activity. Review each record before acting." : "Evidence-based recommendations from your current SavvyOS activity."}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 p-4 lg:grid-cols-3">
          {report.suggestions.map((suggestion, index) => (
            <div key={`${suggestion.title}-${index}`} className={`rounded-xl border p-4 ${priorityStyles[suggestion.priority]}`}>
              <div className="flex items-center justify-between gap-3">
                <Badge variant="outline" className="border-current bg-white/60 text-[10px] uppercase tracking-wide">{suggestion.priority}</Badge>
                <span className="text-xs font-medium">{index + 1}</span>
              </div>
              <h3 className="mt-3 text-sm font-semibold leading-snug">{suggestion.title}</h3>
              <p className="mt-2 text-xs leading-relaxed opacity-90">{suggestion.rationale}</p>
              <Button variant="link" className="mt-2 h-auto p-0 text-xs font-semibold" onClick={() => navigate(suggestion.actionPath)}>
                {suggestion.actionLabel}<ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3"><div><CardTitle className="flex items-center gap-2 text-lg"><AlertCircle className="h-4.5 w-4.5 text-red-600" /> Past-due tasks</CardTitle><CardDescription className="mt-1">Complete, reschedule, or clarify ownership before the next workday.</CardDescription></div><Button variant="outline" size="sm" onClick={() => navigate("/tasks")}>All tasks</Button></div>
          </CardHeader>
          <CardContent>
            {report.overdueTasks.length === 0 ? (
              <div className="rounded-lg border border-dashed bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground"><CheckCircle2 className="mx-auto mb-2 h-5 w-5 text-emerald-600" />No overdue tasks. Your task list is current.</div>
            ) : (
              <div className="divide-y">
                {report.overdueTasks.map((task) => <button key={task.id} onClick={() => navigate(task.actionPath)} className="flex w-full items-center justify-between gap-4 py-3 text-left transition-colors hover:bg-muted/40">
                  <div className="min-w-0"><div className="truncate text-sm font-medium">{task.title}</div>{task.contactName && <div className="mt-0.5 truncate text-xs text-muted-foreground">{task.contactName}</div>}</div>
                  <div className="shrink-0 text-right"><div className="text-xs font-semibold text-red-600">Due {formatDate(task.dueDate)}</div><div className="mt-0.5 text-[10px] capitalize text-muted-foreground">{task.priority}</div></div>
                </button>)}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3"><div><CardTitle className="flex items-center gap-2 text-lg"><Flame className="h-4.5 w-4.5 text-amber-600" /> Hot leads</CardTitle><CardDescription className="mt-1">Prioritized using follow-up status, stage, property views, and email engagement.</CardDescription></div><Button variant="outline" size="sm" onClick={() => navigate("/hot-leads")}>Hot Leads</Button></div>
          </CardHeader>
          <CardContent>
            {report.hotLeads.length === 0 ? (
              <div className="rounded-lg border border-dashed bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">No current leads meet the hot-lead threshold. Use your pipeline to plan the next intentional outreach.</div>
            ) : (
              <div className="divide-y">
                {report.hotLeads.map((lead) => <button key={lead.connectionId} onClick={() => navigate(lead.actionPath)} className="flex w-full items-center justify-between gap-4 py-3 text-left transition-colors hover:bg-muted/40">
                  <div className="min-w-0"><div className="flex items-center gap-2"><div className="truncate text-sm font-medium">{lead.contactName}</div><Badge variant="secondary" className="shrink-0 text-[10px]">{lead.stageLabel}</Badge></div><div className="mt-1 truncate text-xs text-muted-foreground">{lead.reasons.slice(0, 2).join(" · ") || "Review current pipeline activity"}</div></div>
                  <div className="shrink-0 text-right"><div className="text-xs font-semibold text-amber-700">Priority {lead.score}</div>{lead.followUpDate && <div className="mt-0.5 text-[10px] text-muted-foreground">Follow-up {formatDate(lead.followUpDate)}</div>}</div>
                </button>)}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-lg"><TrendingUp className="h-4.5 w-4.5 text-cyan-700" /> Pipeline health</CardTitle><CardDescription className="mt-1">Stage distribution and immediate execution flags for your active business.</CardDescription></CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-wrap gap-2">
              {report.pipeline.filter((stage) => stage.count > 0).map((stage) => <div key={stage.stage} className="rounded-full border bg-muted/30 px-3 py-1.5 text-xs"><span className="font-semibold">{stage.count}</span> <span className="text-muted-foreground">{stage.label}</span></div>)}
              {report.pipeline.every((stage) => stage.count === 0) && <span className="text-sm text-muted-foreground">No pipeline records are currently assigned.</span>}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg bg-muted/50 p-3"><div className="text-xl font-bold">{report.metrics.staleLeads}</div><div className="mt-1 text-xs text-muted-foreground">Stalled active leads</div></div>
              <div className="rounded-lg bg-muted/50 p-3"><div className="text-xl font-bold">{report.metrics.dueSoonTasks}</div><div className="mt-1 text-xs text-muted-foreground">Tasks due within 3 days</div></div>
              <div className="rounded-lg bg-muted/50 p-3"><div className="text-xl font-bold">{report.metrics.upcomingClosings}</div><div className="mt-1 text-xs text-muted-foreground">Closings in next 30 days</div></div>
            </div>
            {report.upcomingTasks.length > 0 && <div><div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Coming due</div><div className="divide-y">{report.upcomingTasks.slice(0, 4).map((task) => <button key={task.id} onClick={() => navigate(task.actionPath)} className="flex w-full items-center justify-between gap-3 py-2 text-left hover:bg-muted/40"><span className="truncate text-sm">{task.title}</span><span className="shrink-0 text-xs text-muted-foreground">{formatDate(task.dueDate)}</span></button>)}</div></div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-lg"><Sparkles className="h-4.5 w-4.5 text-cyan-700" /> New in SavvyOS</CardTitle><CardDescription className="mt-1">Agent-facing updates published during the last 30 days.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {report.featureUpdates.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No new agent-facing features were published recently.</p> : report.featureUpdates.map((update) => <div key={update.id} className="rounded-lg border border-cyan-100 bg-cyan-50/50 p-3"><div className="text-sm font-semibold text-cyan-950">{update.title}</div><p className="mt-1 text-xs leading-relaxed text-cyan-900/80">{update.summary}</p>{update.actionUrl && <Button variant="link" className="mt-1 h-auto p-0 text-xs" onClick={() => navigate(update.actionUrl!)}>Explore update<ArrowRight className="ml-1 h-3.5 w-3.5" /></Button>}</div>)}
          </CardContent>
        </Card>
      </div>

      <p className="flex items-start gap-2 rounded-lg border bg-muted/20 px-4 py-3 text-xs leading-relaxed text-muted-foreground"><Clock3 className="mt-0.5 h-4 w-4 shrink-0" />This page is live. The 6 PM Eastern email is a saved end-of-day snapshot with AI-generated suggestions; verify each linked task, lead, or transaction before taking action.</p>
    </div>
  );
}
