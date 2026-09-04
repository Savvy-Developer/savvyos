import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, ArrowRight, Check, Clock3, Pause, Play, Send, Timer, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { PulseInlineItemRow, PulseItemEditor } from "@/components/pulse/PulseItemEditor";
import { PulseCompletedHistory } from "@/components/pulse/PulseCompletedHistory";

const stepMeta: Record<string, { title: string; description: string }> = {
  segue: { title: "Segue", description: "Share personal and professional wins. Keep it brief and reset for the meeting." },
  scorecard: { title: "Scorecard", description: "Review each measurable. Drop off-track numbers to IDS—do not solve them here." },
  rocks: { title: "Rock Review", description: "Each Rock owner reports on track or off track. Move obstacles to IDS." },
  headlines: { title: "Headlines", description: "Share customer, employee, and operating news. Drop concerns to IDS." },
  todos: { title: "To-Do Recap", description: "Confirm last session’s commitments are done or carried forward." },
  issues: { title: "IDS", description: "Identify the real issue, discuss it directly, and solve it with clear commitments." },
  conclude: { title: "Conclude", description: "Confirm commitments, prepare cascading messages, collect ratings, and end on time." },
};

function formatTime(seconds: number) {
  const value = Math.abs(seconds);
  return `${seconds < 0 ? "+" : ""}${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}

function displayNumber(value: number | null | undefined) {
  return value == null ? "—" : new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

function UpdateList({ items }: { items: any[] }) {
  return <div className="space-y-2">{items.length ? items.map((item: any) => <div key={item.id} className="rounded-lg border border-border bg-background p-3"><p className="text-sm">{item.body}</p><p className="mt-1 text-xs text-muted-foreground">{item.authorName ?? "Participant"}</p></div>) : <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Nothing has been added yet. Add it from the dashboard or capture it below.</p>}</div>;
}

function SegueStep({ data, sessionId, onChanged }: { data: any; sessionId: string; onChanged: () => void }) {
  const [body, setBody] = useState("");
  const create = trpc.pulse.l10.createUpdate.useMutation({ onSuccess: () => { setBody(""); onChanged(); }, onError: (error) => toast.error(error.message) });
  return <div className="space-y-4"><UpdateList items={data.sections.segue}/><form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); if (body.trim()) create.mutate({ meetingId: data.meeting.id, sessionId, updateType: "segue", body: body.trim() }); }}><Input className="min-h-11" value={body} onChange={(event) => setBody(event.target.value)} placeholder="A personal or professional best…"/><Button type="submit" disabled={!body.trim() || create.isPending}>Add</Button></form></div>;
}

function ScorecardStep({ data }: { data: any }) {
  return <div className="overflow-x-auto"><table className="min-w-[620px] w-full text-sm"><thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="pb-3">Measurable</th><th className="pb-3">Owner</th><th className="pb-3">Current</th><th className="pb-3">Target</th><th className="pb-3">Signal</th></tr></thead><tbody>{data.sections.scorecard.length ? data.sections.scorecard.map((metric: any) => <tr key={metric.metricId} className="border-b last:border-0"><td className="py-4 font-medium">{metric.name}</td><td className="py-4 text-muted-foreground">{metric.owner.name}</td><td className="py-4 font-semibold">{displayNumber(metric.current?.value)}</td><td className="py-4">{displayNumber(metric.target)}</td><td className="py-4">{metric.onTarget === false ? <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">Drop to IDS</span> : metric.onTarget === true ? <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-800">On track</span> : <span className="text-muted-foreground">No value</span>}</td></tr>) : <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">No Scorecard Metrics are configured for this L10.</td></tr>}</tbody></table></div>;
}

function RocksStep({ data, onChanged }: { data: any; onChanged: () => void }) {
  const update = trpc.pulse.l10.setRockStatus.useMutation({ onSuccess: onChanged, onError: (error) => toast.error(error.message) });
  return <div className="space-y-3">{data.sections.rocks.length ? data.sections.rocks.map((rock: any) => <div key={rock.id} className="rounded-lg border border-border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{rock.title}</p><p className="mt-1 text-sm text-muted-foreground">{rock.ownerName} · {rock.percentComplete}% complete</p></div><div className="flex flex-wrap gap-2">{["on_track", "at_risk", "off_track"].map((status) => <Button key={status} size="sm" variant={rock.status === status ? "default" : "outline"} disabled={update.isPending} onClick={() => update.mutate({ meetingId: data.meeting.id, workItemId: rock.id, status: status as any })}>{status.replaceAll("_", " ")}</Button>)}</div></div></div>) : <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No Rocks are configured for review.</p>}</div>;
}

function HeadlinesStep({ data, sessionId, onChanged }: { data: any; sessionId: string; onChanged: () => void }) {
  const [body, setBody] = useState("");
  const create = trpc.pulse.l10.createUpdate.useMutation({ onSuccess: () => { setBody(""); onChanged(); }, onError: (error) => toast.error(error.message) });
  return <div className="space-y-4"><UpdateList items={data.sections.headlines}/><form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); if (body.trim()) create.mutate({ meetingId: data.meeting.id, sessionId, updateType: "headline", body: body.trim() }); }}><Input className="min-h-11" value={body} onChange={(event) => setBody(event.target.value)} placeholder="A customer, employee, or operating update…"/><Button type="submit" disabled={!body.trim() || create.isPending}>Add</Button></form></div>;
}

function TodosStep({ data, sessionId, onCreate, onChanged }: { data: any; sessionId: string; onCreate: (type: "todo" | "issue") => void; onChanged: () => void }) {
  return <div className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">Expand a commitment without leaving the running L10 to update status, details, documents, links, and comments.</p><Button type="button" onClick={() => onCreate("todo")}>Add To-Do</Button></div>{data.sections.todos.filter((todo: any) => !todo.parentWorkItemId).length ? data.sections.todos.filter((todo: any) => !todo.parentWorkItemId).map((todo: any) => <PulseInlineItemRow key={todo.id} item={todo} defaultDestinationId={data.meeting.id} sourceSessionId={sessionId} onChanged={onChanged} />) : <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No To-Dos are open.</p>}<PulseCompletedHistory contextId={data.meeting.id} initialType="todo" title="Completed To-Dos" description="Recall completed commitments from this L10 without leaving the agenda. Reopening returns the same record to this meeting." sourceSessionId={sessionId} onChanged={onChanged} /></div>;
}

function IdsStep({ data, sessionId, onCreate, onChanged }: { data: any; sessionId: string; onCreate: (type: "todo" | "issue") => void; onChanged: () => void }) {
  const issues = data.sections.issues.filter((issue: any) => issue.status !== "completed");
  return <div className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">Open an Issue in place to identify, discuss, solve, add the decision, and create follow-up context.</p><div className="flex gap-2"><Button type="button" variant="outline" onClick={() => onCreate("todo")}>Add To-Do</Button><Button type="button" onClick={() => onCreate("issue")}>Add Issue</Button></div></div><div className="space-y-3">{issues.length ? issues.map((issue: any) => <PulseInlineItemRow key={issue.id} item={issue} defaultDestinationId={data.meeting.id} sourceSessionId={sessionId} onChanged={onChanged} />) : <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No open Issues. Add a concern so IDS can start with the right work.</p>}</div><PulseCompletedHistory contextId={data.meeting.id} initialType="issue" title="Resolved Issues" description="Recall solved Issues from this L10, including the solve note and complete activity history." sourceSessionId={sessionId} onChanged={onChanged} /></div>;
}

function ConcludeStep({ data, session, elapsed, attendeeIds, setAttendeeIds, notes, setNotes, onSave, onClose }: { data: any; session: any; elapsed: number; attendeeIds: number[]; setAttendeeIds: (ids: number[]) => void; notes: string; setNotes: (value: string) => void; onSave: (changes: any) => void; onClose: () => void }) {
  const [rating, setRating] = useState<number | null>(null);
  const [cascadeBody, setCascadeBody] = useState("");
  const [targets, setTargets] = useState<string[]>([]);
  const visible = trpc.pulse.list.useQuery();
  const rate = trpc.pulse.l10.rateSession.useMutation({ onError: (error) => toast.error(error.message) });
  const draft = trpc.pulse.l10.draftCascade.useMutation({ onSuccess: () => { setCascadeBody(""); setTargets([]); toast.success("Cascading message prepared for publish at close."); }, onError: (error) => toast.error(error.message) });
  const close = trpc.pulse.l10.closeSession.useMutation({ onSuccess: (result) => { toast.success(`${result.cascadesPublished} cascading message${result.cascadesPublished === 1 ? "" : "s"} published. Session report is ready.`); onClose(); }, onError: (error) => toast.error(error.message) });
  const submitRating = (value: number) => { setRating(value); rate.mutate({ meetingId: data.meeting.id, sessionId: session.id, rating: value }); };
  const submitClose = async () => { if (!rating) { toast.error("Rate the meeting before closing it."); return; } await close.mutateAsync({ meetingId: data.meeting.id, sessionId: session.id, elapsedSeconds: elapsed, attendeeIds, notes: notes || null }); };
  return <div className="space-y-6"><section><h3 className="font-semibold">Commitments made</h3><div className="mt-2 space-y-2">{data.sections.todos.filter((todo: any) => todo.sourceSessionId === session.id).length ? data.sections.todos.filter((todo: any) => todo.sourceSessionId === session.id).map((todo: any) => <div key={todo.id} className="rounded-lg bg-muted/60 p-3 text-sm">{todo.title} · {todo.assigneeName ?? "Unassigned"}</div>) : <p className="text-sm text-muted-foreground">No new commitments were created in this session.</p>}</div></section><section><h3 className="font-semibold">Prepare a cascading message</h3><p className="mt-1 text-sm text-muted-foreground">Prepared messages publish to the selected L10s when this session closes.</p><form className="mt-3 rounded-xl border border-dashed border-border p-4" onSubmit={(event) => { event.preventDefault(); if (cascadeBody.trim() && targets.length) draft.mutate({ meetingId: data.meeting.id, sessionId: session.id, toMeetingIds: targets, body: cascadeBody.trim() }); }}><div className="flex flex-wrap gap-2">{(visible.data ?? []).filter((meeting: any) => meeting.id !== data.meeting.id && meeting.label === "level_10").map((meeting: any) => <Button key={meeting.id} type="button" size="sm" variant={targets.includes(meeting.id) ? "default" : "outline"} onClick={() => setTargets((current) => current.includes(meeting.id) ? current.filter((id) => id !== meeting.id) : [...current, meeting.id])}>{meeting.name}</Button>)}</div><Textarea className="mt-3 min-h-20" value={cascadeBody} onChange={(event) => setCascadeBody(event.target.value)} placeholder="What should the receiving L10 know or carry forward?"/><Button type="submit" className="mt-3" disabled={!cascadeBody.trim() || !targets.length || draft.isPending}><Send className="mr-2 h-4 w-4"/>{draft.isPending ? "Preparing…" : "Prepare message"}</Button></form></section><section><h3 className="font-semibold">Rate this meeting</h3><p className="mt-1 text-sm text-muted-foreground">Your rating becomes part of this session’s health record.</p><div className="mt-3 grid grid-cols-5 gap-2 sm:grid-cols-10">{Array.from({ length: 10 }, (_, index) => index + 1).map((value) => <button type="button" key={value} aria-label={`Rate meeting ${value} out of 10`} aria-pressed={rating === value} onClick={() => submitRating(value)} className={`min-h-11 rounded-lg border font-semibold transition-colors ${rating === value ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{value}</button>)}</div></section><section><h3 className="font-semibold">Attendance</h3><div className="mt-3 grid gap-2 sm:grid-cols-2">{data.members.map((member: any) => <label key={member.id} className="flex min-h-11 items-center gap-3 rounded-lg border p-3 text-sm"><Checkbox checked={attendeeIds.includes(member.id)} onCheckedChange={(checked) => { const next = checked ? [...attendeeIds, member.id] : attendeeIds.filter((personId) => personId !== member.id); setAttendeeIds(next); onSave({ attendeeIds: next }); }}/>{member.name}</label>)}</div></section><section><Label htmlFor="l10-session-notes">Session notes</Label><Textarea id="l10-session-notes" className="mt-2 min-h-24" value={notes} onChange={(event) => setNotes(event.target.value)} onBlur={() => onSave({ notes })} placeholder="Record decisions or context that should remain with the report."/></section><Button className="min-h-11" disabled={close.isPending || rate.isPending} onClick={submitClose}>{close.isPending ? "Closing L10…" : "Close L10 & publish outcomes"}</Button></div>;
}

