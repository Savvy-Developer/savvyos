import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import {
  Mail, Send, CheckCircle2, XCircle, Loader2, Pencil, RotateCcw,
  Eye, ChevronDown, ChevronRight, Code2, X,
} from "lucide-react";

// Default body text for each email type (mirrors the hardcoded template content)
const DEFAULT_TEMPLATES: Record<string, { subject: string; bodyText: string }> = {
  lead_assigned: {
    subject: "New Lead Assigned: {{contactName}}",
    bodyText: "A new lead has been assigned to you. Please review their details and reach out as soon as possible.",
  },
  transaction_created: {
    subject: "New Transaction #{{transactionNumber}} Created",
    bodyText: "A new transaction has been created and assigned to you. Please review the details and ensure all required documents are uploaded.",
  },
  transaction_status_changed: {
    subject: "Transaction Status Updated — #{{transactionNumber}}",
    bodyText: "The status of your transaction has been updated. Please log in to review the latest details and take any necessary action.",
  },
  transaction_closed: {
    subject: "Transaction Closed — #{{transactionNumber}}",
    bodyText: "Congratulations! Your transaction has been successfully closed. Thank you for your hard work on this deal.",
  },
  commission_calculated: {
    subject: "Commission Calculated — #{{transactionNumber}}",
    bodyText: "Your commission payout has been calculated for a recently closed transaction. Please review the details below.",
  },
  task_assigned: {
    subject: "New Task: {{taskTitle}}",
    bodyText: "A new task has been assigned to you. Please complete it by the due date shown below.",
  },
  task_due: {
    subject: "Task Due Soon: {{taskTitle}}",
    bodyText: "This is a reminder that one of your tasks is due soon. Please take action before the deadline.",
  },
  payout_integrity_fail: {
    subject: "Commission Integrity Issue — Action Required",
    bodyText: "A transaction has commission payouts that exceed 100%. Please review and correct the payout items immediately to avoid processing errors.",
  },
  listing_created: {
    subject: "New Listing Created — {{listingAddress}}",
    bodyText: "A new listing has been created and assigned to you. Please review the details and ensure all required information is complete.",
  },
  listing_expiration_reminder: {
    subject: "Listing Expiration Notice — {{listingAddress}}",
    bodyText: "One of your active listings has passed its expiration date. Please review and update the expiration date, or change the listing status to keep your pipeline accurate.",
  },
  onboarding_overdue: {
    subject: "Onboarding Tasks Overdue — {{agentName}}",
    bodyText: "Some onboarding tasks are now past their due date. Please complete them as soon as possible to keep your pipeline moving.",
  },
  commission_exception_warning: {
    subject: "⚠️ Commission Exception Warning — Transaction #{{transactionNumber}}",
    bodyText: "A commission exception was approved for a transaction with the following warnings. Please review and take action if needed.",
  },
  market_match_intro: {
    subject: "Introduction: {{investorFirstName}} × {{marketName}} — STR Opportunity",
    bodyText: "We have a new investor who is interested in short-term rental properties in your market. Please review their profile and reach out to schedule a discovery call.",
  },
  client_intro: {
    subject: "Meet {{agentName}} — Savvy STR Agents",
    bodyText: "We're excited to introduce you to your dedicated agent, who will be working with you on your short-term rental journey. Your agent specializes in STR properties and is ready to help you find the perfect investment.",
  },
  connection_request_approved: {
    subject: "Connection Request Approved — {{contactName}}",
    bodyText: "Your connection request has been approved. You can now view and manage this contact in your pipeline.",
  },
  pm_mention: {
    subject: "{{mentionedByName}} mentioned you in a project note",
    bodyText: "You were mentioned in a note on a project. Click below to view the full note and respond.",
  },
};

