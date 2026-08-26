import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Brain,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  ClipboardList,
  FileText,
  ListChecks,
  Loader2,
  Play,
  RefreshCw,
  Save,
  Sparkles,
  Square,
  Target,
  TrendingUp,
  Upload,
  UsersRound,
  X,
} from "lucide-react";
import { safeFormat } from "@/lib/safeFormat";
import { toast } from "sonner";

const STATUS_COLORS: Record<string, string> = {
  Scheduled: "bg-blue-100 text-blue-700",
  "In Progress": "bg-amber-100 text-amber-700",
  Completed: "bg-emerald-100 text-emerald-700",
  Canceled: "bg-gray-100 text-gray-500",
  "No Show": "bg-red-100 text-red-700",
};

const STAGE_ORDER = ["Prepare", "Conduct", "Follow-up", "AI Process", "Review", "Commit", "Schedule Next"] as const;
type Stage = typeof STAGE_ORDER[number];
type Diagnosis = "Commitment" | "Capability" | "Cadence" | "Capacity";

function getStageFromSession(session: any): Stage {
  if (!session) return "Prepare";
  // Commitment review remains visible even after the narrative summary is approved.
  if (session.status === "Completed" && session.aiSummary && session.aiRecommendedCommitments) return "Commit";
  if (session.status === "Completed" && session.isSummaryApproved) return "Schedule Next";
  if (session.status === "Completed" && session.aiSummary) return "Review";
  if (session.aiProcessingStatus === "Completed") return "Review";
  if (session.aiProcessingStatus === "Processing" || session.aiProcessingStatus === "Failed") return "AI Process";
  if (session.status === "Completed") return "Follow-up";
  if (session.status === "In Progress" || session.preparationStatus === "Ready") return "Conduct";
  return "Prepare";
}

