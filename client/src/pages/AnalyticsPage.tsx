import { useState, useMemo, useCallback } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import PageHeader from "@/components/PageHeader";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend, AreaChart, Area, FunnelChart, Funnel, LabelList,
} from "recharts";
import { ArrowUpRight, ArrowDownRight, Minus, Brain, AlertTriangle, TrendingUp, TrendingDown,
  Lightbulb, Target, Zap, RefreshCw, Clock, Users, DollarSign, Activity, Edit2, CheckCircle2, Trophy,
  Building2, BarChart2, UserCheck, Layers, Wallet, ListTodo, MapPin, UserPlus, Database, ChevronRight,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import BusinessOverviewTab from "./analytics/BusinessOverviewTab";
import AgentPerformanceTab from "./analytics/AgentPerformanceTab";
import GroupPerformanceTab from "./analytics/GroupPerformanceTab";
import MarketIntelligenceTab from "./analytics/MarketIntelligenceTab";
import CommissionPayoutsTab from "./analytics/CommissionPayoutsTab";
import TaskAnalyticsTab from "./analytics/TaskAnalyticsTab";
import IsaPipelineTab from "./analytics/IsaPipelineTab";
import LeadSourceAnalyticsTab from "./analytics/LeadSourceAnalyticsTab";
import OnboardingReportTab from "./analytics/OnboardingReportTab";
import DatabaseHealthTab from "./analytics/DatabaseHealthTab";
import FinancialPerformanceTab from "./analytics/FinancialPerformanceTab";

const COLORS = ["#1e3a5f", "#2563eb", "#16a34a", "#d97706", "#7c3aed", "#dc2626", "#0891b2", "#be185d"];
const PIPELINE_LABELS: Record<string, string> = {
  new_lead: "New Lead", attempted_contact: "Attempted", nurture: "Nurture",
  active_client: "Active", under_contract: "Under Contract", closed: "Closed", dead: "Dead",
};
const ISA_STAGE_COLORS: Record<string, string> = {
  new_lead: "#2563eb", attempted_contact: "#7c3aed", nurture: "#d97706",
  active_client: "#16a34a", under_contract: "#0891b2", closed: "#1e3a5f", dead: "#9ca3af",
};

function fmt$(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}k`;
  return `$${v.toLocaleString()}`;
}
function fmtPct(v: number) { return `${v > 0 ? "+" : ""}${v.toFixed(1)}%`; }
function fmtNum(v: number) { return v.toLocaleString(); }

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">{message}</div>
  );
}

function DateRangeFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-36 h-8 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All Time</SelectItem>
        <SelectItem value="ytd">Year to Date</SelectItem>
        <SelectItem value="last12">Last 12 Months</SelectItem>
        <SelectItem value="last6">Last 6 Months</SelectItem>
        <SelectItem value="last3">Last 3 Months</SelectItem>
        <SelectItem value="last30">Last 30 Days</SelectItem>
      </SelectContent>
    </Select>
  );
}

function useDateRange(range: string) {
  return useMemo(() => {
    const now = new Date();
    if (range === "all") return {};
    const from = new Date(now);
    if (range === "ytd") { from.setMonth(0); from.setDate(1); }
    else if (range === "last12") from.setMonth(from.getMonth() - 12);
    else if (range === "last6") from.setMonth(from.getMonth() - 6);
    else if (range === "last3") from.setMonth(from.getMonth() - 3);
    else if (range === "last30") from.setDate(from.getDate() - 30);
    return { dateFrom: from.toISOString(), dateTo: now.toISOString() };
  }, [range]);
}

function KpiCard({ label, value, sub, trend, icon }: {
  label: string; value: string | number; sub?: string;
  trend?: "up" | "down" | "flat"; icon?: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground font-medium mb-1">{label}</p>
            <p className="text-2xl font-bold text-foreground">{value}</p>
            {sub && (
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                {trend === "up" && <ArrowUpRight className="h-3 w-3 text-green-500" />}
                {trend === "down" && <ArrowDownRight className="h-3 w-3 text-red-500" />}
                {trend === "flat" && <Minus className="h-3 w-3 text-muted-foreground" />}
                {sub}
              </p>
            )}
          </div>
          {icon && <div className="text-muted-foreground/40 ml-2">{icon}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

function TrendBadge({ value, suffix = "%" }: { value: number; suffix?: string }) {
  if (Math.abs(value) < 0.5) return <Badge variant="secondary" className="text-xs">Flat</Badge>;
  if (value > 0) return <Badge className="text-xs bg-green-100 text-green-700 border-green-200">{`+${value.toFixed(1)}${suffix}`}</Badge>;
  return <Badge className="text-xs bg-red-100 text-red-700 border-red-200">{`${value.toFixed(1)}${suffix}`}</Badge>;
}

// ─── Executive Dashboard Tab ──────────────────────────────────────────────────
function ExecutiveDashboardTab({ agentId }: { agentId?: number }) {
  const [range, setRange] = useState("ytd");
  const dates = useDateRange(range);
  const { data: exec, isLoading } = trpc.analytics.executiveDashboard.useQuery({ ...dates, agentId });
  const { data: trends } = trpc.analytics.trendComparisons.useQuery({ agentId });
  const { data: gciTrend } = trpc.analytics.monthlyGciTrend.useQuery({ months: 12, agentId });

  const chartData = useMemo(() => (gciTrend ?? []).map((r: any) => ({
    month: r.month,
    gci: Number(r.gci ?? 0),
    closings: Number(r.closings ?? 0),
  })), [gciTrend]);

  if (isLoading) return <div className="text-sm text-muted-foreground p-4">Loading executive dashboard...</div>;

  const mtd = exec?.mtd ?? { closings: 0, volume: 0, gci: 0, avgPrice: 0 };
  const ytd = exec?.ytd ?? { closings: 0, volume: 0, gci: 0, avgPrice: 0 };

  return (
    <div className="space-y-6">
      {/* Filter bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm text-muted-foreground font-medium">Period:</span>
        <DateRangeFilter value={range} onChange={setRange} />
      </div>

      {/* MTD KPIs */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Month to Date</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard label="MTD Closings" value={mtd.closings} icon={<Target className="h-5 w-5" />} />
          <KpiCard label="MTD GCI" value={fmt$(mtd.gci)} icon={<DollarSign className="h-5 w-5" />} />
          <KpiCard label="MTD Volume" value={fmt$(mtd.volume)} icon={<Activity className="h-5 w-5" />} />
          <KpiCard label="MTD Avg Price" value={fmt$(mtd.avgPrice)} icon={<TrendingUp className="h-5 w-5" />} />
        </div>
      </div>

      {/* YTD KPIs */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Year to Date</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard label="YTD Closings" value={ytd.closings} icon={<Target className="h-5 w-5" />} />
          <KpiCard label="YTD GCI" value={fmt$(ytd.gci)} icon={<DollarSign className="h-5 w-5" />} />
          <KpiCard label="YTD Volume" value={fmt$(ytd.volume)} icon={<Activity className="h-5 w-5" />} />
          <KpiCard label="YTD Avg Price" value={fmt$(ytd.avgPrice)} icon={<TrendingUp className="h-5 w-5" />} />
        </div>
      </div>

      {/* Efficiency KPIs */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Efficiency Metrics</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard label="Pipeline Value" value={fmt$(exec?.pipeline.value ?? 0)} sub={`${exec?.pipeline.count ?? 0} deals`} icon={<Zap className="h-5 w-5" />} />
          <KpiCard label="Revenue / Lead" value={fmt$(exec?.revenuePerLead ?? 0)} sub="YTD GCI ÷ total contacts" icon={<Users className="h-5 w-5" />} />
          <KpiCard label="Revenue / Agent" value={fmt$(exec?.revenuePerAgent ?? 0)} sub="YTD GCI ÷ active agents" icon={<DollarSign className="h-5 w-5" />} />
          <KpiCard label="Pipeline Coverage" value={`${((exec?.pipelineCoverageRatio ?? 0) * 100).toFixed(0)}%`} sub="pipeline ÷ YTD volume" icon={<Activity className="h-5 w-5" />} />
        </div>
      </div>

      {/* Trend comparisons */}
      {trends && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Period-over-Period Trends</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { label: "Week over Week", data: trends.weekOverWeek },
              { label: "Month over Month", data: trends.monthOverMonth },
              { label: "Year over Year", data: trends.yearOverYear },
            ].map(({ label, data }) => (
              <Card key={label}>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">{label}</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">GCI</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{fmt$(data.current.gci)}</span>
                      <TrendBadge value={data.gciChange} />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Closings</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{data.current.closings}</span>
                      <TrendBadge value={data.closingsChange} />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Volume</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{fmt$(data.current.volume)}</span>
                      <TrendBadge value={data.volumeChange} />
                    </div>
                  </div>
                  <div className="pt-1 border-t text-xs text-muted-foreground">
                    Prior: {fmt$(data.previous.gci)} GCI · {data.previous.closings} closings
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Monthly GCI trend chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">12-Month GCI Trend</CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? <EmptyChart message="No data yet" /> : (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="gciGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => fmt$(v)} />
                <Tooltip formatter={(v: number) => [fmt$(v), "GCI"]} />
                <Area type="monotone" dataKey="gci" stroke="#2563eb" fill="url(#gciGrad)" strokeWidth={2} dot={{ r: 3 }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Sales Funnel Tab ─────────────────────────────────────────────────────────
function SalesFunnelTab({ agentId }: { agentId?: number }) {
  const { data: funnel, isLoading } = trpc.analytics.salesFunnel.useQuery({ agentId });
  const { data: txTypes } = trpc.analytics.transactionTypeBreakdown.useQuery({});

  if (isLoading) return <div className="text-sm text-muted-foreground p-4">Loading sales funnel...</div>;
  if (!funnel) return <EmptyChart message="No funnel data available" />;

  const stages = funnel.stages ?? [];
  const maxCount = Math.max(...stages.map((s: any) => s.count), 1);

  const txTypeData = (txTypes ?? []).map((t: any) => ({
    name: t.type === "buyer" ? "Buyer" : t.type === "seller" ? "Seller" : "Dual",
    gci: Number(t.totalGci ?? 0),
    count: Number(t.count ?? 0),
  }));

  return (
    <div className="space-y-6">
      {/* Funnel KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Total in Pipeline" value={fmtNum(funnel.totalLeads)} icon={<Users className="h-5 w-5" />} />
        <KpiCard label="Lead → Close Rate" value={`${funnel.leadToCloseRate?.toFixed(1) ?? 0}%`} icon={<Target className="h-5 w-5" />} />
        <KpiCard label="Avg Days to Close" value={`${Math.round(funnel.avgDaysToClose ?? 0)}d`} icon={<Clock className="h-5 w-5" />} />
        <KpiCard label="Closed Deals" value={stages.find((s: any) => s.key === "closed")?.count ?? 0} icon={<TrendingUp className="h-5 w-5" />} />
      </div>

      {/* Visual funnel */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Pipeline Stage Conversion Funnel</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 py-2">
            {stages.map((s: any, i: number) => (
              <div key={s.key}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-medium">{s.label}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground">{fmtNum(s.count)} contacts</span>
                    {i > 0 && (
                      <span className={`font-semibold ${s.conversionFromPrev < 30 ? "text-red-500" : s.conversionFromPrev < 60 ? "text-amber-500" : "text-green-600"}`}>
                        {s.conversionFromPrev.toFixed(0)}% from prev
                      </span>
                    )}
                    <span className="text-muted-foreground">{s.conversionFromTop.toFixed(0)}% of total</span>
                  </div>
                </div>
                <div className="h-8 bg-muted/30 rounded-lg overflow-hidden">
                  <div
                    className="h-full rounded-lg transition-all flex items-center pl-3"
                    style={{
                      width: `${Math.max((s.count / maxCount) * 100, 2)}%`,
                      backgroundColor: COLORS[i % COLORS.length],
                    }}
                  >
                    {s.count > 0 && <span className="text-white text-xs font-medium">{s.count}</span>}
                  </div>
                </div>
                {i > 0 && s.dropOff > 0 && (
                  <p className="text-xs text-red-400 mt-0.5 ml-1">▼ {s.dropOff} dropped off</p>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Transaction type breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">GCI by Transaction Type</CardTitle></CardHeader>
          <CardContent>
            {txTypeData.length === 0 ? <EmptyChart message="No transactions yet" /> : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={txTypeData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => fmt$(v)} />
                  <Tooltip formatter={(v: number) => [fmt$(v), "GCI"]} />
                  <Bar dataKey="gci" radius={[4, 4, 0, 0]}>
                    {txTypeData.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Deal Count by Type</CardTitle></CardHeader>
          <CardContent>
            {txTypeData.length === 0 ? <EmptyChart message="No transactions yet" /> : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={txTypeData} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={80}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                    {txTypeData.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => [v, "Deals"]} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Lead Source ROI Tab ──────────────────────────────────────────────────────
function LeadSourceROITab({ agentId }: { agentId?: number }) {
  const [range, setRange] = useState("ytd");
  const dates = useDateRange(range);
  const [sortBy, setSortBy] = useState<"totalGci" | "leads" | "conversionRate" | "revenuePerLead">("totalGci");
  const { data: roiData, isLoading } = trpc.analytics.leadSourceROI.useQuery({ ...dates, agentId });
  const { data: funnelData } = trpc.analytics.leadSourceFunnel.useQuery({ ...dates, agentId });

  const sorted = useMemo(() => {
    if (!roiData) return [];
    return [...roiData].sort((a: any, b: any) => Number(b[sortBy]) - Number(a[sortBy]));
  }, [roiData, sortBy]);

  const totalGci = sorted.reduce((s: number, r: any) => s + r.totalGci, 0);
  const totalLeads = sorted.reduce((s: number, r: any) => s + r.leads, 0);
  const totalClosed = sorted.reduce((s: number, r: any) => s + r.closed, 0);

  if (isLoading) return <div className="text-sm text-muted-foreground p-4">Loading lead source ROI...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm text-muted-foreground font-medium">Period:</span>
        <DateRangeFilter value={range} onChange={setRange} />
        <span className="text-sm text-muted-foreground font-medium ml-4">Sort by:</span>
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
          <SelectTrigger className="w-40 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="totalGci">Total GCI</SelectItem>
            <SelectItem value="leads">Total Leads</SelectItem>
            <SelectItem value="conversionRate">Conversion Rate</SelectItem>
            <SelectItem value="revenuePerLead">Revenue / Lead</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Total GCI (All Sources)" value={fmt$(totalGci)} icon={<DollarSign className="h-5 w-5" />} />
        <KpiCard label="Total Leads" value={fmtNum(totalLeads)} icon={<Users className="h-5 w-5" />} />
        <KpiCard label="Total Closed" value={fmtNum(totalClosed)} icon={<Target className="h-5 w-5" />} />
        <KpiCard label="Overall Conversion" value={totalLeads > 0 ? `${((totalClosed / totalLeads) * 100).toFixed(1)}%` : "0%"} icon={<TrendingUp className="h-5 w-5" />} />
      </div>

      {/* ROI Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Lead Source Performance</CardTitle>
        </CardHeader>
        <CardContent>
          {sorted.length === 0 ? <EmptyChart message="No lead source data yet" /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="text-left py-2 pr-4 font-medium">Source</th>
                    <th className="text-right py-2 px-2 font-medium">Leads</th>
                    <th className="text-right py-2 px-2 font-medium">Closed</th>
                    <th className="text-right py-2 px-2 font-medium">Conv. Rate</th>
                    <th className="text-right py-2 px-2 font-medium">Total GCI</th>
                    <th className="text-right py-2 px-2 font-medium">Rev / Lead</th>
                    <th className="text-right py-2 pl-2 font-medium">Avg Deal</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((row: any, i: number) => (
                    <tr key={row.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="py-2 pr-4">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                          <span className="font-medium">{row.name}</span>
                          {row.parentId && <span className="text-xs text-muted-foreground">(sub)</span>}
                        </div>
                      </td>
                      <td className="text-right py-2 px-2">{fmtNum(row.leads)}</td>
                      <td className="text-right py-2 px-2">{fmtNum(row.closed)}</td>
                      <td className="text-right py-2 px-2">
                        <span className={`font-medium ${row.conversionRate >= 10 ? "text-green-600" : row.conversionRate >= 5 ? "text-amber-600" : "text-red-500"}`}>
                          {row.conversionRate.toFixed(1)}%
                        </span>
                      </td>
                      <td className="text-right py-2 px-2 font-semibold">{fmt$(row.totalGci)}</td>
                      <td className="text-right py-2 px-2">{fmt$(row.revenuePerLead)}</td>
                      <td className="text-right py-2 pl-2">{fmt$(row.avgDealSize)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bar chart: GCI by source */}
      {sorted.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">GCI by Lead Source</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={sorted.slice(0, 10)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => fmt$(v)} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} />
                <Tooltip formatter={(v: number) => [fmt$(v), "GCI"]} />
                <Bar dataKey="totalGci" radius={[0, 4, 4, 0]}>
                  {sorted.slice(0, 10).map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Pipeline Health Tab ──────────────────────────────────────────────────────
function PipelineHealthTab({ agentId }: { agentId?: number }) {
  const [, navigate] = useLocation();
  const { data: health, isLoading } = trpc.analytics.pipelineHealth.useQuery({ agentId });
  const { data: velocity } = trpc.analytics.pipelineVelocity.useQuery();

  if (isLoading) return <div className="text-sm text-muted-foreground p-4">Loading pipeline health...</div>;
  if (!health) return <EmptyChart message="No pipeline data available" />;

  const agingData = [
    { bucket: "0-7 days", count: 0 },
    { bucket: "8-14 days", count: 0 },
    { bucket: "15-30 days", count: 0 },
    { bucket: "30+ days", count: 0 },
  ].map(b => {
    const found = health.agingBuckets?.find((a: any) => a.bucket === b.bucket);
    return { ...b, count: found ? Number(found.count) : 0 };
  });

  const stageBreakdown = health.stageBreakdown ?? [];

  return (
    <div className="space-y-6">
      {/* Health KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          label="Pipeline Value"
          value={fmt$(health.pipelineValue ?? 0)}
          sub={`${health.pipelineCount ?? 0} under contract`}
          icon={<DollarSign className="h-5 w-5" />}
        />
        <KpiCard
          label="Stalled Deals"
          value={health.totalStalled ?? 0}
          sub="14+ days no update"
          trend={health.totalStalled > 5 ? "down" : "flat"}
          icon={<AlertTriangle className="h-5 w-5" />}
        />
        <KpiCard
          label="Avg Days in Active"
          value={`${Math.round(stageBreakdown.find((s: any) => s.stage === "active_client")?.avgDaysInStage ?? 0)}d`}
          icon={<Clock className="h-5 w-5" />}
        />
        <KpiCard
          label="Avg Days Under Contract"
          value={`${Math.round(stageBreakdown.find((s: any) => s.stage === "under_contract")?.avgDaysInStage ?? 0)}d`}
          icon={<Clock className="h-5 w-5" />}
        />
      </div>

      {/* Aging heatmap */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Pipeline Aging Distribution</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={agingData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="bucket" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip formatter={(v: number) => [v, "Contacts"]} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {agingData.map((_, i) => (
                    <Cell key={i} fill={i === 0 ? "#16a34a" : i === 1 ? "#d97706" : i === 2 ? "#ea580c" : "#dc2626"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Avg days by stage */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Avg Days in Stage</CardTitle></CardHeader>
          <CardContent>
            {stageBreakdown.length === 0 ? <EmptyChart message="No stage data" /> : (
              <div className="space-y-2 py-2">
                {stageBreakdown.filter((s: any) => s.stage !== "dead").map((s: any) => (
                  <div key={s.stage} className="flex items-center gap-3">
                    <span className="text-xs w-28 text-muted-foreground">{PIPELINE_LABELS[s.stage] ?? s.stage}</span>
                    <div className="flex-1 h-5 bg-muted/30 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min((s.avgDaysInStage / 60) * 100, 100)}%`,
                          backgroundColor: s.avgDaysInStage > 30 ? "#dc2626" : s.avgDaysInStage > 14 ? "#d97706" : "#2563eb",
                        }}
                      />
                    </div>
                    <span className="text-xs font-medium w-12 text-right">{Math.round(s.avgDaysInStage)}d avg</span>
                    <span className="text-xs text-muted-foreground w-8 text-right">{s.count}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Stalled deals table */}
      {(health.stalledDeals ?? []).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Stalled Deals (14+ Days)</CardTitle>
              <Badge variant="destructive" className="text-xs">{health.totalStalled} stalled</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="text-left py-2 pr-4 font-medium">Contact</th>
                    <th className="text-left py-2 px-2 font-medium">Agent</th>
                    <th className="text-left py-2 px-2 font-medium">Stage</th>
                    <th className="text-right py-2 pl-2 font-medium">Days Stalled</th>
                  </tr>
                </thead>
                <tbody>
                  {(health.stalledDeals ?? []).slice(0, 20).map((deal: any) => (
                    <tr
                      key={deal.id}
                      className="border-b last:border-0 hover:bg-muted/30 cursor-pointer"
                      onClick={() => deal.contactId && navigate(`/contacts/${deal.contactId}`)}
                      title={deal.contactId ? "View contact" : undefined}
                    >
                      <td className="py-2 pr-4 font-medium text-primary hover:underline">{deal.contactFirstName} {deal.contactLastName}</td>
                      <td className="py-2 px-2 text-muted-foreground">{deal.agentName ?? "—"}</td>
                      <td className="py-2 px-2">
                        <Badge variant="outline" className="text-xs">{PIPELINE_LABELS[deal.stage] ?? deal.stage}</Badge>
                      </td>
                      <td className="text-right py-2 pl-2">
                        <span className={`font-semibold ${deal.daysSinceUpdate > 30 ? "text-red-500" : "text-amber-500"}`}>
                          {deal.daysSinceUpdate}d
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Goal Setting Dialog ──────────────────────────────────────────────────────
type GoalDialogAgent = { agentId: number; agentName: string; gciTarget?: number | null; closingsTarget?: number | null; volumeTarget?: number | null };

function GoalDialog({ agent, year, month, onClose, onSaved }: {
  agent: GoalDialogAgent;
  year: number;
  month: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [gci, setGci] = useState(agent.gciTarget != null ? String(agent.gciTarget) : "");
  const [closings, setClosings] = useState(agent.closingsTarget != null ? String(agent.closingsTarget) : "");
  const [volume, setVolume] = useState(agent.volumeTarget != null ? String(agent.volumeTarget) : "");
  const utils = trpc.useUtils();
  const setGoal = trpc.analytics.setGoal.useMutation({
    onSuccess: () => {
      toast.success(`Goals saved for ${agent.agentName}`);
      utils.analytics.agentProductionWithGoals.invalidate();
      onSaved();
    },
    onError: (e) => toast.error(e.message),
  });

  const MONTH_NAMES = ["Annual","Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target className="h-4 w-4" />
            Set Goals — {agent.agentName}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">{MONTH_NAMES[month]} {year}</p>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label className="text-xs">GCI Target ($)</Label>
            <Input type="number" placeholder="e.g. 50000" value={gci} onChange={(e) => setGci(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Closings Target</Label>
            <Input type="number" placeholder="e.g. 5" value={closings} onChange={(e) => setClosings(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Volume Target ($)</Label>
            <Input type="number" placeholder="e.g. 2000000" value={volume} onChange={(e) => setVolume(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} size="sm">Cancel</Button>
          <Button
            size="sm"
            disabled={setGoal.isPending}
            onClick={() => setGoal.mutate({
              agentId: agent.agentId,
              year,
              month,
              gciTarget: gci ? Number(gci) : null,
              closingsTarget: closings ? Number(closings) : null,
              volumeTarget: volume ? Number(volume) : null,
            })}
          >
            {setGoal.isPending ? "Saving..." : "Save Goals"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BulkGoalDialog({ agents, year, month, onClose, onSaved }: {
  agents: { agentId: number; agentName: string }[];
  year: number;
  month: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [gci, setGci] = useState("");
  const [closings, setClosings] = useState("");
  const [volume, setVolume] = useState("");
  const utils = trpc.useUtils();
  const setBulk = trpc.analytics.setBulkGoals.useMutation({
    onSuccess: () => {
      toast.success(`Goals set for all ${agents.length} agents`);
      utils.analytics.agentProductionWithGoals.invalidate();
      onSaved();
    },
    onError: (e) => toast.error(e.message),
  });
  const MONTH_NAMES = ["Annual","Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Set Goals for All Agents
          </DialogTitle>
          <p className="text-xs text-muted-foreground">{MONTH_NAMES[month]} {year} — applies to {agents.length} agents</p>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label className="text-xs">GCI Target ($) per agent</Label>
            <Input type="number" placeholder="e.g. 50000" value={gci} onChange={(e) => setGci(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Closings Target per agent</Label>
            <Input type="number" placeholder="e.g. 5" value={closings} onChange={(e) => setClosings(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Volume Target ($) per agent</Label>
            <Input type="number" placeholder="e.g. 2000000" value={volume} onChange={(e) => setVolume(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} size="sm">Cancel</Button>
          <Button
            size="sm"
            disabled={setBulk.isPending}
            onClick={() => setBulk.mutate({
              agentIds: agents.map(a => a.agentId),
              year,
              month,
              gciTarget: gci ? Number(gci) : null,
              closingsTarget: closings ? Number(closings) : null,
              volumeTarget: volume ? Number(volume) : null,
            })}
          >
            {setBulk.isPending ? "Saving..." : "Apply to All"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GoalProgressBar({ label, value, target, formatter = (v: number) => String(v) }: {
  label: string; value: number; target: number | null | undefined;
  formatter?: (v: number) => string;
}) {
  if (!target) return null;
  const pct = Math.min(Math.round((value / target) * 100), 100);
  const over = value >= target;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className={over ? "text-green-600 font-semibold" : "text-foreground"}>
          {formatter(value)} / {formatter(target)}
          {over && <CheckCircle2 className="inline h-3 w-3 ml-1 text-green-500" />}
        </span>
      </div>
      <Progress value={pct} className={`h-1.5 ${over ? "[&>div]:bg-green-500" : ""}`} />
      <div className="text-right text-xs text-muted-foreground">{pct}%</div>
    </div>
  );
}

// ─── Agent Production Tab ─────────────────────────────────────────────────────
function AgentProductionTab() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(0); // 0 = annual
  const [goalAgent, setGoalAgent] = useState<GoalDialogAgent | null>(null);
  const [showBulkDialog, setShowBulkDialog] = useState(false);

  const { data: agents, isLoading, refetch } = trpc.analytics.agentProductionWithGoals.useQuery({ year, month });
  const agentList = agents ?? [];

  const MONTH_NAMES = ["Annual","Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const yearOptions = [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2];

  const handleGoalSaved = useCallback(() => {
    setGoalAgent(null);
    setShowBulkDialog(false);
    refetch();
  }, [refetch]);

  if (isLoading) return <div className="text-sm text-muted-foreground p-4">Loading agent production...</div>;

  const totalGci = agentList.reduce((s: number, a: any) => s + a.gci, 0);
  const totalClosings = agentList.reduce((s: number, a: any) => s + a.closings, 0);
  const totalPipeline = agentList.reduce((s: number, a: any) => s + a.activePipeline, 0);
  const agentsWithGoals = agentList.filter((a: any) => a.gciTarget || a.closingsTarget).length;

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm text-muted-foreground font-medium">Period:</span>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-24 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {yearOptions.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
            <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MONTH_NAMES.map((m, i) => <SelectItem key={i} value={String(i)}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => setShowBulkDialog(true)}>
            <Users className="h-3 w-3" /> Set Goals for All
          </Button>
        </div>
      </div>

      {/* KPI summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Active Agents" value={agentList.length} icon={<Users className="h-5 w-5" />} />
        <KpiCard label="Total GCI" value={fmt$(totalGci)} icon={<DollarSign className="h-5 w-5" />} />
        <KpiCard label="Total Closings" value={totalClosings} icon={<CheckCircle2 className="h-5 w-5" />} />
        <KpiCard label="Goals Set" value={`${agentsWithGoals} / ${agentList.length}`} icon={<Target className="h-5 w-5" />} />
      </div>

      {/* Leaderboard with goal progress */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Trophy className="h-4 w-4 text-amber-500" /> Agent Leaderboard
              <span className="text-xs text-muted-foreground font-normal">
                {MONTH_NAMES[month]} {year}
              </span>
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {agentList.length === 0 ? <EmptyChart message="No agent data yet" /> : (
            <div className="space-y-4">
              {agentList.map((a: any, i: number) => {
                const hasGoal = a.gciTarget || a.closingsTarget || a.volumeTarget;
                const gciPct = a.gciPct;
                const closingsPct = a.closingsPct;
                return (
                  <div key={a.agentId} className="border rounded-lg p-4 hover:bg-muted/20 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 ${
                          i === 0 ? "bg-amber-500" : i === 1 ? "bg-gray-400" : i === 2 ? "bg-amber-700" : "bg-muted-foreground"
                        }`}>{i + 1}</div>
                        <div className="min-w-0">
                          <p className="font-semibold text-sm">{a.agentName}</p>
                          <p className="text-xs text-muted-foreground">
                            {a.closings} closed · {fmt$(a.gci)} GCI · {a.activePipeline} active
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {hasGoal && (
                          <div className="flex items-center gap-1">
                            {gciPct !== null && (
                              <Badge className={`text-xs ${
                                gciPct >= 100 ? "bg-green-100 text-green-700 border-green-200" :
                                gciPct >= 75 ? "bg-blue-100 text-blue-700 border-blue-200" :
                                gciPct >= 50 ? "bg-amber-100 text-amber-700 border-amber-200" :
                                "bg-red-100 text-red-700 border-red-200"
                              }`}>{gciPct}% GCI</Badge>
                            )}
                            {closingsPct !== null && (
                              <Badge className={`text-xs ${
                                closingsPct >= 100 ? "bg-green-100 text-green-700 border-green-200" :
                                closingsPct >= 75 ? "bg-blue-100 text-blue-700 border-blue-200" :
                                "bg-amber-100 text-amber-700 border-amber-200"
                              }`}>{closingsPct}% closes</Badge>
                            )}
                          </div>
                        )}
                        <Button
                          variant="ghost" size="sm"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                          onClick={() => setGoalAgent({ agentId: a.agentId, agentName: a.agentName, gciTarget: a.gciTarget, closingsTarget: a.closingsTarget, volumeTarget: a.volumeTarget })}
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    {hasGoal && (
                      <div className="mt-3 space-y-2 pt-3 border-t">
                        <GoalProgressBar label="GCI" value={a.gci} target={a.gciTarget} formatter={fmt$} />
                        <GoalProgressBar label="Closings" value={a.closings} target={a.closingsTarget} />
                        <GoalProgressBar label="Volume" value={a.volume} target={a.volumeTarget} formatter={fmt$} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* GCI bar chart */}
      {agentList.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">GCI by Agent</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={agentList.slice(0, 10)}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="agentName" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => fmt$(v)} />
                <Tooltip formatter={(v: number) => [fmt$(v), "GCI"]} />
                <Bar dataKey="gci" name="GCI" radius={[4, 4, 0, 0]}>
                  {agentList.slice(0, 10).map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Goal dialogs */}
      {goalAgent && (
        <GoalDialog
          agent={goalAgent}
          year={year}
          month={month}
          onClose={() => setGoalAgent(null)}
          onSaved={handleGoalSaved}
        />
      )}
      {showBulkDialog && (
        <BulkGoalDialog
          agents={agentList.map((a: any) => ({ agentId: a.agentId, agentName: a.agentName }))}
          year={year}
          month={month}
          onClose={() => setShowBulkDialog(false)}
          onSaved={handleGoalSaved}
        />
      )}
    </div>
  );
}

// ─── ISA Performance Tab ──────────────────────────────────────────────────────
function IsaPerformanceTab() {
  const [range, setRange] = useState("ytd");
  const dates = useDateRange(range);
  const { data: isas, isLoading } = trpc.analytics.isaPerformance.useQuery(dates);
  const { data: funnelByIsa } = trpc.analytics.isaStatusFunnelByIsa.useQuery();

  const stageBarData = useMemo(() => {
    if (!funnelByIsa) return [];
    const stages = ["new_lead", "attempted_contact", "nurture", "active_client", "under_contract", "closed"];
    return stages.map(stage => {
      const row: Record<string, string | number> = { stage: PIPELINE_LABELS[stage] ?? stage };
      (funnelByIsa as any[]).forEach((isa: any) => {
        row[isa.isaName] = isa.stages?.[stage] ?? 0;
      });
      return row;
    });
  }, [funnelByIsa]);

  const isaNames = useMemo(() => (funnelByIsa as any[] ?? []).map((i: any) => i.isaName), [funnelByIsa]);

  if (isLoading) return <div className="text-sm text-muted-foreground p-4">Loading ISA performance...</div>;
  const isaList = isas ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground font-medium">Period:</span>
        <DateRangeFilter value={range} onChange={setRange} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Total ISAs" value={isaList.length} />
        <KpiCard label="Leads Assigned" value={isaList.reduce((s: number, i: any) => s + i.leadsAssigned, 0)} />
        <KpiCard label="Converted to Active" value={isaList.reduce((s: number, i: any) => s + i.converted, 0)} />
        <KpiCard label="Avg Conversion Rate" value={`${isaList.length > 0 ? (isaList.reduce((s: number, i: any) => s + i.conversionRate, 0) / isaList.length).toFixed(1) : 0}%`} />
      </div>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">ISA Performance Breakdown</CardTitle></CardHeader>
        <CardContent>
          {isaList.length === 0 ? <EmptyChart message="No ISA data yet" /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="text-left py-2 pr-4 font-medium">ISA</th>
                    <th className="text-right py-2 px-2 font-medium">Assigned</th>
                    <th className="text-right py-2 px-2 font-medium">Attempted</th>
                    <th className="text-right py-2 px-2 font-medium">Converted</th>
                    <th className="text-right py-2 pl-2 font-medium">Conv. Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {isaList.map((isa: any) => (
                    <tr key={isa.isaId} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="py-2 pr-4 font-medium">{isa.isaName}</td>
                      <td className="text-right py-2 px-2">{isa.leadsAssigned}</td>
                      <td className="text-right py-2 px-2">{isa.attempted}</td>
                      <td className="text-right py-2 px-2">{isa.converted}</td>
                      <td className="text-right py-2 pl-2">
                        <span className={`font-semibold ${isa.conversionRate >= 20 ? "text-green-600" : isa.conversionRate >= 10 ? "text-amber-600" : "text-red-500"}`}>
                          {isa.conversionRate?.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      {isaNames.length > 0 && stageBarData.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Pipeline Status by ISA</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={stageBarData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="stage" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip />
                <Legend />
                {isaNames.map((name: string, i: number) => (
                  <Bar key={name} dataKey={name} stackId="a" fill={COLORS[i % COLORS.length]} radius={i === isaNames.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── AI Insights Tab ──────────────────────────────────────────────────────────
const INSIGHT_ICONS: Record<string, React.ReactNode> = {
  warning: <AlertTriangle className="h-4 w-4 text-amber-500" />,
  opportunity: <Lightbulb className="h-4 w-4 text-blue-500" />,
  coaching: <Target className="h-4 w-4 text-purple-500" />,
  anomaly: <Activity className="h-4 w-4 text-red-500" />,
  success: <TrendingUp className="h-4 w-4 text-green-500" />,
};
const INSIGHT_COLORS: Record<string, string> = {
  warning: "border-amber-200 bg-amber-50 dark:bg-amber-950/20",
  opportunity: "border-blue-200 bg-blue-50 dark:bg-blue-950/20",
  coaching: "border-purple-200 bg-purple-50 dark:bg-purple-950/20",
  anomaly: "border-red-200 bg-red-50 dark:bg-red-950/20",
  success: "border-green-200 bg-green-50 dark:bg-green-950/20",
};
const PRIORITY_BADGE: Record<string, string> = {
  high: "bg-red-100 text-red-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-gray-100 text-gray-600",
};

function AiInsightsTab() {
  const [insights, setInsights] = useState<any[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const generateMutation = trpc.analytics.aiInsights.useMutation({
    onSuccess: (data) => {
      setInsights(data.insights ?? []);
      setGeneratedAt(data.generatedAt);
      setLoading(false);
    },
    onError: () => setLoading(false),
  });

  const handleGenerate = () => {
    setLoading(true);
    generateMutation.mutate();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">AI-Powered Business Insights</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Analyzes last 30 days of performance data to surface anomalies, opportunities, and coaching recommendations.
          </p>
        </div>
        <Button onClick={handleGenerate} disabled={loading} className="gap-2">
          {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
          {loading ? "Analyzing..." : insights.length > 0 ? "Refresh Insights" : "Generate Insights"}
        </Button>
      </div>

      {generatedAt && (
        <p className="text-xs text-muted-foreground">
          Last generated: {new Date(generatedAt).toLocaleString()}
        </p>
      )}

      {insights.length === 0 && !loading && (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <Brain className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm font-medium text-muted-foreground">No insights generated yet</p>
            <p className="text-xs text-muted-foreground mt-1">Click "Generate Insights" to analyze your brokerage performance data with AI.</p>
          </CardContent>
        </Card>
      )}

      {insights.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {insights.map((insight: any, i: number) => (
            <Card key={i} className={`border ${INSIGHT_COLORS[insight.type] ?? ""}`}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex-shrink-0">{INSIGHT_ICONS[insight.type] ?? <Lightbulb className="h-4 w-4" />}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-sm">{insight.title}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${PRIORITY_BADGE[insight.priority] ?? ""}`}>
                        {insight.priority}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">{insight.description}</p>
                    <div className="flex items-start gap-1.5">
                      <Zap className="h-3 w-3 text-muted-foreground mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-muted-foreground italic">{insight.action}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Overview Tab (enhanced) ──────────────────────────────────────────────────
function OverviewTab() {
  const [range, setRange] = useState("ytd");
  const dates = useDateRange(range);
  const { data: overview } = trpc.analytics.overview.useQuery();
  const { data: monthlyRevenue } = trpc.analytics.monthlyRevenue.useQuery({ months: 12 });
  const { data: pipelineByStatus } = trpc.analytics.pipelineByStatus.useQuery();
  const { data: txTypes } = trpc.analytics.transactionTypeBreakdown.useQuery(dates);

  const revenueChartData = useMemo(() => (monthlyRevenue ?? []).map((r: any) => ({
    month: r.month,
    revenue: Number(r.revenue ?? 0),
  })), [monthlyRevenue]);

  const pipelineData = useMemo(() => (pipelineByStatus ?? []).map((r: any) => ({
    name: PIPELINE_LABELS[r.status] ?? r.status,
    value: Number(r.count ?? 0),
  })), [pipelineByStatus]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground font-medium">Period:</span>
        <DateRangeFilter value={range} onChange={setRange} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Total Contacts" value={overview?.totalContacts ?? 0} icon={<Users className="h-5 w-5" />} />
        <KpiCard label="Active Pipeline" value={overview?.activePipeline ?? 0} icon={<Activity className="h-5 w-5" />} />
        <KpiCard label="Closed Deals" value={overview?.closedTransactions ?? 0} icon={<Target className="h-5 w-5" />} />
        <KpiCard label="Total GCI" value={fmt$(Number(overview?.totalRevenue ?? 0))} icon={<DollarSign className="h-5 w-5" />} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Monthly Revenue Trend</CardTitle></CardHeader>
          <CardContent>
            {revenueChartData.length === 0 ? <EmptyChart message="No revenue data yet" /> : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={revenueChartData}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => fmt$(v)} />
                  <Tooltip formatter={(v: number) => [fmt$(v), "Revenue"]} />
                  <Area type="monotone" dataKey="revenue" stroke="#2563eb" fill="url(#revGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Pipeline by Stage</CardTitle></CardHeader>
          <CardContent>
            {pipelineData.length === 0 ? <EmptyChart message="No pipeline data yet" /> : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={pipelineData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                    {pipelineData.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => [v, "Contacts"]} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Market Performance Tab ───────────────────────────────────────────────────
function MarketPerformanceTab() {
  const [, navigate] = useLocation();
  const { data: markets, isLoading } = trpc.analytics.marketPerformance.useQuery();
  const { data: monthlyTrend } = trpc.analytics.marketMonthlyTrend.useQuery({ months: 12 });

  const marketList = markets ?? [];

  const trendChartData = useMemo(() => {
    if (!monthlyTrend) return [];
    const months = Array.from(new Set((monthlyTrend as any[]).map((r: any) => r.month))).sort();
    const mNames = Array.from(new Set((monthlyTrend as any[]).map((r: any) => r.marketName)));
    return months.map(month => {
      const row: Record<string, string | number> = { month };
      mNames.forEach(name => {
        const found = (monthlyTrend as any[]).find((r: any) => r.month === month && r.marketName === name);
        row[name as string] = found ? Number(found.gci ?? 0) : 0;
      });
      return row;
    });
  }, [monthlyTrend]);

  const marketNames = useMemo(() => Array.from(new Set((monthlyTrend as any[] ?? []).map((r: any) => r.marketName))), [monthlyTrend]);

  if (isLoading) return <div className="text-sm text-muted-foreground p-4">Loading market data...</div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Total Markets" value={marketList.length} />
        <KpiCard label="Total GCI" value={fmt$(marketList.reduce((s: number, m: any) => s + Number(m.totalGci ?? 0), 0))} />
        <KpiCard label="Total Deals" value={marketList.reduce((s: number, m: any) => s + Number(m.closedDeals ?? 0), 0)} />
        <KpiCard label="Total Agents" value={marketList.reduce((s: number, m: any) => s + Number(m.agentCount ?? 0), 0)} />
      </div>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Market Performance — click a row to drill down</CardTitle></CardHeader>
        <CardContent>
          {marketList.length === 0 ? <EmptyChart message="No market data yet" /> : (
            <div className="space-y-3">
              {/* Progress bars for markets with goals */}
              {marketList.some((m: any) => m.annualGciGoal != null) && (
                <div className="space-y-2 pb-2 border-b">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Annual GCI Goal Progress</p>
                  {marketList.filter((m: any) => m.annualGciGoal != null).map((m: any) => {
                    const goal = Number(m.annualGciGoal);
                    const gci = Number(m.totalGci ?? 0);
                    const pct = Math.min(Math.round((gci / goal) * 100), 100);
                    const color = pct >= 100 ? "bg-green-500" : pct >= 70 ? "bg-blue-500" : pct >= 40 ? "bg-amber-500" : "bg-red-400";
                    return (
                      <div key={m.marketId} className="space-y-0.5 cursor-pointer" onClick={() => navigate(`/analytics/market/${m.marketId}`)}>
                        <div className="flex justify-between text-xs">
                          <span className="font-medium">{m.marketName}</span>
                          <span className="text-muted-foreground">{pct}% — {fmt$(gci)} / {fmt$(goal)}</span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="text-left py-2 pr-4 font-medium">Market</th>
                      <th className="text-right py-2 px-2 font-medium">Agents</th>
                      <th className="text-right py-2 px-2 font-medium">Closed</th>
                      <th className="text-right py-2 px-2 font-medium">GCI</th>
                      <th className="text-right py-2 px-2 font-medium">Goal</th>
                      <th className="text-right py-2 pl-2 font-medium">Avg Deal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {marketList.map((m: any) => (
                      <tr
                        key={m.marketId}
                        className="border-b last:border-0 hover:bg-muted/30 cursor-pointer"
                        onClick={() => navigate(`/analytics/market/${m.marketId}`)}
                      >
                        <td className="py-2 pr-4 font-medium text-primary hover:underline">{m.marketName}</td>
                        <td className="text-right py-2 px-2">{m.agentCount}</td>
                        <td className="text-right py-2 px-2">{m.closedDeals}</td>
                        <td className="text-right py-2 px-2 font-semibold">{fmt$(Number(m.totalGci ?? 0))}</td>
                        <td className="text-right py-2 px-2 text-muted-foreground">{m.annualGciGoal ? fmt$(Number(m.annualGciGoal)) : "—"}</td>
                        <td className="text-right py-2 pl-2">{fmt$(Number(m.avgDealSize ?? 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      {trendChartData.length > 0 && marketNames.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Monthly GCI by Market</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={trendChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => fmt$(v)} />
                <Tooltip formatter={(v: number) => [fmt$(v), ""]} />
                <Legend />
                {marketNames.map((name: string, i: number) => (
                  <Line key={name} type="monotone" dataKey={name} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={{ r: 3 }} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Report Category Definitions ─────────────────────────────────────────────
type ReportCategory = {
  id: string;
  label: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
  description: string;
};

const REPORT_CATEGORIES: ReportCategory[] = [
  { id: "executive", label: "Executive Dashboard", icon: <Building2 className="h-4 w-4" />, description: "KPIs, GCI trend, pipeline overview" },
  { id: "business", label: "Business Overview", icon: <BarChart2 className="h-4 w-4" />, adminOnly: true, description: "Revenue, volume, closings by period" },
  { id: "agents", label: "Agent Performance", icon: <Users className="h-4 w-4" />, adminOnly: true, description: "Production, rankings, pipeline by agent" },
  { id: "groups", label: "Group Performance", icon: <Layers className="h-4 w-4" />, adminOnly: true, description: "Team GCI, volume, member breakdown" },
  { id: "markets", label: "Market Intelligence", icon: <MapPin className="h-4 w-4" />, adminOnly: true, description: "Market-level GCI, agents, goals" },
  { id: "commissions", label: "Commissions & Payouts", icon: <Wallet className="h-4 w-4" />, adminOnly: true, description: "Pending, paid, split analysis" },
  { id: "tasks", label: "Task Analytics", icon: <ListTodo className="h-4 w-4" />, description: "Completion rates, overdue, by assignee" },
  { id: "isa", label: "ISA & Pipeline", icon: <UserCheck className="h-4 w-4" />, adminOnly: true, description: "ISA performance, pipeline funnel" },
  { id: "lead-sources", label: "Lead Source ROI", icon: <TrendingUp className="h-4 w-4" />, adminOnly: true, description: "Contact volume, GCI per source" },
  { id: "onboarding", label: "Onboarding", icon: <UserPlus className="h-4 w-4" />, adminOnly: true, description: "Agent onboarding progress & completion" },
  { id: "db-health", label: "Database Health", icon: <Database className="h-4 w-4" />, adminOnly: true, description: "Record counts, data quality, duplicates" },
  { id: "financial-performance", label: "Financial Performance", icon: <DollarSign className="h-4 w-4" />, adminOnly: true, description: "GCI, net commission, company dollars, master metrics table" },
  // Legacy tabs kept for continuity
  { id: "funnel", label: "Sales Funnel", icon: <Activity className="h-4 w-4" />, description: "Stage conversion funnel" },
  { id: "lead-roi", label: "Lead ROI (Legacy)", icon: <DollarSign className="h-4 w-4" />, description: "Legacy lead source ROI view" },
  { id: "pipeline-health", label: "Pipeline Health", icon: <Activity className="h-4 w-4" />, description: "Pipeline health indicators" },
  { id: "overview", label: "Overview", icon: <BarChart2 className="h-4 w-4" />, description: "Contact & deal overview" },
  { id: "ai-insights", label: "AI Insights", icon: <Brain className="h-4 w-4" />, adminOnly: true, description: "AI-powered recommendations" },
];

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AnalyticsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [activeCategory, setActiveCategory] = useState("executive");
  const [globalAgentId, setGlobalAgentId] = useState<number | undefined>(undefined);
  const { data: agentUsers } = trpc.users.list.useQuery({ role: "agent" }, { enabled: isAdmin });

  const visibleCategories = REPORT_CATEGORIES.filter((c) => !c.adminOnly || isAdmin);
  const activeInfo = visibleCategories.find((c) => c.id === activeCategory);

  return (
    <div>
      <PageHeader
        title="Analytics & Reports"
        subtitle="Deep business intelligence across agents, groups, markets, commissions, ISA, and more"
      />
      <div className="flex gap-6">
        {/* Left sidebar */}
        <aside className="w-56 flex-shrink-0">
          <nav className="space-y-0.5">
            {visibleCategories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors text-left ${
                  activeCategory === cat.id
                    ? "bg-primary text-primary-foreground font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {cat.icon}
                <span className="truncate">{cat.label}</span>
              </button>
            ))}
          </nav>
        </aside>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Category header */}
          {activeInfo && (
            <div className="mb-4 pb-3 border-b border-border">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold flex items-center gap-2">
                    {activeInfo.icon}
                    {activeInfo.label}
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">{activeInfo.description}</p>
                </div>
                {(activeCategory === "executive" || activeCategory === "funnel" || activeCategory === "lead-roi" || activeCategory === "pipeline-health") && isAdmin && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Agent:</span>
                    <Select
                      value={globalAgentId !== undefined ? String(globalAgentId) : "all"}
                      onValueChange={(v) => setGlobalAgentId(v === "all" ? undefined : Number(v))}
                    >
                      <SelectTrigger className="w-40 h-7 text-xs">
                        <SelectValue placeholder="All Agents" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Agents</SelectItem>
                        {(agentUsers ?? []).map((a: any) => (
                          <SelectItem key={a.id} value={String(a.id)}>
                            {a.name || `Agent #${a.id}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {globalAgentId !== undefined && (
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setGlobalAgentId(undefined)}>Clear</Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tab content */}
          {activeCategory === "executive" && <ExecutiveDashboardTab agentId={globalAgentId} />}
          {activeCategory === "business" && <BusinessOverviewTab />}
          {activeCategory === "agents" && <AgentPerformanceTab />}
          {activeCategory === "groups" && <GroupPerformanceTab />}
          {activeCategory === "markets" && <MarketIntelligenceTab />}
          {activeCategory === "commissions" && <CommissionPayoutsTab />}
          {activeCategory === "tasks" && <TaskAnalyticsTab />}
          {activeCategory === "isa" && <IsaPipelineTab />}
          {activeCategory === "lead-sources" && <LeadSourceAnalyticsTab />}
          {activeCategory === "onboarding" && <OnboardingReportTab />}
          {activeCategory === "db-health" && <DatabaseHealthTab />}
          {activeCategory === "financial-performance" && <FinancialPerformanceTab />}
          {activeCategory === "funnel" && <SalesFunnelTab agentId={globalAgentId} />}
          {activeCategory === "lead-roi" && <LeadSourceROITab agentId={globalAgentId} />}
          {activeCategory === "pipeline-health" && <PipelineHealthTab agentId={globalAgentId} />}
          {activeCategory === "overview" && <OverviewTab />}
          {activeCategory === "ai-insights" && <AiInsightsTab />}
        </div>
      </div>
    </div>
  );
}
