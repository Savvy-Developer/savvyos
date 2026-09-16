import { useEffect, useMemo, useState } from "react";
import { Archive, CheckCircle2, ChevronRight, Clock3, ExternalLink, FileClock, Filter, Pencil, RefreshCw, Target, TriangleAlert } from "lucide-react";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

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
  const target = metric.targetConfig ?? {};
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

function DetailDialog({ metric, open, onOpenChange }: { metric: any; open: boolean; onOpenChange: (open: boolean) => void }) {
  const metadata = metric?.currentValue?.calculationMetadata ?? {};
  const inputs = metric?.currentValue?.supportingInputs ?? {};
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
      <DialogHeader><DialogTitle>{metric?.name}</DialogTitle><DialogDescription>{metric?.responsibility?.title} · {metric?.owner?.name ?? "Unassigned"}</DialogDescription></DialogHeader>
      <div className="space-y-5 text-sm">
        <section><p className="font-medium">Definition</p><p className="mt-1 leading-6 text-muted-foreground">{metric?.definition || "No definition has been entered. Add what counts, what does not, and the population covered."}</p></section>
        <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-md bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Target for this result</p><p className="mt-1 font-medium">{targetText(metric)}</p></div><div className="rounded-md bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Status</p><div className="mt-1"><StatusBadge status={metric.statusLabel} /></div></div><div className="rounded-md bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Measurement and review</p><p className="mt-1 font-medium">{String(metric.measurementPeriod ?? metric.frequency).replace(/_/g, " ")} · reviewed {String(metric.reviewFrequency ?? "weekly").replace(/_/g, " ")}</p></div><div className="rounded-md bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Current result</p><p className="mt-1 font-medium">{metric.currentValue?.resultState === "no_eligible_activity" ? noEligibleActivityText(metric) : formatValue(metric, metric.actual)}</p></div></div>
        <section><p className="font-medium">Calculation and source</p><div className="mt-2 grid gap-2 rounded-md border p-3 sm:grid-cols-2"><p><span className="text-muted-foreground">Method: </span>{String(metric.calculationMethod ?? metric.rollupMethod).replace(/_/g, " ")}</p><p><span className="text-muted-foreground">Source: </span>{metric.autoConfig?.dataSource ?? "Manual entry"}</p>{metric.autoConfig?.dateField && <p><span className="text-muted-foreground">Date field: </span>{metric.autoConfig.dateField}</p>}{metric.autoConfig?.calculation && <p><span className="text-muted-foreground">Source aggregation: </span>{metric.autoConfig.calculation.replace(/_/g, " ")}</p>}{metric.formulaExpression && <p className="sm:col-span-2"><span className="text-muted-foreground">Formula: </span><code className="rounded bg-muted px-1 py-0.5">{metric.formulaExpression}</code></p>}</div></section>
        {(Object.keys(inputs).length > 0 || Object.keys(metadata).length > 0) && <section><p className="font-medium">Supporting inputs</p><div className="mt-2 grid gap-2 sm:grid-cols-2">{Object.entries(inputs).map(([key, value]) => <p className="rounded border p-2" key={key}><span className="text-muted-foreground">{key.replace(/_/g, " ")}: </span><strong>{String(value)}</strong></p>)}{metadata.numerator != null && <p className="rounded border p-2"><span className="text-muted-foreground">Numerator: </span><strong>{String(metadata.numerator)}</strong></p>}{metadata.denominator != null && <p className="rounded border p-2"><span className="text-muted-foreground">Denominator: </span><strong>{String(metadata.denominator)}</strong></p>}</div></section>}
        <section><p className="font-medium">Latest update</p><p className="mt-1 text-muted-foreground">{metric.currentValue?.updatedAt ? new Date(metric.currentValue.updatedAt).toLocaleString() : metric.autoConfig?.lastRefreshedAt ? new Date(metric.autoConfig.lastRefreshedAt).toLocaleString() : "No result reported yet."}{metric.currentValue?.note ? ` · ${metric.currentValue.note}` : ""}</p></section>
        <section><p className="font-medium">Result history</p><div className="mt-2 overflow-x-auto rounded-md border"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-muted/50 text-muted-foreground"><tr><th className="px-3 py-2 font-medium">Period / event</th><th className="px-3 py-2 font-medium">Result</th><th className="px-3 py-2 font-medium">Target at the time</th><th className="px-3 py-2 font-medium">Status</th><th className="px-3 py-2 font-medium">Note</th></tr></thead><tbody>{(metric.valueHistory ?? []).length === 0 ? <tr><td className="px-3 py-4 text-muted-foreground" colSpan={5}>No historical results yet.</td></tr> : metric.valueHistory.map((value: any) => <tr key={value.id} className="border-t"><td className="px-3 py-2">{value.eventLabel || value.eventDate || `${value.periodStart}–${value.periodEnd}`}</td><td className="px-3 py-2 font-medium">{value.resultState === "no_eligible_activity" ? noEligibleActivityText(metric) : formatValue(metric, value.actual)}</td><td className="px-3 py-2">{value.target.comparisonRule === "within_range" ? `${formatValue(metric, value.target.targetMinimum)}–${formatValue(metric, value.target.targetMaximum)}` : value.target.targetValue == null ? "Unset" : formatValue(metric, value.target.targetValue)}</td><td className="px-3 py-2"><StatusBadge status={value.grade.status} /></td><td className="max-w-xs px-3 py-2 text-muted-foreground">{value.note ?? "—"}</td></tr>)}</tbody></table></div></section>
        <section><p className="font-medium">Change history</p><div className="mt-2 space-y-2">{(metric.changeHistory ?? []).length === 0 ? <p className="text-muted-foreground">No change history is available.</p> : metric.changeHistory.slice(0, 12).map((entry: any) => <div className="rounded border p-2" key={entry.id}><p className="font-medium">{entry.changeType.replace(/_/g, " ")}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(entry.createdAt).toLocaleString()}</p></div>)}</div></section>
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
  const mutation = trpc.rolesResponsibilities.saveManualValue.useMutation({ onSuccess: () => { toast.success("Scorecard result saved"); onSaved(); onOpenChange(false); }, onError: (error) => toast.error(error.message) });
  useEffect(() => { if (open) reset(); }, [open, metric?.id]);
  const eventBased = metric?.measurementPeriod === "per_event";
  const formula = metric?.calculationMethod === "formula";
  function reset() { setActual(metric?.actual == null ? "" : String(metric.actual)); setState(metric?.currentValue?.resultState ?? "reported"); setNote(metric?.currentValue?.note ?? ""); setEventLabel(metric?.currentValue?.eventLabel ?? ""); setEventDate(metric?.currentValue?.eventDate ?? new Date().toISOString().slice(0, 10)); setInputs(Object.fromEntries((metric?.manualInputDefinitions ?? []).map((item: any) => [item.key, metric?.currentValue?.supportingInputs?.[item.key] == null ? "" : String(metric.currentValue.supportingInputs[item.key])]))); }
  function save() {
    const inputValues = Object.fromEntries(Object.entries(inputs).map(([key, value]) => [key, value.trim() === "" ? null : Number(value)]));
    if (state === "reported" && !formula && !Number.isFinite(Number(actual))) return toast.error("Enter a valid result or select a data state.");
    if (eventBased && state === "reported" && !eventDate) return toast.error("Add the event date so it remains a dated result, not a weekly observation.");
    mutation.mutate({ metricId: metric.id, periodStart: eventBased && eventDate ? eventDate : metric.periodStart, periodEnd: eventBased && eventDate ? eventDate : metric.periodEnd, actualValue: state === "reported" && !formula ? Number(actual) : null, resultState: state as any, note: note.trim() || null, eventLabel: eventBased ? eventLabel.trim() || null : null, eventDate: eventBased ? eventDate || null : null, supportingInputs: formula ? inputValues : null });
  }
  return <Dialog open={open} onOpenChange={(next) => { if (next) reset(); onOpenChange(next); }}><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>Report scorecard result</DialogTitle><DialogDescription>{metric?.name} · {metric?.periodLabel ?? `${metric?.periodStart}–${metric?.periodEnd}`}</DialogDescription></DialogHeader><div className="space-y-4">{eventBased && <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><Label>Event</Label><Input value={eventLabel} onChange={(event) => setEventLabel(event.target.value)} placeholder="Quarterly planning session" /></div><div className="space-y-1.5"><Label>Event date</Label><Input type="date" value={eventDate} onChange={(event) => setEventDate(event.target.value)} /></div></div>}<div className="space-y-1.5"><Label>Data state</Label><Select value={state} onValueChange={setState}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="reported">Reported result</SelectItem><SelectItem value="missing">Missing</SelectItem><SelectItem value="not_due">Not due</SelectItem><SelectItem value="no_eligible_activity">No eligible activity</SelectItem></SelectContent></Select><p className="text-xs text-muted-foreground">Use a state instead of entering zero when the result is unavailable or no eligible activity occurred.</p></div>{state === "reported" && (formula ? <div className="space-y-3 rounded-md border p-3"><p className="text-sm font-medium">Formula inputs</p><p className="text-xs text-muted-foreground">{metric.formulaExpression}</p>{(metric.manualInputDefinitions ?? []).map((item: any) => <div className="space-y-1.5" key={item.key}><Label>{item.label}</Label><Input type="number" step="any" value={inputs[item.key] ?? ""} onChange={(event) => setInputs((current) => ({ ...current, [item.key]: event.target.value }))} /></div>)}</div> : <div className="space-y-1.5"><Label>Actual result</Label><Input autoFocus type="number" step="any" value={actual} onChange={(event) => setActual(event.target.value)} /></div>)}<div className="space-y-1.5"><Label>Explanatory note</Label><Textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Context for this result or correction" /></div></div><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={mutation.isPending} onClick={save}>{mutation.isPending ? "Saving…" : "Save result"}</Button></DialogFooter></DialogContent></Dialog>;
}

