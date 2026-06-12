import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { ChevronDown, ChevronRight } from "lucide-react";
import { fmt$, DateRangeFilter, useDateRange, EmptyState, ExportButton, CHART_COLORS, Th, Td } from "./shared";

export default function MarketIntelligenceTab() {
  const [range, setRange] = useState("ytd");
  const [marketId, setMarketId] = useState<number | undefined>();
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const dates = useDateRange(range);

  const { data: markets } = trpc.markets.list.useQuery();
  const { data: report, isLoading } = trpc.analytics.marketPerformanceReport.useQuery({ ...dates, marketProfileId: marketId });

  const barData = useMemo(() =>
    (report ?? []).map((m: any) => ({ name: m.marketName, GCI: m.totalGci })),
    [report]
  );

  const toggleExpand = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm text-muted-foreground font-medium">Period:</span>
        <DateRangeFilter value={range} onChange={setRange} />
        <span className="text-sm text-muted-foreground font-medium">Market:</span>
        <Select value={marketId !== undefined ? String(marketId) : "all"} onValueChange={(v) => setMarketId(v === "all" ? undefined : Number(v))}>
          <SelectTrigger className="w-40 h-8 text-xs"><SelectValue placeholder="All Markets" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Markets</SelectItem>
            {(markets ?? []).map((m: any) => <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Bar chart */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">GCI by Market</CardTitle></CardHeader>
        <CardContent>
          {barData.length === 0 ? <EmptyState /> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => fmt$(v)} tick={{ fontSize: 11 }} width={60} />
                <Tooltip formatter={(v: number) => [fmt$(v), "GCI"]} />
                <Bar dataKey="GCI" radius={[3, 3, 0, 0]}>
                  {barData.map((_: any, i: number) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Market table with expandable agent breakdown */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Market Performance</CardTitle>
            <ExportButton
              data={(report ?? []).map((m: any) => ({
                Market: m.marketName, State: m.state, Status: m.status, Agents: m.agentCount,
                GCI: m.totalGci, Volume: m.totalVolume, Closings: m.closings, "Goal %": m.goalPct ?? "N/A",
              }))}
              filename="market-performance.csv"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? <div className="p-4 text-sm text-muted-foreground">Loading...</div> :
            (report ?? []).length === 0 ? <EmptyState /> : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-border bg-muted/30">
                    <tr>
                      <Th>&#8203;</Th>
                      <Th>Market</Th>
                      <Th>State</Th>
                      <Th>Status</Th>
                      <Th className="text-right">Agents</Th>
                      <Th className="text-right">GCI</Th>
                      <Th className="text-right">Volume</Th>
                      <Th className="text-right">Closings</Th>
                      <Th>Goal %</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {(report ?? []).map((m: any) => (
                      <>
                        <tr
                          key={m.marketId}
                          className="border-b border-border/50 hover:bg-muted/20 transition-colors cursor-pointer"
                          onClick={() => toggleExpand(m.marketId)}
                        >
                          <Td>
                            {m.agents.length > 0 ? (
                              expanded.has(m.marketId) ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            ) : null}
                          </Td>
                          <Td className="font-medium">{m.marketName}</Td>
                          <Td className="text-muted-foreground">{m.state}</Td>
                          <Td>
                            <Badge variant={m.status === "active" ? "default" : "secondary"} className="text-xs">
                              {m.status}
                            </Badge>
                          </Td>
                          <Td className="text-right">{m.agentCount}</Td>
                          <Td className="text-right font-semibold text-primary">{fmt$(m.totalGci)}</Td>
                          <Td className="text-right">{fmt$(m.totalVolume)}</Td>
                          <Td className="text-right">{m.closings}</Td>
                          <Td>
                            {m.goalPct !== null ? (
                              <div className="flex items-center gap-2">
                                <Progress value={Math.min(m.goalPct, 100)} className="h-1.5 flex-1" />
                                <span className="text-xs text-muted-foreground w-10 text-right">{m.goalPct}%</span>
                              </div>
                            ) : <span className="text-xs text-muted-foreground">No goal</span>}
                          </Td>
                        </tr>
                        {expanded.has(m.marketId) && m.agents.map((a: any) => (
                          <tr key={a.agentId} className="bg-muted/10 border-b border-border/30">
                            <Td>&#8203;</Td><Td className="pl-8 text-muted-foreground text-xs">{a.agentName}</Td>
                            <Td>&#8203;</Td><Td>&#8203;</Td><Td>&#8203;</Td>
                            <Td className="text-right text-xs">{fmt$(a.totalGci)}</Td>
                            <Td>&#8203;</Td><Td className="text-right text-xs">{a.closings}</Td>
                            <Td>&#8203;</Td>
                          </tr>
                        ))}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </CardContent>
      </Card>
    </div>
  );
}
