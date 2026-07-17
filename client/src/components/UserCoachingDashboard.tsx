import { useMemo, type ComponentType } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock3,
  DollarSign,
  FileText,
  FolderOpen,
  Gauge,
  Layers3,
  ListChecks,
  RefreshCw,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import { safeFormat } from "@/lib/safeFormat";
import { useLocation } from "wouter";

type Props = {
  userId: number;
};

const STATUS_LABELS: Record<string, string> = {
  new_lead: "New Lead",
  attempted_contact: "Attempted Contact",
  nurture: "Nurture",
  active_client: "Active Client",
  under_contract: "Under Contract",
  closed: "Closed",
  dead: "Dead",
};

const STATUS_COLORS: Record<string, string> = {
  new_lead: "bg-slate-100 text-slate-700 border-slate-200",
  attempted_contact: "bg-amber-50 text-amber-700 border-amber-200",
  nurture: "bg-violet-50 text-violet-700 border-violet-200",
  active_client: "bg-blue-50 text-blue-700 border-blue-200",
  under_contract: "bg-cyan-50 text-cyan-700 border-cyan-200",
  closed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  dead: "bg-red-50 text-red-700 border-red-200",
};

function currency(value: number | null | undefined) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));
}

function number(value: number | null | undefined) {
  return new Intl.NumberFormat("en-US").format(Number(value ?? 0));
}

function LoginIndicator({ days }: { days: number | null | undefined }) {
  if (days === null || days === undefined) return <Badge variant="outline">No sign-in record</Badge>;
  if (days === 0) return <Badge className="bg-emerald-600 hover:bg-emerald-600">Active today</Badge>;
  if (days <= 7) return <Badge className="bg-blue-600 hover:bg-blue-600">Active {days}d ago</Badge>;
  if (days <= 30) return <Badge className="bg-amber-500 hover:bg-amber-500">Last active {days}d ago</Badge>;
  return <Badge variant="destructive">Last active {days}d ago</Badge>;
}