export default function ScorecardReview() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const [ownerId, setOwnerId] = useState("all");
  const [responsibilityId, setResponsibilityId] = useState("all");
  const [meetingId, setMeetingId] = useState("all");
  const [status, setStatus] = useState("all");
  const [detailMetric, setDetailMetric] = useState<any>(null);
  const [reportMetric, setReportMetric] = useState<any>(null);
  const { data: owners = [] } = trpc.rolesResponsibilities.listMetricOwners.useQuery();
  const { data: responsibilities = [] } = trpc.rolesResponsibilities.list.useQuery({ status: "all", sort: "title" });
  const { data: meetings = [] } = trpc.rolesResponsibilities.pulseMeetingOptions.useQuery();
  const { data: metrics = [], isLoading } = trpc.rolesResponsibilities.scorecard.useQuery({ ownerId: ownerId === "all" ? undefined : Number(ownerId), responsibilityId: responsibilityId === "all" ? undefined : Number(responsibilityId), status: "all" });
  const refresh = trpc.rolesResponsibilities.refreshMetric.useMutation({ onSuccess: () => { toast.success("Metric refreshed"); void utils.rolesResponsibilities.scorecard.invalidate(); }, onError: (error) => toast.error(error.message) });
  const archive = trpc.rolesResponsibilities.deleteMetric.useMutation({ onSuccess: () => { toast.success("Metric archived. Its history is retained."); void utils.rolesResponsibilities.scorecard.invalidate(); }, onError: (error) => toast.error(error.message) });
  const restore = trpc.rolesResponsibilities.restoreMetric.useMutation({ onSuccess: () => { toast.success("Metric restored"); void utils.rolesResponsibilities.scorecard.invalidate(); }, onError: (error) => toast.error(error.message) });
  const filtered = useMemo(() => (metrics as any[]).filter((metric) => (meetingId === "all" || metric.l10MeetingIds.includes(meetingId)) && (status === "all" || metric.statusLabel === status)), [metrics, meetingId, status]);
  const onChanged = () => { void utils.rolesResponsibilities.scorecard.invalidate(); void utils.rolesResponsibilities.get.invalidate(); };

  return <div className="space-y-4">
    <Card><CardContent className="p-4"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><h2 className="flex items-center gap-2 text-lg font-semibold"><Target className="h-5 w-5" />Scorecard review</h2><p className="mt-1 text-sm text-muted-foreground">One place to review accountable owners, targets, status, supporting data, and history. A monthly or event-based metric remains visible during a weekly review without inventing a weekly result.</p></div><div className="flex items-center gap-2 text-sm text-muted-foreground"><FileClock className="h-4 w-4" />{filtered.length} metrics</div></div><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4"><Select value={ownerId} onValueChange={setOwnerId}><SelectTrigger><SelectValue placeholder="All owners" /></SelectTrigger><SelectContent><SelectItem value="all">All people</SelectItem>{owners.map((owner) => <SelectItem key={owner.id} value={String(owner.id)}>{owner.name ?? owner.email}</SelectItem>)}</SelectContent></Select><Select value={responsibilityId} onValueChange={setResponsibilityId}><SelectTrigger><SelectValue placeholder="All responsibilities" /></SelectTrigger><SelectContent><SelectItem value="all">All responsibilities</SelectItem>{responsibilities.map((responsibility: any) => <SelectItem key={responsibility.id} value={String(responsibility.id)}>{responsibility.title}</SelectItem>)}</SelectContent></Select><Select value={meetingId} onValueChange={setMeetingId}><SelectTrigger><SelectValue placeholder="All scorecards" /></SelectTrigger><SelectContent><SelectItem value="all">All scorecards</SelectItem>{meetings.map((meeting) => <SelectItem key={meeting.id} value={meeting.id}>{meeting.name}</SelectItem>)}</SelectContent></Select><Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue placeholder="All status" /></SelectTrigger><SelectContent><SelectItem value="all">All status</SelectItem><SelectItem value="on_target">On target</SelectItem><SelectItem value="warning">Watch</SelectItem><SelectItem value="off_target">Off target</SelectItem><SelectItem value="missing">Missing</SelectItem><SelectItem value="no_eligible_activity">No eligible activity</SelectItem><SelectItem value="target_unset">Target unset</SelectItem><SelectItem value="informational">Informational</SelectItem></SelectContent></Select></div></CardContent></Card>
    <Card className="overflow-hidden"><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[1120px] text-left text-sm"><thead className="border-b bg-muted/40 text-muted-foreground"><tr><th className="px-4 py-3 font-medium">Metric</th><th className="px-4 py-3 font-medium">Owner</th><th className="px-4 py-3 font-medium">Target</th><th className="px-4 py-3 font-medium">Direction</th><th className="px-4 py-3 font-medium">Measurement period</th><th className="px-4 py-3 font-medium">Actual result</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 text-right font-medium">Actions</th></tr></thead><tbody>{isLoading ? <tr><td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">Loading scorecard metrics…</td></tr> : filtered.length === 0 ? <tr><td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">No metrics match these filters.</td></tr> : filtered.map((metric) => <tr key={metric.id} className="border-b last:border-0 hover:bg-muted/20"><td className="max-w-xs px-4 py-3"><button className="flex text-left font-medium hover:text-primary hover:underline" onClick={() => setDetailMetric(metric)}>{metric.name}<ChevronRight className="ml-1 h-4 w-4" /></button><p className="mt-1 truncate text-xs text-muted-foreground">{metric.responsibility.title}</p></td><td className="px-4 py-3">{metric.owner.name ?? "Unassigned"}</td><td className="max-w-[190px] px-4 py-3 text-xs font-medium">{targetText(metric)}</td><td className="px-4 py-3 text-xs capitalize text-muted-foreground">{String(metric.targetConfig?.comparisonRule ?? metric.performanceDirection).replace(/_/g, " ")}</td><td className="px-4 py-3"><p className="capitalize">{String(metric.measurementPeriod ?? metric.frequency).replace(/_/g, " ")}</p><p className="mt-1 text-xs text-muted-foreground">Review: {String(metric.reviewFrequency ?? "weekly").replace(/_/g, " ")}</p></td><td className="px-4 py-3"><p className="font-semibold">{metric.statusLabel === "no_eligible_activity" ? noEligibleActivityText(metric) : formatValue(metric, metric.actual)}</p><p className="mt-1 text-xs text-muted-foreground">{metric.currentValue?.eventLabel || metric.currentValue?.eventDate || metric.periodLabel}</p></td><td className="px-4 py-3"><StatusBadge status={metric.statusLabel} /></td><td className="px-4 py-3"><div className="flex justify-end gap-2"><Button size="sm" variant="outline" onClick={() => navigate(`/roles-responsibilities/${metric.responsibility.id}`)}><Pencil className="mr-1 h-3.5 w-3.5" />Edit</Button>{metric.metricType !== "automatic" && metric.status === "active" && <Button size="sm" onClick={() => { setReportMetric(metric); }}><Clock3 className="mr-1 h-3.5 w-3.5" />Report</Button>}{metric.metricType !== "manual" && metric.status === "active" && <Button size="sm" variant="outline" disabled={refresh.isPending} onClick={() => refresh.mutate({ metricId: metric.id })}><RefreshCw className={`mr-1 h-3.5 w-3.5 ${refresh.isPending ? "animate-spin" : ""}`} />Refresh</Button>}{metric.status === "active" ? <Button title="Archive metric" size="icon" variant="ghost" onClick={() => archive.mutate({ id: metric.id })}><Archive className="h-4 w-4 text-muted-foreground" /></Button> : <Button size="sm" variant="outline" onClick={() => restore.mutate({ id: metric.id })}><CheckCircle2 className="mr-1 h-3.5 w-3.5" />Restore</Button>}</div></td></tr>)}</tbody></table></div></CardContent></Card>
    <DetailDialog metric={detailMetric} open={!!detailMetric} onOpenChange={(open) => !open && setDetailMetric(null)} />
    <ReportResultDialog metric={reportMetric} open={!!reportMetric} onOpenChange={(open) => !open && setReportMetric(null)} onSaved={onChanged} />
  </div>;
}
