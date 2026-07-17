import { useEffect, useMemo, useState } from "react";
import { Mail, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import RichEmailEditor from "@/components/RichEmailEditor";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type PipelineEmailRecipient = {
  connectionId: number;
  name: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipients: PipelineEmailRecipient[];
  onSent?: () => void;
};

const EMPTY_BODY = "<p></p>";

export default function PipelineEmailComposer({ open, onOpenChange, recipients, onSent }: Props) {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState(EMPTY_BODY);
  const [selectedTemplateId, setSelectedTemplateId] = useState("none");
  const [showTemplateSettings, setShowTemplateSettings] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [isPersonal, setIsPersonal] = useState(true);
  const [visibleToAdmins, setVisibleToAdmins] = useState(false);
  const [visibleToAgents, setVisibleToAgents] = useState(false);
  const [visibleToIsas, setVisibleToIsas] = useState(false);

  const limits = trpc.pipelineEmail.limits.useQuery(undefined, { enabled: open });
  const templates = trpc.pipelineEmail.templates.list.useQuery(undefined, { enabled: open });
  const selectedTemplate = useMemo(
    () => templates.data?.find(template => String(template.id) === selectedTemplateId),
    [selectedTemplateId, templates.data]
  );
  const selectedIsOwned = selectedTemplate?.createdById === (user as any)?.id;

  const send = trpc.pipelineEmail.send.useMutation({
    onSuccess: result => {
      if (result.failed > 0) {
        toast.warning(`${result.accepted} email${result.accepted === 1 ? "" : "s"} accepted; ${result.failed} failed.`);
      } else {
        toast.success(`${result.accepted} email${result.accepted === 1 ? "" : "s"} sent.`);
      }
      void utils.pipelineEmail.limits.invalidate();
      onOpenChange(false);
      onSent?.();
    },
    onError: error => toast.error(error.message),
  });

  const createTemplate = trpc.pipelineEmail.templates.create.useMutation({
    onSuccess: () => {
      toast.success("Template saved");
      void utils.pipelineEmail.templates.list.invalidate();
      setShowTemplateSettings(false);
    },
    onError: error => toast.error(error.message),
  });
  const updateTemplate = trpc.pipelineEmail.templates.update.useMutation({
    onSuccess: () => {
      toast.success("Template updated");
      void utils.pipelineEmail.templates.list.invalidate();
      setShowTemplateSettings(false);
    },
    onError: error => toast.error(error.message),
  });
  const deleteTemplate = trpc.pipelineEmail.templates.delete.useMutation({
    onSuccess: () => {
      toast.success("Template deleted");
      setSelectedTemplateId("none");
      void utils.pipelineEmail.templates.list.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  useEffect(() => {
    if (!open) return;
    setSelectedTemplateId("none");
    setSubject("");
    setBodyHtml(EMPTY_BODY);
    setTemplateName("");
    setShowTemplateSettings(false);
    setIsPersonal(true);
    setVisibleToAdmins(false);
    setVisibleToAgents(false);
    setVisibleToIsas(false);
  }, [open]);

  function loadTemplate(value: string) {
    setSelectedTemplateId(value);
    if (value === "none") return;
    const template = templates.data?.find(item => String(item.id) === value);
    if (!template) return;
    setSubject(template.subject);
    setBodyHtml(template.bodyHtml);
    setTemplateName(template.name);
    setIsPersonal(template.isPersonal);
    setVisibleToAdmins(template.visibleToAdmins);
    setVisibleToAgents(template.visibleToAgents);
    setVisibleToIsas(template.visibleToIsas);
  }

  function openSaveTemplate() {
    if (!selectedIsOwned) {
      setTemplateName(selectedTemplate ? `${selectedTemplate.name} copy` : "");
      setIsPersonal(true);
      setVisibleToAdmins(false);
      setVisibleToAgents(false);
      setVisibleToIsas(false);
    }
    setShowTemplateSettings(true);
  }

  function saveTemplate() {
    const payload = {
      name: templateName,
      subject,
      bodyHtml,
      isPersonal: (user as any)?.role === "admin" ? isPersonal : true,
      visibleToAdmins,
      visibleToAgents,
      visibleToIsas,
    };
    if (selectedIsOwned && selectedTemplate) {
      updateTemplate.mutate({ id: selectedTemplate.id, ...payload });
    } else {
      createTemplate.mutate(payload);
    }
  }

  const remaining = limits.data?.remaining ?? 0;
  const canSend = recipients.length > 0 && recipients.length <= remaining && subject.trim().length > 0 && bodyHtml.replace(/<[^>]*>/g, "").trim().length > 0;
  const role = (user as any)?.role;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-[calc(100vw-2rem)] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            {recipients.length === 1 ? `Email ${recipients[0]?.name}` : `Mass Email ${recipients.length} Contacts`}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Alert>
            <AlertDescription className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span>Replies go directly to <strong>{(user as any)?.email ?? "your login email"}</strong>.</span>
              <Badge variant={recipients.length <= remaining ? "secondary" : "destructive"}>
                {remaining} of {limits.data?.dailyLimit ?? 250} emails remaining today
              </Badge>
            </AlertDescription>
          </Alert>

          <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <div>
              <Label>Email template</Label>
              <Select value={selectedTemplateId} onValueChange={loadTemplate}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Start without a template" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Start without a template</SelectItem>
                  {(templates.data ?? []).map(template => (
                    <SelectItem key={template.id} value={String(template.id)}>
                      {template.name}{template.isPersonal ? " · Personal" : " · Shared"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="button" variant="outline" onClick={openSaveTemplate}>
              <Save className="h-4 w-4 mr-1.5" />
              {selectedIsOwned ? "Update Template" : "Save as Template"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!selectedIsOwned || deleteTemplate.isPending}
              onClick={() => selectedTemplate && window.confirm(`Delete template “${selectedTemplate.name}”?`) && deleteTemplate.mutate({ id: selectedTemplate.id })}
            >
              <Trash2 className="h-4 w-4 mr-1.5" /> Delete
            </Button>
          </div>

          {showTemplateSettings && (
            <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium text-sm">Template settings</p>
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowTemplateSettings(false)}>Cancel</Button>
              </div>
              <div>
                <Label>Template name</Label>
                <Input className="mt-1" value={templateName} onChange={event => setTemplateName(event.target.value)} placeholder="Follow-up introduction" />
              </div>
              {role === "admin" ? (
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={isPersonal} onCheckedChange={checked => setIsPersonal(checked === true)} />
                    Personal to me
                  </label>
                  {!isPersonal && (
                    <div className="rounded-md border bg-background p-3">
                      <p className="text-xs text-muted-foreground mb-2">Turn off “Personal to me” to share with any combination of portal roles. “All admins” creates an admin-only shared template.</p>
                      <div className="flex flex-wrap gap-4">
                        <label className="flex items-center gap-2 text-sm"><Checkbox checked={visibleToAdmins} onCheckedChange={checked => setVisibleToAdmins(checked === true)} /> All admins</label>
                        <label className="flex items-center gap-2 text-sm"><Checkbox checked={visibleToAgents} onCheckedChange={checked => setVisibleToAgents(checked === true)} /> Agent</label>
                        <label className="flex items-center gap-2 text-sm"><Checkbox checked={visibleToIsas} onCheckedChange={checked => setVisibleToIsas(checked === true)} /> ISA</label>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Agent and ISA templates are personal and visible only to their creator.</p>
              )}
              <Button type="button" size="sm" onClick={saveTemplate} disabled={!templateName.trim() || createTemplate.isPending || updateTemplate.isPending}>
                <Save className="h-4 w-4 mr-1.5" /> Save Template
              </Button>
            </div>
          )}

          <div>
            <Label>Subject</Label>
            <Input className="mt-1" value={subject} onChange={event => setSubject(event.target.value)} placeholder="Subject line" maxLength={512} />
          </div>

          <div>
            <Label>Message</Label>
            <RichEmailEditor className="mt-1" value={bodyHtml} onChange={setBodyHtml} placeholder="Write your email…" />
          </div>

          {recipients.length > remaining && (
            <p className="text-sm text-destructive">This send exceeds your remaining daily allowance. Reduce the selection to {remaining} contact{remaining === 1 ? "" : "s"}.</p>
          )}
          {recipients.length > 1 && (
            <p className="text-xs text-muted-foreground">Each contact receives a separate, personalized email. Recipient addresses are never exposed to other contacts.</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => send.mutate({ connectionIds: recipients.map(recipient => recipient.connectionId), subject, bodyHtml })}
            disabled={!canSend || send.isPending || limits.isLoading}
          >
            <Mail className="h-4 w-4 mr-1.5" />
            {send.isPending ? "Sending…" : recipients.length === 1 ? "Send Email" : `Send ${recipients.length} Emails`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
