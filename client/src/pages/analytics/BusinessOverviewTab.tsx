import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from "recharts";
import { Building2, Users, DollarSign, TrendingUp, Activity, UserCheck } from "lucide-react";
import { fmt$, fmtNum, DateRangeFilter, useDateRange, KpiCard, SectionHeader, EmptyState, ExportButton, CHART_COLORS, Th, Td } from "./shared";

export default function BusinessOverviewTab() {
  const [range, setRange] = useState("ytd");
  const dates = useDateRange(range);

  const { data: kpis, isLoading: kpiLoading } = trpc.analytics.businessOverviewKpis.useQuery(dates);
  const { data: trend } = trpc.analytics.monthlyGciTrendExtended.useQuery({ months: 12 });
  const { data: agentProd } = trpc.analytics.agentPerformanceReport.useQuery(dates);

  const trendData = useMemo(() =>
    (trend ?? []).map((r: any) => ({ month: r.month, GCI: r.totalGci, Closings: r.closings, Volume: r.totalVolume })),
    [trend]
  );

  const leaderboard = useMemo(() =>
    (agentProd ?? []).slice(0, 10),
    [agentProd]
  );

  return (
    <div className="space-y-6">
      {/* Filter bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm text-muted-foreground font-medium">Period:</span>
        <DateRangeFilter value={range} onChange={setRange} />
      </div>

      {/* KPI grid */}
      {kpiLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-24 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard label="Total GCI" value={fmt$(kpis?.totalGci ?? 0)} icon={<DollarSign className="h-5 w-5" />} highlight />
          <KpiCard label="Total Volume" value={fmt$(kpis?.totalVolume ?? 0)} icon={<TrendingUp className="h-5 w-5" />} />
          <KpiCard label="Closings" value={fmtNum(kpis?.closings ?? 0)} icon={<Activity className="h-5 w-5" />} />
          <KpiCard label="Avg Deal Size" value={fmt$(kpis?.avgDealSize ?? 0)} icon={<Building2 className="h-5 w-5" />} />
          <KpiCard label="Active Pipeline" value={fmtNum(kpis?.activePipeline ?? 0)} sub="under contract" icon={<TrendingUp className="h-5 w-5" />} />
          <KpiCard label="Active Agents" value={fmtNum(kpis?.activeAgents ?? 0)} icon={<Users className="h-5 w-5" />} />
          <KpiCard label="Active ISAs" value={fmtNum(kpis?.activeIsas ?? 0)} icon={<UserCheck className="h-5 w-5" />} />
          <KpiCard label="Total Contacts" value={fmtNum(kpis?.totalContacts ?? 0)} sub="active (non-archived)" icon={<Users className="h-5 w-5" />} />
        </div>
      )}

      {/* Monthly GCI trend */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Monthly GCI Trend (Last 12 Months)</CardTitle>
        </CardHeader>
        <CardContent>
          {trendData.length === 0 ? <EmptyState /> : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="gciGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CHART_COLORS[1]} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={CHART_COLORS[1]} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => fmt$(v)} tick={{ fontSize: 11 }} width={60} />
                <Tooltip formatter={(v: number) => [fmt$(v), "GCI"]} />
                <Area type="monotone" dataKey="GCI" stroke={CHART_COLORS[1]} fill="url(#gciGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Agent leaderboard */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Agent Leaderboard (Top 10)</CardTitle>
            <ExportButton
              data={(leaderboard ?? []).map((a: any) => ({
                Agent: a.agentName, GCI: a.totalGci, Volume: a.totalVolume, Closings: a.closings, "Avg Deal": a.avgDealSize,
              }))}
              filename="agent-leaderboard.csv"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {leaderboard.length === 0 ? <EmptyState /> : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-border bg-muted/30">
                  <tr>
                    <Th>#</Th>
                    <Th>Agent</Th>
                    <Th className="text-right">GCI</Th>
                    <Th className="text-right">Volume</Th>
                    <Th className="text-right">Closings</Th>
                    <Th className="text-right">Avg Deal</Th>
                    <Th className="text-right">Pipeline</Th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((a: any, i: number) => (
                    <tr key={a.agentId} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <Td className="text-muted-foreground font-medium">{i + 1}</Td>
                      <Td className="font-medium">{a.agentName}</Td>
                      <Td className="text-right font-semibold text-primary">{fmt$(a.totalGci)}</Td>
                      <Td className="text-right">{fmt$(a.totalVolume)}</Td>
                      <Td className="text-right">{a.closings}</Td>
                      <Td className="text-right">{fmt$(a.avgDealSize)}</Td>
                      <Td className="text-right text-muted-foreground">{a.pipelineCount}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* GCI vs Closings bar */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Monthly Closings</CardTitle>
        </CardHeader>
        <CardContent>
          {trendData.length === 0 ? <EmptyState /> : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="Closings" fill={CHART_COLORS[2]} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
