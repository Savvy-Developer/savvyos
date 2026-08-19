import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import RichEmailEditor from "@/components/RichEmailEditor";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Check,
  Eye,
  Loader2,
  Mail,
  Search,
  Send,
  UserRound,
  UsersRound,
} from "lucide-react";

type ProformaEmailComposerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId: number;
  proformaId?: number | null;
  proformaTitle: string;
  propertyLabel: string;
  summary: {
    purchasePrice: number;
    downPayment: number;
    closingCosts: number;
    loanAmount: number;
    monthlyDebtService: number;
    totalCashNeeded: number;
    adr: number;
    occupancy: number;
    bookedNights: number;
    grossRevenue: number;
    totalExpenses: number;
    noi: number;
    cashFlow: number;
    cashOnCash: number;
    capRate: number;
    dscr: number;
  };
  onSent?: () => void;
};

type RecipientMode = "contact" | "manual";

function formatCurrency(value: number): string {
  if (!Number.isFinite(value)) return "$0";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "0.0%";
  return `${(value * 100).toFixed(1)}%`;
}

function plainTextFromHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function metricRow(label: string, value: string, shaded = false): string {
  return `<tr${shaded ? ' style="background:#f8fafc;"' : ""}><td style="padding:9px 12px;border-top:1px solid #e2e8f0;color:#475569;">${label}</td><td style="padding:9px 12px;border-top:1px solid #e2e8f0;text-align:right;font-weight:600;color:#0f172a;">${value}</td></tr>`;
}

