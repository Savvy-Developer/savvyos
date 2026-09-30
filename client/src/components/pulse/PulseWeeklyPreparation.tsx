import { useEffect, useMemo, useState } from "react";
import { Check, CheckCircle2, FileText, Send, Target } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";

const weekLabel = (value: any) => new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const valueLabel = (value: unknown) => Number.isFinite(Number(value)) ? Number(value).toLocaleString(undefined, { maximumFractionDigits: 4 }) : "—";
const titleCase = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase());

function PreparationField({ field, onSaved }: { field: any; onSaved: () => void }) {
  const [value, setValue] = useState(field.value ?? "");
  const [tone, setTone] = useState(field.tone ?? "green");
  const save = trpc.pulse.personal.saveInput.useMutation({ onSuccess: onSaved, onError: error => toast.error(error.message) });
  useEffect(() => { setValue(field.value ?? ""); setTone(field.tone ?? "green"); }, [field.key, field.tone, field.value]);
  const persist = () => {
    if (field.kind === "text" && field.required && !String(value).trim()) return;
    if (value !== field.value || (field.updateType === "headline" && tone !== field.tone)) save.mutate({ key: field.key, value: String(value), meetingId: field.meetingId, tone });
  };
  return <div className="rounded-md border border-border/70 bg-background/60 p-2"><div className="flex items-start justify-between gap-2"><div><p className="font-medium">{field.label}</p><p className="mt-0.5 text-sm text-muted-foreground">{field.updateType === "segue" ? "Share a personal or professional win." : field.updateType === "brief" ? "Share a concise meeting brief." : "Share news that matters to this L10."}</p></div></div><Textarea className="mt-1.5 min-h-16" aria-label={field.label} value={value} onChange={event => setValue(event.target.value)} onBlur={persist} placeholder={field.updateType === "segue" ? "Add your Segue…" : field.updateType === "brief" ? "Add your Brief…" : "Add a Headline…"}/>{field.updateType === "headline" ? <div className="mt-2 flex flex-wrap gap-2">{[["green", "On track"], ["amber", "Watch"], ["red", "Needs attention"]].map(([id, label]) => <button key={id} type="button" onClick={() => { setTone(id); window.setTimeout(persist, 0); }} className={`h-8 rounded-full border px-2.5 text-sm font-medium ${tone === id ? id === "green" ? "border-emerald-600 bg-emerald-50 text-emerald-800" : id === "amber" ? "border-amber-600 bg-amber-50 text-amber-800" : "border-rose-600 bg-rose-50 text-rose-800" : "border-border"}`}>{label}</button>)}</div> : null}</div>;
}

