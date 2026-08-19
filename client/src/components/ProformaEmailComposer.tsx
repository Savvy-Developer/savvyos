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
    propertyPhotoUrl?: string | null;
    propertyMeta?: string;
    propertyLink?: string | null;
    purchasePrice: number;
    downPayment: number;
    closingCosts: number;
    furnishing: number;
    renovation: number;
    startupAndInspection: number;
    sellerCredit: number;
    loanType: string;
    loanAmount: number;
    interestRate: number;
    loanTermYears: number;
    monthlyDebtService: number;
    annualDebtService: number;
    totalCashNeeded: number;
    adr: number;
    occupancy: number;
    bookedNights: number;
    grossRevenue: number;
    netRevenue: number;
    platformFees: number;
    fixedExpenses: number;
    variableExpenses: number;
    totalExpenses: number;
    noi: number;
    cashFlow: number;
    cashOnCash: number;
    cashOnCashWithTax: number;
    capRate: number;
    dscr: number;
    netTaxBenefit: number;
    breakEvenOccupancy: number;
    scenarios: Array<{
      label: string;
      adr: number;
      occupancy: number;
      soldNights: number;
      grossRevenue: number;
      netRevenue: number;
      noi: number;
      cashFlow: number;
      cashOnCash: number;
      capRate: number;
      dscr: number;
    }>;
    fiveYear: Array<{
      year: number;
      revenue: number;
      cashFlow: number;
      propertyValue: number;
      equity: number;
    }>;
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

const SAVVY_LOGO_URL =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663374872019/RGtcxHR8RPxZsqyxZLCcuq/savvy-logo_c97e2154.png";
const EMAIL_TEAL = "#0d6f74";
const EMAIL_AQUA = "#e8f8f7";
const EMAIL_INK = "#172033";
const EMAIL_MUTED = "#617085";
const EMAIL_BORDER = "#dbe4ea";

type Summary = ProformaEmailComposerProps["summary"];

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
    Number.isFinite(value) ? value : 0
  );
}

function formatDscr(value: number): string {
  return Number.isFinite(value) ? `${value.toFixed(2)}x` : "N/A";
}

function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function metricRow(label: string, value: string, emphasis = false): string {
  return `<tr><td style="padding:8px 0;border-bottom:1px solid ${EMAIL_BORDER};color:${EMAIL_MUTED};font-size:12px;line-height:17px;">${escapeHtml(label)}</td><td style="padding:8px 0 8px 12px;border-bottom:1px solid ${EMAIL_BORDER};text-align:right;color:${emphasis ? EMAIL_TEAL : EMAIL_INK};font-weight:${emphasis ? "700" : "600"};font-size:12px;line-height:17px;white-space:nowrap;">${escapeHtml(value)}</td></tr>`;
}

function detailCard(title: string, rows: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:separate;border-spacing:0;border:1px solid ${EMAIL_BORDER};border-radius:10px;background:#ffffff;overflow:hidden;"><tr><td style="padding:13px 15px 8px;color:${EMAIL_TEAL};font-size:14px;line-height:18px;font-weight:700;text-align:center;">${escapeHtml(title)}</td></tr><tr><td style="padding:0 15px 8px;"><table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">${rows}</table></td></tr></table>`;
}

function kpiCard(label: string, value: string, accent = false): string {
  return `<td width="33.333%" valign="top" style="padding:4px;"><table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:separate;border-spacing:0;border:1px solid ${EMAIL_BORDER};border-radius:7px;background:${accent ? "#f3fbfb" : "#ffffff"};"><tr><td style="padding:10px 7px;text-align:center;"><div style="color:${EMAIL_MUTED};font-size:9px;line-height:12px;font-weight:700;letter-spacing:.35px;text-transform:uppercase;">${escapeHtml(label)}</div><div style="margin-top:4px;color:${accent ? EMAIL_TEAL : EMAIL_INK};font-size:15px;line-height:19px;font-weight:800;">${escapeHtml(value)}</div></td></tr></table></td>`;
}