export default function PulseMeetingRunPage({ meetingId }: { meetingId: string }) {
  const utils = trpc.useUtils();
  const { data, isLoading, error, refetch } = trpc.pulse.l10.runner.useQuery({ meetingId }, { refetchInterval: 15_000 });
  const start = trpc.pulse.l10.startSession.useMutation({ onSuccess: () => void refetch(), onError: (error) => toast.error(error.message) });
  const update = trpc.pulse.l10.updateSession.useMutation({ onError: (error) => toast.error(error.message) });
  const [elapsed, setElapsed] = useState(0);
  const [activeStep, setActiveStep] = useState("");
  const [attendeeIds, setAttendeeIds] = useState<number[]>([]);
  const [notes, setNotes] = useState("");
  const [editorRequest, setEditorRequest] = useState<{ type: "todo" | "issue"; workItemId?: string } | null>(null);
  const openEditor = (item: any) => setEditorRequest({ type: item.type === "issue" ? "issue" : "todo", workItemId: item.id });
  const session = data?.activeSession as any;
  const steps = (data?.runner?.steps ?? []) as string[];
  useEffect(() => { if (!session) return; setElapsed(session.elapsedSeconds ?? 0); setActiveStep(session.activeStep); setAttendeeIds(session.attendeeIds?.length ? session.attendeeIds : data?.members.map((member: any) => member.id) ?? []); setNotes(session.notes ?? ""); }, [session?.id]);
  useEffect(() => { if (!session || session.status !== "running") return; const timer = window.setInterval(() => setElapsed((current) => current + 1), 1000); return () => window.clearInterval(timer); }, [session?.id, session?.status]);
  const stepIndex = Math.max(0, steps.indexOf(activeStep || steps[0]));
  const step = steps[stepIndex];
  const durations = (data?.runner?.durations ?? {}) as Record<string, number>;
  const totalSeconds = steps.reduce((total: number, name: string) => total + Number(durations[name] ?? 5) * 60, 0);
  const elapsedBeforeStep = steps.slice(0, stepIndex).reduce((total: number, name: string) => total + Number(durations[name] ?? 5) * 60, 0);
  const remainingStep = Number(durations[step] ?? 5) * 60 - Math.max(0, elapsed - elapsedBeforeStep);
  const persist = (changes: any) => session && update.mutate({ meetingId, sessionId: session.id, elapsedSeconds: elapsed, attendeeIds, notes, ...changes });
  const advance = (direction: -1 | 1) => { const next = steps[stepIndex + direction]; if (!next) return; setActiveStep(next); persist({ activeStep: next }); };
  const changed = () => { void utils.pulse.l10.runner.invalidate({ meetingId }); void utils.pulse.l10.dashboard.invalidate({ meetingId }); };
  if (isLoading) return <Skeleton className="h-[70vh] w-full"/>;
  if (error || !data) return <Card className="mx-auto max-w-3xl"><CardContent className="p-6">This L10 cannot be run. <Link className="underline" href={`/pulse/meetings/${meetingId}`}>Return to the workspace</Link>.</CardContent></Card>;
  if (!session) return <main className="mx-auto flex min-h-[60vh] max-w-xl items-center"><Card className="w-full"><CardHeader><CardTitle>Ready to run {data.meeting.name}?</CardTitle><CardDescription>Start a dated session. The shared timer, agenda progress, commitments, decisions, ratings, and cascades will remain with this session.</CardDescription></CardHeader><CardContent><Button className="min-h-11" disabled={start.isPending} onClick={() => start.mutate({ meetingId })}><Play className="mr-2 h-4 w-4"/>{start.isPending ? "Starting…" : "Start L10"}</Button></CardContent></Card></main>;
  const body = step === "segue" ? <SegueStep data={data} sessionId={session.id} onChanged={changed}/> : step === "scorecard" ? <ScorecardStep data={data}/> : step === "rocks" ? <RocksStep data={data} onChanged={changed}/> : step === "headlines" ? <HeadlinesStep data={data} sessionId={session.id} onChanged={changed}/> : step === "todos" ? <TodosStep data={data} sessionId={session.id} onCreate={(type) => openEditor({ type })} onChanged={changed}/> : step === "issues" ? <IdsStep data={data} sessionId={session.id} onCreate={(type) => openEditor({ type })} onChanged={changed}/> : <ConcludeStep data={data} session={session} elapsed={elapsed} attendeeIds={attendeeIds} setAttendeeIds={setAttendeeIds} notes={notes} setNotes={setNotes} onSave={persist} onClose={() => { changed(); window.location.assign(`/pulse/meetings/${meetingId}`); }}/>;
  return <main className="fixed inset-0 z-50 flex min-h-screen flex-col overflow-y-auto bg-background"><header className="border-b bg-background/95 px-4 py-3 backdrop-blur sm:px-6"><div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3"><Button asChild variant="ghost" className="min-h-11"><Link href={`/pulse/meetings/${meetingId}`}><ArrowLeft className="mr-2 h-4 w-4"/>Exit runner</Link></Button><div className="flex items-center gap-3"><div className="text-right"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Meeting timer</p><p className={`font-mono text-lg font-semibold ${totalSeconds - elapsed < 0 ? "text-amber-700" : ""}`}><Timer className="mr-1 inline h-4 w-4"/>{formatTime(totalSeconds - elapsed)} remaining</p></div><Button variant="outline" className="min-h-11" onClick={() => persist({ status: session.status === "running" ? "paused" : "running" })}>{session.status === "running" ? <><Pause className="mr-2 h-4 w-4"/>Pause</> : <><Play className="mr-2 h-4 w-4"/>Resume</>}</Button></div></div></header><Progress value={Math.min(100, (elapsed / Math.max(1, totalSeconds)) * 100)} className="h-1 rounded-none"/><div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pb-6 sm:px-6"><div className="mt-6 flex flex-wrap gap-2">{steps.map((name: string, index: number) => <button type="button" key={name} onClick={() => { setActiveStep(name); persist({ activeStep: name }); }} className={`min-h-9 rounded-full px-3 text-xs font-semibold ${index === stepIndex ? "bg-primary text-primary-foreground" : index < stepIndex ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>{index + 1}. {stepMeta[name]?.title ?? name}</button>)}</div><section className="flex flex-1 flex-col justify-center py-8"><div className="max-w-4xl"><p className="text-sm font-semibold text-primary">Step {stepIndex + 1} of {steps.length}</p><h1 className="mt-2 text-4xl font-semibold tracking-tight sm:text-5xl">{stepMeta[step]?.title ?? step}</h1><p className="mt-3 max-w-2xl text-lg leading-7 text-muted-foreground">{stepMeta[step]?.description}</p><p className={`mt-4 inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${remainingStep < 0 ? "bg-amber-100 text-amber-800" : "bg-muted text-muted-foreground"}`}><Clock3 className="mr-2 h-4 w-4"/>{remainingStep < 0 ? "Over by " : "Time left "}{formatTime(remainingStep)}</p><Card className="mt-6"><CardContent className="p-5 sm:p-6">{body}</CardContent></Card></div></section><footer className="flex items-center justify-between gap-3 border-t py-4"><Button variant="outline" className="min-h-11" disabled={stepIndex === 0} onClick={() => advance(-1)}><ArrowLeft className="mr-2 h-4 w-4"/>Back</Button><Button className="min-h-11" disabled={stepIndex === steps.length - 1} onClick={() => advance(1)}>Advance<ArrowRight className="ml-2 h-4 w-4"/></Button></footer></div><PulseItemEditor open={Boolean(editorRequest)} onOpenChange={(open) => { if (!open) setEditorRequest(null); }} workItemId={editorRequest?.workItemId} defaultType={editorRequest?.type ?? "todo"} defaultDestinationId={meetingId} sourceSessionId={session.id} onSaved={() => changed()} /></main>;
}
