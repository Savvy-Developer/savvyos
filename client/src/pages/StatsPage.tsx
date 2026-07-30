import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import PageHeader from "@/components/PageHeader";
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
import {
  Award,
  Calendar,
  CheckCircle2,
  DollarSign,
  Flame,
  GitBranch,
  Home,
  Loader2,
  Star,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
  Users,
  Zap,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt$(n: number, compact = false): string {
  if (compact) {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
    return `$${n.toFixed(0)}`;
  }
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtPct(n: number): string {
  return `${Math.round(n)}%`;
}

function monthLabel(ym: string): string {
  if (!ym) return "";
  const [y, m] = ym.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleString("en-US", { month: "short", year: "2-digit" });
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  color = "blue",
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ElementType;
  trend?: { pct: number; label: string };
  color?: "blue" | "green" | "amber" | "purple" | "rose";
}) {
  const colorMap: Record<string, string> = {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    purple: "bg-purple-50 text-purple-600",
    rose: "bg-rose-50 text-rose-600",
  };
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-sm text-muted-foreground font-medium truncate">{title}</p>
            <p className="text-2xl font-bold text-foreground mt-1 truncate">{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
            {trend && (
              <div className={`flex items-center gap-1 mt-1.5 text-xs font-medium ${trend.pct >= 0 ? "text-emerald-600" : "text-rose-500"}`}>
                {trend.pct >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {trend.pct >= 0 ? "+" : ""}{fmtPct(trend.pct)} {trend.label}
              </div>
            )}
          </div>
          <div className={`p-2.5 rounded-lg ml-3 flex-shrink-0 ${colorMap[color]}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Goal Ring ────────────────────────────────────────────────────────────────
function GoalRing({
  label,
  actual,
  target,
  pct,
  formatValue,
  color,
}: {
  label: string;
  actual: number;
  target: number;
  pct: number | null;
  formatValue: (n: number) => string;
  color: string;
}) {
  const clamped = Math.min(pct ?? 0, 100);
  const r = 36;
  const circ = 2 * Math.PI * r;
  const dash = (clamped / 100) * circ;
  const colorMap: Record<string, { stroke: string; text: string; bg: string }> = {
    blue: { stroke: "#3b82f6", text: "text-blue-600", bg: "bg-blue-50" },
    green: { stroke: "#10b981", text: "text-emerald-600", bg: "bg-emerald-50" },
    amber: { stroke: "#f59e0b", text: "text-amber-500", bg: "bg-amber-50" },
  };
  const c = colorMap[color] ?? colorMap.blue;
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-24 h-24">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 88 88">
          <circle cx="44" cy="44" r={r} fill="none" stroke="#e5e7eb" strokeWidth="8" />
          <circle
            cx="44"
            cy="44"
            r={r}
            fill="none"
            stroke={c.stroke}
            strokeWidth="8"
            strokeDasharray={`${dash} ${circ}`}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`text-lg font-bold ${c.text}`}>{pct !== null ? fmtPct(clamped) : "—"}</span>
        </div>
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{formatValue(actual)} / {formatValue(target)}</p>
      </div>
    </div>
  );
}

// ─── Pipeline stage ordering ──────────────────────────────────────────────────
const STAGE_ORDER = ["new_lead", "attempted_contact", "nurture", "active_client", "under_contract", "closed", "dead"];
const STAGE_LABELS: Record<string, string> = {
  new_lead: "New Lead",
  attempted_contact: "Attempted",
  nurture: "Nurture",
  active_client: "Active",
  under_contract: "Under Contract",
  closed: "Closed",
  dead: "Dead",
};
const STAGE_COLORS: Record<string, string> = {
  new_lead: "#6366f1",
  attempted_contact: "#8b5cf6",
  nurture: "#a78bfa",
  active_client: "#3b82f6",
  under_contract: "#f59e0b",
  closed: "#10b981",
  dead: "#9ca3af",
};

const PIE_COLORS: Record<string, string> = {
  buyer: "#3b82f6",
  seller: "#10b981",
  dual: "#f59e0b",
};

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function StatsPage() {
  const { user } = useAuth() as any;
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  // ── Data fetching ──────────────────────────────────────────────────────────
  const { data: annualGoals, isLoading: goalsLoading } = trpc.analytics.myGoals.useQuery({
    year: currentYear,
    month: 0,
  });

  const { data: trendData, isLoading: trendLoading } = trpc.analytics.monthlyGciTrend.useQuery({
    months: 18,
    agentId: user?.id,
  });

  const { data: pipelineData, isLoading: pipelineLoading } = trpc.analytics.agentPipelineFunnel.useQuery({
    agentId: user?.id,
  });

  const { data: txTypeData, isLoading: txTypeLoading } = trpc.analytics.agentTransactionTypeBreakdown.useQuery(
    { agentId: user?.id ?? 0 },
    { enabled: !!user?.id }
  );

  const { data: careerData, isLoading: careerLoading } = trpc.analytics.myCareerStats.useQuery();

  const { data: workspaceData, isLoading: workspaceLoading } = trpc.analytics.workspace.useQuery({
    dateFrom: `${currentYear}-01-01`,
    dateTo: new Date().toISOString().slice(0, 10),
  });

  const isLoading = goalsLoading || trendLoading || pipelineLoading || txTypeLoading || careerLoading || workspaceLoading;

  // ── Derived values ─────────────────────────────────────────────────────────
  const ytdGci = workspaceData?.summary.gci ?? 0;
  const ytdClosings = workspaceData?.summary.closings ?? 0;
  const ytdVolume = workspaceData?.summary.volume ?? 0;
  const activePipeline = workspaceData?.pipeline?.activeCount ?? 0;
  const stalledCount = workspaceData?.pipeline?.stalledCount ?? 0;
  const overdueFollowUps = workspaceData?.pipeline?.overdueFollowUpCount ?? 0;
  const gciTrendPct = workspaceData?.summary.gciTrendPct ?? null;
  const closingsTrendPct = workspaceData?.summary.closingsTrendPct ?? null;

  // Pipeline funnel — exclude closed/dead for the active funnel chart
  const funnelChartData = (pipelineData ?? [])
    .filter((s) => !["closed", "dead"].includes(s.status))
    .sort((a, b) => STAGE_ORDER.indexOf(a.status) - STAGE_ORDER.indexOf(b.status))
    .map((s) => ({
      stage: STAGE_LABELS[s.status] ?? s.status,
      count: s.count,
      fill: STAGE_COLORS[s.status] ?? "#6366f1",
    }));

  // Monthly trend — last 12 months
  const trendChartData = (trendData ?? []).slice(-12).map((row) => ({
    month: monthLabel(row.month),
    gci: Number(row.gci ?? 0),
    deals: Number(row.deals ?? 0),
  }));

  // Transaction type pie
  const txPieData = (txTypeData ?? [])
    .filter((r) => Number(r.count) > 0)
    .map((r) => ({
      name: r.type ? r.type.charAt(0).toUpperCase() + r.type.slice(1) : "Unknown",
      value: Number(r.count),
      gci: Number(r.totalGci ?? 0),
      fill: PIE_COLORS[r.type ?? ""] ?? "#6366f1",
    }));

  // Lead sources from workspace
  const topSources = (workspaceData?.sources ?? [])
    .filter((s) => s.closings > 0 || s.leadCount > 0)
    .slice(0, 6);

  // Tasks snapshot
  const openTasks = workspaceData?.tasks?.openCount ?? 0;
  const overdueTasks = workspaceData?.tasks?.overdueCount ?? 0;
  const completedTasks = workspaceData?.tasks?.completedCount ?? 0;
  const taskCompletionRate = workspaceData?.tasks?.completionRate ?? null;

  // Career stats
  const career = careerData;

  // Goal progress
  const gciPct = annualGoals?.gciPct ?? null;
  const closingsPct = annualGoals?.closingsPct ?? null;
  const volumePct = annualGoals?.volumePct ?? null;
  const hasGoals = annualGoals?.hasGoals ?? false;

  // Expected progress through year
  const dayOfYear = Math.floor((Date.now() - new Date(currentYear, 0, 0).getTime()) / 86400000);
  const daysInYear = (currentYear % 4 === 0 ? 366 : 365);
  const expectedPct = Math.round((dayOfYear / daysInYear) * 100);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading your stats…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10">
      <PageHeader
        title="My Stats"
        subtitle={`${currentYear} performance overview`}
      />

      {/* ── YTD Hero Row ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          title="YTD GCI"
          value={fmt$(ytdGci)}
          subtitle={`${currentYear} to date`}
          icon={DollarSign}
          color="green"
          trend={gciTrendPct !== null ? { pct: gciTrendPct, label: "vs prior period" } : undefined}
        />
        <StatCard
          title="YTD Closings"
          value={String(ytdClosings)}
          subtitle="Closed transactions"
          icon={CheckCircle2}
          color="blue"
          trend={closingsTrendPct !== null ? { pct: closingsTrendPct, label: "vs prior period" } : undefined}
        />
        <StatCard
          title="YTD Volume"
          value={fmt$(ytdVolume, true)}
          subtitle="Total sales volume"
          icon={Home}
          color="purple"
        />
        <StatCard
          title="Active Pipeline"
          value={String(activePipeline)}
          subtitle={`${stalledCount} stalled · ${overdueFollowUps} overdue`}
          icon={GitBranch}
          color="amber"
        />
      </div>

      {/* ── Annual Goal Progress ───────────────────────────────────────────── */}
      {hasGoals ? (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                Annual Goal Progress
              </CardTitle>
              <Badge variant="outline" className="text-xs">
                {expectedPct}% through year
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap justify-around gap-6 py-2">
              {annualGoals?.gciTarget ? (
                <GoalRing
                  label="GCI"
                  actual={annualGoals.gci}
                  target={annualGoals.gciTarget}
                  pct={gciPct}
                  formatValue={(n) => fmt$(n, true)}
                  color={gciPct !== null && gciPct >= expectedPct ? "green" : gciPct !== null && gciPct >= expectedPct - 10 ? "amber" : "blue"}
                />
              ) : null}
              {annualGoals?.closingsTarget ? (
                <GoalRing
                  label="Closings"
                  actual={annualGoals.closings}
                  target={annualGoals.closingsTarget}
                  pct={closingsPct}
                  formatValue={(n) => String(n)}
                  color={closingsPct !== null && closingsPct >= expectedPct ? "green" : closingsPct !== null && closingsPct >= expectedPct - 10 ? "amber" : "blue"}
                />
              ) : null}
              {annualGoals?.volumeTarget ? (
                <GoalRing
                  label="Volume"
                  actual={annualGoals.volume}
                  target={annualGoals.volumeTarget}
                  pct={volumePct}
                  formatValue={(n) => fmt$(n, true)}
                  color={volumePct !== null && volumePct >= expectedPct ? "green" : volumePct !== null && volumePct >= expectedPct - 10 ? "amber" : "blue"}
                />
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed">
          <CardContent className="p-5 text-center text-muted-foreground text-sm">
            <Target className="h-8 w-8 mx-auto mb-2 opacity-30" />
            No annual goals set yet. Ask your admin to set your goals.
          </CardContent>
        </Card>
      )}

      {/* ── Monthly GCI Trend ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            GCI Trend — Last 12 Months
          </CardTitle>
        </CardHeader>
        <CardContent>
          {trendChartData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">No closed transactions yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={trendChartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gciGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => fmt$(v, true)} tick={{ fontSize: 11 }} width={52} />
                <Tooltip
                  formatter={(value: number, name: string) =>
                    name === "gci" ? [fmt$(value), "GCI"] : [value, "Deals"]
                  }
                  labelStyle={{ fontWeight: 600 }}
                />
                <Area
                  type="monotone"
                  dataKey="gci"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  fill="url(#gciGrad)"
                  dot={{ r: 3, fill: "#3b82f6" }}
                  activeDot={{ r: 5 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* ── Pipeline Funnel + Deal Type ───────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Pipeline Funnel */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-primary" />
              Active Pipeline Funnel
            </CardTitle>
          </CardHeader>
          <CardContent>
            {funnelChartData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">No pipeline contacts</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={funnelChartData} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="stage" tick={{ fontSize: 11 }} width={90} />
                  <Tooltip formatter={(v: number) => [v, "Contacts"]} />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {funnelChartData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Deal Type Breakdown */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Home className="h-4 w-4 text-primary" />
              Deal Type Mix
            </CardTitle>
          </CardHeader>
          <CardContent>
            {txPieData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">No closed transactions yet</div>
            ) : (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="55%" height={180}>
                  <PieChart>
                    <Pie
                      data={txPieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={72}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {txPieData.map((entry, idx) => (
                        <Cell key={idx} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number, name: string, props: any) => [
                        `${value} deals · ${fmt$(props.payload.gci)}`,
                        props.payload.name,
                      ]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-col gap-2 flex-1">
                  {txPieData.map((entry) => (
                    <div key={entry.name} className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: entry.fill }} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{entry.name}</p>
                        <p className="text-xs text-muted-foreground">{entry.value} deals · {fmt$(entry.gci, true)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Lead Sources + Tasks ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Top Lead Sources */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              Top Lead Sources
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topSources.length === 0 ? (
              <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">No lead source data yet</div>
            ) : (
              <div className="space-y-2">
                {topSources.map((src, idx) => {
                  const maxLeads = Math.max(...topSources.map((s) => s.leadCount), 1);
                  const pct = Math.round((src.leadCount / maxLeads) * 100);
                  return (
                    <div key={src.sourceId ?? idx} className="space-y-0.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium truncate max-w-[60%]">{src.sourceName}</span>
                        <span className="text-muted-foreground text-xs">
                          {src.leadCount} leads · {src.closings} closed
                          {src.gci > 0 ? ` · ${fmt$(src.gci, true)}` : ""}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tasks Snapshot */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              Tasks Snapshot
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-blue-50 p-3 text-center">
                <p className="text-2xl font-bold text-blue-600">{openTasks}</p>
                <p className="text-xs text-blue-500 mt-0.5">Open Tasks</p>
              </div>
              <div className={`rounded-lg p-3 text-center ${overdueTasks > 0 ? "bg-rose-50" : "bg-muted"}`}>
                <p className={`text-2xl font-bold ${overdueTasks > 0 ? "text-rose-600" : "text-muted-foreground"}`}>{overdueTasks}</p>
                <p className={`text-xs mt-0.5 ${overdueTasks > 0 ? "text-rose-500" : "text-muted-foreground"}`}>Overdue</p>
              </div>
              <div className="rounded-lg bg-emerald-50 p-3 text-center">
                <p className="text-2xl font-bold text-emerald-600">{completedTasks}</p>
                <p className="text-xs text-emerald-500 mt-0.5">Completed</p>
              </div>
              <div className="rounded-lg bg-amber-50 p-3 text-center">
                <p className="text-2xl font-bold text-amber-600">
                  {taskCompletionRate !== null ? fmtPct(taskCompletionRate * 100) : "—"}
                </p>
                <p className="text-xs text-amber-500 mt-0.5">Completion Rate</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Career Stats ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-500" />
            Career Stats (All-Time)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!career ? (
            <div className="h-24 flex items-center justify-center text-muted-foreground text-sm">No career data yet</div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <div className="flex justify-center mb-1"><Award className="h-5 w-5 text-amber-500" /></div>
                <p className="text-2xl font-bold">{career.totalClosings}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Total Closings</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <div className="flex justify-center mb-1"><DollarSign className="h-5 w-5 text-emerald-500" /></div>
                <p className="text-2xl font-bold">{fmt$(career.totalGci, true)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Total GCI Earned</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <div className="flex justify-center mb-1"><Star className="h-5 w-5 text-blue-500" /></div>
                <p className="text-2xl font-bold">{fmt$(career.avgGciPerDeal, true)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Avg GCI / Deal</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <div className="flex justify-center mb-1"><Flame className="h-5 w-5 text-rose-500" /></div>
                <p className="text-2xl font-bold">
                  {career.bestMonth ? fmt$(career.bestMonth.gci, true) : "—"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Best Month{career.bestMonth ? ` (${monthLabel(career.bestMonth.month)})` : ""}
                </p>
              </div>
            </div>
          )}
          {career?.firstClosingDate && (
            <p className="text-xs text-muted-foreground mt-3 text-center">
              <Calendar className="h-3 w-3 inline mr-1" />
              First closing: {new Date(career.firstClosingDate).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
