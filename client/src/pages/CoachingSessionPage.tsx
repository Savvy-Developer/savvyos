import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ArrowLeft,
  AlertTriangle,
  Loader2,
  Sparkles,
  Save,
  Play,
  Square,
  Mic,
  MicOff,
  Upload,
  FileText,
  CheckCircle2,
  Clock,
  Brain,
  Target,
  ListChecks,
  ChevronRight,
  CalendarDays,
  RefreshCw,
  ExternalLink,
  Pause,
  CircleDot,
  Check,
  X,
  Edit,
  Zap,
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

const STAGE_ORDER = ["Prepare", "Conduct", "AI Process", "Review", "Commit", "Schedule Next"] as const;
type Stage = typeof STAGE_ORDER[number];

function getStageFromSession(session: any): Stage {
  if (!session) return "Prepare";
  if (session.status === "Completed" && session.isSummaryApproved) return "Schedule Next";
  if (session.status === "Completed" && session.aiSummary && session.aiRecommendedCommitments) return "Commit";
  if (session.status === "Completed" && session.aiSummary) return "Review";
  if (session.aiProcessingStatus === "Completed") return "Review";
  if (session.aiProcessingStatus === "Processing") return "AI Process";
  if (session.status === "In Progress" || session.sourceNotes || session.transcript) return "Conduct";
  if (session.preparationStatus === "Ready") return "Conduct";
  return "Prepare";
}

