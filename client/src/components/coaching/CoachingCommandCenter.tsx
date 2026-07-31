import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ChevronRight,
  Loader2,
  CalendarDays,
  Target,
  Activity,
  RefreshCw,
  UserCheck,
  Brain,
  DollarSign,
  Building2,
  ClipboardCheck,
  CalendarClock,
  Gauge,
  Play,
  Shield,
  ArrowUpRight,
  ArrowDownRight,
  Zap,
  ListChecks,
} from "lucide-react";
import { safeFormat, safeFormatET } from "@/lib/safeFormat";

const PERF_STATUS_COLORS: Record<string, string> = {
  Launch: "bg-blue-100 text-blue-800 border-blue-200",
  Red: "bg-red-100 text-red-800 border-red-200",
  Yellow: "bg-amber-100 text-amber-800 border-amber-200",
  Green: "bg-emerald-100 text-emerald-800 border-emerald-200",
  Elite: "bg-violet-100 text-violet-800 border-violet-200",
};

function MetricCard({
  label,
  value,
  note,
  icon: Icon,
  accent = "teal",
  onClick,
}: {
  label: string;
  value: string | number;
  note?: string;
  icon: any;
  accent?: "teal" | "blue" | "amber" | "rose" | "violet" | "slate";
  onClick?: () => void;
}) {
  const accentMap: Record<string, string> = {
    teal: "bg-teal-50 text-teal-700 border-teal-100",
    blue: "bg-blue-50 text-blue-700 border-blue-100",
    amber: "bg-amber-50 text-amber-700 border-amber-100",
    rose: "bg-rose-50 text-rose-700 border-rose-100",
    violet: "bg-violet-50 text-violet-700 border-violet-100",
    slate: "bg-slate-50 text-slate-700 border-slate-200",
  };
  return (
    <Card
      className={`h-full ${onClick ? "cursor-pointer transition-all hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md" : ""}`}
      onClick={onClick}
    >
      <CardContent className="p-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground leading-tight">{label}</p>
            <p className="mt-1 text-xl font-semibold tracking-tight">{value}</p>
            {note && <p className="mt-0.5 text-[10px] leading-3 text-muted-foreground">{note}</p>}
          </div>
          <span className={`rounded-lg border p-2 ${accentMap[accent]}`}><Icon className="h-3.5 w-3.5" /></span>
        </div>
      </CardContent>
    </Card>
  );
}

