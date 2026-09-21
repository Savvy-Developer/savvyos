import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const sourceFields: Record<string, { dates: string[]; numbers: string[]; filters: string[] }> = {
  tasks: { dates: ["createdAt", "updatedAt", "dueDate", "completedAt"], numbers: ["id"], filters: ["status", "priority", "taskType", "isAutomated"] },
  transactions: { dates: ["createdAt", "updatedAt", "closingDate"], numbers: ["grossCommissionIncome", "purchasePrice", "commissionRate", "id"], filters: ["status", "transactionType", "marketId"] },
  agent_connections: { dates: ["createdAt", "updatedAt", "followUpDate"], numbers: ["id"], filters: ["pipelineStatus", "agentId"] },
};

const defaults = {
  name: "",
  ownerId: "",
  definitionKey: "",
  definition: "",
  metricType: "manual",
  frequency: "monthly",
  measurementPeriod: "monthly",
  rollingDays: "30",
  reviewFrequency: "weekly",
  reportingSchedule: "",
  unit: "count",
  displayFormat: "number",
  comparisonRule: "at_least",
  targetValue: "",
  targetMinimum: "",
  targetMaximum: "",
  warningThreshold: "",
  targetEffectiveDate: new Date().toISOString().slice(0, 10),
  targetChangeNote: "",
  calculationMethod: "count",
  formulaExpression: "",
  manualInputDefinitions: [] as Array<{ key: string; label: string; unit?: string }>,
  zeroDenominatorLabel: "",
  isCumulative: false,
  cumulativeReset: "monthly",
  status: "active",
  dataSource: "tasks",
  dateField: "completedAt",
  autoCalculation: "count",
  valueField: "",
  weightField: "",
  outputKey: "",
  filterField: "",
  filterValue: "",
  numeratorFilterField: "",
  numeratorFilterValue: "",
  denominatorFilterField: "",
  denominatorFilterValue: "",
  l10MeetingIds: [] as string[],
};

function filtersFrom(field: string, value: string) {
  if (!field || !value.trim()) return null;
  const parts = value.split(",").map((item) => item.trim()).filter(Boolean);
  return { [field]: parts.length > 1 ? parts : parts[0] };
}

function parseNullableNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function displayOptionsForUnit(unit: string) {
  if (unit === "dollars") return ["currency", "number"];
  if (unit === "percentage") return ["percentage", "number"];
  if (unit === "hours" || unit === "days") return ["duration", "number"];
  return ["number"];
}