function MetricCard({ title, value, caption, icon: Icon, tone = "primary" }: {
  title: string;
  value: string;
  caption?: string;
  icon: ComponentType<{ className?: string }> ;
  tone?: "primary" | "green" | "amber" | "red" | "blue";
}) {
  const tones: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    green: "bg-emerald-100 text-emerald-700",
    amber: "bg-amber-100 text-amber-700",
    red: "bg-red-100 text-red-700",
    blue: "bg-blue-100 text-blue-700",
  };
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
            {caption && <p className="mt-1 text-xs text-muted-foreground">{caption}</p>}
          </div>
          <div className={`shrink-0 rounded-lg p-2.5 ${tones[tone]}`}><Icon className="h-5 w-5" /></div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function UserCoachingDashboard({ userId }: Props) {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const dashboard = trpc.users.getCoachingDashboard.useQuery({ userId });
  const generateCoachingSummary = trpc.users.generateCoachingSummary.useMutation({
    onSuccess: () => {
      void utils.users.getCoachingDashboard.invalidate({ userId });
    },
  });
  const data: any = dashboard.data;

  const pipelineBreakdown = useMemo(() => {
    if (!data?.pipeline?.byStatus) return [] as Array<[string, number]>;
    return Object.entries(data.pipeline.byStatus) as Array<[string, number]>;
  }, [data?.pipeline?.byStatus]);

  if (dashboard.isLoading) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-muted-foreground">
          Loading coaching dashboard…
        </CardContent>
      </Card>
    );
  }

  if (dashboard.error || !data) {
    return (
      <Card className="border-destructive/30">
        <CardContent className="py-10 text-center space-y-3">
          <AlertTriangle className="h-8 w-8 text-destructive mx-auto" />
          <p className="font-medium">The coaching dashboard could not be loaded.</p>
          <p className="text-sm text-muted-foreground">{dashboard.error?.message ?? "Please try again."}</p>
          <Button variant="outline" size="sm" onClick={() => dashboard.refetch()}><RefreshCw className="h-4 w-4 mr-1.5" />Retry</Button>
        </CardContent>
      </Card>
    );
  }

  const { user, performance, tasks, pipeline, activity, documents, coaching, groupLeadership } = data;
  const goalProgress = performance.gciGoalProgress;

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-primary/20">
        <CardContent className="p-5 sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-primary hover:bg-primary">Coach View</Badge>
                <LoginIndicator days={user.daysSinceLastSignIn} />
                {!user.emailSignatureConfigured && <Badge variant="destructive">Email Signature missing</Badge>}
                {!user.isActive && <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">Inactive account</Badge>}
              </div>
              <div>
                <h2 className="text-xl font-bold">{user.name ?? "Team Member"} — Performance Coaching Portal</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {user.title ?? user.role} · {user.email ?? "No email on record"} · Joined {safeFormat(user.createdAt, "MMM d, yyyy")}
                </p>
              </div>
              <p className="max-w-3xl text-sm text-muted-foreground">
                Use this view to spot performance momentum, workload risk, Pipeline follow-up gaps, and coaching opportunities from the user’s actual SavvyOS records.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => dashboard.refetch()}>
                <RefreshCw className="h-4 w-4 mr-1.5" />Refresh data
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <div className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-primary" /><h3 className="font-semibold">Performance Snapshot</h3></div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard title={`${performance.year} Closed GCI`} value={currency(performance.ytdGci)} caption={`${number(performance.ytdClosedDeals)} YTD closed deal${performance.ytdClosedDeals === 1 ? "" : "s"}`} icon={DollarSign} tone="green" />
          <MetricCard title="Closed Volume" value={currency(performance.ytdVolume)} caption="Closed purchase volume year to date" icon={BarChart3} tone="blue" />
          <MetricCard title="Active Deals" value={number(performance.activeDeals)} caption={`${currency(performance.activeGci)} active GCI`} icon={Layers3} tone="primary" />
          <MetricCard title="Open Pipeline" value={number(pipeline.open)} caption={`${number(pipeline.followUpsOverdue)} overdue follow-up${pipeline.followUpsOverdue === 1 ? "" : "s"}`} icon={Gauge} tone={pipeline.followUpsOverdue > 0 ? "amber" : "green"} />
        </div>
        <Card>
          <CardContent className="pt-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">GCI Goal Progress</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {performance.gciGoal > 0 ? `${currency(performance.ytdGci)} of ${currency(performance.gciGoal)} annual GCI target` : "No annual GCI target has been configured."}
                </p>
              </div>
              <p className="text-2xl font-bold">{goalProgress === null ? "—" : `${goalProgress}%`}</p>
            </div>
            {goalProgress !== null && (
              <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${goalProgress}%` }} />
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section>
        <Card className="border-violet-200 bg-gradient-to-br from-violet-50/70 to-background">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4 text-violet-700" />AI Coaching Brief</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">A refreshable, evidence-bound summary of the user’s current SavvyOS performance, Pipeline, task, login, and activity metrics.</p>
              </div>
              <Button size="sm" variant="outline" disabled={generateCoachingSummary.isPending} onClick={() => generateCoachingSummary.mutate({ userId })}>
                <Sparkles className="h-4 w-4 mr-1.5" />{generateCoachingSummary.isPending ? "Generating…" : coaching?.summary ? "Refresh brief" : "Generate brief"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {generateCoachingSummary.error && <p className="mb-3 text-sm text-destructive">{generateCoachingSummary.error.message}</p>}
            {coaching?.summary ? <><p className="whitespace-pre-wrap text-sm leading-6">{coaching.summary}</p><p className="mt-3 text-xs text-muted-foreground">Generated {coaching.generatedAt ? safeFormat(coaching.generatedAt, "MMM d, yyyy h:mm a") : "recently"}. This is a coaching aid; the underlying SavvyOS records remain authoritative.</p></> : <p className="text-sm text-muted-foreground">No coaching brief has been generated yet. Generate one to turn the current operational data into a focused conversation guide.</p>}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-600" />Coaching Attention Queue</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {tasks.overdueItems.length === 0 && pipeline.followUpsOverdue === 0 && pipeline.stale === 0 ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 flex items-center gap-2"><CheckCircle2 className="h-4 w-4" />No overdue tasks, overdue Pipeline follow-ups, or stale open Pipeline records.</div>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3"><p className="text-xs text-red-700">Overdue tasks</p><p className="text-xl font-bold text-red-800">{tasks.overdue}</p></div>
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3"><p className="text-xs text-amber-700">Overdue follow-ups</p><p className="text-xl font-bold text-amber-800">{pipeline.followUpsOverdue}</p></div>
                  <div className="rounded-lg border border-orange-200 bg-orange-50 p-3"><p className="text-xs text-orange-700">Stale Pipeline records</p><p className="text-xl font-bold text-orange-800">{pipeline.stale}</p></div>
                </div>
                {tasks.overdueItems.length > 0 && <div className="space-y-2 pt-1">
                  {tasks.overdueItems.slice(0, 6).map((task: any) => (
                    <div key={task.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
                      <div className="min-w-0"><p className="truncate text-sm font-medium">{task.title}</p><p className="text-xs text-muted-foreground">Due {safeFormat(task.dueDate, "MMM d, yyyy")} · {task.priority} priority</p></div>
                      <Badge variant="destructive">Overdue</Badge>
                    </div>
                  ))}
                </div>}
              </>
            )}
          </CardContent>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><ListChecks className="h-4 w-4 text-primary" />Task Execution</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div><p className="text-2xl font-bold">{tasks.incomplete}</p><p className="text-xs text-muted-foreground">Open</p></div>
              <div><p className="text-2xl font-bold text-red-600">{tasks.overdue}</p><p className="text-xs text-muted-foreground">Overdue</p></div>
              <div><p className="text-2xl font-bold text-emerald-600">{tasks.completedLast30Days}</p><p className="text-xs text-muted-foreground">Completed / 30d</p></div>
            </div>
            <div className="border-t pt-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">NEXT DUE</p>
              {tasks.upcomingItems.length === 0 ? <p className="text-sm text-muted-foreground">No upcoming open tasks are scheduled.</p> : tasks.upcomingItems.slice(0, 4).map((task: any) => <div key={task.id} className="text-sm"><p className="font-medium truncate">{task.title}</p><p className="text-xs text-muted-foreground">{safeFormat(task.dueDate, "EEE, MMM d")} · {task.priority}</p></div>)}
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Gauge className="h-4 w-4 text-primary" />Pipeline Health</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {pipelineBreakdown.map(([status, count]) => <div key={status} className="rounded-lg border bg-muted/20 p-3"><p className="text-xl font-bold">{count}</p><p className="mt-1 text-[11px] leading-tight text-muted-foreground">{STATUS_LABELS[status] ?? status}</p></div>)}
            </div>
            <div className="border-t pt-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">RECENT PIPELINE RECORDS</p>
              {pipeline.recent.length === 0 ? <p className="text-sm text-muted-foreground">No Pipeline records yet.</p> : pipeline.recent.slice(0, 6).map((connection: any) => <button key={connection.id} onClick={() => navigate(`/contacts/${connection.contactId}`)} className="flex w-full items-center justify-between gap-3 rounded-md p-2 text-left hover:bg-muted"><div className="min-w-0"><p className="truncate text-sm font-medium">{connection.contactName}</p><p className="text-xs text-muted-foreground">Updated {safeFormat(connection.updatedAt, "MMM d, yyyy")}</p></div><Badge variant="outline" className={STATUS_COLORS[connection.pipelineStatus] ?? ""}>{STATUS_LABELS[connection.pipelineStatus] ?? connection.pipelineStatus}</Badge></button>)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4 text-primary" />Activity & Adoption</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3"><div className="rounded-lg border bg-muted/20 p-3"><p className="text-2xl font-bold">{activity.countLast30Days}</p><p className="text-xs text-muted-foreground">Logged activities / 30d</p></div><div className="rounded-lg border bg-muted/20 p-3"><p className="text-2xl font-bold">{documents.total}</p><p className="text-xs text-muted-foreground">Profile documents</p></div></div>
            <div className="border-t pt-3 space-y-3 max-h-[310px] overflow-y-auto pr-1">
              <p className="text-xs font-medium text-muted-foreground">RECENT ACTIVITY TIMELINE</p>
              {activity.timeline.length === 0 ? <p className="text-sm text-muted-foreground">No activity has been logged for this user yet.</p> : activity.timeline.slice(0, 12).map((entry: any) => <div key={entry.id} className="relative border-l pl-3 pb-3 last:pb-0"><span className="absolute -left-[4px] top-1.5 h-1.5 w-1.5 rounded-full bg-primary" /><p className="text-sm font-medium break-words">{String(entry.action ?? "Activity").replace(/_/g, " ")}</p><p className="text-xs text-muted-foreground">{safeFormat(entry.createdAt, "MMM d, yyyy h:mm a")}{entry.entityType ? ` · ${entry.entityType}` : ""}</p></div>)}
            </div>
          </CardContent>
        </Card>
      </section>

      {groupLeadership.length > 0 && <section className="space-y-3"><div className="flex items-center gap-2"><Users className="h-5 w-5 text-primary" /><h3 className="font-semibold">Group Leader Portfolio</h3></div>{groupLeadership.map((group: any) => <Card key={group.id}><CardContent className="pt-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><h4 className="font-semibold">{group.name}</h4><p className="mt-1 text-sm text-muted-foreground">{group.memberCount} team member{group.memberCount === 1 ? "" : "s"} · Group leader split {group.leaderCommissionSplit ?? "—"}%</p></div><div className="grid grid-cols-2 gap-4 sm:grid-cols-4"><div><p className="text-lg font-bold">{currency(group.metrics.ytdGci)}</p><p className="text-xs text-muted-foreground">YTD GCI</p></div><div><p className="text-lg font-bold">{group.metrics.ytdClosedDeals}</p><p className="text-xs text-muted-foreground">Closed</p></div><div><p className="text-lg font-bold">{group.metrics.activeDeals}</p><p className="text-xs text-muted-foreground">Active deals</p></div><div><p className="text-lg font-bold">{group.metrics.openPipeline}</p><p className="text-xs text-muted-foreground">Open Pipeline</p></div></div></div><div className="mt-4 flex flex-wrap gap-2 border-t pt-4">{group.members.map((member: any) => <Badge key={member.id} variant="outline" className="py-1"><Clock3 className="mr-1 h-3 w-3" />{member.name ?? member.email ?? "Unnamed member"}</Badge>)}</div></CardContent></Card>)}</section>}

      <section className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><FolderOpen className="h-4 w-4 text-primary" />Latest Profile Documents</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {documents.latest.length === 0 ? <p className="text-sm text-muted-foreground">No user documents have been uploaded.</p> : documents.latest.map((document: any) => <div key={document.id} className="rounded-md border p-3"><div className="flex items-center gap-3"><FileText className="h-4 w-4 shrink-0 text-primary" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{document.label || document.fileName}</p><p className="text-xs text-muted-foreground">{safeFormat(document.createdAt, "MMM d, yyyy")} · {document.mimeType ?? "File"}</p></div>{document.aiSummaryStatus === "complete" && <Badge className="bg-violet-600 hover:bg-violet-600">AI summarized</Badge>}</div>{document.aiSummary && <details className="mt-3 rounded-md bg-violet-50/60 p-3"><summary className="cursor-pointer text-xs font-medium text-violet-800">View AI coaching summary</summary><p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">{document.aiSummary}</p></details>}{document.aiSummaryStatus === "failed" && <p className="mt-2 text-xs text-amber-700">Automatic summary was unavailable; the document remains saved in the profile.</p>}</div>)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Gauge className="h-4 w-4 text-primary" />Coach Readiness</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3 rounded-md border p-3"><span>Email Signature</span>{user.emailSignatureConfigured ? <Badge className="bg-emerald-600 hover:bg-emerald-600">Configured</Badge> : <Badge variant="destructive">Missing</Badge>}</div>
            <div className="flex items-center justify-between gap-3 rounded-md border p-3"><span>Recent SavvyOS activity</span><Badge variant={activity.countLast30Days > 0 ? "default" : "outline"}>{activity.countLast30Days > 0 ? `${activity.countLast30Days} in 30d` : "None in 30d"}</Badge></div>
            <div className="flex items-center justify-between gap-3 rounded-md border p-3"><span>Last sign-in</span><LoginIndicator days={user.daysSinceLastSignIn} /></div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