// Variable reference per email type — shown in the edit dialog
const TEMPLATE_VARIABLES: Record<string, { key: string; description: string }[]> = {
  lead_assigned: [
    { key: "recipientName", description: "Name of the person receiving the email" },
    { key: "contactName", description: "Name of the new lead" },
    { key: "notes", description: "Notes about the lead from the ISA" },
  ],
  transaction_created: [
    { key: "recipientName", description: "Recipient's name" },
    { key: "transactionNumber", description: "Transaction ID (e.g. TXN-001)" },
    { key: "transactionType", description: "buyer or seller" },
    { key: "contactName", description: "Client name" },
    { key: "propertyAddress", description: "Property address" },
    { key: "amount", description: "Transaction amount (formatted)" },
  ],
  transaction_status_changed: [
    { key: "recipientName", description: "Recipient's name" },
    { key: "transactionNumber", description: "Transaction ID" },
    { key: "contactName", description: "Client name" },
    { key: "status", description: "New status label" },
  ],
  transaction_closed: [
    { key: "recipientName", description: "Recipient's name" },
    { key: "transactionNumber", description: "Transaction ID" },
    { key: "contactName", description: "Client name" },
    { key: "amount", description: "Closed transaction amount" },
  ],
  commission_calculated: [
    { key: "recipientName", description: "Recipient's name" },
    { key: "transactionNumber", description: "Transaction ID" },
    { key: "percentage", description: "Commission percentage (e.g. 80)" },
    { key: "amount", description: "Commission dollar amount" },
  ],
  task_assigned: [
    { key: "recipientName", description: "Recipient's name" },
    { key: "taskTitle", description: "Title of the task" },
    { key: "dueDate", description: "Due date (formatted)" },
    { key: "contactName", description: "Related contact name (if any)" },
  ],
  task_due: [
    { key: "recipientName", description: "Recipient's name" },
    { key: "taskTitle", description: "Title of the task" },
    { key: "dueDate", description: "Due date label (e.g. Today)" },
  ],
  payout_integrity_fail: [
    { key: "recipientName", description: "Recipient's name (admin)" },
    { key: "transactionNumber", description: "Transaction ID with the issue" },
  ],
  listing_created: [
    { key: "recipientName", description: "Recipient's name" },
    { key: "listingAddress", description: "Property address" },
    { key: "contactName", description: "Seller's name" },
    { key: "listPrice", description: "List price (formatted)" },
    { key: "listingDate", description: "Date listed" },
    { key: "expirationDate", description: "Listing expiration date" },
  ],
  listing_expiration_reminder: [
    { key: "recipientName", description: "Recipient's name" },
    { key: "listingAddress", description: "Property address" },
    { key: "contactName", description: "Seller's name" },
    { key: "listPrice", description: "List price (formatted)" },
    { key: "expirationDate", description: "Expiration date" },
  ],
  onboarding_overdue: [
    { key: "recipientName", description: "Recipient's name" },
    { key: "overdueCount", description: "Number of overdue tasks" },
    { key: "taskList", description: "Bullet list of overdue tasks" },
  ],
  commission_exception_warning: [
    { key: "recipientName", description: "Recipient's name (admin)" },
    { key: "transactionNumber", description: "Transaction ID" },
    { key: "notes", description: "Warning notes / reason" },
  ],
  market_match_intro: [
    { key: "recipientName", description: "Agent's name" },
    { key: "investorFirstName", description: "Investor's first name" },
    { key: "marketName", description: "Target market city/area" },
    { key: "marketState", description: "Target market state" },
    { key: "investorBudget", description: "Investor's budget range" },
    { key: "investorGoals", description: "Investor's goals / return targets" },
    { key: "isaName", description: "ISA who handled the call" },
    { key: "callSummarySnippet", description: "Short summary of the discovery call" },
    { key: "handoffNotes", description: "Notes for the agent from the ISA" },
  ],
  client_intro: [
    { key: "recipientName", description: "Client's name" },
    { key: "agentName", description: "Agent's full name" },
    { key: "contactName", description: "Client's name (same as recipientName)" },
    { key: "isaName", description: "ISA who made the introduction" },
    { key: "agentBookingLink", description: "Agent's calendar booking URL" },
  ],
  connection_request_approved: [
    { key: "recipientName", description: "Agent's name" },
    { key: "contactName", description: "Contact's name" },
    { key: "agentName", description: "Agent's name" },
    { key: "pipelineStatus", description: "Pipeline stage label" },
  ],
  pm_mention: [
    { key: "recipientName", description: "Mentioned user's name" },
    { key: "mentionedByName", description: "Name of person who wrote the note" },
    { key: "projectTitle", description: "Project title" },
    { key: "noteContent", description: "First 300 chars of the note" },
    { key: "projectUrl", description: "Direct link to the project" },
  ],
};

