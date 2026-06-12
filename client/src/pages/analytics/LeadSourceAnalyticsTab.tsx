import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { fmt$, fmtNum, DateRangeFilter, useDateRange, EmptyState, ExportButton, CHART_COLORS, Th, Td } from "./shared";

export default function LeadSourceAnalyticsTab() {
  const [range, setRange] = useState("ytd");
  const [parentId, setParentId] = useState<number | undefined>();
  const dates = useDateRange(range);

  const { data: report, isLoading } = trpc.analytics.leadSourceAnalyticsReport.useQuery({ ...dates, parentId });

  const pieData = useMemo(() =>
    (report ?? []).slice(0, 8).map((s: any, i: number) => ({
      name: s.sourceName, value: s.totalContacts, fill: CHART_COLORS[i % CHART_COLORS.length],
    })),
    [report]
  );

  const roiBarData = useMemo(() =>
    (report ?? []).filter((s: any) => s.totalGci > 0).slice(0, 12).map((s: any) => ({
      name: s.sourceName.length > 14 ? s.sourceName.slice(0, 14) + "…" : s.sourceName,
      GCI: s.totalGci,
      Contacts: s.totalContacts,
    })),
    [report]
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm text-muted-foreground font-medium">Period:</span>
        <DateRangeFilter value={range} onChange={setRange} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Contacts by Lead Source</CardTitle></CardHeader>
          <CardContent>
            {pieData.length === 0 ? <EmptyState /> : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => percent > 0.04 ? `${(percent * 100).toFixed(0)}%` : ""}>
                    {pieData.map((p: any) => <Cell key={p.name} fill={p.fill} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => [fmtNum(v), "Contacts"]} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">GCI by Lead Source</CardTitle></CardHeader>
          <CardContent>
            {roiBarData.length === 0 ? <EmptyState /> : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={roiBarData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tickFormatter={(v) => fmt$(v)} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} />
                  <Tooltip formatter={(v: number) => [fmt$(v), "GCI"]} />
                  <Bar dataKey="GCI" fill={CHART_COLORS[1]} radius={[0, 3, 3, 0]}>
                    {roiBarData.map((_: any, i: number) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Detail table */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Lead Source ROI Table</CardTitle>
            <ExportButton
              data={(report ?? []).map((s: any) => ({
                Source: s.sourceName, Type: s.sourceType, Contacts: s.totalContacts, Active: s.activeContacts,
                Closings: s.closings, GCI: s.totalGci, "GCI/Contact": s.gciPerContact,
              }))}
              filename="lead-source-roi.csv"
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
                      <Th>Source</Th>
                      <Th>Type</Th>
                      <Th className="text-right">Contacts</Th>
                      <Th className="text-right">Active</Th>
                      <Th className="text-right">Closings</Th>
                      <Th className="text-right">GCI</Th>
                      <Th className="text-right">GCI / Contact</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {(report ?? []).map((s: any) => (
                      <tr key={s.sourceId} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                        <Td className="font-medium">{s.sourceName}</Td>
                        <Td className="text-muted-foreground capitalize">{s.sourceType}</Td>
                        <Td className="text-right">{fmtNum(s.totalContacts)}</Td>
                        <Td className="text-right">{fmtNum(s.activeContacts)}</Td>
                        <Td className="text-right">{s.closings}</Td>
                        <Td className="text-right font-semibold text-primary">{fmt$(s.totalGci)}</Td>
                        <Td className="text-right text-muted-foreground">{fmt$(s.gciPerContact)}</Td>
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
