import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import RichEmailEditor from "@/components/RichEmailEditor";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { FilePlus2, Loader2, Mail, Save, Send, Users } from "lucide-react";

const DAILY_LIMIT = 250;
const CUSTOM_TEMPLATE_VALUE = "__custom__";
type AudienceRole = "admin" | "agent" | "isa";

function plainTextFromHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function audienceLabel(roles: AudienceRole[], isOwner: boolean): string {
  if (roles.length === 0) return isOwner ? "Private to you" : "Shared";
  return `Shared with ${roles.map((role) => role.toUpperCase()).join(", ")}`;
}

type PipelineEmailComposerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connectionIds: number[];
  mode: "single" | "mass";
  onSent?: () => void;
};

/**
 * Shared composer for the Pipeline list and a single connection. Authorization,
 * eligibility, batch caps, and daily send limits are re-checked on the server.
 */
export default function PipelineEmailComposer({
  open,
  onOpenChange,
  connectionIds,
  mode,
  onSent,
}: PipelineEmailComposerProps) {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [subject, setSubject] = useState("");
  const [htmlBody, setHtmlBody] = useState("");
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [templateMode, setTemplateMode] = useState<"create" | "update">("create");
  const [templateName, setTemplateName] = useState("");
  const [templateAudience, setTemplateAudience] = useState<AudienceRole[]>([]);

  const { data: templates = [], isLoading: templatesLoading } = trpc.pipelineEmail.templates.list.useQuery(undefined, {
    enabled: open,
  });
  const { data: quota, isLoading: quotaLoading } = trpc.pipelineEmail.quota.useQuery(undefined, {
    enabled: open,
  });
  const { data: myProfile, isLoading: profileLoading } = trpc.users.getMyCoreProfile.useQuery(undefined, {
    enabled: open,
  });

  const selectedTemplate = useMemo(
    () => templates.find((template: any) => template.id === selectedTemplateId) ?? null,
    [templates, selectedTemplateId],
  );
  const recipientCount = connectionIds.length;
  const remaining = quota?.remaining ?? 0;
  const hasEmailSignature = plainTextFromHtml(myProfile?.emailSignatureHtml ?? "").length > 0;
  const overBatchLimit = recipientCount > DAILY_LIMIT;
  const overDailyLimit = recipientCount > remaining;
  const canSubmit = !quotaLoading
    && !profileLoading
    && hasEmailSignature
    && recipientCount > 0
    && !overBatchLimit
    && !overDailyLimit
    && subject.trim().length > 0
    && plainTextFromHtml(htmlBody).length > 0;

  useEffect(() => {
    if (open) return;
    setTemplateDialogOpen(false);
  }, [open]);

  const sendEmail = trpc.pipelineEmail.send.useMutation({
    onSuccess: (result) => {
      const noun = result.deliveredCount === 1 ? "email" : "emails";
      if (result.failedCount > 0) {
        toast.warning(`${result.deliveredCount} ${noun} sent; ${result.failedCount} could not be delivered.`);
      } else {
        toast.success(`${result.deliveredCount} ${noun} sent successfully.`);
      }
      utils.pipelineEmail.quota.invalidate();
      utils.communications.list.invalidate();
      utils.agentConnections.list.invalidate();
      onOpenChange(false);
      onSent?.();
    },
    onError: (error) => toast.error(error.message),
  });

  const createTemplate = trpc.pipelineEmail.templates.create.useMutation({
    onSuccess: (result) => {
      toast.success("Email template saved");
      utils.pipelineEmail.templates.list.invalidate();
      setSelectedTemplateId(result.id);
      setTemplateDialogOpen(false);
    },
    onError: (error) => toast.error(error.message),
  });

  const updateTemplate = trpc.pipelineEmail.templates.update.useMutation({
    onSuccess: () => {
      toast.success("Email template updated");
      utils.pipelineEmail.templates.list.invalidate();
      setTemplateDialogOpen(false);
    },
    onError: (error) => toast.error(error.message),
  });

  function chooseTemplate(value: string) {
    if (value === CUSTOM_TEMPLATE_VALUE) {
      setSelectedTemplateId(null);
      return;
    }
    const template = templates.find((item: any) => item.id === Number(value));
    if (!template) return;
    setSelectedTemplateId(template.id);
    setSubject(template.subject);
    setHtmlBody(template.htmlBody);
  }

  function openTemplateDialog() {
    const updatingExisting = Boolean(selectedTemplate?.canEdit);
    setTemplateMode(updatingExisting ? "update" : "create");
    setTemplateName(selectedTemplate?.name ?? (subject.trim().slice(0, 80) || "New email template"));
    setTemplateAudience((selectedTemplate?.visibleToRoles as AudienceRole[] | undefined) ?? []);
    setTemplateDialogOpen(true);
  }

  function toggleAudience(role: AudienceRole) {
    setTemplateAudience((current) => current.includes(role)
      ? current.filter((value) => value !== role)
      : [...current, role]);
  }

  function saveTemplate() {
    if (!templateName.trim()) {
      toast.error("Provide a template name.");
      return;
    }
    if (!subject.trim() || !plainTextFromHtml(htmlBody)) {
      toast.error("Add a subject and message before saving a template.");
      return;
    }
    const payload = {
      name: templateName.trim(),
      subject: subject.trim(),
      htmlBody,
      visibleToRoles: user?.role === "admin" ? templateAudience : [],
    };
    if (templateMode === "update" && selectedTemplate?.canEdit) {
      updateTemplate.mutate({ id: selectedTemplate.id, ...payload });
    } else {
      createTemplate.mutate(payload);
    }
  }

  function submit() {
    if (!canSubmit) return;
    sendEmail.mutate({
      connectionIds,
      subject: subject.trim(),
      htmlBody,
      templateId: selectedTemplateId ?? undefined,
    });
  }

  const savingTemplate = createTemplate.isPending || updateTemplate.isPending;
  const title = mode === "mass" ? `Mass Email (${recipientCount} contacts)` : "Send Email";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl w-[calc(100vw-2rem)] max-h-[94vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {mode === "mass" ? <Users className="h-5 w-5" /> : <Mail className="h-5 w-5" />}
              {title}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="rounded-lg border bg-muted/30 px-3 py-2.5 text-sm flex flex-wrap items-center justify-between gap-2">
              <span>
                <strong>{recipientCount}</strong> selected recipient{recipientCount === 1 ? "" : "s"}. Pipeline email is available for contacts with an email address in any status other than <strong>New</strong> or <strong>Dead</strong>.
              </span>
              <Badge variant="outline" className="whitespace-nowrap">
                {quotaLoading ? "Checking daily limit…" : `${remaining} of ${DAILY_LIMIT} sends remaining today`}
              </Badge>
            </div>

            {!profileLoading && !hasEmailSignature && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950 flex flex-wrap items-center justify-between gap-2">
                <span><strong>Email Signature required.</strong> Save your personal signature in My Profile before sending.</span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="border-amber-300 bg-white hover:bg-amber-100"
                  onClick={() => { onOpenChange(false); window.location.href = "/profile"; }}
                >
                  Set Email Signature
                </Button>
              </div>
            )}
            {overBatchLimit && (
              <p className="text-sm text-destructive">Mass email is limited to {DAILY_LIMIT} selected contacts per send.</p>
            )}
            {!quotaLoading && !overBatchLimit && overDailyLimit && (
              <p className="text-sm text-destructive">This send exceeds your remaining daily allowance. Reduce the selection to {remaining} contacts or fewer.</p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
              <div>
                <Label>Email Template</Label>
                <Select value={selectedTemplateId ? String(selectedTemplateId) : CUSTOM_TEMPLATE_VALUE} onValueChange={chooseTemplate}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Start with a template or custom message" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={CUSTOM_TEMPLATE_VALUE}>Custom message</SelectItem>
                    {templates.map((template: any) => (
                      <SelectItem key={template.id} value={String(template.id)}>
                        {template.name} — {audienceLabel(template.visibleToRoles ?? [], template.ownerId === user?.id)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="button" variant="outline" onClick={openTemplateDialog} disabled={templatesLoading}>
                <FilePlus2 className="h-4 w-4 mr-1.5" />
                {selectedTemplate?.canEdit ? "Save Template" : "Save as Template"}
              </Button>
            </div>

            <div>
              <Label htmlFor="pipeline-email-subject">Subject</Label>
              <Input
                id="pipeline-email-subject"
                className="mt-1"
                value={subject}
                maxLength={512}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="Email subject"
              />
            </div>

            <div>
              <Label>Message</Label>
              <div className="mt-1">
                <RichEmailEditor
                  value={htmlBody}
                  onChange={setHtmlBody}
                  placeholder="Write your message…"
                />
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Personalization tags are available below the editor. Your saved Email Signature is automatically appended after the message and is required before sending.
              </p>
            </div>

            <div className="text-xs text-muted-foreground border-t pt-3">
              <strong>Reply-To:</strong> {user?.email || "Your SavvyOS profile email"}. Emails are delivered through Savvy STR Agents and replies route directly to your logged-in email address.
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sendEmail.isPending}>Cancel</Button>
            <Button onClick={submit} disabled={!canSubmit || sendEmail.isPending}>
              {sendEmail.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
              {sendEmail.isPending ? "Sending…" : mode === "mass" ? `Send to ${recipientCount}` : "Send Email"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent className="max-w-lg w-[calc(100vw-2rem)]">
          <DialogHeader>
            <DialogTitle>{templateMode === "update" ? "Update Email Template" : "Save Email Template"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div>
              <Label htmlFor="pipeline-email-template-name">Template Name</Label>
              <Input
                id="pipeline-email-template-name"
                className="mt-1"
                value={templateName}
                maxLength={160}
                onChange={(event) => setTemplateName(event.target.value)}
                placeholder="e.g. Nurture follow-up"
              />
            </div>

            {user?.role === "admin" ? (
              <div>
                <Label>Share this template with</Label>
                <p className="text-xs text-muted-foreground mt-1">Leave all roles unchecked to keep this template private to your admin account.</p>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {(["admin", "agent", "isa"] as AudienceRole[]).map((role) => (
                    <label key={role} className="flex items-center gap-2 border rounded-md px-2.5 py-2 text-sm cursor-pointer hover:bg-muted/40">
                      <input
                        type="checkbox"
                        checked={templateAudience.includes(role)}
                        onChange={() => toggleAudience(role)}
                        className="h-4 w-4"
                      />
                      {role === "isa" ? "ISA" : role.charAt(0).toUpperCase() + role.slice(1)}
                    </label>
                  ))}
                </div>
              </div>
            ) : (
              <p className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">This template will be private to your account.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateDialogOpen(false)} disabled={savingTemplate}>Cancel</Button>
            <Button onClick={saveTemplate} disabled={savingTemplate}>
              {savingTemplate ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
              {templateMode === "update" ? "Update Template" : "Save Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