const EMAIL_TYPES = [
  { key: "lead_assigned", label: "Lead Assigned", description: "Sent when a new lead is assigned to an ISA or agent" },
  { key: "transaction_created", label: "Transaction Created", description: "Sent when a new transaction is created for an agent" },
  { key: "transaction_status_changed", label: "Transaction Status Changed", description: "Sent when a transaction status is updated" },
  { key: "transaction_closed", label: "Transaction Closed", description: "Sent when a transaction is marked as closed" },
  { key: "commission_calculated", label: "Commission Calculated", description: "Sent when a commission payout is added for an agent" },
  { key: "task_assigned", label: "Task Assigned", description: "Sent when a task is assigned to a user" },
  { key: "task_due", label: "Task Due Soon", description: "Sent as a reminder when a task is due" },
  { key: "payout_integrity_fail", label: "Payout Integrity Issue", description: "Sent when commission payouts exceed 100%" },
  { key: "listing_created", label: "Listing Created", description: "Sent when a new listing is created for an agent" },
  { key: "listing_expiration_reminder", label: "Listing Expiration Reminder", description: "Sent daily when an active listing has passed its expiration date" },
  { key: "onboarding_overdue", label: "Onboarding Overdue", description: "Sent when onboarding tasks are past their due date" },
  { key: "commission_exception_warning", label: "Commission Exception Warning", description: "Sent when a commission exception is approved with warnings" },
  { key: "market_match_intro", label: "Market Match Intro", description: "Sent to introduce an investor to an agent in their target market" },
  { key: "client_intro", label: "Client Introduction", description: "Sent to introduce a client to their assigned agent, with agent CC'd" },
  { key: "connection_request_approved", label: "Connection Request Approved", description: "Sent to an agent when their connection request is approved by an admin" },
  { key: "pm_mention", label: "Project Mention", description: "Sent when a user is @mentioned in a project note" },
];

