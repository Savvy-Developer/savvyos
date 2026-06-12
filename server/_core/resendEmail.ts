import { Resend } from "resend";
import { ENV } from "./env";
import { getDb } from "../db";
import { emailTemplates, emailNotificationSettings } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

const FROM_ADDRESS = "Savvy STR Agents <notifications@savvy-agents.com>";
const APP_URL = "https://savvyos-rgtcxhr8.manus.space";
const LOGO_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663374872019/RGtcxHR8RPxZsqyxZLCcuq/savvy-logo_c97e2154.png";

// Brand colors — exact logo values
const CYAN = "#0fc0df";
const BLACK = "#0A0A0A";
const MUTED = "#6B7280";
const BORDER = "#E8EAED";
const BODY_BG = "#F5F6F7";

function getResend(): Resend | null {
  if (!ENV.resendApiKey) return null;
  return new Resend(ENV.resendApiKey);
}

export type EmailType =
  | "lead_assigned"
  | "transaction_created"
  | "transaction_status_changed"
  | "transaction_closed"
  | "commission_calculated"
  | "task_assigned"
  | "task_due"
  | "payout_integrity_fail"
  | "listing_created"
  | "listing_expiration_reminder"
  | "onboarding_overdue"
  | "commission_exception_warning"
  | "market_match_intro"
  | "client_intro"
  | "connection_request_approved"
  | "pm_mention"
  | "partner_lead_confirmation"
  | "password_reset";

interface EmailContext {
  recipientName?: string;
  recipientEmail: string;
  // PM mention-specific
  mentionedByName?: string;
  projectTitle?: string;
  noteContent?: string;
  projectUrl?: string;
  ccEmail?: string;
  contactName?: string;
  agentName?: string;
  transactionNumber?: string;
  transactionType?: string;
  propertyAddress?: string;
  status?: string;
  taskTitle?: string;
  dueDate?: string;
  amount?: string;
  percentage?: string;
  notes?: string;
  listingAddress?: string;
  listPrice?: string;
  listingDate?: string;
  expirationDate?: string;
  // Onboarding-specific
  overdueCount?: string;
  taskList?: string;
  // Client intro-specific
  agentBookingLink?: string;
  // Connection request-specific
  pipelineStatus?: string;
  // Market Match intro-specific
  investorFirstName?: string;
  marketName?: string;
  marketState?: string;
  investorBudget?: string;
  investorGoals?: string;
  callSummarySnippet?: string;
  handoffNotes?: string;
  isaName?: string;
  // Partner-specific fields
  partnerName?: string;
  partnerEmail?: string;
}

