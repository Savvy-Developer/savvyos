import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertCircle, Mail } from "lucide-react";

const EXAMPLE_CONTACT = {
  first_name: "Alex",
  last_name: "Johnson",
  full_name: "Alex Johnson",
  lead_source: "Zillow",
  agent_name: "Tyler Coon",
  agent_phone: "(555) 123-4567",
};

function mergePreviewTags(value: string): string {
  return value
    .replace(/\{\{first_name\}\}/gi, EXAMPLE_CONTACT.first_name)
    .replace(/\{\{last_name\}\}/gi, EXAMPLE_CONTACT.last_name)
    .replace(/\{\{full_name\}\}/gi, EXAMPLE_CONTACT.full_name)
    .replace(/\{\{lead_source\}\}/gi, EXAMPLE_CONTACT.lead_source)
    .replace(/\{\{agent_name\}\}/gi, EXAMPLE_CONTACT.agent_name)
    .replace(/\{\{agent_phone\}\}/gi, EXAMPLE_CONTACT.agent_phone);
}

function buildPreviewHtml(body: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:24px 0;"><tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);">
      <tr><td style="padding:24px 32px 16px;border-bottom:3px solid #0fc0df;color:#183044;font-size:20px;font-weight:700;">Savvy STR Agents</td></tr>
      <tr><td style="padding:28px 32px 24px;color:#1a1a1a;font-size:15px;line-height:1.6;">${mergePreviewTags(body)}</td></tr>
      <tr><td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;"><p style="margin:0;font-size:12px;color:#9ca3af;">You are receiving this because you are a Savvy STR Agents contact. <a href="#" style="color:#6b7280;">Unsubscribe</a></p></td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

export default function EmailMessagePreviewDialog({ subject, body, onClose }: { subject: string; body: string; onClose: () => void }) {
  const resolvedSubject = mergePreviewTags(subject) || "(No subject)";
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col gap-3">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Mail className="h-4 w-4" /> Email Preview</DialogTitle></DialogHeader>
        <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground"><AlertCircle className="h-3.5 w-3.5 shrink-0" />Merge tags are filled with example contact details. Actual messages use each recipient&apos;s information.</div>
        <div className="rounded-md border bg-muted/20 px-3 py-2"><span className="mr-2 text-xs text-muted-foreground">Subject:</span><span className="text-sm font-medium">{resolvedSubject}</span></div>
        <div className="min-h-0 flex-1 overflow-hidden rounded-md border"><iframe title="Email preview" srcDoc={buildPreviewHtml(body)} className="h-[440px] w-full border-0 bg-white" sandbox="allow-popups" /></div>
        <DialogFooter><Button onClick={onClose}>Back to editing</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