function parseJson(value?: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function formatCurrency(value: unknown) {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatCount(value: unknown) {
  return new Intl.NumberFormat("en-US").format(Number(value ?? 0));
}

function MetricCard({ label, value, detail, tone = "default" }: { label: string; value: string; detail: string; tone?: "default" | "warning" | "success" }) {
  const tones = {
    default: "border-border bg-card",
    warning: "border-amber-200 bg-amber-50/50",
    success: "border-emerald-200 bg-emerald-50/40",
  };
  return (
    <div className={`rounded-lg border p-3 ${tones[tone]}`}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold tracking-tight">{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{detail}</p>
    </div>
  );
}

function GuideList({ items, ordered = false, emptyText = "No guidance available yet." }: { items?: string[]; ordered?: boolean; emptyText?: string }) {
  if (!items?.length) return <p className="text-xs text-muted-foreground">{emptyText}</p>;
  const Tag = ordered ? "ol" : "ul";
  return (
    <Tag className={`${ordered ? "list-decimal" : "list-disc"} ml-4 space-y-1.5 text-xs leading-relaxed`}>
      {items.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
    </Tag>
  );
}

export default function CoachingSessionPage() {
  const { id } = useParams<{ id: string }>();
  const sessionId = Number(id);
  const [, navigate] = useLocation();
  const { data, isLoading, error, refetch } = trpc.coaching.getSession.useQuery({ sessionId });
  const { data: coaches } = trpc.coaching.listCoaches.useQuery();

  const startSession = trpc.coaching.startSession.useMutation();
  const updateSession = trpc.coaching.updateSession.useMutation();
  const completeSession = trpc.coaching.completeSession.useMutation();
  const generateBrief = trpc.coaching.generatePreSessionBrief.useMutation();
  const generateSummary = trpc.coaching.generateSessionSummary.useMutation();
  const approveSummary = trpc.coaching.approveSessionSummary.useMutation();
  const bulkApprove = trpc.coaching.bulkApproveCommitments.useMutation();
  const bulkDismiss = trpc.coaching.bulkDismissCommitments.useMutation();
  const upsertProfile = trpc.coaching.upsertProfile.useMutation();
  const scheduleNextSession = trpc.coaching.scheduleNextSession.useMutation();

  const [activeStage, setActiveStage] = useState<Stage>("Prepare");
  const [notes, setNotes] = useState("");
  const [transcript, setTranscript] = useState("");
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [selectedCommitments, setSelectedCommitments] = useState<number[]>([]);
  const [profileForm, setProfileForm] = useState({
    performanceStatus: "Launch",
    retentionRiskStatus: "Low",
    currentPrimaryDiagnosis: "" as "" | Diagnosis,
    secondaryDiagnosis: "" as "" | Diagnosis,
    currentDevelopmentPriority: "",
  });
  const [nextSessionForm, setNextSessionForm] = useState({
    nextSessionCoachId: "",
    nextSessionDate: "",
    nextSessionType: "Standard COACH Session",
    noNextSessionReason: "",
  });

  useEffect(() => {
    if (!data) return;
    const currentSession = (data as any).session;
    const profile = (data as any).profile;
    setNotes(currentSession.sourceNotes ?? "");
    setTranscript(currentSession.transcript ?? "");
    setActiveStage(getStageFromSession(currentSession));
    setProfileForm({
      performanceStatus: profile?.performanceStatus ?? "Launch",
      retentionRiskStatus: profile?.retentionRiskStatus ?? "Low",
      currentPrimaryDiagnosis: profile?.currentPrimaryDiagnosis ?? "",
      secondaryDiagnosis: profile?.secondaryDiagnosis ?? "",
      currentDevelopmentPriority: profile?.currentDevelopmentPriority ?? "",
    });
    setNextSessionForm({
      nextSessionCoachId: currentSession.nextSessionCoachId ? String(currentSession.nextSessionCoachId) : "",
      nextSessionDate: currentSession.nextSessionDate ? safeFormat(currentSession.nextSessionDate, "yyyy-MM-dd'T'HH:mm") : "",
      nextSessionType: currentSession.nextSessionType ?? "Standard COACH Session",
      noNextSessionReason: currentSession.noNextSessionReason ?? "",
    });
  }, [data]);

  useEffect(() => {
    if (!data || (data as any).session.status === "Completed") return;
    const savedValue = (data as any).session.sourceNotes ?? "";
    if (notes === savedValue) return;
    const timer = window.setTimeout(() => {
      updateSession.mutate({ sessionId, sourceNotes: notes }, { onError: (err) => toast.error(`Notes could not be saved: ${err.message}`) });
    }, 15000);
    return () => window.clearTimeout(timer);
  }, [notes, data, sessionId]);

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  if (error || !data) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-amber-500" />
        <p>Session not found.</p>
        <Button variant="ghost" size="sm" className="mt-4" onClick={() => navigate("/coaching")}>
          <ArrowLeft className="mr-2 h-4 w-4" />Back
        </Button>
      </div>
    );
  }

  const { session, agent, scheduledCoach, actualCoach, commitments, priorCommitments, profile, productionStats, goalsData, pipelineData, previousSessions, liveCallGuide } = data as any;
  const storedBrief = parseJson(session.aiRecommendedAgenda);
  const storedQuestions = parseJson(session.aiRecommendedQuestions);
  const brief = storedBrief && !Array.isArray(storedBrief) ? storedBrief : liveCallGuide;
  const agenda = Array.isArray(storedBrief) ? storedBrief : (brief?.suggestedAgenda ?? liveCallGuide?.suggestedAgenda ?? []);
  const suggestedQuestions = Array.isArray(storedQuestions) ? storedQuestions : (brief?.suggestedQuestions ?? liveCallGuide?.suggestedQuestions ?? []);
  const aiCommitments = commitments?.filter((commitment: any) => commitment.status === "AI Suggested") ?? [];
  const approvedCommitments = commitments?.filter((commitment: any) => commitment.status !== "AI Suggested") ?? [];
  const overdueCommitments = (priorCommitments ?? []).filter((commitment: any) => commitment.dueDate && new Date(commitment.dueDate).getTime() < Date.now());
  const goalTarget = Number(goalsData?.annualGoal?.closingsTarget ?? 0);
  const ytdClosings = Number(goalsData?.ytdActuals?.ytdClosings ?? 0);
  const goalDetail = goalTarget ? `${ytdClosings} of ${goalTarget} annual closings` : `${ytdClosings} YTD closings; goal not set`;

  const saveProfile = async () => {
    try {
      await upsertProfile.mutateAsync({
        agentId: agent.id,
        performanceStatus: profileForm.performanceStatus as "Launch" | "Red" | "Yellow" | "Green" | "Elite",
        retentionRiskStatus: profileForm.retentionRiskStatus as "Low" | "Watch" | "Elevated" | "Critical",
        currentPrimaryDiagnosis: profileForm.currentPrimaryDiagnosis || null,
        secondaryDiagnosis: profileForm.secondaryDiagnosis || null,
        currentDevelopmentPriority: profileForm.currentDevelopmentPriority || null,
      });
      toast.success("Coaching status updated");
      refetch();
    } catch (err: any) {
      toast.error(err.message ?? "Unable to update coaching status");
    }
  };

  const endLiveCall = async () => {
    try {
      await updateSession.mutateAsync({ sessionId, sourceNotes: notes || null });
      await completeSession.mutateAsync({
        sessionId,
        primaryDiagnosis: profileForm.currentPrimaryDiagnosis || undefined,
        secondaryDiagnosis: profileForm.secondaryDiagnosis || undefined,
      });
      toast.success("Live call ended. Complete the follow-up actions next.");
      setActiveStage("Follow-up");
      refetch();
    } catch (err: any) {
      toast.error(err.message ?? "Unable to end this coaching session");
    }
  };

  const handleGenerateBrief = async () => {
    try {
      const result = await generateBrief.mutateAsync({ sessionId });
      toast.success(result.source === "live_data" ? "Live coaching guide prepared from current SavvyOS data" : "AI coaching guide prepared");
      refetch();
    } catch (err: any) {
      toast.error(err.message ?? "Unable to generate the coaching guide");
    }
  };

  const handleScheduleNext = async () => {
    if (!nextSessionForm.nextSessionDate && !nextSessionForm.noNextSessionReason.trim()) {
      toast.error("Schedule the next session or provide a reason for not scheduling one.");
      return;
    }
    if (nextSessionForm.nextSessionDate && !nextSessionForm.nextSessionCoachId) {
      toast.error("Select the coach for the next session.");
      return;
    }
    try {
      await scheduleNextSession.mutateAsync({
        sessionId,
        nextSessionCoachId: nextSessionForm.nextSessionCoachId ? Number(nextSessionForm.nextSessionCoachId) : null,
        nextSessionDate: nextSessionForm.nextSessionDate ? new Date(nextSessionForm.nextSessionDate).toISOString() : null,
        nextSessionType: nextSessionForm.nextSessionType,
        noNextSessionReason: nextSessionForm.noNextSessionReason.trim() || null,
      });
      toast.success(nextSessionForm.nextSessionDate ? "Next coaching session scheduled" : "Session finalized with scheduling reason saved");
      navigate(`/coaching/agent/${agent?.id}`);
    } catch (err: any) {
      toast.error(err.message ?? "Unable to finalize next-session planning");
    }
  };

  const saveTranscript = async () => {
    try {
      await updateSession.mutateAsync({ sessionId, transcript: transcript || null });
      toast.success("Transcript and notetaker content saved");
      refetch();
    } catch (err: any) {
      toast.error(err.message ?? "Unable to save transcript");
    }
  };

  return (
    <div className="mx-auto max-w-screen-2xl space-y-4 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="sm" className="shrink-0" onClick={() => navigate(agent ? `/coaching/agent/${agent.id}` : "/coaching")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <h1 className="flex flex-wrap items-center gap-2 text-base font-bold sm:text-lg">
              <span className="truncate">Coaching Session — {agent?.name ?? "Agent"}</span>
              <Badge className={`shrink-0 text-[10px] ${STATUS_COLORS[session.status] ?? ""}`}>{session.status}</Badge>
            </h1>
            <p className="truncate text-xs text-muted-foreground">
              {session.sessionType} • {session.sessionDate ? safeFormat(session.sessionDate, "MMMM d, yyyy h:mm a") : "Unscheduled"}
              {scheduledCoach?.name && ` • Coach: ${actualCoach?.name ?? scheduledCoach.name}`}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
          {session.status === "Scheduled" && (
            <Button size="sm" onClick={async () => {
              try {
                await startSession.mutateAsync({ sessionId });
                toast.success("Session started");
                setActiveStage("Conduct");
                refetch();
              } catch (err: any) {
                toast.error(err.message ?? "Unable to start session");
              }
            }} disabled={startSession.isPending}>
              <Play className="mr-1 h-3.5 w-3.5" />{startSession.isPending ? "Starting..." : "Launch Session"}
            </Button>
          )}
          {session.status === "In Progress" && (
            <Button size="sm" variant="destructive" onClick={endLiveCall} disabled={completeSession.isPending || updateSession.isPending}>
              <Square className="mr-1 h-3.5 w-3.5" />End Live Call
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 overflow-x-auto rounded-lg bg-muted/40 p-2" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
        {STAGE_ORDER.map((stage, index) => {
          const stageIndex = STAGE_ORDER.indexOf(activeStage);
          const isActive = stage === activeStage;
          const isCompleted = index < stageIndex;
          return (
            <button key={stage} onClick={() => setActiveStage(stage)} className={`flex-1 whitespace-nowrap rounded-md px-2 py-1.5 text-xs font-medium transition-all ${isActive ? "bg-primary text-primary-foreground shadow-sm" : isCompleted ? "bg-emerald-100 text-emerald-700" : "text-muted-foreground hover:bg-muted"}`}>
              <span className="flex items-center justify-center gap-1">{isCompleted && <Check className="h-3 w-3" />}{isActive && <CircleDot className="h-3 w-3" />}{stage}</span>
            </button>
          );
        })}
      </div>

      {activeStage === "Prepare" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="flex items-center gap-2 text-base font-semibold"><Brain className="h-4 w-4" />Pre-Session Coaching Guide</h2>
              <p className="text-xs text-muted-foreground">Uses current production, pipeline, commitment, and history data to direct the call.</p>
            </div>
            <Button size="sm" variant="outline" onClick={handleGenerateBrief} disabled={generateBrief.isPending}>
              <Sparkles className={`mr-1 h-3.5 w-3.5 ${generateBrief.isPending ? "animate-spin" : ""}`} />
              {generateBrief.isPending ? "Preparing..." : session.preparationStatus === "Ready" ? "Refresh Guide" : "Generate Guide"}
            </Button>
          </div>

          <Card className="border-primary/20 bg-primary/[0.02]">
            <CardContent className="space-y-3 p-4">
              <p className="text-sm leading-relaxed">{brief?.agentSnapshot ?? liveCallGuide?.agentSnapshot}</p>
              <div className="grid gap-3 md:grid-cols-2">
                <div><p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Session agenda</p><GuideList items={agenda} ordered /></div>
                <div><p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Questions to lead with</p><GuideList items={suggestedQuestions} /></div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Previous Session</CardTitle></CardHeader><CardContent><p className="text-xs leading-relaxed">{brief?.lastSessionRecap ?? "No previous session data."}</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Commitment Check</CardTitle></CardHeader><CardContent><p className="text-xs leading-relaxed">{brief?.openCommitmentsReview ?? "No open commitments."}</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-amber-700">Watch For</CardTitle></CardHeader><CardContent><GuideList items={brief?.watchFor ?? liveCallGuide?.watchFor} emptyText="No specific risk flags from current data." /></CardContent></Card>
          </div>

          <div className="flex justify-end">
            <Button onClick={async () => {
              if (session.status === "Scheduled") {
                try { await startSession.mutateAsync({ sessionId }); toast.success("Session started"); } catch (err: any) { toast.error(err.message ?? "Unable to start session"); return; }
              }
              setActiveStage("Conduct");
              refetch();
            }}>
              {session.status === "Scheduled" ? "Launch Session" : "Open Conduct Workspace"}<ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {activeStage === "Conduct" && (
        <div className="space-y-4">
          <Card className="border-primary/25 bg-gradient-to-r from-primary/[0.05] via-card to-card">
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base"><Brain className="h-4 w-4 text-primary" />Live Call Guide</CardTitle>
                  <CardDescription>Use this as the cadence for the coaching conversation. It refreshes from current SavvyOS business data.</CardDescription>
                </div>
                <Badge variant="secondary" className="w-fit text-[10px]">{session.preparationStatus === "Ready" ? "Brief prepared" : "Live-data guidance"}</Badge>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-3">
              <div><p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Call cadence</p><GuideList items={agenda} ordered /></div>
              <div><p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">What to say</p><GuideList items={brief?.talkTracks ?? liveCallGuide?.talkTracks} /></div>
              <div><p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Ask next</p><GuideList items={suggestedQuestions} /></div>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-sm"><TrendingUp className="h-4 w-4" />Business Dashboard</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                <MetricCard label="90-Day Closings" value={formatCount(productionStats?.closedUnits)} detail={formatCurrency(productionStats?.closedVolume)} tone={Number(productionStats?.closedUnits) > 0 ? "success" : "default"} />
                <MetricCard label="Under Contract" value={formatCount(productionStats?.ucUnits)} detail={formatCurrency(productionStats?.ucVolume)} />
                <MetricCard label="Active Listings" value={formatCount(productionStats?.activeListings)} detail={`${formatCount(productionStats?.ucListings)} listing(s) under contract`} />
                <MetricCard label="YTD Goal Pace" value={formatCount(ytdClosings)} detail={goalDetail} tone={goalTarget && ytdClosings >= goalTarget ? "success" : "default"} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-sm"><BarChart3 className="h-4 w-4" />Pipeline Dashboard</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                <MetricCard label="Active Leads" value={formatCount(productionStats?.activeLeads)} detail={`${formatCount(productionStats?.totalLeads)} total connected`} />
                <MetricCard label="New Leads" value={formatCount(productionStats?.newLeads30d)} detail="Created in the last 30 days" tone={Number(productionStats?.newLeads30d) > 0 ? "success" : "default"} />
                <MetricCard label="Stale Leads" value={formatCount(productionStats?.staleLeads)} detail="Active leads without recent movement" tone={Number(productionStats?.staleLeads) > 0 ? "warning" : "default"} />
                <MetricCard label="Overdue Tasks" value={formatCount(productionStats?.overdueTasks)} detail={`${formatCount(productionStats?.openTasks)} open task(s)`} tone={Number(productionStats?.overdueTasks) > 0 ? "warning" : "default"} />
              </CardContent>
              <CardContent className="pt-0"><p className="text-[11px] text-muted-foreground">Pipeline mix: {Object.entries(pipelineData?.pipelineByStatus ?? {}).map(([stage, count]) => `${String(stage).replaceAll("_", " ")}: ${count}`).join(" • ") || "No pipeline stages recorded"}</p></CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-12">
            <div className="space-y-4 xl:col-span-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><ListChecks className="h-4 w-4" />Previous Commitments</CardTitle><CardDescription>{overdueCommitments.length ? `${overdueCommitments.length} overdue — address these early in the call.` : "Use evidence, then reset or close each commitment."}</CardDescription></CardHeader>
                <CardContent className="space-y-2">
                  {priorCommitments?.length ? priorCommitments.slice(0, 8).map((commitment: any) => {
                    const overdue = commitment.dueDate && new Date(commitment.dueDate).getTime() < Date.now();
                    return <div key={commitment.id} className={`rounded-md border p-2 ${overdue ? "border-amber-200 bg-amber-50/50" : ""}`}><div className="flex items-start justify-between gap-2"><p className="text-xs leading-relaxed">{commitment.description}</p><Badge variant="secondary" className="shrink-0 text-[9px]">{commitment.status}</Badge></div><p className={`mt-1 text-[10px] ${overdue ? "text-amber-700" : "text-muted-foreground"}`}>{commitment.dueDate ? `${overdue ? "Overdue" : "Due"} ${safeFormat(commitment.dueDate, "MMM d, yyyy")}` : "No due date"}</p></div>;
                  }) : <p className="py-2 text-xs text-muted-foreground">No open commitments from prior sessions.</p>}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><ClipboardList className="h-4 w-4" />Coaching History</CardTitle><CardDescription>Light recall from previous sessions.</CardDescription></CardHeader>
                <CardContent className="space-y-2">
                  {previousSessions?.length ? previousSessions.map((previous: any) => <div key={previous.id} className="rounded-md border p-2"><div className="flex items-center justify-between gap-2"><p className="text-xs font-medium">{previous.sessionDate ? safeFormat(previous.sessionDate, "MMM d, yyyy") : "Previous session"}</p>{previous.primaryDiagnosis && <Badge variant="outline" className="text-[9px]">{previous.primaryDiagnosis}</Badge>}</div><p className="mt-1 line-clamp-3 text-[11px] leading-relaxed text-muted-foreground">{previous.aiSummary || previous.sourceNotes || "No summary saved."}</p></div>) : <p className="py-2 text-xs text-muted-foreground">No completed coaching sessions yet.</p>}
                </CardContent>
              </Card>
            </div>

            <Card className="xl:col-span-5">
              <CardHeader className="pb-2"><div className="flex items-center justify-between gap-2"><div><CardTitle className="text-sm">Live Session Notes</CardTitle><CardDescription>Private coaching notes auto-save after 15 seconds while the call is open.</CardDescription></div><Button size="sm" variant="outline" onClick={async () => { try { await updateSession.mutateAsync({ sessionId, sourceNotes: notes }); toast.success("Notes saved"); } catch (err: any) { toast.error(err.message ?? "Unable to save notes"); } }} disabled={updateSession.isPending}><Save className="mr-1 h-3 w-3" />Save</Button></div></CardHeader>
              <CardContent><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Capture the agent's stated goals, evidence, obstacles, commitments, and exact next steps..." className="min-h-[520px] resize-y text-sm leading-relaxed" /></CardContent>
            </Card>

            <div className="space-y-4 xl:col-span-3">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><Target className="h-4 w-4" />Coach Updates</CardTitle><CardDescription>Update the agent's coaching context as the conversation reveals new information.</CardDescription></CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1"><Label className="text-[11px]">Performance status</Label><Select value={profileForm.performanceStatus} onValueChange={(value) => setProfileForm((current) => ({ ...current, performanceStatus: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["Launch", "Red", "Yellow", "Green", "Elite"].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-1"><Label className="text-[11px]">Retention risk</Label><Select value={profileForm.retentionRiskStatus} onValueChange={(value) => setProfileForm((current) => ({ ...current, retentionRiskStatus: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["Low", "Watch", "Elevated", "Critical"].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-1"><Label className="text-[11px]">Primary diagnosis</Label><Select value={profileForm.currentPrimaryDiagnosis || "none"} onValueChange={(value) => setProfileForm((current) => ({ ...current, currentPrimaryDiagnosis: value === "none" ? "" : value as Diagnosis }))}><SelectTrigger><SelectValue placeholder="Select diagnosis" /></SelectTrigger><SelectContent><SelectItem value="none">Not set</SelectItem>{(["Commitment", "Capability", "Cadence", "Capacity"] as Diagnosis[]).map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-1"><Label className="text-[11px]">Secondary diagnosis</Label><Select value={profileForm.secondaryDiagnosis || "none"} onValueChange={(value) => setProfileForm((current) => ({ ...current, secondaryDiagnosis: value === "none" ? "" : value as Diagnosis }))}><SelectTrigger><SelectValue placeholder="Select diagnosis" /></SelectTrigger><SelectContent><SelectItem value="none">Not set</SelectItem>{(["Commitment", "Capability", "Cadence", "Capacity"] as Diagnosis[]).map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-1"><Label className="text-[11px]">Current priority</Label><Textarea rows={3} value={profileForm.currentDevelopmentPriority} onChange={(event) => setProfileForm((current) => ({ ...current, currentDevelopmentPriority: event.target.value }))} placeholder="The one development priority to coach..." /></div>
                  <Button size="sm" className="w-full" onClick={saveProfile} disabled={upsertProfile.isPending}>{upsertProfile.isPending ? "Saving..." : "Save Coaching Updates"}</Button>
                </CardContent>
              </Card>
              <Card className="border-amber-200 bg-amber-50/30"><CardContent className="p-3"><p className="text-xs font-semibold text-amber-800">Live-call reminder</p><p className="mt-1 text-[11px] leading-relaxed text-amber-800">Confirm the one priority, who owns each commitment, the evidence that proves completion, and the date you will inspect it.</p></CardContent></Card>
              <Button className="w-full" onClick={endLiveCall} disabled={session.status === "Completed" || completeSession.isPending || updateSession.isPending}><Square className="mr-1 h-3.5 w-3.5" />{session.status === "Completed" ? "Live Call Ended" : "End Live Call"}</Button>
            </div>
          </div>
        </div>
      )}

      {activeStage === "Follow-up" && (
        <div className="space-y-4">
          <div><h2 className="text-base font-semibold">Post-Session Follow-up</h2><p className="text-sm text-muted-foreground">Session actions belong here after the live conversation is over. Add supporting notes or a transcript, then send the session to AI processing.</p></div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card><CardHeader><CardTitle className="flex items-center gap-2 text-sm"><Upload className="h-4 w-4" />Upload Notetaker Notes</CardTitle><CardDescription>Upload plain-text session notes to preserve the raw source before summary processing.</CardDescription></CardHeader><CardContent><Button variant="outline" onClick={() => setShowUploadDialog(true)}><Upload className="mr-2 h-3.5 w-3.5" />Upload Notes File</Button></CardContent></Card>
            <Card><CardHeader><CardTitle className="flex items-center gap-2 text-sm"><FileText className="h-4 w-4" />Past Transcript & Notes</CardTitle><CardDescription>Paste or review a transcript after the call. This content will be used for the AI summary.</CardDescription></CardHeader><CardContent className="space-y-3"><Textarea value={transcript} onChange={(event) => setTranscript(event.target.value)} placeholder="Paste the transcript or notetaker output..." className="min-h-[180px] text-xs leading-relaxed" /><Button size="sm" variant="outline" onClick={saveTranscript} disabled={updateSession.isPending}><Save className="mr-1 h-3 w-3" />Save Transcript</Button></CardContent></Card>
          </div>
          <Card className="border-primary/20"><CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">Ready to create the coaching record?</p><p className="text-xs text-muted-foreground">AI will summarize the notes, identify Four-C signals, and suggest commitments for review.</p></div><Button onClick={async () => { if (!notes && !transcript) { toast.error("Add session notes or a transcript before processing."); return; } try { const result = await generateSummary.mutateAsync({ sessionId }); toast.success(result.source === "fallback" ? "Session summary prepared from saved notes" : "AI summary generated"); setActiveStage("Review"); refetch(); } catch (err: any) { toast.error(err.message ?? "AI processing failed"); setActiveStage("AI Process"); refetch(); } }} disabled={generateSummary.isPending}><Sparkles className={`mr-1 h-3.5 w-3.5 ${generateSummary.isPending ? "animate-spin" : ""}`} />{generateSummary.isPending ? "Processing..." : "Process Session"}</Button></CardContent></Card>
        </div>
      )}

      {activeStage === "AI Process" && (
        <div className="space-y-4"><Card className="border-primary/20"><CardContent className="py-12 text-center">{session.aiProcessingStatus === "Processing" ? <><Loader2 className="mx-auto mb-3 h-10 w-10 animate-spin text-primary" /><p className="text-lg font-semibold">AI is processing the session</p><p className="mt-1 text-sm text-muted-foreground">Generating the coaching summary and proposed commitments.</p><Button size="sm" variant="outline" className="mt-4" onClick={() => refetch()}><RefreshCw className="mr-1 h-3.5 w-3.5" />Check Status</Button></> : session.aiProcessingStatus === "Failed" ? <><AlertTriangle className="mx-auto mb-3 h-10 w-10 text-red-500" /><p className="text-lg font-semibold text-red-700">AI processing was not completed</p><p className="mt-1 text-sm text-muted-foreground">Confirm session notes are present and retry, or return to follow-up to add more detail.</p><div className="mt-4 flex justify-center gap-2"><Button size="sm" onClick={async () => { try { const result = await generateSummary.mutateAsync({ sessionId, forceRegenerate: true }); toast.success(result.source === "fallback" ? "Session summary prepared from saved notes" : "AI summary generated"); setActiveStage("Review"); refetch(); } catch (err: any) { toast.error(err.message ?? "AI processing failed"); } }} disabled={generateSummary.isPending}><RefreshCw className="mr-1 h-3.5 w-3.5" />Retry</Button><Button size="sm" variant="outline" onClick={() => setActiveStage("Follow-up")}>Back to Follow-up</Button></div></> : <><Brain className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" /><p className="text-lg font-semibold">Ready to process</p><Button className="mt-4" onClick={() => setActiveStage("Follow-up")}>Open Follow-up <ChevronRight className="ml-1 h-4 w-4" /></Button></>}</CardContent></Card></div>
      )}

      {activeStage === "Review" && (
        <div className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-base font-semibold">Review AI Summary</h2><p className="text-sm text-muted-foreground">Validate the narrative and diagnosis before approving the session record.</p></div><div className="flex gap-2">{!session.isSummaryApproved && <Button size="sm" onClick={async () => { try { await approveSummary.mutateAsync({ sessionId }); toast.success("Summary approved"); refetch(); } catch (err: any) { toast.error(err.message ?? "Unable to approve summary"); } }} disabled={approveSummary.isPending}><Check className="mr-1 h-3.5 w-3.5" />Approve Summary</Button>}<Button size="sm" variant="outline" onClick={async () => { try { const result = await generateSummary.mutateAsync({ sessionId, forceRegenerate: true }); toast.success(result.source === "fallback" ? "Session summary refreshed from saved notes" : "Summary regenerated"); refetch(); } catch (err: any) { toast.error(err.message ?? "Unable to regenerate summary"); } }} disabled={generateSummary.isPending}><RefreshCw className="mr-1 h-3.5 w-3.5" />Regenerate</Button></div></div><Card className={session.isSummaryApproved ? "border-emerald-200 bg-emerald-50/30" : ""}><CardHeader className="pb-2"><CardTitle className="text-sm">Session Summary</CardTitle></CardHeader><CardContent>{session.aiSummary ? <p className="whitespace-pre-wrap text-sm leading-relaxed">{session.aiSummary}</p> : <p className="text-sm italic text-muted-foreground">No summary is available yet.</p>}</CardContent></Card><Card><CardHeader className="pb-2"><CardTitle className="text-sm">Four-C Diagnosis</CardTitle></CardHeader><CardContent className="grid grid-cols-2 gap-2 sm:grid-cols-4">{(["Commitment", "Capability", "Cadence", "Capacity"] as Diagnosis[]).map((diagnosis) => <div key={diagnosis} className={`rounded-lg border p-3 text-center ${session.primaryDiagnosis === diagnosis ? "border-primary bg-primary/10" : session.secondaryDiagnosis === diagnosis ? "border-amber-300 bg-amber-50" : ""}`}><p className="text-sm font-semibold">{diagnosis}</p>{session.primaryDiagnosis === diagnosis && <p className="text-[9px] text-primary">Primary</p>}{session.secondaryDiagnosis === diagnosis && <p className="text-[9px] text-amber-700">Secondary</p>}</div>)}</CardContent>{session.diagnosisEvidence && <CardContent className="pt-0"><p className="text-xs text-muted-foreground"><strong>Evidence:</strong> {session.diagnosisEvidence}</p></CardContent>}</Card><div className="flex justify-end"><Button onClick={() => setActiveStage("Commit")}>Review Commitments <ChevronRight className="ml-1 h-4 w-4" /></Button></div></div>
      )}

      {activeStage === "Commit" && (
        <div className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-base font-semibold">Review & Approve Commitments</h2><p className="text-sm text-muted-foreground">Approve only commitments with a clear owner, proof, and due date.</p></div>{aiCommitments.length > 0 && <div className="flex gap-2"><Button size="sm" variant="outline" onClick={async () => { const ids = selectedCommitments.length ? selectedCommitments : aiCommitments.map((commitment: any) => commitment.id); try { await bulkDismiss.mutateAsync({ commitmentIds: ids }); toast.success("Commitments dismissed"); refetch(); } catch (err: any) { toast.error(err.message ?? "Unable to dismiss commitments"); } }} disabled={bulkDismiss.isPending}><X className="mr-1 h-3.5 w-3.5" />Dismiss</Button><Button size="sm" onClick={async () => { const ids = selectedCommitments.length ? selectedCommitments : aiCommitments.map((commitment: any) => commitment.id); try { await bulkApprove.mutateAsync({ commitmentIds: ids }); toast.success("Commitments approved"); refetch(); } catch (err: any) { toast.error(err.message ?? "Unable to approve commitments"); } }} disabled={bulkApprove.isPending}><Check className="mr-1 h-3.5 w-3.5" />Approve</Button></div>}</div>{aiCommitments.length > 0 ? <Card className="border-amber-200"><CardHeader className="pb-2"><CardTitle className="text-sm">AI-Suggested Commitments ({aiCommitments.length})</CardTitle></CardHeader><CardContent className="overflow-x-auto p-0"><Table><TableHeader><TableRow><TableHead className="w-8" /><TableHead>Commitment</TableHead><TableHead>Due</TableHead><TableHead>Confidence</TableHead></TableRow></TableHeader><TableBody>{aiCommitments.map((commitment: any) => <TableRow key={commitment.id}><TableCell><Checkbox checked={selectedCommitments.includes(commitment.id)} onCheckedChange={(checked) => setSelectedCommitments((current) => checked ? [...current, commitment.id] : current.filter((currentId) => currentId !== commitment.id))} /></TableCell><TableCell className="text-xs">{commitment.description}</TableCell><TableCell className="text-xs">{commitment.dueDate ? safeFormat(commitment.dueDate, "MMM d") : "—"}</TableCell><TableCell><Badge variant="secondary" className="text-[10px]">{commitment.aiConfidence ?? "medium"}</Badge></TableCell></TableRow>)}</TableBody></Table></CardContent></Card> : <Card className="border-emerald-200 bg-emerald-50/30"><CardContent className="py-8 text-center"><CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-600" /><p className="font-medium">All commitments reviewed</p></CardContent></Card>}{approvedCommitments.length > 0 && <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Active Commitments ({approvedCommitments.length})</CardTitle></CardHeader><CardContent className="space-y-2">{approvedCommitments.map((commitment: any) => <div key={commitment.id} className="rounded-md border p-2"><p className="text-xs">{commitment.description}</p><p className="mt-1 text-[10px] text-muted-foreground">{commitment.dueDate ? `Due ${safeFormat(commitment.dueDate, "MMM d, yyyy")}` : "No due date"} • {commitment.status}</p></div>)}</CardContent></Card>}<div className="flex justify-end"><Button onClick={() => setActiveStage("Schedule Next")}>Schedule Next Session <ChevronRight className="ml-1 h-4 w-4" /></Button></div></div>
      )}

      {activeStage === "Schedule Next" && (
        <div className="space-y-4"><div><h2 className="text-base font-semibold">Schedule the Next Coaching Session</h2><p className="text-sm text-muted-foreground">Finalize the follow-up cadence. Saving this creates the next scheduled session once.</p></div><Card><CardContent className="space-y-4 p-5"><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-1.5"><Label className="text-xs font-medium">Next session coach</Label><Select value={nextSessionForm.nextSessionCoachId} onValueChange={(value) => setNextSessionForm((current) => ({ ...current, nextSessionCoachId: value }))}><SelectTrigger><SelectValue placeholder="Select coach..." /></SelectTrigger><SelectContent>{(coaches ?? []).map((coach: any) => <SelectItem key={coach.id} value={String(coach.id)}>{coach.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label className="text-xs font-medium">Next session date & time</Label><Input type="datetime-local" value={nextSessionForm.nextSessionDate} onChange={(event) => setNextSessionForm((current) => ({ ...current, nextSessionDate: event.target.value }))} /></div><div className="space-y-1.5"><Label className="text-xs font-medium">Session type</Label><Select value={nextSessionForm.nextSessionType} onValueChange={(value) => setNextSessionForm((current) => ({ ...current, nextSessionType: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["Standard COACH Session", "Pipeline and Performance Session", "Sales Capability Session", "Culture and Accountability Session", "Performance Reset Session", "Performance Reset Checkpoint", "Productive-Agent Strategy Session", "Custom Coaching Session"].map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label className="text-xs font-medium">Reason for no next session</Label><Input value={nextSessionForm.noNextSessionReason} onChange={(event) => setNextSessionForm((current) => ({ ...current, noNextSessionReason: event.target.value }))} placeholder="Required only if not scheduling now" /></div></div><div className="flex justify-end"><Button onClick={handleScheduleNext} disabled={scheduleNextSession.isPending}><CalendarDays className="mr-1 h-3.5 w-3.5" />{scheduleNextSession.isPending ? "Saving..." : nextSessionForm.nextSessionDate ? "Schedule & Finalize" : "Finalize with Reason"}</Button></div></CardContent></Card>{nextSessionForm.nextSessionDate && (new Date(nextSessionForm.nextSessionDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24) > 14 && <Card className="border-amber-200 bg-amber-50/50"><CardContent className="flex gap-2 p-3"><AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" /><p className="text-xs text-amber-800">The next session is more than 14 days away. Confirm that this gap is intentional for the agent's coaching cadence.</p></CardContent></Card>}</div>
      )}

      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent className="max-w-md"><DialogHeader><DialogTitle>Upload Notetaker Notes</DialogTitle></DialogHeader><div className="space-y-4"><p className="text-xs text-muted-foreground">Upload a plain-text file such as TXT, MD, or CSV. The content is appended to the post-session transcript field for review before AI processing.</p><div className="relative rounded-lg border-2 border-dashed p-8 text-center"><Upload className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" /><p className="text-sm font-medium">Choose a notes file</p><input type="file" accept=".txt,.md,.csv,text/plain,text/markdown,text/csv" className="absolute inset-0 cursor-pointer opacity-0" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; try { const text = await file.text(); const combined = transcript ? `${transcript}\n\n${text}` : text; setTranscript(combined); await updateSession.mutateAsync({ sessionId, transcript: combined }); toast.success("Notetaker notes loaded into transcript"); setShowUploadDialog(false); refetch(); } catch (err: any) { toast.error(err.message ?? "Unable to read notes file"); } }} /></div></div><DialogFooter><Button variant="outline" onClick={() => setShowUploadDialog(false)}>Close</Button></DialogFooter></DialogContent>
      </Dialog>
    </div>
  );
}
