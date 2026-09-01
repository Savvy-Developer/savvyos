import { useEffect, useMemo, useState } from "react";
import { Check, ClipboardCheck, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";

const weekLabel = (value: any) => new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const refreshedLabel = (value?: string | null) => value ? new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "not yet refreshed";
const rowLabels: Record<string, string> = { segue: "Segue", headline: "Headlines", brief: "Brief" };

function MetricRow({ field, onSaved }: { field: any; onSaved: () => void }) {
  const [value, setValue] = useState(field.value == null ? "" : String(field.value));
  const [approved, setApproved] = useState(Boolean(field.approved));
  const [saved, setSaved] = useState(false);
  const save = trpc.pulse.personal.saveInput.useMutation({
    onSuccess: () => { setSaved(true); onSaved(); window.setTimeout(() => setSaved(false), 1600); },
    onError: (error) => toast.error(error.message),
  });
  useEffect(() => { setValue(field.value == null ? "" : String(field.value)); setApproved(Boolean(field.approved)); }, [field.key, field.value, field.approved]);
  const persist = (nextApproved = false) => {
    if (value === "") return;
    save.mutate({ key: field.key, meetingId: field.meetingId, value: Number(value), approved: field.source === "automatic" ? nextApproved : undefined });
  };
  const manual = field.source === "manual";
  return <div className="border-t border-border py-4 first:border-t-0">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><div className="flex flex-wrap items-center gap-2"><p className="text-base font-medium">{field.label}</p><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${manual ? "bg-slate-100 text-slate-700" : "bg-sky-100 text-sky-800"}`}>{manual ? "Manual" : "Automatically Pulled"}</span></div>
        <p className="mt-1 text-sm text-muted-foreground">{manual ? "Enter the value you want to submit to this meeting." : `Pulled from ${field.pulledSource ?? "SavvyOS"} · ${field.periodLabel ?? "Current reporting period"} · refreshed ${refreshedLabel(field.lastRefreshedAt)}.`}</p></div>
      {field.target !== null && field.target !== undefined ? <span className="text-sm text-muted-foreground">Target {field.target}</span> : null}
    </div>
    <div className="mt-3 flex flex-col gap-2 sm:flex-row"><Input aria-label={field.label} className="min-h-11 text-base" inputMode="decimal" type="number" value={value} onChange={(event) => { setValue(event.target.value); setApproved(false); }} onBlur={() => persist(false)} onKeyDown={(event) => { if (event.key === "Enter") (event.currentTarget as HTMLInputElement).blur(); }} />
      {!manual ? <Button type="button" className="min-h-11 shrink-0" variant={approved ? "outline" : "default"} disabled={!value || save.isPending} onClick={() => { setApproved(true); persist(true); }}>{approved ? <><Check className="mr-2 h-4 w-4" />Approved</> : "Approve value"}</Button> : null}
    </div>
    <span aria-live="polite" className="mt-2 flex h-4 items-center text-xs text-emerald-700">{saved ? <><Check className="mr-1 h-3 w-3" />Draft saved</> : null}</span>
  </div>;
}

function TextRow({ field, onSaved }: { field: any; onSaved: () => void }) {
  const [value, setValue] = useState(field.value ?? "");
  const [tone, setTone] = useState(field.tone ?? "green");
  const [saved, setSaved] = useState(false);
  const save = trpc.pulse.personal.saveInput.useMutation({ onSuccess: () => { setSaved(true); onSaved(); window.setTimeout(() => setSaved(false), 1600); }, onError: (error) => toast.error(error.message) });
  useEffect(() => { setValue(field.value ?? ""); setTone(field.tone ?? "green"); }, [field.key, field.value, field.tone]);
  const persist = (nextTone = tone) => {
    if (value === field.value && nextTone === field.tone) return;
    save.mutate({ key: field.key, meetingId: field.meetingId, value, tone: field.updateType === "headline" ? nextTone : undefined });
  };
  const description = field.updateType === "segue" ? "Share a win, a personal note, or a quick check-in." : field.updateType === "headline" ? "Share the business news or update this meeting should know." : "Add a concise brief to frame what needs the meeting’s attention.";
  return <div className="border-t border-border py-4 first:border-t-0"><p className="text-base font-medium">{rowLabels[field.updateType] ?? field.label}</p><p className="mt-1 text-sm text-muted-foreground">{description}</p><Textarea aria-label={field.label} className="mt-3 min-h-24 text-base" value={value} onChange={(event) => setValue(event.target.value)} onBlur={() => persist()} placeholder={`Add your ${rowLabels[field.updateType]?.toLowerCase() ?? "update"} for ${field.meetingName}…`} />
    {field.updateType === "headline" ? <div className="mt-2 flex flex-wrap gap-2"><Label className="pt-2 text-sm text-muted-foreground">Status</Label>{[["green", "On track"], ["amber", "Watch"], ["red", "Needs attention"]].map(([id, label]) => <button key={id} type="button" onClick={() => { setTone(id); window.setTimeout(() => persist(id), 0); }} className={`min-h-9 rounded-full border px-3 text-sm ${tone === id ? id === "green" ? "border-emerald-600 bg-emerald-50 text-emerald-800" : id === "amber" ? "border-amber-600 bg-amber-50 text-amber-800" : "border-rose-600 bg-rose-50 text-rose-800" : "border-border"}`}>{label}</button>)}</div> : null}
    <span aria-live="polite" className="mt-2 flex h-4 items-center text-xs text-emerald-700">{saved ? <><Check className="mr-1 h-3 w-3" />Draft saved</> : null}</span>
  </div>;
}

function SubmissionCard({ meeting, fields, onChanged, onReview, reviewPending }: { meeting: any; fields: any[]; onChanged: () => void; onReview: (meetingId: string) => void; reviewPending: boolean }) {
  const metrics = fields.filter((field: any) => field.kind === "number");
  const textRows = fields.filter((field: any) => field.kind === "text");
  return <Card className={meeting.submitted ? "border-emerald-300" : ""}><CardHeader className="border-b border-border"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold text-primary">Destination meeting</p><CardTitle className="mt-1 text-xl">{meeting.name}</CardTitle><CardDescription className="mt-2">{meeting.submitted ? "Submitted for this week. Your saved receipt is below." : meeting.complete ? "Measurables are ready. You can review exactly what will be submitted." : `${meeting.incompleteMetrics} measurable${meeting.incompleteMetrics === 1 ? " needs" : "s need"} a value or approval before submission.`}</CardDescription></div>{meeting.submitted ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1.5 text-sm font-semibold text-emerald-800"><Check className="h-4 w-4" />Complete</span> : null}</div></CardHeader>
    <CardContent className="divide-y divide-border"><section className="py-4 first:pt-0"><div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold">Measurables</h2><p className="mt-1 text-sm text-muted-foreground">Your owned scorecard inputs for {meeting.name}.</p></div><span className="text-sm text-muted-foreground">{metrics.length}</span></div>{metrics.length ? <div className="mt-3">{metrics.map((field: any) => <MetricRow key={field.key} field={field} onSaved={onChanged} />)}</div> : <p className="mt-3 rounded-lg bg-muted p-3 text-sm leading-6 text-muted-foreground">No measurables are assigned to you in {meeting.name}. You can still add a segue, headlines, and a brief for {meeting.name}.</p>}</section>
      <section className="py-4"><h2 className="font-semibold">Meeting updates</h2><p className="mt-1 text-sm text-muted-foreground">Each row is optional and saved as a draft until you submit {meeting.name}.</p>{textRows.map((field: any) => <TextRow key={field.key} field={field} onSaved={onChanged} />)}</section>
      <div className="flex justify-end pt-4">{meeting.submitted ? <span className="text-sm text-muted-foreground">This meeting is complete. You may submit other meetings independently.</span> : <Button type="button" className="min-h-11" disabled={!meeting.complete || reviewPending} onClick={() => onReview(meeting.id)}><ClipboardCheck className="mr-2 h-4 w-4" />Review submission</Button>}</div>
    </CardContent>
  </Card>;
}

export default function PulseMyInputsPage() {
  const utils = trpc.useUtils();
  const { data, isLoading, error, refetch } = trpc.pulse.personal.inputs.useQuery();
  const [review, setReview] = useState<{ meeting: any; fields: any[] } | null>(null);
  const [reviewPending, setReviewPending] = useState(false);
  const submit = trpc.pulse.personal.submitWeeklyPrep.useMutation({ onSuccess: () => { toast.success("Weekly Prep submitted. A receipt is on its way."); setReview(null); void utils.pulse.personal.inputs.invalidate(); }, onError: (error) => toast.error(error.message) });
  const withdraw = trpc.pulse.personal.withdrawWeeklyPrep.useMutation({ onSuccess: () => { toast("Weekly Prep reopened for edits."); void utils.pulse.personal.inputs.invalidate(); }, onError: (error) => toast.error(error.message) });
  const history = useMemo(() => data?.history ?? [], [data?.history]);
  const beginReview = async (meetingId: string) => {
    setReviewPending(true);
    const result = await refetch();
    const source = result.data ?? data;
    const meeting = source?.meetings.find((entry: any) => entry.id === meetingId);
    if (meeting) setReview({ meeting, fields: source?.fields.filter((field: any) => field.meetingId === meetingId) ?? [] });
    setReviewPending(false);
  };
  if (isLoading) return <main className="mx-auto max-w-4xl space-y-4"><Skeleton className="h-24 w-full" /><Skeleton className="h-96 w-full" /></main>;
  if (error || !data) return <main className="mx-auto max-w-3xl"><Card><CardContent className="p-6">Weekly Prep is not available right now.</CardContent></Card></main>;
  if (!data.meetings.length) return <main className="mx-auto max-w-3xl"><Card><CardContent className="p-6"><p className="font-medium">You are not assigned to a Pulse meeting yet.</p><p className="mt-2 text-muted-foreground">When you are added to a meeting, its preparation card will appear here.</p></CardContent></Card></main>;
  return <main className="mx-auto max-w-4xl space-y-5 pb-10"><header className="border-b border-border pb-5"><p className="text-sm font-medium text-primary">Pulse · Week of {weekLabel(data.weekOf)}</p><h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Weekly Preparation</h1><p className="mt-2 max-w-3xl text-base leading-6 text-muted-foreground">Prepare one meeting at a time. Drafts remain separate from submissions, so you can complete {data.meetings.filter((meeting: any) => meeting.submitted).length} of {data.meetings.length} meetings now and return to the rest later.</p></header>
    <div className="space-y-5">{data.meetings.map((meeting: any) => <SubmissionCard key={meeting.id} meeting={meeting} fields={data.fields.filter((field: any) => field.meetingId === meeting.id)} onChanged={() => void utils.pulse.personal.inputs.invalidate()} onReview={beginReview} reviewPending={reviewPending} />)}</div>
    <Card><CardHeader><CardTitle className="text-lg">Submission history</CardTitle><CardDescription>Recent weekly-prep receipts remain readable by destination meeting.</CardDescription></CardHeader><CardContent className="divide-y divide-border">{history.map((entry: any) => <div key={entry.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0"><div><p className="font-medium">{entry.meetingName}</p><p className="text-sm text-muted-foreground">Week of {weekLabel(entry.weekOf)} · submitted {new Date(entry.submittedAt).toLocaleString()}</p></div>{entry.withdrawnAt ? <span className="text-sm text-muted-foreground">Reopened</span> : entry.emailSentAt ? <span className="text-sm text-emerald-700">Receipt emailed</span> : <span className="text-sm text-muted-foreground">Receipt processing</span>}{String(entry.weekOf).slice(0, 10) === String(data.weekOf).slice(0, 10) && !entry.withdrawnAt ? <Button type="button" variant="outline" className="min-h-11" disabled={withdraw.isPending} onClick={() => withdraw.mutate({ meetingId: entry.meetingId })}>Reopen</Button> : null}</div>)}{!history.length ? <p className="py-2 text-sm text-muted-foreground">No weekly-prep submissions yet.</p> : null}</CardContent></Card>
    <Dialog open={Boolean(review)} onOpenChange={(open) => !open && setReview(null)}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Review submission for {review?.meeting.name}</DialogTitle><DialogDescription>Confirming saves only these completed drafts into {review?.meeting.name}. Blank optional updates are not included.</DialogDescription></DialogHeader><div className="divide-y divide-border rounded-lg border border-border">{review?.fields.map((field: any) => <div key={field.key} className="p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium">{field.label}</p>{field.kind === "number" ? <span className="text-xs font-semibold text-muted-foreground">{field.source === "automatic" ? "Automatically Pulled" : "Manual"}{field.source === "automatic" && field.approved ? " · Approved" : ""}</span> : null}</div><p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{field.value === null || field.value === undefined || field.value === "" ? "Not included" : String(field.value)}</p>{field.periodLabel ? <p className="mt-1 text-xs text-muted-foreground">Reporting period: {field.periodLabel}</p> : null}</div>)}</div><DialogFooter><Button type="button" variant="outline" className="min-h-11" onClick={() => setReview(null)}>Keep editing</Button><Button type="button" className="min-h-11" disabled={!review?.meeting.complete || submit.isPending} onClick={() => review && submit.mutate({ meetingId: review.meeting.id })}>{submit.isPending ? "Submitting…" : <><Send className="mr-2 h-4 w-4" />Confirm submission</>}</Button></DialogFooter></DialogContent></Dialog>
  </main>;
}
