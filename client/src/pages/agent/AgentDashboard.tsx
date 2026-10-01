import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { getGoalStatus, type GoalStatusResult } from "@shared/goalProgress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  Calendar,
  CheckCircle2,
  ClipboardList,
  DollarSign,
  GitBranch,
  GitMerge,
  Loader2,
  Search,
  Target,
  TrendingUp,
  TrendingDown,
  Users,
  Trophy,
  Flame,
  Minus,
  Bell,
} from "lucide-react";
import { useLocation } from "wouter";
import { TransactionStatusBadge, PriorityBadge } from "@/components/StatusBadge";
import AgentCoachingChecklist from "@/components/AgentCoachingChecklist";
import { safeFormat } from "@/lib/safeFormat";

function StatCard({
  title,
  value,
  icon: Icon,
  subtitle,
  color = "primary",
  onClick,
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  subtitle?: string;
  color?: "primary" | "green" | "amber" | "blue";
  onClick?: () => void;
}) {
  const colorMap = {
    primary: "text-primary bg-primary/10",
    green: "text-emerald-600 bg-emerald-50",
    amber: "text-amber-600 bg-amber-50",
    blue: "text-blue-600 bg-blue-50",
  };
  return (
    <Card
      className={onClick ? "cursor-pointer hover:shadow-md transition-shadow" : ""}
      onClick={onClick}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground font-medium">{title}</p>
            <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
            )}
          </div>
          <div className={`p-2.5 rounded-lg ${colorMap[color]}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PaceChip({ result }: { result: GoalStatusResult }) {
  if (result.status === "hit") return null; // already showing "Goal hit!"

  if (result.status === "on_track_with_pending") {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-medium text-emerald-600">
        <TrendingUp className="h-3 w-3" /> on track with pending
      </span>
    );
  }
  if (result.status === "on_pace") {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-medium text-emerald-600">
        <Minus className="h-3 w-3" /> on pace
      </span>
    );
  }
  if (result.status === "ahead") {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-medium text-emerald-600">
        <TrendingUp className="h-3 w-3" /> {result.paceGap}% ahead
      </span>
    );
  }
  // behind (closed production vs. elapsed time, and pending doesn't cover the gap)
  const severity = result.paceGap > 20 ? "text-rose-500" : "text-amber-500";
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${severity}`}>
      <TrendingDown className="h-3 w-3" /> {result.paceGap}% behind
    </span>
  );
}

function ProjectionLine({
  result,
  actual,
  pending,
  target,
  period,
  year,
  currentMonth,
  formatValue,
}: {
  result: GoalStatusResult;
  actual: number;
  pending: number;
  target: number;
  period: "annual" | "monthly";
  year: number;
  currentMonth: number;
  formatValue: (n: number) => string;
}) {
  if (result.status === "hit") return null;

  // Pending deals already cover the goal: show what closed + pending adds up to
  // instead of a straight-line projection of closed production.
  if (result.status === "on_track_with_pending") {
    return (
      <p className="text-xs text-emerald-600 font-medium">
        Closed + pending → {formatValue(Math.round(result.combined))} ({result.combinedPct}% of goal)
      </p>
    );
  }

  if (actual === 0) {
    if (pending === 0) return null;
    return (
      <p className="text-xs text-muted-foreground">
        Closed + pending → {formatValue(Math.round(result.combined))} ({result.combinedPct}% of goal)
      </p>
    );
  }

  const now = new Date();
  const periodLabel = period === "annual" ? "year-end" : "month-end";
  let projectedFinal: number;
  let hitDate: Date | null = null;

  if (period === "annual") {
    const startOfYear = new Date(year, 0, 1);
    const endOfYear = new Date(year + 1, 0, 1);
    const elapsedMs = now.getTime() - startOfYear.getTime();
    const totalMs = endOfYear.getTime() - startOfYear.getTime();
    const elapsedFraction = elapsedMs / totalMs; // 0..1
    if (elapsedFraction <= 0) return null;
    projectedFinal = actual / elapsedFraction;
    if (projectedFinal >= target) {
      hitDate = new Date(startOfYear.getTime() + (target / actual) * elapsedMs);
    }
  } else {
    const daysInMonth = new Date(year, currentMonth, 0).getDate();
    const dayOfMonth = now.getDate();
    if (dayOfMonth <= 0) return null;
    projectedFinal = actual * (daysInMonth / dayOfMonth);
    if (projectedFinal >= target) {
      hitDate = new Date(year, currentMonth - 1, Math.ceil((target / actual) * dayOfMonth));
    }
  }

  if (hitDate) {
    const hitStr = hitDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return (
      <p className="text-xs text-emerald-600 font-medium">
        On track to hit goal by {hitStr}
      </p>
    );
  }

  const projectedPct = Math.round((projectedFinal / target) * 100);
  return (
    <p className="text-xs text-muted-foreground">
      Closed-only pace → {formatValue(Math.round(projectedFinal))} by {periodLabel} ({projectedPct}% of goal)
      {pending > 0 && <> · Closed + pending → {formatValue(Math.round(result.combined))} ({result.combinedPct}%)</>}
    </p>
  );
}

