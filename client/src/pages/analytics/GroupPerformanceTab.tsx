import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from "recharts";
import { ChevronDown, ChevronRight, Users, TrendingUp, Home, DollarSign } from "lucide-react";
import { fmt$, fmtNum, DateRangeFilter, useDateRange, KpiCard, EmptyState, ExportButton, CHART_COLORS, Th, Td } from "./shared";

export default function GroupPerformanceTab() {
  const [range, setRange] = useState("ytd");
  const [groupId, setGroupId] = useState<number | undefined>();
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [metric, setMetric] = useState<"gci" | "volume" | "closings" | "units">("gci");
  const dates = useDateRange(range);

  // groups.list returns { group: {...}, leader: {...} } objects
  const { data: groups } = trpc.groups.list.useQuery();
  const { data: report, isLoading } = trpc.analytics.groupPerformanceReport.useQuery({ ...dates, groupId });

  const groupList = useMemo(() =>
    (groups ?? []).map((g: any) => ({ id: g.group?.id ?? g.id, name: g.group?.name ?? g.name })).filter((g: any) => g.id && g.name),
    [groups]
  );

  const totals = useMemo(() => ({
    gci: (report ?? []).reduce((a: number, g: any) => a + g.totalGci, 0),
    volume: (report ?? []).reduce((a: number, g: any) => a + g.totalVolume, 0),
    closings: (report ?? []).reduce((a: number, g: any) => a + g.closings, 0),
    ucVolume: (report ?? []).reduce((a: number, g: any) => a + (g.ucVolume ?? 0), 0),
    ucUnits: (report ?? []).reduce((a: number, g: any) => a + (g.ucUnits ?? 0), 0),
  }), [report]);

  const metricLabel: Record<string, string> = { gci: "GCI", volume: "Closed Volume", closings: "Closings", units: "Closed Units" };
  const metricKey: Record<string, string> = { gci: "totalGci", volume: "totalVolume", closings: "closings", units: "closings" };
  const metricFmt = (v: number) => metric === "gci" || metric === "volume" ? fmt$(v) : fmtNum(v);

  const barData = useMemo(() =>
    (report ?? []).map((g: any) => ({
      name: g.groupName.length > 16 ? g.groupName.slice(0, 16) + "…" : g.groupName,
      GCI: g.totalGci,
      "Closed Volume": g.totalVolume,
      Closings: g.closings,
      "UC Volume": g.ucVolume ?? 0,
    })),
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
      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm text-muted-foreground font-medium">Period:</span>
        <DateRangeFilter value={range} onChange={setRange} />
        <span className="text-sm text-muted-foreground font-medium">Group:</span>
        <Select value={groupId !== undefined ? String(groupId) : "all"} onValueChange={(v) => setGroupId(v === "all" ? undefined : Number(v))}>
          <SelectTrigger className="w-44 h-8 text-xs"><SelectValue placeholder="All Groups" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Groups</SelectItem>
            {groupList.map((g: any) => <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground font-medium">Chart:</span>
        <Select value={metric} onValueChange={(v) => setMetric(v as any)}>
          <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="gci">GCI</SelectItem>
            <SelectItem value="volume">Closed Volume</SelectItem>
            <SelectItem value="closings">Closings</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KpiCard label="Total GCI" value={fmt$(totals.gci)} icon={<DollarSign className="h-5 w-5" />} highlight />
        <KpiCard label="Closed Volume" value={fmt$(totals.volume)} icon={<TrendingUp className="h-5 w-5" />} />
        <KpiCard label="Closed Units" value={fmtNum(totals.closings)} icon={<Home className="h-5 w-5" />} />
        <KpiCard label="UC Volume" value={fmt$(totals.ucVolume)} sub="Under contract" icon={<TrendingUp className="h-5 w-5" />} />
        <KpiCard label="UC Units" value={fmtNum(totals.ucUnits)} sub="Under contract" icon={<Users className="h-5 w-5" />} />
      </div>

      {/* Multi-metric bar chart */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Group Comparison — {metricLabel[metric]}</CardTitle></CardHeader>
        <CardContent>
          {barData.length === 0 ? <EmptyState /> : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={metricFmt} tick={{ fontSize: 11 }} width={65} />
                <Tooltip formatter={(v: number) => [metricFmt(v), metricLabel[metric]]} />
                <Bar dataKey={metricLabel[metric]} fill={CHART_COLORS[0]} radius={[3, 3, 0, 0]}>
                  {barData.map((_: any, i: number) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Stacked GCI + Volume chart */}
      {barData.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">GCI vs Under Contract Volume by Group</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => fmt$(v)} tick={{ fontSize: 11 }} width={65} />
                <Tooltip formatter={(v: number) => [fmt$(v)]} />
                <Legend />
                <Bar dataKey="GCI" fill={CHART_COLORS[0]} radius={[3, 3, 0, 0]} />
                <Bar dataKey="UC Volume" fill={CHART_COLORS[2]} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Detailed table with expandable members */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Group Detail</CardTitle>
            <ExportButton
              data={(report ?? []).map((g: any) => ({
                Group: g.groupName, Members: g.memberCount,
                GCI: g.totalGci, "Closed Volume": g.totalVolume, "Closed Units": g.closings,
                "UC Volume": g.ucVolume ?? 0, "UC Units": g.ucUnits ?? 0,
              }))}
              filename="group-performance.csv"
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
                      <Th>Group</Th>
                      <Th className="text-right">Members</Th>
                      <Th className="text-right">GCI</Th>
                      <Th className="text-right">Closed Vol.</Th>
                      <Th className="text-right">Closed Units</Th>
                      <Th className="text-right">UC Vol.</Th>
                      <Th className="text-right">UC Units</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {(report ?? []).map((g: any) => (
                      <>
                        <tr
                          key={g.groupId}
                          className="border-b border-border/50 hover:bg-muted/20 transition-colors cursor-pointer"
                          onClick={() => toggleExpand(g.groupId)}
                        >
                          <Td>
                            {(g.members?.length ?? 0) > 0 ? (
                              expanded.has(g.groupId) ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            ) : null}
                          </Td>
                          <Td className="font-medium">{g.groupName}</Td>
                          <Td className="text-right">{g.memberCount}</Td>
                          <Td className="text-right font-semibold text-primary">{fmt$(g.totalGci)}</Td>
                          <Td className="text-right">{fmt$(g.totalVolume)}</Td>
                          <Td className="text-right">{fmtNum(g.closings)}</Td>
                          <Td className="text-right text-muted-foreground">{fmt$(g.ucVolume ?? 0)}</Td>
                          <Td className="text-right text-muted-foreground">{fmtNum(g.ucUnits ?? 0)}</Td>
                        </tr>
                        {expanded.has(g.groupId) && (g.members ?? []).map((m: any) => (
                          <tr key={m.agentId} className="bg-muted/10 border-b border-border/30">
                            <Td>&#8203;</Td>
                            <Td className="pl-8 text-muted-foreground text-xs">{m.agentName}</Td>
                            <Td>&#8203;</Td>
                            <Td className="text-right text-xs font-medium">{fmt$(m.totalGci)}</Td>
                            <Td className="text-right text-xs">{fmt$(m.totalVolume ?? 0)}</Td>
                            <Td className="text-right text-xs">{fmtNum(m.closings)}</Td>
                            <Td className="text-right text-xs text-muted-foreground">{fmt$(m.ucVolume ?? 0)}</Td>
                            <Td className="text-right text-xs text-muted-foreground">{fmtNum(m.ucUnits ?? 0)}</Td>
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