function metricTable(title: string, rows: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin:18px 0;border:1px solid #e2e8f0;font-size:14px;">
  <tr style="background:#0f766e;color:#ffffff;"><td colspan="2" style="padding:10px 12px;font-weight:700;">${title}</td></tr>
  ${rows}
</table>`;
}

function buildEmailTemplate(
  propertyLabel: string,
  proformaTitle: string,
  summary: ProformaEmailComposerProps["summary"]
): string {
  const safePropertyLabel = escapeHtml(propertyLabel || "this property");
  const safeTitle = escapeHtml(proformaTitle || "STR Investment Analysis");
  const acquisition = metricTable(
    "Acquisition & Financing",
    [
      metricRow("Purchase Price", formatCurrency(summary.purchasePrice)),
      metricRow("Down Payment", formatCurrency(summary.downPayment), true),
      metricRow("Closing Costs", formatCurrency(summary.closingCosts)),
      metricRow("Loan Amount", formatCurrency(summary.loanAmount), true),
      metricRow("Total Cash Needed", formatCurrency(summary.totalCashNeeded)),
      metricRow(
        "Monthly Debt Service",
        formatCurrency(summary.monthlyDebtService),
        true
      ),
    ].join("")
  );
  const operations = metricTable(
    "Base-Case STR Operating Assumptions",
    [
      metricRow("Average Daily Rate", formatCurrency(summary.adr)),
      metricRow("Occupancy", formatPercent(summary.occupancy), true),
      metricRow(
        "Projected Booked Nights",
        new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
          summary.bookedNights
        )
      ),
      metricRow(
        "Projected Annual Revenue",
        formatCurrency(summary.grossRevenue),
        true
      ),
      metricRow(
        "Projected Annual Expenses",
        formatCurrency(summary.totalExpenses)
      ),
    ].join("")
  );
  const returns = metricTable(
    "Base-Case Investment Returns",
    [
      metricRow("Projected Annual NOI", formatCurrency(summary.noi)),
      metricRow(
        "Projected Annual Cash Flow",
        formatCurrency(summary.cashFlow),
        true
      ),
      metricRow("Cash-on-Cash Return", formatPercent(summary.cashOnCash)),
      metricRow("Cap Rate", formatPercent(summary.capRate), true),
      metricRow(
        "Debt Service Coverage Ratio",
        Number.isFinite(summary.dscr) ? summary.dscr.toFixed(2) + "x" : "N/A"
      ),
    ].join("")
  );
  return `<p>Hello,</p>
<p>I wanted to share the proforma for <strong>${safePropertyLabel}</strong>.</p>
<p><strong>${safeTitle}</strong></p>
<p style="margin:0;color:#475569;font-size:13px;">The complete unbranded base-case analysis is included below for easy review—there is no attachment required.</p>
${acquisition}
${operations}
${returns}
<p>These preliminary projections are based on the assumptions summarized above and should be reviewed as part of your due diligence. I would be happy to walk through the details and answer any questions.</p>
<p>Best,</p>`;
}

export default function ProformaEmailComposer({
  open,
  onOpenChange,
  propertyId,
  proformaId,
  proformaTitle,
  propertyLabel,
  summary,
  onSent,
}: ProformaEmailComposerProps) {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [recipientMode, setRecipientMode] = useState<RecipientMode>("contact");
  const [contactSearch, setContactSearch] = useState("");
  const [selectedContact, setSelectedContact] = useState<{
    id: number;
    firstName: string | null;
    lastName: string | null;
    email: string;
  } | null>(null);
  const [manualEmail, setManualEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [htmlBody, setHtmlBody] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);

  const defaultSubject = `Proforma: ${propertyLabel || proformaTitle || "STR Investment Analysis"}`;
  const defaultBody = useMemo(
    () => buildEmailTemplate(propertyLabel, proformaTitle, summary),
    [
      propertyLabel,
      proformaTitle,
      summary.purchasePrice,
      summary.totalCashNeeded,
      summary.downPayment,
      summary.closingCosts,
      summary.loanAmount,
      summary.monthlyDebtService,
      summary.adr,
      summary.occupancy,
      summary.bookedNights,
      summary.grossRevenue,
      summary.totalExpenses,
      summary.noi,
      summary.cashFlow,
      summary.cashOnCash,
      summary.capRate,
    ]
  );
  const { data: myProfile, isLoading: profileLoading } =
    trpc.users.getMyCoreProfile.useQuery(undefined, { enabled: open });
  const { data: contactResult, isLoading: contactsLoading } =
    trpc.contacts.list.useQuery(
      {
        search: contactSearch.trim() || undefined,
        page: 1,
        limit: 12,
        sortOrder: "desc",
      },
      { enabled: open && recipientMode === "contact" }
    );

  const eligibleContacts = useMemo(
    () =>
      (contactResult?.rows ?? [])
        .map((row: any) => row.contact ?? row)
        .filter(
          (contact: any) =>
            Boolean(contact?.email?.trim()) && !contact?.doNotContact
        )
        .map((contact: any) => ({
          id: Number(contact.id),
          firstName: contact.firstName ?? null,
          lastName: contact.lastName ?? null,
          email: String(contact.email).trim(),
        })),
    [contactResult]
  );
  const hasEmailSignature =
    plainTextFromHtml(myProfile?.emailSignatureHtml ?? "").length > 0;
  const recipientReady =
    recipientMode === "contact"
      ? Boolean(selectedContact)
      : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(manualEmail.trim());
  const canSubmit =
    !profileLoading &&
    hasEmailSignature &&
    recipientReady &&
    subject.trim().length > 0 &&
    plainTextFromHtml(htmlBody).length > 0;
  const selectedContactName = selectedContact
    ? [selectedContact.firstName, selectedContact.lastName]
        .filter(Boolean)
        .join(" ") || selectedContact.email
    : "";

  useEffect(() => {
    if (!open) {
      setPreviewOpen(false);
      return;
    }
    setRecipientMode("contact");
    setContactSearch("");
    setSelectedContact(null);
    setManualEmail("");
    setSubject(defaultSubject);
    setHtmlBody(defaultBody);
  }, [open, defaultSubject, defaultBody]);

  const sendEmail = trpc.proformaEmail.send.useMutation({
    onSuccess: result => {
      toast.success(`Proforma email sent to ${result.recipientEmail}.`);
      utils.communications.list.invalidate();
      utils.contacts.list.invalidate();
      onOpenChange(false);
      onSent?.();
    },
    onError: error => toast.error(error.message),
  });

  function chooseContact(contact: {
    id: number;
    firstName: string | null;
    lastName: string | null;
    email: string;
  }) {
    setSelectedContact(contact);
    setContactSearch("");
  }

  function submit() {
    if (!canSubmit) return;
    sendEmail.mutate({
      recipient:
        recipientMode === "contact" && selectedContact
          ? { kind: "contact", contactId: selectedContact.id }
          : { kind: "manual", email: manualEmail.trim() },
      subject: subject.trim(),
      htmlBody,
      propertyId,
      proformaId: proformaId ?? undefined,
      proformaTitle: proformaTitle.trim() || "STR Investment Analysis",
    });
  }

  const recipientPreview =
    recipientMode === "contact"
      ? selectedContact
        ? `${selectedContactName} <${selectedContact.email}>`
        : "Select a SavvyOS contact"
      : manualEmail.trim() || "Enter an email address";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-5xl max-h-[96vh] overflow-x-hidden overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" /> Email Proforma
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-1">
            <div className="rounded-lg border bg-muted/30 px-3 py-2.5 text-sm">
              This editable, unbranded HTML proforma includes the full base-case
              investment snapshot for{" "}
              <strong>{propertyLabel || "this property"}</strong>. Recipients
              can review it directly in the email; your saved Email Signature is
              appended automatically when it is sent.
            </div>

            {!profileLoading && !hasEmailSignature && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950 flex flex-wrap items-center justify-between gap-2">
                <span>
                  <strong>Email Signature required.</strong> Save your personal
                  signature in My Profile before sending.
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="border-amber-300 bg-white hover:bg-amber-100"
                  onClick={() => {
                    onOpenChange(false);
                    window.location.href = "/profile";
                  }}
                >
                  Set Email Signature
                </Button>
              </div>
            )}

            <div>
              <Label>Recipient</Label>
              <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Button
                  type="button"
                  variant={recipientMode === "contact" ? "default" : "outline"}
                  className="justify-start"
                  onClick={() => setRecipientMode("contact")}
                >
                  <UsersRound className="mr-2 h-4 w-4" /> Select a SavvyOS
                  contact
                </Button>
                <Button
                  type="button"
                  variant={recipientMode === "manual" ? "default" : "outline"}
                  className="justify-start"
                  onClick={() => setRecipientMode("manual")}
                >
                  <UserRound className="mr-2 h-4 w-4" /> Enter an email address
                </Button>
              </div>

              {recipientMode === "contact" ? (
                <div className="mt-3 rounded-lg border">
                  {selectedContact ? (
                    <div className="flex flex-wrap items-center justify-between gap-3 p-3">
                      <div className="min-w-0">
                        <p className="font-medium truncate">
                          {selectedContactName}
                        </p>
                        <p className="text-sm text-muted-foreground truncate">
                          {selectedContact.email}
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedContact(null)}
                      >
                        Change
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="relative border-b">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={contactSearch}
                          onChange={event =>
                            setContactSearch(event.target.value)
                          }
                          className="border-0 pl-9 shadow-none focus-visible:ring-0"
                          placeholder="Search contacts by name or email"
                          autoComplete="off"
                        />
                      </div>
                      <div className="max-h-48 overflow-y-auto p-1.5">
                        {contactsLoading ? (
                          <p className="p-2 text-sm text-muted-foreground">
                            Searching contacts…
                          </p>
                        ) : eligibleContacts.length > 0 ? (
                          eligibleContacts.map(contact => {
                            const name =
                              [contact.firstName, contact.lastName]
                                .filter(Boolean)
                                .join(" ") || contact.email;
                            return (
                              <button
                                key={contact.id}
                                type="button"
                                onClick={() => chooseContact(contact)}
                                className="flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left hover:bg-muted"
                              >
                                <span className="min-w-0">
                                  <span className="block truncate text-sm font-medium">
                                    {name}
                                  </span>
                                  <span className="block truncate text-xs text-muted-foreground">
                                    {contact.email}
                                  </span>
                                </span>
                                <Check className="h-4 w-4 shrink-0 text-muted-foreground" />
                              </button>
                            );
                          })
                        ) : (
                          <p className="p-2 text-sm text-muted-foreground">
                            No email-eligible contacts found. Try a different
                            search or enter an email address instead.
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="mt-3">
                  <Label htmlFor="proforma-manual-email" className="sr-only">
                    Email address
                  </Label>
                  <Input
                    id="proforma-manual-email"
                    type="email"
                    value={manualEmail}
                    onChange={event => setManualEmail(event.target.value)}
                    placeholder="name@example.com"
                    autoComplete="email"
                  />
                  {manualEmail && !recipientReady && (
                    <p className="mt-1.5 text-xs text-destructive">
                      Enter a valid email address.
                    </p>
                  )}
                </div>
              )}
            </div>

            <div>
              <Label htmlFor="proforma-email-subject">Subject</Label>
              <Input
                id="proforma-email-subject"
                className="mt-1"
                value={subject}
                maxLength={512}
                onChange={event => setSubject(event.target.value)}
                placeholder="Email subject"
              />
            </div>

            <div>
              <Label>Message</Label>
              <div className="mt-1">
                <RichEmailEditor
                  value={htmlBody}
                  onChange={setHtmlBody}
                  placeholder="Write your proforma message…"
                />
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                You can adjust any part of the pre-filled proforma summary
                before sending.
              </p>
            </div>

            <div className="space-y-1 border-t pt-3 text-xs text-muted-foreground">
              <p>
                <strong className="text-foreground">From:</strong>{" "}
                {user?.name || "Your SavvyOS name"} via Savvy STR Agents
              </p>
              <p>
                <strong className="text-foreground">Reply-to:</strong>{" "}
                {user?.email || "Your SavvyOS login email"}
              </p>
              <p>
                Your saved Email Signature is included beneath the proforma in
                the delivered message.
              </p>
            </div>
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={sendEmail.isPending}
            >
              Cancel
            </Button>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setPreviewOpen(true)}
                disabled={!subject.trim() || !plainTextFromHtml(htmlBody)}
              >
                <Eye className="mr-1.5 h-4 w-4" /> Preview
              </Button>
              <Button
                onClick={submit}
                disabled={!canSubmit || sendEmail.isPending}
              >
                {sendEmail.isPending ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-1.5 h-4 w-4" />
                )}
                {sendEmail.isPending ? "Sending…" : "Send Proforma"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-4xl max-h-[96vh] overflow-x-hidden overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Proforma Email Preview</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              <p>
                <span className="font-medium">To:</span> {recipientPreview}
              </p>
              <p className="mt-1 break-words">
                <span className="font-medium">From:</span>{" "}
                {user?.name || "Your SavvyOS name"} via Savvy STR Agents
              </p>
              <p className="mt-1 break-words">
                <span className="font-medium">Reply-to:</span>{" "}
                {user?.email || "Your SavvyOS login email"}
              </p>
              <p className="mt-1 break-words">
                <span className="font-medium">Subject:</span>{" "}
                {subject || "(No subject)"}
              </p>
            </div>
            <article className="min-h-64 overflow-x-auto rounded-lg border bg-background p-4 sm:p-6">
              <div
                className="prose prose-sm max-w-none break-words dark:prose-invert"
                dangerouslySetInnerHTML={{ __html: htmlBody }}
              />
              {myProfile?.emailSignatureHtml && (
                <div
                  className="prose prose-sm mt-6 max-w-none border-t pt-4 break-words dark:prose-invert"
                  dangerouslySetInnerHTML={{
                    __html: myProfile.emailSignatureHtml,
                  }}
                />
              )}
            </article>
          </div>
          <DialogFooter>
            <Button onClick={() => setPreviewOpen(false)}>
              Back to Editing
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
