import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PageHeader from "@/components/PageHeader";
import { useLocation } from "wouter";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import {
  DollarSign,
  TrendingUp,
  Users,
  Building2,
  MapPin,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const PIE_COLORS = [
  "#14b8a6", "#6366f1", "#f59e0b", "#ef4444", "#3b82f6",
  "#8b5cf6", "#ec4899", "#22c55e", "#f97316", "#64748b",
];

const formatCurrency = (val: number) =>
  val === 0 ? "$0" : `$${val.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const formatCompact = (val: number) => {
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}k`;
  return `$${val}`;
};

export default function MarketPerformancePage() {
  const [, navigate] = useLocation();
  const [selectedMarketId, setSelectedMarketId] = useState<string>("all");

  const { data: marketPerf = [], isLoading } = trpc.analytics.marketPerformance.useQuery();
  const { data: monthlyTrend = [] } = trpc.analytics.marketMonthlyTrend.useQuery();
  const { data: leaderboard = [] } = trpc.analytics.marketAgentLeaderboard.useQuery(
    { marketId: Number(selectedMarketId) },
    { enabled: selectedMarketId !== "all" }
  );

  // Aggregate totals
  const totalGci = (marketPerf as any[]).reduce((sum: number, m: any) => sum + m.totalGci, 0);
  const totalVolume = (marketPerf as any[]).reduce((sum: number, m: any) => sum + m.totalVolume, 0);
  const totalClosedDeals = (marketPerf as any[]).reduce((sum: number, m: any) => sum + m.closedDeals, 0);
  const totalAgents = (marketPerf as any[]).reduce((sum: number, m: any) => sum + m.agentCount, 0);
  const totalActiveDeals = (marketPerf as any[]).reduce((sum: number, m: any) => sum + m.activeDeals, 0);

  // GCI distribution pie chart data
  const gciPieData = (marketPerf as any[])
    .filter((m: any) => m.totalGci > 0)
    .map((m: any) => ({
      name: m.marketName,
      value: m.totalGci,
    }));

  // Monthly trend: aggregate by month across all markets or filter by selected
  const trendByMonth = new Map<string, { month: string; gci: number; deals: number }>();
  for (const row of monthlyTrend as any[]) {
    if (selectedMarketId !== "all" && row.marketId !== Number(selectedMarketId)) continue;
    const existing = trendByMonth.get(row.month);
    if (existing) {
      existing.gci += row.gci;
      existing.deals += row.deals;
    } else {
      trendByMonth.set(row.month, { month: row.month, gci: row.gci, deals: row.deals });
    }
  }
  const trendData = Array.from(trendByMonth.values()).sort((a, b) => a.month.localeCompare(b.month));

  // Selected market data
  const selectedMarket = selectedMarketId !== "all"
    ? (marketPerf as any[]).find((m: any) => m.marketId === Number(selectedMarketId))
    : null;

  if (isLoading) {
    return (
      <div>
        <PageHeader title="Market Performance" subtitle="Loading market analytics..." />
        <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if ((marketPerf as any[]).length === 0) {
    return (
      <div>
        <PageHeader title="Market Performance" subtitle="Analyze performance across market regions" />
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <MapPin className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Markets Created Yet</h3>
            <p className="text-muted-foreground text-sm mb-4 max-w-md">
              Create markets and assign agents to them to see performance analytics by region.
            </p>
            <Button onClick={() => navigate("/markets")} size="sm">
              <Building2 className="h-4 w-4 mr-1.5" /> Go to Markets
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Market Performance"
        subtitle="Analyze GCI, deal volume, and agent activity across market regions"
        actions={
          <Select value={selectedMarketId} onValueChange={setSelectedMarketId}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Select Market" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Markets</SelectItem>
              {(marketPerf as any[]).map((m: any) => (
                <SelectItem key={m.marketId} value={String(m.marketId)}>{m.marketName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <Card>
          <CardContent className="pt-4 pb-4 px-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground font-medium">Total GCI</span>
              <DollarSign className="h-4 w-4 text-primary" />
            </div>
            <p className="text-xl font-bold">{formatCurrency(selectedMarket ? selectedMarket.totalGci : totalGci)}</p>
            <p className="text-xs text-muted-foreground">Closed deals</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 px-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground font-medium">Volume</span>
              <TrendingUp className="h-4 w-4 text-emerald-500" />
            </div>
            <p className="text-xl font-bold">{formatCompact(selectedMarket ? selectedMarket.totalVolume : totalVolume)}</p>
            <p className="text-xs text-muted-foreground">Total sales volume</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 px-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground font-medium">Closed Deals</span>
              <TrendingUp className="h-4 w-4 text-blue-500" />
            </div>
            <p className="text-xl font-bold">{selectedMarket ? selectedMarket.closedDeals : totalClosedDeals}</p>
            <p className="text-xs text-muted-foreground">All time</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 px-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground font-medium">Active Deals</span>
              <TrendingUp className="h-4 w-4 text-amber-500" />
            </div>
            <p className="text-xl font-bold">{selectedMarket ? selectedMarket.activeDeals : totalActiveDeals}</p>
            <p className="text-xs text-muted-foreground">In pipeline</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 px-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground font-medium">Agents</span>
              <Users className="h-4 w-4 text-violet-500" />
            </div>
            <p className="text-xl font-bold">{selectedMarket ? selectedMarket.agentCount : totalAgents}</p>
            <p className="text-xs text-muted-foreground">Assigned to market{selectedMarketId === "all" ? "s" : ""}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* GCI by Month Chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">
              Monthly GCI Trend {selectedMarket ? `— ${selectedMarket.marketName}` : "(All Markets)"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {trendData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                  <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" tickFormatter={(v) => formatCompact(v)} />
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      name === "gci" ? formatCurrency(value) : value,
                      name === "gci" ? "GCI" : "Deals",
                    ]}
                    contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))" }}
                  />
                  <Bar dataKey="gci" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="gci" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                No closed deals with closing dates in the last 12 months.
              </div>
            )}
          </CardContent>
        </Card>

        {/* GCI Distribution Pie */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">GCI Distribution by Market</CardTitle>
          </CardHeader>
          <CardContent>
            {gciPieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={gciPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={85}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                  >
                    {gciPieData.map((_: any, i: number) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                No GCI data across markets yet.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Market Comparison Table (when "All Markets" selected) */}
      {selectedMarketId === "all" && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Market Comparison</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Market</TableHead>
                    <TableHead className="text-center">Agents</TableHead>
                    <TableHead className="text-center">Active</TableHead>
                    <TableHead className="text-center">Closed</TableHead>
                    <TableHead className="text-right">Total GCI</TableHead>
                    <TableHead className="text-right">Volume</TableHead>
                    <TableHead className="text-right">Avg Deal</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(marketPerf as any[]).map((m: any) => (
                    <TableRow key={m.marketId} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedMarketId(String(m.marketId))}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          {m.marketName}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">{m.agentCount}</TableCell>
                      <TableCell className="text-center">{m.activeDeals}</TableCell>
                      <TableCell className="text-center">{m.closedDeals}</TableCell>
                      <TableCell className="text-right font-semibold text-primary">{formatCurrency(m.totalGci)}</TableCell>
                      <TableCell className="text-right">{formatCompact(m.totalVolume)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(m.avgDealSize)}</TableCell>
                      <TableCell>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Agent Leaderboard (when specific market selected) */}
      {selectedMarketId !== "all" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Agent Leaderboard — {selectedMarket?.marketName}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Agent</TableHead>
                    <TableHead className="text-center">Closed</TableHead>
                    <TableHead className="text-center">Active</TableHead>
                    <TableHead className="text-center">Contacts</TableHead>
                    <TableHead className="text-right">Total GCI</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(leaderboard as any[]).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        No agents assigned to this market yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    (leaderboard as any[]).map((a: any, i: number) => (
                      <TableRow key={a.agentId} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/agents/${a.agentId}`)}>
                        <TableCell className="font-bold text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="font-medium">{a.agentName}</TableCell>
                        <TableCell className="text-center">{a.closedDeals}</TableCell>
                        <TableCell className="text-center">{a.activeDeals}</TableCell>
                        <TableCell className="text-center">{a.contactCount}</TableCell>
                        <TableCell className="text-right font-semibold text-primary">{formatCurrency(a.totalGci)}</TableCell>
                        <TableCell>
                          <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