function WeeklyPreparationReviewCard({ meeting, fields, rocks, onChanged }: { meeting: any; fields: any[]; rocks: any[]; onChanged: () => void }) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const submit = trpc.pulse.personal.submitWeeklyPrep.useMutation({ onSuccess: () => { toast.success("Weekly preparation confirmed. A detailed confirmation email is on its way."); setOpen(false); onChanged(); void utils.pulse.personal.dashboard.invalidate(); }, onError: error => toast.error(error.message) });
  const withdraw = trpc.pulse.personal.withdrawWeeklyPrep.useMutation({ onSuccess: () => { toast("Weekly preparation reopened for edits."); setOpen(false); onChanged(); void utils.pulse.personal.dashboard.invalidate(); }, onError: error => toast.error(error.message) });
  const measurableFields = fields.filter((field: any) => field.kind === "number");
  const updateFields = fields.filter((field: any) => field.kind === "text" && String(field.value ?? "").trim());
  const incomplete = measurableFields.filter((field: any) => field.value === null || String(field.value).trim() === "" || (field.source === "automatic" && !field.approved));
  const recap = <div className="max-h-[55vh] space-y-4 overflow-y-auto pr-1"><section><p className="text-sm font-semibold">Measurables</p><div className="mt-1 divide-y rounded-md border">{measurableFields.map((field: any) => <div key={field.key} className="flex flex-wrap items-start justify-between gap-3 px-3 py-2.5"><div className="min-w-0"><p className="font-medium">{field.label}</p><p className="mt-0.5 text-xs text-muted-foreground">{field.source === "automatic" ? "Automatically pulled · Reviewed" : "Manual"}{field.note ? ` · ${field.note}` : ""}</p></div><p className="shrink-0 text-base font-semibold">{valueLabel(field.value)}</p></div>)}</div></section><section><p className="text-sm font-semibold">Meeting updates</p>{updateFields.length ? <div className="mt-1 divide-y rounded-md border">{updateFields.map((field: any) => <div key={field.key} className="px-3 py-2.5"><p className="font-medium">{field.label}</p><p className="mt-0.5 whitespace-pre-wrap text-sm text-muted-foreground">{field.value}</p></div>)}</div> : <p className="mt-1 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">No meeting updates added.</p>}</section><section><p className="text-sm font-semibold">Rocks reviewed</p>{rocks.length ? <div className="mt-1 divide-y rounded-md border">{rocks.map((rock: any) => <div key={rock.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5"><p className="font-medium">{rock.title}</p><p className="text-sm text-muted-foreground">{titleCase(rock.status)}{rock.percentComplete == null ? "" : ` · ${rock.percentComplete}% complete`}</p></div>)}</div> : <p className="mt-1 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">No active Rocks assigned to you in this L10.</p>}</section></div>;
  if (meeting.submitted) return <section className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/40 px-3 py-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="flex items-center gap-2 font-semibold text-emerald-900"><Check className="h-4 w-4" />Weekly preparation confirmed</p><p className="mt-0.5 text-sm text-emerald-800">Your updates, measurable review, and Rock recap were emailed to you.</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={withdraw.isPending} onClick={() => withdraw.mutate({ meetingId: meeting.id })}>Reopen preparation</Button><Button variant="outline" disabled={submit.isPending} onClick={() => setOpen(true)}>View submitted recap</Button></div></div><Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>Weekly preparation recap</DialogTitle><DialogDescription>Saved for this L10’s current preparation cycle.</DialogDescription></DialogHeader>{recap}<DialogFooter><Button onClick={() => setOpen(false)}>Done</Button></DialogFooter></DialogContent></Dialog></section>;
  return <section className="mt-3 rounded-xl border-2 border-primary/25 bg-primary/[0.035] p-3 sm:p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="flex items-center gap-2 font-semibold"><Target className="h-4 w-4 text-primary" />Ready to confirm weekly preparation?</p><p className="mt-1 text-sm text-muted-foreground">Review your measurables and Rocks below, then confirm one complete recap for this L10.</p></div><Button type="button" disabled={Boolean(incomplete.length) || submit.isPending} onClick={() => setOpen(true)}><Send className="mr-2 h-4 w-4" />Review &amp; confirm</Button></div>{incomplete.length ? <p className="mt-2 text-sm text-amber-700">Review {incomplete.map((field: any) => field.label).join(", ")} before confirming.</p> : null}<Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90vh] max-w-2xl overflow-hidden"><DialogHeader><DialogTitle>Confirm weekly preparation</DialogTitle><DialogDescription>Review what will be saved and emailed to you for this L10.</DialogDescription></DialogHeader>{recap}<DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Back to review</Button><Button type="button" disabled={submit.isPending} onClick={() => submit.mutate({ meetingId: meeting.id })}><CheckCircle2 className="mr-2 h-4 w-4" />{submit.isPending ? "Confirming…" : "Confirm weekly preparation"}</Button></DialogFooter></DialogContent></Dialog></section>;
}

function MeetingPreparationCard({ meeting, fields, onChanged, hideMeetingName = false }: { meeting: any; fields: any[]; onChanged: () => void; hideMeetingName?: boolean }) {
  const textFields = fields.filter((field: any) => field.kind === "text");
  return <Card className={`pulse-card-compact ${meeting.submitted ? "border-emerald-200" : ""}`}><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-lg">{hideMeetingName ? "Meeting updates" : meeting.name}</CardTitle><CardDescription>Add your Segue, Headlines, and Brief for this L10.</CardDescription></CardHeader><CardContent><div className="grid gap-x-4 lg:grid-cols-2">{textFields.map((field: any) => <PreparationField key={field.key} field={field} onSaved={onChanged}/>)}</div></CardContent></Card>;
}

/** Renders L10 meeting updates; the parent places one final review after measurables and Rocks. */
export function PulseWeeklyPreparation({ embedded = false, meetingId, rocks = [] }: { embedded?: boolean; meetingId?: string; rocks?: any[] }) {
  const utils = trpc.useUtils();
  const prep = trpc.pulse.personal.inputs.useQuery();
  const [activeMeetingId, setActiveMeetingId] = useState("");
  const activeId = meetingId ?? (activeMeetingId || prep.data?.meetings[0]?.id || "");
  useEffect(() => { if (!meetingId && activeMeetingId && !(prep.data?.meetings ?? []).some((meeting: any) => meeting.id === activeMeetingId)) setActiveMeetingId(""); }, [activeMeetingId, meetingId, prep.data?.meetings]);
  const meetingFields = useMemo(() => (prep.data?.fields ?? []).filter((field: any) => field.meetingId === activeId), [activeId, prep.data?.fields]);
  if (prep.isLoading) return <Card><CardContent className="p-5"><Skeleton className="h-44 w-full"/></CardContent></Card>;
  if (prep.error || !prep.data) return <Card><CardContent className="p-5 text-sm text-muted-foreground">Weekly preparation is not available right now.</CardContent></Card>;
  if (!prep.data.meetings.length) return <Card><CardContent className="p-5 text-sm text-muted-foreground">Weekly preparation will appear here when you are added to an L10.</CardContent></Card>;
  const activeMeeting = prep.data.meetings.find((meeting: any) => meeting.id === activeId) ?? prep.data.meetings[0];
  const changed = () => { void utils.pulse.personal.inputs.invalidate(); void utils.pulse.personal.dashboard.invalidate(); };
  const card = <><MeetingPreparationCard meeting={activeMeeting} fields={meetingFields} onChanged={changed} hideMeetingName={embedded && Boolean(meetingId)} />{!embedded || !meetingId ? <WeeklyPreparationReviewCard meeting={activeMeeting} fields={meetingFields} rocks={rocks} onChanged={changed} /> : null}</>;
  if (meetingId) return <section id="weekly-preparation" className="pulse-section scroll-mt-6">{!embedded ? <div><p className="text-sm font-medium text-primary">Week of {weekLabel(prep.data.weekOf)}</p><h2 className="mt-1 text-xl font-semibold tracking-tight">Weekly preparation</h2><p className="mt-1 text-sm text-muted-foreground">Prepare this L10’s updates, measurables, and Rocks together.</p></div> : null}{card}</section>;
  return <section id="weekly-preparation" className="pulse-section scroll-mt-6">{!embedded ? <div><p className="text-sm font-medium text-primary">Week of {weekLabel(prep.data.weekOf)}</p><h2 className="mt-1 text-xl font-semibold tracking-tight">Weekly preparation</h2><p className="mt-1 text-sm text-muted-foreground">Choose one L10 at a time. Every update, measurable review, and Rock recap stays saved to its selected meeting.</p></div> : null}<Tabs value={activeId} onValueChange={setActiveMeetingId} className={embedded ? "" : "mt-3"}><div className="max-w-full overflow-x-auto pb-1"><TabsList className="h-auto min-w-max justify-start">{prep.data.meetings.map((meeting: any) => <TabsTrigger key={meeting.id} value={meeting.id} className="min-h-9">{meeting.name}{meeting.incompleteMetrics ? <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">{meeting.incompleteMetrics}</span> : meeting.submitted ? <Check className="ml-1 h-3.5 w-3.5 text-emerald-600" /> : null}</TabsTrigger>)}</TabsList></div>{prep.data.meetings.map((meeting: any) => <TabsContent key={meeting.id} value={meeting.id} className="mt-0"><MeetingPreparationCard meeting={meeting} fields={meeting.id === activeMeeting.id ? meetingFields : prep.data.fields.filter((field: any) => field.meetingId === meeting.id)} onChanged={changed}/><WeeklyPreparationReviewCard meeting={meeting} fields={meeting.id === activeMeeting.id ? meetingFields : prep.data.fields.filter((field: any) => field.meetingId === meeting.id)} rocks={rocks} onChanged={changed}/></TabsContent>)}</Tabs></section>;
}

/** The My EOS footer review that follows the meeting's updates, work, Rocks, and measurable review. */
export function PulseWeeklyPreparationReview({ meetingId, rocks }: { meetingId: string; rocks: any[] }) {
  const utils = trpc.useUtils();
  const prep = trpc.pulse.personal.inputs.useQuery();
  if (prep.isLoading) return <Skeleton className="h-28 w-full" />;
  if (prep.error || !prep.data) return null;
  const meeting = prep.data.meetings.find((entry: any) => entry.id === meetingId);
  if (!meeting) return null;
  const fields = prep.data.fields.filter((field: any) => field.meetingId === meetingId);
  return <WeeklyPreparationReviewCard meeting={meeting} fields={fields} rocks={rocks} onChanged={() => { void utils.pulse.personal.inputs.invalidate(); void utils.pulse.personal.dashboard.invalidate(); }} />;
}