export default function CoachingSessionPage() {
  const { id } = useParams<{ id: string }>();
  const sessionId = Number(id);
  const [, navigate] = useLocation();

  const utils = trpc.useUtils();
  const { data, isLoading, error, refetch } = trpc.coaching.getSession.useQuery({ sessionId });
  const { data: coaches } = trpc.coaching.listCoaches.useQuery();

  // Mutations
  const startSession = trpc.coaching.startSession.useMutation({
    onSuccess: () => { toast.success("Session started"); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const updateSession = trpc.coaching.updateSession.useMutation({
    onSuccess: () => { toast.success("Saved"); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const completeSession = trpc.coaching.completeSession.useMutation({
    onSuccess: () => { toast.success("Session completed — AI processing started"); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const generateBrief = trpc.coaching.generatePreSessionBrief.useMutation({
    onSuccess: () => { toast.success("Pre-session brief generated"); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const generateSummary = trpc.coaching.generateSessionSummary.useMutation({
    onSuccess: () => { toast.success("AI summary generated"); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const approveSummary = trpc.coaching.approveSessionSummary.useMutation({
    onSuccess: () => { toast.success("Summary approved"); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const bulkApprove = trpc.coaching.bulkApproveCommitments.useMutation({
    onSuccess: () => { toast.success("Commitments approved"); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const bulkDismiss = trpc.coaching.bulkDismissCommitments.useMutation({
    onSuccess: () => { toast.success("Commitments dismissed"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  // Local state
  const [activeStage, setActiveStage] = useState<Stage>("Prepare");
  const [notes, setNotes] = useState("");
  const [transcript, setTranscript] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [selectedCommitments, setSelectedCommitments] = useState<number[]>([]);
  const [nextSessionForm, setNextSessionForm] = useState({
    nextSessionCoachId: "",
    nextSessionDate: "",
    nextSessionType: "Standard COACH Session",
    noNextSessionReason: "",
  });
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const autoSaveRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize state from data
  useEffect(() => {
    if (data) {
      const session = (data as any).session;
      setNotes(session.sourceNotes ?? "");
      setTranscript(session.transcript ?? "");
      setActiveStage(getStageFromSession(session));
      if (session.nextSessionCoachId) setNextSessionForm(f => ({ ...f, nextSessionCoachId: String(session.nextSessionCoachId) }));
      if (session.nextSessionDate) setNextSessionForm(f => ({ ...f, nextSessionDate: safeFormat(session.nextSessionDate, "yyyy-MM-dd'T'HH:mm") }));
      if (session.nextSessionType) setNextSessionForm(f => ({ ...f, nextSessionType: session.nextSessionType }));
    }
  }, [data]);

  // Auto-save notes every 15 seconds
  useEffect(() => {
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
    if (!data || (data as any).session.status === "Completed") return;
    autoSaveRef.current = setTimeout(() => {
      if (notes !== ((data as any).session.sourceNotes ?? "")) {
        updateSession.mutate({ sessionId, sourceNotes: notes });
      }
    }, 15000);
    return () => { if (autoSaveRef.current) clearTimeout(autoSaveRef.current); };
  }, [notes]);

  // Recording timer
  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isRecording]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        stream.getTracks().forEach(t => t.stop());
        // Upload the recording
        const formData = new FormData();
        formData.append("audio", blob, `session-${sessionId}-recording.webm`);
        try {
          const res = await fetch("/api/voice/upload", { method: "POST", body: formData });
          const { url, fileKey } = await res.json();
          updateSession.mutate({
            sessionId,
            recordingFileUrl: url,
            recordingFileKey: fileKey,
            recordingDurationSeconds: recordingTime,
          });
          toast.success("Recording uploaded");
        } catch (err) {
          toast.error("Failed to upload recording");
        }
      };
      mediaRecorder.start(1000);
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
      setRecordingTime(0);
    } catch (err) {
      toast.error("Microphone access denied");
    }
  }, [sessionId, recordingTime]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  }, []);

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  if (error || !data) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-amber-500" />
        <p>Session not found.</p>
        <Button variant="ghost" size="sm" className="mt-4" onClick={() => navigate("/coaching")}>
          <ArrowLeft className="h-4 w-4 mr-2" />Back
        </Button>
      </div>
    );
  }

  const { session, agent, scheduledCoach, actualCoach, commitments, priorCommitments, profile } = data as any;
  const aiCommitments = commitments?.filter((c: any) => c.status === "AI Suggested") ?? [];
  const approvedCommitments = commitments?.filter((c: any) => c.status !== "AI Suggested") ?? [];
  const parsedBrief = session.aiRecommendedAgenda ? (() => { try { return JSON.parse(session.aiRecommendedAgenda); } catch { return null; } })() : null;
  const parsedQuestions = session.aiRecommendedQuestions ? (() => { try { return JSON.parse(session.aiRecommendedQuestions); } catch { return null; } })() : null;

  function formatTime(s: number) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  }

  return (
    <div className="p-4 sm:p-6 max-w-screen-2xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="sm" className="shrink-0" onClick={() => navigate(agent ? `/coaching/agent/${agent.id}` : "/coaching")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-bold flex items-center gap-2 flex-wrap">
              <span className="truncate">Coaching Session — {agent?.name ?? "Agent"}</span>
              <Badge className={`text-[10px] shrink-0 ${STATUS_COLORS[session.status] ?? ""}`}>{session.status}</Badge>
            </h1>
            <p className="text-xs text-muted-foreground truncate">
              {session.sessionType} • {session.sessionDate ? safeFormat(session.sessionDate, "MMMM d, yyyy h:mm a") : "Unscheduled"}
              {scheduledCoach?.name && ` • Coach: ${actualCoach?.name ?? scheduledCoach.name}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-auto sm:ml-0">
          {session.status === "Scheduled" && (
            <Button size="sm" onClick={() => startSession.mutate({ sessionId })} disabled={startSession.isPending}>
              <Play className="h-3.5 w-3.5 mr-1" />{startSession.isPending ? "Starting..." : "Start Session"}
            </Button>
          )}
          {session.status === "In Progress" && (
            <Button size="sm" variant="destructive" onClick={async () => {
              // Save notes first, then complete
              if (notes || transcript) {
                await updateSession.mutateAsync({ sessionId, sourceNotes: notes || undefined, transcript: transcript || undefined } as any);
              }
              completeSession.mutate({ sessionId });
            }} disabled={completeSession.isPending}>
              <Square className="h-3.5 w-3.5 mr-1" />{completeSession.isPending ? "Completing..." : "End & Process"}
            </Button>
          )}
        </div>
      </div>

      {/* Stage Progress Bar */}
      <div className="flex items-center gap-1 rounded-lg bg-muted/40 p-2 overflow-x-auto" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
        {STAGE_ORDER.map((stage, i) => {
          const stageIdx = STAGE_ORDER.indexOf(activeStage);
          const isActive = stage === activeStage;
          const isCompleted = i < stageIdx;
          return (
            <button
              key={stage}
              onClick={() => setActiveStage(stage)}
              className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-all ${
                isActive ? "bg-primary text-primary-foreground shadow-sm" :
                isCompleted ? "bg-emerald-100 text-emerald-700" :
                "text-muted-foreground hover:bg-muted"
              }`}
            >
              <div className="flex items-center justify-center gap-1">
                {isCompleted && <Check className="h-3 w-3" />}
                {isActive && <CircleDot className="h-3 w-3" />}
                {stage}
              </div>
            </button>
          );
        })}
      </div>

      {/* ═══ PREPARE STAGE ═══ */}
      {activeStage === "Prepare" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold flex items-center gap-2"><Brain className="h-4 w-4" />Pre-Session Coaching Brief</h2>
            <Button size="sm" variant="outline" onClick={() => generateBrief.mutate({ sessionId })} disabled={generateBrief.isPending}>
              <Sparkles className={`h-3.5 w-3.5 mr-1 ${generateBrief.isPending ? "animate-spin" : ""}`} />
              {generateBrief.isPending ? "Generating..." : session.preparationStatus === "Ready" ? "Regenerate Brief" : "Generate Brief"}
            </Button>
          </div>

          {session.preparationStatus === "Ready" && parsedBrief ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {/* Agent Snapshot */}
              {typeof parsedBrief === "object" && (
                <>
                  {parsedBrief.agentSnapshot && (
                    <Card className="lg:col-span-2 border-primary/20 bg-primary/[0.02]">
                      <CardContent className="p-4"><p className="text-sm leading-relaxed">{parsedBrief.agentSnapshot}</p></CardContent>
                    </Card>
                  )}
                  {parsedBrief.lastSessionRecap && (
                    <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground">Last Session Recap</CardTitle></CardHeader><CardContent><p className="text-sm">{parsedBrief.lastSessionRecap}</p></CardContent></Card>
                  )}
                  {parsedBrief.openCommitmentsReview && (
                    <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground">Commitments Review</CardTitle></CardHeader><CardContent><p className="text-sm">{parsedBrief.openCommitmentsReview}</p></CardContent></Card>
                  )}
                  {Array.isArray(parsedBrief.suggestedAgenda ?? parsedBrief) && (
                    <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground">Suggested Agenda</CardTitle></CardHeader><CardContent><ol className="list-decimal list-inside text-sm space-y-1">{(parsedBrief.suggestedAgenda ?? parsedBrief).map((item: string, i: number) => <li key={i}>{item}</li>)}</ol></CardContent></Card>
                  )}
                  {parsedBrief.suggestedQuestions && (
                    <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground">Suggested Questions</CardTitle></CardHeader><CardContent><ul className="list-disc list-inside text-sm space-y-1">{parsedBrief.suggestedQuestions.map((q: string, i: number) => <li key={i}>{q}</li>)}</ul></CardContent></Card>
                  )}
                  {parsedBrief.watchFor && (
                    <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground tracking-wide text-amber-700">Watch For</CardTitle></CardHeader><CardContent><ul className="list-disc list-inside text-sm space-y-1 text-amber-800">{parsedBrief.watchFor.map((w: string, i: number) => <li key={i}>{w}</li>)}</ul></CardContent></Card>
                  )}
                  {parsedBrief.celebrateIf && (
                    <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground tracking-wide text-emerald-700">Celebrate If</CardTitle></CardHeader><CardContent><ul className="list-disc list-inside text-sm space-y-1 text-emerald-800">{parsedBrief.celebrateIf.map((c: string, i: number) => <li key={i}>{c}</li>)}</ul></CardContent></Card>
                  )}
                  {parsedBrief.dataHighlights && (
                    <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground">Data Highlights</CardTitle></CardHeader><CardContent><ul className="list-disc list-inside text-sm space-y-1">{parsedBrief.dataHighlights.map((d: string, i: number) => <li key={i}>{d}</li>)}</ul></CardContent></Card>
                  )}
                </>
              )}
            </div>
          ) : (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center">
                <Brain className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
                <p className="font-medium">Pre-session brief not yet generated</p>
                <p className="text-xs text-muted-foreground mt-1">Click "Generate Brief" to create an AI-powered coaching preparation summary.</p>
              </CardContent>
            </Card>
          )}

          {/* Prior Commitments */}
          {priorCommitments && priorCommitments.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><ListChecks className="h-4 w-4" />Open Commitments to Review ({priorCommitments.length})</CardTitle></CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <Table><TableHeader><TableRow><TableHead className="text-[10px]">Commitment</TableHead><TableHead className="text-[10px]">Due</TableHead><TableHead className="text-[10px]">Status</TableHead></TableRow></TableHeader>
                <TableBody>{priorCommitments.map((c: any) => (
                  <TableRow key={c.id}><TableCell className="text-xs">{c.description}</TableCell><TableCell className="text-xs">{c.dueDate ? safeFormat(c.dueDate, "MMM d") : "—"}</TableCell><TableCell><Badge variant="secondary" className="text-[10px]">{c.status}</Badge></TableCell></TableRow>
                ))}</TableBody></Table>
              </CardContent>
            </Card>
          )}

          <div className="flex justify-end">
            <Button onClick={() => { setActiveStage("Conduct"); if (session.status === "Scheduled") startSession.mutate({ sessionId }); }}>
              {session.status === "Scheduled" ? "Start Session" : "Continue to Conduct"} <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* ═══ CONDUCT STAGE ═══ */}
      {activeStage === "Conduct" && (
        <div className="grid gap-4 lg:grid-cols-3">
          {/* LEFT: Brief Reference */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground">Quick Reference</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-xs">
                <div><strong>Status:</strong> {profile?.performanceStatus ?? "—"}</div>
                <div><strong>Diagnosis:</strong> {profile?.currentPrimaryDiagnosis ?? "—"}</div>
                <div><strong>Priority:</strong> {profile?.currentDevelopmentPriority ?? "—"}</div>
                {parsedBrief?.agentSnapshot && <div className="rounded bg-muted/50 p-2 text-[11px]">{parsedBrief.agentSnapshot}</div>}
                {parsedBrief?.suggestedAgenda && (
                  <div><strong>Agenda:</strong><ol className="list-decimal list-inside mt-1 space-y-0.5">{(Array.isArray(parsedBrief.suggestedAgenda) ? parsedBrief.suggestedAgenda : parsedBrief).map((a: string, i: number) => <li key={i}>{a}</li>)}</ol></div>
                )}
              </CardContent>
            </Card>
            {priorCommitments && priorCommitments.length > 0 && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground">Prior Commitments</CardTitle></CardHeader>
                <CardContent className="space-y-1.5">{priorCommitments.slice(0, 8).map((c: any) => (
                  <div key={c.id} className="flex items-start gap-2 text-[11px]"><Badge variant="secondary" className="text-[8px] shrink-0 mt-0.5">{c.status}</Badge><span>{c.description}</span></div>
                ))}</CardContent>
              </Card>
            )}
          </div>

          {/* CENTER: Notes & Recording */}
          <div className="space-y-4">
            <Card className="flex-1">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Session Notes</CardTitle>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => updateSession.mutate({ sessionId, sourceNotes: notes })} disabled={updateSession.isPending}>
                      <Save className="h-3 w-3 mr-1" />{updateSession.isPending ? "Saving..." : "Save"}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Type coaching notes here... (auto-saves every 15s)"
                  className="min-h-[300px] text-sm font-mono"
                />
              </CardContent>
            </Card>

            {/* Recording Controls */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Mic className="h-4 w-4" />Recording</CardTitle></CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  {!isRecording ? (
                    <Button size="sm" variant="outline" onClick={startRecording}>
                      <Mic className="h-3.5 w-3.5 mr-1 text-red-600" />Start Recording
                    </Button>
                  ) : (
                    <>
                      <Button size="sm" variant="destructive" onClick={stopRecording}>
                        <Square className="h-3.5 w-3.5 mr-1" />Stop
                      </Button>
                      <span className="text-sm font-mono text-red-600 animate-pulse flex items-center gap-1">
                        <CircleDot className="h-3 w-3" />{formatTime(recordingTime)}
                      </span>
                    </>
                  )}
                  <Button size="sm" variant="outline" onClick={() => setShowUploadDialog(true)}>
                    <Upload className="h-3.5 w-3.5 mr-1" />Upload
                  </Button>
                  {session.recordingFileUrl && (
                    <Badge variant="secondary" className="text-[10px]"><CheckCircle2 className="h-3 w-3 mr-1 text-emerald-600" />Recording saved</Badge>
                  )}
                </div>
                {session.recordingFileUrl && (
                  <div className="mt-2"><audio src={session.recordingFileUrl} controls className="w-full h-8" /></div>
                )}
              </CardContent>
            </Card>

            {/* Transcript */}
            {(transcript || session.transcript) && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Transcript</CardTitle></CardHeader>
                <CardContent>
                  <Textarea
                    value={transcript}
                    onChange={(e) => setTranscript(e.target.value)}
                    placeholder="Paste or upload a transcript..."
                    className="min-h-[150px] text-xs font-mono"
                  />
                </CardContent>
              </Card>
            )}
          </div>

          {/* RIGHT: Actions */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground">Diagnosis</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {["Commitment", "Capability", "Cadence", "Capacity"].map(d => (
                    <button
                      key={d}
                      onClick={() => updateSession.mutate({ sessionId, primaryDiagnosis: d as any })}
                      className={`rounded-md border p-2 text-xs font-medium transition-all ${session.primaryDiagnosis === d ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted"}`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground">Session Actions</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <Button size="sm" variant="outline" className="w-full justify-start" onClick={() => setShowUploadDialog(true)}>
                  <Upload className="h-3.5 w-3.5 mr-2" />Upload Notetaker Notes
                </Button>
                <Button size="sm" variant="outline" className="w-full justify-start" onClick={() => { if (!transcript) setTranscript(""); }}>
                  <FileText className="h-3.5 w-3.5 mr-2" />Paste Transcript
                </Button>
              </CardContent>
            </Card>
            <div className="flex justify-end">
              <Button onClick={async () => { await updateSession.mutateAsync({ sessionId, sourceNotes: notes, transcript: transcript || undefined } as any); completeSession.mutate({ sessionId }); }}>
                End Session & Process <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ AI PROCESS STAGE ═══ */}
      {activeStage === "AI Process" && (
        <div className="space-y-4">
          <Card className="border-primary/20">
            <CardContent className="py-12 text-center">
              {session.aiProcessingStatus === "Processing" ? (
                <>
                  <Loader2 className="h-10 w-10 mx-auto mb-3 animate-spin text-primary" />
                  <p className="font-semibold text-lg">AI is processing your session...</p>
                  <p className="text-sm text-muted-foreground mt-1">Generating summary, extracting commitments, and analyzing diagnosis.</p>
                  <Button size="sm" variant="outline" className="mt-4" onClick={() => refetch()}>
                    <RefreshCw className="h-3.5 w-3.5 mr-1" />Check Status
                  </Button>
                </>
              ) : session.aiProcessingStatus === "Failed" ? (
                <>
                  <AlertTriangle className="h-10 w-10 mx-auto mb-3 text-red-500" />
                  <p className="font-semibold text-lg text-red-700">AI processing failed</p>
                  <p className="text-sm text-muted-foreground mt-1">You can retry or proceed manually.</p>
                  <div className="flex justify-center gap-2 mt-4">
                    <Button size="sm" onClick={() => generateSummary.mutate({ sessionId })} disabled={generateSummary.isPending}>
                      <RefreshCw className="h-3.5 w-3.5 mr-1" />Retry
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setActiveStage("Review")}>Skip to Review</Button>
                  </div>
                </>
              ) : session.aiProcessingStatus === "Completed" ? (
                <>
                  <CheckCircle2 className="h-10 w-10 mx-auto mb-3 text-emerald-600" />
                  <p className="font-semibold text-lg">Processing complete</p>
                  <Button className="mt-4" onClick={() => setActiveStage("Review")}>
                    Review Results <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </>
              ) : (
                <>
                  <Brain className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
                  <p className="font-semibold text-lg">Ready to process</p>
                  <p className="text-sm text-muted-foreground mt-1">Click below to generate AI summary and extract commitments.</p>
                  <Button className="mt-4" onClick={() => generateSummary.mutate({ sessionId })} disabled={generateSummary.isPending}>
                    <Sparkles className="h-3.5 w-3.5 mr-1" />{generateSummary.isPending ? "Processing..." : "Generate AI Summary"}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ═══ REVIEW STAGE ═══ */}
      {activeStage === "Review" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Review AI Summary</h2>
            <div className="flex items-center gap-2">
              {!session.isSummaryApproved && (
                <Button size="sm" onClick={() => approveSummary.mutate({ sessionId })} disabled={approveSummary.isPending}>
                  <Check className="h-3.5 w-3.5 mr-1" />{approveSummary.isPending ? "Approving..." : "Approve Summary"}
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => generateSummary.mutate({ sessionId })} disabled={generateSummary.isPending}>
                <RefreshCw className="h-3.5 w-3.5 mr-1" />Regenerate
              </Button>
            </div>
          </div>

          <Card className={session.isSummaryApproved ? "border-emerald-200 bg-emerald-50/30" : ""}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Session Summary</CardTitle>
                {session.isSummaryApproved && <Badge className="bg-emerald-100 text-emerald-700 text-[10px]"><Check className="h-3 w-3 mr-1" />Approved</Badge>}
              </div>
            </CardHeader>
            <CardContent>
              {session.aiSummary ? (
                <div className="text-sm leading-relaxed whitespace-pre-wrap">{session.aiSummary}</div>
              ) : (
                <p className="text-sm text-muted-foreground italic">No summary generated yet.</p>
              )}
            </CardContent>
          </Card>

          {/* Diagnosis */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Four-C Diagnosis</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {["Commitment", "Capability", "Cadence", "Capacity"].map(d => (
                  <div key={d} className={`rounded-lg border p-3 text-center ${session.primaryDiagnosis === d ? "border-primary bg-primary/10" : session.secondaryDiagnosis === d ? "border-amber-300 bg-amber-50" : ""}`}>
                    <p className={`text-sm font-semibold ${session.primaryDiagnosis === d ? "text-primary" : session.secondaryDiagnosis === d ? "text-amber-700" : "text-muted-foreground"}`}>{d}</p>
                    {session.primaryDiagnosis === d && <p className="text-[9px] text-primary">Primary</p>}
                    {session.secondaryDiagnosis === d && <p className="text-[9px] text-amber-600">Secondary</p>}
                  </div>
                ))}
              </div>
              {session.diagnosisEvidence && <p className="mt-2 text-xs text-muted-foreground"><strong>Evidence:</strong> {session.diagnosisEvidence}</p>}
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={() => setActiveStage("Commit")}>
              Review Commitments <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* ═══ COMMIT STAGE ═══ */}
      {activeStage === "Commit" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Review & Approve Commitments</h2>
            <div className="flex items-center gap-2">
              {aiCommitments.length > 0 && (
                <>
                  <Button size="sm" variant="outline" onClick={() => bulkDismiss.mutate({ commitmentIds: selectedCommitments.length > 0 ? selectedCommitments : aiCommitments.map((c: any) => c.id) })} disabled={bulkDismiss.isPending}>
                    <X className="h-3.5 w-3.5 mr-1" />Dismiss Selected
                  </Button>
                  <Button size="sm" onClick={() => bulkApprove.mutate({ commitmentIds: selectedCommitments.length > 0 ? selectedCommitments : aiCommitments.map((c: any) => c.id) })} disabled={bulkApprove.isPending}>
                    <Check className="h-3.5 w-3.5 mr-1" />{bulkApprove.isPending ? "Approving..." : "Approve Selected"}
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* AI-Suggested Commitments */}
          {aiCommitments.length > 0 ? (
            <Card className="border-amber-200">
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Sparkles className="h-4 w-4 text-amber-600" />AI-Suggested Commitments ({aiCommitments.length})</CardTitle><CardDescription className="text-xs">Review and approve or dismiss each commitment</CardDescription></CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <Table><TableHeader><TableRow><TableHead className="w-8"></TableHead><TableHead className="text-[10px]">Commitment</TableHead><TableHead className="text-[10px]">Owner</TableHead><TableHead className="text-[10px]">Due</TableHead><TableHead className="text-[10px]">Confidence</TableHead></TableRow></TableHeader>
                <TableBody>{aiCommitments.map((c: any) => (
                  <TableRow key={c.id}>
                    <TableCell><Checkbox checked={selectedCommitments.includes(c.id)} onCheckedChange={(checked) => setSelectedCommitments(prev => checked ? [...prev, c.id] : prev.filter(id => id !== c.id))} /></TableCell>
                    <TableCell className="text-xs">{c.description}</TableCell>
                    <TableCell className="text-xs">{c.ownerId === agent?.id ? "Agent" : "Coach"}</TableCell>
                    <TableCell className="text-xs">{c.dueDate ? safeFormat(c.dueDate, "MMM d") : "—"}</TableCell>
                    <TableCell><Badge variant="secondary" className="text-[10px]">{c.aiConfidence ?? "medium"}</Badge></TableCell>
                  </TableRow>
                ))}</TableBody></Table>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-emerald-200 bg-emerald-50/30">
              <CardContent className="py-8 text-center">
                <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-600" />
                <p className="font-medium">All commitments reviewed</p>
                <p className="text-xs text-muted-foreground mt-1">No pending AI-suggested commitments remaining.</p>
              </CardContent>
            </Card>
          )}

          {/* Approved Commitments */}
          {approvedCommitments.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Active Commitments ({approvedCommitments.length})</CardTitle></CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <Table><TableHeader><TableRow><TableHead className="text-[10px]">Commitment</TableHead><TableHead className="text-[10px]">Owner</TableHead><TableHead className="text-[10px]">Due</TableHead><TableHead className="text-[10px]">Status</TableHead></TableRow></TableHeader>
                <TableBody>{approvedCommitments.map((c: any) => (
                  <TableRow key={c.id}><TableCell className="text-xs">{c.description}</TableCell><TableCell className="text-xs">{c.ownerId === agent?.id ? "Agent" : "Coach"}</TableCell><TableCell className="text-xs">{c.dueDate ? safeFormat(c.dueDate, "MMM d") : "—"}</TableCell><TableCell><Badge variant="secondary" className="text-[10px]">{c.status}</Badge></TableCell></TableRow>
                ))}</TableBody></Table>
              </CardContent>
            </Card>
          )}

          <div className="flex justify-end">
            <Button onClick={() => setActiveStage("Schedule Next")}>
              Schedule Next Session <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* ═══ SCHEDULE NEXT STAGE ═══ */}
      {activeStage === "Schedule Next" && (
        <div className="space-y-4">
          <h2 className="text-base font-semibold">Schedule Next Coaching Session</h2>
          <Card>
            <CardContent className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Next Session Coach</Label>
                  <Select value={nextSessionForm.nextSessionCoachId} onValueChange={(v) => setNextSessionForm(f => ({ ...f, nextSessionCoachId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select coach..." /></SelectTrigger>
                    <SelectContent>{(coaches ?? []).map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Next Session Date & Time</Label>
                  <Input type="datetime-local" value={nextSessionForm.nextSessionDate} onChange={(e) => setNextSessionForm(f => ({ ...f, nextSessionDate: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Session Type</Label>
                  <Select value={nextSessionForm.nextSessionType} onValueChange={(v) => setNextSessionForm(f => ({ ...f, nextSessionType: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["Standard COACH Session","Pipeline and Performance Session","Sales Capability Session","Culture and Accountability Session","Performance Reset Session","Performance Reset Checkpoint","Productive-Agent Strategy Session","Custom Coaching Session"].map(t => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Reason for skipping (optional)</Label>
                  <Input value={nextSessionForm.noNextSessionReason} onChange={(e) => setNextSessionForm(f => ({ ...f, noNextSessionReason: e.target.value }))} placeholder="Only if not scheduling now..." />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => {
                  if (!nextSessionForm.noNextSessionReason) { toast.error("Provide a reason if not scheduling next session"); return; }
                  updateSession.mutate({ sessionId, noNextSessionReason: nextSessionForm.noNextSessionReason });
                  toast.success("Session finalized without next session");
                  navigate(`/coaching/agent/${agent?.id}`);
                }}>
                  Skip (with reason)
                </Button>
                <Button onClick={() => {
                  if (!nextSessionForm.nextSessionDate || !nextSessionForm.nextSessionCoachId) { toast.error("Next session date and coach are required"); return; }
                  updateSession.mutate({
                    sessionId,
                    nextSessionCoachId: Number(nextSessionForm.nextSessionCoachId),
                    nextSessionDate: new Date(nextSessionForm.nextSessionDate).toISOString(),
                    nextSessionType: nextSessionForm.nextSessionType,
                    status: "Completed",
                  });
                  toast.success("Next session scheduled — session complete!");
                  navigate(`/coaching/agent/${agent?.id}`);
                }}>
                  <CalendarDays className="h-3.5 w-3.5 mr-1" />Schedule & Finalize
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Warning if > 14 days */}
          {nextSessionForm.nextSessionDate && (() => {
            const diff = (new Date(nextSessionForm.nextSessionDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
            if (diff > 14) return (
              <Card className="border-amber-200 bg-amber-50/50">
                <CardContent className="p-3 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
                  <p className="text-xs text-amber-800">Next session is more than 14 days away. Coaching cadence requires sessions within 14 days.</p>
                </CardContent>
              </Card>
            );
            return null;
          })()}
        </div>
      )}

      {/* ═══ UPLOAD DIALOG ═══ */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Upload Session Content</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">Upload audio, video, transcript, or notetaker export. Supported formats: MP3, WAV, WEBM, MP4, TXT, PDF, DOCX.</p>
            <div className="rounded-lg border-2 border-dashed p-8 text-center">
              <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
              <p className="text-sm font-medium">Drop file here or click to browse</p>
              <input
                type="file"
                accept="audio/*,video/*,.txt,.pdf,.docx,.doc"
                className="absolute inset-0 opacity-0 cursor-pointer"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const formData = new FormData();
                  if (file.type.startsWith("audio/") || file.type.startsWith("video/")) {
                    formData.append("audio", file);
                    try {
                      const res = await fetch("/api/voice/upload", { method: "POST", body: formData });
                      const { url, fileKey } = await res.json();
                      updateSession.mutate({ sessionId, recordingFileUrl: url, recordingFileKey: fileKey });
                      toast.success("Audio uploaded — transcription will be triggered on AI Process");
                      setShowUploadDialog(false);
                    } catch { toast.error("Upload failed"); }
                  } else {
                    // Text-based file: read and paste into transcript
                    const text = await file.text();
                    setTranscript(text);
                    updateSession.mutate({ sessionId, transcript: text });
                    toast.success("Transcript loaded");
                    setShowUploadDialog(false);
                  }
                }}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Or paste content directly:</Label>
              <Textarea
                placeholder="Paste transcript, notetaker output, or session notes..."
                rows={5}
                className="text-xs"
                onBlur={(e) => {
                  if (e.target.value) {
                    setTranscript(e.target.value);
                    updateSession.mutate({ sessionId, transcript: e.target.value });
                    toast.success("Content saved");
                    setShowUploadDialog(false);
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUploadDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