function GoalBar({
  label,
  actual,
  pending,
  target,
  pct,
  expectedPct,
  period,
  year,
  currentMonth,
  formatActual,
  formatPending,
  formatTarget,
  formatValue,
}: {
  label: string;
  actual: number;
  pending: number;
  target: number;
  pct: number;
  expectedPct: number;
  period: "annual" | "monthly";
  year: number;
  currentMonth: number;
  formatActual: string;
  formatPending: string;
  formatTarget: string;
  formatValue: (n: number) => string;
}) {
  const result = getGoalStatus({ actual, pending, target, expectedPct });
  const capped = Math.min(pct, 100);
  const isComplete = pct >= 100;
  const onTrackWithPending = result.status === "on_track_with_pending";
  const barColor = isComplete
    ? "bg-emerald-500"
    : pct >= 75
    ? "bg-primary"
    : pct >= 40
    ? "bg-amber-500"
    : "bg-rose-400";
  // Pending segment sits after the closed segment, capped at the end of the bar.
  const pendingWidth = isComplete ? 0 : Math.max(Math.min(result.combinedPct, 100) - capped, 0);
  const pendingColor = onTrackWithPending ? "bg-emerald-500/40" : `${barColor} opacity-40`;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-foreground">{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs">
            {formatActual} closed
            {pending > 0 && <> + {formatPending} pending</>} / {formatTarget}
          </span>
          {isComplete ? (
            <Badge className="text-xs px-1.5 py-0 bg-emerald-100 text-emerald-700 border-emerald-200">
              <Trophy className="h-3 w-3 mr-1" /> Goal hit!
            </Badge>
          ) : (
            <span className="text-xs font-semibold text-foreground">{pct}%</span>
          )}
        </div>
      </div>
      {/* Progress bar: closed segment + lighter pending segment, with expected-pace tick */}
      <div className="relative h-2.5 rounded-full bg-muted overflow-visible">
        <div
          className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${capped}%` }}
        />
        {pendingWidth > 0 && (
          <div
            className={`absolute inset-y-0 rounded-r-full transition-all duration-500 ${pendingColor}`}
            style={{ left: `${capped}%`, width: `${pendingWidth}%` }}
            title={`Pending: ${formatPending}`}
          />
        )}
        {/* Expected pace tick */}
        {!isComplete && expectedPct > 0 && expectedPct < 100 && (
          <div
            className="absolute top-1/2 -translate-y-1/2 w-0.5 h-4 bg-foreground/30 rounded-full"
            style={{ left: `${expectedPct}%` }}
            title={`Expected pace: ${Math.round(expectedPct)}%`}
          />
        )}
      </div>
      {/* Pace label + projection */}
      {!isComplete && (
        <div className="flex items-center justify-between gap-2">
          <ProjectionLine
            result={result}
            actual={actual}
            pending={pending}
            target={target}
            period={period}
            year={year}
            currentMonth={currentMonth}
            formatValue={formatValue}
          />
          <PaceChip result={result} />
        </div>
      )}
    </div>
  );
}

type Period = "annual" | "monthly";

function MyGoalsCard({ year }: { year: number }) {
  const [period, setPeriod] = useState<Period>("annual");
  const currentMonth = new Date().getMonth() + 1; // 1-12

  // Fetch both periods simultaneously so switching is instant (no loading flash)
  const { data: annualData, isLoading: annualLoading } = trpc.analytics.myGoals.useQuery(
    { year, month: 0 },
    { staleTime: 60_000 }
  );
  const { data: monthlyData, isLoading: monthlyLoading } = trpc.analytics.myGoals.useQuery(
    { year, month: currentMonth },
    { staleTime: 60_000 }
  );

  const data = period === "annual" ? annualData : monthlyData;
  const isLoading = period === "annual" ? annualLoading : monthlyLoading;

  const PeriodToggle = () => (
    <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
      {(["annual", "monthly"] as Period[]).map((p) => (
        <button
          key={p}
          onClick={() => setPeriod(p)}
          className={`text-xs px-2.5 py-1 rounded-md font-medium transition-all ${
            period === p
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {p === "annual" ? `Annual ${year}` : "This Month"}
        </button>
      ))}
    </div>
  );

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              My Goals
            </CardTitle>
            <PeriodToggle />
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-4 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-1.5">
                <div className="h-4 bg-muted rounded w-1/3" />
                <div className="h-2.5 bg-muted rounded" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data || !data.hasGoals) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              My Goals
            </CardTitle>
            <PeriodToggle />
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="text-center py-6 text-muted-foreground">
            <Target className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm font-medium">No goals set yet</p>
            <p className="text-xs mt-1">Ask your admin to set your GCI, closings, and volume targets.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const fmt = (n: number) =>
    n >= 1_000_000
      ? `$${(n / 1_000_000).toFixed(1)}M`
      : n >= 1_000
      ? `$${Math.round(n / 1_000)}k`
      : `$${n.toLocaleString()}`;

  // Compute expected pace % based on elapsed time in the period
  const expectedPct = (() => {
    const now = new Date();
    if (period === "annual") {
      const startOfYear = new Date(year, 0, 1);
      const endOfYear = new Date(year + 1, 0, 1);
      const elapsed = now.getTime() - startOfYear.getTime();
      const total = endOfYear.getTime() - startOfYear.getTime();
      return Math.round((elapsed / total) * 100);
    } else {
      // monthly
      const daysInMonth = new Date(year, currentMonth, 0).getDate();
      const dayOfMonth = now.getDate();
      return Math.round((dayOfMonth / daysInMonth) * 100);
    }
  })();

  // Count goals hit
  const goalsHit = [
    data.gciTarget && data.gciPct !== null && data.gciPct >= 100,
    data.closingsTarget && data.closingsPct !== null && data.closingsPct >= 100,
    data.volumeTarget && data.volumePct !== null && data.volumePct >= 100,
  ].filter(Boolean).length;

  const totalGoals = [data.gciTarget, data.closingsTarget, data.volumeTarget].filter(Boolean).length;

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            My Goals
            {goalsHit > 0 && (
              <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs ml-1">
                <Flame className="h-3 w-3 mr-1" />
                {goalsHit}/{totalGoals} hit
              </Badge>
            )}
          </CardTitle>
          <PeriodToggle />
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        {data.gciTarget !== null && data.gciPct !== null && (
          <GoalBar
            label="GCI"
            actual={data.gci}
            pending={data.pendingGci}
            target={data.gciTarget}
            pct={data.gciPct}
            expectedPct={expectedPct}
            period={period}
            year={year}
            currentMonth={currentMonth}
            formatActual={fmt(data.gci)}
            formatPending={fmt(data.pendingGci)}
            formatTarget={fmt(data.gciTarget)}
            formatValue={fmt}
          />
        )}
        {data.closingsTarget !== null && data.closingsPct !== null && (
          <GoalBar
            label="Closings"
            actual={data.closings}
            pending={data.pendingClosings}
            target={data.closingsTarget}
            pct={data.closingsPct}
            expectedPct={expectedPct}
            period={period}
            year={year}
            currentMonth={currentMonth}
            formatActual={String(data.closings)}
            formatPending={String(data.pendingClosings)}
            formatTarget={String(data.closingsTarget)}
            formatValue={(n) => String(Math.round(n))}
          />
        )}
        {data.volumeTarget !== null && data.volumePct !== null && (
          <GoalBar
            label="Volume"
            actual={data.volume}
            pending={data.pendingVolume}
            target={data.volumeTarget}
            pct={data.volumePct}
            expectedPct={expectedPct}
            period={period}
            year={year}
            currentMonth={currentMonth}
            formatActual={fmt(data.volume)}
            formatPending={fmt(data.pendingVolume)}
            formatTarget={fmt(data.volumeTarget)}
            formatValue={fmt}
          />
        )}
        {/* Active pipeline teaser */}
        {data.activePipeline > 0 && (
          <div className="pt-1 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              {data.activePipeline} active deal{data.activePipeline !== 1 ? "s" : ""} in pipeline
            </span>
            <span className="text-primary font-medium">Keep going!</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AgentDashboard() {
  const { user } = useAuth();
  const [, navigate] = useLocation();

  // ─── Request Connection state ────────────────────────────────────────────
  const [reqConnOpen, setReqConnOpen] = useState(false);
  const [reqConnSearch, setReqConnSearch] = useState("");
  const [reqConnSelectedContact, setReqConnSelectedContact] = useState<{ id: number; firstName: string; lastName: string; email: string | null; phone: string | null } | null>(null);
  const [reqConnPipelineStatus, setReqConnPipelineStatus] = useState("new_lead");
  const [reqConnRelationshipType, setReqConnRelationshipType] = useState("both");

  const { data: reqConnResults = [] } = trpc.contacts.searchForRequest.useQuery(
    { search: reqConnSearch },
    { enabled: reqConnSearch.trim().length >= 2 }
  );

  const requestConnMut = trpc.connectionRequests.create.useMutation({
    onSuccess: () => {
      toast.success("Connection request submitted — an admin or ISA will review it");
      setReqConnOpen(false);
      setReqConnSearch("");
      setReqConnSelectedContact(null);
      setReqConnPipelineStatus("new_lead");
      setReqConnRelationshipType("both");
    },
    onError: (e) => toast.error(e.message),
  });

  // Period state for goals
  const currentYear = new Date().getFullYear();

  // All queries scoped to this agent (server enforces agentId = ctx.user.id for agents)
  const { data: myTransactionsData } = trpc.transactions.list.useQuery({ limit: 100 });
  const myTransactions = myTransactionsData?.rows ?? [];

  const { data: myPipelineData } = trpc.agentConnections.list.useQuery({ limit: 200 });
  const myPipeline = myPipelineData?.rows;
  const { data: myTasksData } = trpc.tasks.list.useQuery({ status: "pending", limit: 100 });
  const myTasks = myTasksData?.rows ?? [];
  const { data: myGoalsData } = trpc.analytics.myGoals.useQuery(
    { year: currentYear, month: 0 },
    { staleTime: 60_000 }
  );
  const { data: myContactsData } = trpc.contacts.list.useQuery({ limit: 100 });
  const myContactsCount = myContactsData?.total ?? 0;

  const closedTransactions = myTransactions.filter(
    (r: any) => r.transaction.status === "closed"
  );
  const activeTransactions = myTransactions.filter(
    (r: any) => r.transaction.status === "under_contract"
  );
  const totalGCI = closedTransactions.reduce(
    (sum: number, r: any) => sum + Number(r.transaction.grossCommissionIncome ?? 0),
    0
  );

  // Tasks due today or overdue
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  const tasksDueToday = myTasks.filter((r: any) => {
    const due = r.task?.dueDate ? new Date(r.task.dueDate) : null;
    return due && due <= todayEnd;
  });

  // Next upcoming follow-up in pipeline
  const nowTs = Date.now();
  const upcomingFollowUps = (myPipeline ?? [])
    .filter(({ connection }: any) => connection.followUpDate && new Date(connection.followUpDate).getTime() >= nowTs)
    .sort((a: any, b: any) => new Date(a.connection.followUpDate).getTime() - new Date(b.connection.followUpDate).getTime());
  const nextFollowUp = upcomingFollowUps[0] ?? null;
  const nextFollowUpDate = nextFollowUp
    ? new Date(String(nextFollowUp.connection.followUpDate))
    : null;
  const nextFollowUpLabel = nextFollowUpDate
    ? nextFollowUpDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : null;

  // YTD GCI goal progress
  const gciTarget = myGoalsData?.gciTarget ?? null;
  const gciPct = gciTarget && gciTarget > 0 ? Math.min(Math.round((totalGCI / gciTarget) * 100), 100) : null;

  // Commission flags: agent's own flagged transactions
  const flaggedTransactions = myTransactions.filter(
    (r: any) => r.transaction.payoutIntegrityFlag
  );

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {greeting}, {user?.name?.split(" ")[0] ?? "Agent"} 👋
          </h1>
          <p className="text-muted-foreground mt-1">
            Here's your personal pipeline and activity for today.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => navigate("/pipeline")}>
            <GitBranch className="h-4 w-4 mr-2" />
            My Pipeline
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate("/transactions")}>
            <Building2 className="h-4 w-4 mr-2" />
            My Transactions
          </Button>
          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={() => {
              setReqConnSearch("");
              setReqConnSelectedContact(null);
              setReqConnPipelineStatus("new_lead");
              setReqConnOpen(true);
            }}
          >
            <GitMerge className="h-4 w-4 mr-2" />
            Request Connection
          </Button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="My Pipeline"
          value={(myPipeline ?? []).filter(({ connection }) =>
            connection.pipelineStatus !== "closed" && connection.pipelineStatus !== "dead" && connection.pipelineStatus !== "do_not_contact"
          ).length}
          icon={GitBranch}
          subtitle={nextFollowUpLabel ? `Next follow-up: ${nextFollowUpLabel}` : "Active pipeline connections"}
          color="primary"
          onClick={() => navigate("/pipeline")}
        />
        <StatCard
          title="Closed Deals"
          value={closedTransactions.length}
          icon={CheckCircle2}
          subtitle={`${activeTransactions.length} under contract`}
          color="green"
          onClick={() => navigate("/transactions")}
        />
        {/* GCI card with optional goal progress bar */}
        <Card
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => navigate("/commission")}
        >
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0 pr-2">
                <p className="text-sm text-muted-foreground font-medium">YTD GCI</p>
                <p className="text-2xl font-bold text-foreground mt-1">
                  ${totalGCI.toLocaleString()}
                </p>
                {gciTarget && gciPct !== null ? (
                  <div className="mt-2 space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Goal: ${gciTarget.toLocaleString()}</span>
                      <span className={`font-semibold ${
                        gciPct >= 100 ? "text-emerald-600" :
                        gciPct >= 75 ? "text-amber-600" : "text-muted-foreground"
                      }`}>{gciPct}%</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          gciPct >= 100 ? "bg-emerald-500" :
                          gciPct >= 75 ? "bg-amber-500" : "bg-primary"
                        }`}
                        style={{ width: `${gciPct}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground mt-1">Gross commission earned</p>
                )}
              </div>
              <div className="p-2.5 rounded-lg text-amber-600 bg-amber-50 shrink-0">
                <DollarSign className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>
        <StatCard
          title="Tasks Due"
          value={tasksDueToday.length}
          icon={Bell}
          subtitle={tasksDueToday.length === 0 ? "All caught up!" : `${tasksDueToday.length} task${tasksDueToday.length !== 1 ? "s" : ""} need attention`}
          color={tasksDueToday.length > 0 ? "amber" : "green"}
          onClick={() => navigate("/tasks")}
        />
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Pipeline + Transactions */}
        <div className="lg:col-span-2 space-y-4">
          {/* My Goals — full width in left column */}
          <MyGoalsCard year={currentYear} />

          {/* My Pipeline */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <GitBranch className="h-4 w-4 text-primary" />
                  My Pipeline
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => navigate("/pipeline")}
                >
                  Full pipeline <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {!myPipeline || myPipeline.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <GitBranch className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No pipeline entries yet.</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => navigate("/pipeline")}
                  >
                    View My Pipeline
                  </Button>
                </div>
              ) : (
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {myPipeline.slice(0, 10).map(({ connection, contact }) => (
                    <div
                      key={connection.id}
                      className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 cursor-pointer"
                      onClick={() => navigate(`/pipeline/${connection.id}`)}
                    >
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
                        {contact?.firstName?.[0]}{contact?.lastName?.[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {contact?.firstName} {contact?.lastName}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {contact?.phone ?? contact?.email ?? "No contact info"}
                        </p>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium shrink-0">
                        {(connection.pipelineStatus ?? "new_lead").replace(/_/g, " ")}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* My Transactions */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-primary" />
                  My Transactions
                </CardTitle>
                <button
                  onClick={() => navigate("/transactions")}
                  className="text-xs text-primary hover:underline"
                >
                  View all
                </button>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {!myTransactions || myTransactions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No transactions yet
                </p>
              ) : (
                <div className="space-y-2">
                  {myTransactions.slice(0, 5).map(({ transaction, contact, property }) => (
                    <div
                      key={transaction.id}
                      className="flex items-start gap-2 p-2.5 rounded-lg hover:bg-muted/50 cursor-pointer"
                      onClick={() => navigate(`/transactions/${transaction.id}`)}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {contact?.firstName} {contact?.lastName}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {property?.address ?? "No property linked"}
                        </p>
                      </div>
                      <TransactionStatusBadge status={transaction.status} />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: Tasks + Quick Actions */}
        <div className="space-y-4">
          <AgentCoachingChecklist />

          {/* My Tasks */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-primary" />
                  My Tasks
                </CardTitle>
                <button
                  onClick={() => navigate("/tasks")}
                  className="text-xs text-primary hover:underline"
                >
                  View all
                </button>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {!myTasks || myTasks.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  <CheckCircle2 className="h-7 w-7 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">All caught up!</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {myTasks.slice(0, 7).map(({ task }) => (
                    <div
                      key={task.id}
                      className="flex items-start gap-2 p-2 rounded-lg hover:bg-muted/50 cursor-pointer"
                      onClick={() => navigate("/tasks")}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">
                          {task.title}
                        </p>
                        {task.dueDate && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <Calendar className="h-3 w-3" />
                            {safeFormat(task.dueDate, "MMM d")}
                          </p>
                        )}
                      </div>
                      <PriorityBadge priority={task.priority} />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Commission Flags */}
          {flaggedTransactions.length > 0 && (
            <Card className="border-amber-300 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-700">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2 text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-4 w-4" />
                  Commission Flags
                  <Badge variant="secondary" className="ml-auto bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 text-xs">
                    {flaggedTransactions.length}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-1">
                {flaggedTransactions.slice(0, 5).map(({ transaction, contact, property }) => (
                  <button
                    key={transaction.id}
                    onClick={() => navigate(`/transactions/${transaction.id}`)}
                    className="w-full text-left p-2 rounded-lg hover:bg-amber-100/60 dark:hover:bg-amber-900/30 transition-colors"
                  >
                    <p className="text-xs font-medium text-foreground truncate">
                      {property?.address ?? (contact ? `${contact.firstName} ${contact.lastName}` : `Transaction #${transaction.id}`)}
                    </p>
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5 truncate">
                      {transaction.payoutIntegrityNote ?? "Commission split needs attention"}
                    </p>
                  </button>
                ))}
                {flaggedTransactions.length > 5 && (
                  <p className="text-xs text-muted-foreground text-center pt-1">
                    +{flaggedTransactions.length - 5} more — <button onClick={() => navigate("/transactions")} className="underline text-primary">view all</button>
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Quick Actions */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Quick Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-1">
              {[
                { label: "My Pipeline", path: "/pipeline" },
                { label: "My Listings", path: "/listings" },
                { label: "My Commission", path: "/commission" },
              ].map(({ label, path }) => (
                <button
                  key={label}
                  onClick={() => navigate(path)}
                  className="w-full text-left text-sm text-foreground hover:text-primary hover:bg-muted/50 px-2 py-1.5 rounded flex items-center justify-between group"
                >
                  {label}
                  <ArrowRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ─── Request Connection Dialog ─────────────────────────────────────────── */}
      <Dialog open={reqConnOpen} onOpenChange={(o) => { if (!o) { setReqConnSearch(""); setReqConnSelectedContact(null); setReqConnPipelineStatus("new_lead"); setReqConnRelationshipType("both"); } setReqConnOpen(o); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitMerge className="h-5 w-5 text-emerald-600" />
              Request a Lead Connection
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Search for a Lead / Contact</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Name, email, or phone…"
                  value={reqConnSearch}
                  onChange={(e) => { setReqConnSearch(e.target.value); setReqConnSelectedContact(null); }}
                />
              </div>
              {reqConnSearch.trim().length >= 2 && !reqConnSelectedContact && (
                <div className="border rounded-md divide-y max-h-48 overflow-y-auto">
                  {(reqConnResults as any[]).length === 0 ? (
                    <p className="text-sm text-muted-foreground px-3 py-2">No unconnected contacts found.</p>
                  ) : (
                    (reqConnResults as any[]).map((c: any) => (
                      <button
                        key={c.id}
                        className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors"
                        onClick={() => { setReqConnSelectedContact(c); setReqConnSearch(`${c.firstName} ${c.lastName}`); }}
                      >
                        <p className="text-sm font-medium">{c.firstName} {c.lastName}</p>
                        <p className="text-xs text-muted-foreground">{c.email ?? c.phone ?? "No contact info"}</p>
                      </button>
                    ))
                  )}
                </div>
              )}
              {reqConnSelectedContact && (
                <div className="flex items-center gap-2 p-2 bg-emerald-50 border border-emerald-200 rounded-md">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-emerald-800">{reqConnSelectedContact.firstName} {reqConnSelectedContact.lastName}</p>
                    <p className="text-xs text-emerald-600">{reqConnSelectedContact.email ?? reqConnSelectedContact.phone ?? "No contact info"}</p>
                  </div>
                  <button className="text-emerald-500 hover:text-emerald-700 text-xs shrink-0" onClick={() => { setReqConnSelectedContact(null); setReqConnSearch(""); }}>Change</button>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Requested Pipeline Stage</Label>
              <Select value={reqConnPipelineStatus} onValueChange={setReqConnPipelineStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="new_lead">New Lead</SelectItem>
                  <SelectItem value="attempted_contact">Attempted Contact</SelectItem>
                  <SelectItem value="nurture">Nurture</SelectItem>
                  <SelectItem value="active_client">Active Client</SelectItem>
                  <SelectItem value="under_contract">Under Contract</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">An admin or ISA will review and approve this request before the connection is created.</p>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Relationship Type</Label>
              <Select value={reqConnRelationshipType} onValueChange={setReqConnRelationshipType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="buyer">Buyer</SelectItem><SelectItem value="seller">Seller</SelectItem><SelectItem value="both">Both</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReqConnOpen(false)}>Cancel</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={!reqConnSelectedContact || requestConnMut.isPending}
              onClick={() => {
                if (!reqConnSelectedContact) return;
                requestConnMut.mutate({ contactId: reqConnSelectedContact.id, requestedPipelineStatus: reqConnPipelineStatus as any, requestedRelationshipType: reqConnRelationshipType as any });
              }}
            >
              {requestConnMut.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Submitting…</> : "Submit Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