function ActionQueueTable({
  title,
  description,
  items,
  columns,
  emptyMessage,
  onRowClick,
}: {
  title: string;
  description?: string;
  items: any[];
  columns: { key: string; label: string; render?: (item: any) => React.ReactNode }[];
  emptyMessage?: string;
  onRowClick?: (item: any) => void;
}) {
  if (!items || items.length === 0) return null;
  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        {description && <CardDescription className="text-xs">{description}</CardDescription>}
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((col) => (
                  <TableHead key={col.key} className="text-[11px]">{col.label}</TableHead>
                ))}
                {onRowClick && <TableHead className="w-8"></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.slice(0, 10).map((item: any, idx: number) => (
                <TableRow
                  key={idx}
                  className={onRowClick ? "cursor-pointer hover:bg-muted/50" : ""}
                  onClick={() => onRowClick?.(item)}
                >
                  {columns.map((col) => (
                    <TableCell key={col.key} className="text-xs py-2">
                      {col.render ? col.render(item) : item[col.key] ?? "—"}
                    </TableCell>
                  ))}
                  {onRowClick && (
                    <TableCell className="py-2"><ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /></TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {items.length > 10 && (
          <div className="px-4 py-2 border-t text-xs text-muted-foreground">
            Showing 10 of {items.length} items
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function CoachingCommandCenter() {
  const [, navigate] = useLocation();
  const { data, isLoading, refetch } = trpc.coaching.getCommandCenter.useQuery(undefined, {
    staleTime: 60_000,
  });

  const [briefText, setBriefText] = useState<string | null>(null);

  const generateBrief = trpc.coaching.generateCommandCenterBrief.useMutation({
    onSuccess: (result: any) => { setBriefText(result?.brief ?? null); },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading Command Center...</span>
      </div>
    );
  }

  const metrics = data?.metrics;
  const queues = data?.actionQueues;
  const upcoming = data?.upcomingSessions ?? [];

  const statusCounts = metrics?.statusCounts ?? {};
  const redCount = Number(statusCounts["Red"] ?? 0);
  const yellowCount = Number(statusCounts["Yellow"] ?? 0);
  const greenCount = Number(statusCounts["Green"] ?? 0);
  const eliteCount = Number(statusCounts["Elite"] ?? 0);
  const launchCount = Number(statusCounts["Launch"] ?? 0);
  const matureAgents = redCount + yellowCount + greenCount + eliteCount;
  const productiveAgents = greenCount + eliteCount + yellowCount;
  const atThreeOrMore = yellowCount + greenCount + eliteCount;
  const atSixOrMore = greenCount + eliteCount;
  const atTwelveOrMore = eliteCount;
  const pctThree = matureAgents > 0 ? Math.round((atThreeOrMore / matureAgents) * 100) : 0;
  const pctSix = matureAgents > 0 ? Math.round((atSixOrMore / matureAgents) * 100) : 0;
  const pctTwelve = matureAgents > 0 ? Math.round((atTwelveOrMore / matureAgents) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* AI Agent Success Brief */}
      <Card className="border-primary/15 bg-gradient-to-br from-primary/[0.04] via-background to-teal-50/60">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex gap-3">
              <div className="rounded-xl bg-primary p-2.5 text-primary-foreground"><Brain className="h-5 w-5" /></div>
              <div>
                <CardTitle className="text-base">Agent Success Brief</CardTitle>
                <CardDescription className="mt-1">AI-synthesized intelligence across the coaching portfolio. Linked to operational facts — not a substitute for management judgment.</CardDescription>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => generateBrief.mutate()}
              disabled={generateBrief.isPending}
            >
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${generateBrief.isPending ? "animate-spin" : ""}`} />
              {generateBrief.isPending ? "Generating..." : "Generate Brief"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {briefText ? (
            <div className="rounded-lg border bg-background/70 p-4 text-sm leading-6 whitespace-pre-wrap">
              {briefText}
            </div>
          ) : (
            <div className="flex min-h-24 flex-col items-center justify-center rounded-lg border border-dashed bg-muted/20 px-5 text-center">
              <p className="font-medium text-sm">No cached intelligence brief</p>
              <p className="mt-1 text-xs text-muted-foreground">Click "Generate Brief" to synthesize the current coaching portfolio state.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top-Level Metrics - Compact Grid */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">Portfolio Metrics</h2>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
          <MetricCard label="Active Agents" value={metrics?.totalAgents ?? 0} icon={Users} accent="teal" />
          <MetricCard label="Launch Agents" value={launchCount} icon={Activity} accent="blue" />
          <MetricCard label="Red Agents" value={redCount} icon={AlertTriangle} accent="rose" onClick={() => navigate("/coaching")} />
          <MetricCard label="Yellow" value={yellowCount} icon={Gauge} accent="amber" />
          <MetricCard label="Green" value={greenCount} icon={CheckCircle2} accent="teal" />
          <MetricCard label="Elite" value={eliteCount} icon={Zap} accent="violet" />
          <MetricCard label="≥3 Units (Productive)" value={`${pctThree}%`} note={`${atThreeOrMore} of ${matureAgents} mature`} icon={Target} accent="teal" />
          <MetricCard label="≥6 Units ($1B Pace)" value={`${pctSix}%`} note={`${atSixOrMore} of ${matureAgents} mature`} icon={TrendingUp} accent="blue" />
          <MetricCard label="≥12 Units ($2B Pace)" value={`${pctTwelve}%`} note={`${atTwelveOrMore} of ${matureAgents} mature`} icon={ArrowUpRight} accent="violet" />
          <MetricCard label="Sessions Today" value={metrics?.sessionsToday ?? 0} icon={CalendarDays} accent="blue" />
          <MetricCard label="Sessions This Week" value={metrics?.sessionsThisWeek ?? 0} icon={CalendarClock} accent="teal" />
          <MetricCard label="Overdue Commitments" value={metrics?.overdueCommitments ?? 0} icon={ClipboardCheck} accent="rose" />
          <MetricCard label="Active Resets" value={metrics?.activeResets ?? 0} icon={AlertTriangle} accent="rose" />
          <MetricCard label="Open Escalations" value={metrics?.openEscalations ?? 0} icon={Shield} accent="amber" />
          <MetricCard label="No Coach Assigned" value={metrics?.unassignedCoachAgents ?? 0} icon={UserCheck} accent="rose" />
          <MetricCard label="No Session in 14d" value={metrics?.noSessionIn14Days ?? 0} icon={Clock} accent="rose" />
          <MetricCard label="Pending Coach-Outs" value={metrics?.pendingCoachOuts ?? 0} icon={AlertTriangle} accent="amber" />
          <MetricCard label="Open Commitments" value={metrics?.openCommitments ?? 0} icon={ListChecks} accent="slate" />
        </div>
      </div>

      {/* Action Queues */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">Action Queues</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Sessions Due Today */}
          <ActionQueueTable
            title={`Sessions Due Today (${queues?.sessionsDueToday?.length ?? 0})`}
            items={queues?.sessionsDueToday ?? []}
            columns={[
              { key: "agent", label: "Agent", render: (item: any) => <span className="font-medium">{item.agentName ?? "—"}</span> },
              { key: "coach", label: "Coach", render: (item: any) => item.coachName ?? "—" },
              { key: "time", label: "Time", render: (item: any) => safeFormatET(item.session?.sessionDate, { hour: "numeric", minute: "2-digit" }, "—") },
              { key: "type", label: "Type", render: (item: any) => item.session?.sessionType ?? "—" },
            ]}
            onRowClick={(item: any) => navigate(`/coaching/session/${item.session?.id}`)}
          />

          {/* Agents Needing Setup */}
          <ActionQueueTable
            title={`New Agent Setup Required (${queues?.agentsNeedingSetup?.length ?? 0})`}
            description="Agents without a Coach of Record or coaching setup"
            items={queues?.agentsNeedingSetup ?? []}
            columns={[
              { key: "agent", label: "Agent", render: (item: any) => <span className="font-medium">{item.agentName ?? "—"}</span> },
              { key: "status", label: "Status", render: (item: any) => (
                <Badge className={`text-[10px] border ${PERF_STATUS_COLORS[item.profile?.performanceStatus] ?? ""}`} variant="outline">
                  {item.profile?.performanceStatus ?? "—"}
                </Badge>
              )},
              { key: "action", label: "Action", render: () => <span className="text-red-600 font-medium">Assign coach</span> },
            ]}
            onRowClick={(item: any) => navigate(`/coaching/agent/${item.profile?.agentId}`)}
          />

          {/* Overdue Commitments */}
          <ActionQueueTable
            title={`Overdue Commitments (${queues?.overdueCommitmentsList?.length ?? 0})`}
            items={queues?.overdueCommitmentsList ?? []}
            columns={[
              { key: "agent", label: "Agent", render: (item: any) => <span className="font-medium">{item.agentName ?? "—"}</span> },
              { key: "desc", label: "Commitment", render: (item: any) => <span className="truncate max-w-[200px] inline-block">{item.commitment?.description ?? "—"}</span> },
              { key: "due", label: "Due", render: (item: any) => <span className="text-red-600">{safeFormat(item.commitment?.dueDate, "MMM d")}</span> },
              { key: "status", label: "Status", render: (item: any) => item.commitment?.status ?? "—" },
            ]}
            onRowClick={(item: any) => navigate(`/coaching/agent/${item.commitment?.agentId}`)}
          />

          {/* AI Commitments Needing Review */}
          <ActionQueueTable
            title={`AI Commitments Needing Review (${queues?.aiCommitmentsNeedingReview?.length ?? 0})`}
            description="AI-extracted commitments awaiting coach approval"
            items={queues?.aiCommitmentsNeedingReview ?? []}
            columns={[
              { key: "agent", label: "Agent", render: (item: any) => <span className="font-medium">{item.agentName ?? "—"}</span> },
              { key: "desc", label: "Commitment", render: (item: any) => <span className="truncate max-w-[200px] inline-block">{item.commitment?.description ?? "—"}</span> },
              { key: "confidence", label: "Confidence", render: (item: any) => item.commitment?.aiConfidence ?? "—" },
            ]}
            onRowClick={(item: any) => navigate(`/coaching/agent/${item.commitment?.agentId}`)}
          />

          {/* Launch Agents At Risk */}
          <ActionQueueTable
            title={`Launch Agents At Risk (${queues?.launchAtRisk?.length ?? 0})`}
            items={queues?.launchAtRisk ?? []}
            columns={[
              { key: "agent", label: "Agent", render: (item: any) => <span className="font-medium">{item.agentName ?? "—"}</span> },
              { key: "health", label: "Health", render: (item: any) => (
                <Badge variant="destructive" className="text-[10px]">{item.profile?.launchHealthStatus ?? "—"}</Badge>
              )},
              { key: "action", label: "Action", render: () => "Review launch plan" },
            ]}
            onRowClick={(item: any) => navigate(`/coaching/agent/${item.profile?.agentId}`)}
          />

          {/* At-Risk Agents Without Next Session */}
          <ActionQueueTable
            title={`Red/Yellow Without Next Session (${queues?.atRiskNoSession?.length ?? 0})`}
            items={queues?.atRiskNoSession ?? []}
            columns={[
              { key: "agent", label: "Agent", render: (item: any) => <span className="font-medium">{item.agentName ?? "—"}</span> },
              { key: "status", label: "Status", render: (item: any) => (
                <Badge className={`text-[10px] border ${PERF_STATUS_COLORS[item.profile?.performanceStatus] ?? ""}`} variant="outline">
                  {item.profile?.performanceStatus ?? "—"}
                </Badge>
              )},
              { key: "action", label: "Action", render: () => <span className="text-red-600 font-medium">Schedule session</span> },
            ]}
            onRowClick={(item: any) => navigate(`/coaching/agent/${item.profile?.agentId}`)}
          />

          {/* Sessions Needing AI Processing */}
          <ActionQueueTable
            title={`Sessions Needing AI Processing (${queues?.sessionsNeedingProcessing?.length ?? 0})`}
            items={queues?.sessionsNeedingProcessing ?? []}
            columns={[
              { key: "agent", label: "Agent", render: (item: any) => <span className="font-medium">{item.agentName ?? "—"}</span> },
              { key: "date", label: "Date", render: (item: any) => safeFormat(item.session?.sessionDate, "MMM d") },
              { key: "action", label: "Action", render: () => "Generate summary" },
            ]}
            onRowClick={(item: any) => navigate(`/coaching/session/${item.session?.id}`)}
          />

          {/* Retention Alerts */}
          <ActionQueueTable
            title={`Retention Risk Alerts (${queues?.retentionAlerts?.length ?? 0})`}
            items={queues?.retentionAlerts ?? []}
            columns={[
              { key: "agent", label: "Agent", render: (item: any) => <span className="font-medium">{item.agentName ?? "—"}</span> },
              { key: "risk", label: "Risk", render: (item: any) => (
                <Badge variant="destructive" className="text-[10px]">{item.profile?.retentionRiskStatus ?? "—"}</Badge>
              )},
              { key: "coach", label: "Coach", render: (item: any) => item.coachName ?? "Unassigned" },
            ]}
            onRowClick={(item: any) => navigate(`/coaching/agent/${item.profile?.agentId}`)}
          />

          {/* Reset Checkpoints Due */}
          <ActionQueueTable
            title={`Reset Checkpoints Due This Week (${queues?.checkpointsDueThisWeek?.length ?? 0})`}
            items={queues?.checkpointsDueThisWeek ?? []}
            columns={[
              { key: "date", label: "Date", render: (item: any) => safeFormat(item.checkpoint?.checkpointDate, "MMM d") },
              { key: "type", label: "Type", render: (item: any) => item.checkpoint?.checkpointType ?? "—" },
              { key: "status", label: "Status", render: (item: any) => item.checkpoint?.status ?? "—" },
            ]}
          />
        </div>
      </div>

      {/* Upcoming Sessions This Week */}
      {upcoming.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">Upcoming Sessions This Week ({upcoming.length})</h2>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[11px]">Agent</TableHead>
                      <TableHead className="text-[11px]">Coach</TableHead>
                      <TableHead className="text-[11px]">Date & Time</TableHead>
                      <TableHead className="text-[11px]">Type</TableHead>
                      <TableHead className="text-[11px]">Status</TableHead>
                      <TableHead className="w-8"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {upcoming.map((row: any, idx: number) => (
                      <TableRow
                        key={idx}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => navigate(`/coaching/session/${row.session?.id}`)}
                      >
                        <TableCell className="text-xs font-medium">{row.agentName ?? "—"}</TableCell>
                        <TableCell className="text-xs">{row.coachName ?? "—"}</TableCell>
                        <TableCell className="text-xs">{safeFormatET(row.session?.sessionDate, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</TableCell>
                        <TableCell className="text-xs">{row.session?.sessionType ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-[10px]">{row.session?.status}</Badge>
                        </TableCell>
                        <TableCell><ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
