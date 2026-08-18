import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import RichEmailEditor from "@/components/RichEmailEditor";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, CheckCircle2, Mail, MessageSquare, Send, Users, X } from "lucide-react";

type TriggerType = "lead_source" | "buyer_under_contract" | "seller_under_contract" | "new_listing" | "buyer_closed" | "seller_closed";
type Channel = "email" | "sms";
type LeadSource = { id: number; name: string; parentId: number | null };

const TRIGGERS: Array<{ value: TriggerType; label: string; audienceLabel: string }> = [
  { value: "lead_source", label: "Lead Source", audienceLabel: "contacts from the selected lead source" },
  { value: "buyer_under_contract", label: "Buyer Goes Under Contract", audienceLabel: "current buyer contacts with an under-contract transaction" },
  { value: "seller_under_contract", label: "Seller Goes Under Contract", audienceLabel: "current seller contacts with an under-contract transaction" },
  { value: "new_listing", label: "New Listing", audienceLabel: "current listing contacts" },
  { value: "buyer_closed", label: "Buyer Transaction Closed", audienceLabel: "current buyer contacts with a closed transaction" },
  { value: "seller_closed", label: "Seller Transaction Closed", audienceLabel: "current seller contacts with a closed transaction" },
];

function sendLabel(channel: Channel) {
  return channel === "email" ? "email" : "text message";
}

