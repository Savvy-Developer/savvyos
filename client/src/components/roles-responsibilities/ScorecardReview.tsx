import { useMemo, useState } from "react";
import { Archive, CheckCircle2, ChevronRight, Clock3, Pencil, RefreshCw, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { listWeeks } from "@shared/scorecard";
import { RecordMarker } from "@/components/roles-responsibilities/RecordMarker";
import ScorecardMetricEditor from "@/components/roles-responsibilities/ScorecardMetricEditor";

const stateLabels: Record<string, string> = {
  on_target: "On target",
  off_target: "Off target",
  warning: "Watch",
  missing: "Missing",
  not_due: "Not due",
  no_eligible_activity: "No eligible activity",
  target_unset: "Target unset",
  informational: "Informational",
  reported: "Reported",
};

function formatValue(metric: any, value: number | null | undefined) {
  if (value == null) return "—";
  if (metric.displayFormat === "currency") return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
  if (metric.displayFormat === "percentage") return `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
  if (metric.unit === "days") return `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} days`;
  if (metric.unit === "hours" || metric.displayFormat === "duration") return `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} hrs`;
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function targetText(metric: any) {
  const target = metric?.targetConfig ?? {};
  if (target.comparisonRule === "informational") return "Informational only";
  if (target.comparisonRule === "within_range") return target.targetMinimum == null || target.targetMaximum == null ? "Target unset" : `Between ${formatValue(metric, target.targetMinimum)} and ${formatValue(metric, target.targetMaximum)}`;
  if (target.targetValue == null) return "Target unset";
  if (target.comparisonRule === "at_most") return `No more than ${formatValue(metric, target.targetValue)}`;
  if (target.comparisonRule === "exactly") return `Exactly ${formatValue(metric, target.targetValue)}`;
  return `At least ${formatValue(metric, target.targetValue)}`;
}

function noEligibleActivityText(metric: any) {
  return metric?.zeroDenominatorLabel || "No eligible activity";
}

function StatusBadge({ status }: { status?: string | null }) {
  const normalized = status ?? "missing";
  const className = normalized === "on_target" ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100" : normalized === "warning" ? "bg-amber-100 text-amber-800 hover:bg-amber-100" : normalized === "off_target" || normalized === "missing" ? "bg-red-100 text-red-700 hover:bg-red-100" : "bg-muted text-muted-foreground hover:bg-muted";
  return <Badge className={className}>{stateLabels[normalized] ?? normalized.replace(/_/g, " ")}</Badge>;
}

function Sparkline({ metric }: { metric: any }) {
  const weeks = metric.trendWeeks ?? [];
  const values = weeks.map((week: any) => week.actual).filter((value: number | null) => value != null) as number[];
  const max = Math.max(...values.map((value) => Math.abs(value)), 1);
  return (
    <div className="flex items-end gap-1" title="Last 8 weeks">
      {weeks.map((week: any) => (
        <div key={`${week.periodStart}-${week.periodEnd}`} className="flex flex-col items-center gap-0.5">
          <RecordMarker performance={week.periodToDatePerformance} />
          <span
            className="block w-2 rounded-sm bg-primary/70"
            style={{ height: `${Math.max(4, Math.min(28, (Math.abs(week.actual ?? 0) / max) * 28))}px`, opacity: week.actual == null ? 0.18 : 0.9 }}
          />
        </div>
      ))}
    </div>
  );
}

function DetailDialog({ metric, open, onOpenChange }: { metric: any; open: boolean; onOpenChange: (open: boolean) => void }) {
  if (!metric) return null;
  const metadata = metric?.currentValue?.calculationMetadata ?? {};
  const inputs = metric?.currentValue?.supportingInputs ?? {};
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
      <DialogHeader><DialogTitle>{metric?.name}</DialogTitle><DialogDescription>{metric?.responsibility?.title} · {metric?.owner?.name ?? "Unassigned"}</DialogDescription></DialogHeader>
      <div className="space-y-5 text-sm">
        <section><p className="font-medium">Definition</p><p className="mt-1 leading-6 text-muted-foreground">{metric?.definition || "No definition has been entered."}</p></section>
        <section><p className="font-medium">How it&apos;s calculated</p><p className="mt-1 leading-6 text-muted-foreground">{metric?.howCalculated || metric?.calculationDescription || "No calculation description has been entered."}</p></section>
        <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-md bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Target for this result</p><p className="mt-1 font-medium">{targetText(metric)}</p></div><div className="rounded-md bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Status</p><div className="mt-1"><StatusBadge status={metric.statusLabel} /></div></div><div className="rounded-md bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Current result</p><p className="mt-1 inline-flex items-center gap-1.5 font-medium">{metric.currentValue?.resultState === "no_eligible_activity" ? noEligibleActivityText(metric) : formatValue(metric, metric.actual)}<RecordMarker performance={metric.periodToDatePerformance} /></p></div></div>
        {(Object.keys(inputs).length > 0 || Object.keys(metadata).length > 0) && <section><p className="font-medium">Supporting inputs</p><div className="mt-2 grid gap-2 sm:grid-cols-2">{Object.entries(inputs).map(([key, value]) => <p className="rounded border p-2" key={key}><span className="text-muted-foreground">{key.replace(/_/g, " ")}: </span><strong>{String(value)}</strong></p>)}{metadata.numerator != null && <p className="rounded border p-2"><span className="text-muted-foreground">Numerator: </span><strong>{String(metadata.numerator)}</strong></p>}{metadata.denominator != null && <p className="rounded border p-2"><span className="text-muted-foreground">Denominator: </span><strong>{String(metadata.denominator)}</strong></p>}</div></section>}
        <section><p className="font-medium">Result history</p><div className="mt-2 overflow-x-auto rounded-md border"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-muted/50 text-muted-foreground"><tr><th className="px-3 py-2 font-medium">Period / event</th><th className="px-3 py-2 font-medium">Result</th><th className="px-3 py-2 font-medium">Target at the time</th><th className="px-3 py-2 font-medium">Status</th><th className="px-3 py-2 font-medium">Note</th></tr></thead><tbody>{(metric.valueHistory ?? []).length === 0 ? <tr><td className="px-3 py-4 text-muted-foreground" colSpan={5}>No historical results yet.</td></tr> : metric.valueHistory.map((value: any) => <tr key={value.id} className="border-t"><td className="px-3 py-2">{value.eventLabel || value.eventDate || `${value.periodStart}–${value.periodEnd}`}</td><td className="px-3 py-2 font-medium"><span className="inline-flex items-center gap-1.5">{value.resultState === "no_eligible_activity" ? noEligibleActivityText(metric) : formatValue(metric, value.actual)}<RecordMarker performance={value.periodToDatePerformance} /></span></td><td className="px-3 py-2">{value.target.comparisonRule === "within_range" ? `${formatValue(metric, value.target.targetMinimum)}–${formatValue(metric, value.target.targetMaximum)}` : value.target.targetValue == null ? "Unset" : formatValue(metric, value.target.targetValue)}</td><td className="px-3 py-2"><StatusBadge status={value.grade.status} /></td><td className="max-w-xs px-3 py-2 text-muted-foreground">{value.note ?? "—"}</td></tr>)}</tbody></table></div></section>
      </div>
    </DialogContent>
  </Dialog>;
}

function ReportResultDialog({ metric, open, onOpenChange, onSaved }: { metric: any; open: boolean; onOpenChange: (open: boolean) => void; onSaved: () => void }) {
  const [actual, setActual] = useState("");
  const [state, setState] = useState("reported");
  const [note, setNote] = useState("");
  const [eventLabel, setEventLabel] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const mutation = trpc.rolesResponsibilities.saveManualValue.useMutation({ onSuccess: () => { toast.success("Measurable result saved"); onSaved(); onOpenChange(false); }, onError: (error) => toast.error(error.message) });
  const eventBased = metric?.measurementPeriod === "per_event";
  const formula = metric?.calculationMethod === "formula";
  function reset() { setActual(metric?.actual == null ? "" : String(metric.actual)); setState(metric?.currentValue?.resultState ?? "reported"); setNote(metric?.currentValue?.note ?? ""); setEventLabel(metric?.currentValue?.eventLabel ?? ""); setEventDate(metric?.currentValue?.eventDate ?? new Date().toISOString().slice(0, 10)); setInputs(Object.fromEntries((metric?.manualInputDefinitions ?? []).map((item: any) => [item.key, metric?.currentValue?.supportingInputs?.[item.key] == null ? "" : String(metric.currentValue.supportingInputs[item.key])]))); }
  function save() {
    const inputValues = Object.fromEntries(Object.entries(inputs).map(([key, value]) => [key, value.trim() === "" ? null : Number(value)]));
    if (state === "reported" && !formula && !Number.isFinite(Number(actual))) return toast.error("Enter a valid result or select a data state.");
    if (eventBased && state === "reported" && !eventDate) return toast.error("Add the event date so it remains a dated result, not a weekly observation.");
    mutation.mutate({ metricId: metric.id, periodStart: eventBased && eventDate ? eventDate : metric.periodStart, periodEnd: eventBased && eventDate ? eventDate : metric.periodEnd, actualValue: state === "reported" && !formula ? Number(actual) : null, resultState: state as any, note: note.trim() || null, eventLabel: eventBased ? eventLabel.trim() || null : null, eventDate: eventBased ? eventDate || null : null, supportingInputs: formula ? inputValues : null });
  }
  return <Dialog open={open} onOpenChange={(next) => { if (next) reset(); onOpenChange(next); }}><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>Report measurable result</DialogTitle><DialogDescription>{metric?.name} · {metric?.periodLabel ?? `${metric?.periodStart}–${metric?.periodEnd}`}</DialogDescription></DialogHeader><div className="space-y-4">{eventBased && <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><Label>Event</Label><Input value={eventLabel} onChange={(event) => setEventLabel(event.target.value)} placeholder="Quarterly planning session" /></div><div className="space-y-1.5"><Label>Event date</Label><Input type="date" value={eventDate} onChange={(event) => setEventDate(event.target.value)} /></div></div>}<div className="space-y-1.5"><Label>Data state</Label><Select value={state} onValueChange={setState}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="reported">Reported result</SelectItem><SelectItem value="missing">Missing</SelectItem><SelectItem value="not_due">Not due</SelectItem><SelectItem value="no_eligible_activity">No eligible activity</SelectItem></SelectContent></Select></div>{state === "reported" && (formula ? <div className="space-y-3 rounded-md border p-3"><p className="text-sm font-medium">Formula inputs</p><p className="text-xs text-muted-foreground">{metric.formulaExpression}</p>{(metric.manualInputDefinitions ?? []).map((item: any) => <div className="space-y-1.5" key={item.key}><Label>{item.label}</Label><Input type="number" step="any" value={inputs[item.key] ?? ""} onChange={(event) => setInputs((current) => ({ ...current, [item.key]: event.target.value }))} /></div>)}</div> : <div className="space-y-1.5"><Label>Actual result</Label><Input autoFocus type="number" step="any" value={actual} onChange={(event) => setActual(event.target.value)} /></div>)}<div className="space-y-1.5"><Label>Explanatory note</Label><Textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Context for this result or correction" /></div></div><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={mutation.isPending} onClick={save}>{mutation.isPending ? "Saving…" : "Save result"}</Button></DialogFooter></DialogContent></Dialog>;
}

export default function ScorecardReview() {
  const utils = trpc.useUtils();
  const weeks = useMemo(() => listWeeks(52), []);
  const [weekStart, setWeekStart] = useState(weeks[0]?.start ?? "");
  const [ownerId, setOwnerId] = useState("all");
  const [meetingId, setMeetingId] = useState("all");
  const [detailMetric, setDetailMetric] = useState<any>(null);
  const [reportMetric, setReportMetric] = useState<any>(null);
  const [editorMetric, setEditorMetric] = useState<any>(null);
  const { data: owners = [] } = trpc.rolesResponsibilities.listMetricOwners.useQuery();
  const { data: responsibilities = [] } = trpc.rolesResponsibilities.list.useQuery({ status: "all", sort: "title" });
  const { data: meetings = [] } = trpc.rolesResponsibilities.pulseMeetingOptions.useQuery();
  const { data: metrics = [], isLoading } = trpc.rolesResponsibilities.scorecard.useQuery({ ownerId: ownerId === "all" ? undefined : Number(ownerId), status: "all", weekStart: weekStart || undefined });
  const refresh = trpc.rolesResponsibilities.refreshMetric.useMutation({ onSuccess: () => { toast.success("Measurable refreshed"); void utils.rolesResponsibilities.scorecard.invalidate(); }, onError: (error) => toast.error(error.message) });
  const archive = trpc.rolesResponsibilities.deleteMetric.useMutation({ onSuccess: () => { toast.success("Measurable archived. Its history is retained."); void utils.rolesResponsibilities.scorecard.invalidate(); }, onError: (error) => toast.error(error.message) });
  const restore = trpc.rolesResponsibilities.restoreMetric.useMutation({ onSuccess: () => { toast.success("Measurable restored"); void utils.rolesResponsibilities.scorecard.invalidate(); }, onError: (error) => toast.error(error.message) });
  const filtered = useMemo(() => (metrics as any[]).filter((metric) => meetingId === "all" || metric.l10MeetingIds.includes(meetingId)), [metrics, meetingId]);
  const grouped = useMemo(() => {
    const groups: Array<{ ownerName: string; metrics: any[] }> = [];
    const indexByOwner = new Map<string, number>();
    for (const metric of filtered) {
      const key = String(metric.owner?.id ?? "unassigned");
      const existingIndex = indexByOwner.get(key);
      if (existingIndex == null) {
        indexByOwner.set(key, groups.length);
        groups.push({ ownerName: metric.owner?.name ?? "Unassigned", metrics: [metric] });
      } else {
        groups[existingIndex].metrics.push(metric);
      }
    }
    return groups;
  }, [filtered]);
  const onChanged = () => { void utils.rolesResponsibilities.scorecard.invalidate(); void utils.rolesResponsibilities.get.invalidate(); };

  return <div className="space-y-4">
    <Card><CardContent className="p-4"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><h2 className="flex items-center gap-2 text-lg font-semibold"><Target className="h-5 w-5" />Company Scorecards</h2><p className="mt-1 text-sm text-muted-foreground">The master weekly view of every measurable, grouped by owner. Filter by L10 without creating a second source of truth.</p></div><div className="flex items-center gap-2 text-sm text-muted-foreground">{filtered.length} measurables</div></div><div className="mt-4 grid gap-3 md:grid-cols-3"><Select value={weekStart} onValueChange={setWeekStart}><SelectTrigger><SelectValue placeholder="Select a week" /></SelectTrigger><SelectContent>{weeks.map((week) => <SelectItem key={week.start} value={week.start}>{week.label}</SelectItem>)}</SelectContent></Select><Select value={ownerId} onValueChange={setOwnerId}><SelectTrigger><SelectValue placeholder="All owners" /></SelectTrigger><SelectContent><SelectItem value="all">All people</SelectItem>{owners.map((owner) => <SelectItem key={owner.id} value={String(owner.id)}>{owner.name ?? owner.email}</SelectItem>)}</SelectContent></Select><Select value={meetingId} onValueChange={setMeetingId}><SelectTrigger><SelectValue placeholder="All L10s" /></SelectTrigger><SelectContent><SelectItem value="all">All L10s</SelectItem>{meetings.map((meeting) => <SelectItem key={meeting.id} value={meeting.id}>{meeting.name}</SelectItem>)}</SelectContent></Select></div></CardContent></Card>
    <Card className="overflow-hidden"><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[1180px] text-left text-sm"><thead className="border-b bg-muted/40 text-muted-foreground"><tr><th className="px-4 py-3 font-medium">Measurable</th><th className="px-4 py-3 font-medium">Owner</th><th className="px-4 py-3 font-medium">Target</th><th className="px-4 py-3 font-medium">This week</th><th className="px-4 py-3 font-medium">8-week trend</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 text-right font-medium">Actions</th></tr></thead><tbody>{isLoading ? <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">Loading measurables…</td></tr> : grouped.length === 0 ? <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">No measurables match these filters.</td></tr> : grouped.flatMap((group) => [<tr key={`owner-${group.ownerName}`} className="border-b bg-muted/20"><td className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground" colSpan={7}>{group.ownerName}</td></tr>, ...group.metrics.map((metric) => <tr key={metric.id} className="border-b last:border-0 hover:bg-muted/20"><td className="max-w-xs px-4 py-3"><button className="flex text-left font-medium hover:text-primary hover:underline" onClick={() => setDetailMetric(metric)}>{metric.name}<ChevronRight className="ml-1 h-4 w-4" /></button><p className="mt-1 truncate text-xs text-muted-foreground">{metric.responsibility.title}</p></td><td className="px-4 py-3">{metric.owner.name ?? "Unassigned"}</td><td className="max-w-[190px] px-4 py-3 text-xs font-medium">{targetText(metric)}</td><td className="px-4 py-3"><p className="inline-flex items-center gap-1.5 font-semibold">{metric.statusLabel === "no_eligible_activity" ? noEligibleActivityText(metric) : formatValue(metric, metric.actual)}<RecordMarker performance={metric.periodToDatePerformance} /></p><p className="mt-1 text-xs text-muted-foreground">{metric.periodLabel}</p></td><td className="px-4 py-3"><Sparkline metric={metric} /></td><td className="px-4 py-3"><StatusBadge status={metric.statusLabel} /></td><td className="px-4 py-3"><div className="flex justify-end gap-2"><Button size="sm" variant="outline" onClick={() => setEditorMetric(metric)}><Pencil className="mr-1 h-3.5 w-3.5" />Edit</Button>{metric.metricType !== "automatic" && metric.status === "active" && <Button size="sm" onClick={() => setReportMetric(metric)}><Clock3 className="mr-1 h-3.5 w-3.5" />Report</Button>}{metric.metricType !== "manual" && metric.status === "active" && <Button size="sm" variant="outline" disabled={refresh.isPending} onClick={() => refresh.mutate({ metricId: metric.id })}><RefreshCw className={`mr-1 h-3.5 w-3.5 ${refresh.isPending ? "animate-spin" : ""}`} />Refresh</Button>}{metric.status === "active" ? <Button title="Archive measurable" size="icon" variant="ghost" onClick={() => archive.mutate({ id: metric.id })}><Archive className="h-4 w-4 text-muted-foreground" /></Button> : <Button size="sm" variant="outline" onClick={() => restore.mutate({ id: metric.id })}><CheckCircle2 className="mr-1 h-3.5 w-3.5" />Restore</Button>}</div></td></tr>)])}</tbody></table></div></CardContent></Card>
    <DetailDialog metric={detailMetric} open={!!detailMetric} onOpenChange={(open) => !open && setDetailMetric(null)} />
    <ReportResultDialog metric={reportMetric} open={!!reportMetric} onOpenChange={(open) => !open && setReportMetric(null)} onSaved={onChanged} />
    <ScorecardMetricEditor open={!!editorMetric} onOpenChange={(open) => !open && setEditorMetric(null)} responsibilityId={editorMetric?.responsibility?.id} responsibilityOwnerId={editorMetric?.owner?.id} metric={editorMetric} metricOwners={owners as any[]} responsibilities={responsibilities as any[]} l10Meetings={meetings as any[]} onSaved={onChanged} />
  </div>;
}
