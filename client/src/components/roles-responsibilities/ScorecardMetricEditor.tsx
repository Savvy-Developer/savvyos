import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { MultiSelect } from "@/components/ui/multi-select";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { defaultTotalsMode, describeAutomaticCalculation, displayFormatForUnit } from "@shared/scorecard";

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
  frequency: "weekly",
  measurementPeriod: "",
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
  calculationDescription: "",
  isCumulative: true,
  cumulativeReset: "annually",
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

function totalsFromMetric(metric: any) {
  if (metric?.isCumulative) return "cumulative";
  if (metric?.id) return "average";
  return defaultTotalsMode(metric?.unit ?? "count");
}

function applyTotals(mode: string, unit: string, reset: string | null = "annually") {
  const next = mode || defaultTotalsMode(unit);
  return { isCumulative: next === "cumulative", cumulativeReset: next === "cumulative" ? (reset || "annually") : null, calculationMethod: next === "average" ? "average" : "count" };
}

export default function ScorecardMetricEditor({ open, onOpenChange, responsibilityId, responsibilityOwnerId, metric, metricOwners, responsibilities, l10Meetings, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; responsibilityId?: number | null; responsibilityOwnerId?: number | null; metric?: any | null; metricOwners: any[]; responsibilities?: any[]; l10Meetings: any[]; onSaved: () => void }) {
  const [form, setForm] = useState<any>(defaults);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const saveMetric = trpc.rolesResponsibilities.saveMetric.useMutation({
    onSuccess: () => { toast.success("Measurable saved"); onSaved(); onOpenChange(false); },
    onError: (error) => toast.error(error.message),
  });

  useEffect(() => {
    if (!open) return;
    const config = metric?.autoConfig;
    const period = metric?.id ? (metric?.measurementPeriod ?? metric?.frequency ?? "") : "";
    const unit = metric?.unit ?? "count";
    const totals = totalsFromMetric(metric);
    setAdvancedOpen(false);
    setForm({
      ...defaults,
      name: metric?.name ?? "",
      ownerId: String(metric?.ownerId ?? metric?.owner?.id ?? responsibilityOwnerId ?? ""),
      responsibilityId: String(metric?.responsibilityId ?? responsibilityId ?? ""),
      definitionKey: metric?.definitionKey ?? "",
      definition: metric?.definition ?? "",
      metricType: metric?.metricType ?? "manual",
      frequency: metric?.frequency ?? "weekly",
      measurementPeriod: period,
      rollingDays: String(metric?.rollingDays ?? 30),
      reviewFrequency: metric?.reviewFrequency ?? "weekly",
      reportingSchedule: metric?.reportingSchedule ?? "",
      unit,
      displayFormat: metric?.displayFormat ?? displayFormatForUnit(unit),
      comparisonRule: metric?.comparisonRule ?? (metric?.performanceDirection === "lower" ? "at_most" : "at_least"),
      targetValue: metric?.targetValue == null ? "" : String(metric.targetValue),
      targetMinimum: metric?.targetMinimum == null ? "" : String(metric.targetMinimum),
      targetMaximum: metric?.targetMaximum == null ? "" : String(metric.targetMaximum),
      warningThreshold: metric?.warningThreshold == null ? "" : String(metric.warningThreshold),
      targetEffectiveDate: new Date().toISOString().slice(0, 10),
      targetChangeNote: "",
      calculationMethod: metric?.calculationMethod ?? metric?.rollupMethod ?? (totals === "average" ? "average" : "count"),
      formulaExpression: metric?.formulaExpression ?? "",
      manualInputDefinitions: metric?.manualInputDefinitions ?? [],
      zeroDenominatorLabel: metric?.zeroDenominatorLabel ?? "",
      calculationDescription: metric?.calculationDescription ?? "",
      totalsMode: totals,
      isCumulative: totals === "cumulative",
      cumulativeReset: metric?.cumulativeReset ?? "annually",
      status: metric?.status ?? "active",
      dataSource: config?.dataSource ?? "tasks",
      dateField: config?.dateField ?? "completedAt",
      autoCalculation: config?.calculation ?? "count",
      valueField: config?.valueField ?? "",
      weightField: config?.weightField ?? "",
      outputKey: config?.outputKey ?? "",
      filterField: "",
      filterValue: "",
      numeratorFilterField: "",
      numeratorFilterValue: "",
      denominatorFilterField: "",
      denominatorFilterValue: "",
      l10MeetingIds: metric?.l10MeetingIds ?? [],
    });
  }, [open, metric, responsibilityOwnerId, responsibilityId]);

  const fields = sourceFields[form.dataSource] ?? sourceFields.tasks;
  const automatic = form.metricType === "automatic" || form.metricType === "hybrid";
  const formula = form.calculationMethod === "formula";
  const targetIsRange = form.comparisonRule === "within_range";
  const targetIsInformational = form.comparisonRule === "informational";
  const originalTarget = metric?.id ? String(metric.targetValue ?? "") : "";
  const targetChanged = !!metric?.id && form.targetValue !== originalTarget;
  const dataFilterFields = useMemo(() => fields.filters, [fields]);
  const autoDescription = useMemo(() => describeAutomaticCalculation({
    dataSource: form.dataSource,
    dateField: form.dateField,
    calculation: form.autoCalculation,
    valueField: form.valueField,
    weightField: form.weightField,
    filters: filtersFrom(form.filterField, form.filterValue),
    numeratorFilters: filtersFrom(form.numeratorFilterField, form.numeratorFilterValue),
    denominatorFilters: filtersFrom(form.denominatorFilterField, form.denominatorFilterValue),
    formulaExpression: formula ? form.formulaExpression : null,
    isCumulative: form.isCumulative,
    cumulativeReset: form.cumulativeReset,
  }), [form.dataSource, form.dateField, form.autoCalculation, form.valueField, form.weightField, form.filterField, form.filterValue, form.numeratorFilterField, form.numeratorFilterValue, form.denominatorFilterField, form.denominatorFilterValue, formula, form.formulaExpression, form.isCumulative, form.cumulativeReset]);

  function update(values: Record<string, unknown>) { setForm((current: any) => ({ ...current, ...values })); }
  function addInput() { update({ manualInputDefinitions: [...form.manualInputDefinitions, { key: `input_${form.manualInputDefinitions.length + 1}`, label: "" }] }); }
  function updateInput(index: number, field: string, value: string) { update({ manualInputDefinitions: form.manualInputDefinitions.map((item: any, position: number) => position === index ? { ...item, [field]: value } : item) }); }
  function removeInput(index: number) { update({ manualInputDefinitions: form.manualInputDefinitions.filter((_: unknown, position: number) => position !== index) }); }

  function save() {
    if (!form.name.trim()) return toast.error("Enter a measurable name.");
    if (!form.ownerId) return toast.error("Choose the person accountable for this measurable.");
    const linkedResponsibilityId = Number(form.responsibilityId || responsibilityId);
    if (!linkedResponsibilityId) return toast.error("Choose the R&R this measurable belongs to.");
    if (!form.measurementPeriod) return toast.error("Choose a measurement period.");
    if (form.measurementPeriod === "rolling" && !parseNullableNumber(form.rollingDays)) return toast.error("Set the rolling number of days.");
    if (targetIsRange && (parseNullableNumber(form.targetMinimum) == null || parseNullableNumber(form.targetMaximum) == null)) return toast.error("Set both ends of the target range.");
    if (targetIsRange && Number(form.targetMinimum) > Number(form.targetMaximum)) return toast.error("The minimum target cannot exceed the maximum.");
    if (formula && !form.formulaExpression.trim()) return toast.error("Enter the formula used to calculate this result.");
    if (form.manualInputDefinitions.some((item: any) => !item.key.trim() || !item.label.trim())) return toast.error("Give each formula input a key and clear label.");
    if (automatic && ["sum", "average", "weighted_average", "latest"].includes(form.autoCalculation) && !form.valueField) return toast.error("Choose the numeric field used in the automatic calculation.");
    if (automatic && form.autoCalculation === "weighted_average" && !form.weightField) return toast.error("Choose the weight field for the weighted average.");
    if (!automatic && !form.calculationDescription.trim()) return toast.error("Describe how this measurable is calculated.");

    const autoConfig = automatic ? {
      dataSource: form.dataSource,
      dateField: form.dateField,
      calculation: form.autoCalculation,
      valueField: ["sum", "average", "weighted_average", "latest"].includes(form.autoCalculation) ? form.valueField : null,
      weightField: form.autoCalculation === "weighted_average" ? form.weightField : null,
      outputKey: form.metricType === "hybrid" ? (form.outputKey || "auto") : null,
      filters: filtersFrom(form.filterField, form.filterValue),
      numeratorFilters: form.autoCalculation === "percentage" ? filtersFrom(form.numeratorFilterField, form.numeratorFilterValue) : null,
      denominatorFilters: form.autoCalculation === "percentage" ? filtersFrom(form.denominatorFilterField, form.denominatorFilterValue) : null,
    } : null;
    const comparisonRule = form.comparisonRule;
    const targetValue = targetIsRange || targetIsInformational ? null : parseNullableNumber(form.targetValue);
    const totals = applyTotals(form.totalsMode, form.unit, form.cumulativeReset);
    saveMetric.mutate({
      ...(metric?.id ? { id: metric.id } : {}),
      responsibilityId: linkedResponsibilityId,
      ownerId: Number(form.ownerId),
      name: form.name.trim(),
      definitionKey: form.definitionKey.trim() || null,
      definition: form.definition.trim() || null,
      metricType: form.metricType,
      frequency: form.measurementPeriod === "weekly" ? "weekly" : form.measurementPeriod === "quarterly" || form.measurementPeriod === "quarter_to_date" ? "quarterly" : form.measurementPeriod === "year_to_date" || form.measurementPeriod === "annually" ? "annually" : "monthly",
      measurementPeriod: form.measurementPeriod,
      rollingDays: form.measurementPeriod === "rolling" ? Number(form.rollingDays) : null,
      reviewFrequency: form.reviewFrequency || "weekly",
      reportingSchedule: form.reportingSchedule.trim() || null,
      unit: form.unit,
      displayFormat: form.displayFormat || displayFormatForUnit(form.unit),
      comparisonRule,
      targetValue,
      targetMinimum: targetIsRange ? parseNullableNumber(form.targetMinimum) : null,
      targetMaximum: targetIsRange ? parseNullableNumber(form.targetMaximum) : null,
      warningThreshold: targetIsInformational ? null : parseNullableNumber(form.warningThreshold),
      targetEffectiveDate: form.targetEffectiveDate || new Date().toISOString().slice(0, 10),
      targetChangeNote: targetChanged ? (form.targetChangeNote.trim() || null) : null,
      performanceDirection: comparisonRule === "at_most" ? "lower" : "higher",
      rollupMethod: totals.isCumulative ? "sum" : "average",
      calculationMethod: automatic ? form.autoCalculation : totals.calculationMethod,
      formulaExpression: formula ? form.formulaExpression.trim() : null,
      manualInputDefinitions: formula ? form.manualInputDefinitions : [],
      zeroDenominatorLabel: form.zeroDenominatorLabel.trim() || null,
      calculationDescription: automatic ? autoDescription : form.calculationDescription.trim(),
      isCumulative: totals.isCumulative,
      cumulativeReset: totals.cumulativeReset,
      status: form.status || "active",
      autoConfig,
      l10MeetingIds: form.l10MeetingIds,
    } as any);
  }

  const selectItems = (items: Array<[string, string]>) => items.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>);
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="flex max-h-[90vh] w-[min(calc(100vw-2rem),40rem)] flex-col gap-3 overflow-hidden p-5 sm:max-w-[40rem]">
      <DialogHeader>
        <DialogTitle>{metric?.id ? "Edit measurable" : "Create measurable"}</DialogTitle>
        <DialogDescription>Name the result, how it is calculated, and who owns it. Extra settings stay behind Advanced.</DialogDescription>
      </DialogHeader>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        <section className="grid gap-3 sm:grid-cols-6">
          <div className="space-y-1 sm:col-span-6"><Label>Name *</Label><Input value={form.name} onChange={(event) => update({ name: event.target.value })} placeholder="Eligible booking conversion rate" /></div>
          <div className="space-y-1 sm:col-span-6"><Label>Definition</Label><Textarea className="min-h-[72px]" value={form.definition} onChange={(event) => update({ definition: event.target.value })} placeholder="Optional: what counts, what does not, and which people or records are included." /></div>
          <div className="space-y-1 sm:col-span-6"><Label>How it&apos;s calculated *</Label>{automatic ? <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm leading-6 text-muted-foreground">{autoDescription}</div> : <Textarea className="min-h-[72px]" value={form.calculationDescription} onChange={(event) => update({ calculationDescription: event.target.value })} placeholder="Describe exactly how this number is calculated." />}</div>
          <div className="space-y-1 sm:col-span-3"><Label>Owner *</Label><Select value={form.ownerId} onValueChange={(value) => update({ ownerId: value })}><SelectTrigger><SelectValue placeholder="Choose a person" /></SelectTrigger><SelectContent>{metricOwners.map((owner) => <SelectItem key={owner.id} value={String(owner.id)}>{owner.name ?? owner.email}{owner.title ? ` · ${owner.title}` : ""}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1 sm:col-span-3"><Label>R&amp;R *</Label>{responsibilities?.length ? <Select value={form.responsibilityId} onValueChange={(value) => update({ responsibilityId: value })}><SelectTrigger><SelectValue placeholder="Choose an R&R" /></SelectTrigger><SelectContent>{responsibilities.map((responsibility) => <SelectItem key={responsibility.id} value={String(responsibility.id)}>{responsibility.title}</SelectItem>)}</SelectContent></Select> : <Input value={metric?.responsibility?.title ?? "This R&R"} disabled />}</div>
          {!targetIsInformational && !targetIsRange && <div className="space-y-1 sm:col-span-3"><Label>Target</Label><Input type="number" step="any" value={form.targetValue} onChange={(event) => update({ targetValue: event.target.value })} placeholder="Leave empty if not set" /></div>}
          <div className={`space-y-1 ${targetIsInformational || targetIsRange ? "sm:col-span-6" : "sm:col-span-3"}`}><Label>Warning at</Label><Input type="number" step="any" value={form.warningThreshold} onChange={(event) => update({ warningThreshold: event.target.value })} placeholder="Optional" /></div>
          <div className="space-y-1 sm:col-span-2"><Label>Unit</Label><Select value={form.unit} onValueChange={(value) => { const totals = defaultTotalsMode(value); update({ unit: value, displayFormat: displayFormatForUnit(value), totalsMode: totals, ...applyTotals(totals, value) }); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{selectItems([["count", "Count"], ["dollars", "Dollars"], ["percentage", "Percentage"], ["hours", "Hours"], ["days", "Days"], ["score", "Score"]])}</SelectContent></Select></div>
          <div className="space-y-1 sm:col-span-2"><Label>Good is</Label><Select value={form.comparisonRule === "at_most" ? "at_most" : "at_least"} onValueChange={(value) => update({ comparisonRule: value, performanceDirection: value === "at_most" ? "lower" : "higher" })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{selectItems([["at_least", "Higher"], ["at_most", "Lower"]])}</SelectContent></Select></div>
          <div className="space-y-1 sm:col-span-2"><Label>Totals over time</Label><Select value={form.totalsMode ?? (form.isCumulative ? "cumulative" : "average")} onValueChange={(value) => update({ totalsMode: value, ...applyTotals(value, form.unit) })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{selectItems([["cumulative", "Cumulative"], ["average", "Average"]])}</SelectContent></Select><p className="text-xs text-muted-foreground">Resets annually.</p></div>
          <div className="space-y-1 sm:col-span-3"><Label>Measurement period *</Label><Select value={form.measurementPeriod || undefined} onValueChange={(value) => update({ measurementPeriod: value, frequency: value === "weekly" ? "weekly" : value === "quarterly" || value === "quarter_to_date" ? "quarterly" : value === "year_to_date" || value === "annually" ? "annually" : "monthly" })}><SelectTrigger><SelectValue placeholder="Choose a period" /></SelectTrigger><SelectContent>{selectItems([["weekly", "Weekly"], ["monthly", "Monthly"], ["quarterly", "Quarterly"], ["month_to_date", "Month-to-date"], ["quarter_to_date", "Quarter-to-date"], ["year_to_date", "Year-to-date"], ["rolling", "Rolling period"], ["per_event", "Per event"], ["current_snapshot", "Current snapshot"]])}</SelectContent></Select></div>
          {form.measurementPeriod === "rolling" ? <div className="space-y-1 sm:col-span-3"><Label>Rolling days *</Label><Input type="number" min="1" max="730" value={form.rollingDays} onChange={(event) => update({ rollingDays: event.target.value })} /></div> : null}
          {targetChanged && <div className="space-y-1 sm:col-span-6"><Label>Why did this change?</Label><Input value={form.targetChangeNote} onChange={(event) => update({ targetChangeNote: event.target.value })} placeholder="Required context is kept with the target history" /></div>}
          <div className="space-y-1 sm:col-span-6"><Label>Show in</Label>{l10Meetings.length ? <MultiSelect options={l10Meetings.map((meeting) => ({ value: meeting.id, label: meeting.name }))} value={form.l10MeetingIds} onValueChange={(value) => update({ l10MeetingIds: value })} placeholder="Choose L10s" searchPlaceholder="Search L10s…" emptyText="No L10s found." /> : <p className="text-sm text-muted-foreground">Create an L10 in Pulse Settings before assigning a measurable to weekly review.</p>}</div>
        </section>

        <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
          <CollapsibleTrigger asChild>
            <Button type="button" variant="ghost" className="h-8 px-0 text-sm font-medium">
              <ChevronDown className={`mr-1 h-4 w-4 transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
              Advanced
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-3 pt-1">
            <section className="rounded-lg border p-3 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5"><Label>Data and entry method</Label><Select value={form.metricType === "hybrid" ? "automatic" : form.metricType} onValueChange={(value) => update({ metricType: form.metricType === "hybrid" && value === "automatic" ? "hybrid" : value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{selectItems([["manual", "Manual result or inputs"], ["automatic", "Automatic SavvyOS calculation"]])}</SelectContent></Select></div>
                <div className="space-y-1.5"><Label>Measurable status</Label><Select value={form.status} onValueChange={(value) => update({ status: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{selectItems([["active", "Active"], ["inactive", "Archived"]])}</SelectContent></Select></div>

                <div className="space-y-1.5"><Label>Review frequency</Label><Select value={form.reviewFrequency} onValueChange={(value) => update({ reviewFrequency: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{selectItems([["weekly", "Weekly review"], ["monthly", "Monthly review"], ["quarterly", "Quarterly review"], ["annually", "Annual review"], ["as_needed", "As needed"]])}</SelectContent></Select></div>

                <div className="space-y-1.5"><Label>Reporting schedule</Label><Input value={form.reportingSchedule} onChange={(event) => update({ reportingSchedule: event.target.value })} placeholder="Example: Update by Monday 9 AM" /></div>
                <div className="space-y-1.5"><Label>Shared definition key</Label><Input value={form.definitionKey} onChange={(event) => update({ definitionKey: event.target.value })} placeholder="Optional: booking_conversion" /></div>
                <div className="space-y-1.5"><Label>Comparison rule</Label><Select value={form.comparisonRule} onValueChange={(value) => update({ comparisonRule: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{selectItems([["at_least", "Higher is better"], ["at_most", "Lower is better"], ["within_range", "Within a range"], ["exactly", "Exactly equals"], ["informational", "Informational only"]])}</SelectContent></Select></div>
                {targetIsRange && <><div className="space-y-1.5"><Label>Minimum target *</Label><Input type="number" step="any" value={form.targetMinimum} onChange={(event) => update({ targetMinimum: event.target.value })} /></div><div className="space-y-1.5"><Label>Maximum target *</Label><Input type="number" step="any" value={form.targetMaximum} onChange={(event) => update({ targetMaximum: event.target.value })} /></div></>}
                <div className="space-y-1.5"><Label>Target effective date</Label><Input type="date" value={form.targetEffectiveDate} onChange={(event) => update({ targetEffectiveDate: event.target.value })} /></div>
              </div>
            </section>
            {formula && <div className="space-y-3 rounded-md bg-muted/35 p-3"><div className="space-y-1.5"><Label>Formula *</Label><Input value={form.formulaExpression} onChange={(event) => update({ formulaExpression: event.target.value })} placeholder="advertising_spend / eligible_bookings" /></div><div className="space-y-1.5"><Label>Zero-denominator message</Label><Input value={form.zeroDenominatorLabel} onChange={(event) => update({ zeroDenominatorLabel: event.target.value })} placeholder="Example: No bookings generated" /></div><div><div className="flex items-center justify-between"><Label>Inputs</Label><Button type="button" variant="outline" size="sm" onClick={addInput}><Plus className="mr-1 h-3.5 w-3.5" />Input</Button></div><div className="mt-2 space-y-2">{form.manualInputDefinitions.length === 0 ? <p className="text-sm text-muted-foreground">Add the named inputs used in the formula.</p> : form.manualInputDefinitions.map((item: any, index: number) => <div className="grid grid-cols-[1fr_1fr_auto] gap-2" key={index}><Input value={item.key} onChange={(event) => updateInput(index, "key", event.target.value)} placeholder="eligible_bookings" /><Input value={item.label} onChange={(event) => updateInput(index, "label", event.target.value)} placeholder="Eligible bookings" /><Button type="button" variant="ghost" size="icon" onClick={() => removeInput(index)}><Trash2 className="h-4 w-4 text-destructive" /></Button></div>)}</div></div></div>}
            {automatic && <div className="space-y-3 rounded-md bg-primary/5 border border-primary/15 p-3"><div><p className="font-medium text-sm">SavvyOS automatic source</p><p className="text-xs text-muted-foreground mt-1">Only approved records and fields are available.</p></div><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><Label>Data source</Label><Select value={form.dataSource} onValueChange={(value) => update({ dataSource: value, dateField: sourceFields[value].dates[0], valueField: "", weightField: "", filterField: "", numeratorFilterField: "", denominatorFilterField: "" })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{selectItems([["tasks", "Tasks assigned to owner"], ["transactions", "Transactions owned by owner"], ["agent_connections", "Agent connections owned by owner"]])}</SelectContent></Select></div><div className="space-y-1.5"><Label>Date used for counting</Label><Select value={form.dateField} onValueChange={(value) => update({ dateField: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{fields.dates.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>Source calculation</Label><Select value={form.autoCalculation} onValueChange={(value) => update({ autoCalculation: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{selectItems([["count", "Count"], ["unique_count", "Unique count"], ["sum", "Sum"], ["average", "Average"], ["weighted_average", "Weighted average"], ["percentage", "Percentage / ratio"], ["latest", "Latest value"]])}</SelectContent></Select></div>{["sum", "average", "weighted_average", "latest"].includes(form.autoCalculation) && <div className="space-y-1.5"><Label>Numeric value field</Label><Select value={form.valueField} onValueChange={(value) => update({ valueField: value })}><SelectTrigger><SelectValue placeholder="Choose field" /></SelectTrigger><SelectContent>{fields.numbers.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>}{form.autoCalculation === "weighted_average" && <div className="space-y-1.5"><Label>Weight field</Label><Select value={form.weightField} onValueChange={(value) => update({ weightField: value })}><SelectTrigger><SelectValue placeholder="Choose field" /></SelectTrigger><SelectContent>{fields.numbers.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>}</div><div className="grid gap-3 sm:grid-cols-2 border-t pt-3"><div className="space-y-1.5"><Label>Optional source filter</Label><Select value={form.filterField || "none"} onValueChange={(value) => update({ filterField: value === "none" ? "" : value })}><SelectTrigger><SelectValue placeholder="All eligible records" /></SelectTrigger><SelectContent><SelectItem value="none">All eligible records</SelectItem>{dataFilterFields.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>Match value</Label><Input disabled={!form.filterField} value={form.filterValue} onChange={(event) => update({ filterValue: event.target.value })} placeholder="Use commas for several values" /></div>{form.autoCalculation === "percentage" && <><div className="space-y-1.5"><Label>Numerator filter</Label><Select value={form.numeratorFilterField || "none"} onValueChange={(value) => update({ numeratorFilterField: value === "none" ? "" : value })}><SelectTrigger><SelectValue placeholder="Choose field" /></SelectTrigger><SelectContent><SelectItem value="none">No numerator filter</SelectItem>{dataFilterFields.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select><Input className="mt-2" disabled={!form.numeratorFilterField} value={form.numeratorFilterValue} onChange={(event) => update({ numeratorFilterValue: event.target.value })} placeholder="Matching numerator value" /></div><div className="space-y-1.5"><Label>Denominator filter</Label><Select value={form.denominatorFilterField || "none"} onValueChange={(value) => update({ denominatorFilterField: value === "none" ? "" : value })}><SelectTrigger><SelectValue placeholder="Choose field" /></SelectTrigger><SelectContent><SelectItem value="none">No denominator filter</SelectItem>{dataFilterFields.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select><Input className="mt-2" disabled={!form.denominatorFilterField} value={form.denominatorFilterValue} onChange={(event) => update({ denominatorFilterValue: event.target.value })} placeholder="Matching denominator value" /></div></>}</div></div>}
          </CollapsibleContent>
        </Collapsible>
      </div>
      <DialogFooter className="shrink-0 pt-1"><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={saveMetric.isPending} onClick={save}>{saveMetric.isPending ? "Saving…" : "Save measurable"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
