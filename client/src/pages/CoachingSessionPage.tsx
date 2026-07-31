import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  AlertTriangle,
  Loader2,
  Sparkles,
  Save,
  User,
  ClipboardList,
  Edit2,
  RefreshCw,
} from "lucide-react";
import { safeFormat } from "@/lib/safeFormat";
import { toast } from "sonner";

const SESSION_STATUS_COLORS: Record<string, string> = {
  Scheduled: "bg-blue-100 text-blue-700",
  "In Progress": "bg-amber-100 text-amber-700",
  Completed: "bg-emerald-100 text-emerald-700",
  Canceled: "bg-gray-100 text-gray-500",
  "No Show": "bg-red-100 text-red-700",
};

export default function CoachingSessionPage() {
  const { id } = useParams<{ id: string }>();
  const sessionId = Number(id);
  const [, navigate] = useLocation();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>(null);

  const utils = trpc.useUtils();

  const { data, isLoading, error } = trpc.coaching.getSession.useQuery({ sessionId });

  const updateSession = trpc.coaching.updateSession.useMutation({
    onSuccess: () => {
      toast.success("Session saved");
      utils.coaching.getSession.invalidate({ sessionId });
      setEditing(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const generateSummary = trpc.coaching.generateSessionSummary.useMutation({
    onSuccess: () => {
      toast.success("AI summary generated");
      utils.coaching.getSession.invalidate({ sessionId });
    },
    onError: (e) => toast.error(e.message),
  });

  const { data: coaches } = trpc.coaching.listCoaches.useQuery();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-amber-500" />
        <p>Session not found.</p>
        <Button variant="ghost" size="sm" className="mt-3" onClick={() => navigate("/coaching")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
      </div>
    );
  }

  const { session: s, agent, scheduledCoach, actualCoach } = data as any;

  // Schema fields: status, durationMinutes, sourceNotes, transcript, primaryDiagnosis, secondaryDiagnosis
  const displayForm = form ?? {
    status: s.status,
    sessionType: s.sessionType,
    actualCoachId: s.actualCoachId ? String(s.actualCoachId) : "",
    durationMinutes: s.durationMinutes ? String(s.durationMinutes) : "",
    reasonForSession: s.reasonForSession ?? "",
    sourceNotes: s.sourceNotes ?? "",
    transcript: s.transcript ?? "",
    primaryDiagnosis: s.primaryDiagnosis ?? "",
    secondaryDiagnosis: s.secondaryDiagnosis ?? "",
    diagnosisEvidence: s.diagnosisEvidence ?? "",
    nextSessionDate: s.nextSessionDate ? safeFormat(s.nextSessionDate, "yyyy-MM-dd'T'HH:mm") : "",
    nextSessionType: s.nextSessionType ?? "",
    noNextSessionReason: s.noNextSessionReason ?? "",
  };

  function startEdit() {
    setForm({
      status: s.status,
      sessionType: s.sessionType,
      actualCoachId: s.actualCoachId ? String(s.actualCoachId) : "",
      durationMinutes: s.durationMinutes ? String(s.durationMinutes) : "",
      reasonForSession: s.reasonForSession ?? "",
      sourceNotes: s.sourceNotes ?? "",
      transcript: s.transcript ?? "",
      primaryDiagnosis: s.primaryDiagnosis ?? "",
      secondaryDiagnosis: s.secondaryDiagnosis ?? "",
      diagnosisEvidence: s.diagnosisEvidence ?? "",
      nextSessionDate: s.nextSessionDate ? safeFormat(s.nextSessionDate, "yyyy-MM-dd'T'HH:mm") : "",
      nextSessionType: s.nextSessionType ?? "",
      noNextSessionReason: s.noNextSessionReason ?? "",
    });
    setEditing(true);
  }

  function handleSave() {
    updateSession.mutate({
      sessionId,
      status: form.status,
      sessionType: form.sessionType,
      actualCoachId: form.actualCoachId ? Number(form.actualCoachId) : undefined,
      durationMinutes: form.durationMinutes ? Number(form.durationMinutes) : undefined,
      reasonForSession: form.reasonForSession || undefined,
      sourceNotes: form.sourceNotes || undefined,
      primaryDiagnosis: form.primaryDiagnosis as any || undefined,
      secondaryDiagnosis: form.secondaryDiagnosis as any || undefined,
      diagnosisEvidence: form.diagnosisEvidence || undefined,
      nextSessionDate: form.nextSessionDate || undefined,
      nextSessionType: form.nextSessionType || undefined,
      noNextSessionReason: form.noNextSessionReason || undefined,
    });
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="sm" onClick={() => agent?.id ? navigate(`/coaching/agent/${agent.id}`) : navigate("/coaching")} className="-ml-2 mt-0.5">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              {s.sessionType} Session
            </h1>
            <p className="text-sm text-muted-foreground">
              {agent?.name} · {s.sessionDate ? safeFormat(s.sessionDate, "MMMM d, yyyy h:mm a") : "Date TBD"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={SESSION_STATUS_COLORS[s.status] ?? "bg-gray-100 text-gray-600"} variant="secondary">
            {s.status}
          </Badge>
          {!editing ? (
            <Button variant="outline" size="sm" onClick={startEdit}>
              <Edit2 className="h-4 w-4 mr-1" />
              Edit
            </Button>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={() => { setEditing(false); setForm(null); }}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave} disabled={updateSession.isPending}>
                {updateSession.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                Save
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Session Info Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Agent</p>
            <p className="font-semibold text-sm mt-1">{agent?.name ?? "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Scheduled Coach</p>
            <p className="font-semibold text-sm mt-1">{scheduledCoach?.name ?? "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Actual Coach</p>
            {editing ? (
              <Select value={form.actualCoachId} onValueChange={(v) => setForm((f: any) => ({ ...f, actualCoachId: v }))}>
                <SelectTrigger className="h-7 text-xs mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {(coaches ?? []).map((c: any) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="font-semibold text-sm mt-1">{actualCoach?.name ?? "—"}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Duration</p>
            {editing ? (
              <Input
                type="number"
                value={form.durationMinutes}
                onChange={(e) => setForm((f: any) => ({ ...f, durationMinutes: e.target.value }))}
                className="h-7 text-xs mt-1"
                placeholder="min"
              />
            ) : (
              <p className="font-semibold text-sm mt-1">
                {s.durationMinutes ? `${s.durationMinutes} min` : "—"}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Status + Type (edit mode) */}
      {editing && (
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Session Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm((f: any) => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Scheduled", "In Progress", "Completed", "Canceled", "No Show"].map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Session Type</Label>
                <Select value={form.sessionType} onValueChange={(v) => setForm((f: any) => ({ ...f, sessionType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Standard COACH", "Launch Check-In", "Performance Reset", "Accountability Call", "Strategy Session", "Onboarding", "Exit Interview"].map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Reason for Session */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            Reason / Agenda
          </CardTitle>
        </CardHeader>
        <CardContent>
          {editing ? (
            <Textarea
              value={form.reasonForSession}
              onChange={(e) => setForm((f: any) => ({ ...f, reasonForSession: e.target.value }))}
              placeholder="Agenda, focus areas, context before the session..."
              rows={3}
            />
          ) : (
            <p className="text-sm whitespace-pre-wrap text-muted-foreground">
              {s.reasonForSession || <span className="italic">No agenda notes</span>}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Source Notes */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Edit2 className="h-4 w-4" />
            Session Notes
          </CardTitle>
        </CardHeader>
        <CardContent>
          {editing ? (
            <Textarea
              value={form.sourceNotes}
              onChange={(e) => setForm((f: any) => ({ ...f, sourceNotes: e.target.value }))}
              placeholder="What was discussed during the session?"
              rows={6}
            />
          ) : (
            <p className="text-sm whitespace-pre-wrap text-muted-foreground">
              {s.sourceNotes || <span className="italic">No session notes</span>}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Transcript */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <User className="h-4 w-4" />
            Transcript / Raw Notes
          </CardTitle>
        </CardHeader>
        <CardContent>
          {editing ? (
            <Textarea
              value={form.transcript}
              onChange={(e) => setForm((f: any) => ({ ...f, transcript: e.target.value }))}
              placeholder="Paste call transcript or verbatim notes here for AI analysis..."
              rows={8}
            />
          ) : (
            <p className="text-sm whitespace-pre-wrap text-muted-foreground font-mono text-xs">
              {s.transcript || <span className="italic font-sans text-sm">No transcript</span>}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Diagnosis */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Four-C Diagnosis</CardTitle>
        </CardHeader>
        <CardContent>
          {editing ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Primary Diagnosis</Label>
                  <Select
                    value={form.primaryDiagnosis || "none"}
                    onValueChange={(v) => setForm((f: any) => ({ ...f, primaryDiagnosis: v === "none" ? "" : v }))}
                  >
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {["Commitment", "Capability", "Cadence", "Capacity"].map(d => (
                        <SelectItem key={d} value={d}>{d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Secondary Diagnosis</Label>
                  <Select
                    value={form.secondaryDiagnosis || "none"}
                    onValueChange={(v) => setForm((f: any) => ({ ...f, secondaryDiagnosis: v === "none" ? "" : v }))}
                  >
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {["Commitment", "Capability", "Cadence", "Capacity"].map(d => (
                        <SelectItem key={d} value={d}>{d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Diagnosis Evidence</Label>
                <Textarea
                  value={form.diagnosisEvidence}
                  onChange={(e) => setForm((f: any) => ({ ...f, diagnosisEvidence: e.target.value }))}
                  placeholder="Evidence supporting this diagnosis..."
                  rows={2}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {s.primaryDiagnosis ? (
                <div className="flex gap-2 flex-wrap">
                  <Badge variant="secondary" className="bg-violet-100 text-violet-700">
                    Primary: {s.primaryDiagnosis}
                  </Badge>
                  {s.secondaryDiagnosis && (
                    <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                      Secondary: {s.secondaryDiagnosis}
                    </Badge>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">No diagnosis recorded</p>
              )}
              {s.diagnosisEvidence && (
                <p className="text-sm text-muted-foreground">{s.diagnosisEvidence}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Next Session (edit mode) */}
      {editing && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Next Session</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Next Session Date</Label>
                <Input
                  type="datetime-local"
                  value={form.nextSessionDate}
                  onChange={(e) => setForm((f: any) => ({ ...f, nextSessionDate: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Next Session Type</Label>
                <Select value={form.nextSessionType || "none"} onValueChange={(v) => setForm((f: any) => ({ ...f, nextSessionType: v === "none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {["Standard COACH", "Launch Check-In", "Performance Reset", "Accountability Call", "Strategy Session"].map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="mt-3 space-y-1.5">
              <Label>No Next Session Reason (if not scheduling)</Label>
              <Textarea
                value={form.noNextSessionReason}
                onChange={(e) => setForm((f: any) => ({ ...f, noNextSessionReason: e.target.value }))}
                placeholder="Why no next session is being scheduled..."
                rows={2}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* AI Summary */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-violet-600" />
              AI Session Summary
            </CardTitle>
            {(s.sourceNotes || s.transcript) && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => generateSummary.mutate({ sessionId })}
                disabled={generateSummary.isPending}
              >
                {generateSummary.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
                {s.aiSummary ? "Regenerate" : "Generate"}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {s.aiSummary ? (
            <div className="space-y-3">
              <p className="text-sm whitespace-pre-wrap">{s.aiSummary}</p>
              {s.aiRecommendedCommitments && (() => {
                try {
                  const commitments = JSON.parse(s.aiRecommendedCommitments);
                  if (commitments.length > 0) {
                    return (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2">AI-Suggested Commitments ({commitments.length})</p>
                        <ul className="space-y-1">
                          {commitments.map((c: any, i: number) => (
                            <li key={i} className="text-sm flex items-start gap-2">
                              <span className="text-violet-500 mt-0.5">•</span>
                              <span>{c.description}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  }
                } catch {}
                return null;
              })()}
              <p className="text-xs text-muted-foreground">
                AI processing status: {s.aiProcessingStatus}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">
              {s.sourceNotes || s.transcript
                ? "Click Generate to create an AI summary of this session."
                : "Add session notes or transcript to enable AI summary generation."}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Next Session info (view mode) */}
      {!editing && s.nextSessionDate && (
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Next Session</p>
            <p className="text-sm font-semibold mt-1">
              {safeFormat(s.nextSessionDate, "MMMM d, yyyy h:mm a")}
              {s.nextSessionType && ` · ${s.nextSessionType}`}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