export default function ScorecardMetricEditor({ open, onOpenChange, responsibilityId, responsibilityOwnerId, metric, metricOwners, l10Meetings, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; responsibilityId: number; responsibilityOwnerId: number; metric?: any | null; metricOwners: any[]; l10Meetings: any[]; onSaved: () => void }) {
  const [form, setForm] = useState<any>(defaults);
  const saveMetric = trpc.rolesResponsibilities.saveMetric.useMutation({
    onSuccess: () => { toast.success("Scorecard metric saved"); onSaved(); onOpenChange(false); },
    onError: (error) => toast.error(error.message),
  });

  useEffect(() => {
    if (!open) return;
    const config = metric?.autoConfig;
    const period = metric?.measurementPeriod ?? metric?.frequency ?? "monthly";
    setForm({
      ...defaults,
      name: metric?.name ?? "",
      ownerId: String(metric?.ownerId ?? metric?.owner?.id ?? responsibilityOwnerId),
      definitionKey: metric?.definitionKey ?? "",
      definition: metric?.definition ?? "",
      metricType: metric?.metricType ?? "manual",
      frequency: metric?.frequency ?? (period === "weekly" ? "weekly" : period === "quarterly" || period === "quarter_to_date" ? "quarterly" : period === "year_to_date" ? "annually" : "monthly"),
      measurementPeriod: period,
      rollingDays: String(metric?.rollingDays ?? 30),
      reviewFrequency: metric?.reviewFrequency ?? "weekly",
      reportingSchedule: metric?.reportingSchedule ?? "",
      unit: metric?.unit ?? "count",
      displayFormat: metric?.displayFormat ?? "number",
      comparisonRule: metric?.comparisonRule ?? (metric?.performanceDirection === "lower" ? "at_most" : "at_least"),
      targetValue: metric?.targetValue == null ? "" : String(metric.targetValue),
      targetMinimum: metric?.targetMinimum == null ? "" : String(metric.targetMinimum),
      targetMaximum: metric?.targetMaximum == null ? "" : String(metric.targetMaximum),
      warningThreshold: metric?.warningThreshold == null ? "" : String(metric.warningThreshold),
      targetEffectiveDate: new Date().toISOString().slice(0, 10),
      targetChangeNote: "",
      calculationMethod: metric?.calculationMethod ?? metric?.rollupMethod ?? "count",
      formulaExpression: metric?.formulaExpression ?? "",
      manualInputDefinitions: metric?.manualInputDefinitions ?? [],
      zeroDenominatorLabel: metric?.zeroDenominatorLabel ?? "",
      isCumulative: metric?.isCumulative ?? false,
      cumulativeReset: metric?.cumulativeReset ?? "monthly",
      status: metric?.status ?? "active",
      dataSource: config?.dataSource ?? "tasks",
      dateField: config?.dateField ?? "completedAt",
      autoCalculation: config?.calculation ?? "count",
      valueField: config?.valueField ?? "",
      weightField: config?.weightField ?? "",
      outputKey: config?.outputKey ?? "",
      l10MeetingIds: metric?.l10MeetingIds ?? [],
    });
  }, [open, metric, responsibilityOwnerId]);

  const fields = sourceFields[form.dataSource] ?? sourceFields.tasks;
  const automatic = form.metricType === "automatic" || form.metricType === "hybrid";
  const formula = form.calculationMethod === "formula";
  const targetIsRange = form.comparisonRule === "within_range";
  const targetIsInformational = form.comparisonRule === "informational";
  const dataFilterFields = useMemo(() => fields.filters, [fields]);

  function update(values: Record<string, unknown>) { setForm((current: any) => ({ ...current, ...values })); }
  function addInput() { update({ manualInputDefinitions: [...form.manualInputDefinitions, { key: `input_${form.manualInputDefinitions.length + 1}`, label: "" }] }); }
  function updateInput(index: number, field: string, value: string) { update({ manualInputDefinitions: form.manualInputDefinitions.map((item: any, position: number) => position === index ? { ...item, [field]: value } : item) }); }
  function removeInput(index: number) { update({ manualInputDefinitions: form.manualInputDefinitions.filter((_: unknown, position: number) => position !== index) }); }

  function save() {
    if (!form.name.trim()) return toast.error("Enter a metric name.");
    if (!form.ownerId) return toast.error("Choose the person accountable for this metric.");
    if (form.measurementPeriod === "rolling" && !parseNullableNumber(form.rollingDays)) return toast.error("Set the rolling number of days.");
    if (targetIsRange && (parseNullableNumber(form.targetMinimum) == null || parseNullableNumber(form.targetMaximum) == null)) return toast.error("Set both ends of the target range.");
    if (targetIsRange && Number(form.targetMinimum) > Number(form.targetMaximum)) return toast.error("The minimum target cannot exceed the maximum.");
    if (formula && !form.formulaExpression.trim()) return toast.error("Enter the formula used to calculate this result.");
    if (form.manualInputDefinitions.some((item: any) => !item.key.trim() || !item.label.trim())) return toast.error("Give each formula input a key and clear label.");
    if (automatic && ["sum", "average", "weighted_average", "latest"].includes(form.autoCalculation) && !form.valueField) return toast.error("Choose the numeric field used in the automatic calculation.");
    if (automatic && form.autoCalculation === "weighted_average" && !form.weightField) return toast.error("Choose the weight field for the weighted average.");

    const autoConfig = automatic ? {
      dataSource: form.dataSource,
      dateField: form.dateField,
      calculation: form.autoCalculation,
      valueField: ["sum", "average", "weighted_average", "latest"].includes(form.autoCalculation) ? form.valueField : null,
      weightField: form.autoCalculation === "weighted_average" ? form.weightField : null,
      outputKey: form.metricType === "hybrid" && form.outputKey.trim() ? form.outputKey.trim() : null,
      filters: filtersFrom(form.filterField, form.filterValue),
      numeratorFilters: form.autoCalculation === "percentage" ? filtersFrom(form.numeratorFilterField, form.numeratorFilterValue) : null,
      denominatorFilters: form.autoCalculation === "percentage" ? filtersFrom(form.denominatorFilterField, form.denominatorFilterValue) : null,
    } : null;
    const comparisonRule = form.comparisonRule;
    const targetValue = targetIsRange || targetIsInformational ? null : parseNullableNumber(form.targetValue);
    saveMetric.mutate({
      ...(metric?.id ? { id: metric.id } : {}),
      responsibilityId,
      ownerId: Number(form.ownerId),
      name: form.name.trim(),
      definitionKey: form.definitionKey.trim() || null,
      definition: form.definition.trim() || null,
      metricType: form.metricType,
      frequency: form.frequency,
      measurementPeriod: form.measurementPeriod,
      rollingDays: form.measurementPeriod === "rolling" ? Number(form.rollingDays) : null,
      reviewFrequency: form.reviewFrequency,
      reportingSchedule: form.reportingSchedule.trim() || null,
      unit: form.unit,
      displayFormat: form.displayFormat,
      comparisonRule,
      targetValue,
      targetMinimum: targetIsRange ? parseNullableNumber(form.targetMinimum) : null,
      targetMaximum: targetIsRange ? parseNullableNumber(form.targetMaximum) : null,
      warningThreshold: targetIsInformational ? null : parseNullableNumber(form.warningThreshold),
      targetEffectiveDate: form.targetEffectiveDate,
      targetChangeNote: form.targetChangeNote.trim() || null,
      performanceDirection: comparisonRule === "at_most" ? "lower" : "higher",
      rollupMethod: form.calculationMethod === "formula" ? "sum" : form.calculationMethod,
      calculationMethod: form.calculationMethod,
      formulaExpression: formula ? form.formulaExpression.trim() : null,
      manualInputDefinitions: formula ? form.manualInputDefinitions : [],
      zeroDenominatorLabel: form.zeroDenominatorLabel.trim() || null,
      isCumulative: form.isCumulative,
      cumulativeReset: form.isCumulative ? form.cumulativeReset : null,
      status: form.status,
      autoConfig,
      l10MeetingIds: form.l10MeetingIds,
    } as any);
  }

  const selectItems = (items: Array<[string, string]>) => items.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>);
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="h-[min(92dvh,92vw,56rem)] w-[min(92dvh,92vw,56rem)] max-w-none overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{metric?.id ? "Edit scorecard metric" : "Create scorecard metric"}</DialogTitle>
        <DialogDescription>Start with the outcome, owner, target, and review cadence. Calculation settings stay out of the way until needed.</DialogDescription>
      </DialogHeader>
      <div className="space-y-6 py-1">
        <section className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2"><Label>Metric name *</Label><Input value={form.name} onChange={(event) => update({ name: event.target.value })} placeholder="Eligible booking conversion rate" /></div>
          <div className="space-y-1.5"><Label>Accountable owner *</Label><Select value={form.ownerId} onValueChange={(value) => update({ ownerId: value })}><SelectTrigger><SelectValue placeholder="Choose a person" /></SelectTrigger><SelectContent>{metricOwners.map((owner) => <SelectItem key={owner.id} value={String(owner.id)}>{owner.name ?? owner.email}{owner.title ? ` · ${owner.title}` : ""}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label>Unit</Label><Select value={form.unit} onValueChange={(value) => update({ unit: value, displayFormat: displayOptionsForUnit(value)[0] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{selectItems([["count", "Count"], ["dollars", "Dollars"], ["percentage", "Percentage"], ["hours", "Hours"], ["days", "Days"], ["score", "Score"]])}</SelectContent></Select></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>Definition</Label><Textarea value={form.definition} onChange={(event) => update({ definition: event.target.value })} placeholder="What counts, what does not, and which people or records are included." /></div>
          <div className="space-y-1.5"><Label>Shared definition key</Label><Input value={form.definitionKey} onChange={(event) => update({ definitionKey: event.target.value })} placeholder="Optional: booking_conversion" /><p className="text-xs text-muted-foreground">Use the same key when this definition is assigned to several people with separate targets.</p></div>
          <div className="space-y-1.5"><Label>Data and entry method</Label><Select value={form.metricType} onValueChange={(value) => update({ metricType: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{selectItems([["manual", "Manual result or inputs"], ["automatic", "Automatic SavvyOS calculation"], ["hybrid", "Automatic data plus manual inputs"]])}</SelectContent></Select></div>
        </section>

        <section className="rounded-lg border p-4 space-y-4">
          <div><p className="font-medium text-sm">Timing and review</p><p className="text-xs text-muted-foreground mt-1">Measurement frequency and review frequency are deliberately separate.</p></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Measurement period</Label><Select value={form.measurementPeriod} onValueChange={(value) => update({ measurementPeriod: value, frequency: value === "weekly" ? "weekly" : value === "quarterly" || value === "quarter_to_date" ? "quarterly" : value === "year_to_date" ? "annually" : "monthly" })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{selectItems([["weekly", "Weekly"], ["monthly", "Monthly"], ["quarterly", "Quarterly"], ["month_to_date", "Month-to-date"], ["quarter_to_date", "Quarter-to-date"], ["year_to_date", "Year-to-date"], ["rolling", "Rolling period"], ["per_event", "Per event"], ["current_snapshot", "Current snapshot"]])}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Review frequency</Label><Select value={form.reviewFrequency} onValueChange={(value) => update({ reviewFrequency: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{selectItems([["weekly", "Weekly review"], ["monthly", "Monthly review"], ["quarterly", "Quarterly review"], ["annually", "Annual review"], ["as_needed", "As needed"]])}</SelectContent></Select></div>
            {form.measurementPeriod === "rolling" && <div className="space-y-1.5"><Label>Rolling days *</Label><Input type="number" min="1" max="730" value={form.rollingDays} onChange={(event) => update({ rollingDays: event.target.value })} /></div>}
            <div className="space-y-1.5"><Label>Reporting schedule</Label><Input value={form.reportingSchedule} onChange={(event) => update({ reportingSchedule: event.target.value })} placeholder="Example: Update by Monday 9 AM; review in Leadership L10" /></div>
          </div>
          {!["per_event", "current_snapshot"].includes(form.measurementPeriod) && <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.isCumulative} onCheckedChange={(value) => update({ isCumulative: !!value })} />Cumulative metric</label>}
          {form.isCumulative && <div className="space-y-1.5 max-w-sm"><Label>Reset period</Label><Select value={form.cumulativeReset} onValueChange={(value) => update({ cumulativeReset: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{selectItems([["monthly", "Monthly"], ["quarterly", "Quarterly"], ["annually", "Annually"], ["never", "Never"]])}</SelectContent></Select></div>}
        </section>

        <section className="rounded-lg border p-4 space-y-4">
          <div><p className="font-medium text-sm">Target and status</p><p className="text-xs text-muted-foreground mt-1">Targets are versioned by effective date so past scorecards keep their original grade.</p></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Comparison rule</Label><Select value={form.comparisonRule} onValueChange={(value) => update({ comparisonRule: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{selectItems([["at_least", "Higher is better"], ["at_most", "Lower is better"], ["within_range", "Within a range"], ["exactly", "Exactly equals"], ["informational", "Informational only"]])}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Display format</Label><Select value={form.displayFormat} onValueChange={(value) => update({ displayFormat: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{displayOptionsForUnit(form.unit).map((value) => <SelectItem key={value} value={value}>{value === "currency" ? "Currency" : value === "percentage" ? "Percentage" : value === "duration" ? `${form.unit === "days" ? "Days" : "Hours"}` : "Number"}</SelectItem>)}</SelectContent></Select></div>
            {!targetIsInformational && !targetIsRange && <div className="space-y-1.5"><Label>Target</Label><Input type="number" step="any" value={form.targetValue} onChange={(event) => update({ targetValue: event.target.value })} placeholder="Leave empty if not set" /></div>}
            {targetIsRange && <><div className="space-y-1.5"><Label>Minimum target *</Label><Input type="number" step="any" value={form.targetMinimum} onChange={(event) => update({ targetMinimum: event.target.value })} /></div><div className="space-y-1.5"><Label>Maximum target *</Label><Input type="number" step="any" value={form.targetMaximum} onChange={(event) => update({ targetMaximum: event.target.value })} /></div></>}
            {!targetIsInformational && <div className="space-y-1.5"><Label>Optional warning threshold</Label><Input type="number" step="any" value={form.warningThreshold} onChange={(event) => update({ warningThreshold: event.target.value })} placeholder="Amber before red" /></div>}
            <div className="space-y-1.5"><Label>Target effective date</Label><Input type="date" value={form.targetEffectiveDate} onChange={(event) => update({ targetEffectiveDate: event.target.value })} /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label>Why this target changed</Label><Input value={form.targetChangeNote} onChange={(event) => update({ targetChangeNote: event.target.value })} placeholder="Optional note retained with the target history" /></div>
          </div>
        </section>

        <section className="rounded-lg border p-4 space-y-4">
          <div><p className="font-medium text-sm">Calculation</p><p className="text-xs text-muted-foreground mt-1">Choose a result calculation or collect inputs that SavvyOS calculates from.</p></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Result calculation</Label><Select value={form.calculationMethod} onValueChange={(value) => update({ calculationMethod: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{selectItems([["count", "Count"], ["unique_count", "Unique count"], ["sum", "Sum"], ["average", "Average"], ["weighted_average", "Weighted average"], ["percentage", "Percentage or ratio"], ["formula", "Formula using inputs"], ["latest", "Latest value"]])}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Metric status</Label><Select value={form.status} onValueChange={(value) => update({ status: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{selectItems([["active", "Active"], ["inactive", "Archived"]])}</SelectContent></Select></div>
          </div>
          {formula && <div className="space-y-4 rounded-md bg-muted/35 p-4"><div className="space-y-1.5"><Label>Formula *</Label><Input value={form.formulaExpression} onChange={(event) => update({ formulaExpression: event.target.value })} placeholder="advertising_spend / eligible_bookings" /><p className="text-xs text-muted-foreground">Use input keys, numbers, parentheses, and +, -, *, or /. Zero denominators are kept as a data state, not a fake result.</p></div><div className="space-y-1.5"><Label>Zero-denominator message</Label><Input value={form.zeroDenominatorLabel} onChange={(event) => update({ zeroDenominatorLabel: event.target.value })} placeholder="Example: No bookings generated" /></div><div><div className="flex items-center justify-between"><Label>Inputs</Label><Button type="button" variant="outline" size="sm" onClick={addInput}><Plus className="mr-1 h-3.5 w-3.5" />Input</Button></div><div className="mt-2 space-y-2">{form.manualInputDefinitions.length === 0 ? <p className="text-sm text-muted-foreground">Add the named inputs used in the formula.</p> : form.manualInputDefinitions.map((item: any, index: number) => <div className="grid grid-cols-[1fr_1fr_auto] gap-2" key={index}><Input value={item.key} onChange={(event) => updateInput(index, "key", event.target.value)} placeholder="eligible_bookings" /><Input value={item.label} onChange={(event) => updateInput(index, "label", event.target.value)} placeholder="Eligible bookings" /><Button type="button" variant="ghost" size="icon" onClick={() => removeInput(index)}><Trash2 className="h-4 w-4 text-destructive" /></Button></div>)}</div></div></div>}
          {automatic && <div className="space-y-4 rounded-md bg-primary/5 border border-primary/15 p-4"><div><p className="font-medium text-sm">SavvyOS automatic source</p><p className="text-xs text-muted-foreground mt-1">Only approved records and fields are available. There is no free-form database access.</p></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-1.5"><Label>Data source</Label><Select value={form.dataSource} onValueChange={(value) => update({ dataSource: value, dateField: sourceFields[value].dates[0], valueField: "", weightField: "", filterField: "", numeratorFilterField: "", denominatorFilterField: "" })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{selectItems([["tasks", "Tasks assigned to owner"], ["transactions", "Transactions owned by owner"], ["agent_connections", "Agent connections owned by owner"]])}</SelectContent></Select></div><div className="space-y-1.5"><Label>Date used for counting</Label><Select value={form.dateField} onValueChange={(value) => update({ dateField: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{fields.dates.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>Source calculation</Label><Select value={form.autoCalculation} onValueChange={(value) => update({ autoCalculation: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{selectItems([["count", "Count"], ["unique_count", "Unique count"], ["sum", "Sum"], ["average", "Average"], ["weighted_average", "Weighted average"], ["percentage", "Percentage / ratio"], ["latest", "Latest value"]])}</SelectContent></Select></div>{["sum", "average", "weighted_average", "latest"].includes(form.autoCalculation) && <div className="space-y-1.5"><Label>Numeric value field</Label><Select value={form.valueField} onValueChange={(value) => update({ valueField: value })}><SelectTrigger><SelectValue placeholder="Choose field" /></SelectTrigger><SelectContent>{fields.numbers.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>}{form.autoCalculation === "weighted_average" && <div className="space-y-1.5"><Label>Weight field</Label><Select value={form.weightField} onValueChange={(value) => update({ weightField: value })}><SelectTrigger><SelectValue placeholder="Choose field" /></SelectTrigger><SelectContent>{fields.numbers.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>}{form.metricType === "hybrid" && <div className="space-y-1.5"><Label>Automatic output key</Label><Input value={form.outputKey} onChange={(event) => update({ outputKey: event.target.value })} placeholder="eligible_bookings" /><p className="text-xs text-muted-foreground">Makes the automatic result available to a formula input.</p></div>}</div><div className="grid gap-3 sm:grid-cols-2 border-t pt-4"><div className="space-y-1.5"><Label>Optional source filter</Label><Select value={form.filterField || "none"} onValueChange={(value) => update({ filterField: value === "none" ? "" : value })}><SelectTrigger><SelectValue placeholder="All eligible records" /></SelectTrigger><SelectContent><SelectItem value="none">All eligible records</SelectItem>{dataFilterFields.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>Match value</Label><Input disabled={!form.filterField} value={form.filterValue} onChange={(event) => update({ filterValue: event.target.value })} placeholder="Use commas for several values" /></div>{form.autoCalculation === "percentage" && <><div className="space-y-1.5"><Label>Numerator filter</Label><Select value={form.numeratorFilterField || "none"} onValueChange={(value) => update({ numeratorFilterField: value === "none" ? "" : value })}><SelectTrigger><SelectValue placeholder="Choose field" /></SelectTrigger><SelectContent><SelectItem value="none">No numerator filter</SelectItem>{dataFilterFields.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select><Input className="mt-2" disabled={!form.numeratorFilterField} value={form.numeratorFilterValue} onChange={(event) => update({ numeratorFilterValue: event.target.value })} placeholder="Matching numerator value" /></div><div className="space-y-1.5"><Label>Denominator filter</Label><Select value={form.denominatorFilterField || "none"} onValueChange={(value) => update({ denominatorFilterField: value === "none" ? "" : value })}><SelectTrigger><SelectValue placeholder="Choose field" /></SelectTrigger><SelectContent><SelectItem value="none">No denominator filter</SelectItem>{dataFilterFields.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select><Input className="mt-2" disabled={!form.denominatorFilterField} value={form.denominatorFilterValue} onChange={(event) => update({ denominatorFilterValue: event.target.value })} placeholder="Matching denominator value" /></div></>}</div></div>}
        </section>

        <section className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3"><div><Label>Show in weekly scorecard reviews</Label><p className="mt-1 text-xs text-muted-foreground">Adding a metric to an L10 changes only where it is reviewed. The metric and its history remain here.</p></div>{l10Meetings.length ? <div className="grid gap-2 sm:grid-cols-2">{l10Meetings.map((meeting) => <label key={meeting.id} className="flex min-h-11 items-center gap-2 rounded-md border bg-background px-3 text-sm"><Checkbox checked={form.l10MeetingIds.includes(meeting.id)} onCheckedChange={(checked) => update({ l10MeetingIds: checked ? [...form.l10MeetingIds, meeting.id] : form.l10MeetingIds.filter((id: string) => id !== meeting.id) })} />{meeting.name}</label>)}</div> : <p className="text-sm text-muted-foreground">Create an L10 in Pulse Settings before assigning a metric to weekly review.</p>}</section>
      </div>
      <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={saveMetric.isPending} onClick={save}>{saveMetric.isPending ? "Saving…" : "Save metric"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
