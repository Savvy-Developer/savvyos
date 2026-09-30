import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Brain, CalendarDays, Check, CheckCircle2, ChevronDown, CircleAlert, ExternalLink, FileText, ListChecks, Loader2, Plus, RefreshCw, Sparkles, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { safeFormatET } from "@/lib/safeFormat";

type CommitmentDraft = { description: string; ownerId: number; dueDate: string; status: "Open" | "In Progress" | "Completed" | "Dismissed" };
type IssueDraft = { title: string; details: string; requiresHrAttention: boolean; status: "Open" | "Resolved" | "Dismissed" };
type MeetingDraft = {
  meetingSummary: string;
  employeeFeedback: string;
  supportRequests: string;
  processIdeas: string;
  professionalDevelopment: string;
  followUps: string;
  leadershipAttention: string;
  commitments: CommitmentDraft[];
  issues: IssueDraft[];
};

const emptyDraft = (): MeetingDraft => ({
  meetingSummary: "",
  employeeFeedback: "",
  supportRequests: "",
  processIdeas: "",
  professionalDevelopment: "",
  followUps: "",
  leadershipAttention: "",
  commitments: [],
  issues: [],
});

function transcriptText(value: string) {
  return value.normalize("NFC").replace(/\u0000/g, "").replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/\r\n?/g, "\n");
}

function toDraft(value: any, employeeId: number, leaderId: number): MeetingDraft {
  const fallback = emptyDraft();
  if (!value || typeof value !== "object") return fallback;
  const text = (key: keyof MeetingDraft) => typeof value[key] === "string" ? value[key] : "";
  return {
    meetingSummary: text("meetingSummary"),
    employeeFeedback: text("employeeFeedback"),
    supportRequests: text("supportRequests"),
    processIdeas: text("processIdeas"),
    professionalDevelopment: text("professionalDevelopment"),
    followUps: text("followUps"),
    leadershipAttention: text("leadershipAttention"),
    commitments: Array.isArray(value.commitments) ? value.commitments.map((item: any) => ({
      description: typeof item?.description === "string" ? item.description : "",
      ownerId: item?.owner === "leader" ? leaderId : employeeId,
      dueDate: typeof item?.dueDate === "string" ? item.dueDate.slice(0, 10) : "",
      status: item?.status === "In Progress" ? "In Progress" : "Open",
    })).filter((item: CommitmentDraft) => item.description.trim()) : [],
    issues: Array.isArray(value.issues) ? value.issues.map((item: any) => ({
      title: typeof item?.title === "string" ? item.title : "",
      details: typeof item?.details === "string" ? item.details : "",
      requiresHrAttention: Boolean(item?.requiresHrAttention),
      status: "Open",
    })).filter((item: IssueDraft) => item.title.trim()) : [],
  };
}

function SectionEditor({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return <div className="grid gap-2"><Label>{label}</Label><Textarea value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} className="min-h-[92px] text-sm leading-relaxed" /></div>;
}