function scenarioRow(
  scenario: Summary["scenarios"][number],
  emphasized = false
): string {
  const background = emphasized ? ` background:${EMAIL_AQUA};` : "";
  return `<tr style="${background}"><td style="padding:9px 7px;border-bottom:1px solid ${EMAIL_BORDER};font-size:11px;color:${EMAIL_INK};font-weight:${emphasized ? "700" : "600"};">${escapeHtml(scenario.label)}</td><td style="padding:9px 5px;border-bottom:1px solid ${EMAIL_BORDER};text-align:right;font-size:11px;color:${EMAIL_INK};">${escapeHtml(formatCurrency(scenario.grossRevenue))}</td><td style="padding:9px 5px;border-bottom:1px solid ${EMAIL_BORDER};text-align:right;font-size:11px;color:${scenario.cashFlow >= 0 ? EMAIL_TEAL : "#b42318"};font-weight:700;">${escapeHtml(formatCurrency(scenario.cashFlow))}</td><td style="padding:9px 5px;border-bottom:1px solid ${EMAIL_BORDER};text-align:right;font-size:11px;color:${EMAIL_INK};">${escapeHtml(formatPercent(scenario.cashOnCash))}</td><td style="padding:9px 5px;border-bottom:1px solid ${EMAIL_BORDER};text-align:right;font-size:11px;color:${EMAIL_INK};">${escapeHtml(formatDscr(scenario.dscr))}</td></tr>`;
}

