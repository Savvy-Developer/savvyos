import { useState, useMemo } from "react";
import { useLocation, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Brain,
  CalendarDays,
  ChevronRight,
  CheckCircle2,
  Clock,
  DollarSign,
  Edit,
  FileText,
  Loader2,
  MapPin,
  Plus,
  Target,
  TrendingUp,
  AlertTriangle,
  Mic,
  Upload,
  BarChart3,
  ListChecks,
  Shield,
  FolderOpen,
  Activity,
  ExternalLink,
  Home,
  XCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { safeFormat, safeFormatET } from "@/lib/safeFormat";
import { toast } from "sonner";
import CoachingCommitmentsPanel from "@/components/coaching/CoachingCommitmentsPanel";
import CoachingAssessmentsPanel from "@/components/coaching/CoachingAssessmentsPanel";
import CoachingPerformanceResetPanel from "@/components/coaching/CoachingPerformanceResetPanel";
import CoachingProfileEditDialog from "@/components/coaching/CoachingProfileEditDialog";
import { CoachingAIInsightsTab } from "@/components/coaching/CoachingAIInsightsTab";

const PERF_STATUS_COLORS: Record<string, string> = {
  Launch: "bg-blue-100 text-blue-800 border-blue-200",
  Red: "bg-red-100 text-red-800 border-red-200",
  Yellow: "bg-amber-100 text-amber-800 border-amber-200",
  Green: "bg-emerald-100 text-emerald-800 border-emerald-200",
  Elite: "bg-violet-100 text-violet-800 border-violet-200",
};

const RISK_COLORS: Record<string, string> = {
  Low: "text-emerald-700",
  Watch: "text-amber-700",
  Elevated: "text-orange-700",
  Critical: "text-red-700 font-semibold",
};

function StatBox({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div className="rounded-lg border p-2.5 text-center">
      <p className={`text-lg font-bold ${accent ?? ""}`}>{value}</p>
      <p className="text-[10px] text-muted-foreground leading-tight">{label}</p>
      {sub && <p className="text-[9px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function fmtMoney(val: number) {
  if (val >= 1000000) return `$${(val / 1000000).toFixed(1)}M`;
  if (val >= 1000) return `$${(val / 1000).toFixed(0)}K`;
  return `$${val.toLocaleString()}`;
}

export default function CoachingAgentPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { id } = useParams<{ id: string }>();
  const agentId = Number(id);
  const [activeTab, setActiveTab] = useState("overview");
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showNewSession, setShowNewSession] = useState(false);
  const [showAllTerminations, setShowAllTerminations] = useState(false);

  // Session form state (must be before early returns to satisfy React hooks rules)
  const [sessionForm, setSessionForm] = useState({
    sessionType: "Standard COACH Session",
    sessionDate: "",
    scheduledCoachId: "",
    durationMinutes: "30",
    meetingLink: "",
    reasonForSession: "",
  });

  const utils = trpc.useUtils();
  const { data, isLoading, refetch } = trpc.coaching.getProfile.useQuery({ agentId });
  const { data: coaches } = trpc.coaching.listCoaches.useQuery();

  const createSession = trpc.coaching.createSession.useMutation({
    onSuccess: () => { toast.success("Session created"); setShowNewSession(false); refetch(); utils.coaching.listSessions.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-amber-500" />
        <p>Agent not found or no coaching profile exists.</p>
        <Button variant="ghost" size="sm" className="mt-4" onClick={() => navigate("/coaching")}>
          <ArrowLeft className="h-4 w-4 mr-2" />Back to Coaching Hub
        </Button>
      </div>
    );
  }

  const { profile, agent, coach, nextCoach, prodStats, goalsData, pipelineData, recentSessions, openCommitments, commitmentStats, activeReset, marketAssignments, assessments, sessionStats, terminatedTransactions } = data as any;

  const closedUnits = prodStats?.closedUnits ?? 0;
  const closedVolume = prodStats?.closedVolume ?? 0;
  const ucUnits = prodStats?.ucUnits ?? 0;
  const ucVolume = prodStats?.ucVolume ?? 0;
  const totalLeads = prodStats?.totalLeads ?? 0;
  const avgLeadAge = prodStats?.avgLeadAge ?? 0;
  const overdueTasks = prodStats?.overdueTasks ?? 0;
  const terminationRate = prodStats?.terminationRate ?? 0;

  // Termination reasons display
  const terminations = terminatedTransactions ?? [];
  const terminationsToShow = showAllTerminations ? terminations : terminations.slice(0, 5);

  return (
    <div className="p-4 sm:p-6 max-w-screen-2xl mx-auto space-y-5">
      {/* Back nav */}
      <Button variant="ghost" size="sm" onClick={() => navigate("/coaching")} className="text-muted-foreground -ml-2">
        <ArrowLeft className="h-4 w-4 mr-1" />Coaching Hub
      </Button>

      {/* ═══ PROFILE HEADER ═══ */}
      <Card className="border-l-4 border-l-primary">
        <CardContent className="p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-xl">
                {(agent?.name ?? "?")[0]}
              </div>
              <div>
                <h1 className="text-lg sm:text-xl font-bold flex items-center gap-2 flex-wrap">
                  {agent?.name ?? "—"}
                  {profile?.performanceStatus && (
                    <Badge className={`text-xs border ${PERF_STATUS_COLORS[profile.performanceStatus] ?? ""}`} variant="outline">
                      {profile.performanceStatus}
                    </Badge>
                  )}
                  {activeReset && <Badge variant="destructive" className="text-[10px]">Active Reset</Badge>}
                </h1>
                <p className="text-sm text-muted-foreground">{agent?.email}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
                  <span><strong>Coach:</strong> {coach?.name ?? <span className="text-red-600">Unassigned</span>}</span>
                  <span><strong>Diagnosis:</strong> {profile?.currentPrimaryDiagnosis ?? "—"}</span>
                  <span><strong>Priority:</strong> {profile?.currentDevelopmentPriority ?? "—"}</span>
                  <span><strong>Retention:</strong> <span className={RISK_COLORS[profile?.retentionRiskStatus] ?? ""}>{profile?.retentionRiskStatus ?? "—"}</span></span>
                  {profile?.performanceStatus === "Launch" && <span><strong>Launch:</strong> {profile?.launchHealthStatus ?? "—"}</span>}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => setShowNewSession(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" />New Session
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowEditProfile(true)}>
                <Edit className="h-3.5 w-3.5 mr-1" />Edit Profile
              </Button>
              <Button size="sm" variant="outline" onClick={() => setActiveTab("ai-insights")}>
                <Brain className="h-3.5 w-3.5 mr-1" />AI Insights
              </Button>
            </div>
          </div>

          {/* Coaching session summary */}
          <div className="mt-4 flex flex-wrap gap-4 rounded-lg bg-muted/40 p-3 text-xs">
            <div><span className="text-muted-foreground">Last coached by:</span> <strong>{sessionStats?.lastCoachName ?? "—"}</strong> on <strong>{sessionStats?.lastSessionDate ? safeFormat(sessionStats.lastSessionDate, "MMM d, yyyy") : "—"}</strong></div>
            <div><span className="text-muted-foreground">Next session with:</span> <strong>{nextCoach?.name ?? "—"}</strong> on <strong>{profile?.nextSessionDate ? safeFormatET(profile.nextSessionDate, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : <span className="text-red-600">Not scheduled</span>}</strong></div>
            <div><span className="text-muted-foreground">Total sessions:</span> <strong>{sessionStats?.totalSessions ?? 0}</strong></div>
          </div>

          {/* Quick stats row */}
          <div className="mt-4 grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-8 gap-2">
            <StatBox label="Closed Units (90d)" value={closedUnits} accent="text-emerald-700" />
            <StatBox label="Closed Volume" value={closedVolume > 0 ? fmtMoney(closedVolume) : "$0"} />
            <StatBox label="UC Units" value={ucUnits} accent="text-blue-700" />
            <StatBox label="UC Volume" value={ucVolume > 0 ? fmtMoney(ucVolume) : "$0"} />
            <StatBox label="Leads" value={totalLeads} />
            <StatBox label="Avg Lead Age" value={`${avgLeadAge}d`} accent={avgLeadAge > 30 ? "text-red-600" : ""} />
            <StatBox label="Overdue Tasks" value={overdueTasks} accent={overdueTasks > 5 ? "text-red-600" : ""} />
            <StatBox label="Term Rate" value={`${terminationRate}%`} accent={terminationRate > 20 ? "text-red-600" : ""} />
          </div>

          {/* Goals warning */}
          {(!goalsData || !goalsData.annualGoal) && (
            <div className="mt-3 rounded-lg bg-red-50 border border-red-200 p-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-xs font-semibold text-red-800">Goal setup required</p>
                <p className="text-[10px] text-red-700">This agent does not have goals entered in SavvyOS.</p>
              </div>
              <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => navigate(`/goals`)}>
                <ExternalLink className="h-3 w-3 mr-1" />Set Goals
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══ TABS ═══ */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex overflow-x-auto h-auto gap-0 bg-transparent p-0 border-b rounded-none" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
          {[
            { id: "overview", label: "Overview", icon: BarChart3 },
            { id: "ai-insights", label: "AI Insights", icon: Brain },
            { id: "performance", label: "Performance", icon: TrendingUp },
            { id: "goals", label: "Goals", icon: Target },
            { id: "pipeline", label: "Pipeline & Leads", icon: Activity },
            { id: "history", label: "Coaching History", icon: Clock },
            { id: "commitments", label: "Commitments", icon: ListChecks, count: openCommitments?.length },
            { id: "assessments", label: "Assessments", icon: FileText },
            { id: "reset", label: "Perf. Reset", icon: Shield, active: !!activeReset },
            { id: "market", label: "Market", icon: MapPin },
            { id: "files", label: "Files", icon: FolderOpen },
          ].map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id} className="flex items-center gap-1.5 shrink-0 rounded-none border-b-2 border-transparent px-3 py-2 text-xs font-medium whitespace-nowrap data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none">
              <tab.icon className="h-3.5 w-3.5 shrink-0" />
              {tab.label}
              {(tab as any).count > 0 && <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary/10 px-1 text-[9px] font-bold text-primary">{(tab as any).count}</span>}
              {(tab as any).active && <span className="ml-1 h-2 w-2 rounded-full bg-red-500" />}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ─── OVERVIEW ─── */}
        <TabsContent value="overview" className="mt-4 space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Production Summary */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><DollarSign className="h-4 w-4" />Production Summary</CardTitle></CardHeader>
              <CardContent>
                <Table><TableBody>
                  <TableRow><TableCell className="text-xs font-medium">Closed Units (Trailing 90d)</TableCell><TableCell className="text-xs text-right font-semibold text-emerald-700">{closedUnits}</TableCell></TableRow>
                  <TableRow><TableCell className="text-xs font-medium">Closed Volume (Trailing 90d)</TableCell><TableCell className="text-xs text-right">{fmtMoney(closedVolume)}</TableCell></TableRow>
                  <TableRow><TableCell className="text-xs font-medium">Under-Contract Units</TableCell><TableCell className="text-xs text-right text-blue-700">{ucUnits}</TableCell></TableRow>
                  <TableRow><TableCell className="text-xs font-medium">Under-Contract Volume</TableCell><TableCell className="text-xs text-right">{fmtMoney(ucVolume)}</TableCell></TableRow>
                  <TableRow><TableCell className="text-xs font-medium">Buyer Deals</TableCell><TableCell className="text-xs text-right">{prodStats?.buyerCount ?? 0}</TableCell></TableRow>
                  <TableRow><TableCell className="text-xs font-medium">Seller Deals</TableCell><TableCell className="text-xs text-right">{prodStats?.sellerCount ?? 0}</TableCell></TableRow>
                  <TableRow><TableCell className="text-xs font-medium">Dual Deals</TableCell><TableCell className="text-xs text-right">{prodStats?.dualCount ?? 0}</TableCell></TableRow>
                  <TableRow><TableCell className="text-xs font-medium">Termination Rate</TableCell><TableCell className="text-xs text-right">{terminationRate}%</TableCell></TableRow>
                  <TableRow><TableCell className="text-xs font-medium">Avg Commission Rate</TableCell><TableCell className="text-xs text-right">{prodStats?.avgCommissionRate ?? "—"}%</TableCell></TableRow>
                </TableBody></Table>
              </CardContent>
            </Card>

            {/* Deal Status Mix */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="h-4 w-4" />Deal Status Mix</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {/* Visual bar chart */}
                  {(() => {
                    const closed = prodStats?.buyerClosedCount + prodStats?.sellerClosedCount + prodStats?.dualClosedCount || 0;
                    const uc = prodStats?.ucUnits ?? 0;
                    const terminated = prodStats?.terminatedCount ?? 0;
                    const total = closed + uc + terminated || 1;
                    return (
                      <div className="space-y-2">
                        <div className="flex h-6 rounded-md overflow-hidden">
                          {closed > 0 && <div className="bg-emerald-500 flex items-center justify-center text-white text-[10px] font-bold" style={{ width: `${(closed / total) * 100}%` }}>{closed}</div>}
                          {uc > 0 && <div className="bg-blue-500 flex items-center justify-center text-white text-[10px] font-bold" style={{ width: `${(uc / total) * 100}%` }}>{uc}</div>}
                          {terminated > 0 && <div className="bg-red-400 flex items-center justify-center text-white text-[10px] font-bold" style={{ width: `${(terminated / total) * 100}%` }}>{terminated}</div>}
                        </div>
                        <div className="flex gap-4 text-[10px]">
                          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />Closed ({closed})</span>
                          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-blue-500" />Under Contract ({uc})</span>
                          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-red-400" />Terminated ({terminated})</span>
                        </div>
                      </div>
                    );
                  })()}
                  {/* Buyer vs Seller breakdown */}
                  <div className="mt-3 pt-3 border-t">
                    <p className="text-[10px] font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Closed Deal Breakdown</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <StatBox label="Buyer Closed" value={prodStats?.buyerClosedCount ?? 0} accent="text-blue-700" />
                      <StatBox label="Seller Closed" value={prodStats?.sellerClosedCount ?? 0} accent="text-purple-700" />
                      <StatBox label="Dual Closed" value={prodStats?.dualClosedCount ?? 0} accent="text-amber-700" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Listings Overview */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Home className="h-4 w-4" />Listings</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
                  <StatBox label="Active Listings" value={prodStats?.activeListings ?? 0} accent="text-emerald-700" />
                  <StatBox label="Under Contract" value={prodStats?.ucListings ?? 0} accent="text-blue-700" />
                  <StatBox label="Sold (Closed)" value={prodStats?.soldListings ?? 0} />
                  <StatBox label="Terminated" value={prodStats?.terminatedListings ?? 0} accent={prodStats?.terminatedListings > 0 ? "text-red-600" : ""} />
                  <StatBox label="Expired" value={prodStats?.expiredListings ?? 0} accent={prodStats?.expiredListings > 0 ? "text-amber-600" : ""} />
                  <StatBox label="Total Listings" value={prodStats?.totalListings ?? 0} />
                </div>
                {(prodStats?.terminatedListings > 0 || prodStats?.expiredListings > 0) && (
                  <div className="rounded-md bg-amber-50 border border-amber-200 p-2 text-[10px] text-amber-800">
                    <strong>{(prodStats?.terminatedListings ?? 0) + (prodStats?.expiredListings ?? 0)}</strong> listing(s) did not sell (terminated or expired)
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Pipeline & Leads */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Activity className="h-4 w-4" />Pipeline & Leads</CardTitle></CardHeader>
              <CardContent>
                <Table><TableBody>
                  <TableRow><TableCell className="text-xs font-medium">Total Leads</TableCell><TableCell className="text-xs text-right">{totalLeads}</TableCell></TableRow>
                  <TableRow><TableCell className="text-xs font-medium">Average Lead Age</TableCell><TableCell className="text-xs text-right">{avgLeadAge} days</TableCell></TableRow>
                  <TableRow><TableCell className="text-xs font-medium">Overdue Tasks</TableCell><TableCell className="text-xs text-right">{overdueTasks}</TableCell></TableRow>
                  <TableRow><TableCell className="text-xs font-medium">Open Tasks</TableCell><TableCell className="text-xs text-right">{prodStats?.openTasks ?? 0}</TableCell></TableRow>
                  {pipelineData?.pipelineByStatus && Object.entries(pipelineData.pipelineByStatus).map(([status, count]: [string, any]) => (
                    <TableRow key={status}><TableCell className="text-xs font-medium">Pipeline: {status}</TableCell><TableCell className="text-xs text-right">{count}</TableCell></TableRow>
                  ))}
                </TableBody></Table>
              </CardContent>
            </Card>

            {/* Goals */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Target className="h-4 w-4" />Goals</CardTitle></CardHeader>
              <CardContent>
                {goalsData?.annualGoal ? (
                  <Table><TableBody>
                    <TableRow><TableCell className="text-xs font-medium">Annual Goal</TableCell><TableCell className="text-xs text-right">{goalsData.annualGoal.targetUnits ?? "—"} units / {fmtMoney(Number(goalsData.annualGoal.targetVolume ?? 0))}</TableCell></TableRow>
                    <TableRow><TableCell className="text-xs font-medium">YTD Closed</TableCell><TableCell className="text-xs text-right">{goalsData.ytdClosed ?? 0} units</TableCell></TableRow>
                    <TableRow><TableCell className="text-xs font-medium">Progress</TableCell><TableCell className="text-xs text-right">{goalsData.progressPct ?? 0}%</TableCell></TableRow>
                    <TableRow><TableCell className="text-xs font-medium">On Pace?</TableCell><TableCell className="text-xs text-right">{goalsData.onPace ? <span className="text-emerald-700">Yes</span> : <span className="text-red-600">Behind</span>}</TableCell></TableRow>
                  </TableBody></Table>
                ) : (
                  <div className="text-center py-6 text-muted-foreground"><Target className="h-6 w-6 mx-auto mb-1 opacity-40" /><p className="text-xs">No goals configured</p></div>
                )}
              </CardContent>
            </Card>

            {/* Recent Sessions */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><CalendarDays className="h-4 w-4" />Recent Sessions</CardTitle></CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                {(recentSessions ?? []).length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground"><CalendarDays className="h-6 w-6 mx-auto mb-1 opacity-40" /><p className="text-xs">No coaching sessions recorded</p></div>
                ) : (
                  <Table><TableHeader><TableRow><TableHead className="text-[10px]">Date</TableHead><TableHead className="text-[10px]">Coach</TableHead><TableHead className="text-[10px]">Type</TableHead><TableHead className="text-[10px]">Status</TableHead></TableRow></TableHeader>
                  <TableBody>{(recentSessions ?? []).slice(0, 5).map((s: any) => (
                    <TableRow key={s.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/coaching/session/${s.id}`)}>
                      <TableCell className="text-xs">{safeFormat(s.sessionDate, "MMM d")}</TableCell>
                      <TableCell className="text-xs">{s.actualCoachName ?? s.scheduledCoachName ?? "—"}</TableCell>
                      <TableCell className="text-xs">{s.sessionType ?? "—"}</TableCell>
                      <TableCell><Badge variant={s.status === "Completed" ? "default" : "secondary"} className="text-[10px]">{s.status}</Badge></TableCell>
                    </TableRow>
                  ))}</TableBody></Table>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ─── AI INSIGHTS ─── */}
        <TabsContent value="ai-insights" className="mt-4">
          <CoachingAIInsightsTab agentId={agentId} profile={profile} onRefresh={refetch} />
        </TabsContent>

        {/* ─── PERFORMANCE ─── */}
        <TabsContent value="performance" className="mt-4 space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Production Details */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Production Details</CardTitle></CardHeader>
              <CardContent><Table><TableBody>
                <TableRow><TableCell className="text-xs font-medium">Closed Units (Trailing 90d)</TableCell><TableCell className="text-xs text-right font-semibold">{closedUnits}</TableCell></TableRow>
                <TableRow><TableCell className="text-xs font-medium">Closed Volume (Trailing 90d)</TableCell><TableCell className="text-xs text-right">{fmtMoney(closedVolume)}</TableCell></TableRow>
                <TableRow><TableCell className="text-xs font-medium">Under-Contract Units</TableCell><TableCell className="text-xs text-right">{ucUnits}</TableCell></TableRow>
                <TableRow><TableCell className="text-xs font-medium">Under-Contract Volume</TableCell><TableCell className="text-xs text-right">{fmtMoney(ucVolume)}</TableCell></TableRow>
                <TableRow><TableCell className="text-xs font-medium">Buyer Transactions (All)</TableCell><TableCell className="text-xs text-right">{prodStats?.buyerCount ?? 0}</TableCell></TableRow>
                <TableRow><TableCell className="text-xs font-medium">Seller Transactions (All)</TableCell><TableCell className="text-xs text-right">{prodStats?.sellerCount ?? 0}</TableCell></TableRow>
                <TableRow><TableCell className="text-xs font-medium">Dual Transactions (All)</TableCell><TableCell className="text-xs text-right">{prodStats?.dualCount ?? 0}</TableCell></TableRow>
                <TableRow><TableCell className="text-xs font-medium">Avg Purchase Price (Closed)</TableCell><TableCell className="text-xs text-right">{fmtMoney(prodStats?.avgPurchasePrice ?? 0)}</TableCell></TableRow>
                <TableRow><TableCell className="text-xs font-medium">Avg Buyer Price</TableCell><TableCell className="text-xs text-right">{fmtMoney(prodStats?.avgBuyerPrice ?? 0)}</TableCell></TableRow>
                <TableRow><TableCell className="text-xs font-medium">Avg Seller Price</TableCell><TableCell className="text-xs text-right">{fmtMoney(prodStats?.avgSellerPrice ?? 0)}</TableCell></TableRow>
                <TableRow><TableCell className="text-xs font-medium">Avg Commission Rate</TableCell><TableCell className="text-xs text-right">{prodStats?.avgCommissionRate ?? "—"}%</TableCell></TableRow>
                <TableRow><TableCell className="text-xs font-medium">Annualized Pace</TableCell><TableCell className="text-xs text-right">{prodStats?.annualizedPace ?? "—"} units</TableCell></TableRow>
                <TableRow><TableCell className="text-xs font-medium">YTD Closed Units</TableCell><TableCell className="text-xs text-right">{prodStats?.ytdUnits ?? 0}</TableCell></TableRow>
                <TableRow><TableCell className="text-xs font-medium">YTD Volume</TableCell><TableCell className="text-xs text-right">{fmtMoney(prodStats?.ytdVolume ?? 0)}</TableCell></TableRow>
                <TableRow><TableCell className="text-xs font-medium">YTD GCI</TableCell><TableCell className="text-xs text-right">{fmtMoney(prodStats?.ytdGCI ?? 0)}</TableCell></TableRow>
              </TableBody></Table></CardContent>
            </Card>

            {/* Terminations */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><XCircle className="h-4 w-4 text-red-500" />Terminations</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
                  <StatBox label="Terminated" value={prodStats?.terminatedCount ?? 0} accent="text-red-600" />
                  <StatBox label="Term Rate" value={`${terminationRate}%`} accent={terminationRate > 20 ? "text-red-600" : ""} />
                  <StatBox label="Lost Volume" value={fmtMoney(prodStats?.terminatedVolume ?? 0)} accent="text-red-600" />
                </div>

                {/* Recent termination reasons */}
                {terminations.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Recent Termination Reasons</p>
                    <div className="space-y-1.5 max-h-64 overflow-y-auto">
                      {terminationsToShow.map((t: any) => (
                        <div key={t.id} className="rounded-md border p-2 text-xs">
                          <div className="flex justify-between items-start gap-2">
                            <span className="font-medium text-red-700">{t.terminationReason || "No reason provided"}</span>
                            <span className="text-[10px] text-muted-foreground whitespace-nowrap">{t.closingDate ? safeFormat(t.closingDate, "MMM d, yyyy") : "—"}</span>
                          </div>
                          <div className="flex gap-3 mt-1 text-[10px] text-muted-foreground">
                            <span>{fmtMoney(Number(t.purchasePrice ?? 0))}</span>
                            <Badge variant="outline" className="text-[9px] h-4">{t.transactionType}</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                    {terminations.length > 5 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full text-xs h-7"
                        onClick={() => setShowAllTerminations(!showAllTerminations)}
                      >
                        {showAllTerminations ? (
                          <><ChevronUp className="h-3 w-3 mr-1" />Show Less</>
                        ) : (
                          <><ChevronDown className="h-3 w-3 mr-1" />Show All {terminations.length} Terminations</>
                        )}
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-4 text-muted-foreground">
                    <CheckCircle2 className="h-5 w-5 mx-auto mb-1 text-emerald-500" />
                    <p className="text-xs">No terminated transactions</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Commission Benchmarking */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2"><CardTitle className="text-sm">Commission Benchmarking</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <StatBox label="Agent Avg Rate" value={`${prodStats?.avgCommissionRate ?? "—"}%`} />
                  <StatBox label="Savvy Avg" value={`${prodStats?.companyAvgRate ?? "—"}%`} />
                  <StatBox label="Savvy Median" value={`${prodStats?.companyMedianRate ?? "—"}%`} />
                  <StatBox label="Difference" value={prodStats?.avgCommissionRate && prodStats?.companyAvgRate ? `${(prodStats.avgCommissionRate - prodStats.companyAvgRate).toFixed(2)}%` : "—"} accent={prodStats?.avgCommissionRate < prodStats?.companyAvgRate ? "text-red-600" : "text-emerald-700"} />
                </div>
              </CardContent>
            </Card>

            {/* Listings Performance */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Home className="h-4 w-4" />Listings Performance</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <StatBox label="Active Listings" value={prodStats?.activeListings ?? 0} accent="text-emerald-700" />
                  <StatBox label="Under Contract" value={prodStats?.ucListings ?? 0} accent="text-blue-700" />
                  <StatBox label="Sold (Closed)" value={prodStats?.soldListings ?? 0} />
                  <StatBox label="Terminated" value={prodStats?.terminatedListings ?? 0} accent={prodStats?.terminatedListings > 0 ? "text-red-600" : ""} />
                  <StatBox label="Expired" value={prodStats?.expiredListings ?? 0} accent={prodStats?.expiredListings > 0 ? "text-amber-600" : ""} />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ─── GOALS ─── */}
        <TabsContent value="goals" className="mt-4 space-y-4">
          {goalsData?.annualGoal ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Annual Goal</CardTitle></CardHeader>
                <CardContent><Table><TableBody>
                  <TableRow><TableCell className="text-xs font-medium">Target Units</TableCell><TableCell className="text-xs text-right">{goalsData.annualGoal.targetUnits ?? "—"}</TableCell></TableRow>
                  <TableRow><TableCell className="text-xs font-medium">Target Volume</TableCell><TableCell className="text-xs text-right">{fmtMoney(Number(goalsData.annualGoal.targetVolume ?? 0))}</TableCell></TableRow>
                  <TableRow><TableCell className="text-xs font-medium">YTD Closed</TableCell><TableCell className="text-xs text-right">{goalsData.ytdClosed ?? 0} units</TableCell></TableRow>
                  <TableRow><TableCell className="text-xs font-medium">Progress</TableCell><TableCell className="text-xs text-right">{goalsData.progressPct ?? 0}%</TableCell></TableRow>
                  <TableRow><TableCell className="text-xs font-medium">On Pace</TableCell><TableCell className="text-xs text-right">{goalsData.onPace ? <span className="text-emerald-700">Yes</span> : <span className="text-red-600">Behind Pace</span>}</TableCell></TableRow>
                </TableBody></Table></CardContent>
              </Card>
              {goalsData.monthlyGoals && goalsData.monthlyGoals.length > 0 && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Monthly Goals</CardTitle></CardHeader>
                  <CardContent className="p-0 overflow-x-auto"><Table><TableHeader><TableRow><TableHead className="text-[10px]">Month</TableHead><TableHead className="text-[10px]">Target</TableHead><TableHead className="text-[10px]">Actual</TableHead><TableHead className="text-[10px]">Status</TableHead></TableRow></TableHeader>
                  <TableBody>{goalsData.monthlyGoals.map((g: any, i: number) => (
                    <TableRow key={i}><TableCell className="text-xs">{g.month ?? `Month ${i + 1}`}</TableCell><TableCell className="text-xs">{g.targetUnits ?? "—"}</TableCell><TableCell className="text-xs">{g.actualUnits ?? 0}</TableCell><TableCell className="text-xs">{(g.actualUnits ?? 0) >= (g.targetUnits ?? 0) ? <span className="text-emerald-700">Met</span> : <span className="text-amber-600">Behind</span>}</TableCell></TableRow>
                  ))}</TableBody></Table></CardContent>
                </Card>
              )}
            </div>
          ) : (
            <Card><CardContent className="py-12 text-center"><Target className="h-8 w-8 mx-auto mb-2 text-red-400" /><p className="font-semibold text-red-700">Goal setup required</p><p className="text-xs text-muted-foreground mt-1">This agent does not have goals configured in SavvyOS.</p><Button size="sm" variant="outline" className="mt-3" onClick={() => navigate("/goals")}><ExternalLink className="h-3.5 w-3.5 mr-1" />Go to Goals</Button></CardContent></Card>
          )}
        </TabsContent>

        {/* ─── PIPELINE & LEADS ─── */}
        <TabsContent value="pipeline" className="mt-4 space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Pipeline by Stage</CardTitle></CardHeader>
              <CardContent>
                {pipelineData?.pipelineByStatus && Object.keys(pipelineData.pipelineByStatus).length > 0 ? (
                  <Table><TableHeader><TableRow><TableHead className="text-[10px]">Stage</TableHead><TableHead className="text-[10px] text-right">Count</TableHead></TableRow></TableHeader>
                  <TableBody>{Object.entries(pipelineData.pipelineByStatus).map(([status, count]: [string, any]) => (
                    <TableRow key={status}><TableCell className="text-xs font-medium">{status}</TableCell><TableCell className="text-xs text-right">{count}</TableCell></TableRow>
                  ))}</TableBody></Table>
                ) : (<div className="text-center py-6 text-muted-foreground"><Activity className="h-6 w-6 mx-auto mb-1 opacity-40" /><p className="text-xs">No pipeline data</p></div>)}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Lead Metrics</CardTitle></CardHeader>
              <CardContent><Table><TableBody>
                <TableRow><TableCell className="text-xs font-medium">Total Leads</TableCell><TableCell className="text-xs text-right">{totalLeads}</TableCell></TableRow>
                <TableRow><TableCell className="text-xs font-medium">Average Lead Age</TableCell><TableCell className="text-xs text-right">{avgLeadAge} days</TableCell></TableRow>
                <TableRow><TableCell className="text-xs font-medium">Leads 0-7 days</TableCell><TableCell className="text-xs text-right">{prodStats?.leads0to7 ?? "—"}</TableCell></TableRow>
                <TableRow><TableCell className="text-xs font-medium">Leads 8-30 days</TableCell><TableCell className="text-xs text-right">{prodStats?.leads8to30 ?? "—"}</TableCell></TableRow>
                <TableRow><TableCell className="text-xs font-medium">Leads 31-90 days</TableCell><TableCell className="text-xs text-right">{prodStats?.leads31to90 ?? "—"}</TableCell></TableRow>
                <TableRow><TableCell className="text-xs font-medium">Leads 90+ days</TableCell><TableCell className="text-xs text-right">{prodStats?.leads90plus ?? "—"}</TableCell></TableRow>
              </TableBody></Table></CardContent>
            </Card>
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2"><CardTitle className="text-sm">Tasks & Execution</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <StatBox label="Open Tasks" value={prodStats?.openTasks ?? 0} />
                  <StatBox label="Overdue Tasks" value={overdueTasks} accent={overdueTasks > 5 ? "text-red-600" : ""} />
                  <StatBox label="Tasks Due Today" value={prodStats?.tasksDueToday ?? 0} />
                  <StatBox label="Completed (30d)" value={prodStats?.tasksCompleted30d ?? 0} />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ─── COACHING HISTORY ─── */}
        <TabsContent value="history" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between"><CardTitle className="text-sm">Full Coaching History</CardTitle><Button size="sm" onClick={() => setShowNewSession(true)}><Plus className="h-3.5 w-3.5 mr-1" />New Session</Button></div>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              {(recentSessions ?? []).length === 0 ? (
                <div className="text-center py-12 text-muted-foreground"><CalendarDays className="h-8 w-8 mx-auto mb-2 opacity-40" /><p className="text-sm">No coaching sessions recorded</p></div>
              ) : (
                <div className="overflow-x-auto"><Table><TableHeader><TableRow>
                  <TableHead className="text-[10px]">Date</TableHead><TableHead className="text-[10px]">Scheduled Coach</TableHead><TableHead className="text-[10px]">Actual Coach</TableHead><TableHead className="text-[10px]">Type</TableHead><TableHead className="text-[10px]">Duration</TableHead><TableHead className="text-[10px]">Status</TableHead><TableHead className="text-[10px]">Summary</TableHead><TableHead className="text-[10px]">Recording</TableHead><TableHead className="w-8"></TableHead>
                </TableRow></TableHeader>
                <TableBody>{(recentSessions ?? []).map((s: any) => (
                  <TableRow key={s.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/coaching/session/${s.id}`)}>
                    <TableCell className="text-xs">{safeFormat(s.sessionDate, "MMM d, yyyy")}</TableCell>
                    <TableCell className="text-xs">{s.scheduledCoachName ?? "—"}</TableCell>
                    <TableCell className="text-xs">{s.actualCoachName ?? "—"}</TableCell>
                    <TableCell className="text-xs">{s.sessionType ?? "—"}</TableCell>
                    <TableCell className="text-xs">{s.durationMinutes ? `${s.durationMinutes}m` : "—"}</TableCell>
                    <TableCell><Badge variant={s.status === "Completed" ? "default" : "secondary"} className="text-[10px]">{s.status}</Badge></TableCell>
                    <TableCell className="text-xs">{s.aiSummary ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : "—"}</TableCell>
                    <TableCell className="text-xs">{s.recordingUrl ? <Mic className="h-3.5 w-3.5 text-blue-600" /> : "—"}</TableCell>
                    <TableCell><ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /></TableCell>
                  </TableRow>
                ))}</TableBody></Table></div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── COMMITMENTS ─── */}
        <TabsContent value="commitments" className="mt-4"><CoachingCommitmentsPanel agentId={agentId} /></TabsContent>

        {/* ─── ASSESSMENTS ─── */}
        <TabsContent value="assessments" className="mt-4"><CoachingAssessmentsPanel agentId={agentId} /></TabsContent>

        {/* ─── PERFORMANCE RESET ─── */}
        <TabsContent value="reset" className="mt-4"><CoachingPerformanceResetPanel agentId={agentId} /></TabsContent>

        {/* ─── MARKET ─── */}
        <TabsContent value="market" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><MapPin className="h-4 w-4" />Market Assignments</CardTitle></CardHeader>
            <CardContent>
              {(marketAssignments ?? []).length === 0 ? (
                <div className="text-center py-8 text-muted-foreground"><MapPin className="h-6 w-6 mx-auto mb-1 opacity-40" /><p className="text-xs">No market assignments found</p></div>
              ) : (
                <Table><TableHeader><TableRow><TableHead className="text-[10px]">Market</TableHead><TableHead className="text-[10px]">Role</TableHead><TableHead className="text-[10px]">Status</TableHead></TableRow></TableHeader>
                <TableBody>{(marketAssignments ?? []).map((m: any, i: number) => (
                  <TableRow key={i}><TableCell className="text-xs font-medium">{m.market?.name ?? "—"}</TableCell><TableCell className="text-xs">{m.assignment?.role ?? "—"}</TableCell><TableCell className="text-xs">{m.market?.status ?? "Active"}</TableCell></TableRow>
                ))}</TableBody></Table>
              )}
            </CardContent>
          </Card>
          {profile?.marketProtectionStatus && <Card><CardContent className="p-4"><p className="text-xs"><strong>Market Protection Status:</strong> {profile.marketProtectionStatus}</p></CardContent></Card>}
        </TabsContent>

        {/* ─── FILES ─── */}
        <TabsContent value="files" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between"><CardTitle className="text-sm flex items-center gap-2"><FolderOpen className="h-4 w-4" />Files & Recordings</CardTitle><Button size="sm" variant="outline"><Upload className="h-3.5 w-3.5 mr-1" />Upload File</Button></div>
              <CardDescription className="text-xs">Assessment reports, coaching recordings, transcripts, and uploaded documents</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex min-h-32 flex-col items-center justify-center rounded-lg border border-dashed bg-muted/20 px-5 text-center">
                <FolderOpen className="h-8 w-8 text-muted-foreground/40 mb-2" />
                <p className="font-medium text-sm">No files uploaded yet</p>
                <p className="mt-1 text-xs text-muted-foreground">Upload assessment reports, coaching recordings, or other documents.</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ═══ DIALOGS ═══ */}
      {showEditProfile && (
        <CoachingProfileEditDialog
          agentId={agentId}
          profile={profile}
          coaches={coaches ?? []}
          open={showEditProfile}
          onClose={() => setShowEditProfile(false)}
          onSaved={() => { setShowEditProfile(false); refetch(); }}
        />
      )}

      <Dialog open={showNewSession} onOpenChange={setShowNewSession}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New Coaching Session</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><label className="text-xs font-medium">Session Type</label>
              <Select value={sessionForm.sessionType} onValueChange={(v) => setSessionForm({ ...sessionForm, sessionType: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Standard COACH Session","Pipeline and Performance Session","Sales Capability Session","Culture and Accountability Session","New-Agent Launch Session","30-Day Launch Review","60-Day Launch Review","90-Day Launch Review","Performance Reset Session","Performance Reset Checkpoint","Productive-Agent Strategy Session","Stay and Retention Conversation","Specialist Intervention","Market-Coverage Conversation","Coach-Out Conversation","Tyler Strategy Session","Custom Coaching Session"].map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div><label className="text-xs font-medium">Session Date & Time</label><Input type="datetime-local" value={sessionForm.sessionDate} onChange={(e) => setSessionForm({ ...sessionForm, sessionDate: e.target.value })} className="mt-1" /></div>
            <div><label className="text-xs font-medium">Session Coach</label>
              <Select value={sessionForm.scheduledCoachId} onValueChange={(v) => setSessionForm({ ...sessionForm, scheduledCoachId: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select coach..." /></SelectTrigger>
                <SelectContent>{(coaches ?? []).map((c: any) => (<SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>))}</SelectContent>
              </Select>
            </div>
            <div><label className="text-xs font-medium">Duration (minutes)</label><Input type="number" value={sessionForm.durationMinutes} onChange={(e) => setSessionForm({ ...sessionForm, durationMinutes: e.target.value })} className="mt-1" /></div>
            <div><label className="text-xs font-medium">Meeting Link (optional)</label><Input value={sessionForm.meetingLink} onChange={(e) => setSessionForm({ ...sessionForm, meetingLink: e.target.value })} placeholder="https://..." className="mt-1" /></div>
            <div><label className="text-xs font-medium">Reason (optional)</label><Textarea value={sessionForm.reasonForSession} onChange={(e) => setSessionForm({ ...sessionForm, reasonForSession: e.target.value })} placeholder="Why is this session needed?" className="mt-1" rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewSession(false)}>Cancel</Button>
            <Button onClick={() => createSession.mutate({ agentId, sessionType: sessionForm.sessionType, sessionDate: sessionForm.sessionDate ? new Date(sessionForm.sessionDate).toISOString() : new Date().toISOString(), scheduledCoachId: sessionForm.scheduledCoachId ? Number(sessionForm.scheduledCoachId) : undefined, meetingLink: sessionForm.meetingLink || undefined, reasonForSession: sessionForm.reasonForSession || undefined })} disabled={createSession.isPending}>
              {createSession.isPending ? "Creating..." : "Create Session"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
