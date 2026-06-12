import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, FunnelChart, Funnel, LabelList } from "recharts";
import { UserCheck, Phone, CheckCircle2, TrendingUp } from "lucide-react";
import { fmtNum, DateRangeFilter, useDateRange, KpiCard, EmptyState, ExportButton, CHART_COLORS, PIPELINE_LABELS, Th, Td } from "./shared";

export default function IsaPipelineTab() {
  const [range, setRange] = useState("last30");
  const [isaId, setIsaId] = useState<number | undefined>();
  const dates = useDateRange(range);

  const { data: isas } = trpc.users.list.useQuery({ role: "isa" });
  const { data: report, isLoading } = trpc.analytics.isaReport.useQuery({ ...dates, isaId });

  const stageData = useMemo(() =>
    (report?.statusFunnel ?? []).map((s: any, i: number) => ({
      name: PIPELINE_LABELS[s.status] ?? s.status,
      value: s.count,
      fill: CHART_COLORS[i % CHART_COLORS.length],
    })),
    [report]
  );

  const isaBarData = useMemo(() =>
    (report?.isaPerformance ?? []).filter((i: any) => i.totalContacts > 0).slice(0, 12).map((i: any) => ({
      name: i.isaName.split(" ")[0],
      Contacts: i.totalContacts,
      "Active Clients": i.activeClients,
      Closed: i.closed,
    })),
    [report]
  );

  const sessions = report?.marketMatchSessions;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm text-muted-foreground font-medium">Period:</span>
        <DateRangeFilter value={range} onChange={setRange} />
        <span className="text-sm text-muted-foreground font-medium">ISA:</span>
        <Select value={isaId !== undefined ? String(isaId) : "all"} onValueChange={(v) => setIsaId(v === "all" ? undefined : Number(v))}>
          <SelectTrigger className="w-40 h-8 text-xs"><SelectValue placeholder="All ISAs" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All ISAs</SelectItem>
            {(isas ?? []).map((i: any) => <SelectItem key={i.id} value={String(i.id)}>{i.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Total ISA Contacts" value={fmtNum((report?.isaPerformance ?? []).reduce((a: number, i: any) => a + i.totalContacts, 0))} icon={<UserCheck className="h-5 w-5" />} />
        <KpiCard label="Active Clients" value={fmtNum((report?.isaPerformance ?? []).reduce((a: number, i: any) => a + i.activeClients, 0))} icon={<CheckCircle2 className="h-5 w-5" />} />
        <KpiCard label="Closed from ISA" value={fmtNum((report?.isaPerformance ?? []).reduce((a: number, i: any) => a + i.closed, 0))} icon={<TrendingUp className="h-5 w-5" />} />
        <KpiCard label="Market Match Sessions" value={fmtNum(sessions?.total ?? 0)} sub={`${sessions?.completed ?? 0} completed`} icon={<Phone className="h-5 w-5" />} />
      </div>

      {/* ISA performance bar */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">ISA Performance Comparison</CardTitle></CardHeader>
        <CardContent>
          {isaBarData.length === 0 ? <EmptyState /> : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={isaBarData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="Contacts" fill={CHART_COLORS[0]} radius={[3, 3, 0, 0]} />
                <Bar dataKey="Active Clients" fill={CHART_COLORS[2]} radius={[3, 3, 0, 0]} />
                <Bar dataKey="Closed" fill={CHART_COLORS[1]} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Pipeline stage funnel */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Lead Pipeline by Stage</CardTitle></CardHeader>
        <CardContent>
          {stageData.every((s: any) => s.value === 0) ? <EmptyState message="No pipeline data." /> : (
            <div className="grid grid-cols-2 gap-6">
              <ResponsiveContainer width="100%" height={280}>
                <FunnelChart>
                  <Tooltip formatter={(v: number) => [fmtNum(v), "Contacts"]} />
                  <Funnel dataKey="value" data={stageData} isAnimationActive>
                    <LabelList position="right" fill="hsl(var(--foreground))" stroke="none" dataKey="name" style={{ fontSize: 11 }} />
                  </Funnel>
                </FunnelChart>
              </ResponsiveContainer>
              <div className="space-y-2">
                {stageData.map((s: any) => (
                  <div key={s.name} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.fill }} />
                      <span className="text-muted-foreground">{s.name}</span>
                    </div>
                    <span className="font-semibold">{fmtNum(s.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ISA detail table */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">ISA Detail</CardTitle>
            <ExportButton
              data={(report?.isaPerformance ?? []).map((i: any) => ({
                ISA: i.isaName, Contacts: i.totalContacts, "Active Clients": i.activeClients,
                Closed: i.closed, Dead: i.dead, "Conversion Rate": `${i.conversionRate}%`,
              }))}
              filename="isa-report.csv"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? <div className="p-4 text-sm text-muted-foreground">Loading...</div> :
            (report?.isaPerformance ?? []).length === 0 ? <EmptyState /> : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-border bg-muted/30">
                    <tr>
                      <Th>ISA</Th>
                      <Th className="text-right">Contacts</Th>
                      <Th className="text-right">Active</Th>
                      <Th className="text-right">Closed</Th>
                      <Th className="text-right">Dead</Th>
                      <Th className="text-right">Conversion</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {(report?.isaPerformance ?? []).map((i: any) => (
                      <tr key={i.isaId ?? i.isaName} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                        <Td className="font-medium">{i.isaName}</Td>
                        <Td className="text-right">{fmtNum(i.totalContacts)}</Td>
                        <Td className="text-right">{fmtNum(i.activeClients)}</Td>
                        <Td className="text-right">{fmtNum(i.closed)}</Td>
                        <Td className="text-right text-muted-foreground">{fmtNum(i.dead)}</Td>
                        <Td className="text-right">
                          <Badge variant={i.conversionRate >= 10 ? "default" : "secondary"} className="text-xs">
                            {i.conversionRate}%
                          </Badge>
                        </Td>
                      </tr>
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
