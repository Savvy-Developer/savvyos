import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, FunnelChart, Funnel, LabelList } from "recharts";
import { fmt$, fmtNum, DateRangeFilter, useDateRange, SectionHeader, EmptyState, ExportButton, CHART_COLORS, PIPELINE_LABELS, Th, Td } from "./shared";

export default function AgentPerformanceTab() {
  const [range, setRange] = useState("ytd");
  const [agentId, setAgentId] = useState<number | undefined>();
  const [groupId, setGroupId] = useState<number | undefined>();
  const [marketId, setMarketId] = useState<number | undefined>();
  const dates = useDateRange(range);

  const { data: agents } = trpc.users.list.useQuery({ role: "agent" });
  const { data: groups } = trpc.groups.list.useQuery();
  const { data: markets } = trpc.markets.list.useQuery();

  const { data: production, isLoading } = trpc.analytics.agentPerformanceReport.useQuery({
    ...dates, agentId, groupId, marketProfileId: marketId,
  });

  const { data: funnel } = trpc.analytics.agentPipelineFunnel.useQuery({ agentId, groupId });

  const barData = useMemo(() =>
    (production ?? []).slice(0, 15).map((a: any) => ({ name: a.agentName.split(" ")[0], GCI: a.totalGci })),
    [production]
  );

  const funnelData = useMemo(() =>
    (funnel ?? []).map((f: any) => ({ name: PIPELINE_LABELS[f.status] ?? f.status, value: f.count, fill: CHART_COLORS[Object.keys(PIPELINE_LABELS).indexOf(f.status)] })),
    [funnel]
  );

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm text-muted-foreground font-medium">Period:</span>
        <DateRangeFilter value={range} onChange={setRange} />
        <span className="text-sm text-muted-foreground font-medium">Agent:</span>
        <Select value={agentId !== undefined ? String(agentId) : "all"} onValueChange={(v) => setAgentId(v === "all" ? undefined : Number(v))}>
          <SelectTrigger className="w-40 h-8 text-xs"><SelectValue placeholder="All Agents" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Agents</SelectItem>
            {(agents ?? []).map((a: any) => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground font-medium">Group:</span>
        <Select value={groupId !== undefined ? String(groupId) : "all"} onValueChange={(v) => setGroupId(v === "all" ? undefined : Number(v))}>
          <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="All Groups" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Groups</SelectItem>
            {(groups ?? []).map((g: any) => <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground font-medium">Market:</span>
        <Select value={marketId !== undefined ? String(marketId) : "all"} onValueChange={(v) => setMarketId(v === "all" ? undefined : Number(v))}>
          <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="All Markets" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Markets</SelectItem>
            {(markets ?? []).map((m: any) => <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* GCI bar chart */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">GCI by Agent</CardTitle></CardHeader>
        <CardContent>
          {barData.length === 0 ? <EmptyState /> : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={barData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tickFormatter={(v) => fmt$(v)} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={80} />
                <Tooltip formatter={(v: number) => [fmt$(v), "GCI"]} />
                <Bar dataKey="GCI" radius={[0, 3, 3, 0]}>
                  {barData.map((_: any, i: number) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Production table */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Production Table</CardTitle>
            <ExportButton
              data={(production ?? []).map((a: any) => ({
                Agent: a.agentName, GCI: a.totalGci, Volume: a.totalVolume, Closings: a.closings,
                "Avg Deal": a.avgDealSize, Pipeline: a.pipelineCount, "Goal %": a.goalPct ?? "N/A",
              }))}
              filename="agent-production.csv"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 text-sm text-muted-foreground">Loading...</div>
          ) : (production ?? []).length === 0 ? <EmptyState /> : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-border bg-muted/30">
                  <tr>
                    <Th>Agent</Th>
                    <Th className="text-right">GCI</Th>
                    <Th className="text-right">Volume</Th>
                    <Th className="text-right">Closings</Th>
                    <Th className="text-right">Avg Deal</Th>
                    <Th className="text-right">Pipeline</Th>
                    <Th className="text-right">Active</Th>
                    <Th className="w-32">Goal %</Th>
                  </tr>
                </thead>
                <tbody>
                  {(production ?? []).map((a: any) => (
                    <tr key={a.agentId} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <Td className="font-medium">{a.agentName}</Td>
                      <Td className="text-right font-semibold text-primary">{fmt$(a.totalGci)}</Td>
                      <Td className="text-right">{fmt$(a.totalVolume)}</Td>
                      <Td className="text-right">{a.closings}</Td>
                      <Td className="text-right">{fmt$(a.avgDealSize)}</Td>
                      <Td className="text-right">{a.pipelineCount}</Td>
                      <Td className="text-right text-muted-foreground">{a.activeCount}</Td>
                      <Td>
                        {a.goalPct !== null ? (
                          <div className="flex items-center gap-2">
                            <Progress value={Math.min(a.goalPct, 100)} className="h-1.5 flex-1" />
                            <span className="text-xs text-muted-foreground w-10 text-right">{a.goalPct}%</span>
                          </div>
                        ) : <span className="text-xs text-muted-foreground">No goal</span>}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pipeline funnel */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Pipeline Funnel</CardTitle></CardHeader>
        <CardContent>
          {funnelData.every((f: any) => f.value === 0) ? <EmptyState message="No pipeline data." /> : (
            <div className="grid grid-cols-2 gap-6">
              <ResponsiveContainer width="100%" height={280}>
                <FunnelChart>
                  <Tooltip formatter={(v: number) => [fmtNum(v), "Contacts"]} />
                  <Funnel dataKey="value" data={funnelData} isAnimationActive>
                    <LabelList position="right" fill="hsl(var(--foreground))" stroke="none" dataKey="name" style={{ fontSize: 11 }} />
                  </Funnel>
                </FunnelChart>
              </ResponsiveContainer>
              <div className="space-y-2">
                {funnelData.map((f: any) => (
                  <div key={f.name} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: f.fill }} />
                      <span className="text-muted-foreground">{f.name}</span>
                    </div>
                    <span className="font-semibold">{fmtNum(f.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