export function buildEmailTemplate(
  propertyLabel: string,
  proformaTitle: string,
  summary: Summary
): string {
  const safePropertyLabel = escapeHtml(propertyLabel || "this property");
  const safeTitle = escapeHtml(proformaTitle || "STR Investment Analysis");
  const propertyPhoto = safeHttpUrl(summary.propertyPhotoUrl);
  const propertyLink = safeHttpUrl(summary.propertyLink);
  const propertyMeta = escapeHtml(
    summary.propertyMeta || "Short-term rental investment analysis"
  );
  const baseScenario =
    summary.scenarios.find(scenario => scenario.label === "Base Case") ??
    summary.scenarios[1] ??
    summary.scenarios[0];
  const investmentNarrative = `${safePropertyLabel} is modeled as a short-term rental investment with ${formatCurrency(summary.totalCashNeeded)} total cash needed. The base case projects ${formatCurrency(summary.cashFlow)} in annual cash flow, a ${formatPercent(summary.cashOnCash)} cash-on-cash return, and a ${formatDscr(summary.dscr)} debt-service coverage ratio.`;
  const logoHeader = `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;"><tr><td style="padding:0 0 12px;border-bottom:2px solid #23a6af;"><img src="${SAVVY_LOGO_URL}" width="112" alt="Savvy STR Agents" style="display:block;width:112px;height:auto;border:0;outline:none;text-decoration:none;" /></td></tr></table>`;
  const hero = propertyPhoto
    ? `<tr><td style="padding:16px 0 0;"><img src="${escapeHtml(propertyPhoto)}" width="640" alt="${safePropertyLabel}" style="display:block;width:100%;max-width:640px;height:auto;border:0;border-radius:12px;" /></td></tr>`
    : "";
  const notableNumbers = `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:separate;border-spacing:0;border:1px solid #b6e5e2;border-radius:11px;background:#f5fcfc;"><tr><td style="padding:14px 12px 8px;color:${EMAIL_TEAL};font-size:17px;line-height:21px;font-weight:800;">Notable Numbers<div style="margin-top:2px;color:${EMAIL_MUTED};font-size:10px;line-height:13px;font-weight:500;">Based on the Base Case Scenario</div></td></tr><tr><td style="padding:0 8px 10px;"><table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;"><tr>${kpiCard("Gross Revenue", formatCurrency(summary.grossRevenue))}${kpiCard("Annual Cash Flow", formatCurrency(summary.cashFlow), true)}${kpiCard("Cash-on-Cash", formatPercent(summary.cashOnCash))}</tr><tr>${kpiCard("Cap Rate", formatPercent(summary.capRate))}${kpiCard("DSCR", formatDscr(summary.dscr), true)}${kpiCard("Net Tax Benefit", formatCurrency(summary.netTaxBenefit), true)}</tr></table></td></tr></table>`;
  const acquisition = detailCard(
    "Acquisition & Cash to Close",
    [
      metricRow("Purchase price", formatCurrency(summary.purchasePrice)),
      metricRow("Down payment", formatCurrency(summary.downPayment)),
      metricRow("Closing costs", formatCurrency(summary.closingCosts)),
      metricRow("Furnishing", formatCurrency(summary.furnishing)),
      metricRow("Renovation", formatCurrency(summary.renovation)),
      metricRow(
        "Startup & inspection",
        formatCurrency(summary.startupAndInspection)
      ),
      ...(summary.sellerCredit > 0
        ? [
            metricRow(
              "Seller credit",
              `-${formatCurrency(summary.sellerCredit)}`,
              true
            ),
          ]
        : []),
      metricRow(
        "Total cash needed",
        formatCurrency(summary.totalCashNeeded),
        true
      ),
    ].join("")
  );
  const financing = detailCard(
    "Financing Summary",
    [
      metricRow("Loan type", summary.loanType),
      metricRow("Loan amount", formatCurrency(summary.loanAmount)),
      metricRow("Interest rate", formatPercent(summary.interestRate)),
      metricRow("Loan term", `${formatNumber(summary.loanTermYears)} years`),
      metricRow(
        "Monthly debt payment",
        formatCurrency(summary.monthlyDebtService)
      ),
      metricRow(
        "Annual debt service",
        formatCurrency(summary.annualDebtService),
        true
      ),
    ].join("")
  );
  const operating = detailCard(
    "Base Case Operating Detail",
    [
      metricRow("Average daily rate", formatCurrency(summary.adr)),
      metricRow("Occupancy", formatPercent(summary.occupancy)),
      metricRow("Sold nights", formatNumber(summary.bookedNights)),
      metricRow("Gross revenue", formatCurrency(summary.grossRevenue)),
      metricRow("Platform fees", formatCurrency(summary.platformFees)),
      metricRow("Net revenue", formatCurrency(summary.netRevenue)),
      metricRow(
        "Total operating expenses",
        formatCurrency(summary.totalExpenses)
      ),
      metricRow("Projected NOI", formatCurrency(summary.noi), true),
      metricRow(
        "Projected annual cash flow",
        formatCurrency(summary.cashFlow),
        true
      ),
    ].join("")
  );
  const expenseMix = detailCard(
    "Annual Expense Mix",
    [
      metricRow("Debt service", formatCurrency(summary.annualDebtService)),
      metricRow("Fixed expenses", formatCurrency(summary.fixedExpenses)),
      metricRow("Variable expenses", formatCurrency(summary.variableExpenses)),
      metricRow("Platform fees", formatCurrency(summary.platformFees)),
    ].join("")
  );
  const scenarioComparison = summary.scenarios.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:separate;border-spacing:0;border:1px solid ${EMAIL_BORDER};border-radius:10px;overflow:hidden;background:#ffffff;"><tr><td style="padding:13px 14px 8px;color:${EMAIL_TEAL};font-size:15px;line-height:19px;font-weight:800;">Scenario Comparison</td></tr><tr><td style="padding:0 7px 10px;"><table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;"><tr style="background:${EMAIL_TEAL};"><th align="left" style="padding:8px 7px;color:#ffffff;font-size:10px;">Scenario</th><th align="right" style="padding:8px 5px;color:#ffffff;font-size:10px;">Revenue</th><th align="right" style="padding:8px 5px;color:#ffffff;font-size:10px;">Cash Flow</th><th align="right" style="padding:8px 5px;color:#ffffff;font-size:10px;">CoC</th><th align="right" style="padding:8px 5px;color:#ffffff;font-size:10px;">DSCR</th></tr>${summary.scenarios.map(scenario => scenarioRow(scenario, scenario === baseScenario)).join("")}</table></td></tr></table>`
    : "";
  const fiveYear = summary.fiveYear.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:separate;border-spacing:0;border:1px solid ${EMAIL_BORDER};border-radius:10px;overflow:hidden;background:#ffffff;"><tr><td style="padding:13px 14px 8px;color:${EMAIL_TEAL};font-size:15px;line-height:19px;font-weight:800;">5-Year Growth Outlook</td></tr><tr><td style="padding:0 7px 10px;"><table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;"><tr style="background:${EMAIL_TEAL};"><th align="left" style="padding:8px 7px;color:#ffffff;font-size:10px;">Year</th><th align="right" style="padding:8px 5px;color:#ffffff;font-size:10px;">Revenue</th><th align="right" style="padding:8px 5px;color:#ffffff;font-size:10px;">Cash Flow</th><th align="right" style="padding:8px 5px;color:#ffffff;font-size:10px;">Property Value</th><th align="right" style="padding:8px 5px;color:#ffffff;font-size:10px;">Equity</th></tr>${summary.fiveYear
        .slice(0, 5)
        .map(
          (year, index) =>
            `<tr style="${index % 2 ? `background:#f8fafc;` : ""}"><td style="padding:8px 7px;border-bottom:1px solid ${EMAIL_BORDER};font-size:11px;color:${EMAIL_INK};font-weight:700;">Year ${escapeHtml(String(year.year))}</td><td style="padding:8px 5px;border-bottom:1px solid ${EMAIL_BORDER};text-align:right;font-size:11px;">${escapeHtml(formatCurrency(year.revenue))}</td><td style="padding:8px 5px;border-bottom:1px solid ${EMAIL_BORDER};text-align:right;font-size:11px;color:${year.cashFlow >= 0 ? EMAIL_TEAL : "#b42318"};font-weight:700;">${escapeHtml(formatCurrency(year.cashFlow))}</td><td style="padding:8px 5px;border-bottom:1px solid ${EMAIL_BORDER};text-align:right;font-size:11px;">${escapeHtml(formatCurrency(year.propertyValue))}</td><td style="padding:8px 5px;border-bottom:1px solid ${EMAIL_BORDER};text-align:right;font-size:11px;font-weight:700;">${escapeHtml(formatCurrency(year.equity))}</td></tr>`
        )
        .join("")}</table></td></tr></table>`
    : "";
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;background:#ffffff;"><tr><td align="center" style="padding:0;"><table role="presentation" cellpadding="0" cellspacing="0" width="680" style="width:100%;max-width:680px;border-collapse:collapse;background:#ffffff;"><tr><td style="padding:24px 20px 8px;">${logoHeader}</td></tr><tr><td style="padding:8px 20px 0;"><div style="color:${EMAIL_TEAL};font-size:25px;line-height:30px;font-weight:800;">${safeTitle}</div><div style="margin-top:4px;color:${EMAIL_INK};font-size:14px;line-height:19px;font-weight:600;">${safePropertyLabel}</div><div style="margin-top:2px;color:${EMAIL_MUTED};font-size:12px;line-height:17px;">${propertyMeta}</div></td></tr>${hero}<tr><td style="padding:18px 20px 0;">${notableNumbers}</td></tr><tr><td style="padding:16px 20px 0;"><table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:separate;border-spacing:0;border:1px solid #b6e5e2;border-radius:10px;background:#f5fcfc;"><tr><td style="padding:14px 15px;"><div style="color:${EMAIL_TEAL};font-size:14px;line-height:18px;font-weight:800;">Investment Analysis</div><div style="margin-top:5px;color:${EMAIL_INK};font-size:12px;line-height:18px;">${investmentNarrative}</div></td></tr></table></td></tr><tr><td style="padding:16px 20px 0;"><table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;"><tr><td width="50%" valign="top" style="padding:0 6px 0 0;">${acquisition}</td><td width="50%" valign="top" style="padding:0 0 0 6px;">${financing}</td></tr></table></td></tr><tr><td style="padding:16px 20px 0;">${scenarioComparison}</td></tr><tr><td style="padding:16px 20px 0;">${fiveYear}</td></tr><tr><td style="padding:16px 20px 0;"><table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;"><tr><td width="50%" valign="top" style="padding:0 6px 0 0;">${operating}</td><td width="50%" valign="top" style="padding:0 0 0 6px;">${expenseMix}</td></tr></table></td></tr>${propertyLink ? `<tr><td style="padding:15px 20px 0;"><a href="${escapeHtml(propertyLink)}" style="color:${EMAIL_TEAL};font-size:12px;font-weight:700;text-decoration:underline;">View property listing →</a></td></tr>` : ""}<tr><td style="padding:19px 20px 0;color:${EMAIL_INK};font-size:13px;line-height:20px;">These projections are illustrative and based on the stated assumptions, comparable data, and modeled inputs. They are not financial, tax, or investment advice and should be reviewed as part of your due diligence.</td></tr><tr><td style="padding:18px 20px 0;color:${EMAIL_INK};font-size:13px;line-height:20px;">I would be happy to walk through the assumptions and answer any questions.<br/><br/>Best,</td></tr></table></td></tr></table>`;
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