export default function EmailTestPage() {
  const { user } = useAuth();
  const [email, setEmail] = useState((user as any)?.email ?? "");
  const [name, setName] = useState((user as any)?.name ?? "Tyler");
  const [results, setResults] = useState<Record<string, string>>({});
  const [sendingOne, setSendingOne] = useState<string | null>(null);

  // Edit dialog state
  const [editOpen, setEditOpen] = useState(false);
  const [editType, setEditType] = useState<string | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [varsOpen, setVarsOpen] = useState(false);

  // Preview dialog state
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewType, setPreviewType] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const { data: savedTemplates = [] } = trpc.emailTemplates.list.useQuery();

  // Preview query — only fires when previewType is set
  const { data: previewData, isFetching: previewLoading } = trpc.emailTest.getPreview.useQuery(
    { emailType: previewType ?? "", recipientName: name || "Tyler" },
    { enabled: !!previewType }
  );

  const upsertTemplate = trpc.emailTemplates.upsert.useMutation({
    onSuccess: () => {
      toast.success("Template saved — this will be used for all future sends of this email type.");
      utils.emailTemplates.list.invalidate();
      setEditOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const resetTemplate = trpc.emailTemplates.reset.useMutation({
    onSuccess: () => {
      toast.success("Template reset to default.");
      utils.emailTemplates.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const sendAll = trpc.emailTest.sendAll.useMutation({
    onSuccess: (data) => {
      setResults(data.results);
      const successCount = Object.values(data.results).filter(v => v === "sent").length;
      const errorCount = Object.values(data.results).filter(v => v.startsWith("error")).length;
      if (errorCount === 0) {
        toast.success(`All ${successCount} email types sent successfully!`);
      } else {
        toast.warning(`${successCount} sent, ${errorCount} failed. Check results below.`);
      }
    },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });

  const sendOne = trpc.emailTest.sendOne.useMutation({
    onSuccess: (_, vars) => {
      setResults(prev => ({ ...prev, [vars.emailType]: "sent" }));
      const label = EMAIL_TYPES.find(t => t.key === vars.emailType)?.label ?? vars.emailType;
      toast.success(`"${label}" sent to ${vars.recipientEmail}`);
      setSendingOne(null);
    },
    onError: (err, vars) => {
      setResults(prev => ({ ...prev, [vars.emailType]: `error: ${err.message}` }));
      toast.error(`Failed to send: ${err.message}`);
      setSendingOne(null);
    },
  });

  const handleSendAll = () => {
    if (!email) { toast.error("Please enter a recipient email address"); return; }
    setResults({});
    sendAll.mutate({ recipientEmail: email, recipientName: name });
  };

  const handleSendOne = (emailType: string) => {
    if (!email) { toast.error("Please enter a recipient email address"); return; }
    setSendingOne(emailType);
    sendOne.mutate({ recipientEmail: email, recipientName: name, emailType });
  };

  const openEdit = (typeKey: string) => {
    const saved = (savedTemplates as any[]).find((t) => t.emailType === typeKey);
    const defaults = DEFAULT_TEMPLATES[typeKey] ?? { subject: "", bodyText: "" };
    setEditType(typeKey);
    setEditSubject(saved?.subject ?? defaults.subject);
    setEditBody(saved?.bodyText ?? defaults.bodyText);
    setVarsOpen(false);
    setEditOpen(true);
  };

  const openPreview = (typeKey: string) => {
    setPreviewType(typeKey);
    setPreviewOpen(true);
  };

  const handleSaveTemplate = () => {
    if (!editType || !editSubject.trim() || !editBody.trim()) {
      toast.error("Subject and body are required.");
      return;
    }
    upsertTemplate.mutate({ emailType: editType, subject: editSubject, bodyText: editBody });
  };

  const handleResetTemplate = (typeKey: string) => {
    resetTemplate.mutate({ emailType: typeKey });
  };

  const editTypeLabel = EMAIL_TYPES.find(t => t.key === editType)?.label ?? editType;
  const previewTypeLabel = EMAIL_TYPES.find(t => t.key === previewType)?.label ?? previewType;
  const editVars = editType ? (TEMPLATE_VARIABLES[editType] ?? []) : [];

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Mail className="h-6 w-6 text-primary" />
          Transactional Emails
        </h1>
        <p className="text-muted-foreground mt-1">
          Edit email templates, preview rendered output, test individual sends, or send all types at once.
        </p>
      </div>

      {/* Recipient Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Test Recipient</CardTitle>
          <CardDescription>All test emails will be sent to this address with sample data.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Recipient Email *</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tyler@savvy.realty"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="name">Recipient Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Tyler"
              />
            </div>
          </div>
          <Button
            onClick={handleSendAll}
            disabled={sendAll.isPending || !email}
            className="w-full sm:w-auto"
          >
            {sendAll.isPending ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending all {EMAIL_TYPES.length} emails...</>
            ) : (
              <><Send className="h-4 w-4 mr-2" /> Send All {EMAIL_TYPES.length} Email Types</>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Email Types List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Email Templates ({EMAIL_TYPES.length})</CardTitle>
          <CardDescription>
            Click <strong>Preview</strong> to see the rendered email. Click <strong>Edit</strong> to customize subject and body. Click <strong>Send</strong> to test delivery.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            {EMAIL_TYPES.map((type) => {
              const result = results[type.key];
              const isSending = sendingOne === type.key;
              const isCustomized = (savedTemplates as any[]).some((t) => t.emailType === type.key);
              return (
                <div
                  key={type.key}
                  className="flex items-center justify-between gap-3 py-2.5 px-3 rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{type.label}</p>
                      {isCustomized && (
                        <Badge variant="outline" className="text-xs text-primary border-primary/40 py-0">Edited</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{type.description}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {result === "sent" ? (
                      <span className="flex items-center gap-1 text-xs text-green-700 font-medium">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Sent
                      </span>
                    ) : result?.startsWith("error") ? (
                      <span className="flex items-center gap-1 text-xs text-red-600 font-medium" title={result}>
                        <XCircle className="h-3.5 w-3.5" /> Error
                      </span>
                    ) : result == null && !sendAll.isPending ? null : (
                      sendAll.isPending ? (
                        <Badge variant="outline" className="text-xs">Sending…</Badge>
                      ) : null
                    )}
                    {isCustomized && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs text-muted-foreground"
                        disabled={resetTemplate.isPending}
                        onClick={() => handleResetTemplate(type.key)}
                        title="Reset to default"
                      >
                        <RotateCcw className="h-3 w-3" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2.5 text-xs"
                      onClick={() => openPreview(type.key)}
                    >
                      <Eye className="h-3 w-3 mr-1" />Preview
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2.5 text-xs"
                      onClick={() => openEdit(type.key)}
                    >
                      <Pencil className="h-3 w-3 mr-1" />Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2.5 text-xs"
                      disabled={isSending || sendAll.isPending || !email}
                      onClick={() => handleSendOne(type.key)}
                    >
                      {isSending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <><Send className="h-3 w-3 mr-1" />Send</>
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Edit Template Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-xl w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Email Template — {editTypeLabel}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-xs text-muted-foreground">
              Changes here override the default template for all future sends of this email type. Use <code className="bg-muted px-1 rounded">**bold**</code> for bold text.
            </p>

            {/* Variable Reference */}
            {editVars.length > 0 && (
              <Collapsible open={varsOpen} onOpenChange={setVarsOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full justify-between text-xs h-8">
                    <span className="flex items-center gap-1.5">
                      <Code2 className="h-3.5 w-3.5" />
                      Available Variables ({editVars.length})
                    </span>
                    {varsOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-2 rounded-md border bg-muted/30 p-3 space-y-1.5">
                    <p className="text-xs text-muted-foreground mb-2">
                      These variables are automatically filled at send time. You can reference them in the subject line as <code className="bg-muted px-1 rounded">{`{{variableName}}`}</code>.
                    </p>
                    {editVars.map(v => (
                      <div key={v.key} className="flex items-start gap-2 text-xs">
                        <code className="bg-background border rounded px-1.5 py-0.5 font-mono text-primary shrink-0">
                          {`{{${v.key}}}`}
                        </code>
                        <span className="text-muted-foreground pt-0.5">{v.description}</span>
                      </div>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}

            <div>
              <Label>Subject Line</Label>
              <Input
                className="mt-1"
                value={editSubject}
                onChange={(e) => setEditSubject(e.target.value)}
                placeholder="Email subject..."
              />
            </div>
            <div>
              <Label>Body Text</Label>
              <Textarea
                className="mt-1 font-mono text-sm"
                rows={6}
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                placeholder="Email body text..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveTemplate} disabled={upsertTemplate.isPending}>
              {upsertTemplate.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : "Save Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={(open) => { setPreviewOpen(open); if (!open) setPreviewType(null); }}>
        <DialogContent className="max-w-3xl w-[calc(100vw-2rem)] max-h-[90vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                <Eye className="h-4 w-4" />
                Preview — {previewTypeLabel}
              </DialogTitle>
            </div>
            {previewData && (
              <p className="text-xs text-muted-foreground mt-1">
                <span className="font-medium">Subject:</span> {previewData.subject}
              </p>
            )}
          </DialogHeader>
          <div className="flex-1 overflow-auto rounded-md border bg-white min-h-0">
            {previewLoading ? (
              <div className="flex items-center justify-center h-48 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading preview…
              </div>
            ) : previewData?.html ? (
              <iframe
                srcDoc={previewData.html}
                className="w-full h-full min-h-[500px] border-0"
                title={`Preview: ${previewTypeLabel}`}
                sandbox="allow-same-origin"
              />
            ) : (
              <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                No preview available.
              </div>
            )}
          </div>
          <DialogFooter className="shrink-0 pt-2">
            <Button variant="outline" onClick={() => { setPreviewOpen(false); setPreviewType(null); }}>
              <X className="h-4 w-4 mr-1" /> Close
            </Button>
            {previewType && (
              <Button
                onClick={() => {
                  setPreviewOpen(false);
                  setPreviewType(null);
                  openEdit(previewType);
                }}
              >
                <Pencil className="h-4 w-4 mr-1" /> Edit Template
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