export default function OneTimeSmartPlanSendDialog({ onClose }: { onClose: () => void }) {
  const { data: sourceRows = [] } = trpc.leadSources.list.useQuery();
  const [channel, setChannel] = useState<Channel>("email");
  const [name, setName] = useState("One-time email");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [triggerType, setTriggerType] = useState<TriggerType>("lead_source");
  const [triggerLeadSourceIds, setTriggerLeadSourceIds] = useState<number[]>([]);
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewRequested, setReviewRequested] = useState(false);
  const isLeadSourceTrigger = triggerType === "lead_source";
  const selectedTrigger = TRIGGERS.find((trigger) => trigger.value === triggerType) ?? TRIGGERS[0];
  const leadSources = (sourceRows as any[]).map((row) => ({ id: row.ls?.id ?? row.id, name: row.ls?.name ?? row.name, parentId: row.ls?.parentId ?? row.parentId ?? null })) as LeadSource[];
  const selectedSources = triggerLeadSourceIds.map((id) => leadSources.find((source) => source.id === id)).filter(Boolean) as LeadSource[];

  const formIsComplete = !!name.trim() && !!body.trim() && (channel === "sms" || !!subject.trim()) && (!isLeadSourceTrigger || triggerLeadSourceIds.length > 0) && (channel === "email" || body.length <= 160);
  const previewInput = useMemo(() => ({
    name: name.trim() || "One-time send",
    channel,
    subject: channel === "email" ? subject.trim() || null : null,
    body: body || " ",
    triggerType,
    triggerLeadSourceIds: isLeadSourceTrigger ? triggerLeadSourceIds : null,
  }), [name, channel, subject, body, triggerType, isLeadSourceTrigger, triggerLeadSourceIds]);
  const preview = trpc.smartPlans.oneTimeSends.preview.useQuery(previewInput, { enabled: reviewRequested && formIsComplete });
  const queueSend = trpc.smartPlans.oneTimeSends.queue.useMutation({
    onSuccess: (result) => {
      toast.success(`${result.totalRecipients.toLocaleString()} ${sendLabel(channel)} recipient${result.totalRecipients === 1 ? "" : "s"} queued for delivery`);
      onClose();
    },
    onError: (error) => toast.error(error.message),
  });

  const resetReview = () => {
    setReviewRequested(false);
    setIsReviewing(false);
  };

  const changeChannel = (value: Channel) => {
    setChannel(value);
    setName((current) => current === "One-time email" || current === "One-time text" ? `One-time ${value === "email" ? "email" : "text"}` : current);
    resetReview();
  };

  const reviewAudience = () => {
    if (!formIsComplete) {
      if (channel === "sms" && body.length > 160) return toast.error("Text messages are limited to 160 characters");
      if (isLeadSourceTrigger && !triggerLeadSourceIds.length) return toast.error("Choose at least one lead source");
      return toast.error(channel === "email" && !subject.trim() ? "An email subject is required" : "Complete the message details first");
    }
    setReviewRequested(true);
    setIsReviewing(true);
  };

  const confirmSend = () => {
    if (!preview.data?.eligibleCount) return;
    queueSend.mutate({ ...previewInput, confirmed: true });
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Send className="h-5 w-5 text-primary" /> One Time Send</DialogTitle>
          <DialogDescription>{isReviewing ? "Review the audience and confirm before any messages are queued." : "Compose one email or text blast using the same Smart Plan trigger audiences."}</DialogDescription>
        </DialogHeader>

        {!isReviewing ? <div className="space-y-5 py-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label>Message name</Label><Input value={name} onChange={(event) => { setName(event.target.value); resetReview(); }} placeholder="e.g. Under-contract buyer reminder" /></div>
            <div className="space-y-2"><Label>Channel</Label><Select value={channel} onValueChange={(value) => changeChannel(value as Channel)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="email"><span className="flex items-center gap-2"><Mail className="h-3.5 w-3.5" /> Email</span></SelectItem><SelectItem value="sms"><span className="flex items-center gap-2"><MessageSquare className="h-3.5 w-3.5" /> Text message</span></SelectItem></SelectContent></Select></div>
          </div>

          <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
            <div><Label>Audience trigger</Label><p className="mt-1 text-xs text-muted-foreground">Choose the same current-contact audience used by Smart Plans.</p></div>
            <Select value={triggerType} onValueChange={(value) => { setTriggerType(value as TriggerType); resetReview(); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TRIGGERS.map((trigger) => <SelectItem key={trigger.value} value={trigger.value}>{trigger.label}</SelectItem>)}</SelectContent></Select>
            {isLeadSourceTrigger && <div className="space-y-2 pt-1"><Label>Lead sources</Label><Select value="" onValueChange={(value) => { const id = Number(value); if (id && !triggerLeadSourceIds.includes(id)) { setTriggerLeadSourceIds((current) => [...current, id]); resetReview(); } }}><SelectTrigger><SelectValue placeholder="Add a lead source..." /></SelectTrigger><SelectContent>{leadSources.filter((source) => !triggerLeadSourceIds.includes(source.id)).map((source) => <SelectItem key={source.id} value={String(source.id)}>{source.parentId ? `    ${source.name}` : source.name}</SelectItem>)}</SelectContent></Select><div className="flex flex-wrap gap-2">{selectedSources.map((source) => <Badge key={source.id} variant="secondary" className="gap-1.5 py-1">{source.name}<button type="button" aria-label={`Remove ${source.name}`} className="ml-0.5 text-muted-foreground hover:text-destructive" onClick={() => { setTriggerLeadSourceIds((current) => current.filter((id) => id !== source.id)); resetReview(); }}><X className="h-3 w-3" /></button></Badge>)}</div></div>}
            <p className="text-xs text-muted-foreground">This blast will target {selectedTrigger.audienceLabel}.</p>
          </div>

          {channel === "email" ? <><div className="space-y-2"><Label>Email subject <span className="text-destructive">*</span></Label><Input value={subject} onChange={(event) => { setSubject(event.target.value); resetReview(); }} placeholder="A concise, recipient-friendly subject" /></div><div className="space-y-2"><Label>Email content <span className="text-destructive">*</span></Label><RichEmailEditor value={body} onChange={(value) => { setBody(value); resetReview(); }} placeholder="Write the email recipients will receive..." /></div></> : <div className="space-y-2"><div className="flex items-center justify-between"><Label>Text message <span className="text-destructive">*</span></Label><span className="text-xs text-muted-foreground">{body.length}/160</span></div><Textarea value={body} maxLength={160} rows={5} onChange={(event) => { setBody(event.target.value); resetReview(); }} placeholder="Write the text message recipients will receive..." /></div>}
          <div className="flex flex-wrap items-center gap-1.5"><span className="mr-1 text-xs text-muted-foreground">Insert:</span>{["{{first_name}}", "{{last_name}}", "{{full_name}}", "{{lead_source}}"].map((tag) => <button key={tag} type="button" className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[11px] text-primary hover:bg-primary/20" onClick={() => { setBody((current) => `${current}${tag}`); resetReview(); }}>{tag}</button>)}</div>
          {channel === "sms" && <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><AlertTriangle className="h-4 w-4 shrink-0" /><p>Text sends use the configured calling and messaging provider. Contacts without a phone number or marked Do Not Contact are excluded before delivery.</p></div>}
        </div> : <div className="space-y-5 py-2">
          <div className="rounded-lg border border-primary/20 bg-primary/[0.03] p-4"><p className="text-sm font-medium">{name}</p><p className="mt-1 text-xs text-muted-foreground">{channel === "email" ? `Email: ${subject}` : "Text message"} · {selectedTrigger.label}</p></div>
          {preview.isLoading ? <div className="py-10 text-center text-sm text-muted-foreground">Checking the current audience...</div> : preview.error ? <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{preview.error.message}</div> : preview.data ? <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-lg border p-4"><p className="text-xs text-muted-foreground">Matching contacts</p><p className="mt-1 text-2xl font-semibold">{preview.data.matchingCount.toLocaleString()}</p></div><div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-4"><p className="text-xs text-emerald-700">Eligible recipients</p><p className="mt-1 text-2xl font-semibold text-emerald-800">{preview.data.eligibleCount.toLocaleString()}</p></div><div className="rounded-lg border p-4"><p className="text-xs text-muted-foreground">Excluded</p><p className="mt-1 text-2xl font-semibold">{preview.data.excludedCount.toLocaleString()}</p></div></div> : null}
          {preview.data?.eligibleCount ? <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" /><p><strong>Final confirmation:</strong> queue this one-time {sendLabel(channel)} send to <strong>{preview.data.eligibleCount.toLocaleString()}</strong> eligible recipient{preview.data.eligibleCount === 1 ? "" : "s"}. Delivery begins immediately and continues safely in the background.</p></div> : null}
        </div>}

        <DialogFooter>{!isReviewing ? <><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={reviewAudience}><Users className="mr-1.5 h-4 w-4" /> Review audience</Button></> : <><Button variant="outline" onClick={() => { setIsReviewing(false); setReviewRequested(false); }}><ArrowLeft className="mr-1.5 h-4 w-4" /> Back to edit</Button><Button disabled={!preview.data?.eligibleCount || queueSend.isPending} onClick={confirmSend} className="bg-emerald-600 hover:bg-emerald-700"><CheckCircle2 className="mr-1.5 h-4 w-4" />{queueSend.isPending ? "Queueing..." : `Queue ${preview.data?.eligibleCount?.toLocaleString() ?? 0} recipients`}</Button></>}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
