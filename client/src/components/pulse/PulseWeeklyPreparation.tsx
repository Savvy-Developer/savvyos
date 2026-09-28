import { useEffect, useMemo, useState } from "react";
import { Check, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";

const weekLabel = (value: any) => new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

function PreparationField({ field, onSaved }: { field: any; onSaved: () => void }) {
  const [value, setValue] = useState(field.value ?? "");
  const [tone, setTone] = useState(field.tone ?? "green");
  const save = trpc.pulse.personal.saveInput.useMutation({ onSuccess: onSaved, onError: (error) => toast.error(error.message) });
  useEffect(() => { setValue(field.value ?? ""); setTone(field.tone ?? "green"); }, [field.key, field.tone, field.value]);
  const submit = () => {
    if (field.kind === "number" && value === "") return;
    if (field.kind === "text" && field.required && !String(value).trim()) return;
    if (value !== field.value || (field.updateType === "headline" && tone !== field.tone)) save.mutate({ key: field.key, value: field.kind === "number" ? Number(value) : String(value), meetingId: field.meetingId, tone });
  };
  return <div className="rounded-md border border-border/70 bg-background/60 p-2"><div className="flex items-start justify-between gap-2"><div><p className="font-medium">{field.label}{field.required ? <span className="ml-1 text-destructive">*</span> : null}</p><p className="mt-0.5 text-sm text-muted-foreground">{field.kind === "number" ? field.source === "automatic" ? "Review this source metric." : "Enter this week’s value." : field.updateType === "segue" ? "Share a personal or professional win." : "Share news that matters to this L10."}</p></div>{field.target !== undefined ? <span className="shrink-0 text-sm text-muted-foreground">Target {field.target ?? "—"}</span> : null}</div>{field.kind === "number" ? <Input className="mt-1.5 h-9" aria-label={field.label} type="number" inputMode="decimal" value={value} onChange={(event) => setValue(event.target.value)} onBlur={submit} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /> : <><Textarea className="mt-1.5 min-h-16" aria-label={field.label} value={value} onChange={(event) => setValue(event.target.value)} onBlur={submit} placeholder={field.updateType === "segue" ? "Add your Segue…" : "Add a Headline…"}/>{field.updateType === "headline" ? <div className="mt-2 flex flex-wrap gap-2">{[["green", "On track"], ["amber", "Watch"], ["red", "Needs attention"]].map(([id, label]) => <button key={id} type="button" onClick={() => { setTone(id); window.setTimeout(submit, 0); }} className={`h-8 rounded-full border px-2.5 text-sm font-medium ${tone === id ? id === "green" ? "border-emerald-600 bg-emerald-50 text-emerald-800" : id === "amber" ? "border-amber-600 bg-amber-50 text-amber-800" : "border-rose-600 bg-rose-50 text-rose-800" : "border-border"}`}>{label}</button>)}</div> : null}</>}</div>;
}

function MeetingPreparationCard({ meeting, fields, onChanged }: { meeting: any; fields: any[]; onChanged: () => void }) {
  const utils = trpc.useUtils();
  const submit = trpc.pulse.personal.submitWeeklyPrep.useMutation({ onSuccess: () => { toast.success("Weekly preparation confirmed for this L10."); onChanged(); }, onError: (error) => toast.error(error.message) });
  const withdraw = trpc.pulse.personal.withdrawWeeklyPrep.useMutation({ onSuccess: () => { toast("Weekly preparation reopened for edits."); onChanged(); }, onError: (error) => toast.error(error.message) });
  const required = fields.filter((field: any) => field.required);
  const missing = required.filter((field: any) => field.value === null || String(field.value).trim() === "");
  return <Card className={`pulse-card-compact ${meeting.submitted ? "border-emerald-200" : ""}`}><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-lg">{meeting.name}{meeting.submitted ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800"><Check className="h-3.5 w-3.5" />Prepared</span> : null}</CardTitle><CardDescription>{meeting.submitted ? "Confirmed for this week. Reopen it to make a change." : missing.length ? `${missing.length} required preparation item${missing.length === 1 ? "" : "s"} remains.` : "Required preparation is ready to confirm."}</CardDescription></CardHeader><CardContent><div className="grid gap-x-4 lg:grid-cols-2">{fields.map((field: any) => <PreparationField key={field.key} field={field} onSaved={() => void utils.pulse.personal.inputs.invalidate()}/>)}</div><div className="mt-2 flex justify-end border-t border-border pt-2">{meeting.submitted ? <Button variant="outline" disabled={withdraw.isPending} onClick={() => withdraw.mutate({ meetingId: meeting.id })}>Reopen preparation</Button> : <Button disabled={Boolean(missing.length) || submit.isPending} onClick={() => submit.mutate({ meetingId: meeting.id })}><Send className="mr-2 h-4 w-4"/>{submit.isPending ? "Confirming…" : "Confirm preparation"}</Button>}</div></CardContent></Card>;
}

export function PulseWeeklyPreparation() {
  const utils = trpc.useUtils();
  const prep = trpc.pulse.personal.inputs.useQuery();
  const [activeMeetingId, setActiveMeetingId] = useState("");
  const activeId = activeMeetingId || prep.data?.meetings[0]?.id || "";
  useEffect(() => {
    if (activeMeetingId && !(prep.data?.meetings ?? []).some((meeting: any) => meeting.id === activeMeetingId)) setActiveMeetingId("");
  }, [activeMeetingId, prep.data?.meetings]);
  const meetingFields = useMemo(() => (prep.data?.fields ?? []).filter((field: any) => field.meetingId === activeId), [activeId, prep.data?.fields]);
  if (prep.isLoading) return <Card><CardContent className="p-5"><Skeleton className="h-44 w-full"/></CardContent></Card>;
  if (prep.error || !prep.data) return <Card><CardContent className="p-5 text-sm text-muted-foreground">Weekly preparation is not available right now.</CardContent></Card>;
  if (!prep.data.meetings.length) return <Card><CardContent className="p-5 text-sm text-muted-foreground">Weekly preparation will appear here when you are added to an L10.</CardContent></Card>;
  const activeMeeting = prep.data.meetings.find((meeting: any) => meeting.id === activeId) ?? prep.data.meetings[0];
  return <section id="weekly-preparation" className="pulse-section scroll-mt-6"><div><p className="text-sm font-medium text-primary">Week of {weekLabel(prep.data.weekOf)}</p><h2 className="mt-1 text-xl font-semibold tracking-tight">Weekly preparation</h2><p className="mt-1 text-sm text-muted-foreground">Choose one L10 at a time. Every value, Segue, and Headline stays saved to its selected meeting.</p></div><Tabs value={activeId} onValueChange={setActiveMeetingId} className="mt-3"><div className="max-w-full overflow-x-auto pb-1"><TabsList className="h-auto min-w-max justify-start">{prep.data.meetings.map((meeting: any) => <TabsTrigger key={meeting.id} value={meeting.id} className="min-h-9">{meeting.name}{meeting.incompleteMetrics ? <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">{meeting.incompleteMetrics}</span> : meeting.submitted ? <Check className="ml-1 h-3.5 w-3.5 text-emerald-600" /> : null}</TabsTrigger>)}</TabsList></div>{prep.data.meetings.map((meeting: any) => <TabsContent key={meeting.id} value={meeting.id} className="mt-0"><MeetingPreparationCard meeting={meeting} fields={meeting.id === activeMeeting.id ? meetingFields : prep.data.fields.filter((field: any) => field.meetingId === meeting.id)} onChanged={() => void utils.pulse.personal.inputs.invalidate()} /></TabsContent>)}</Tabs></section>;
}
