import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from "recharts";
import { CheckCircle2, Clock, AlertTriangle, XCircle } from "lucide-react";
import { fmtNum, DateRangeFilter, useDateRange, KpiCard, EmptyState, ExportButton, CHART_COLORS, Th, Td } from "./shared";

export default function TaskAnalyticsTab() {
  const [range, setRange] = useState("last30");
  const [assignedToId, setAssignedToId] = useState<number | undefined>();
  const [taskType, setTaskType] = useState<string | undefined>();
  const [priority, setPriority] = useState<string | undefined>();
  const dates = useDateRange(range);

  const { data: users } = trpc.users.list.useQuery({});
  const { data: report, isLoading } = trpc.analytics.taskAnalyticsReport.useQuery({
    ...dates, assignedToId, taskType, priority,
  });

  const statusPieData = useMemo(() =>
    (report?.statusBreakdown ?? []).map((s: any, i: number) => ({ name: s.status, value: s.count, fill: CHART_COLORS[i % CHART_COLORS.length] })),
    [report]
  );

  const priorityBarData = useMemo(() =>
    (report?.priorityBreakdown ?? []).map((p: any) => ({ name: p.priority, Count: p.count, Overdue: p.overdueCount ?? 0 })),
    [report]
  );

  const typeBarData = useMemo(() =>
    (report?.typeBreakdown ?? []).map((t: any) => ({ name: t.taskType, Count: t.count })),
    [report]
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm text-muted-foreground font-medium">Period:</span>
        <DateRangeFilter value={range} onChange={setRange} />
        <span className="text-sm text-muted-foreground font-medium">Assigned To:</span>
        <Select value={assignedToId !== undefined ? String(assignedToId) : "all"} onValueChange={(v) => setAssignedToId(v === "all" ? undefined : Number(v))}>
          <SelectTrigger className="w-40 h-8 text-xs"><SelectValue placeholder="All Users" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Users</SelectItem>
            {(users ?? []).map((u: any) => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground font-medium">Priority:</span>
        <Select value={priority ?? "all"} onValueChange={(v) => setPriority(v === "all" ? undefined : v)}>
          <SelectTrigger className="w-28 h-8 text-xs"><SelectValue placeholder="All" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Total Tasks" value={fmtNum(report?.total ?? 0)} icon={<CheckCircle2 className="h-5 w-5" />} />
        <KpiCard label="Completed" value={fmtNum(report?.completed ?? 0)} sub={`${report?.completionRate ?? 0}% rate`} icon={<CheckCircle2 className="h-5 w-5" />} />
        <KpiCard label="Overdue" value={fmtNum(report?.overdue ?? 0)} icon={<AlertTriangle className="h-5 w-5" />} />
        <KpiCard label="Completion Rate" value={`${report?.completionRate ?? 0}%`} sub="tasks completed" icon={<Clock className="h-5 w-5" />} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Tasks by Status</CardTitle></CardHeader>
          <CardContent>
            {statusPieData.length === 0 ? <EmptyState /> : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={statusPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {statusPieData.map((p: any) => <Cell key={p.name} fill={p.fill} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => [fmtNum(v), "Tasks"]} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Tasks by Priority</CardTitle></CardHeader>
          <CardContent>
            {priorityBarData.length === 0 ? <EmptyState /> : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={priorityBarData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="Count" fill={CHART_COLORS[1]} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Overdue" fill={CHART_COLORS[5]} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tasks by type */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Tasks by Type</CardTitle></CardHeader>
        <CardContent>
          {typeBarData.length === 0 ? <EmptyState /> : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={typeBarData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
                <Tooltip />
                <Bar dataKey="Count" fill={CHART_COLORS[0]} radius={[0, 3, 3, 0]}>
                  {typeBarData.map((_: any, i: number) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Assignee breakdown */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">By Assignee</CardTitle>
            <ExportButton
              data={(report?.byAssignee ?? []).map((a: any) => ({
                Assignee: a.assigneeName, Total: a.total, Completed: a.completed, Overdue: a.overdue, "Completion %": a.completionRate,
              }))}
              filename="task-assignees.csv"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? <div className="p-4 text-sm text-muted-foreground">Loading...</div> :
            (report?.byAssignee ?? []).length === 0 ? <EmptyState /> : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-border bg-muted/30">
                    <tr>
                      <Th>Assignee</Th>
                      <Th className="text-right">Total</Th>
                      <Th className="text-right">Completed</Th>
                      <Th className="text-right">Overdue</Th>
                      <Th className="text-right">Completion %</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {(report?.byAssignee ?? []).map((a: any) => (
                      <tr key={a.assigneeId} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                        <Td className="font-medium">{a.assigneeName}</Td>
                        <Td className="text-right">{a.total}</Td>
                        <Td className="text-right text-green-600">{a.completed}</Td>
                        <Td className="text-right text-red-600">{a.overdue}</Td>
                        <Td className="text-right">
                          <Badge variant={a.completionRate >= 80 ? "default" : a.completionRate >= 50 ? "secondary" : "destructive"} className="text-xs">
                            {a.completionRate}%
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
