import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, RefreshCw, Target } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";

function valueLabel(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString(undefined, { maximumFractionDigits: 4 }) : "—";
}

type Draft = { value: string; note: string };

/** Reviews a selected L10's measurable drafts; final submission happens in the shared weekly-prep review below. */
export function PulseMyMeasurables({ embedded = false, meetingId }: { embedded?: boolean; meetingId?: string }) {
  const utils = trpc.useUtils();
  const prep = trpc.pulse.personal.inputs.useQuery(undefined, { refetchInterval: 15_000 });
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const save = trpc.pulse.personal.saveInput.useMutation({
    onSuccess: () => { void utils.pulse.personal.inputs.invalidate(); void utils.pulse.personal.dashboard.invalidate(); },
    onError: error => toast.error(error.message),
  });
  const refresh = trpc.pulse.personal.refreshMyMeasurable.useMutation({
    onSuccess: () => { toast.success("Measurable refreshed. Review the value before confirming weekly preparation."); void utils.pulse.personal.inputs.invalidate(); },
    onError: error => toast.error(error.message),
  });

  useEffect(() => { setDrafts({}); }, [meetingId]);
  const measurables = useMemo(() => (prep.data?.fields ?? []).filter((field: any) => field.meetingId === meetingId && field.kind === "number"), [meetingId, prep.data?.fields]);
  const draftFor = (field: any): Draft => drafts[field.key] ?? { value: field.value == null ? "" : String(field.value), note: field.note ?? "" };
  const setDraft = (field: any, change: Partial<Draft>) => setDrafts(current => ({ ...current, [field.key]: { ...draftFor(field), ...current[field.key], ...change } }));
  const saveDraft = (field: any, options?: { approve?: boolean }) => {
    const draft = draftFor(field);
    if (!Number.isFinite(Number(draft.value))) return;
    save.mutate({ key: field.key, value: Number(draft.value), meetingId: field.meetingId, note: draft.note.trim() || null, approved: options?.approve ?? field.source !== "automatic" });
  };

  if (prep.isLoading) return <section id="my-measurables" className="pulse-section scroll-mt-6"><Card><CardContent className="p-5"><Skeleton className="h-52 w-full" /></CardContent></Card></section>;
  if (prep.error || !prep.data) return <section id="my-measurables" className="pulse-section scroll-mt-6"><Card><CardContent className="p-5 text-sm text-muted-foreground">My Measurables is not available right now.</CardContent></Card></section>;

  return <section id="my-measurables" className="pulse-section scroll-mt-6">
    {!embedded ? <div><h2 className="text-xl font-semibold tracking-tight">My Measurables</h2><p className="mt-1 text-sm text-muted-foreground">Review every value and add any useful context before confirming weekly preparation.</p></div> : null}
    <Card className="pulse-card-compact mt-3">
      <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Target className="h-4 w-4 text-primary" />Review measurables</CardTitle><CardDescription>{measurables.length ? "Review pulled and manual values, then add an optional note for each measurable." : "Active measurables assigned to you will appear here."}</CardDescription></CardHeader>
      <CardContent className="space-y-2">
        {!measurables.length ? <p className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">You do not own any active measurables for this L10.</p> : measurables.map((field: any) => {
          const draft = draftFor(field);
          const automatic = field.source === "automatic";
          const reviewed = automatic && Boolean(field.approved);
          return <article key={field.key} className="rounded-md border border-border/70 bg-background/60 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><div className="flex flex-wrap items-center gap-1.5"><p className="font-medium">{field.label}</p><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${automatic ? "bg-sky-100 text-sky-800" : "bg-muted text-muted-foreground"}`}>{automatic ? "Automatically pulled" : "Manual"}</span>{reviewed ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800"><CheckCircle2 className="h-3 w-3" />Reviewed</span> : null}</div><p className="mt-0.5 text-xs text-muted-foreground">{field.periodLabel ?? "Current reporting period"}{field.target == null ? "" : ` · Target ${valueLabel(field.target)}`}</p></div>{automatic ? <Button type="button" variant="outline" size="sm" className="h-8 text-xs" disabled={refresh.isPending} onClick={() => refresh.mutate({ metricId: Number(field.key.slice(7)), meetingId })}><RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${refresh.isPending ? "animate-spin" : ""}`} />Refresh</Button> : null}</div>
            <div className="mt-3 grid gap-2 md:grid-cols-[minmax(10rem,0.3fr)_minmax(0,0.7fr)]"><div className="space-y-1"><Label htmlFor={`measurable-value-${field.key}`} className="text-xs">Value</Label>{automatic ? <div id={`measurable-value-${field.key}`} className="flex h-10 items-center rounded-md border bg-muted/50 px-3 text-sm font-semibold">{valueLabel(field.value)}</div> : <Input id={`measurable-value-${field.key}`} type="number" inputMode="decimal" value={draft.value} onChange={event => setDraft(field, { value: event.target.value })} onBlur={() => saveDraft(field)} placeholder="Enter value" />}</div><div className="space-y-1"><Label htmlFor={`measurable-note-${field.key}`} className="text-xs">Note <span className="font-normal text-muted-foreground">(optional)</span></Label><Textarea id={`measurable-note-${field.key}`} className="min-h-10 resize-y" value={draft.note} onChange={event => setDraft(field, { note: event.target.value })} onBlur={() => saveDraft(field)} placeholder="Add context for this result…" /></div></div>
            {automatic ? <div className="mt-3 flex justify-end"><Button type="button" size="sm" disabled={!Number.isFinite(Number(field.value)) || save.isPending} onClick={() => saveDraft(field, { approve: true })}><CheckCircle2 className="mr-1.5 h-4 w-4" />{reviewed ? "Review again" : "Mark reviewed"}</Button></div> : null}
          </article>;
        })}
      </CardContent>
    </Card>
  </section>;
}