// ─── Shared Layout Wrapper ────────────────────────────────────────────────────
function emailLayout(content: string, previewText = ""): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Savvy STR Agents</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:${BODY_BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  ${previewText ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${previewText}&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌</div>` : ""}
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BODY_BG};">
    <tr>
      <td align="center" style="padding:40px 16px 32px;">
        <table width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;">

          <!-- Logo header — white card -->
          <tr>
            <td align="center" style="background-color:#FFFFFF;border-radius:12px 12px 0 0;padding:32px 40px 24px;border:1px solid ${BORDER};border-bottom:none;">
              <img src="${LOGO_URL}" alt="Savvy STR Agents" width="180" style="max-width:180px;height:auto;display:block;margin:0 auto;" />
            </td>
          </tr>

          <!-- Thin cyan accent bar -->
          <tr>
            <td style="background-color:${CYAN};height:3px;border-left:1px solid ${BORDER};border-right:1px solid ${BORDER};"></td>
          </tr>

          <!-- Body — white card -->
          <tr>
            <td style="background-color:#FFFFFF;padding:36px 40px 32px;border-left:1px solid ${BORDER};border-right:1px solid ${BORDER};">
              ${content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#FAFAFA;border-radius:0 0 12px 12px;padding:20px 40px;border:1px solid ${BORDER};border-top:none;text-align:center;">
              <p style="margin:0 0 4px;font-size:12px;color:${MUTED};">
                Savvy STR Agents &nbsp;·&nbsp;
                <a href="https://savvy-agents.com" style="color:${CYAN};text-decoration:none;">savvy-agents.com</a>
              </p>
              <p style="margin:0;font-size:11px;color:#9CA3AF;">You're receiving this because you're a member of the Savvy STR Agents platform.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── Shared Components ────────────────────────────────────────────────────────
function heading(text: string, color = BLACK): string {
  return `<h1 style="margin:0 0 6px;font-size:20px;font-weight:700;color:${color};letter-spacing:-0.2px;line-height:1.3;">${text}</h1>`;
}

function subheading(text: string): string {
  return `<p style="margin:0 0 20px;font-size:13px;font-weight:500;color:${MUTED};text-transform:uppercase;letter-spacing:0.5px;">${text}</p>`;
}

function greeting(name?: string): string {
  return `<p style="margin:0 0 18px;font-size:15px;color:#374151;line-height:1.6;">Hi ${name ?? "there"},</p>`;
}

function bodyText(text: string): string {
  return `<p style="margin:0 0 4px;font-size:15px;color:#374151;line-height:1.6;">${text}</p>`;
}

function infoCard(rows: string[], accentColor = CYAN): string {
  const rowsHtml = rows.map(r =>
    `<tr><td style="padding:7px 0;font-size:14px;color:#374151;line-height:1.5;border-bottom:1px solid #F3F4F6;">${r}</td></tr>`
  ).join("");
  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
      style="background-color:#F9FAFB;border-radius:8px;border-left:3px solid ${accentColor};margin:20px 0 4px;">
      <tr><td style="padding:14px 18px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">${rowsHtml}</table>
      </td></tr>
    </table>`;
}

function ctaButton(label: string, url: string, color = CYAN): string {
  const textColor = color === CYAN ? BLACK : "#FFFFFF";
  return `
    <table cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 0;">
      <tr>
        <td style="background-color:${color};border-radius:7px;">
          <a href="${url}"
            style="display:inline-block;padding:12px 26px;font-size:14px;font-weight:600;color:${textColor};text-decoration:none;letter-spacing:0.1px;"
          >${label}</a>
        </td>
      </tr>
    </table>`;
}

// ─── Email Templates ──────────────────────────────────────────────────────────
const TEMPLATES: Record<EmailType, (ctx: EmailContext) => { subject: string; html: string }> = {

  market_match_intro: (ctx) => ({
    subject: `Introduction: ${ctx.investorFirstName ?? "An Investor"} × ${ctx.marketName ?? "Your Market"} — STR Opportunity`,
    html: emailLayout(
      `${heading("Investor Introduction", "#0891B2")}
      ${subheading("Market Match Call — Agent Handoff")}
      ${greeting(ctx.recipientName)}
      ${bodyText(`You've been matched with a qualified STR investor through our Market Match Call system. Please reach out within 24 hours to introduce yourself and schedule a discovery call.`)}
      ${infoCard([
        `<strong style="color:${BLACK};">Investor</strong>&nbsp;&nbsp; ${ctx.investorFirstName ?? "Investor"}`,
        ...(ctx.marketName ? [`<strong style="color:${BLACK};">Target Market</strong>&nbsp;&nbsp; ${ctx.marketName}${ctx.marketState ? `, ${ctx.marketState}` : ""}`] : []),
        ...(ctx.investorBudget ? [`<strong style="color:${BLACK};">Budget Range</strong>&nbsp;&nbsp; ${ctx.investorBudget}`] : []),
        ...(ctx.investorGoals ? [`<strong style="color:${BLACK};">Investment Goals</strong>&nbsp;&nbsp; ${ctx.investorGoals}`] : []),
        ...(ctx.isaName ? [`<strong style="color:${BLACK};">Introduced by</strong>&nbsp;&nbsp; ${ctx.isaName}`] : []),
      ], "#0891B2")}
      ${ctx.callSummarySnippet ? `<p style="margin:16px 0 4px;font-size:14px;font-weight:600;color:${BLACK};">Call Summary</p><p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.6;background:#F9FAFB;border-radius:6px;padding:12px 16px;">${ctx.callSummarySnippet}</p>` : ""}
      ${ctx.handoffNotes ? `<p style="margin:16px 0 4px;font-size:14px;font-weight:600;color:${BLACK};">Handoff Notes from ISA</p><p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.6;background:#F0F9FF;border-radius:6px;padding:12px 16px;border-left:3px solid #0891B2;">${ctx.handoffNotes}</p>` : ""}
      ${bodyText("Please reach out to this investor within 24 hours to introduce yourself and schedule a discovery call.")}
      ${ctaButton("View Investor Profile", APP_URL + "/market-match-call", "#0891B2")}`,
      `New investor introduction — ${ctx.investorFirstName ?? "Investor"} is interested in ${ctx.marketName ?? "your market"}`
    ),
  }),

  lead_assigned: (ctx) => ({
    subject: `New Lead Assigned: ${ctx.contactName ?? "New Contact"}`,
    html: emailLayout(
      `${heading("New Lead Assigned")}
      ${subheading("CRM Notification")}
      ${greeting(ctx.recipientName)}
      ${bodyText("A new lead has been assigned to you in SavvyOS. Reach out within 24 hours for the best conversion rate.")}
      ${infoCard([
        `<strong style="color:${BLACK};">Contact</strong>&nbsp;&nbsp; ${ctx.contactName ?? "—"}`,
        ...(ctx.notes ? [`<strong style="color:${BLACK};">Notes</strong>&nbsp;&nbsp; ${ctx.notes}`] : []),
      ])}
      ${ctaButton("View Contact", APP_URL)}`,
      `New lead assigned: ${ctx.contactName ?? "New Contact"}`
    ),
  }),

  transaction_status_changed: (ctx) => ({
    subject: `Transaction Status Updated${ctx.transactionNumber ? ` — #${ctx.transactionNumber}` : ""}`,
    html: emailLayout(
      `${heading("Transaction Status Updated")}
      ${subheading("Transaction Update")}
      ${greeting(ctx.recipientName)}
      ${bodyText("A transaction you are involved in has been updated.")}
      ${infoCard([
        ...(ctx.transactionNumber ? [`<strong style="color:${BLACK};">Transaction</strong>&nbsp;&nbsp; #${ctx.transactionNumber}`] : []),
        ...(ctx.contactName ? [`<strong style="color:${BLACK};">Contact</strong>&nbsp;&nbsp; ${ctx.contactName}`] : []),
        ...(ctx.status ? [`<strong style="color:${BLACK};">New Status</strong>&nbsp;&nbsp; <span style="color:${CYAN};font-weight:600;">${ctx.status}</span>`] : []),
      ])}
      ${ctaButton("View Transaction", APP_URL)}`,
      `Transaction status updated${ctx.transactionNumber ? ` — #${ctx.transactionNumber}` : ""}`
    ),
  }),

  transaction_closed: (ctx) => ({
    subject: `Transaction Closed${ctx.transactionNumber ? ` — #${ctx.transactionNumber}` : ""}`,
    html: emailLayout(
      `${heading("Transaction Closed", "#059669")}
      ${subheading("Congratulations")}
      ${greeting(ctx.recipientName)}
      ${bodyText("A transaction has been marked as closed. The payout workflow has been triggered — review your commission breakdown in SavvyOS.")}
      ${infoCard([
        ...(ctx.transactionNumber ? [`<strong style="color:${BLACK};">Transaction</strong>&nbsp;&nbsp; #${ctx.transactionNumber}`] : []),
        ...(ctx.contactName ? [`<strong style="color:${BLACK};">Contact</strong>&nbsp;&nbsp; ${ctx.contactName}`] : []),
        ...(ctx.amount ? [`<strong style="color:${BLACK};">Purchase Price</strong>&nbsp;&nbsp; <span style="font-weight:600;">${ctx.amount}</span>`] : []),
      ], "#059669")}
      ${ctaButton("View Payout Details", APP_URL, "#059669")}`,
      `Transaction closed${ctx.transactionNumber ? ` — #${ctx.transactionNumber}` : ""}`
    ),
  }),

  commission_calculated: (ctx) => ({
    subject: `Commission Calculated${ctx.transactionNumber ? ` — #${ctx.transactionNumber}` : ""}`,
    html: emailLayout(
      `${heading("Commission Calculated")}
      ${subheading("Payout Notification")}
      ${greeting(ctx.recipientName)}
      ${bodyText("Commission has been calculated for a transaction you are part of.")}
      ${infoCard([
        ...(ctx.transactionNumber ? [`<strong style="color:${BLACK};">Transaction</strong>&nbsp;&nbsp; #${ctx.transactionNumber}`] : []),
        ...(ctx.percentage ? [`<strong style="color:${BLACK};">Your Share</strong>&nbsp;&nbsp; ${ctx.percentage}%`] : []),
        ...(ctx.amount ? [`<strong style="color:${BLACK};">Estimated Amount</strong>&nbsp;&nbsp; <span style="font-weight:700;color:${CYAN};">${ctx.amount}</span>`] : []),
      ])}
      ${ctaButton("View Payout Breakdown", APP_URL)}`,
      `Commission calculated${ctx.transactionNumber ? ` — #${ctx.transactionNumber}` : ""}`
    ),
  }),

  task_assigned: (ctx) => ({
    subject: `New Task: ${ctx.taskTitle ?? "Task"}`,
    html: emailLayout(
      `${heading("New Task Assigned")}
      ${subheading("Task Notification")}
      ${greeting(ctx.recipientName)}
      ${bodyText("A new task has been assigned to you in SavvyOS.")}
      ${infoCard([
        `<strong style="color:${BLACK};">Task</strong>&nbsp;&nbsp; ${ctx.taskTitle ?? "—"}`,
        ...(ctx.dueDate ? [`<strong style="color:${BLACK};">Due Date</strong>&nbsp;&nbsp; ${ctx.dueDate}`] : []),
        ...(ctx.contactName ? [`<strong style="color:${BLACK};">Related Contact</strong>&nbsp;&nbsp; ${ctx.contactName}`] : []),
      ])}
      ${ctaButton("View Task", APP_URL)}`,
      `New task: ${ctx.taskTitle ?? "Task"}`
    ),
  }),

  task_due: (ctx) => ({
    subject: `Task Due Soon: ${ctx.taskTitle ?? "Task"}`,
    html: emailLayout(
      `${heading("Task Due Soon", "#D97706")}
      ${subheading("Reminder")}
      ${greeting(ctx.recipientName)}
      ${bodyText("You have a task that is due soon. Don't let it slip through the cracks.")}
      ${infoCard([
        `<strong style="color:${BLACK};">Task</strong>&nbsp;&nbsp; ${ctx.taskTitle ?? "—"}`,
        ...(ctx.dueDate ? [`<strong style="color:${BLACK};">Due</strong>&nbsp;&nbsp; <span style="color:#D97706;font-weight:600;">${ctx.dueDate}</span>`] : []),
      ], "#D97706")}
      ${ctaButton("Complete Task", APP_URL, "#D97706")}`,
      `Task due soon: ${ctx.taskTitle ?? "Task"}`
    ),
  }),

  transaction_created: (ctx) => ({
    subject: `New Transaction${ctx.transactionNumber ? ` #${ctx.transactionNumber}` : ""} Created`,
    html: emailLayout(
      `${heading("New Transaction Created")}
      ${subheading("Transaction Notification")}
      ${greeting(ctx.recipientName)}
      ${bodyText("A new transaction has been created and assigned to you in SavvyOS.")}
      ${infoCard([
        ...(ctx.transactionNumber ? [`<strong style="color:${BLACK};">Transaction</strong>&nbsp;&nbsp; #${ctx.transactionNumber}`] : []),
        ...(ctx.contactName ? [`<strong style="color:${BLACK};">Contact</strong>&nbsp;&nbsp; ${ctx.contactName}`] : []),
        ...(ctx.transactionType ? [`<strong style="color:${BLACK};">Type</strong>&nbsp;&nbsp; ${ctx.transactionType.charAt(0).toUpperCase() + ctx.transactionType.slice(1)}`] : []),
        ...(ctx.propertyAddress ? [`<strong style="color:${BLACK};">Property</strong>&nbsp;&nbsp; ${ctx.propertyAddress}`] : []),
        ...(ctx.amount ? [`<strong style="color:${BLACK};">Purchase Price</strong>&nbsp;&nbsp; ${ctx.amount}`] : []),
      ])}
      ${ctaButton("View Transaction", APP_URL)}`,
      `New transaction${ctx.transactionNumber ? ` #${ctx.transactionNumber}` : ""} created`
    ),
  }),

  listing_created: (ctx) => ({
    subject: `New Listing Created${ctx.listingAddress ? ` — ${ctx.listingAddress}` : ""}`,
    html: emailLayout(
      `${heading("New Listing Created")}
      ${subheading("Listing Notification")}
      ${greeting(ctx.recipientName)}
      ${bodyText("A new listing has been created and assigned to you in SavvyOS.")}
      ${infoCard([
        ...(ctx.listingAddress ? [`<strong style="color:${BLACK};">Property</strong>&nbsp;&nbsp; ${ctx.listingAddress}`] : []),
        ...(ctx.contactName ? [`<strong style="color:${BLACK};">Seller</strong>&nbsp;&nbsp; ${ctx.contactName}`] : []),
        ...(ctx.listPrice ? [`<strong style="color:${BLACK};">List Price</strong>&nbsp;&nbsp; <span style="font-weight:700;color:${CYAN};">${ctx.listPrice}</span>`] : []),
        ...(ctx.listingDate ? [`<strong style="color:${BLACK};">Listed</strong>&nbsp;&nbsp; ${ctx.listingDate}`] : []),
        ...(ctx.expirationDate ? [`<strong style="color:${BLACK};">Expires</strong>&nbsp;&nbsp; ${ctx.expirationDate}`] : []),
      ])}
      ${ctaButton("View Listing", APP_URL + "/listings")}`,
      `New listing created${ctx.listingAddress ? ` — ${ctx.listingAddress}` : ""}`
    ),
  }),

  listing_expiration_reminder: (ctx) => ({
    subject: `Listing Expiration Notice${ctx.listingAddress ? ` — ${ctx.listingAddress}` : ""}`,
    html: emailLayout(
      `${heading("Listing Expiration Notice", "#D97706")}
      ${subheading("Action Required")}
      ${greeting(ctx.recipientName)}
      ${bodyText("One of your active listings has passed its expiration date. Please review and update the expiration date, or change the listing status to keep your pipeline accurate.")}
      ${infoCard([
        ...(ctx.listingAddress ? [`<strong style="color:${BLACK};">Property</strong>&nbsp;&nbsp; ${ctx.listingAddress}`] : []),
        ...(ctx.contactName ? [`<strong style="color:${BLACK};">Seller</strong>&nbsp;&nbsp; ${ctx.contactName}`] : []),
        ...(ctx.listPrice ? [`<strong style="color:${BLACK};">List Price</strong>&nbsp;&nbsp; ${ctx.listPrice}`] : []),
        ...(ctx.expirationDate ? [`<strong style="color:${BLACK};">Expired</strong>&nbsp;&nbsp; <span style="color:#DC2626;font-weight:600;">${ctx.expirationDate}</span>`] : []),
      ], "#D97706")}
      ${ctaButton("Update Listing", APP_URL + "/listings", "#D97706")}`,
      `Listing expired${ctx.listingAddress ? ` — ${ctx.listingAddress}` : ""}`
    ),
  }),

  onboarding_overdue: (ctx) => ({
    subject: `Onboarding Tasks Overdue${ctx.agentName ? ` — ${ctx.agentName}` : ""}`,
    html: emailLayout(
      `${heading("Onboarding Tasks Overdue", "#DC2626")}
      ${subheading("Action Required")}
      ${greeting(ctx.recipientName)}
      ${bodyText(`${ctx.overdueCount ?? "Some"} onboarding task${ctx.overdueCount === "1" ? " is" : "s are"} now past ${ctx.overdueCount === "1" ? "its" : "their"} due date${ctx.agentName ? ` for <strong>${ctx.agentName}</strong>` : ""}.`)}
      ${ctx.taskList ? infoCard(ctx.taskList.split("\n").filter(Boolean), "#DC2626") : ""}
      ${ctaButton("View Onboarding", APP_URL + "/onboarding-tracker", "#DC2626")}`,
      `Onboarding tasks overdue${ctx.agentName ? ` — ${ctx.agentName}` : ""}`
    ),
  }),

  commission_exception_warning: (ctx) => ({
    subject: `⚠️ Commission Exception Warning — Transaction${ctx.transactionNumber ? ` #${ctx.transactionNumber}` : ""}`,
    html: emailLayout(
      `${heading("Commission Exception Warning", "#D97706")}
      ${subheading("Action Required")}
      ${greeting(ctx.recipientName)}
      ${bodyText(`A commission exception was approved for Transaction${ctx.transactionNumber ? ` <strong>#${ctx.transactionNumber}</strong>` : ""} with the following warnings:`)}
      ${ctx.notes ? infoCard(ctx.notes.split("\n").filter(Boolean), "#D97706") : ""}
      ${ctaButton("Review Transaction", APP_URL + "/transactions", "#D97706")}`,
      `Commission exception warning${ctx.transactionNumber ? ` — #${ctx.transactionNumber}` : ""}`
    ),
  }),

  payout_integrity_fail: (ctx) => ({
    subject: `Commission Integrity Issue — Action Required`,
    html: emailLayout(
      `${heading("Commission Integrity Issue", "#DC2626")}
      ${subheading("Action Required")}
      ${greeting(ctx.recipientName)}
      ${bodyText("A transaction has commission payouts that exceed 100%. Please review and correct the payout items immediately to avoid processing errors.")}
      ${infoCard([
        ctx.transactionNumber
          ? `<strong style="color:${BLACK};">Transaction</strong>&nbsp;&nbsp; #${ctx.transactionNumber}`
          : `<strong style="color:#DC2626;">Action required</strong>&nbsp;&nbsp; Review all open transactions`,
      ], "#DC2626")}
      ${ctaButton("Review Now", APP_URL, "#DC2626")}`,
      "Commission integrity issue — action required"
    ),
  }),

  connection_request_approved: (ctx) => ({
    subject: `Connection Request Approved — ${ctx.contactName ?? "Contact"}`,
    html: emailLayout(
      `${heading("Connection Request Approved", "#059669")}
      ${subheading("Pipeline Update")}
      ${greeting(ctx.recipientName)}
      ${bodyText(`Your request to connect with <strong>${ctx.contactName ?? "a contact"}</strong> has been approved. They have been added to your pipeline.`)}
      ${infoCard([
        `<strong style="color:${BLACK};">Contact</strong>&nbsp;&nbsp; ${ctx.contactName ?? "—"}`,
        ...(ctx.pipelineStatus ? [`<strong style="color:${BLACK};">Pipeline Stage</strong>&nbsp;&nbsp; ${ctx.pipelineStatus.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}`] : []),
      ], "#059669")}
      ${ctaButton("View in Pipeline", APP_URL + "/pipeline")}`,
      `Connection request approved — ${ctx.contactName ?? "contact"} added to your pipeline`
    ),
  }),

  pm_mention: (ctx) => ({
    subject: `${ctx.mentionedByName ?? "Someone"} mentioned you in a project note — ${ctx.projectTitle ?? "SavvyOS"}`,
    html: emailLayout(
      `${heading("You were mentioned in a project note", CYAN)}
      ${subheading(ctx.projectTitle ?? "Project Update")}
      ${greeting(ctx.recipientName)}
      ${bodyText(`<strong>${ctx.mentionedByName ?? "A teammate"}</strong> mentioned you in a note on the project <strong>${ctx.projectTitle ?? "a project"}</strong>.`)}
      ${ctx.noteContent ? `<div style="margin:20px 0;background:#F9FAFB;border-radius:8px;border-left:3px solid ${CYAN};padding:14px 18px;font-size:14px;color:#374151;line-height:1.6;">${ctx.noteContent}</div>` : ""}
      ${ctaButton("View Project", ctx.projectUrl ?? APP_URL)}`,
      `${ctx.mentionedByName ?? "Someone"} mentioned you in ${ctx.projectTitle ?? "a project"}`
    ),
  }),

  client_intro: (ctx) => ({
    subject: `Meet ${ctx.agentName ?? "Your Agent"} — Savvy STR Agents`,
    html: emailLayout(
      `${heading("Meet Your Agent", CYAN)}
      ${subheading("A Personal Introduction from Savvy STR Agents")}
      ${greeting(ctx.recipientName)}
      ${bodyText(`We're excited to introduce you to <strong>${ctx.agentName ?? "your dedicated agent"}</strong>, who will be working with you on your short-term rental journey. ${ctx.agentName ?? "Your agent"} specializes in STR properties and is ready to help you find the perfect investment.`)}
      ${infoCard([
        `<strong style="color:${BLACK};">Your Agent</strong>&nbsp;&nbsp; ${ctx.agentName ?? "—"}`,
        ...(ctx.isaName ? [`<strong style="color:${BLACK};">Introduced by</strong>&nbsp;&nbsp; ${ctx.isaName}`] : []),
      ])}
      ${ctx.agentBookingLink ? ctaButton("Schedule a Call with Your Agent", ctx.agentBookingLink) : ctaButton("Get Started", APP_URL)}
      ${bodyText("If you have any questions in the meantime, feel free to reply to this email.")}`,
      `Meet ${ctx.agentName ?? "your agent"} — your dedicated STR specialist`
    ),
  }),

  password_reset: (ctx) => ({
    subject: "Reset your SavvyOS password",
    html: emailLayout(
      `${heading("Reset Your Password")}
      ${greeting(ctx.recipientName)}
      ${bodyText("We received a request to reset the password for your SavvyOS account. Click the button below to set a new password. This link expires in 1 hour.")}
      ${ctaButton("Reset Password", ctx.notes ?? APP_URL)}
      ${bodyText("If you did not request a password reset, you can safely ignore this email. Your password will not change.")}
      ${bodyText("For security, this link can only be used once.")}`,
      "Reset your SavvyOS password"
    ),
  }),

  partner_lead_confirmation: (ctx) => ({
    subject: `Lead Received: ${ctx.contactName ?? "Your Client"} — Savvy STR Agents`,
    html: emailLayout(
      `${heading("Lead Confirmation")}
      ${subheading("Partner Intake Form")}
      ${greeting(ctx.recipientName ?? ctx.partnerName)}
      ${bodyText(`Thank you for submitting a lead to Savvy STR Agents! We've received the following client information and our team will be in touch shortly.`)}
      ${infoCard([
        `<strong style="color:${BLACK};">Client Name</strong>&nbsp;&nbsp; ${ctx.contactName ?? "—"}`,
        ...(ctx.notes ? [`<strong style="color:${BLACK};">Notes</strong>&nbsp;&nbsp; ${ctx.notes}`] : []),
      ])}
      ${bodyText("If you have any questions or need to update this submission, please reply to this email.")}
      ${ctaButton("Visit Savvy STR Agents", APP_URL)}`,
      `Your lead has been received — we'll follow up soon`
    ),
  }),
};

/**
 * Send a transactional email via Resend.
 * Falls back silently if RESEND_API_KEY is not configured.
 */
export async function sendTransactionalEmail(
  type: EmailType,
  ctx: EmailContext
): Promise<void> {
  const resend = getResend();
  if (!resend) {
    console.warn("[Resend] API key not configured — skipping email");
    return;
  }

  // Check if this notification type is disabled via the admin Email Notifications toggle
  try {
    const settingDb = await getDb();
    if (settingDb) {
      const [setting] = await settingDb
        .select({ isEnabled: emailNotificationSettings.isEnabled })
        .from(emailNotificationSettings)
        .where(eq(emailNotificationSettings.notificationKey, type))
        .limit(1);
      if (setting && !setting.isEnabled) {
        console.info(`[Resend] Email type "${type}" is disabled via admin settings — skipping`);
        return;
      }
    }
  } catch (settingErr) {
    // Non-fatal: if we can't read the setting, default to sending
    console.warn("[Resend] Could not check notification setting:", settingErr);
  }

  try {
    const hardcoded = TEMPLATES[type](ctx);
    // Check for admin-edited template override in DB
    let subject = hardcoded.subject;
    let html = hardcoded.html;
    try {
      const db = await getDb();
      if (db) {
        const [override] = await db.select().from(emailTemplates).where(eq(emailTemplates.emailType, type)).limit(1);
        if (override) {
          subject = override.subject;
          // Replace the bodyText paragraph in the HTML with the override body
          const escapedBody = override.bodyText.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
          html = hardcoded.html.replace(
            /<p style="[^"]*color:[^"]*#6B7280[^"]*">[^<]*<\/p>/,
            `<p style="font-size:15px;line-height:1.6;color:#374151;margin:0 0 20px;">${escapedBody}</p>`
          );
        }
      }
    } catch (dbErr) {
      console.warn("[Resend] Could not load template override:", dbErr);
    }
    const sendOptions: Parameters<typeof resend.emails.send>[0] = {
      from: FROM_ADDRESS,
      to: ctx.recipientEmail,
      subject,
      html,
      ...(ctx.ccEmail ? { cc: [ctx.ccEmail] } : {}),
    };
    const result = await resend.emails.send(sendOptions);
    if (result.error) {
      console.error("[Resend] Send error:", result.error);
    }
  } catch (err) {
    console.error("[Resend] Failed to send email:", err);
  }
}

/**
 * Return the rendered HTML and subject for a given email type without sending.
 * Used for preview in the Email Test admin page.
 */
export function getEmailPreview(type: EmailType, ctx: EmailContext): { subject: string; html: string } {
  return TEMPLATES[type](ctx);
}
