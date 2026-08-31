import { useEffect, useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import RichEmailEditor from "@/components/RichEmailEditor";
import EmailMessagePreviewDialog from "@/components/EmailMessagePreviewDialog";
import SmartPlanTestSendDialog from "@/components/SmartPlanTestSendDialog";
import LeadSourceTriggerPicker, { formatLeadSourcePath } from "@/components/LeadSourceTriggerPicker";
import { toast } from "sonner";
import {
  ArrowLeft, BarChart3, Check, Clock, Eye, FileText,
  Mail, MessageSquare, Pause, Play, Plus, Save, Send, Settings2, Trash2,
  Users, Zap, AlertTriangle, ExternalLink, MousePointerClick, Reply, Ban,
} from "lucide-react";

type Channel = "email" | "sms";
type Tab = "workflow" | "analytics" | "settings";

type Metrics = {
  executions: number;
  sent: number;
  skipped: number;
  failed: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  complained: number;
  suppressed: number;
  replied: number;
};

type Step = {
  id: number;
  planId: number;
  stepOrder: number;
  channel: Channel;
  delayDays: number;
  delayHours: number;
  subject: string | null;
  body: string;
  businessHoursOnly: boolean;
  sendWindowOverride: boolean;
  sendWindowEnabled: boolean;
  sendDays: number[] | null;
  sendStartHour: number;
  sendEndHour: number;
  timezone: string;
  metrics: Metrics;
};

type StepForm = {
  channel: Channel;
  delayDays: number;
  delayHours: number;
  subject: string;
  body: string;
  businessHoursOnly: boolean;
  sendWindowOverride: boolean;
  sendWindowEnabled: boolean;
  sendDays: number[];
  sendStartHour: number;
  sendEndHour: number;
  timezone: string;
};

type LeadSource = { id: number; name: string; parentId: number | null };

const EMPTY_METRICS: Metrics = {
  executions: 0, sent: 0, skipped: 0, failed: 0, delivered: 0,
  opened: 0, clicked: 0, bounced: 0, complained: 0, suppressed: 0, replied: 0,
};

const EMPTY_STEP: StepForm = {
  channel: "email",
  delayDays: 0,
  delayHours: 0,
  subject: "",
  body: "",
  businessHoursOnly: false,
  sendWindowOverride: false,
  sendWindowEnabled: true,
  sendDays: [0, 1, 2, 3, 4, 5, 6],
  sendStartHour: 8,
  sendEndHour: 20,
  timezone: "America/New_York",
};

const TIMEZONES = [
  ["America/New_York", "Eastern (ET)"],
  ["America/Chicago", "Central (CT)"],
  ["America/Denver", "Mountain (MT)"],
  ["America/Phoenix", "Mountain — Arizona"],
  ["America/Los_Angeles", "Pacific (PT)"],
  ["America/Anchorage", "Alaska (AKT)"],
  ["Pacific/Honolulu", "Hawaii (HST)"],
] as const;

const DAYS_OF_WEEK = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

function hourLabel(hour: number) {
  if (hour === 0 || hour === 24) return hour === 0 ? "12:00 AM" : "12:00 AM (next day)";
  const suffix = hour >= 12 ? "PM" : "AM";
  return `${hour > 12 ? hour - 12 : hour}:00 ${suffix}`;
}

function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function delayLabel(days: number, hours: number) {
  if (!days && !hours) return "Immediately";
  const parts: string[] = [];
  if (days) parts.push(`${days} day${days === 1 ? "" : "s"}`);
  if (hours) parts.push(`${hours} hour${hours === 1 ? "" : "s"}`);
  return `After ${parts.join(", ")}`;
}

function percent(numerator: number, denominator: number) {
  if (!denominator) return "—";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function statusBadge(status: string) {
  if (status === "active") return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100">Active</Badge>;
  if (status === "paused") return <Badge className="bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100">Paused</Badge>;
  return <Badge variant="outline" className="text-slate-600">Draft</Badge>;
}

function channelBadge(channel: Channel) {
  return channel === "email"
    ? <Badge variant="outline" className="gap-1 text-[11px]"><Mail className="h-3 w-3" /> Email</Badge>
    : <Badge variant="outline" className="gap-1 text-[11px] text-violet-700 border-violet-200 bg-violet-50"><MessageSquare className="h-3 w-3" /> Text</Badge>;
}

function MetricCard({ label, value, detail, icon: Icon, tone = "default" }: {
  label: string;
  value: string | number;
  detail: string;
  icon: typeof Send;
  tone?: "default" | "success" | "warning" | "danger" | "violet";
}) {
  const tones = {
    default: "bg-sky-50 text-sky-700 border-sky-100",
    success: "bg-emerald-50 text-emerald-700 border-emerald-100",
    warning: "bg-amber-50 text-amber-700 border-amber-100",
    danger: "bg-rose-50 text-rose-700 border-rose-100",
    violet: "bg-violet-50 text-violet-700 border-violet-100",
  };
  return (
    <Card className="shadow-none">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{detail}</p>
          </div>
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${tones[tone]}`}>
            <Icon className="h-4 w-4" />
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function NewPlanPage() {
  const [, navigate] = useLocation();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const createDraft = trpc.smartPlans.createDraft.useMutation({
    onSuccess: (data) => {
      toast.success("Draft created. Build your workflow below.");
      navigate(`/smart-plans/${data.id}`, { replace: true });
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-4">
      <Button variant="ghost" size="sm" className="-ml-2" onClick={() => navigate("/smart-plans")}>
        <ArrowLeft className="mr-1.5 h-4 w-4" /> Smart Plans
      </Button>
      <Card className="border-primary/20 shadow-sm">
        <CardHeader className="border-b bg-gradient-to-r from-sky-50 to-background">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Zap className="h-5 w-5" /></span>
            <div>
              <CardTitle>Create a Smart Plan</CardTitle>
              <CardDescription className="mt-1">Start with the plan purpose. You will build and review all steps in a dedicated workspace.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5 pt-6">
          <div className="space-y-2">
            <Label htmlFor="plan-name">Plan name <span className="text-destructive">*</span></Label>
            <Input id="plan-name" autoFocus placeholder="e.g. Zillow new lead follow-up" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="plan-description">Description</Label>
            <Textarea id="plan-description" placeholder="Who enters this workflow and what outcome should it create?" value={description} onChange={(event) => setDescription(event.target.value)} rows={4} />
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => navigate("/smart-plans")}>Cancel</Button>
            <Button
              onClick={() => {
                if (!name.trim()) return toast.error("A plan name is required");
                createDraft.mutate({ name: name.trim(), description: description.trim() || null });
              }}
              disabled={createDraft.isPending}
            >
              <Zap className="mr-1.5 h-4 w-4" /> {createDraft.isPending ? "Creating..." : "Create plan workspace"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StepComposer({ planId, step, defaultSchedule, onSaved, onDelete, propertyAddressFromNotes = false }: {
  planId: number;
  step: Step | null;
  defaultSchedule: { enabled: boolean; days: number[]; startHour: number; endHour: number; timezone: string };
  onSaved: (stepId?: number) => void;
  onDelete: () => void;
  propertyAddressFromNotes?: boolean;
}) {
  const [form, setForm] = useState<StepForm>(EMPTY_STEP);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [testSendOpen, setTestSendOpen] = useState(false);
  const isExisting = !!step;

  useEffect(() => {
    if (!step) {
      setForm(EMPTY_STEP);
      return;
    }
    setForm({
      channel: step.channel,
      delayDays: step.delayDays,
      delayHours: step.delayHours,
      subject: step.subject ?? "",
      body: step.body,
      businessHoursOnly: step.businessHoursOnly,
      sendWindowOverride: step.sendWindowOverride ?? step.businessHoursOnly ?? false,
      sendWindowEnabled: step.sendWindowOverride ? step.sendWindowEnabled : defaultSchedule.enabled,
      sendDays: step.sendWindowOverride && step.sendDays?.length ? step.sendDays : defaultSchedule.days,
      sendStartHour: step.sendWindowOverride ? step.sendStartHour ?? defaultSchedule.startHour : defaultSchedule.startHour,
      sendEndHour: step.sendWindowOverride ? step.sendEndHour ?? defaultSchedule.endHour : defaultSchedule.endHour,
      timezone: step.sendWindowOverride ? step.timezone || defaultSchedule.timezone : defaultSchedule.timezone,
    });
  }, [step?.id, defaultSchedule.enabled, defaultSchedule.startHour, defaultSchedule.endHour, defaultSchedule.timezone, defaultSchedule.days.join(",")]);

  const addStep = trpc.smartPlans.steps.add.useMutation({
    onSuccess: (result) => { toast.success("Step added"); onSaved(result.id); },
    onError: (error) => toast.error(error.message),
  });
  const updateStep = trpc.smartPlans.steps.updateOne.useMutation({
    onSuccess: () => { toast.success("Step saved"); onSaved(step?.id); },
    onError: (error) => toast.error(error.message),
  });
  const saving = addStep.isPending || updateStep.isPending;
  const save = () => {
    if (!form.body.trim()) return toast.error("Message content is required");
    if (form.channel === "email" && !form.subject.trim()) return toast.error("An email subject is required");
    if (form.sendWindowEnabled && form.sendDays.length === 0) return toast.error("Choose at least one delivery day");
    if (form.sendWindowEnabled && form.sendStartHour >= form.sendEndHour) return toast.error("The window must end after it begins");
    const payload = {
      channel: form.channel,
      delayDays: form.delayDays,
      delayHours: form.delayHours,
      subject: form.channel === "email" ? form.subject.trim() : null,
      body: form.body,
      businessHoursOnly: form.businessHoursOnly,
      sendWindowOverride: form.sendWindowOverride,
      sendWindowEnabled: form.sendWindowEnabled,
      sendDays: form.sendDays,
      sendStartHour: form.sendStartHour,
      sendEndHour: form.sendEndHour,
      timezone: form.timezone,
    };
    if (step) updateStep.mutate({ stepId: step.id, ...payload });
    else addStep.mutate({ planId, ...payload });
  };

  const isSms = form.channel === "sms";
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{isExisting ? `Step ${(step?.stepOrder ?? 0) + 1}` : "New step"}</p>
          <h2 className="mt-1 text-lg font-semibold">{isExisting ? (step?.subject || (step?.channel === "sms" ? "Text message" : "Untitled email")) : "Compose a workflow step"}</h2>
        </div>
        {isExisting && (
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={onDelete}><Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete</Button>
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label>Channel</Label>
          <Select value={form.channel} onValueChange={(value) => setForm((current) => ({ ...current, channel: value as Channel, subject: "" }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="email"><span className="flex items-center gap-2"><Mail className="h-3.5 w-3.5" /> Email</span></SelectItem>
              <SelectItem value="sms"><span className="flex items-center gap-2"><MessageSquare className="h-3.5 w-3.5" /> Text message</span></SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Wait days</Label>
          <Input type="number" min={0} value={form.delayDays} onChange={(event) => setForm((current) => ({ ...current, delayDays: Math.max(0, Number(event.target.value) || 0) }))} />
        </div>
        <div className="space-y-2">
          <Label>Additional hours</Label>
          <Input type="number" min={0} max={23} value={form.delayHours} onChange={(event) => setForm((current) => ({ ...current, delayHours: Math.min(23, Math.max(0, Number(event.target.value) || 0)) }))} />
        </div>
      </div>

      {isSms && (
        <div className="flex gap-3 rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm text-violet-950">
          <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-violet-700" />
          <p><strong>Marketing text delivery is protected.</strong> Messages send only from the dedicated Aircall marketing number to contacts with recorded SMS marketing consent. Opted-out and Do Not Contact records are automatically skipped; replies appear in the Marketing Text Inbox.</p>
        </div>
      )}

      {isSms && propertyAddressFromNotes && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950">
          <strong>Offer Sheet referral property text.</strong> <code className="rounded bg-white/80 px-1 py-0.5">{"{{property}}"}</code> is filled from “Address of Interested Property” in this referral’s contact note. If no exact address is found, SavvyOS sends the configured Offer Sheet fallback text instead.
        </div>
      )}

      {form.channel === "email" ? (
        <div className="space-y-2">
          <Label>Email subject <span className="text-destructive">*</span></Label>
          <Input placeholder="Hi {{first_name}}, thank you for reaching out" value={form.subject} onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))} />
        </div>
      ) : null}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>{form.channel === "email" ? "Email content" : "Text message"} <span className="text-destructive">*</span></Label>
          {form.channel === "sms" && <span className="text-xs text-muted-foreground">{form.body.length}/160</span>}
        </div>
        {form.channel === "email" ? (
          <RichEmailEditor value={form.body} onChange={(body) => setForm((current) => ({ ...current, body }))} placeholder="Write the email your contact will receive..." />
        ) : (
          <Textarea value={form.body} maxLength={160} rows={6} placeholder="Hi {{first_name}}, we received your inquiry from {{lead_source}}..." onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))} />
        )}
        {form.channel === "email" && (
          <div className="flex justify-end pt-1">
            <Button type="button" variant="outline" size="sm" onClick={() => setPreviewOpen(true)} disabled={!form.subject.trim() || !stripHtml(form.body)}>
              <Eye className="mr-1.5 h-4 w-4" /> Preview email
            </Button>
          </div>
        )}
        <div className="flex justify-end pt-1">
          <Button type="button" variant="outline" size="sm" onClick={() => setTestSendOpen(true)} disabled={!form.body.trim() || (form.channel === "email" && !form.subject.trim())}>
            <Send className="mr-1.5 h-4 w-4" /> Test send
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="mr-1 text-xs text-muted-foreground">Insert:</span>
          {["{{first_name}}", "{{last_name}}", "{{full_name}}", "{{lead_source}}", "{{agent_name}}"].map((tag) => (
            <button key={tag} type="button" className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[11px] text-primary hover:bg-primary/20" onClick={() => setForm((current) => ({ ...current, body: `${current.body}${tag}` }))}>{tag}</button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border bg-slate-50/70 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Override plan delivery schedule</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{form.sendWindowOverride ? "Choose days and hours for this step only." : "This step uses the plan default. Turn on an override to use different delivery times."}</p>
          </div>
          <button type="button" role="switch" aria-checked={form.sendWindowOverride} onClick={() => setForm((current) => ({ ...current, sendWindowOverride: !current.sendWindowOverride, sendWindowEnabled: true, businessHoursOnly: false, ...(current.sendWindowOverride ? { sendDays: defaultSchedule.days, sendStartHour: defaultSchedule.startHour, sendEndHour: defaultSchedule.endHour, timezone: defaultSchedule.timezone } : {}) }))} className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${form.sendWindowOverride ? "bg-primary" : "bg-slate-200"}`}>
            <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${form.sendWindowOverride ? "translate-x-6" : "translate-x-1"}`} />
          </button>
        </div>
        {form.sendWindowOverride && (
          <div className="mt-4 space-y-4 border-t pt-4">
            <div className="space-y-2">
              <Label>Allowed days</Label>
              <div className="flex flex-wrap gap-2">
                {DAYS_OF_WEEK.map((day) => {
                  const selected = form.sendDays.includes(day.value);
                  return <Button key={day.value} type="button" size="sm" variant={selected ? "default" : "outline"} className="h-8 min-w-12" onClick={() => setForm((current) => ({ ...current, sendDays: selected ? current.sendDays.filter((value) => value !== day.value) : [...current.sendDays, day.value].sort((a, b) => a - b) }))}>{day.label}</Button>;
                })}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-2"><Label>Start time</Label><Select value={String(form.sendStartHour)} onValueChange={(value) => setForm((current) => ({ ...current, sendStartHour: Number(value) }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Array.from({ length: 24 }, (_, hour) => <SelectItem key={hour} value={String(hour)}>{hourLabel(hour)}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-2"><Label>End time</Label><Select value={String(form.sendEndHour)} onValueChange={(value) => setForm((current) => ({ ...current, sendEndHour: Number(value) }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Array.from({ length: 24 }, (_, index) => index + 1).map((hour) => <SelectItem key={hour} value={String(hour)}>{hourLabel(hour)}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-2"><Label>Timezone</Label><Select value={form.timezone} onValueChange={(timezone) => setForm((current) => ({ ...current, timezone }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TIMEZONES.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end border-t pt-4">
        <Button onClick={save} disabled={saving}><Save className="mr-1.5 h-4 w-4" /> {saving ? "Saving..." : isExisting ? "Save step" : "Add step"}</Button>
      </div>
      {previewOpen && <EmailMessagePreviewDialog subject={form.subject} body={form.body} onClose={() => setPreviewOpen(false)} />}
      {testSendOpen && <SmartPlanTestSendDialog channel={form.channel} subject={form.subject} body={form.body} onClose={() => setTestSendOpen(false)} />}
    </div>
  );
}

type TriggerType = "lead_source" | "all_lead_sources" | "buyer_under_contract" | "seller_under_contract" | "new_listing" | "buyer_closed" | "seller_closed";

const SMART_PLAN_TRIGGERS: Array<{ value: TriggerType; label: string; futureLabel: string }> = [
  { value: "lead_source", label: "Lead Source", futureLabel: "contacts from the selected lead source" },
  { value: "all_lead_sources", label: "All Lead Sources", futureLabel: "every newly added contact and all current contacts when included" },
  { value: "buyer_under_contract", label: "Buyer Goes Under Contract", futureLabel: "buyer contacts that go under contract" },
  { value: "seller_under_contract", label: "Seller Goes Under Contract", futureLabel: "seller contacts that go under contract" },
  { value: "new_listing", label: "New Listing", futureLabel: "new listing contacts" },
  { value: "buyer_closed", label: "Buyer Transaction Closed", futureLabel: "buyer contacts whose transactions close" },
  { value: "seller_closed", label: "Seller Transaction Closed", futureLabel: "seller contacts whose transactions close" },
];

function SettingsPanel({ plan, leadSources, onSaved }: { plan: any; leadSources: LeadSource[]; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: "",
    description: "",
    triggerType: "lead_source" as TriggerType,
    triggerLeadSourceIds: [] as number[],
    includeExistingContacts: false,
    pauseOnReply: false,
    defaultSendDays: [0, 1, 2, 3, 4, 5, 6] as number[],
    defaultSendStartHour: 8,
    defaultSendEndHour: 20,
    defaultSendTimezone: "America/New_York",
  });
  useEffect(() => {
    if (!plan) return;
    setForm({
      name: plan.name || "",
      description: plan.description || "",
      triggerType: (plan.triggerType || "lead_source") as TriggerType,
      triggerLeadSourceIds: plan.triggerLeadSourceIds || (plan.triggerLeadSourceId ? [plan.triggerLeadSourceId] : []),
      includeExistingContacts: plan.triggerScope === "existing_and_new",
      pauseOnReply: plan.pauseOnReply ?? false,
      defaultSendDays: plan.defaultSendDays?.length ? plan.defaultSendDays : [0, 1, 2, 3, 4, 5, 6],
      defaultSendStartHour: plan.defaultSendStartHour ?? 8,
      defaultSendEndHour: plan.defaultSendEndHour ?? 20,
      defaultSendTimezone: plan.defaultSendTimezone || "America/New_York",
    });
  }, [plan?.id, plan?.updatedAt]);

  const selectedTrigger = SMART_PLAN_TRIGGERS.find((trigger) => trigger.value === form.triggerType) ?? SMART_PLAN_TRIGGERS[0];
  const isLeadSourceTrigger = form.triggerType === "lead_source";
  const { data: matchingData, isLoading: isLoadingMatchCount } = trpc.smartPlans.countMatchingContactsForTrigger.useQuery({
    triggerType: form.triggerType,
    triggerLeadSourceIds: isLeadSourceTrigger ? form.triggerLeadSourceIds : null,
  });
  const update = trpc.smartPlans.update.useMutation({
    onSuccess: (result) => {
      toast.success(result.enrolled > 0 ? `Plan settings saved and ${result.enrolled.toLocaleString()} current contacts enrolled` : "Plan settings saved");
      onSaved();
    },
    onError: (error) => toast.error(error.message),
  });
  const selectedSources = form.triggerLeadSourceIds.map((id) => leadSources.find((source) => source.id === id)).filter(Boolean) as LeadSource[];
  const currentMatchCount = isLoadingMatchCount ? "…" : (matchingData?.count ?? 0).toLocaleString();

  const save = () => {
    if (!form.name.trim()) return toast.error("A plan name is required");
    if (isLeadSourceTrigger && form.triggerLeadSourceIds.length === 0) return toast.error("Choose at least one lead source for this trigger");
    if (!form.defaultSendDays.length) return toast.error("Choose at least one default delivery day");
    if (form.defaultSendStartHour >= form.defaultSendEndHour) return toast.error("The default delivery window must end after it begins");
    update.mutate({
      id: plan.id,
      data: {
        name: form.name.trim(),
        description: form.description.trim() || null,
        triggerType: form.triggerType,
        triggerLeadSourceIds: isLeadSourceTrigger && form.triggerLeadSourceIds.length ? form.triggerLeadSourceIds : null,
        triggerScope: form.includeExistingContacts ? "existing_and_new" : "new_only",
        includeExistingContacts: form.includeExistingContacts,
        pauseOnReply: form.pauseOnReply,
        defaultSendWindowEnabled: true,
        defaultSendDays: form.defaultSendDays,
        defaultSendStartHour: form.defaultSendStartHour,
        defaultSendEndHour: form.defaultSendEndHour,
        defaultSendTimezone: form.defaultSendTimezone,
      },
    });
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div><h2 className="text-lg font-semibold">Plan settings</h2><p className="mt-1 text-sm text-muted-foreground">Set the plan identity, choose the event that starts it, and decide whether matching current contacts should enter now.</p></div>
      <Card>
        <CardContent className="space-y-5 pt-6">
          <div className="space-y-2"><Label>Plan name <span className="text-destructive">*</span></Label><Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></div>
          <div className="space-y-2"><Label>Description</Label><Textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} rows={3} /></div>
          <Separator />

          <div className="space-y-4 rounded-lg border border-primary/20 bg-primary/[0.03] p-4">
            <div><Label className="text-sm font-medium">Default limited delivery schedule</Label><p className="mt-1 text-xs text-muted-foreground">Every workflow step uses these days and hours unless its individual delivery schedule is overridden.</p></div>
            <div className="space-y-2"><Label>Allowed days</Label><div className="flex flex-wrap gap-2">{DAYS_OF_WEEK.map((day) => { const selected = form.defaultSendDays.includes(day.value); return <Button key={day.value} type="button" size="sm" variant={selected ? "default" : "outline"} className="h-8 min-w-12" onClick={() => setForm((current) => ({ ...current, defaultSendDays: selected ? current.defaultSendDays.filter((value) => value !== day.value) : [...current.defaultSendDays, day.value].sort((a, b) => a - b) }))}>{day.label}</Button>; })}</div></div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-2"><Label>Start time</Label><Select value={String(form.defaultSendStartHour)} onValueChange={(value) => setForm((current) => ({ ...current, defaultSendStartHour: Number(value) }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Array.from({ length: 24 }, (_, hour) => <SelectItem key={hour} value={String(hour)}>{hourLabel(hour)}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-2"><Label>End time</Label><Select value={String(form.defaultSendEndHour)} onValueChange={(value) => setForm((current) => ({ ...current, defaultSendEndHour: Number(value) }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Array.from({ length: 24 }, (_, index) => index + 1).map((hour) => <SelectItem key={hour} value={String(hour)}>{hourLabel(hour)}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-2"><Label>Timezone</Label><Select value={form.defaultSendTimezone} onValueChange={(timezone) => setForm((current) => ({ ...current, defaultSendTimezone: timezone }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TIMEZONES.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
            </div>
          </div>
          <Separator />

          <div className="space-y-2">
            <div><Label>Trigger</Label><p className="mt-1 text-xs text-muted-foreground">Choose the event that automatically starts this Smart Plan when it is active.</p></div>
            <Select value={form.triggerType} onValueChange={(value) => setForm((current) => ({ ...current, triggerType: value as TriggerType }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{SMART_PLAN_TRIGGERS.map((trigger) => <SelectItem key={trigger.value} value={trigger.value}>{trigger.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          {isLeadSourceTrigger && <div className="space-y-2 rounded-lg border bg-muted/20 p-4">
            <div><Label>Lead sources</Label><p className="mt-1 text-xs text-muted-foreground">Choose a source first, then select one of its nested sub-sources when applicable.</p></div>
            <LeadSourceTriggerPicker
              sources={leadSources}
              selectedIds={form.triggerLeadSourceIds}
              onAdd={(id) => setForm((current) => current.triggerLeadSourceIds.includes(id) ? current : ({ ...current, triggerLeadSourceIds: [...current.triggerLeadSourceIds, id] }))}
            />
            <div className="flex flex-wrap gap-2">{selectedSources.map((source) => <Badge key={source.id} variant="secondary" className="gap-1.5 py-1"><Zap className="h-3 w-3" />{formatLeadSourcePath(source, leadSources)}<button type="button" aria-label={`Remove ${formatLeadSourcePath(source, leadSources)}`} className="ml-0.5 text-muted-foreground hover:text-destructive" onClick={() => setForm((current) => ({ ...current, triggerLeadSourceIds: current.triggerLeadSourceIds.filter((id) => id !== source.id) }))}>×</button></Badge>)}</div>
          </div>}

          <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Label htmlFor="pause-on-reply" className="cursor-pointer text-sm font-medium">Pause plan when a reply is received</Label>
                <p className="mt-1 text-xs text-muted-foreground">When a contact replies to a Smart Plan text or email, their enrollment pauses before the next step. You can review and resume the enrollment when ready.</p>
              </div>
              <Checkbox id="pause-on-reply" checked={form.pauseOnReply} onCheckedChange={(checked) => setForm((current) => ({ ...current, pauseOnReply: checked === true }))} />
            </div>
          </div>

          <div className="rounded-lg border border-primary/20 bg-primary/[0.03] p-4">
            <div className="flex items-start gap-3">
              <Checkbox id="include-current-contacts" checked={form.includeExistingContacts} onCheckedChange={(checked) => setForm((current) => ({ ...current, includeExistingContacts: checked === true }))} />
              <div className="space-y-1.5">
                <Label htmlFor="include-current-contacts" className="cursor-pointer text-sm font-medium">Include all ({currentMatchCount}) current {selectedTrigger.label} contacts</Label>
                {form.includeExistingContacts
                  ? <p className="text-xs text-muted-foreground">Matching current contacts will be enrolled when you save these settings. Future matching contacts will continue to enter automatically.</p>
                  : <p className="text-xs text-muted-foreground">This Smart Plan will only be applied to new {selectedTrigger.futureLabel}.</p>}
              </div>
            </div>
          </div>

          <div className="flex justify-end border-t pt-4"><Button disabled={update.isPending} onClick={save}><Save className="mr-1.5 h-4 w-4" />{update.isPending ? "Saving..." : "Save settings"}</Button></div>
        </CardContent>
      </Card>
    </div>
  );
}

function AnalyticsPanel({ steps, totals }: { steps: Step[]; totals: Metrics }) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-semibold">Performance analytics</h2><p className="mt-1 text-sm text-muted-foreground">Provider feedback is attributed to the individual workflow step that sent the message.</p></div><p className="text-xs text-muted-foreground">Rates use delivered emails when available, otherwise sent emails.</p></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Messages sent" value={totals.sent.toLocaleString()} detail={`${totals.failed.toLocaleString()} failed · ${totals.skipped.toLocaleString()} skipped`} icon={Send} />
        <MetricCard label="Delivered" value={totals.delivered.toLocaleString()} detail={`${percent(totals.delivered, totals.sent)} of sent`} icon={Check} tone="success" />
        <MetricCard label="Email opens" value={totals.opened.toLocaleString()} detail={`${percent(totals.opened, totals.delivered || totals.sent)} open rate`} icon={Eye} tone="violet" />
        <MetricCard label="Replies" value={totals.replied.toLocaleString()} detail={`${percent(totals.replied, totals.delivered || totals.sent)} reply rate`} icon={Reply} tone="success" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard label="Link clicks" value={totals.clicked.toLocaleString()} detail={`${percent(totals.clicked, totals.delivered || totals.sent)} click rate`} icon={MousePointerClick} />
        <MetricCard label="Bounces" value={totals.bounced.toLocaleString()} detail={`${percent(totals.bounced, totals.sent)} of sent`} icon={AlertTriangle} tone="warning" />
        <MetricCard label="Spam complaints" value={totals.complained.toLocaleString()} detail={`${totals.suppressed.toLocaleString()} suppressed by Resend`} icon={Ban} tone="danger" />
      </div>
      <Card>
          <CardHeader><CardTitle className="text-base">Step-by-step performance</CardTitle><CardDescription>Every step is tracked independently. Text replies are available in the dedicated Marketing Text Inbox.</CardDescription></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[940px] text-left text-sm">
            <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="pb-3 font-medium">Step</th><th className="pb-3 font-medium">Sent</th><th className="pb-3 font-medium">Delivered</th><th className="pb-3 font-medium">Opened</th><th className="pb-3 font-medium">Clicked</th><th className="pb-3 font-medium">Replies</th><th className="pb-3 font-medium">Bounced</th><th className="pb-3 font-medium">Spam</th><th className="pb-3 font-medium">Failed</th></tr></thead>
            <tbody>{steps.map((step) => {
              const base = step.metrics.delivered || step.metrics.sent;
              return <tr key={step.id} className="border-b last:border-0"><td className="max-w-[270px] py-3 pr-4"><div className="flex items-center gap-2"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{step.stepOrder + 1}</span>{channelBadge(step.channel)}</div><p className="mt-1 max-w-[250px] truncate text-xs font-medium">{step.subject || stripHtml(step.body) || "Untitled message"}</p><p className="mt-0.5 text-[11px] text-muted-foreground">{delayLabel(step.delayDays, step.delayHours)}</p></td><td className="py-3">{step.metrics.sent}</td><td className="py-3">{step.metrics.delivered}<span className="ml-1 text-xs text-muted-foreground">{percent(step.metrics.delivered, step.metrics.sent)}</span></td><td className="py-3">{step.metrics.opened}<span className="ml-1 text-xs text-muted-foreground">{percent(step.metrics.opened, base)}</span></td><td className="py-3">{step.metrics.clicked}</td><td className="py-3">{step.metrics.replied}</td><td className="py-3">{step.metrics.bounced}</td><td className="py-3">{step.metrics.complained}</td><td className="py-3">{step.metrics.failed}</td></tr>;
            })}</tbody>
          </table>
          {!steps.length && <p className="py-10 text-center text-sm text-muted-foreground">Add a workflow step to begin collecting performance data.</p>}
        </CardContent>
      </Card>
      <div className="rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950"><p className="font-medium">Resend event feedback</p><p className="mt-1 text-sky-900/80">Delivery, opens, clicks, bounces, complaints, suppressions, and email replies are recorded as Resend sends feedback. Reply attribution requires a Resend receiving domain configured through <code className="rounded bg-white/70 px-1 py-0.5">SMART_PLAN_REPLY_DOMAIN</code>.</p></div>
    </div>
  );
}

function PlanWorkspace({ planId }: { planId: number }) {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const [tab, setTab] = useState<Tab>("workflow");
  const [selectedStepId, setSelectedStepId] = useState<number | "new">("new");
  const { data: planData, isLoading } = trpc.smartPlans.get.useQuery({ id: planId });
  const { data: analyticsData } = trpc.smartPlans.analytics.get.useQuery({ planId });
  const { data: sourceRows = [] } = trpc.leadSources.list.useQuery();
  const toggleStatus = trpc.smartPlans.update.useMutation({ onSuccess: () => { utils.smartPlans.get.invalidate({ id: planId }); utils.smartPlans.list.invalidate(); }, onError: (error) => toast.error(error.message) });
  const publish = trpc.smartPlans.publish.useMutation({ onSuccess: () => { toast.success("Plan published and active"); utils.smartPlans.get.invalidate({ id: planId }); utils.smartPlans.list.invalidate(); }, onError: (error) => toast.error(error.message) });
  const deleteStep = trpc.smartPlans.steps.delete.useMutation({ onSuccess: () => { toast.success("Step deleted"); setSelectedStepId("new"); refresh(); }, onError: (error) => toast.error(error.message) });

  const refresh = () => {
    utils.smartPlans.get.invalidate({ id: planId });
    utils.smartPlans.analytics.get.invalidate({ planId });
    utils.smartPlans.list.invalidate();
  };
  const plan = (planData as any)?.plan;
  const analyticsSteps = ((analyticsData as any)?.steps || []) as Step[];
  const steps = useMemo(() => analyticsSteps.length ? analyticsSteps : (((planData as any)?.steps || []) as Step[]).map((step) => ({ ...step, metrics: EMPTY_METRICS })), [analyticsSteps, planData]);
  const selectedStep = selectedStepId === "new" ? null : steps.find((step) => step.id === selectedStepId) || null;
  const totals = ((analyticsData as any)?.totals || EMPTY_METRICS) as Metrics;
  const leadSources = (sourceRows as any[]).map((row) => ({ id: row.ls?.id ?? row.id, name: row.ls?.name ?? row.name, parentId: row.ls?.parentId ?? row.parentId ?? null })) as LeadSource[];
  const defaultSchedule = {
    enabled: plan?.defaultSendWindowEnabled ?? true,
    days: plan?.defaultSendDays?.length ? plan.defaultSendDays : [0, 1, 2, 3, 4, 5, 6],
    startHour: plan?.defaultSendStartHour ?? 8,
    endHour: plan?.defaultSendEndHour ?? 20,
    timezone: plan?.defaultSendTimezone || "America/New_York",
  };

  useEffect(() => {
    if (selectedStepId !== "new" && !steps.some((step) => step.id === selectedStepId)) setSelectedStepId(steps[0]?.id || "new");
  }, [steps.length]);

  if (isLoading || !plan) return <div className="flex min-h-[45vh] items-center justify-center text-sm text-muted-foreground">Loading Smart Plan workspace...</div>;

  const tabOptions: { id: Tab; label: string; icon: typeof Settings2 }[] = [
    { id: "workflow", label: "Workflow", icon: Zap },
    { id: "analytics", label: "Analytics", icon: BarChart3 },
    { id: "settings", label: "Settings", icon: Settings2 },
  ];

  return (
    <div className="space-y-5 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-5">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="icon" className="shrink-0" onClick={() => navigate("/smart-plans")} title="Back to Smart Plans"><ArrowLeft className="h-4 w-4" /></Button>
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h1 className="truncate text-xl font-bold">{plan.name}</h1>{statusBadge(plan.status)}</div><p className="mt-0.5 text-sm text-muted-foreground">{steps.length} of 100 workflow steps configured</p></div>
        </div>
        <div className="flex items-center gap-2">
          {plan.status === "draft" ? <Button onClick={() => { if (!steps.length) return toast.error("Add at least one step before publishing"); publish.mutate({ id: planId }); }} disabled={publish.isPending}><Play className="mr-1.5 h-4 w-4" />{publish.isPending ? "Publishing..." : "Publish plan"}</Button> : <Button variant="outline" onClick={() => toggleStatus.mutate({ id: planId, data: { status: plan.status === "active" ? "paused" : "active" } })}>{plan.status === "active" ? <><Pause className="mr-1.5 h-4 w-4" />Pause</> : <><Play className="mr-1.5 h-4 w-4" />Resume</>}</Button>}
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-lg border bg-muted/30 p-1">
        {tabOptions.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => setTab(id)} className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${tab === id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}><Icon className="h-4 w-4" />{label}</button>)}
      </div>

      {tab === "workflow" && <div className="grid gap-5 lg:grid-cols-[290px_minmax(0,1fr)]">
        <aside className="rounded-xl border bg-card lg:sticky lg:top-4 lg:max-h-[calc(100vh-9rem)] lg:overflow-hidden">
          <div className="flex items-center justify-between border-b px-4 py-3"><div><p className="text-sm font-semibold">Workflow steps</p><p className="text-xs text-muted-foreground">Ordered automatically by wait time</p></div><Badge variant="secondary">{steps.length}/100</Badge></div>
          <div className="max-h-[360px] overflow-y-auto p-2 lg:max-h-[calc(100vh-16rem)]">
            {steps.map((step) => <button key={step.id} onClick={() => setSelectedStepId(step.id)} className={`mb-1 w-full rounded-lg border p-2.5 text-left transition-colors ${selectedStepId === step.id ? "border-primary bg-primary/5 shadow-sm" : "border-transparent hover:border-border hover:bg-muted/50"}`}><div className="flex items-center gap-2"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold">{step.stepOrder + 1}</span>{channelBadge(step.channel)}<span className="ml-auto text-[10px] text-muted-foreground">{step.metrics.sent} sent</span></div><p className="mt-1.5 truncate text-xs font-medium">{step.subject || stripHtml(step.body) || "Untitled message"}</p><p className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground"><Clock className="h-3 w-3" />{delayLabel(step.delayDays, step.delayHours)}</p></button>)}
            {!steps.length && <div className="px-3 py-8 text-center text-xs text-muted-foreground">No steps yet. Start with an email or text message.</div>}
          </div>
          <div className="grid grid-cols-2 gap-2 border-t p-3"><Button size="sm" variant={selectedStepId === "new" ? "default" : "outline"} onClick={() => { setSelectedStepId("new"); setTab("workflow"); }}><Mail className="mr-1 h-3.5 w-3.5" />Email</Button><Button size="sm" variant="outline" className="border-violet-200 text-violet-700 hover:bg-violet-50 hover:text-violet-800" onClick={() => { setSelectedStepId("new"); setTab("workflow"); }}><MessageSquare className="mr-1 h-3.5 w-3.5" />Text</Button></div>
        </aside>
        <div className="min-w-0 rounded-xl border bg-card p-4 sm:p-6"><StepComposer key={selectedStep?.id ?? "new"} planId={planId} step={selectedStep} defaultSchedule={defaultSchedule} propertyAddressFromNotes={plan.propertyAddressFromNotes === true} onSaved={(id) => { refresh(); if (id) setSelectedStepId(id); }} onDelete={() => selectedStep && deleteStep.mutate({ stepId: selectedStep.id, planId })} /></div>
      </div>}

      {tab === "analytics" && <AnalyticsPanel steps={steps} totals={totals} />}
      {tab === "settings" && <SettingsPanel plan={plan} leadSources={leadSources} onSaved={refresh} />}
    </div>
  );
}

export default function SmartPlanEditorPage({ isNew = false }: { isNew?: boolean }) {
  const [, params] = useRoute("/smart-plans/:id");
  const planId = Number(params?.id);
  if (isNew) return <NewPlanPage />;
  if (!Number.isInteger(planId) || planId <= 0) return <div className="py-12 text-center text-sm text-muted-foreground">Invalid Smart Plan.</div>;
  return <PlanWorkspace planId={planId} />;
}