export default function OneOnOneMeetingPage() {
  const { id } = useParams<{ id: string }>();
  const meetingId = Number(id);
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const fileRef = useRef<HTMLInputElement>(null);
  const { data: detail, isLoading, error, refetch } = trpc.oneOnOnes.detail.useQuery({ meetingId }, { enabled: Number.isFinite(meetingId) && meetingId > 0 });
  const [transcript, setTranscript] = useState("");
  const [draft, setDraft] = useState<MeetingDraft>(emptyDraft);
  const [nextScheduledAt, setNextScheduledAt] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("45");

  useEffect(() => {
    if (!detail) return;
    setTranscript(detail.meeting.transcript ?? "");
    const nextDraft = detail.aiDraft ? toDraft(detail.aiDraft, detail.meeting.employeeId, detail.meeting.leaderId) : {
      ...emptyDraft(),
      meetingSummary: detail.meeting.meetingSummary ?? "",
      employeeFeedback: detail.meeting.employeeFeedback ?? "",
      supportRequests: detail.meeting.supportRequests ?? "",
      processIdeas: detail.meeting.processIdeas ?? "",
      professionalDevelopment: detail.meeting.professionalDevelopment ?? "",
      followUps: detail.meeting.followUps ?? "",
      leadershipAttention: detail.meeting.leadershipAttention ?? "",
    };
    setDraft(nextDraft);
    if (detail.relationship.nextScheduledAt) {
      setNextScheduledAt(new Date(detail.relationship.nextScheduledAt).toISOString().slice(0, 16));
    }
  }, [detail]);

  const saveTranscript = trpc.oneOnOnes.updateTranscript.useMutation({
    onSuccess: async () => { toast.success("Transcript saved securely in SavvyOS"); await refetch(); },
    onError: error => toast.error(error.message),
  });
  const processTranscript = trpc.oneOnOnes.processTranscript.useMutation({
    onSuccess: async result => {
      if (detail) setDraft(toDraft(result.draft, detail.meeting.employeeId, detail.meeting.leaderId));
      toast.success(result.source === "ai" ? "AI draft prepared for review" : "Source-text draft prepared for review");
      await refetch();
    },
    onError: error => toast.error(error.message),
  });
  const generateQuestions = trpc.oneOnOnes.generateQuestions.useMutation({
    onSuccess: async result => { toast.success(`${result.questions.length} conversation prompts added`); await refetch(); },
    onError: error => toast.error(error.message),
  });
  const finalize = trpc.oneOnOnes.finalize.useMutation({
    onSuccess: async result => {
      if (result.nextMeeting?.calendar?.calendarSyncStatus === "Needs Attention") toast.warning("1:1 finalized. The next calendar event needs attention.");
      else toast.success(result.nextMeeting ? "1:1 finalized and next conversation scheduled" : "1:1 finalized in HR history");
      await utils.oneOnOnes.dashboard.invalidate();
      navigate("/hr/one-on-ones");
    },
    onError: error => toast.error(error.message),
  });
  const updateCommitmentStatus = trpc.oneOnOnes.updateCommitmentStatus.useMutation({ onSuccess: () => void refetch(), onError: error => toast.error(error.message) });
  const updateIssueStatus = trpc.oneOnOnes.updateIssueStatus.useMutation({ onSuccess: () => void refetch(), onError: error => toast.error(error.message) });
  const retryCalendarSync = trpc.oneOnOnes.retryCalendarSync.useMutation({
    onSuccess: async result => {
      if (result.calendarSyncStatus === "Synced") toast.success("Google Calendar event created.");
      else toast.warning(result.calendarSyncError || "Google Calendar is not ready for this 1:1 yet.");
      await refetch();
    },
    onError: error => toast.error(error.message),
  });

  const people = useMemo(() => detail ? [
    { id: detail.meeting.employeeId, name: detail.employee?.name ?? "Employee" },
    ...(detail.leader ? [{ id: detail.leader.id, name: detail.leader.name ?? "Leader" }] : []),
  ] : [], [detail]);

  const addCommitment = () => {
    if (!detail) return;
    setDraft(current => ({ ...current, commitments: [...current.commitments, { description: "", ownerId: detail.meeting.employeeId, dueDate: "", status: "Open" }] }));
  };
  const addIssue = () => setDraft(current => ({ ...current, issues: [...current.issues, { title: "", details: "", requiresHrAttention: false, status: "Open" }] }));
  const updateDraft = (field: keyof MeetingDraft, value: any) => setDraft(current => ({ ...current, [field]: value }));

  const process = async () => {
    if (!transcript.trim()) { toast.error("Add a transcript before creating an AI draft."); return; }
    if (transcript !== detail?.meeting.transcript) {
      try { await saveTranscript.mutateAsync({ meetingId, transcript }); } catch { return; }
    }
    processTranscript.mutate({ meetingId, forceRegenerate: Boolean(detail?.aiDraft) });
  };

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 2_000_000) { toast.error("Use a text transcript under 2 MB."); return; }
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!extension || !["txt", "md", "csv"].includes(extension)) { toast.error("Upload a TXT, MD, or CSV transcript."); return; }
    const text = transcriptText(await file.text());
    if (!text.trim()) { toast.error("That file did not contain readable transcript text."); return; }
    setTranscript(text);
    toast.success("Transcript loaded. Save it or create a review draft when ready.");
    event.target.value = "";
  };

  const finish = () => {
    if (!draft.meetingSummary.trim()) { toast.error("Write or approve a meeting summary before finalizing."); return; }
    const cleanCommitments = draft.commitments.filter(item => item.description.trim()).map(item => ({ ...item, ownerId: item.ownerId || detail?.meeting.leaderId || null, dueDate: item.dueDate || null }));
    const cleanIssues = draft.issues.filter(item => item.title.trim());
    finalize.mutate({
      meetingId,
      draft: {
        meetingSummary: draft.meetingSummary,
        employeeFeedback: draft.employeeFeedback || null,
        supportRequests: draft.supportRequests || null,
        processIdeas: draft.processIdeas || null,
        professionalDevelopment: draft.professionalDevelopment || null,
        followUps: draft.followUps || null,
        leadershipAttention: draft.leadershipAttention || null,
      },
      commitments: cleanCommitments,
      issues: cleanIssues,
      nextScheduledAt: nextScheduledAt ? new Date(nextScheduledAt).toISOString() : null,
      durationMinutes: Number(durationMinutes || 45),
    });
  };

  if (isLoading) return <div className="py-20 text-center text-sm text-muted-foreground">Loading 1:1 workspace…</div>;
  if (error || !detail) return <div className="mx-auto max-w-3xl px-4 py-12"><Button variant="outline" onClick={() => navigate("/hr/one-on-ones")}><ArrowLeft className="mr-2 h-4 w-4" />Back to 1:1 Meetings</Button><p className="mt-6 text-sm text-destructive">{error?.message ?? "This 1:1 is unavailable."}</p></div>;

  const finalized = detail.meeting.status === "Completed";
  const hasDraft = Boolean(detail.aiDraft) || detail.meeting.aiProcessingStatus === "Ready" || detail.meeting.status === "Review";
  const allQuestions = [...detail.defaultQuestions, ...detail.generatedQuestions];

  return <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 lg:px-8">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div><Button variant="ghost" size="sm" className="-ml-2" onClick={() => navigate("/hr/one-on-ones")}><ArrowLeft className="mr-1 h-4 w-4" />1:1 Meetings</Button><h1 className="mt-2 text-2xl font-bold tracking-tight">{detail.employee?.name ?? "Employee"} <span className="font-normal text-muted-foreground">with</span> {detail.leader?.name ?? "Leader"}</h1><p className="mt-1 text-sm text-muted-foreground">{detail.employee?.title ?? "Team member"} · {finalized ? "Finalized HR record" : "Private manager workspace"}</p></div>
      <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{detail.meeting.status}</Badge>{detail.meeting.scheduledAt && <Badge variant="secondary"><CalendarDays className="mr-1 h-3 w-3" />{safeFormatET(detail.meeting.scheduledAt, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</Badge>}{detail.meeting.calendarEventUrl && <Button asChild variant="outline" size="sm"><a href={detail.meeting.calendarEventUrl} target="_blank" rel="noreferrer">Calendar <ExternalLink className="ml-1 h-3.5 w-3.5" /></a></Button>}</div>
    </div>

    {detail.meeting.calendarSyncStatus !== "Synced" && <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /><div className="min-w-0"><p className="font-medium">Google Calendar event was not created</p><p className="mt-1 text-xs">{detail.meeting.calendarSyncError || "This 1:1 is not connected to Google Calendar yet."}</p><p className="mt-2 text-xs">This event belongs on {detail.leader?.name ?? "the leader"}’s connected calendar. After they connect it, return here and retry the sync.</p><div className="mt-3 flex flex-wrap gap-2"><Button asChild size="sm" variant="outline"><a href="/profile">Connect Google Calendar</a></Button><Button size="sm" onClick={() => retryCalendarSync.mutate({ meetingId })} disabled={retryCalendarSync.isPending}>{retryCalendarSync.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}Retry calendar sync</Button></div></div></div>}

    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-6">
        <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><FileText className="h-4 w-4" />Prepare with context</CardTitle><CardDescription>Bring the last conversation and open follow-through into the room before you start.</CardDescription></CardHeader><CardContent className="space-y-4">
          {detail.history[0]?.meeting ? <div className="rounded-md border bg-muted/20 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Previous 1:1 · {safeFormatET(detail.history[0].meeting.heldAt || detail.history[0].meeting.finalizedAt, { month: "short", day: "numeric", year: "numeric" })}</p><p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{detail.history[0].meeting.meetingSummary || "No summary was saved."}</p>{detail.history[0].meeting.employeeFeedback && <p className="mt-3 border-t pt-3 text-sm"><span className="font-medium">Employee feedback:</span> {detail.history[0].meeting.employeeFeedback}</p>}</div> : detail.legacyHistory[0]?.feedback ? <div className="rounded-md border bg-muted/20 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Earlier leadership 1:1 record</p><p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{detail.legacyHistory[0].feedback.summary || "No legacy summary was recorded."}</p></div> : <p className="text-sm text-muted-foreground">No prior 1:1 record for this employee and leader yet.</p>}
          <div className="grid gap-3 md:grid-cols-2"><div className="rounded-md border p-3"><div className="mb-2 flex items-center gap-2"><ListChecks className="h-4 w-4 text-primary" /><p className="text-sm font-medium">Open commitments</p></div>{detail.unresolvedCommitments.length ? <div className="space-y-2">{detail.unresolvedCommitments.map((item: any) => <div key={item.commitment.id} className="rounded bg-muted/50 p-2 text-xs"><p>{item.commitment.description}</p><p className="mt-1 text-muted-foreground">{item.ownerName ?? "Unassigned"}{item.commitment.dueDate ? ` · due ${safeFormatET(item.commitment.dueDate, { month: "short", day: "numeric" })}` : ""}</p><div className="mt-2 flex gap-2"><Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => updateCommitmentStatus.mutate({ commitmentId: item.commitment.id, status: "Completed" })}>Complete</Button><Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => updateCommitmentStatus.mutate({ commitmentId: item.commitment.id, status: "Dismissed" })}>Dismiss</Button></div></div>)}</div> : <p className="text-xs text-muted-foreground">No unresolved commitments.</p>}</div>
          <div className="rounded-md border p-3"><div className="mb-2 flex items-center gap-2"><CircleAlert className="h-4 w-4 text-amber-600" /><p className="text-sm font-medium">Unresolved issues</p></div>{detail.unresolvedIssues.length ? <div className="space-y-2">{detail.unresolvedIssues.map((item: any) => <div key={item.issue.id} className="rounded bg-muted/50 p-2 text-xs"><p className="font-medium">{item.issue.title}</p>{item.issue.details && <p className="mt-1 text-muted-foreground">{item.issue.details}</p>}<div className="mt-2 flex gap-2"><Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => updateIssueStatus.mutate({ issueId: item.issue.id, status: "Resolved" })}>Resolve</Button><Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => updateIssueStatus.mutate({ issueId: item.issue.id, status: "Dismissed" })}>Dismiss</Button></div></div>)}</div> : <p className="text-xs text-muted-foreground">No unresolved issues.</p>}</div></div>
        </CardContent></Card>

        <Card><CardHeader className="flex flex-row items-start justify-between gap-4"><div><CardTitle className="flex items-center gap-2 text-base"><Brain className="h-4 w-4" />Conversation questions</CardTitle><CardDescription>Start simple. Use the extras only if they help the conversation go somewhere useful.</CardDescription></div>{!finalized && <Button variant="outline" size="sm" onClick={() => generateQuestions.mutate({ meetingId })} disabled={generateQuestions.isPending}>{generateQuestions.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1 h-3.5 w-3.5" />}Generate more with AI</Button>}</CardHeader><CardContent><ol className="grid gap-x-6 gap-y-2 md:grid-cols-2">{allQuestions.map((question, index) => <li key={`${question}-${index}`} className="flex gap-2 text-sm leading-relaxed"><span className="text-muted-foreground">{index + 1}.</span><span>{question}</span></li>)}</ol></CardContent></Card>

        <Card><CardHeader><CardTitle className="text-base">How to have a great 1:1</CardTitle><CardDescription>Useful manager guidance, not a script.</CardDescription></CardHeader><CardContent><ul className="space-y-2 text-sm leading-relaxed text-muted-foreground"><li><span className="font-medium text-foreground">Create psychological safety:</span> Ask, then leave room for the answer. Do not rush to explain or solve.</li><li><span className="font-medium text-foreground">Listen for the real issue:</span> Clarify what happened, what it affected, and what support would change the outcome.</li><li><span className="font-medium text-foreground">End with ownership:</span> Name the next action, who owns it, and when you will inspect it together.</li><li><span className="font-medium text-foreground">Keep the record factual:</span> Save what was said and agreed, not assumptions about motive or performance.</li></ul></CardContent></Card>

        {!finalized && <Card className="border-primary/20"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Upload className="h-4 w-4" />Transcript and review draft</CardTitle><CardDescription>Upload a TXT, MD, or CSV transcript, or paste it below. SavvyOS stores the source text in this protected 1:1 record.</CardDescription></CardHeader><CardContent className="space-y-3"><input ref={fileRef} type="file" accept=".txt,.md,.csv,text/plain,text/markdown,text/csv" className="hidden" onChange={handleFile} /><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => fileRef.current?.click()}><Upload className="mr-2 h-4 w-4" />Load transcript file</Button><Button type="button" variant="outline" onClick={() => saveTranscript.mutate({ meetingId, transcript })} disabled={saveTranscript.isPending || !transcript.trim()}>{saveTranscript.isPending ? "Saving…" : "Save transcript"}</Button></div><Textarea value={transcript} onChange={event => setTranscript(event.target.value)} placeholder="Paste Zoom, Fathom, or other meeting transcript here…" className="min-h-[240px] font-mono text-xs leading-relaxed" /><div className="flex flex-col gap-3 rounded-md bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">Create a review draft</p><p className="text-xs text-muted-foreground">AI proposes the HR record. You edit, add, remove, approve, or dismiss every item before finalizing.</p></div><Button onClick={process} disabled={processTranscript.isPending || saveTranscript.isPending}>{processTranscript.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : hasDraft ? <RefreshCw className="mr-2 h-4 w-4" /> : <Sparkles className="mr-2 h-4 w-4" />}{hasDraft ? "Regenerate draft" : "Process with AI"}</Button></div></CardContent></Card>}

        {(hasDraft || finalized) && <Card className="border-primary/30"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><CheckCircle2 className="h-4 w-4" />{finalized ? "Final HR record" : "Finish 1:1"}</CardTitle><CardDescription>{finalized ? "This approved record is saved in the employee’s HR history." : "This is still a draft. Edit or remove any AI suggestion before you approve the final record."}</CardDescription></CardHeader><CardContent className="space-y-5">
          <SectionEditor label="Meeting summary" value={draft.meetingSummary} onChange={value => updateDraft("meetingSummary", value)} placeholder="What mattered in this conversation?" />
          <SectionEditor label="Employee feedback" value={draft.employeeFeedback} onChange={value => updateDraft("employeeFeedback", value)} placeholder="What did the employee say about the role, team, or company?" />
          <div className="grid gap-5 md:grid-cols-2"><SectionEditor label="Support requested" value={draft.supportRequests} onChange={value => updateDraft("supportRequests", value)} placeholder="Support, tools, clarity, or resources requested" /><SectionEditor label="Ideas or feedback for the company" value={draft.processIdeas} onChange={value => updateDraft("processIdeas", value)} placeholder="Process, team, or company ideas" /></div>
          <div className="grid gap-5 md:grid-cols-2"><SectionEditor label="Career or development" value={draft.professionalDevelopment} onChange={value => updateDraft("professionalDevelopment", value)} placeholder="Growth interests, skills, or next development area" /><SectionEditor label="Follow-up notes" value={draft.followUps} onChange={value => updateDraft("followUps", value)} placeholder="Anything to revisit at the next 1:1" /></div>
          <SectionEditor label="Leadership attention" value={draft.leadershipAttention} onChange={value => updateDraft("leadershipAttention", value)} placeholder="Only factual items leadership needs to see or act on" />

          <div className="space-y-3 rounded-lg border p-4"><div className="flex items-center justify-between"><div><h3 className="font-medium">Commitments</h3><p className="text-xs text-muted-foreground">Only leave items here when there is a specific owner and next step.</p></div>{!finalized && <Button size="sm" variant="outline" onClick={addCommitment}><Plus className="mr-1 h-3.5 w-3.5" />Add</Button>}</div>{draft.commitments.length === 0 ? <p className="text-sm text-muted-foreground">No commitments approved for this record.</p> : <div className="space-y-3">{draft.commitments.map((item, index) => <div key={index} className="grid gap-2 rounded-md border bg-muted/20 p-3 md:grid-cols-[1fr_170px_150px_34px]"><Input value={item.description} disabled={finalized} placeholder="Specific commitment" onChange={event => setDraft(current => ({ ...current, commitments: current.commitments.map((entry, itemIndex) => itemIndex === index ? { ...entry, description: event.target.value } : entry) }))} /><Select value={String(item.ownerId)} disabled={finalized} onValueChange={ownerId => setDraft(current => ({ ...current, commitments: current.commitments.map((entry, itemIndex) => itemIndex === index ? { ...entry, ownerId: Number(ownerId) } : entry) }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{people.map(person => <SelectItem key={person.id} value={String(person.id)}>{person.name}</SelectItem>)}</SelectContent></Select><Input type="date" disabled={finalized} value={item.dueDate} onChange={event => setDraft(current => ({ ...current, commitments: current.commitments.map((entry, itemIndex) => itemIndex === index ? { ...entry, dueDate: event.target.value } : entry) }))} />{!finalized && <Button size="icon" variant="ghost" aria-label="Remove commitment" onClick={() => setDraft(current => ({ ...current, commitments: current.commitments.filter((_, itemIndex) => itemIndex !== index) }))}><Trash2 className="h-4 w-4" /></Button>}</div>)}</div>}</div>
          <div className="space-y-3 rounded-lg border p-4"><div className="flex items-center justify-between"><div><h3 className="font-medium">Issues surfaced</h3><p className="text-xs text-muted-foreground">Capture the fact and decide whether HR attention is warranted.</p></div>{!finalized && <Button size="sm" variant="outline" onClick={addIssue}><Plus className="mr-1 h-3.5 w-3.5" />Add</Button>}</div>{draft.issues.length === 0 ? <p className="text-sm text-muted-foreground">No issues approved for this record.</p> : <div className="space-y-3">{draft.issues.map((item, index) => <div key={index} className="rounded-md border bg-muted/20 p-3"><div className="flex gap-2"><Input value={item.title} disabled={finalized} placeholder="Issue title" onChange={event => setDraft(current => ({ ...current, issues: current.issues.map((entry, itemIndex) => itemIndex === index ? { ...entry, title: event.target.value } : entry) }))} />{!finalized && <Button size="icon" variant="ghost" aria-label="Remove issue" onClick={() => setDraft(current => ({ ...current, issues: current.issues.filter((_, itemIndex) => itemIndex !== index) }))}><Trash2 className="h-4 w-4" /></Button>}</div><Textarea className="mt-2 min-h-[72px] text-sm" disabled={finalized} value={item.details} placeholder="Relevant detail, stated factually" onChange={event => setDraft(current => ({ ...current, issues: current.issues.map((entry, itemIndex) => itemIndex === index ? { ...entry, details: event.target.value } : entry) }))} /><div className="mt-3 flex items-center gap-2"><Checkbox id={`hr-${index}`} checked={item.requiresHrAttention} disabled={finalized} onCheckedChange={checked => setDraft(current => ({ ...current, issues: current.issues.map((entry, itemIndex) => itemIndex === index ? { ...entry, requiresHrAttention: checked === true } : entry) }))} /><Label htmlFor={`hr-${index}`} className="text-xs">Requires HR attention</Label></div></div>)}</div>}</div>
          {!finalized && <div className="rounded-lg border border-primary/20 bg-primary/5 p-4"><div className="grid gap-4 md:grid-cols-2"><div className="grid gap-2"><Label>Next 1:1 <span className="font-normal text-muted-foreground">(optional)</span></Label><Input type="datetime-local" value={nextScheduledAt} onChange={event => setNextScheduledAt(event.target.value)} /></div><div className="grid gap-2"><Label>Next duration</Label><Select value={durationMinutes} onValueChange={setDurationMinutes}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="30">30 minutes</SelectItem><SelectItem value="45">45 minutes</SelectItem><SelectItem value="60">60 minutes</SelectItem></SelectContent></Select></div></div><div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-muted-foreground">Finalizing saves only the approved content above to HR history. If scheduled, SavvyOS also attempts a Google Calendar event for the leader.</p><Button onClick={finish} disabled={finalize.isPending}>{finalize.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}Finalize 1:1</Button></div></div>}
        </CardContent></Card>}
      </div>
      <aside className="space-y-4"><Card className="sticky top-4"><CardHeader><CardTitle className="text-base">Meeting status</CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><div className="flex justify-between gap-3"><span className="text-muted-foreground">Cadence</span><span className="font-medium">Every {detail.relationship.frequencyDays} days</span></div><div className="flex justify-between gap-3"><span className="text-muted-foreground">AI draft</span><span className="font-medium">{detail.meeting.aiProcessingStatus}</span></div><div className="flex justify-between gap-3"><span className="text-muted-foreground">Calendar</span><span className="font-medium">{detail.meeting.calendarSyncStatus}</span></div>{detail.meeting.finalizedAt && <div className="border-t pt-3"><p className="text-xs text-muted-foreground">Finalized {safeFormatET(detail.meeting.finalizedAt)}</p></div>}</CardContent></Card></aside>
    </div>
  </div>;
}
