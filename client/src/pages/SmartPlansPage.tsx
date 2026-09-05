import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { formatEmail } from "@/lib/format";
import { safeFormat } from "@/lib/safeFormat";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import {
  Zap, Plus, Trash2, ChevronUp, ChevronDown, Mail, MessageSquare,
  Users, Edit2, Play, Pause, ArrowLeft, Check, Save, Eye, Clock,
  AlertCircle, FileText, ChevronLeft, ChevronRight, Search, BrainCircuit, Loader2, ShieldCheck, Lightbulb, History
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import RichEmailEditor from "@/components/RichEmailEditor";
import OneTimeSmartPlanSendDialog from "@/components/OneTimeSmartPlanSendDialog";
import OneTimeSmartPlanSendHistory from "@/components/OneTimeSmartPlanSendHistory";
import LeadSourceTriggerPicker, { formatLeadSourcePath } from "@/components/LeadSourceTriggerPicker";

// ─── Types ────────────────────────────────────────────────────────────────────
type PlanRow = {
  plan: {
    id: number; name: string; description: string | null;
    status: "active" | "paused" | "draft";
    triggerLeadSourceId: number | null;
    createdAt: Date; updatedAt: Date;
  };
  leadSource?: { id: number; name: string } | null;
  stepCount: number;
  activeEnrollments: number;
};

type Step = {
  id: number; planId: number; stepOrder: number;
  channel: "email" | "sms"; delayDays: number; delayHours: number;
  subject: string | null; body: string;
  businessHoursOnly: boolean; timezone: string;
};

type LeadSourceRow = { id: number; name: string; parentId: number | null };

// ─── Wizard step form ─────────────────────────────────────────────────────────
type StepForm = {
  channel: "email" | "sms";
  delayDays: number;
  delayHours: number;
  subject: string;
  body: string;
  businessHoursOnly: boolean;
  timezone: string;
};

const EMPTY_STEP_FORM: StepForm = {
  channel: "email",
  delayDays: 0,
  delayHours: 0,
  subject: "",
  body: "",
  businessHoursOnly: false,
  timezone: "America/New_York",
};

// Common US timezones for the picker
const US_TIMEZONES = [
  { value: "America/New_York", label: "Eastern (ET)" },
  { value: "America/Chicago", label: "Central (CT)" },
  { value: "America/Denver", label: "Mountain (MT)" },
  { value: "America/Phoenix", label: "Mountain - AZ (no DST)" },
  { value: "America/Los_Angeles", label: "Pacific (PT)" },
  { value: "America/Anchorage", label: "Alaska (AKT)" },
  { value: "Pacific/Honolulu", label: "Hawaii (HST)" },
];

// ─── Wizard stages ────────────────────────────────────────────────────────────
type WizardStage = "details" | "steps" | "review";

const WIZARD_STAGES: { id: WizardStage; label: string; icon: React.ReactNode }[] = [
  { id: "details", label: "Plan Details", icon: <FileText className="h-4 w-4" /> },
  { id: "steps", label: "Build Steps", icon: <Zap className="h-4 w-4" /> },
  { id: "review", label: "Review & Publish", icon: <Eye className="h-4 w-4" /> },
];

// ─── Helper ───────────────────────────────────────────────────────────────────
function statusBadge(status: string) {
  if (status === "active") return <Badge className="bg-green-100 text-green-700 border-green-200">Active</Badge>;
  if (status === "paused") return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">Paused</Badge>;
  return <Badge className="bg-slate-100 text-slate-600 border-slate-200">Draft</Badge>;
}

function delayLabel(days: number, hours: number) {
  if (days === 0 && hours === 0) return "Immediately";
  const parts = [];
  if (days > 0) parts.push(`Day ${days}`);
  if (hours > 0) parts.push(`+${hours}h`);
  return parts.join(" ");
}

// ─── Step Preview Modal ─────────────────────────────────────────────────────
const LOGO_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663374872019/RGtcxHR8RPxZsqyxZLCcuq/savvy-logo_c97e2154.png";
const BRAND_CYAN = "#0fc0df";

const EXAMPLE_CONTACT = {
  first_name: "Alex",
  last_name: "Johnson",
  full_name: "Alex Johnson",
  lead_source: "Zillow",
  agent_name: "Tyler Coon",
  agent_phone: "(555) 123-4567",
};

function applyMergeTags(text: string): string {
  return text
    .replace(/\{\{first_name\}\}/g, EXAMPLE_CONTACT.first_name)
    .replace(/\{\{last_name\}\}/g, EXAMPLE_CONTACT.last_name)
    .replace(/\{\{full_name\}\}/g, EXAMPLE_CONTACT.full_name)
    .replace(/\{\{lead_source\}\}/g, EXAMPLE_CONTACT.lead_source)
    .replace(/\{\{agent_name\}\}/g, EXAMPLE_CONTACT.agent_name)
    .replace(/\{\{agent_phone\}\}/g, EXAMPLE_CONTACT.agent_phone);
}

function buildEmailPreviewHtml(subject: string, body: string): string {
  const resolvedBody = applyMergeTags(body);
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:24px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);">
        <!-- Header -->
        <tr><td style="background:#ffffff;padding:24px 32px 16px;border-bottom:3px solid ${BRAND_CYAN};">
          <img src="${LOGO_URL}" alt="Savvy Agents" height="36" style="display:block;">
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:28px 32px 24px;color:#1a1a1a;font-size:15px;line-height:1.6;">
          ${resolvedBody}
        </td></tr>
        <!-- Footer -->
        <tr><td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">© ${new Date().getFullYear()} Savvy Agents &bull; <a href="#" style="color:#9ca3af;">Unsubscribe</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function StepPreviewModal({ step, onClose }: { step: Step; onClose: () => void }) {
  const subject = applyMergeTags(step.subject ?? "");
  const isEmail = step.channel === "email";
  const emailHtml = isEmail ? buildEmailPreviewHtml(subject, step.body) : "";
  const smsText = !isEmail ? applyMergeTags(step.body) : "";

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col gap-3">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isEmail ? <Mail className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}
            Step Preview &mdash; {isEmail ? "Email" : "SMS"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 rounded-md px-3 py-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          Merge tags are filled with example values. Actual sends use the contact&apos;s real data.
        </div>

        {isEmail ? (
          <div className="flex-1 overflow-hidden flex flex-col gap-2 min-h-0">
            <div className="border rounded-md px-3 py-2 bg-muted/30">
              <span className="text-xs text-muted-foreground mr-2">Subject:</span>
              <span className="text-sm font-medium">{subject || "(no subject)"}</span>
            </div>
            <div className="flex-1 border rounded-md overflow-hidden min-h-0">
              <iframe
                srcDoc={emailHtml}
                title="Email Preview"
                className="w-full h-full min-h-[400px]"
                sandbox="allow-same-origin"
              />
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center py-8 gap-4">
            <div className="w-full max-w-xs">
              <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed shadow-sm">
                {smsText || "(empty message)"}
              </div>
              <p className="text-xs text-muted-foreground mt-2 text-center">{smsText.length}/160 characters</p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Step Editor ──────────────────────────────────────────────────────────────
function StepEditor({
  planId,
  onSaved,
  onCancel,
  editingStep,
}: {
  planId: number;
  onSaved: () => void;
  onCancel: () => void;
  editingStep?: Step | null;
}) {
  const [form, setForm] = useState<StepForm>(
    editingStep
      ? {
          channel: editingStep.channel,
          delayDays: editingStep.delayDays,
          delayHours: editingStep.delayHours,
          subject: editingStep.subject ?? "",
          body: editingStep.body,
          businessHoursOnly: editingStep.businessHoursOnly ?? false,
          timezone: editingStep.timezone ?? "America/New_York",
        }
      : EMPTY_STEP_FORM
  );
  const [saving, setSaving] = useState(false);

  const addMutation = trpc.smartPlans.steps.add.useMutation({
    onSuccess: () => { toast.success("Step saved"); onSaved(); },
    onError: (e) => { toast.error(e.message); setSaving(false); },
  });

  const updateMutation = trpc.smartPlans.steps.updateOne.useMutation({
    onSuccess: () => { toast.success("Step updated"); onSaved(); },
    onError: (e) => { toast.error(e.message); setSaving(false); },
  });

  const handleSave = () => {
    if (!form.body.trim()) { toast.error("Message body is required"); return; }
    if (form.channel === "email" && !form.subject.trim()) { toast.error("Email subject is required"); return; }
    setSaving(true);
    if (editingStep) {
      updateMutation.mutate({
        stepId: editingStep.id,
        channel: form.channel,
        delayDays: form.delayDays,
        delayHours: form.delayHours,
        subject: form.channel === "email" ? form.subject : null,
        body: form.body,
        businessHoursOnly: form.businessHoursOnly,
        timezone: form.timezone,
      });
    } else {
      addMutation.mutate({
        planId,
        channel: form.channel,
        delayDays: form.delayDays,
        delayHours: form.delayHours,
        subject: form.channel === "email" ? form.subject : null,
        body: form.body,
        businessHoursOnly: form.businessHoursOnly,
        timezone: form.timezone,
      });
    }
  };

  return (
    <Card className="border-primary/30 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          {editingStep ? <Edit2 className="h-4 w-4 text-primary" /> : <Plus className="h-4 w-4 text-primary" />}
          {editingStep ? "Edit Step" : "Add New Step"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Channel + Delay */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs mb-1 block">Channel</Label>
            <Select value={form.channel} onValueChange={(v) => setForm({ ...form, channel: v as "email" | "sms", subject: "" })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="email"><span className="flex items-center gap-2"><Mail className="h-3.5 w-3.5" />Email</span></SelectItem>
                <SelectItem value="sms"><span className="flex items-center gap-2"><MessageSquare className="h-3.5 w-3.5" />SMS</span></SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs mb-1 block">Send after (days)</Label>
            <Input
              type="number" min={0}
              value={form.delayDays}
              onChange={(e) => setForm({ ...form, delayDays: Math.max(0, parseInt(e.target.value) || 0) })}
            />
          </div>
          <div>
            <Label className="text-xs mb-1 block">Additional hours</Label>
            <Input
              type="number" min={0} max={23}
              value={form.delayHours}
              onChange={(e) => setForm({ ...form, delayHours: Math.min(23, Math.max(0, parseInt(e.target.value) || 0)) })}
            />
          </div>
        </div>

        {/* Subject (email only) */}
        {form.channel === "email" && (
          <div>
            <Label className="text-xs mb-1 block">Subject Line</Label>
            <Input
              placeholder="e.g. Hi {{first_name}}, thanks for reaching out!"
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
            />
          </div>
        )}

        {/* Body */}
        <div>
          <Label className="text-xs mb-1 block">
            {form.channel === "email" ? "Email Body" : "SMS Message"}
          </Label>
          {form.channel === "email" ? (
            <RichEmailEditor
              value={form.body}
              onChange={(html) => setForm({ ...form, body: html })}
              placeholder="Compose your email..."
            />
          ) : (
            <div>
                <Textarea
                placeholder="Hi {{first_name}}, we received your inquiry from {{lead_source}}..."
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                rows={4}
                maxLength={160}
              />
              <div className="flex justify-between mt-1">
                <div className="flex flex-wrap gap-1.5">
                  <span className="text-xs text-muted-foreground mr-1">Merge tags:</span>
                  {["{{first_name}}", "{{last_name}}", "{{full_name}}", "{{lead_source}}"].map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded hover:bg-primary/20 transition-colors font-mono"
                      onClick={() => setForm({ ...form, body: form.body + tag })}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
                <span className="text-xs text-muted-foreground">{form.body.length}/160</span>
              </div>
            </div>
          )}
        </div>

        {/* Business Hours Toggle */}
        <div className="border rounded-lg p-3 bg-slate-50 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Business Hours Only</p>
              <p className="text-xs text-muted-foreground">Only send Mon–Fri, 9am–6pm. Messages outside this window are deferred to the next valid time.</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={form.businessHoursOnly}
              onClick={() => setForm({ ...form, businessHoursOnly: !form.businessHoursOnly })}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 ${
                form.businessHoursOnly ? "bg-primary" : "bg-slate-200"
              }`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                form.businessHoursOnly ? "translate-x-6" : "translate-x-1"
              }`} />
            </button>
          </div>
          {form.businessHoursOnly && (
            <div>
              <Label className="text-xs mb-1 block">Timezone</Label>
              <Select value={form.timezone} onValueChange={(v) => setForm({ ...form, timezone: v })}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {US_TIMEZONES.map((tz) => (
                    <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            <Save className="h-3.5 w-3.5 mr-1.5" />
            {saving ? "Saving..." : "Save Step"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Plan Wizard ──────────────────────────────────────────────────────────────
function PlanWizard({
  onClose,
  editPlanId,
}: {
  onClose: () => void;
  editPlanId?: number;
}) {
  const utils = trpc.useUtils();
  const [stage, setStage] = useState<WizardStage>(editPlanId ? "steps" : "details");
  const [planId, setPlanId] = useState<number | null>(editPlanId ?? null);
  const [detailsForm, setDetailsForm] = useState({
    name: "",
    description: "",
    triggerLeadSourceIds: [] as number[],
    triggerScope: "new_only" as "new_only" | "existing_and_new" | "manual",
  });
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const [bulkEnrolling, setBulkEnrolling] = useState(false);
  const [showStepEditor, setShowStepEditor] = useState(false);
  const [editingStep, setEditingStep] = useState<Step | null>(null);
  const [previewStep, setPreviewStep] = useState<Step | null>(null);
  const [savingDetails, setSavingDetails] = useState(false);

  const { data: allLeadSources = [] } = trpc.leadSources.list.useQuery();
  const { data: planData, refetch: refetchPlan } = trpc.smartPlans.get.useQuery(
    { id: planId! },
    { enabled: !!planId }
  );

  const createDraftMutation = trpc.smartPlans.createDraft.useMutation({
    onSuccess: (data) => {
      setPlanId(data.id);
      setStage("steps");
      setSavingDetails(false);
      toast.success("Draft saved — now add your steps");
    },
    onError: (e) => { toast.error(e.message); setSavingDetails(false); },
  });

  const updateMutation = trpc.smartPlans.update.useMutation({
    onSuccess: () => {
      setStage("steps");
      setSavingDetails(false);
      toast.success("Plan details updated");
    },
    onError: (e) => { toast.error(e.message); setSavingDetails(false); },
  });

  const publishMutation = trpc.smartPlans.publish.useMutation({
    onSuccess: () => {
      toast.success("Plan published and is now active!");
      utils.smartPlans.list.invalidate();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteStepMutation = trpc.smartPlans.steps.delete.useMutation({
    onSuccess: () => { refetchPlan(); toast.success("Step removed"); },
    onError: (e) => toast.error(e.message),
  });

  const reorderMutation = trpc.smartPlans.steps.reorder.useMutation({
    onSuccess: () => refetchPlan(),
    onError: (e) => toast.error(e.message),
  });

  const leadSourcesList = (allLeadSources as any[]).map((row) => ({
    id: row.ls?.id ?? row.id,
    name: row.ls?.name ?? row.name,
    parentId: row.ls?.parentId ?? row.parentId ?? null,
  })) as LeadSourceRow[];

  const steps = ((planData as any)?.steps ?? []) as Step[];
  const plan = (planData as any)?.plan;

  // Load existing plan details into form when editing
  if (editPlanId && plan && !detailsForm.name && plan.name) {
    const ids = (plan.triggerLeadSourceIds as number[] | null) ?? (plan.triggerLeadSourceId ? [plan.triggerLeadSourceId] : []);
    setDetailsForm({
      name: plan.name,
      description: plan.description ?? "",
      triggerLeadSourceIds: ids,
      triggerScope: (plan.triggerScope as "new_only" | "existing_and_new" | "manual") ?? "new_only",
    });
  }

  const handleSaveDetails = () => {
    if (!detailsForm.name.trim()) { toast.error("Plan name is required"); return; }
    setSavingDetails(true);
    if (planId) {
      updateMutation.mutate({
        id: planId,
        data: {
          name: detailsForm.name,
          description: detailsForm.description || null,
          triggerLeadSourceIds: detailsForm.triggerLeadSourceIds.length > 0 ? detailsForm.triggerLeadSourceIds : null,
          triggerScope: detailsForm.triggerScope,
        },
      });
    } else {
      createDraftMutation.mutate({
        name: detailsForm.name,
        description: detailsForm.description || null,
        triggerLeadSourceIds: detailsForm.triggerLeadSourceIds.length > 0 ? detailsForm.triggerLeadSourceIds : null,
        triggerScope: detailsForm.triggerScope,
      });
    }
  };

  const currentStageIdx = WIZARD_STAGES.findIndex((s) => s.id === stage);

  return (
    <div className="flex flex-col h-full">
      {/* Wizard progress bar */}
      <div className="flex items-center gap-0 mb-6">
        {WIZARD_STAGES.map((s, i) => (
          <div key={s.id} className="flex items-center flex-1">
            <button
              className={`flex items-center gap-2 text-sm font-medium transition-colors ${
                s.id === stage
                  ? "text-primary"
                  : i < currentStageIdx
                  ? "text-green-600 cursor-pointer hover:text-green-700"
                  : "text-muted-foreground cursor-not-allowed"
              }`}
              onClick={() => {
                if (i < currentStageIdx) setStage(s.id);
              }}
              disabled={i > currentStageIdx}
            >
              <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs border-2 shrink-0 ${
                i < currentStageIdx
                  ? "bg-green-500 border-green-500 text-white"
                  : s.id === stage
                  ? "border-primary text-primary"
                  : "border-muted-foreground/30 text-muted-foreground"
              }`}>
                {i < currentStageIdx ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className="hidden sm:block">{s.label}</span>
            </button>
            {i < WIZARD_STAGES.length - 1 && (
              <div className={`flex-1 h-0.5 mx-2 ${i < currentStageIdx ? "bg-green-400" : "bg-border"}`} />
            )}
          </div>
        ))}
      </div>

      {/* ── Stage 1: Plan Details ── */}
      {stage === "details" && (
        <div className="space-y-4">
          <div>
            <Label>Plan Name <span className="text-destructive">*</span></Label>
            <Input
              className="mt-1"
              placeholder="e.g. Zillow New Lead — 7-Day Follow-Up"
              value={detailsForm.name}
              onChange={(e) => setDetailsForm({ ...detailsForm, name: e.target.value })}
            />
          </div>
          <div>
            <Label>Description <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Textarea
              className="mt-1"
              placeholder="What is this plan for? Who does it target?"
              value={detailsForm.description}
              onChange={(e) => setDetailsForm({ ...detailsForm, description: e.target.value })}
              rows={2}
            />
          </div>


          {/* Trigger Lead Sources */}
          <div>
            <Label>Trigger Lead Sources <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <p className="text-xs text-muted-foreground mt-0.5 mb-2">Contacts added with any of these lead sources will be automatically enrolled in this plan. Choose a source first, then a nested sub-source when applicable.</p>
            <LeadSourceTriggerPicker
              sources={leadSourcesList}
              selectedIds={detailsForm.triggerLeadSourceIds}
              onAdd={(id) => setDetailsForm((current) => current.triggerLeadSourceIds.includes(id) ? current : ({ ...current, triggerLeadSourceIds: [...current.triggerLeadSourceIds, id] }))}
            />
            {detailsForm.triggerLeadSourceIds.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {detailsForm.triggerLeadSourceIds.map((id) => {
                  const src = leadSourcesList.find((ls) => ls.id === id);
                  return (
                    <span key={id} className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-1 rounded-full">
                      <Zap className="h-3 w-3" />
                      {src ? formatLeadSourcePath(src, leadSourcesList) : `Source #${id}`}
                      <button
                        type="button"
                        className="ml-0.5 hover:text-destructive transition-colors"
                        onClick={() => setDetailsForm({ ...detailsForm, triggerLeadSourceIds: detailsForm.triggerLeadSourceIds.filter((x) => x !== id) })}
                      >
                        &times;
                      </button>
                    </span>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic mt-2">No trigger sources — plan must be enrolled manually.</p>
            )}
          </div>

          {/* Enrollment Scope (only shown when trigger sources are selected) */}
          {detailsForm.triggerLeadSourceIds.length > 0 && (
            <div>
              <Label>Enrollment Scope</Label>
              <Select
                value={detailsForm.triggerScope}
                onValueChange={(v) => setDetailsForm({ ...detailsForm, triggerScope: v as "new_only" | "existing_and_new" | "manual" })}
              >
                <SelectTrigger className="mt-1 h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new_only">New contacts only</SelectItem>
                  <SelectItem value="existing_and_new">New contacts + existing contacts with this source</SelectItem>
                  <SelectItem value="manual">Manual enrollment only (ignore trigger)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex justify-between pt-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <div className="flex gap-2">
              {planId && (
                <Button variant="outline" onClick={() => setStage("steps")}>
                  Skip to Steps
                </Button>
              )}
              <Button onClick={handleSaveDetails} disabled={savingDetails}>
                <Save className="h-3.5 w-3.5 mr-1.5" />
                {savingDetails ? "Saving..." : planId ? "Update & Continue" : "Save Draft & Continue"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Stage 2: Build Steps ── */}
      {stage === "steps" && planId && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-sm">{plan?.name}</h3>
              <p className="text-xs text-muted-foreground">
                {steps.length === 0
                  ? "No steps yet — add your first message below."
                  : `${steps.length} step${steps.length !== 1 ? "s" : ""} in this plan`}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setStage("details")}>
              <Edit2 className="h-3.5 w-3.5 mr-1.5" /> Edit Details
            </Button>
          </div>

          {/* Existing steps */}
          {steps.length > 0 && (
            <div className="space-y-2">
              {steps.map((step, idx) => (
                <Card key={step.id} className={`${editingStep?.id === step.id ? "ring-2 ring-primary" : ""}`}>
                  <CardContent className="p-3">
                    <div className="flex items-start gap-3">
                      {/* Step number */}
                      <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                        {idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {step.channel === "email"
                            ? <Badge variant="outline" className="text-xs gap-1"><Mail className="h-3 w-3" />Email</Badge>
                            : <Badge variant="outline" className="text-xs gap-1"><MessageSquare className="h-3 w-3" />SMS</Badge>
                          }
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />{delayLabel(step.delayDays, step.delayHours)}
                          </span>
                          {step.subject && (
                            <span className="text-xs font-medium truncate max-w-[200px]">{step.subject}</span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 truncate">
                          {step.body.replace(/<[^>]+>/g, "").substring(0, 80)}...
                        </p>
                      </div>
                      {/* Actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7"
                          disabled={idx === 0}
                          onClick={() => reorderMutation.mutate({ planId: planId!, stepId: step.id, direction: "up" })}
                        >
                          <ChevronUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7"
                          disabled={idx === steps.length - 1}
                          onClick={() => reorderMutation.mutate({ planId: planId!, stepId: step.id, direction: "down" })}
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground"
                          title="Preview"
                          onClick={() => setPreviewStep(step)}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7 text-primary"
                          onClick={() => { setEditingStep(step); setShowStepEditor(true); }}
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                          onClick={() => deleteStepMutation.mutate({ stepId: step.id, planId: planId! })}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Step preview modal */}
          {previewStep && <StepPreviewModal step={previewStep} onClose={() => setPreviewStep(null)} />}

          {/* Step editor inline */}
          {showStepEditor ? (
            <StepEditor
              planId={planId}
              editingStep={editingStep}
              onSaved={() => {
                setShowStepEditor(false);
                setEditingStep(null);
                refetchPlan();
              }}
              onCancel={() => {
                setShowStepEditor(false);
                setEditingStep(null);
              }}
            />
          ) : (
            <Button
              variant="outline"
              className="w-full border-dashed gap-2"
              onClick={() => { setEditingStep(null); setShowStepEditor(true); }}
            >
              <Plus className="h-4 w-4" /> Add Step
            </Button>
          )}

          {/* Navigation */}
          <div className="flex justify-between pt-2">
            <Button variant="outline" onClick={() => setStage("details")}>
              <ArrowLeft className="h-3.5 w-3.5 mr-1.5" /> Back
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>
                Save as Draft
              </Button>
              <Button
                onClick={() => setStage("review")}
                disabled={steps.length === 0}
              >
                Review Plan →
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Stage 3: Review & Publish ── */}
      {stage === "review" && planId && (
        <div className="space-y-4">
          <div className="rounded-lg border p-4 space-y-3 bg-muted/20">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold">{plan?.name}</h3>
                {plan?.description && <p className="text-sm text-muted-foreground mt-0.5">{plan.description}</p>}
              </div>
              {statusBadge(plan?.status ?? "draft")}
            </div>
{(() => {
                const ids = (plan as any)?.triggerLeadSourceIds as number[] | null;
                const hasIds = ids && ids.length > 0;
                const singleId = plan?.triggerLeadSourceId;
                if (!hasIds && !singleId) return null;
                const sourceNames = hasIds
                  ? ids!.map((id) => leadSourcesList.find((ls) => ls.id === id)?.name ?? `#${id}`)
                  : [leadSourcesList.find((ls) => ls.id === singleId)?.name ?? "Lead Source"];
                return (
                  <div className="flex items-start gap-2 text-sm">
                    <Zap className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                    <span>Auto-triggers on: {sourceNames.map((n, i) => (
                      <strong key={i}>{i > 0 ? ", " : ""}{n}</strong>
                    ))}</span>
                  </div>
                );
              })()}
            <Separator />
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{steps.length} Steps</p>
              {steps.map((step, idx) => (
                <div key={step.id} className="flex items-center gap-3 text-sm">
                  <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">{idx + 1}</span>
                  {step.channel === "email"
                    ? <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    : <MessageSquare className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  }
                  <span className="flex-1 truncate">{step.subject ?? step.body.replace(/<[^>]+>/g, "").substring(0, 50)}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{delayLabel(step.delayDays, step.delayHours)}</span>
                </div>
              ))}
            </div>
          </div>

          {steps.length === 0 && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-md p-3">
              <AlertCircle className="h-4 w-4 shrink-0" />
              You need at least one step before publishing.
            </div>
          )}

          <div className="flex justify-between pt-2">
            <Button variant="outline" onClick={() => setStage("steps")}>
              <ArrowLeft className="h-3.5 w-3.5 mr-1.5" /> Back to Steps
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>Save as Draft</Button>
              <Button
                onClick={() => publishMutation.mutate({ id: planId })}
                disabled={steps.length === 0 || publishMutation.isPending}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                <Play className="h-3.5 w-3.5 mr-1.5" />
                {publishMutation.isPending ? "Publishing..." : "Publish Plan"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const PAGE_SIZE = 25;

function EnrollmentStepJourney({ row }: { row: any }) {
  const enrollment = row.enrollment;
  const steps = row.steps ?? [];
  const executions = row.executions ?? [];
  const counts = executions.reduce((total: Record<string, number>, execution: any) => {
    total[execution.status] = (total[execution.status] ?? 0) + 1;
    return total;
  }, {});
  const statusClass = (status: string) => status === "sent" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : status === "failed" ? "border-red-200 bg-red-50 text-red-800" : status === "skipped" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-slate-200 bg-slate-50 text-slate-700";

  return <div className="rounded-md border bg-muted/20 p-3 space-y-2">
    <div className="flex flex-wrap items-center gap-2 text-xs"><span className="font-medium">Delivery journey</span><span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-800">{counts.sent ?? 0} sent</span><span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">{counts.skipped ?? 0} skipped</span><span className="rounded bg-red-100 px-1.5 py-0.5 text-red-800">{counts.failed ?? 0} failed</span>{enrollment.pauseReason && <span className="font-medium text-amber-700">Paused: {enrollment.pauseReason}</span>}</div>
    <div className="space-y-1.5">{steps.map((step: any, index: number) => {
      const execution = executions.find((candidate: any) => candidate.stepId === step.id);
      const status = execution?.status ?? (index === enrollment.currentStepIndex && enrollment.status === "active" ? "up_next" : "scheduled");
      const label = status === "sent" ? "Sent" : status === "failed" ? "Failed" : status === "skipped" ? "Skipped" : status === "up_next" ? "Up next" : "Scheduled";
      const preview = step.subject ?? (step.body?.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().slice(0, 110) || "(No message content)");
      return <div key={step.id} className={`rounded border px-2.5 py-2 text-xs ${statusClass(status)}`}><div className="flex items-start gap-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border bg-background font-semibold">{index + 1}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-1.5"><span className="font-semibold uppercase">{step.channel}</span><Badge variant="outline" className="h-5 bg-background text-[10px]">{label}</Badge><span className="opacity-75">{delayLabel(step.delayDays, step.delayHours)}</span></div><p className="mt-0.5 text-foreground">{preview}</p>{execution ? <><p className="mt-0.5 opacity-80">Attempted {safeFormat(execution.sentAt, "MMM d, yyyy h:mm a")}</p>{execution.errorMessage && <p className="mt-0.5 font-medium">Reason: {execution.errorMessage}</p>}</> : status === "up_next" && enrollment.nextStepAt ? <p className="mt-0.5 font-medium">Scheduled for {safeFormat(enrollment.nextStepAt, "MMM d, yyyy h:mm a")}</p> : null}</div></div></div>;
    })}</div>
  </div>;
}

// ─── Enrollments Dialog ───────────────────────────────────────────────────────
function EnrollmentsDialog({ plan, onClose }: { plan: PlanRow; onClose: () => void }) {
  const { data: enrollments = [] } = trpc.smartPlans.enrollments.list.useQuery({ planId: plan.plan.id });
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "paused" | "completed" | "cancelled">("all");
  const [expandedEnrollmentId, setExpandedEnrollmentId] = useState<number | null>(null);

  const cancelMutation = trpc.smartPlans.enrollments.cancel.useMutation({
    onSuccess: () => { utils.smartPlans.enrollments.list.invalidate(); toast.success("Enrollment cancelled"); },
    onError: (e) => toast.error(e.message),
  });
  const resumeMutation = trpc.smartPlans.enrollments.resume.useMutation({
    onSuccess: () => { utils.smartPlans.enrollments.list.invalidate(); toast.success("Enrollment resumed"); },
    onError: (e) => toast.error(e.message),
  });

  const allRows = enrollments as any[];
  const filtered = allRows.filter((row: any) => {
    const name = `${row.contact.firstName} ${row.contact.lastName}`.toLowerCase();
    const email = (row.contact.email ?? "").toLowerCase();
    const q = search.toLowerCase();
    const matchesSearch = !q || name.includes(q) || email.includes(q);
    const matchesStatus = statusFilter === "all" || row.enrollment.status === statusFilter;
    return matchesSearch && matchesStatus;
  });
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const deliverySummary = allRows.reduce((summary: { sent: number; skipped: number; failed: number }, row: any) => {
    for (const execution of row.executions ?? []) {
      if (execution.status === "sent") summary.sent += 1;
      if (execution.status === "skipped") summary.skipped += 1;
      if (execution.status === "failed") summary.failed += 1;
    }
    return summary;
  }, { sent: 0, skipped: 0, failed: 0 });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[85vh] flex flex-col gap-3">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-4 w-4" /> Contacts &mdash; {plan.plan.name}
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded border border-emerald-200 bg-emerald-50 p-2 text-emerald-800"><strong>{deliverySummary.sent} sent</strong><br />successful steps</div><div className="rounded border border-amber-200 bg-amber-50 p-2 text-amber-800"><strong>{deliverySummary.skipped} skipped</strong><br />with a reason</div><div className="rounded border border-red-200 bg-red-50 p-2 text-red-800"><strong>{deliverySummary.failed} failed</strong><br />needs attention</div></div>

        {/* Filters */}
        <div className="flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[160px]">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              className="pl-8 h-8 text-sm"
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as any); setPage(0); }}>
            <SelectTrigger className="h-8 text-sm w-[130px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <p className="text-xs text-muted-foreground">
          {filtered.length.toLocaleString()} contact{filtered.length !== 1 ? "s" : ""}
          {(search || statusFilter !== "all") ? " (filtered)" : " enrolled"}
        </p>

        {/* List */}
        <div className="flex-1 overflow-y-auto space-y-1.5 min-h-0">
          {paged.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {search || statusFilter !== "all" ? "No contacts match your filters." : "No contacts enrolled yet."}
            </p>
          ) : paged.map((row: any) => {
            const nextSendDate = row.enrollment.nextStepAt ? new Date(row.enrollment.nextStepAt) : null;
            const isOverdue = nextSendDate && nextSendDate < new Date() && row.enrollment.status === "active";
            const stepLabel = row.currentStep
              ? `Step ${row.enrollment.currentStepIndex + 1}/${row.totalSteps} · ${row.currentStep.channel === "email" ? "✉" : "💬"} ${row.currentStep.subject ?? row.currentStep.body?.slice(0, 40) ?? "(no subject)"}`
              : row.enrollment.status === "completed" ? `Completed all ${row.totalSteps} steps` : `Step ${row.enrollment.currentStepIndex + 1}`;
            return (
              <div key={row.enrollment.id} className="space-y-1.5">
              <div className="flex items-start justify-between text-sm border rounded-md p-2.5 gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{row.contact.firstName} {row.contact.lastName}</p>
                  <p className="text-xs text-muted-foreground truncate">{formatEmail(row.contact.email)}</p>
                  <p className="text-xs mt-0.5 truncate" title={stepLabel}>{stepLabel}</p>
                  {nextSendDate && row.enrollment.status === "active" && (
                    <p className={`text-xs mt-0.5 ${isOverdue ? "text-amber-600" : "text-muted-foreground"}`}>
                      {isOverdue ? "⚠ Overdue · " : "Next: "}
                      {nextSendDate.toLocaleString()}
                    </p>
                  )}
                  <span className={`text-xs capitalize font-medium ${
                    row.enrollment.status === "active" ? "text-green-600" :
                    row.enrollment.status === "completed" ? "text-blue-600" : "text-muted-foreground"
                  }`}>{row.enrollment.status}</span>
                </div>
                <Button variant="outline" size="sm" className="h-7 text-xs shrink-0" onClick={() => setExpandedEnrollmentId(expandedEnrollmentId === row.enrollment.id ? null : row.enrollment.id)}>
                  <Eye className="h-3 w-3 mr-1" /> Journey
                </Button>
                {row.enrollment.status === "paused" && (
                  <Button
                    variant="outline" size="sm"
                    className="h-7 text-xs shrink-0"
                    onClick={() => resumeMutation.mutate({ enrollmentId: row.enrollment.id })}
                    disabled={resumeMutation.isPending}
                  >
                    <Play className="h-3 w-3 mr-1" /> Resume
                  </Button>
                )}
                {row.enrollment.status === "active" && (
                  <Button
                    variant="ghost" size="sm"
                    className="text-destructive hover:text-destructive h-7 text-xs shrink-0"
                    onClick={() => cancelMutation.mutate({ enrollmentId: row.enrollment.id })}
                    disabled={cancelMutation.isPending}
                  >
                    Unenroll
                  </Button>
                )}
              </div>
              {expandedEnrollmentId === row.enrollment.id && <EnrollmentStepJourney row={row} />}
              </div>
            );
          })}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-2 border-t">
            <p className="text-xs text-muted-foreground">Page {page + 1} of {totalPages}</p>
            <div className="flex gap-1">
              <Button variant="outline" size="icon" className="h-7 w-7" disabled={page === 0} onClick={() => setPage(page - 1)}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button variant="outline" size="icon" className="h-7 w-7" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SmartPlanHistoryDialog({ plan, onClose }: { plan: PlanRow | null; onClose: () => void }) {
  const planId = plan?.plan.id;
  const { data: rows = [], isLoading, error } = trpc.smartPlans.history.list.useQuery(
    { planId, limit: 100 },
    { enabled: plan !== undefined }
  );
  const historyRows = rows as any[];
  const title = plan ? `History — ${plan.plan.name}` : "Full Smart Plans History";

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-7xl w-[calc(100vw-1rem)] max-h-[92vh] flex flex-col gap-3 overflow-hidden p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl"><History className="h-5 w-5 text-primary" /> {title}</DialogTitle>
          <p className="text-sm text-muted-foreground">The 100 most recent automated Smart Plan attempts, including the message step, contact, delivery outcome, and recorded reply status.</p>
        </DialogHeader>
        {isLoading ? <div className="flex min-h-52 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading Smart Plan history...</div> : error ? <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error.message}</div> : historyRows.length === 0 ? <div className="rounded-lg border border-dashed py-14 text-center text-sm text-muted-foreground">No Smart Plan message attempts are recorded yet.</div> : <div className="min-h-0 flex-1 overflow-auto rounded-lg border"><table className="w-full min-w-[1060px] text-left text-sm"><thead className="sticky top-0 bg-muted text-xs text-muted-foreground"><tr><th className="p-3 font-medium">Sent / attempted</th>{!plan && <th className="p-3 font-medium">Smart Plan</th>}<th className="p-3 font-medium">Step</th><th className="p-3 font-medium">Contact</th><th className="p-3 font-medium">Channel</th><th className="p-3 font-medium">Outcome</th><th className="p-3 font-medium">Reply</th><th className="p-3 font-medium">Details</th></tr></thead><tbody className="divide-y">{historyRows.map(row => {
          const contactName = [row.contact.firstName, row.contact.lastName].filter(Boolean).join(" ") || "Unnamed contact";
          const messageName = row.step.subject || row.step.body?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || "Untitled message";
          const replied = Boolean(row.execution.repliedAt);
          return <tr key={row.execution.id} className="align-top"><td className="whitespace-nowrap p-3 text-muted-foreground">{safeFormat(row.execution.sentAt, "MMM d, yyyy h:mm a")}</td>{!plan && <td className="max-w-48 p-3 font-medium">{row.plan.name}</td>}<td className="max-w-64 p-3"><div className="flex items-center gap-2"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{row.step.stepOrder + 1}</span><div className="min-w-0"><p className="truncate font-medium" title={messageName}>{messageName}</p><p className="mt-0.5 text-xs text-muted-foreground">{delayLabel(row.step.delayDays, row.step.delayHours)}</p></div></div></td><td className="p-3"><p className="font-medium">{contactName}</p><p className="mt-0.5 max-w-48 truncate text-xs text-muted-foreground">{formatEmail(row.contact.email) || row.contact.phone || "No contact address"}</p></td><td className="p-3 capitalize">{row.execution.channel}</td><td className="p-3"><Badge variant="outline" className={row.execution.status === "sent" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : row.execution.status === "failed" ? "border-red-200 bg-red-50 text-red-700" : row.execution.status === "skipped" ? "border-amber-200 bg-amber-50 text-amber-700" : ""}>{row.execution.status}</Badge></td><td className="p-3">{replied ? <div className="text-fuchsia-700"><p className="font-medium">Replied</p><p className="mt-0.5 whitespace-nowrap text-xs">{safeFormat(row.execution.repliedAt, "MMM d, h:mm a")}</p></div> : <span className="text-muted-foreground">No reply recorded</span>}</td><td className="max-w-60 p-3 text-xs text-muted-foreground break-words">{row.execution.errorMessage || row.execution.provider || "—"}</td></tr>;
        })}</tbody></table></div>}
        <DialogFooter><Button variant="outline" onClick={onClose}>Close history</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SmartPlansAnalysisDialog({ result, onClose }: { result: any; onClose: () => void }) {
  const analysis = result?.analysis ?? {};
  const evidence = result?.evidence ?? {};
  const priorityClass: Record<string, string> = {
    high: "border-rose-200 bg-rose-50 text-rose-900",
    medium: "border-amber-200 bg-amber-50 text-amber-900",
    low: "border-sky-200 bg-sky-50 text-sky-900",
  };
  return <Dialog open onOpenChange={onClose}>
    <DialogContent className="max-w-6xl max-h-[92vh] overflow-y-auto gap-5">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-xl"><BrainCircuit className="h-5 w-5 text-primary" />Smart Plans AI Analysis</DialogTitle>
        <p className="text-sm text-muted-foreground">A source-grounded review of message performance, timing, replies, deliverability, and compliance signals across Smart Plans and one-time sends.</p>
      </DialogHeader>
      <div className="grid gap-3 sm:grid-cols-3"><Card><CardContent className="p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Email sends analyzed</p><p className="mt-1 text-2xl font-bold">{Number(evidence.totalEmailSends ?? 0).toLocaleString()}</p></CardContent></Card><Card><CardContent className="p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Messages compared</p><p className="mt-1 text-2xl font-bold">{Array.isArray(evidence.messages) ? evidence.messages.length : 0}</p></CardContent></Card><Card><CardContent className="p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Generated</p><p className="mt-1 text-sm font-semibold">{result?.generatedAt ? new Date(result.generatedAt).toLocaleString() : "Just now"}</p></CardContent></Card></div>
      <Card className="border-primary/20 bg-primary/[0.03]"><CardHeader className="pb-2"><CardTitle className="text-base">Executive summary</CardTitle></CardHeader><CardContent><p className="text-sm leading-6 text-muted-foreground">{analysis.executiveSummary}</p></CardContent></Card>
      <div className="grid gap-5 lg:grid-cols-2"><Card><CardHeader className="pb-2"><CardTitle className="text-base">Strongest messages</CardTitle><CardDescription>Messages are highlighted only where the available send volume supports the observation.</CardDescription></CardHeader><CardContent className="space-y-3">{analysis.strongestMessages?.length ? analysis.strongestMessages.map((item: any, index: number) => <div key={index} className="rounded-md border p-3"><p className="text-sm font-semibold">{item.message}</p><p className="mt-1 text-xs leading-5 text-muted-foreground"><strong>Evidence:</strong> {item.evidence}</p><p className="mt-2 text-sm leading-5"><strong>Use it:</strong> {item.recommendation}</p></div>) : <p className="text-sm text-muted-foreground">No message-level winner has enough evidence yet.</p>}</CardContent></Card><Card><CardHeader className="pb-2"><CardTitle className="text-base">Timing insights</CardTitle><CardDescription>Timing is evaluated in each Smart Plan step’s configured timezone; one-time sends use Eastern Time.</CardDescription></CardHeader><CardContent className="space-y-3">{analysis.timingInsights?.length ? analysis.timingInsights.map((item: any, index: number) => <div key={index} className="rounded-md border p-3"><p className="text-sm font-semibold">{item.finding}</p><p className="mt-1 text-xs leading-5 text-muted-foreground"><strong>Evidence:</strong> {item.evidence}</p><p className="mt-2 text-sm leading-5"><strong>Action:</strong> {item.action}</p></div>) : <p className="text-sm text-muted-foreground">More delivery events are needed to identify useful timing patterns.</p>}</CardContent></Card></div>
      <Card><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4" />Deliverability and compliance</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-2">{analysis.deliverabilityAndCompliance?.length ? analysis.deliverabilityAndCompliance.map((item: any, index: number) => <div key={index} className="rounded-md border p-3"><p className="text-sm font-semibold">{item.finding}</p><p className="mt-1 text-xs leading-5 text-muted-foreground"><strong>Impact:</strong> {item.impact}</p><p className="mt-2 text-sm leading-5"><strong>Action:</strong> {item.action}</p></div>) : <p className="text-sm text-muted-foreground">No material deliverability or compliance pattern was identified from the current data.</p>}</CardContent></Card>
      <Card><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Lightbulb className="h-4 w-4" />Prioritized recommendations</CardTitle><CardDescription>Use these as controlled tests—change one variable at a time and preserve opt-out and consent safeguards.</CardDescription></CardHeader><CardContent className="space-y-3">{analysis.recommendations?.map((item: any, index: number) => <div key={index} className={`rounded-md border p-4 ${priorityClass[item.priority] ?? priorityClass.low}`}><div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className="bg-background capitalize">{item.priority} priority</Badge><p className="text-sm font-semibold">{item.change}</p></div><p className="mt-2 text-sm leading-5"><strong>Why:</strong> {item.rationale}</p>{item.affectedMessages?.length ? <p className="mt-2 text-xs leading-5"><strong>Apply to:</strong> {item.affectedMessages.join(" · ")}</p> : null}</div>)}</CardContent></Card>
      {analysis.caveats?.length ? <Card><CardHeader className="pb-2"><CardTitle className="text-base">Data caveats</CardTitle></CardHeader><CardContent><ul className="space-y-2 text-sm text-muted-foreground">{analysis.caveats.map((item: string, index: number) => <li key={index} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground" />{item}</li>)}</ul></CardContent></Card> : null}
      <DialogFooter><Button variant="outline" onClick={onClose}>Close analysis</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function SmartPlansPage() {
  const { user } = useAuth();
  if (user?.role !== "admin") {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        Admin access required.
      </div>
    );
  }

  const utils = trpc.useUtils();
  const [, navigate] = useLocation();
  const { data: plans = [], isLoading } = trpc.smartPlans.list.useQuery();
  const [viewEnrollments, setViewEnrollments] = useState<PlanRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PlanRow | null>(null);
  const [oneTimeSendOpen, setOneTimeSendOpen] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any | null>(null);
  const [historyPlan, setHistoryPlan] = useState<PlanRow | null | undefined>(undefined);

  const toggleStatusMutation = trpc.smartPlans.update.useMutation({
    onSuccess: () => utils.smartPlans.list.invalidate(),
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.smartPlans.delete.useMutation({
    onSuccess: () => { utils.smartPlans.list.invalidate(); setDeleteTarget(null); toast.success("Plan deleted"); },
    onError: (e) => toast.error(e.message),
  });
  const analysisMutation = trpc.smartPlans.aiAnalysis.useMutation({
    onSuccess: (result) => setAnalysisResult(result),
    onError: (error) => toast.error(error.message || "Smart Plans analysis could not be generated."),
  });

  const plansList = plans as PlanRow[];
  const draftPlans = plansList.filter((p) => p.plan.status === "draft");
  const activePlans = plansList.filter((p) => p.plan.status !== "draft");

  const openWorkspace = (planId?: number) => {
    navigate(planId ? `/smart-plans/${planId}` : "/smart-plans/new");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Zap className="h-6 w-6 text-primary" /> Smart Plans
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Automated email & SMS drip campaigns triggered by lead source
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setHistoryPlan(null)}>
            <History className="mr-1.5 h-4 w-4" /> Full History
          </Button>
          <Button variant="outline" onClick={() => analysisMutation.mutate()} disabled={analysisMutation.isPending}>
            {analysisMutation.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <BrainCircuit className="mr-1.5 h-4 w-4" />}
            {analysisMutation.isPending ? "Analyzing…" : "Analyze with AI"}
          </Button>
          <Button variant="outline" onClick={() => setOneTimeSendOpen(true)}>
            <Mail className="mr-1.5 h-4 w-4" /> One Time Send
          </Button>
          <Button onClick={() => openWorkspace()}>
            <Plus className="h-4 w-4 mr-1.5" /> New Plan
          </Button>
        </div>
      </div>

      {oneTimeSendOpen && <OneTimeSmartPlanSendDialog onClose={() => setOneTimeSendOpen(false)} />}
      {analysisResult && <SmartPlansAnalysisDialog result={analysisResult} onClose={() => setAnalysisResult(null)} />}
      {historyPlan !== undefined && <SmartPlanHistoryDialog plan={historyPlan} onClose={() => setHistoryPlan(undefined)} />}

      <Collapsible>
        <Card>
          <CardHeader className="py-0">
            <CollapsibleTrigger asChild>
              <button type="button" className="flex w-full items-center justify-between gap-4 py-4 text-left">
                <div>
                  <CardTitle className="text-base">One-Time Send History</CardTitle>
                  <CardDescription className="mt-1">View one-time campaign details separately when needed.</CardDescription>
                </div>
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            </CollapsibleTrigger>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className="pt-0"><OneTimeSmartPlanSendHistory /></CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Enrollments Dialog */}
      {viewEnrollments && (
        <EnrollmentsDialog plan={viewEnrollments} onClose={() => setViewEnrollments(null)} />
      )}

      {/* Delete Confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete Plan?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently delete <strong>{deleteTarget?.plan.name}</strong> and all its steps and enrollment history.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && deleteMutation.mutate({ id: deleteTarget.plan.id })}
              disabled={deleteMutation.isPending}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Loading */}
      {isLoading && (
        <div className="text-center py-12 text-muted-foreground text-sm">Loading plans...</div>
      )}

      {/* Draft Plans */}
      {draftPlans.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
            <FileText className="h-4 w-4" /> Drafts ({draftPlans.length})
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {draftPlans.map((row) => (
              <PlanCard
                key={row.plan.id}
                row={row}
                onEdit={() => openWorkspace(row.plan.id)}
                onToggle={() => toggleStatusMutation.mutate({ id: row.plan.id, data: { status: row.plan.status === "active" ? "paused" : "active" } })}
                onViewEnrollments={() => setViewEnrollments(row)}
                onViewHistory={() => setHistoryPlan(row)}
                onDelete={() => setDeleteTarget(row)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Active/Paused Plans */}
      {activePlans.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
            <Zap className="h-4 w-4" /> Plans ({activePlans.length})
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {activePlans.map((row) => (
              <PlanCard
                key={row.plan.id}
                row={row}
                onEdit={() => openWorkspace(row.plan.id)}
                onToggle={() => toggleStatusMutation.mutate({ id: row.plan.id, data: { status: row.plan.status === "active" ? "paused" : "active" } })}
                onViewEnrollments={() => setViewEnrollments(row)}
                onViewHistory={() => setHistoryPlan(row)}
                onDelete={() => setDeleteTarget(row)}
              />
            ))}
          </div>
        </div>
      )}

      {!isLoading && plansList.length === 0 && (
        <Card>
          <CardContent className="py-16 text-center">
            <Zap className="h-10 w-10 mx-auto mb-3 text-primary/30" />
            <p className="font-medium mb-1">No Smart Plans yet</p>
            <p className="text-sm text-muted-foreground mb-4">
              Create your first plan to start automating lead follow-up.
            </p>
            <Button onClick={() => openWorkspace()}>
              <Plus className="h-4 w-4 mr-1.5" /> Create First Plan
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Plan Card ────────────────────────────────────────────────────────────────
function PlanCard({
  row,
  onEdit,
  onToggle,
  onViewEnrollments,
  onViewHistory,
  onDelete,
}: {
  row: PlanRow;
  onEdit: () => void;
  onToggle: () => void;
  onViewEnrollments: () => void;
  onViewHistory: () => void;
  onDelete: () => void;
}) {
  const { plan, stepCount, activeEnrollments } = row;
  const triggerLeadSources = (row as any).triggerLeadSources as { id: number; name: string; parentName: string | null }[] | undefined;

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-semibold truncate">{plan.name}</p>
            {triggerLeadSources && triggerLeadSources.length > 0 && (
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5 flex-wrap">
                <Zap className="h-3 w-3 shrink-0" />
                Triggers on: {triggerLeadSources.map((ls, i) => (
                  <span key={ls.id}>{i > 0 ? ", " : ""}<strong>{ls.parentName ? `${ls.parentName} › ${ls.name}` : ls.name}</strong></span>
                ))}
              </p>
            )}
          </div>
          {statusBadge(plan.status)}
        </div>

        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Zap className="h-3 w-3" />{stepCount} steps</span>
          <span className="flex items-center gap-1"><Users className="h-3 w-3" />{activeEnrollments} enrolled</span>
        </div>

        <Separator />

        <div className="flex items-center gap-1.5 flex-wrap">
          <Button variant="outline" size="sm" className="h-7 text-xs flex-1" onClick={onEdit}>
            <Edit2 className="h-3 w-3 mr-1" /> Edit
          </Button>
          {plan.status !== "draft" && (
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onToggle}>
              {plan.status === "active"
                ? <><Pause className="h-3 w-3 mr-1" />Pause</>
                : <><Play className="h-3 w-3 mr-1" />Resume</>
              }
            </Button>
          )}
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onViewEnrollments}>
            <Users className="h-3 w-3 mr-1" /> Contacts
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onViewHistory}>
            <History className="h-3 w-3 mr-1" /> History
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive" onClick={onDelete}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
