import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { DollarSign, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { fmt$, fmtNum, DateRangeFilter, useDateRange, KpiCard, EmptyState, ExportButton, CHART_COLORS, Th, Td } from "./shared";

export default function CommissionPayoutsTab() {
  const [range, setRange] = useState("ytd");
  const [agentId, setAgentId] = useState<number | undefined>();
  const dates = useDateRange(range);

  const { data: agents } = trpc.users.list.useQuery({ role: "agent" });
  const { data: report, isLoading } = trpc.analytics.commissionSummaryReport.useQuery({ ...dates, agentId });

  const payoutPieData = useMemo(() =>
    (report?.payoutsByType ?? []).map((p: any, i: number) => ({
      name: p.payeeType, value: p.totalAmount, fill: CHART_COLORS[i % CHART_COLORS.length],
    })),
    [report]
  );

  const paidVsUnpaid = useMemo(() => {
    const paid = (report?.payoutsByType ?? []).reduce((acc: number, p: any) => acc + p.paidAmount, 0);
    const unpaid = (report?.payoutsByType ?? []).reduce((acc: number, p: any) => acc + p.unpaidAmount, 0);
    return [
      { name: "Paid", value: paid, fill: CHART_COLORS[2] },
      { name: "Unpaid", value: unpaid, fill: CHART_COLORS[5] },
    ];
  }, [report]);

  return (
    <div className="space-y-6">
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
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Total GCI" value={fmt$(report?.totalGci ?? 0)} icon={<DollarSign className="h-5 w-5" />} highlight />
        <KpiCard label="Closings" value={fmtNum(report?.closings ?? 0)} icon={<CheckCircle2 className="h-5 w-5" />} />
        <KpiCard
          label="Pending Exceptions"
          value={fmtNum(report?.exceptions.pending ?? 0)}
          sub={`${report?.exceptions.total ?? 0} total`}
          icon={<AlertTriangle className="h-5 w-5" />}
        />
        <KpiCard
          label="Unpaid Payouts"
          value={fmt$((report?.payoutsByType ?? []).reduce((acc: number, p: any) => acc + p.unpaidAmount, 0))}
          icon={<Clock className="h-5 w-5" />}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Payouts by Type</CardTitle></CardHeader>
          <CardContent>
            {payoutPieData.length === 0 ? <EmptyState /> : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={payoutPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {payoutPieData.map((p: any) => <Cell key={p.name} fill={p.fill} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => [fmt$(v)]} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Paid vs Unpaid</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={paidVsUnpaid} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {paidVsUnpaid.map((p) => <Cell key={p.name} fill={p.fill} />)}
                </Pie>
                <Tooltip formatter={(v: number) => [fmt$(v)]} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Agent payout table */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Agent Payout Summary</CardTitle>
            <ExportButton
              data={(report?.agentPayouts ?? []).map((a: any) => ({
                Agent: a.agentName, Total: a.totalAmount, Paid: a.paidAmount, Unpaid: a.unpaidAmount, Transactions: a.count,
              }))}
              filename="agent-payouts.csv"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? <div className="p-4 text-sm text-muted-foreground">Loading...</div> :
            (report?.agentPayouts ?? []).length === 0 ? <EmptyState /> : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-border bg-muted/30">
                    <tr>
                      <Th>Agent</Th>
                      <Th className="text-right">Total Payout</Th>
                      <Th className="text-right">Paid</Th>
                      <Th className="text-right">Unpaid</Th>
                      <Th className="text-right">Transactions</Th>
                      <Th>Status</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {(report?.agentPayouts ?? []).map((a: any) => (
                      <tr key={a.agentId} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                        <Td className="font-medium">{a.agentName}</Td>
                        <Td className="text-right font-semibold text-primary">{fmt$(a.totalAmount)}</Td>
                        <Td className="text-right text-green-600">{fmt$(a.paidAmount)}</Td>
                        <Td className="text-right text-red-600">{fmt$(a.unpaidAmount)}</Td>
                        <Td className="text-right">{a.count}</Td>
                        <Td>
                          {a.unpaidAmount > 0
                            ? <Badge className="text-xs bg-red-100 text-red-700 border-red-200">Has Unpaid</Badge>
                            : <Badge className="text-xs bg-green-100 text-green-700 border-green-200">All Paid</Badge>}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </CardContent>
      </Card>

      {/* Exceptions summary */}
      {report?.exceptions && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Commission Exceptions</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                <p className="text-2xl font-bold text-yellow-700">{report.exceptions.pending}</p>
                <p className="text-xs text-yellow-600 mt-1">Pending</p>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-lg border border-green-200">
                <p className="text-2xl font-bold text-green-700">{report.exceptions.approved}</p>
                <p className="text-xs text-green-600 mt-1">Approved</p>
              </div>
              <div className="text-center p-4 bg-red-50 rounded-lg border border-red-200">
                <p className="text-2xl font-bold text-red-700">{report.exceptions.denied}</p>
                <p className="text-xs text-red-600 mt-1">Denied</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
