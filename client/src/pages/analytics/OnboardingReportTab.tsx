import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { UserPlus, Clock, CheckCircle2, AlertTriangle } from "lucide-react";
import { fmtNum, KpiCard, EmptyState, ExportButton, Th, Td } from "./shared";

export default function OnboardingReportTab() {
  const [status, setStatus] = useState<"in_progress" | "completed" | undefined>();
  const [agentId, setAgentId] = useState<number | undefined>();

  const { data: agents } = trpc.users.list.useQuery({ role: "agent" });
  const { data: report, isLoading } = trpc.analytics.onboardingReport.useQuery({ status, agentId });

  const instances = report?.instances ?? [];
  const summary = report?.summary;

  const filtered = instances.filter((i: any) => {
    if (status && i.status !== status) return false;
    if (agentId && i.agentId !== agentId) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm text-muted-foreground font-medium">Status:</span>
        <Select value={status ?? "all"} onValueChange={(v) => setStatus(v === "all" ? undefined : v as any)}>
          <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="All" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground font-medium">Agent:</span>
        <Select value={agentId !== undefined ? String(agentId) : "all"} onValueChange={(v) => setAgentId(v === "all" ? undefined : Number(v))}>
          <SelectTrigger className="w-40 h-8 text-xs"><SelectValue placeholder="All Agents" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Agents</SelectItem>
            {(agents ?? []).map((a: any) => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Total Onboardings" value={fmtNum(summary?.total ?? 0)} icon={<UserPlus className="h-5 w-5" />} />
        <KpiCard label="In Progress" value={fmtNum(summary?.inProgress ?? 0)} icon={<Clock className="h-5 w-5" />} />
        <KpiCard label="Completed" value={fmtNum(summary?.completed ?? 0)} icon={<CheckCircle2 className="h-5 w-5" />} />
        <KpiCard label="Avg Days to Complete" value={summary?.avgDaysToComplete ? `${summary.avgDaysToComplete}d` : "—"} icon={<Clock className="h-5 w-5" />} />
      </div>

      {/* Overdue tasks alert */}
      {(summary?.totalOverdueTasks ?? 0) > 0 && (
        <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span><strong>{fmtNum(summary?.totalOverdueTasks ?? 0)}</strong> overdue onboarding tasks across all active instances.</span>
        </div>
      )}

      {/* Instance table */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Agent Onboarding Instances</CardTitle>
            <ExportButton
              data={filtered.map((i: any) => ({
                Agent: i.agentName, Status: i.status, "Started": new Date(i.startedAt).toLocaleDateString(),
                "Completed": i.completedAt ? new Date(i.completedAt).toLocaleDateString() : "—",
                "Days": i.daysToComplete ?? "—", "Progress %": i.pct,
                "Total Tasks": i.totalTasks, "Completed Tasks": i.completedTasks, "Overdue": i.overdueTasks,
              }))}
              filename="onboarding-report.csv"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? <div className="p-4 text-sm text-muted-foreground">Loading...</div> :
            filtered.length === 0 ? <EmptyState /> : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-border bg-muted/30">
                    <tr>
                      <Th>Agent</Th>
                      <Th>Status</Th>
                      <Th>Started</Th>
                      <Th className="text-right">Tasks</Th>
                      <Th className="text-right">Overdue</Th>
                      <Th className="w-36">Progress</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((i: any) => (
                      <tr key={i.instanceId} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                        <Td className="font-medium">{i.agentName}</Td>
                        <Td>
                          <Badge variant={i.status === "completed" ? "default" : "secondary"} className="text-xs">
                            {i.status === "in_progress" ? "In Progress" : "Completed"}
                          </Badge>
                        </Td>
                        <Td className="text-muted-foreground text-xs">{new Date(i.startedAt).toLocaleDateString()}</Td>
                        <Td className="text-right">{i.completedTasks}/{i.totalTasks}</Td>
                        <Td className="text-right">
                          {i.overdueTasks > 0
                            ? <span className="text-red-600 font-medium">{i.overdueTasks}</span>
                            : <span className="text-muted-foreground">0</span>}
                        </Td>
                        <Td>
                          <div className="flex items-center gap-2">
                            <Progress value={i.pct} className="h-1.5 flex-1" />
                            <span className="text-xs text-muted-foreground w-8 text-right">{i.pct}%</span>
                          </div>
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
