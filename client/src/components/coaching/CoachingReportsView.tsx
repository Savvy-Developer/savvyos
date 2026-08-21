import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, FileText, BarChart3, TrendingUp, Users, Download, Target, MapPin, Shield, ListChecks, Eye, Send } from "lucide-react";
import { safeFormat } from "@/lib/safeFormat";

export default function CoachingReportsView() {
  const [activeReport, setActiveReport] = useState<string>("scorecard");
  const [weeklyPreviewOpen, setWeeklyPreviewOpen] = useState(false);

  const { data: scorecardData, isLoading: scorecardLoading } = trpc.coaching.getExecutiveScorecard.useQuery(undefined, {
    enabled: activeReport === "scorecard",
  });

  const { data: commandData } = trpc.coaching.getCommandCenter.useQuery(undefined, { staleTime: 60_000 });
  const { data: weeklyPreview, isFetching: weeklyPreviewLoading } = trpc.coaching.getWeeklyAccountabilityEmailPreview.useQuery(undefined, {
    enabled: weeklyPreviewOpen,
  });
  const sendWeeklyTest = trpc.coaching.sendWeeklyAccountabilityEmailTest.useMutation({
    onSuccess: (data) => toast.success(`Test email sent to ${data.recipient}. The shared live report runs Fridays at 12:00 PM Eastern.`),
    onError: (error) => toast.error(error.message),
  });
  const sendWeeklyLive = trpc.coaching.sendWeeklyAccountabilityEmailNow.useMutation({
    onSuccess: (data) => toast.success(`Shared report sent to ${data.primaryRecipient} with ${data.copiedRecipients.length} leadership recipients copied.`),
    onError: (error) => toast.error(error.message),
  });
  const metrics = commandData?.metrics;
  const statusCounts = metrics?.statusCounts ?? {};

  const reports = [
    { id: "scorecard", label: "Executive Scorecard", icon: BarChart3, description: "Portfolio health, production vs goals, agent distribution" },
    { id: "portfolio", label: "Coach Portfolio", icon: Users, description: "Per-coach allocation, sessions, status mix, outcomes" },
    { id: "cohort", label: "New-Agent Cohort", icon: Target, description: "Launch agent milestones, time-to-first metrics" },
    { id: "effectiveness", label: "Coaching Effectiveness", icon: FileText, description: "Session-to-outcome correlation, commitment rates" },
    { id: "movement", label: "Performance Movement", icon: TrendingUp, description: "Status transitions, recovery rates, time in status" },
    { id: "market", label: "Market Coverage", icon: MapPin, description: "Red anchors, conditional markets, coverage gaps" },
    { id: "commitments", label: "Commitment Report", icon: ListChecks, description: "Created, completed, missed, repeated, by category" },
    { id: "capacity", label: "Capacity Report", icon: Shield, description: "Open escalations, age, impact, common barriers" },
  ];

  function exportScorecard() {
    const rows = [
      ["Metric", "Value"],
      ["Total Active Agents", String(metrics?.totalAgents ?? 0)],
      ["Launch", String(statusCounts["Launch"] ?? 0)],
      ["Red", String(statusCounts["Red"] ?? 0)],
      ["Yellow", String(statusCounts["Yellow"] ?? 0)],
      ["Green", String(statusCounts["Green"] ?? 0)],
      ["Elite", String(statusCounts["Elite"] ?? 0)],
      ["Active Performance Resets", String(metrics?.activeResets ?? 0)],
      ["Overdue Commitments", String(metrics?.overdueCommitments ?? 0)],
      ["Open Escalations", String(metrics?.openEscalations ?? 0)],
      ["Sessions This Week", String(metrics?.sessionsThisWeek ?? 0)],
      ["Agents Without Coach", String(metrics?.unassignedCoachAgents ?? 0)],
    ];
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "executive_scorecard.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <Card className="border-primary/30 bg-primary/[0.025]">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-base">Weekly Coaching Accountability Email</CardTitle>
              <CardDescription className="mt-1 max-w-3xl">One shared leadership report for Phil, Dyl, Elana, Trish, Ashleigh, and Hunter. It exposes roster ownership, meeting completion, documentation gaps, next-session coverage, commitment follow-through, and named exceptions by coach.</CardDescription>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setWeeklyPreviewOpen(true)}>
                <Eye className="mr-1.5 h-3.5 w-3.5" /> Preview
              </Button>
              <Button size="sm" variant="outline" onClick={() => sendWeeklyTest.mutate()} disabled={sendWeeklyTest.isPending || sendWeeklyLive.isPending}>
                {sendWeeklyTest.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}
                Send Test to Tyler
              </Button>
              <Button size="sm" onClick={() => sendWeeklyLive.mutate()} disabled={sendWeeklyLive.isPending || sendWeeklyTest.isPending}>
                {sendWeeklyLive.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}
                Send Shared Report Now
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-xs text-muted-foreground"><strong>Delivery:</strong> one shared email, addressed to Phil with Dyl, Elana, Trish, Ashleigh, and Hunter copied for Reply All. It runs every Friday at <strong>12:00 PM Eastern</strong>; the test action remains Tyler-only.</p>
        </CardContent>
      </Card>

      {/* Report Selector */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {reports.map((report) => (
          <Card
            key={report.id}
            className={`cursor-pointer transition-all hover:border-primary/40 ${activeReport === report.id ? "border-primary bg-primary/[0.03]" : ""}`}
            onClick={() => setActiveReport(report.id)}
          >
            <CardContent className="p-3">
              <div className="flex items-start gap-2">
                <report.icon className={`h-4 w-4 mt-0.5 shrink-0 ${activeReport === report.id ? "text-primary" : "text-muted-foreground"}`} />
                <div>
                  <p className="text-xs font-semibold">{report.label}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{report.description}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={weeklyPreviewOpen} onOpenChange={setWeeklyPreviewOpen}>
        <DialogContent className="flex h-[90vh] max-w-6xl flex-col p-0">
          <DialogHeader className="shrink-0 border-b px-6 py-4">
            <DialogTitle>Weekly Coaching Accountability Email Preview</DialogTitle>
            <p className="text-xs text-muted-foreground">{weeklyPreview?.subject ?? "Generating the current closed-week preview…"}</p>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-auto bg-muted/30 p-4">
            {weeklyPreviewLoading ? (
              <div className="flex h-48 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Building report preview…</div>
            ) : weeklyPreview?.html ? (
              <iframe title="Weekly Coaching Accountability Email Preview" srcDoc={weeklyPreview.html} className="min-h-full w-full rounded-md border bg-white" sandbox="allow-same-origin" />
            ) : (
              <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">Preview data is not available.</div>
            )}
          </div>
          <DialogFooter className="shrink-0 border-t px-6 py-3">
            <Button variant="outline" onClick={() => setWeeklyPreviewOpen(false)}>Close</Button>
            <Button variant="outline" onClick={() => sendWeeklyTest.mutate()} disabled={sendWeeklyTest.isPending || sendWeeklyLive.isPending}>
              {sendWeeklyTest.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />} Send Test to Tyler
            </Button>
            <Button onClick={() => sendWeeklyLive.mutate()} disabled={sendWeeklyLive.isPending || sendWeeklyTest.isPending}>
              {sendWeeklyLive.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />} Send Shared Report Now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ EXECUTIVE SCORECARD ═══ */}
      {activeReport === "scorecard" && (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div><CardTitle className="text-base">Executive Scorecard</CardTitle><CardDescription>Portfolio-level health metrics and KPIs</CardDescription></div>
            <Button size="sm" variant="outline" onClick={exportScorecard}><Download className="h-3.5 w-3.5 mr-1" />Export</Button>
          </CardHeader>
          <CardContent>
            {scorecardLoading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : (
              <div className="space-y-6">
                {/* Status Distribution */}
                <div>
                  <h3 className="text-sm font-semibold mb-3">Performance Status Distribution</h3>
                  <div className="grid grid-cols-5 gap-3">
                    {["Launch", "Red", "Yellow", "Green", "Elite"].map((status) => {
                      const count = Number(statusCounts[status] ?? 0);
                      const total = metrics?.totalAgents ?? 1;
                      const pct = Math.round((count / total) * 100);
                      return (
                        <div key={status} className="text-center">
                          <div className={`rounded-lg p-3 border ${status === "Red" ? "bg-red-50 border-red-200" : status === "Yellow" ? "bg-amber-50 border-amber-200" : status === "Green" ? "bg-emerald-50 border-emerald-200" : status === "Elite" ? "bg-violet-50 border-violet-200" : "bg-blue-50 border-blue-200"}`}>
                            <p className="text-2xl font-bold">{count}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">{pct}%</p>
                          </div>
                          <p className="text-xs font-medium mt-1.5">{status}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Key Metrics Table */}
                <div>
                  <h3 className="text-sm font-semibold mb-3">Key Performance Indicators</h3>
                  <Table>
                    <TableHeader><TableRow><TableHead className="text-[11px]">Metric</TableHead><TableHead className="text-[11px]">Current</TableHead><TableHead className="text-[11px]">Status</TableHead></TableRow></TableHeader>
                    <TableBody>
                      <TableRow><TableCell className="text-xs">Total Active Agents</TableCell><TableCell className="text-xs font-medium">{metrics?.totalAgents ?? 0}</TableCell><TableCell><Badge variant="secondary" className="text-[10px]">Tracked</Badge></TableCell></TableRow>
                      <TableRow><TableCell className="text-xs">Productive Agents (Green+Elite)</TableCell><TableCell className="text-xs font-medium">{Number(statusCounts["Green"] ?? 0) + Number(statusCounts["Elite"] ?? 0)}</TableCell><TableCell><Badge variant="secondary" className="text-[10px]">Productive</Badge></TableCell></TableRow>
                      <TableRow><TableCell className="text-xs">Agents at Red</TableCell><TableCell className="text-xs font-medium">{statusCounts["Red"] ?? 0}</TableCell><TableCell>{Number(statusCounts["Red"] ?? 0) > 5 ? <Badge variant="destructive" className="text-[10px]">Attention</Badge> : <Badge variant="secondary" className="text-[10px]">Normal</Badge>}</TableCell></TableRow>
                      <TableRow><TableCell className="text-xs">Active Performance Resets</TableCell><TableCell className="text-xs font-medium">{metrics?.activeResets ?? 0}</TableCell><TableCell><Badge variant="secondary" className="text-[10px]">In Progress</Badge></TableCell></TableRow>
                      <TableRow><TableCell className="text-xs">Reset Recovery Rate</TableCell><TableCell className="text-xs font-medium">{(scorecardData as any)?.resetRecoveryRate ?? "—"}</TableCell><TableCell><Badge variant="secondary" className="text-[10px]">Tracked</Badge></TableCell></TableRow>
                      <TableRow><TableCell className="text-xs">Coach-Out Recommendations</TableCell><TableCell className="text-xs font-medium">{(scorecardData as any)?.coachOutCount ?? 0}</TableCell><TableCell><Badge variant="secondary" className="text-[10px]">Active</Badge></TableCell></TableRow>
                      <TableRow><TableCell className="text-xs">Overdue Commitments</TableCell><TableCell className="text-xs font-medium">{metrics?.overdueCommitments ?? 0}</TableCell><TableCell>{(metrics?.overdueCommitments ?? 0) > 10 ? <Badge variant="destructive" className="text-[10px]">High</Badge> : <Badge variant="secondary" className="text-[10px]">Normal</Badge>}</TableCell></TableRow>
                      <TableRow><TableCell className="text-xs">Open Capacity Escalations</TableCell><TableCell className="text-xs font-medium">{metrics?.openEscalations ?? 0}</TableCell><TableCell><Badge variant="secondary" className="text-[10px]">Active</Badge></TableCell></TableRow>
                      <TableRow><TableCell className="text-xs">Sessions This Week</TableCell><TableCell className="text-xs font-medium">{metrics?.sessionsThisWeek ?? 0}</TableCell><TableCell><Badge variant="secondary" className="text-[10px]">Scheduled</Badge></TableCell></TableRow>
                      <TableRow><TableCell className="text-xs">Agents Without Coach</TableCell><TableCell className="text-xs font-medium">{metrics?.unassignedCoachAgents ?? 0}</TableCell><TableCell>{(metrics?.unassignedCoachAgents ?? 0) > 0 ? <Badge variant="destructive" className="text-[10px]">Action Required</Badge> : <Badge variant="secondary" className="text-[10px]">OK</Badge>}</TableCell></TableRow>
                      <TableRow><TableCell className="text-xs">No Session in 14 Days</TableCell><TableCell className="text-xs font-medium">{metrics?.noSessionIn14Days ?? 0}</TableCell><TableCell>{(metrics?.noSessionIn14Days ?? 0) > 0 ? <Badge variant="destructive" className="text-[10px]">Schedule</Badge> : <Badge variant="secondary" className="text-[10px]">OK</Badge>}</TableCell></TableRow>
                    </TableBody>
                  </Table>
                </div>

                {/* Diagnosis Distribution */}
                {metrics?.diagnosisCounts && Object.keys(metrics.diagnosisCounts).length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold mb-3">Primary Diagnosis Distribution</h3>
                    <div className="grid grid-cols-4 gap-3">
                      {Object.entries(metrics.diagnosisCounts).map(([diagnosis, count]) => (
                        <div key={diagnosis} className="rounded-lg border p-3 text-center">
                          <p className="text-xl font-bold">{String(count)}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{diagnosis}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ═══ COACH PORTFOLIO ═══ */}
      {activeReport === "portfolio" && (
        <Card>
          <CardHeader><CardTitle className="text-base">Coach Portfolio Report</CardTitle><CardDescription>Agent allocation, session frequency, and status mix per coach</CardDescription></CardHeader>
          <CardContent>
            {(scorecardData as any)?.coachPortfolios && (scorecardData as any).coachPortfolios.length > 0 ? (
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="text-[10px]">Coach</TableHead>
                  <TableHead className="text-[10px]">Agents</TableHead>
                  <TableHead className="text-[10px]">Sessions (30d)</TableHead>
                  <TableHead className="text-[10px]">Overdue Sessions</TableHead>
                  <TableHead className="text-[10px]">No Next Session</TableHead>
                  <TableHead className="text-[10px]">Active Resets</TableHead>
                  <TableHead className="text-[10px]">Commitment Rate</TableHead>
                </TableRow></TableHeader>
                <TableBody>{(scorecardData as any).coachPortfolios.map((cp: any) => (
                  <TableRow key={cp.coachId}>
                    <TableCell className="text-xs font-medium">{cp.coachName}</TableCell>
                    <TableCell className="text-xs">{cp.agentCount ?? 0}</TableCell>
                    <TableCell className="text-xs">{cp.sessionsLast30 ?? 0}</TableCell>
                    <TableCell className={`text-xs ${(cp.overdueSessions ?? 0) > 0 ? "text-red-600 font-semibold" : ""}`}>{cp.overdueSessions ?? 0}</TableCell>
                    <TableCell className={`text-xs ${(cp.noNextSession ?? 0) > 0 ? "text-red-600 font-semibold" : ""}`}>{cp.noNextSession ?? 0}</TableCell>
                    <TableCell className="text-xs">{cp.activeResets ?? 0}</TableCell>
                    <TableCell className="text-xs">{cp.commitmentRate ?? "—"}</TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
            ) : (
              <div className="flex min-h-32 flex-col items-center justify-center rounded-lg border border-dashed bg-muted/20 px-5 text-center">
                <Users className="h-8 w-8 text-muted-foreground/40 mb-2" />
                <p className="font-medium text-sm">Coach Portfolio Analysis</p>
                <p className="mt-1 text-xs text-muted-foreground">Shows each coach's agent load, status distribution, session frequency, and commitment completion rates. Data populates as coaching profiles are assigned.</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ═══ NEW-AGENT COHORT ═══ */}
      {activeReport === "cohort" && (
        <Card>
          <CardHeader><CardTitle className="text-base">New-Agent Cohort Report</CardTitle><CardDescription>Launch agent milestones, time-to-first metrics, and retention</CardDescription></CardHeader>
          <CardContent>
            <div className="flex min-h-32 flex-col items-center justify-center rounded-lg border border-dashed bg-muted/20 px-5 text-center">
              <Target className="h-8 w-8 text-muted-foreground/40 mb-2" />
              <p className="font-medium text-sm">New-Agent Cohort Tracking</p>
              <p className="mt-1 text-xs text-muted-foreground max-w-md">Tracks: agents joining, goals established, time to first consultation/offer/under-contract/closing, 90-day and 180-day production, current status, retention, coach of record, and common Four-C diagnoses. Populates as launch agents progress through milestones.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══ COACHING EFFECTIVENESS ═══ */}
      {activeReport === "effectiveness" && (
        <Card>
          <CardHeader><CardTitle className="text-base">Coaching Effectiveness Report</CardTitle><CardDescription>Measure session-to-outcome correlation and coaching impact</CardDescription></CardHeader>
          <CardContent>
            {(scorecardData as any)?.sessionMetrics ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="rounded-lg border p-3 text-center"><p className="text-xl font-bold">{(scorecardData as any).sessionMetrics.totalSessions ?? 0}</p><p className="text-[10px] text-muted-foreground">Total Sessions</p></div>
                  <div className="rounded-lg border p-3 text-center"><p className="text-xl font-bold">{(scorecardData as any).sessionMetrics.avgDaysBetween ?? "—"}</p><p className="text-[10px] text-muted-foreground">Avg Days Between</p></div>
                  <div className="rounded-lg border p-3 text-center"><p className="text-xl font-bold">{(scorecardData as any).commitmentMetrics?.completionRate ?? "—"}</p><p className="text-[10px] text-muted-foreground">Commitment Rate</p></div>
                  <div className="rounded-lg border p-3 text-center"><p className="text-xl font-bold">{(scorecardData as any).commitmentMetrics?.totalCreated ?? 0}</p><p className="text-[10px] text-muted-foreground">Commitments Created</p></div>
                </div>
                <p className="text-xs text-muted-foreground italic">Note: Correlation between coaching and performance improvement is tracked but causation is not claimed. Additional data points populate as more sessions are completed.</p>
              </div>
            ) : (
              <div className="flex min-h-32 flex-col items-center justify-center rounded-lg border border-dashed bg-muted/20 px-5 text-center">
                <FileText className="h-8 w-8 text-muted-foreground/40 mb-2" />
                <p className="font-medium text-sm">Effectiveness Metrics</p>
                <p className="mt-1 text-xs text-muted-foreground">Tracks session-to-outcome correlation, average time to status upgrade, commitment completion rates, and retention impact. Requires 30+ days of session data.</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ═══ PERFORMANCE MOVEMENT ═══ */}
      {activeReport === "movement" && (
        <Card>
          <CardHeader><CardTitle className="text-base">Performance Movement Report</CardTitle><CardDescription>Status transitions, recovery rates, time in status</CardDescription></CardHeader>
          <CardContent>
            {(scorecardData as any)?.statusDistribution ? (
              <div className="space-y-4">
                <Table>
                  <TableHeader><TableRow><TableHead className="text-[10px]">Movement</TableHead><TableHead className="text-[10px]">Count</TableHead><TableHead className="text-[10px]">Avg Days</TableHead></TableRow></TableHeader>
                  <TableBody>
                    <TableRow><TableCell className="text-xs">Red → Yellow</TableCell><TableCell className="text-xs">{(scorecardData as any).statusDistribution.redToYellow ?? "—"}</TableCell><TableCell className="text-xs">{(scorecardData as any).statusDistribution.avgDaysRedToYellow ?? "—"}</TableCell></TableRow>
                    <TableRow><TableCell className="text-xs">Yellow → Green</TableCell><TableCell className="text-xs">{(scorecardData as any).statusDistribution.yellowToGreen ?? "—"}</TableCell><TableCell className="text-xs">{(scorecardData as any).statusDistribution.avgDaysYellowToGreen ?? "—"}</TableCell></TableRow>
                    <TableRow><TableCell className="text-xs">Green → Elite</TableCell><TableCell className="text-xs">{(scorecardData as any).statusDistribution.greenToElite ?? "—"}</TableCell><TableCell className="text-xs">{(scorecardData as any).statusDistribution.avgDaysGreenToElite ?? "—"}</TableCell></TableRow>
                    <TableRow><TableCell className="text-xs">Status Declines</TableCell><TableCell className="text-xs">{(scorecardData as any).statusDistribution.declines ?? "—"}</TableCell><TableCell className="text-xs">—</TableCell></TableRow>
                    <TableRow><TableCell className="text-xs">Repeated Red Cycling</TableCell><TableCell className="text-xs">{(scorecardData as any).statusDistribution.repeatedRed ?? "—"}</TableCell><TableCell className="text-xs">—</TableCell></TableRow>
                  </TableBody>
                </Table>
                <p className="text-xs text-muted-foreground italic">Movement data populates as coaching history snapshots are recorded monthly.</p>
              </div>
            ) : (
              <div className="flex min-h-32 flex-col items-center justify-center rounded-lg border border-dashed bg-muted/20 px-5 text-center">
                <TrendingUp className="h-8 w-8 text-muted-foreground/40 mb-2" />
                <p className="font-medium text-sm">Status Movement Tracking</p>
                <p className="mt-1 text-xs text-muted-foreground">Tracks Red→Yellow, Yellow→Green, Green→Elite transitions, status declines, time in status, recovery rates, and repeated cycling. Populates as monthly snapshots are recorded.</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ═══ MARKET COVERAGE ═══ */}
      {activeReport === "market" && (
        <Card>
          <CardHeader><CardTitle className="text-base">Market Coverage Report</CardTitle><CardDescription>Markets with Red anchors, conditional status, coverage gaps</CardDescription></CardHeader>
          <CardContent>
            <div className="flex min-h-32 flex-col items-center justify-center rounded-lg border border-dashed bg-muted/20 px-5 text-center">
              <MapPin className="h-8 w-8 text-muted-foreground/40 mb-2" />
              <p className="font-medium text-sm">Market Coverage Analysis</p>
              <p className="mt-1 text-xs text-muted-foreground max-w-md">Shows: markets with Red anchor agents, Red group members, inadequate group production, conditional markets, recruiting-active markets, unassigned markets, multiple productive agents, and production gaps. Use the Market Coverage tab for interactive drill-down.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══ COMMITMENT REPORT ═══ */}
      {activeReport === "commitments" && (
        <Card>
          <CardHeader><CardTitle className="text-base">Commitment Report</CardTitle><CardDescription>Created, completed, missed, repeated, by category and diagnosis</CardDescription></CardHeader>
          <CardContent>
            {(scorecardData as any)?.commitmentMetrics ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-lg border p-3 text-center"><p className="text-xl font-bold">{(scorecardData as any).commitmentMetrics.totalCreated ?? 0}</p><p className="text-[10px] text-muted-foreground">Created</p></div>
                <div className="rounded-lg border p-3 text-center"><p className="text-xl font-bold text-emerald-700">{(scorecardData as any).commitmentMetrics.completed ?? 0}</p><p className="text-[10px] text-muted-foreground">Completed</p></div>
                <div className="rounded-lg border p-3 text-center"><p className="text-xl font-bold text-red-600">{(scorecardData as any).commitmentMetrics.missed ?? 0}</p><p className="text-[10px] text-muted-foreground">Missed</p></div>
                <div className="rounded-lg border p-3 text-center"><p className="text-xl font-bold">{(scorecardData as any).commitmentMetrics.completionRate ?? "—"}</p><p className="text-[10px] text-muted-foreground">Completion Rate</p></div>
              </div>
            ) : (
              <div className="flex min-h-32 flex-col items-center justify-center rounded-lg border border-dashed bg-muted/20 px-5 text-center">
                <ListChecks className="h-8 w-8 text-muted-foreground/40 mb-2" />
                <p className="font-medium text-sm">Commitment Analytics</p>
                <p className="mt-1 text-xs text-muted-foreground">Tracks commitments created, completed, missed, completion rate, repeated missed commitments, by category and diagnosis. Use the Commitments tab for the full list.</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ═══ CAPACITY REPORT ═══ */}
      {activeReport === "capacity" && (
        <Card>
          <CardHeader><CardTitle className="text-base">Capacity Report</CardTitle><CardDescription>Open escalations, owner, age, estimated production impact</CardDescription></CardHeader>
          <CardContent>
            <div className="flex min-h-32 flex-col items-center justify-center rounded-lg border border-dashed bg-muted/20 px-5 text-center">
              <Shield className="h-8 w-8 text-muted-foreground/40 mb-2" />
              <p className="font-medium text-sm">Capacity Escalation Analytics</p>
              <p className="mt-1 text-xs text-muted-foreground max-w-md">Shows: open escalations, assigned owner, age, estimated production impact, overdue escalations, and common barriers. Use the Escalations tab for the full list and creation workflow.</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
