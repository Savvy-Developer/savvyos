import { useState } from "react";
import { Check, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";

const weekLabel = (value: any) => new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

function PreparationField({ field, onSaved }: { field: any; onSaved: () => void }) {
  const [value, setValue] = useState(field.value ?? "");
  const [tone, setTone] = useState(field.tone ?? "green");
  const save = trpc.pulse.personal.saveInput.useMutation({ onSuccess: onSaved, onError: (error) => toast.error(error.message) });
  const submit = () => {
    if (field.kind === "number" && value === "") return;
    if (field.kind === "text" && field.required && !String(value).trim()) return;
    if (value !== field.value || (field.updateType === "headline" && tone !== field.tone)) save.mutate({ key: field.key, value: field.kind === "number" ? Number(value) : String(value), meetingId: field.meetingId, tone });
  };
  return <div className="border-t border-border py-4 first:border-t-0"><div className="flex items-start justify-between gap-3"><div><p className="font-medium">{field.label}{field.required ? <span className="ml-1 text-destructive">*</span> : null}</p><p className="mt-1 text-sm text-muted-foreground">{field.kind === "number" ? field.source === "automatic" ? "Review this source metric." : "Enter this week’s value." : field.updateType === "segue" ? "Share a personal or professional win." : "Share news that matters to this L10."}</p></div>{field.target !== undefined ? <span className="shrink-0 text-sm text-muted-foreground">Target {field.target ?? "—"}</span> : null}</div>{field.kind === "number" ? <Input className="mt-3 min-h-11" aria-label={field.label} type="number" inputMode="decimal" value={value} onChange={(event) => setValue(event.target.value)} onBlur={submit} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /> : <><Textarea className="mt-3 min-h-20" aria-label={field.label} value={value} onChange={(event) => setValue(event.target.value)} onBlur={submit} placeholder={field.updateType === "segue" ? "Add your Segue…" : "Add a Headline…"}/>{field.updateType === "headline" ? <div className="mt-2 flex flex-wrap gap-2">{[["green", "On track"], ["amber", "Watch"], ["red", "Needs attention"]].map(([id, label]) => <button key={id} type="button" onClick={() => { setTone(id); window.setTimeout(submit, 0); }} className={`min-h-9 rounded-full border px-3 text-sm font-medium ${tone === id ? id === "green" ? "border-emerald-600 bg-emerald-50 text-emerald-800" : id === "amber" ? "border-amber-600 bg-amber-50 text-amber-800" : "border-rose-600 bg-rose-50 text-rose-800" : "border-border"}`}>{label}</button>)}</div> : null}</>}</div>;
}

/** The weekly-preparation workflow is intentionally rendered inside My EOS. */
export function PulseWeeklyPreparation() {
  const utils = trpc.useUtils();
  const prep = trpc.pulse.personal.inputs.useQuery();
  const submit = trpc.pulse.personal.submitWeeklyPrep.useMutation({ onSuccess: () => { toast.success("Weekly preparation confirmed for this L10."); void utils.pulse.personal.inputs.invalidate(); }, onError: (error) => toast.error(error.message) });
  const withdraw = trpc.pulse.personal.withdrawWeeklyPrep.useMutation({ onSuccess: () => { toast("Weekly preparation reopened for edits."); void utils.pulse.personal.inputs.invalidate(); }, onError: (error) => toast.error(error.message) });
  if (prep.isLoading) return <Card><CardContent className="p-5"><Skeleton className="h-44 w-full"/></CardContent></Card>;
  if (prep.error || !prep.data) return <Card><CardContent className="p-5 text-sm text-muted-foreground">Weekly preparation is not available right now.</CardContent></Card>;
  if (!prep.data.meetings.length) return <Card><CardContent className="p-5 text-sm text-muted-foreground">Weekly preparation will appear here when you are added to an L10.</CardContent></Card>;
  return <section id="weekly-preparation" className="scroll-mt-6"><div className="mb-3"><p className="text-sm font-medium text-primary">Week of {weekLabel(prep.data.weekOf)}</p><h2 className="mt-1 text-xl font-semibold tracking-tight">Weekly preparation</h2><p className="mt-1 text-sm text-muted-foreground">Prepare directly in My EOS. Every value, Segue, and Headline is saved to the L10 named on its card.</p></div><div className="space-y-4">{prep.data.meetings.map((meeting: any) => { const fields = prep.data.fields.filter((field: any) => field.meetingId === meeting.id); const required = fields.filter((field: any) => field.required); const missing = required.filter((field: any) => field.value === null || String(field.value).trim() === ""); return <Card key={meeting.id} className={meeting.submitted ? "border-emerald-200" : ""}><CardHeader className="pb-2"><CardTitle className="text-lg">{meeting.name}</CardTitle><CardDescription>{meeting.submitted ? "Confirmed for this week. Reopen it to make a change." : missing.length ? `${missing.length} required preparation item${missing.length === 1 ? "" : "s"} remains.` : "Required preparation is ready to confirm."}</CardDescription></CardHeader><CardContent>{fields.map((field: any) => <PreparationField key={field.key} field={field} onSaved={() => void utils.pulse.personal.inputs.invalidate()}/>) }<div className="mt-3 flex justify-end border-t border-border pt-4">{meeting.submitted ? <Button variant="outline" disabled={withdraw.isPending} onClick={() => withdraw.mutate({ meetingId: meeting.id })}>Reopen preparation</Button> : <Button disabled={Boolean(missing.length) || submit.isPending} onClick={() => submit.mutate({ meetingId: meeting.id })}><Send className="mr-2 h-4 w-4"/>{submit.isPending ? "Confirming…" : "Confirm preparation"}</Button>}</div></CardContent></Card>; })}</div></section>;
}
