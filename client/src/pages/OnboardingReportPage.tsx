import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Users,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Target,
  TrendingUp,
  BarChart3,
} from "lucide-react";
import { safeFormatET } from "@/lib/safeFormat";

function formatLifecycleDuration(minutes: number | null | undefined) {
  if (minutes == null) return "In progress";
  const totalMinutes = Math.max(0, Number(minutes));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const remainingMinutes = totalMinutes % 60;
  return [
    days > 0 ? `${days}d` : null,
    hours > 0 ? `${hours}h` : null,
    remainingMinutes > 0 || (!days && !hours) ? `${remainingMinutes}m` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

function lifecycleLabel(status: string) {
  if (status === "graduated") return "Graduated";
  if (status === "terminated") return "Terminated";
  return "Onboarded";
}

export default function OnboardingReportPage() {
  const { user } = useAuth();
  const { data: report, isLoading } = trpc.onboarding.getReport.useQuery();
  const { data: lifecycleInstances = [] } =
    trpc.onboarding.listInstances.useQuery({ status: "all" });

  if (user?.role !== "admin") return null;

  if (isLoading) {
    return (
      <div className="text-center py-12 text-muted-foreground">Loading report...</div>
    );
  }

  if (!report) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p className="text-lg font-medium">No on/offboarding data yet</p>
            <p className="text-sm mt-1">Start on/offboarding agents to see metrics here.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { summary, agentBreakdown } = report;
  const onboardingLifecycleInstances = lifecycleInstances.filter(
    item => item.template?.type === "onboarding"
  );

  return (
    <div className="space-y-6">

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Users className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Processes</p>
                <p className="text-2xl font-bold">{summary.totalInstances}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {summary.inProgressInstances} onboarded · {summary.graduatedInstances} graduated
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10">
                <TrendingUp className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Avg. Completion Time</p>
                <p className="text-2xl font-bold">
                  {summary.avgCompletionDays != null ? `${summary.avgCompletionDays} days` : "—"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  From start to graduation or termination
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Target className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">On-Time Rate</p>
                <p className="text-2xl font-bold">{summary.onTimeRate}%</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Tasks completed before due date
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <Clock className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Onboarded</p>
                <p className="text-2xl font-bold">{summary.inProgressInstances}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-500/10">
                <AlertTriangle className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Overdue Tasks</p>
                <p className="text-2xl font-bold">{summary.overdueTaskCount}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Across all active instances
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Graduated</p>
                <p className="text-2xl font-bold">{summary.graduatedInstances}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-500/10">
                <AlertTriangle className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Terminated</p>
                <p className="text-2xl font-bold">{summary.terminatedInstances}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Per-Agent Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5" />
            Per-Agent Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          {agentBreakdown.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No agent data available yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Agent</TableHead>
                    <TableHead className="text-center">Processes</TableHead>
                    <TableHead className="text-center">Graduated</TableHead>
                    <TableHead className="text-center">Terminated</TableHead>
                    <TableHead className="text-center">Avg. Days</TableHead>
                    <TableHead className="text-center">Overdue Tasks</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agentBreakdown.map((agent) => (
                    <TableRow key={agent.agentId}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{agent.agentName ?? "Unknown"}</p>
                          {agent.agentEmail && (
                            <p className="text-xs text-muted-foreground">{agent.agentEmail}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">{agent.totalInstances}</TableCell>
                      <TableCell className="text-center">{agent.graduatedInstances}</TableCell>
                      <TableCell className="text-center">{agent.terminatedInstances}</TableCell>
                      <TableCell className="text-center">
                        {agent.avgDays != null ? `${agent.avgDays}d` : "—"}
                      </TableCell>
                      <TableCell className="text-center">
                        {agent.overdueTasks > 0 ? (
                          <Badge variant="destructive" className="text-xs">
                            {agent.overdueTasks}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {agent.totalInstances === agent.graduatedInstances + agent.terminatedInstances ? (
                          <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                            All Finished
                          </Badge>
                        ) : agent.terminatedInstances > 0 ? (
                          <Badge variant="destructive" className="text-xs">
                            Has Termination
                          </Badge>
                        ) : agent.overdueTasks > 0 ? (
                          <Badge variant="destructive" className="text-xs">
                            Has Overdue
                          </Badge>
                        ) : (
                          <Badge variant="secondary">In Progress</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Onboarding Lifecycle History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {onboardingLifecycleInstances.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No onboarding records available yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Agent</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Finished</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Termination Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {onboardingLifecycleInstances.map(item => {
                    const finishedAt = item.instance.graduatedAt ?? item.instance.terminatedAt ?? item.instance.completedAt;
                    return (
                      <TableRow key={item.instance.id}>
                        <TableCell className="font-medium">{item.agent?.name ?? item.agent?.email ?? "Unknown agent"}</TableCell>
                        <TableCell className="whitespace-nowrap">{safeFormatET(item.instance.startedAt)}</TableCell>
                        <TableCell>
                          <Badge variant={item.instance.status === "terminated" ? "destructive" : item.instance.status === "graduated" ? "default" : "secondary"}>
                            {lifecycleLabel(item.instance.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{finishedAt ? safeFormatET(finishedAt) : "—"}</TableCell>
                        <TableCell className="whitespace-nowrap">{formatLifecycleDuration(item.instance.completionDurationMinutes)}</TableCell>
                        <TableCell className="max-w-sm whitespace-normal text-sm text-muted-foreground">{item.instance.terminationReason ?? "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
