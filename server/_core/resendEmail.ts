import { Resend } from "resend";
import crypto from "crypto";
import { ENV } from "./env";
import { getDb } from "../db";
import { emailTemplates, emailNotificationSettings, magicLinkTokens, users } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

const FROM_ADDRESS = "Savvy STR Agents <notifications@savvy-agents.com>";
const APP_URL = "https://os.savvy-agents.com";
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

/**
 * Resend's SDK occasionally reports an application-level transport resolution
 * failure despite the direct API being available. Use the same provider, sender,
 * and idempotency key as a narrow fallback rather than abandoning an authorized
 * operational delivery.
 */
async function sendViaResendHttpFallback(params: {
  to: string;
  cc?: string[];
  subject: string;
  html: string;
  idempotencyKey?: string;
  replyTo?: string;
}): Promise<{ sent: boolean; reason?: string }> {
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ENV.resendApiKey}`,
        "Content-Type": "application/json",
        ...(params.idempotencyKey ? { "Idempotency-Key": params.idempotencyKey } : {}),
      },
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [params.to],
        ...(params.cc?.length ? { cc: params.cc } : {}),
        ...(params.replyTo ? { reply_to: params.replyTo } : {}),
        subject: params.subject,
        html: params.html,
      }),
    });
    if (!response.ok) {
      return { sent: false, reason: `HTTP ${response.status}: ${await response.text()}` };
    }
    return { sent: true };
  } catch (error) {
    return { sent: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

/** Every built-in transactional email whose delivery can be toggled in SavvyOS. */
export const EMAIL_NOTIFICATION_TYPES = [
  "lead_assigned", "transaction_created", "transaction_status_changed", "transaction_closed",
  "transaction_review_request", "transaction_review_received", "commission_calculated", "task_assigned",
  "task_due", "payout_integrity_fail", "listing_created", "listing_expiration_reminder", "onboarding_overdue",
  "commission_exception_warning", "market_match_intro", "client_intro", "connection_request_approved", "pm_mention",
  "partner_lead_confirmation", "partner_portal_access", "agent_production_report", "weekly_lead_report",
  "weekly_webinar_report", "weekly_referral_report", "daily_agent_report", "daily_isa_activities", "monthly_agent_renewals", "coaching_weekly_accountability", "coaching_tips_for_today",
  "coaching_feedback_invitation", "coaching_feedback_weekly_summary", "pulse_overdue_digest", "pulse_rock_completed",
  "meeting_reminder", "pulse_submission_confirmation", "pulse_meeting_recap", "todo_assigned", "cascade_sent",
  "overdue_digest", "mention", "rock_completed", "welcome", "password_reset", "webinar_marketing_request",
  "website_deeper_analysis_request", "website_financing_request", "website_showing_request",
  "pto_request_submitted", "pto_request_decision",
] as const;

export type EmailType = (typeof EMAIL_NOTIFICATION_TYPES)[number];

interface EmailContext {
  recipientName?: string;
  recipientEmail: string;
  // Pulse work-item email fields
  pulseOverdueList?: string;
  pulseOverdueCount?: string;
  pulseWorkItemTitle?: string;
  pulseMeetingName?: string;
  pulseItemUrl?: string;
  pulseCascadeSource?: string;
  pulseCascadeDestinations?: string;
  pulseCascadeAcknowledgment?: string;
  pulseCascadeBody?: string;
  pulseActionUrl?: string;
  pulseSubmissionSummary?: string;
  pulseRecapHtml?: string;
  // PM mention-specific
  mentionedByName?: string;
  projectTitle?: string;
  noteContent?: string;
  projectUrl?: string;
  ccEmail?: string;
  ccEmails?: string[];
  contactName?: string;
  agentName?: string;
  transactionNumber?: string;
  transactionType?: string;
  propertyAddress?: string;
  /** Public savvy-agents.com listing URL for website lead handoff emails. */
  propertyUrl?: string;
  reviewUrl?: string;
  reviewRating?: string;
  reviewComment?: string;
  reviewerName?: string;
  replyToEmail?: string;
  status?: string;
  taskTitle?: string;
  dueDate?: string;
  amount?: string;
  percentage?: string;
  notes?: string;
  leadSourceLabel?: string;
  clientContextSummary?: string;
  // PTO request and decision fields
  employeeName?: string;
  managerName?: string;
  ptoType?: string;
  ptoDateRange?: string;
  ptoRequestedDays?: string;
  coverageNotes?: string;
  decisionStatus?: string;
  decisionReason?: string;
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
  partnerPortalUrl?: string;
  // Agent production report-specific fields
  reportDate?: string;
  reportAsOf?: string;
  reportTableHtml?: string;
  // Weekly Lead Report-specific fields
  weeklyLeadReportDate?: string;
  weeklyLeadReportHtml?: string;
  weeklyLeadReportSubject?: string;
  // Weekly webinar report-specific fields
  weeklyWebinarReportHtml?: string;
  weeklyWebinarReportSubject?: string;
  // Weekly referral report-specific fields
  weeklyReferralReportHtml?: string;
  weeklyReferralReportSubject?: string;
  // Daily agent report-specific fields
  dailyReportDate?: string;
  dailyReportAsOf?: string;
  dailyReportHtml?: string;
  // Daily ISA Activities report-specific fields
  dailyIsaReportDate?: string;
  dailyIsaReportHtml?: string;
  dailyIsaReportSubject?: string;
  // Monthly Agent Renewals report-specific fields
  monthlyRenewalsDate?: string;
  monthlyRenewalsHtml?: string;
  monthlyRenewalsSubject?: string;
  // Coaching weekly accountability report-specific fields
  coachingReportDate?: string;
  coachingReportHtml?: string;
  coachingReportSubject?: string;
  // Daily Coaching Tips report-specific fields
  coachingTipsDate?: string;
  coachingTipsHtml?: string;
  coachingTipsSubject?: string;
  // Anonymous coaching feedback-specific fields
  coachFeedbackHtml?: string;
  coachFeedbackSubject?: string;
  // Deep-link entity IDs (numeric DB IDs for direct navigation)
  transactionId?: string;
  taskId?: string;
  listingId?: string;
  connectionId?: string;
  contactId?: string;
  // Webinar marketing handoff-specific fields
  webinarTitle?: string;
  webinarDescription?: string;
  webinarStartTime?: string;
  webinarDuration?: string;
  webinarRegistrationUrl?: string;
  webinarCreatorName?: string;
  webinarCreatorEmail?: string;
}

const WEBINAR_TEMPLATE_BODY_START = "<!--WEBINAR_TEMPLATE_BODY_START-->";
const WEBINAR_TEMPLATE_BODY_END = "<!--WEBINAR_TEMPLATE_BODY_END-->";

function replaceWebinarTemplateTokens(value: string, ctx: EmailContext): string {
  const variables: Record<string, string> = {
    webinar_title: ctx.webinarTitle ?? "",
    webinar_description: ctx.webinarDescription ?? "",
    webinar_start_time: ctx.webinarStartTime ?? "",
    webinar_duration: ctx.webinarDuration ?? "",
    webinar_registration_url: ctx.webinarRegistrationUrl ?? "",
    webinar_creator_name: ctx.webinarCreatorName ?? "",
    webinar_creator_email: ctx.webinarCreatorEmail ?? "",
  };
  return value.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_match, name) => variables[name.toLowerCase()] ?? "");
}

function webinarTemplateBody(text: string, ctx: EmailContext): string {
  const formatted = escapeHtml(replaceWebinarTemplateTokens(text, ctx)).replace(/\n/g, "<br />");
  return `${WEBINAR_TEMPLATE_BODY_START}<p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.6;">${formatted}</p>${WEBINAR_TEMPLATE_BODY_END}`;
}

function replaceWebinarTemplateBody(html: string, text: string, ctx: EmailContext): string {
  const start = html.indexOf(WEBINAR_TEMPLATE_BODY_START);
  const end = html.indexOf(WEBINAR_TEMPLATE_BODY_END);
  if (start === -1 || end === -1) return html;
  return `${html.slice(0, start)}${webinarTemplateBody(text, ctx)}${html.slice(end + WEBINAR_TEMPLATE_BODY_END.length)}`;
}

// ─── Shared Layout Wrapper ────────────────────────────────────────────────────
function emailLayout(content: string, previewText = "", maxWidth = 560): string {
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
        <table width="${maxWidth}" cellpadding="0" cellspacing="0" border="0" style="max-width:${maxWidth}px;width:100%;">

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

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#039;");
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

type WebsiteLeadRequestKind = "deeper_analysis" | "financing" | "showing";

/** Shared handoff layout for deliberate property requests from savvy-agents.com. */
function websiteLeadHandoffTemplate(
  ctx: EmailContext,
  kind: WebsiteLeadRequestKind,
): { subject: string; html: string } {
  const agentName = escapeHtml(ctx.agentName ?? "Agent");
  const clientName = escapeHtml(ctx.contactName ?? "A client");
  const propertyAddress = escapeHtml(ctx.propertyAddress ?? "the requested property");
  const propertyUrl = ctx.propertyUrl ? escapeHtml(ctx.propertyUrl) : null;
  const propertyLink = propertyUrl
    ? `<a href="${propertyUrl}" style="color:#0891B2;text-decoration:underline;">${propertyAddress}</a>`
    : propertyAddress;
  const copy = {
    deeper_analysis: {
      heading: "Deeper Analysis Requested",
      subject: `Deeper Analysis Requested — ${ctx.propertyAddress ?? "Property Request"}`,
      message: `Hey <strong>${agentName}</strong>, <strong>${clientName}</strong> has asked for a deeper analysis of <strong>${propertyLink}</strong>. Please connect with them soon!`,
      preview: `${ctx.contactName ?? "A client"} requested a deeper analysis of ${ctx.propertyAddress ?? "a property"}.`,
      cta: "Schedule a Call",
    },
    financing: {
      heading: "Financing Information Requested",
      subject: `Financing Information Requested — ${ctx.propertyAddress ?? "Property Request"}`,
      message: `Hey <strong>${agentName}</strong>, <strong>${clientName}</strong> was looking for information regarding financing for this property: <strong>${propertyLink}</strong>. We will let you take it from here!`,
      preview: `${ctx.contactName ?? "A client"} requested financing information for ${ctx.propertyAddress ?? "a property"}.`,
      cta: "Schedule a Call",
    },
    showing: {
      heading: "Showing Requested",
      subject: `Showing Requested — ${ctx.propertyAddress ?? "Property Request"}`,
      message: `Hey <strong>${agentName}</strong>, <strong>${clientName}</strong> just asked to book a showing for <strong>${propertyLink}</strong>. Please reach out to them ASAP to get that scheduled!`,
      preview: `${ctx.contactName ?? "A client"} requested a showing for ${ctx.propertyAddress ?? "a property"}.`,
      cta: "Schedule a Showing Call",
    },
  }[kind];

  return {
    subject: copy.subject,
    html: emailLayout(
      `${heading(copy.heading, "#0891B2")}
      ${subheading("Savvy STR Agents · Website Client Handoff")}
      ${bodyText(copy.message)}
      ${infoCard([
        `<strong style="color:${BLACK};">Client</strong>&nbsp;&nbsp; ${clientName}`,
        `<strong style="color:${BLACK};">Property</strong>&nbsp;&nbsp; ${propertyLink}`,
      ], "#0891B2")}
      ${ctx.agentBookingLink ? ctaButton(copy.cta, ctx.agentBookingLink, "#0891B2") : ""}`,
      copy.preview,
    ),
  };
}

// ─── Email Templates ──────────────────────────────────────────────────────────
const TEMPLATES: Record<EmailType, (ctx: EmailContext) => { subject: string; html: string }> = {

  website_deeper_analysis_request: (ctx) => websiteLeadHandoffTemplate(ctx, "deeper_analysis"),

  website_financing_request: (ctx) => websiteLeadHandoffTemplate(ctx, "financing"),

  website_showing_request: (ctx) => websiteLeadHandoffTemplate(ctx, "showing"),

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
      ${ctaButton("View Investor Profile", APP_URL + "/market-match-call" + (ctx.contactId ? `?contactId=${ctx.contactId}` : ""), "#0891B2")}`,
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
        `<strong style="color:${BLACK};">Contact</strong>&nbsp;&nbsp; ${escapeHtml(ctx.contactName ?? "—")}`,
        ...(ctx.leadSourceLabel ? [`<strong style="color:${BLACK};">Lead Source</strong>&nbsp;&nbsp; ${escapeHtml(ctx.leadSourceLabel)}`] : []),
        ...(ctx.notes ? [`<strong style="color:${BLACK};">Notes</strong>&nbsp;&nbsp; ${escapeHtml(ctx.notes)}`] : []),
      ])}
      ${ctx.clientContextSummary ? `<p style="margin:20px 0 7px;font-size:14px;font-weight:700;color:${BLACK};">Client Context</p><div style="background:#F9FAFB;border-radius:8px;border-left:3px solid #0FC0DF;padding:14px 16px;font-size:14px;line-height:1.6;color:#374151;white-space:pre-wrap;">${escapeHtml(ctx.clientContextSummary)}</div>` : ""}
      ${ctaButton("View Contact", APP_URL + (ctx.connectionId ? `/pipeline/${ctx.connectionId}` : "/pipeline"))}`,
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
      ${ctaButton("View Transaction", APP_URL + (ctx.transactionId ? `/transactions/${ctx.transactionId}` : "/transactions"))}`,
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
      ${ctaButton("View Payout Details", APP_URL + (ctx.transactionId ? `/transactions/${ctx.transactionId}` : "/transactions"), "#059669")}`,
      `Transaction closed${ctx.transactionNumber ? ` — #${ctx.transactionNumber}` : ""}`
    ),
  }),

  transaction_review_request: (ctx) => ({
    subject: `How was your experience with ${ctx.agentName ?? "Savvy STR Agents"}?`,
    html: emailLayout(
      `${heading("We'd Love Your Feedback", "#0891B2")}
      ${subheading("A note from Savvy STR Agents")}
      ${greeting(ctx.recipientName)}
      ${bodyText(`Thank you for trusting ${escapeHtml(ctx.agentName ?? "your Savvy STR Agents representative")} with your recent real estate transaction. Your feedback helps us recognize great service and continue improving the client experience.`)}
      ${infoCard([
        ...(ctx.propertyAddress ? [`<strong style="color:${BLACK};">Property</strong>&nbsp;&nbsp; ${escapeHtml(ctx.propertyAddress)}`] : []),
        ...(ctx.transactionNumber ? [`<strong style="color:${BLACK};">Transaction</strong>&nbsp;&nbsp; #${escapeHtml(ctx.transactionNumber)}`] : []),
      ], "#0891B2")}
      ${bodyText("Please take a moment to share your experience. It only takes about a minute.")}
      ${ctaButton("Leave a Review", ctx.reviewUrl ?? APP_URL, "#0891B2")}
      <p style="margin:20px 0 0;font-size:12px;line-height:1.5;color:${MUTED};">This personalized link is for one review and expires in 30 days. If you have a question about your transaction, simply reply to this email.</p>`,
      `Please share your experience with ${ctx.agentName ?? "Savvy STR Agents"}.`
    ),
  }),

  transaction_review_received: (ctx) => ({
    subject: `New ${ctx.reviewRating ?? ""}-Star Client Review${ctx.transactionNumber ? ` — #${ctx.transactionNumber}` : ""}`,
    html: emailLayout(
      `${heading("New Client Review", "#0891B2")}
      ${subheading("Client Feedback")}
      ${greeting(ctx.recipientName)}
      ${bodyText("A client has submitted feedback about their transaction experience.")}
      ${infoCard([
        ...(ctx.reviewerName ? [`<strong style="color:${BLACK};">Reviewer</strong>&nbsp;&nbsp; ${escapeHtml(ctx.reviewerName)}`] : []),
        ...(ctx.reviewRating ? [`<strong style="color:${BLACK};">Rating</strong>&nbsp;&nbsp; <span style="font-weight:700;color:#D97706;">${escapeHtml(ctx.reviewRating)} / 5 stars</span>`] : []),
        ...(ctx.agentName ? [`<strong style="color:${BLACK};">Agent</strong>&nbsp;&nbsp; ${escapeHtml(ctx.agentName)}`] : []),
        ...(ctx.propertyAddress ? [`<strong style="color:${BLACK};">Property</strong>&nbsp;&nbsp; ${escapeHtml(ctx.propertyAddress)}`] : []),
        ...(ctx.transactionNumber ? [`<strong style="color:${BLACK};">Transaction</strong>&nbsp;&nbsp; #${escapeHtml(ctx.transactionNumber)}`] : []),
      ], "#0891B2")}
      ${ctx.reviewComment ? `<p style="margin:20px 0 7px;font-size:14px;font-weight:700;color:${BLACK};">Client comments</p><div style="background:#F9FAFB;border-radius:8px;border-left:3px solid #0FC0DF;padding:14px 16px;font-size:14px;line-height:1.6;color:#374151;white-space:pre-wrap;">${escapeHtml(ctx.reviewComment)}</div>` : `${bodyText("The client submitted a rating without written comments.")}`}
      ${ctaButton("View Reviews", APP_URL + "/reviews", "#0891B2")}`,
      `New client review${ctx.reviewRating ? `: ${ctx.reviewRating}/5 stars` : ""}`
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
      ${ctaButton("View Payout Breakdown", APP_URL + (ctx.transactionId ? `/transactions/${ctx.transactionId}` : "/transactions"))}`,
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
      ${ctaButton("View Task", APP_URL + (ctx.taskId ? `/tasks/${ctx.taskId}` : "/tasks"))}`,
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
      ${ctaButton("Complete Task", APP_URL + (ctx.taskId ? `/tasks/${ctx.taskId}` : "/tasks"), "#D97706")}`,
      `Task due soon: ${ctx.taskTitle ?? "Task"}`
    ),
  }),

  pto_request_submitted: (ctx) => ({
    subject: `PTO Approval Needed: ${ctx.employeeName ?? "Direct report"}`,
    html: emailLayout(
      `${heading("New PTO Request", "#0891B2")}
      ${subheading("PTO Approval Needed")}
      ${greeting(ctx.recipientName)}
      ${bodyText("A direct report has submitted a PTO request for your review.")}
      ${infoCard([
        `<strong style="color:${BLACK};">Employee</strong>&nbsp;&nbsp; ${escapeHtml(ctx.employeeName ?? "—")}`,
        ...(ctx.ptoType ? [`<strong style="color:${BLACK};">Type</strong>&nbsp;&nbsp; ${escapeHtml(ctx.ptoType)}`] : []),
        ...(ctx.ptoDateRange ? [`<strong style="color:${BLACK};">Dates</strong>&nbsp;&nbsp; ${escapeHtml(ctx.ptoDateRange)}`] : []),
        ...(ctx.ptoRequestedDays ? [`<strong style="color:${BLACK};">Requested</strong>&nbsp;&nbsp; ${escapeHtml(ctx.ptoRequestedDays)}`] : []),
        ...(ctx.coverageNotes ? [`<strong style="color:${BLACK};">Coverage notes</strong>&nbsp;&nbsp; ${escapeHtml(ctx.coverageNotes)}`] : []),
      ], "#0891B2")}
      ${ctaButton("Review PTO Request", APP_URL + "/pto/approvals", "#0891B2")}`,
      `New PTO request from ${ctx.employeeName ?? "a direct report"}.`
    ),
  }),

  pto_request_decision: (ctx) => {
    const approved = (ctx.decisionStatus ?? "").toLowerCase() === "approved";
    const accent = approved ? "#059669" : "#D97706";
    const decision = approved ? "approved" : "declined";
    return {
      subject: `PTO Request ${approved ? "Approved" : "Declined"}: ${ctx.ptoDateRange ?? "Your Request"}`,
      html: emailLayout(
        `${heading(`PTO Request ${approved ? "Approved" : "Declined"}`, accent)}
        ${subheading("PTO Decision")}
        ${greeting(ctx.recipientName)}
        ${bodyText(`Your manager has ${decision} your ${escapeHtml(ctx.ptoType ?? "PTO")} request.`)}
        ${infoCard([
          ...(ctx.managerName ? [`<strong style="color:${BLACK};">Manager</strong>&nbsp;&nbsp; ${escapeHtml(ctx.managerName)}`] : []),
          ...(ctx.ptoType ? [`<strong style="color:${BLACK};">Type</strong>&nbsp;&nbsp; ${escapeHtml(ctx.ptoType)}`] : []),
          ...(ctx.ptoDateRange ? [`<strong style="color:${BLACK};">Dates</strong>&nbsp;&nbsp; ${escapeHtml(ctx.ptoDateRange)}`] : []),
          ...(ctx.ptoRequestedDays ? [`<strong style="color:${BLACK};">Time requested</strong>&nbsp;&nbsp; ${escapeHtml(ctx.ptoRequestedDays)}`] : []),
          ...(ctx.decisionReason ? [`<strong style="color:${BLACK};">Manager note</strong>&nbsp;&nbsp; ${escapeHtml(ctx.decisionReason)}`] : []),
        ], accent)}
        ${ctaButton("View My PTO", APP_URL + "/pto", accent)}`,
        `Your PTO request was ${decision}.`
      ),
    };
  },

  transaction_created: (ctx) => ({
    subject: `New Transaction${ctx.transactionNumber ? ` #${ctx.transactionNumber}` : ""} Created`,
    html: emailLayout(
      `${heading("New Transaction Created")}
      ${subheading("Transaction Notification")}
      ${greeting(ctx.recipientName)}
      ${bodyText("A new transaction has been created and assigned to you in SavvyOS.")}
      ${infoCard([
        ...(ctx.transactionNumber ? [`<strong style="color:${BLACK};">Transaction</strong>&nbsp;&nbsp; #${ctx.transactionNumber}`] : []),
        ...(ctx.contactName ? [`<strong style="color:${BLACK};">Client</strong>&nbsp;&nbsp; ${escapeHtml(ctx.contactName)}`] : []),
        ...(ctx.transactionType ? [`<strong style="color:${BLACK};">Type</strong>&nbsp;&nbsp; ${escapeHtml(ctx.transactionType.charAt(0).toUpperCase() + ctx.transactionType.slice(1))}`] : []),
        ...(ctx.propertyAddress ? [`<strong style="color:${BLACK};">Property</strong>&nbsp;&nbsp; ${escapeHtml(ctx.propertyAddress)}`] : []),
        ...(ctx.amount ? [`<strong style="color:${BLACK};">Purchase Price</strong>&nbsp;&nbsp; <span style="font-weight:700;color:${CYAN};">${escapeHtml(ctx.amount)}</span>`] : []),
      ])}
      ${ctaButton("View Transaction", APP_URL + (ctx.transactionId ? `/transactions/${ctx.transactionId}` : "/transactions"))}`,
      `New transaction${ctx.transactionNumber ? ` #${ctx.transactionNumber}` : ""} created`
    ),
  }),

  listing_created: (ctx) => ({
    subject: `New Listing Created${ctx.contactName ? ` — ${ctx.contactName}` : ""}${ctx.listingAddress ? ` — ${ctx.listingAddress}` : ""}`,
    html: emailLayout(
      `${heading("New Listing Created")}
      ${subheading("Listing Notification")}
      ${greeting(ctx.recipientName)}
      ${bodyText("A new listing has been created and assigned to you in SavvyOS.")}
      ${infoCard([
        ...(ctx.listingAddress ? [`<strong style="color:${BLACK};">Property</strong>&nbsp;&nbsp; ${escapeHtml(ctx.listingAddress)}`] : []),
        ...(ctx.contactName ? [`<strong style="color:${BLACK};">Seller</strong>&nbsp;&nbsp; ${escapeHtml(ctx.contactName)}`] : []),
        ...(ctx.listPrice ? [`<strong style="color:${BLACK};">List Price</strong>&nbsp;&nbsp; <span style="font-weight:700;color:${CYAN};">${ctx.listPrice}</span>`] : []),
        ...(ctx.listingDate ? [`<strong style="color:${BLACK};">Listed</strong>&nbsp;&nbsp; ${ctx.listingDate}`] : []),
        ...(ctx.expirationDate ? [`<strong style="color:${BLACK};">Expires</strong>&nbsp;&nbsp; ${ctx.expirationDate}`] : []),
      ])}
      ${ctaButton("View Listing", APP_URL + (ctx.listingId ? `/listings/${ctx.listingId}` : "/listings"))}`,
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
      ${ctaButton("Update Listing", APP_URL + (ctx.listingId ? `/listings/${ctx.listingId}` : "/listings"), "#D97706")}`,
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
      ${ctaButton("Review Transaction", APP_URL + (ctx.transactionId ? `/transactions/${ctx.transactionId}` : "/transactions"), "#D97706")}`,
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
      ${ctaButton("Review Now", APP_URL + (ctx.transactionId ? `/transactions/${ctx.transactionId}` : "/transactions"), "#DC2626")}`,
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
      ${ctaButton("View in Pipeline", APP_URL + (ctx.connectionId ? `/pipeline/${ctx.connectionId}` : "/pipeline"))}`,
      `Connection request approved — ${ctx.contactName ?? "contact"} added to your pipeline`
    ),
  }),

  meeting_reminder: (ctx) => ({
    subject: `Pulse meeting reminder — ${ctx.pulseMeetingName ?? "Your meeting"}`,
    html: emailLayout(
      `${heading("Your Pulse meeting is coming up")}
      ${subheading(ctx.pulseMeetingName ?? "Pulse meeting")}
      ${greeting(ctx.recipientName)}
      ${bodyText("Your meeting is coming up. Add what the team needs before it starts.")}
      ${infoCard([`<strong style="color:${BLACK};">Meeting</strong>&nbsp;&nbsp; ${escapeHtml(ctx.pulseMeetingName ?? "Your Pulse meeting")}`])}
      ${ctaButton("Open Pulse", ctx.pulseActionUrl ?? APP_URL + "/pulse/meetings")}`,
      `Reminder for ${ctx.pulseMeetingName ?? "your Pulse meeting"}`
    ),
  }),

  pulse_submission_confirmation: (ctx) => ({
    subject: `Pulse weekly prep confirmed — ${ctx.pulseMeetingName ?? "Your L10"}`,
    html: emailLayout(
      `${heading("Your Pulse weekly prep is confirmed")}
      ${subheading(ctx.pulseMeetingName ?? "Pulse L10")}
      ${greeting(ctx.recipientName)}
      ${bodyText("Your current weekly preparation has been recorded. You can return to Pulse to revise it until the meeting starts.")}
      ${ctx.pulseSubmissionSummary ? infoCard([ctx.pulseSubmissionSummary]) : ""}
      ${ctaButton("Open Weekly Prep", ctx.pulseActionUrl ?? APP_URL + "/pulse/weekly-prep")}`,
      `Weekly prep confirmed for ${ctx.pulseMeetingName ?? "your L10"}`
    ),
  }),

  pulse_meeting_recap: (ctx) => ({
    subject: `L10 recap — ${ctx.pulseMeetingName ?? "Pulse meeting"}`,
    html: emailLayout(
      `${heading("Level 10 meeting recap")}
      ${subheading(ctx.pulseMeetingName ?? "Pulse L10")}
      ${greeting(ctx.recipientName)}
      ${ctx.pulseRecapHtml ?? bodyText("Your meeting recap is ready in Pulse.")}
      ${ctaButton("Open Pulse", ctx.pulseActionUrl ?? APP_URL + "/pulse")}`,
      `Recap for ${ctx.pulseMeetingName ?? "your Pulse meeting"}`
    ),
  }),

  todo_assigned: (ctx) => ({
    subject: `New Pulse to-do — ${ctx.pulseMeetingName ?? "Your meeting"}`,
    html: emailLayout(
      `${heading("You have a new Pulse to-do")}
      ${subheading(ctx.pulseMeetingName ?? "Pulse meeting")}
      ${greeting(ctx.recipientName)}
      ${bodyText("A clear next step was assigned to you.")}
      ${infoCard([
        `<strong style="color:${BLACK};">Meeting</strong>&nbsp;&nbsp; ${escapeHtml(ctx.pulseMeetingName ?? "Your Pulse meeting")}`,
        `<strong style="color:${BLACK};">To-do</strong>&nbsp;&nbsp; ${escapeHtml(ctx.pulseWorkItemTitle ?? "Open Pulse to see the next step")}`,
      ])}
      ${ctaButton("Open to-do", ctx.pulseItemUrl ?? APP_URL + "/pulse/work")}`,
      `New to-do in ${ctx.pulseMeetingName ?? "your Pulse meeting"}`
    ),
  }),

  cascade_sent: (ctx) => ({
    subject: `Pulse message needs you — ${ctx.pulseMeetingName ?? "A meeting"}`,
    html: emailLayout(
      `${heading("A Pulse message needs your acknowledgment")}
      ${subheading(ctx.pulseMeetingName ?? "Pulse meeting")}
      ${greeting(ctx.recipientName)}
      ${bodyText("Read the message, then acknowledge it in Pulse.")}
      ${infoCard([
        `<strong style="color:${BLACK};">${escapeHtml(ctx.pulseCascadeSource ?? "From a Pulse meeting")}</strong>`,
        `<strong style="color:${BLACK};">${escapeHtml(ctx.pulseCascadeDestinations ?? "To your meeting")}</strong>`,
        `<strong style="color:${BLACK};">${escapeHtml(ctx.pulseCascadeAcknowledgment ?? "0 of 0 acknowledged")}</strong>`,
      ])}
      <p style="margin:20px 0 0;font-size:15px;color:#374151;line-height:1.6;white-space:pre-wrap;">${escapeHtml(ctx.pulseCascadeBody ?? "Open Pulse to read this message.")}</p>
      ${ctaButton("Acknowledge in Pulse", ctx.pulseActionUrl ?? APP_URL + "/pulse/mission")}`,
      `Message from ${ctx.pulseMeetingName ?? "a Pulse meeting"}`
    ),
  }),

  overdue_digest: (ctx) => ({
    subject: `Your overdue Pulse work — ${ctx.pulseMeetingName ?? "Pulse"}`,
    html: emailLayout(
      `${heading("Your overdue Pulse work", "#D97706")}
      ${subheading(ctx.pulseMeetingName ?? "Pulse meeting")}
      ${greeting(ctx.recipientName)}
      ${bodyText("These to-dos are still open. Pick the next one and update it in Pulse.")}
      ${ctx.pulseOverdueList ?? bodyText("You have no overdue Pulse work.")}
      ${ctaButton("Open Pulse work", ctx.pulseActionUrl ?? APP_URL + "/pulse/work")}`,
      `Overdue work in ${ctx.pulseMeetingName ?? "Pulse"}`
    ),
  }),

  mention: (ctx) => ({
    subject: `You were mentioned in Pulse — ${ctx.pulseMeetingName ?? "Your meeting"}`,
    html: emailLayout(
      `${heading("You were mentioned in Pulse")}
      ${subheading(ctx.pulseMeetingName ?? "Pulse meeting")}
      ${greeting(ctx.recipientName)}
      ${bodyText("A teammate mentioned you in a meeting item. Open Pulse to respond.")}
      ${ctaButton("Open Pulse", ctx.pulseActionUrl ?? APP_URL + "/pulse")}`,
      `A mention in ${ctx.pulseMeetingName ?? "your Pulse meeting"}`
    ),
  }),

  rock_completed: (ctx) => ({
    subject: `Rock completed — ${ctx.pulseMeetingName ?? "Pulse"}`,
    html: emailLayout(
      `${heading("A Pulse rock was completed", "#059669")}
      ${subheading(ctx.pulseMeetingName ?? "Pulse meeting")}
      ${greeting(ctx.recipientName)}
      ${bodyText(`The rock <strong>${escapeHtml(ctx.pulseWorkItemTitle ?? "a Pulse rock")}</strong> was marked done.`)}
      ${ctaButton("Open Pulse", ctx.pulseItemUrl ?? APP_URL + "/pulse/work")}`,
      `Rock completed in ${ctx.pulseMeetingName ?? "Pulse"}`
    ),
  }),

  welcome: (ctx) => ({
    subject: `Welcome to Pulse — ${ctx.pulseMeetingName ?? "Your meeting"}`,
    html: emailLayout(
      `${heading("Welcome to Pulse")}
      ${subheading(ctx.pulseMeetingName ?? "Pulse meeting")}
      ${greeting(ctx.recipientName)}
      ${bodyText("Pulse keeps your meetings, promises, and next steps in one clear place.")}
      ${infoCard([`<strong style="color:${BLACK};">Meeting</strong>&nbsp;&nbsp; ${escapeHtml(ctx.pulseMeetingName ?? "Your Pulse meeting")}`])}
      ${ctaButton("Open Pulse", ctx.pulseActionUrl ?? APP_URL + "/pulse")}`,
      `Welcome to ${ctx.pulseMeetingName ?? "Pulse"}`
    ),
  }),

  pulse_overdue_digest: (ctx) => ({
    subject: `Your overdue Pulse work — ${ctx.pulseOverdueCount ?? "0"} item${ctx.pulseOverdueCount === "1" ? "" : "s"}`,
    html: emailLayout(
      `${heading("Your overdue Pulse work", "#D97706")}
      ${subheading("A quick weekly check-in")}
      ${greeting(ctx.recipientName)}
      ${bodyText("These to-dos are still open. Pick the next one and update it in Pulse.")}
      ${ctx.pulseOverdueList ?? bodyText("You have no overdue Pulse work.")}
      ${ctaButton("Open Pulse work", APP_URL + "/pulse/work")}`,
      `You have ${ctx.pulseOverdueCount ?? "0"} overdue Pulse work item${ctx.pulseOverdueCount === "1" ? "" : "s"}`
    ),
  }),

  pulse_rock_completed: (ctx) => ({
    subject: `Rock completed — ${ctx.pulseWorkItemTitle ?? "Pulse"}`,
    html: emailLayout(
      `${heading("A rock was completed", "#059669")}
      ${subheading(ctx.pulseMeetingName ?? "Pulse meeting")}
      ${greeting(ctx.recipientName)}
      ${bodyText(`The rock <strong>${ctx.pulseWorkItemTitle ?? "a Pulse rock"}</strong> was marked done.`)}
      ${ctaButton("Open the work item", ctx.pulseItemUrl ?? APP_URL + "/pulse/work")}`,
      `Rock completed — ${ctx.pulseWorkItemTitle ?? "Pulse"}`
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

  agent_production_report: (ctx) => ({
    subject: `Agent Production Report (${ctx.reportDate ?? "Weekly"})`,
    html: emailLayout(
      `${heading("Agent Production Report")}
      ${subheading(ctx.reportAsOf ? `As of ${ctx.reportAsOf}` : "Weekly Production Summary")}
      ${greeting(ctx.recipientName)}
      ${bodyText("Here is the current SavvyOS production snapshot for every active agent.")}
      ${ctx.reportTableHtml ?? bodyText("Production data is not available for this report.")}
      <p style="margin:18px 0 0;font-size:11px;line-height:1.5;color:${MUTED};">Current Under Contract reflects transactions currently in the Under Contract stage. New Under Contract uses contract dates from the prior seven days. Closed metrics use closing dates for each stated period.</p>
      ${ctaButton("Open SavvyOS", APP_URL + "/analytics")}`,
      `Agent production report for ${ctx.reportDate ?? "this week"}`,
      1200,
    ),
  }),

  weekly_lead_report: (ctx) => ({
    subject: ctx.weeklyLeadReportSubject ?? `Weekly Lead Report | ${ctx.weeklyLeadReportDate ?? "Current Week"}`,
    html: emailLayout(
      `${ctx.weeklyLeadReportHtml ?? bodyText("The Weekly Lead Report could not be generated. Please open SavvyOS to review lead-source performance.")}`,
      `Weekly Lead Report — ${ctx.weeklyLeadReportDate ?? "Current Week"}`,
      980,
    ),
  }),

  weekly_webinar_report: (ctx) => ({
    subject: ctx.weeklyWebinarReportSubject ?? "Upcoming Webinars | SavvyOS",
    html: emailLayout(
      `${ctx.weeklyWebinarReportHtml ?? bodyText("The upcoming webinar report could not be generated. Please open SavvyOS to review scheduled webinars.")}`,
      "Your upcoming SavvyOS webinars",
      900,
    ),
  }),

  weekly_referral_report: (ctx) => ({
    subject: ctx.weeklyReferralReportSubject ?? "Weekly Referral Report | SavvyOS",
    html: emailLayout(
      `${ctx.weeklyReferralReportHtml ?? bodyText("The weekly referral report could not be generated. Please open SavvyOS to review referrals and payment tracking.")}`,
      "Weekly outbound referral pipeline and payment tracking",
      900,
    ),
  }),

  daily_agent_report: (ctx) => ({
    subject: `Your Daily SavvyOS Report — ${ctx.dailyReportDate ?? "Today"}`,
    html: emailLayout(
      `${greeting(ctx.recipientName)}
      ${ctx.dailyReportHtml ?? bodyText("Your daily SavvyOS report could not be generated. Please open SavvyOS to review your current tasks and pipeline.")}`,
      `Your end-of-day SavvyOS priorities — ${ctx.dailyReportAsOf ?? "today"}`,
      640,
    ),
  }),

  daily_isa_activities: (ctx) => ({
    subject: ctx.dailyIsaReportSubject ?? `Daily ISA Activities | ${ctx.dailyIsaReportDate ?? "Prior Day"}`,
    html: emailLayout(
      `${ctx.dailyIsaReportHtml ?? bodyText("The Daily ISA Activities report could not be generated. Please open SavvyOS to review the ISA Dashboard.")}`,
      `Daily ISA activity report for ${ctx.dailyIsaReportDate ?? "the prior day"}`,
      720,
    ),
  }),

  monthly_agent_renewals: (ctx) => ({
    subject: ctx.monthlyRenewalsSubject ?? `Monthly Agent Renewals | ${ctx.monthlyRenewalsDate ?? "Current Month"}`,
    html: emailLayout(
      `${ctx.monthlyRenewalsHtml ?? bodyText("The monthly Agent Renewals report could not be generated. Please open SavvyOS to review the live renewal queue.")}`,
      `Monthly Agent Renewals — ${ctx.monthlyRenewalsDate ?? "current month"}`,
      800,
    ),
  }),

  coaching_weekly_accountability: (ctx) => ({
    subject: ctx.coachingReportSubject ?? `Coaching Hub Weekly Accountability | ${ctx.coachingReportDate ?? "Current Week"}`,
    html: emailLayout(
      `${ctx.coachingReportHtml ?? bodyText("The Coaching Hub accountability report could not be generated. Please open SavvyOS to review the live Coaching Hub.")}`,
      `Coaching Hub weekly accountability — ${ctx.coachingReportDate ?? "current week"}`,
      680,
    ),
  }),

  coaching_tips_for_today: (ctx) => ({
    subject: ctx.coachingTipsSubject ?? `Coaching Tips For Today | ${ctx.coachingTipsDate ?? "Today"}`,
    html: emailLayout(
      `${ctx.coachingTipsHtml ?? bodyText("The daily coaching briefing could not be generated. Please open SavvyOS Coaching Hub to review current opportunities.")}`,
      `Coaching Tips For Today — ${ctx.coachingTipsDate ?? "today"}`,
      760,
    ),
  }),

  coaching_feedback_invitation: (ctx) => ({
    subject: ctx.coachFeedbackSubject ?? "Share anonymous feedback about your coaching session",
    html: emailLayout(
      `${ctx.coachFeedbackHtml ?? bodyText("Your anonymous coaching feedback link is ready.")}`,
      "A private, anonymous coaching feedback request",
      640,
    ),
  }),

  coaching_feedback_weekly_summary: (ctx) => ({
    subject: ctx.coachFeedbackSubject ?? "Your anonymous coaching feedback — weekly aggregate",
    html: emailLayout(
      `${ctx.coachFeedbackHtml ?? bodyText("Your anonymous coaching feedback aggregate could not be generated.")}`,
      "Anonymous coaching feedback — weekly aggregate",
      760,
    ),
  }),

  webinar_marketing_request: (ctx) => ({
    subject: `New Webinar Marketing Request: ${ctx.webinarTitle ?? "Webinar"}`,
    html: emailLayout(
      `${heading("New Webinar Marketing Request", CYAN)}
      ${subheading("SavvyOS Event Operations")}
      ${greeting(ctx.recipientName ?? "Marketing Team")}
      ${webinarTemplateBody("A new webinar has been created in SavvyOS. Please coordinate the promotional plan with {{webinar_creator_name}} and use the registration link below in approved marketing.", ctx)}
      ${infoCard([
        `<strong style="color:${BLACK};">Webinar</strong>&nbsp;&nbsp; ${escapeHtml(ctx.webinarTitle ?? "—")}`,
        ...(ctx.webinarStartTime ? [`<strong style="color:${BLACK};">Start</strong>&nbsp;&nbsp; ${escapeHtml(ctx.webinarStartTime)}`] : []),
        ...(ctx.webinarDuration ? [`<strong style="color:${BLACK};">Duration</strong>&nbsp;&nbsp; ${escapeHtml(ctx.webinarDuration)}`] : []),
        ...(ctx.webinarCreatorName ? [`<strong style="color:${BLACK};">Created by</strong>&nbsp;&nbsp; ${escapeHtml(ctx.webinarCreatorName)}${ctx.webinarCreatorEmail ? ` (${escapeHtml(ctx.webinarCreatorEmail)})` : ""}`] : []),
      ])}
      ${ctx.webinarDescription ? `<p style="margin:20px 0 4px;font-size:14px;font-weight:600;color:${BLACK};">Webinar description</p><p style="margin:0;font-size:14px;color:#374151;line-height:1.6;background:#F9FAFB;border-radius:6px;padding:12px 16px;">${escapeHtml(ctx.webinarDescription)}</p>` : ""}
      ${ctx.webinarRegistrationUrl ? ctaButton("Open Registration Link", ctx.webinarRegistrationUrl) : ""}
      ${bodyText("Reply all to coordinate the marketing plan and any promotion requirements.")}`,
      `New webinar marketing request — ${ctx.webinarTitle ?? "Webinar"}`
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

  partner_portal_access: (ctx) => ({
    subject: "Your Savvy Partner Portal is ready",
    html: emailLayout(
      `${heading("Your Partner Portal Is Ready", "#0891B2")}
      ${subheading("Savvy STR Agents Partner Portal")}
      ${greeting(ctx.recipientName ?? ctx.partnerName)}
      ${bodyText("You now have secure access to the Savvy Partner Portal, where you can follow the progress of the leads you have introduced to Savvy STR Agents.")}
      ${infoCard([
        "<strong style=\"color:#0A0A0A;\">What you can view</strong>&nbsp;&nbsp; Lead status, agent connection status, assigned agents, and transaction milestones",
      ], "#0891B2")}
      ${bodyText("Use the secure link below to sign in. The link expires in 15 minutes and can only be used once. You can always request a new sign-in link from the Partner Portal page.")}
      ${ctx.partnerPortalUrl ? ctaButton("Open Partner Portal", escapeHtml(ctx.partnerPortalUrl), "#0891B2") : ""}
      <p style="margin:20px 0 0;font-size:12px;line-height:1.5;color:${MUTED};">If you were not expecting this invitation, you can safely ignore this email.</p>`,
      "Your secure Savvy Partner Portal access is ready."
    ),
  }),
};

export interface EmailDeliveryOptions {
  /** Prevent duplicate API delivery when a scheduler retries the same email. */
  idempotencyKey?: string;
  /** Dynamic reports retain their generated subject and table instead of a generic override. */
  allowTemplateOverride?: boolean;
  /** Shared-recipient messages must use ordinary authenticated app links, not a token for one recipient. */
  injectMagicLinks?: boolean;
  /** An explicitly requested template test may send even when the normal administrative sender toggle is off. */
  bypassNotificationSetting?: boolean;
}

export interface EmailDeliveryResult {
  sent: boolean;
  skipped: boolean;
  reason?: string;
}

/**
 * Notification settings control whether a type is enabled, not who receives
 * an individual event. Every sender resolves its own event-specific recipient
 * (for example, the assigned agent, task assignee, or client).
 *
 * This prevents a saved administrative audience from redirecting sensitive
 * lead, client, or transaction details to unrelated SavvyOS users.
 */
async function isNotificationDisabled(type: EmailType): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const [setting] = await db
    .select({ isEnabled: emailNotificationSettings.isEnabled })
    .from(emailNotificationSettings)
    .where(eq(emailNotificationSettings.notificationKey, type))
    .limit(1);
  return Boolean(setting && !setting.isEnabled);
}

/**
 * Generate a magic link URL that auto-logs in the recipient and redirects to the given path.
 * The token is stored in the DB and expires after 7 days.
 */
export async function generateMagicLinkUrl(recipientEmail: string, redirectPath: string = "/"): Promise<string> {
  const db = await getDb();
  if (!db) return `${APP_URL}${redirectPath}`;

  // Look up the user by email
  const [user] = await db.select().from(users).where(eq(users.email, recipientEmail)).limit(1);
  if (!user) return `${APP_URL}${redirectPath}`;

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await db.insert(magicLinkTokens).values({
    userId: user.id,
    token,
    redirectPath,
    expiresAt,
  });

  return `${APP_URL}/api/auth/magic-link?token=${token}`;
}

/**
 * Replace all APP_URL-based href links in the email HTML with magic link versions.
 * This ensures the recipient is auto-logged in when clicking any link.
 */
async function injectMagicLinks(html: string, recipientEmail: string): Promise<string> {
  const db = await getDb();
  if (!db) return html;

  // Look up the user by email
  const [user] = await db.select().from(users).where(eq(users.email, recipientEmail)).limit(1);
  if (!user) return html;

  // Find all href attributes pointing to APP_URL with a path
  const urlPattern = new RegExp(`href="${APP_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(/[^"]*)"`, 'g');
  const matches = Array.from(html.matchAll(urlPattern));

  if (matches.length === 0) return html;

  // Generate one token per unique path for cleaner tracking
  const pathTokenMap: Record<string, string> = {};

  for (const match of matches) {
    const path = match[1] || "/";
    if (!pathTokenMap[path]) {
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
      await db.insert(magicLinkTokens).values({
        userId: user.id,
        token,
        redirectPath: path,
        expiresAt,
      });
      pathTokenMap[path] = token;
    }
  }

  // Replace all matching URLs with magic link versions
  let result = html;
  for (const path of Object.keys(pathTokenMap)) {
    const token = pathTokenMap[path];
    const originalUrl = `${APP_URL}${path}`;
    const magicUrl = `${APP_URL}/api/auth/magic-link?token=${token}`;
    result = result.split(`href="${originalUrl}"`).join(`href="${magicUrl}"`);
  }

  // Also handle bare APP_URL without a path (e.g. href="https://os.savvy-agents.com")
  if (result.includes(`href="${APP_URL}"`)) {
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await db.insert(magicLinkTokens).values({
      userId: user.id,
      token,
      redirectPath: "/",
      expiresAt,
    });
    result = result.split(`href="${APP_URL}"`).join(`href="${APP_URL}/api/auth/magic-link?token=${token}"`);
  }

  return result;
}

/**
 * Send a transactional email via Resend. Existing callers can ignore the
 * result; schedulers can use it to persist a truthful delivery outcome.
 */
export async function sendTransactionalEmail(
  type: EmailType,
  ctx: EmailContext,
  options: EmailDeliveryOptions = {},
): Promise<EmailDeliveryResult> {
  const resend = getResend();
  if (!resend) {
    console.warn("[Resend] API key not configured — skipping email");
    return { sent: false, skipped: true, reason: "Resend API key is not configured" };
  }

  // An explicit settings-page test is the only permitted bypass. Production
  // delivery honors the type's enable toggle while preserving the recipient(s)
  // selected by the event-specific sender.
  if (!options.bypassNotificationSetting) try {
    if (await isNotificationDisabled(type)) {
      console.info(`[Resend] Email type "${type}" is disabled via admin settings — skipping`);
      return { sent: false, skipped: true, reason: "Email notification is disabled" };
    }
  } catch (settingErr) {
    // Fail open: a transient settings read must not block a system notification.
    console.warn("[Resend] Could not resolve notification settings:", settingErr);
  }

  try {
    const hardcoded = TEMPLATES[type](ctx);
    let subject = hardcoded.subject;
    let html = hardcoded.html;

    // Check for an admin-edited template override unless this is a live data report.
    if (options.allowTemplateOverride !== false) {
      try {
        const db = await getDb();
        if (db) {
          const [override] = await db.select().from(emailTemplates).where(eq(emailTemplates.emailType, type)).limit(1);
          if (override) {
            if (type === "webinar_marketing_request") {
              subject = replaceWebinarTemplateTokens(override.subject, ctx);
              html = replaceWebinarTemplateBody(hardcoded.html, override.bodyText, ctx);
            } else {
              subject = override.subject;
              const escapedBody = override.bodyText.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
              html = hardcoded.html.replace(
                /<p style="[^"]*color:[^"]*#6B7280[^"]*">[^<]*<\/p>/,
                `<p style="font-size:15px;line-height:1.6;color:#374151;margin:0 0 20px;">${escapedBody}</p>`,
              );
            }
          }
        }
      } catch (dbErr) {
        console.warn("[Resend] Could not load template override:", dbErr);
      }
    }

    // Shared-recipient messages may deliberately use ordinary authenticated links.
    if (options.injectMagicLinks !== false) {
      try {
        html = await injectMagicLinks(html, ctx.recipientEmail);
      } catch (mlErr) {
        console.warn("[Resend] Magic link injection failed (sending without):", mlErr);
      }
    }

    const sendOptions: Parameters<typeof resend.emails.send>[0] = {
      from: FROM_ADDRESS,
      to: ctx.recipientEmail,
      subject,
      html,
      ...(ctx.ccEmails?.length ? { cc: ctx.ccEmails } : ctx.ccEmail ? { cc: [ctx.ccEmail] } : {}),
      ...(ctx.replyToEmail ? { replyTo: ctx.replyToEmail } : {}),
    };
    const result = await resend.emails.send(
      sendOptions,
      options.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : undefined,
    );
    if (result.error) {
      const sdkReason = result.error.message ?? "Resend rejected the email";
      console.error("[Resend] SDK send error; attempting direct provider fallback:", result.error);
      const fallback = await sendViaResendHttpFallback({
        to: ctx.recipientEmail,
        ...(ctx.ccEmails?.length ? { cc: ctx.ccEmails } : ctx.ccEmail ? { cc: [ctx.ccEmail] } : {}),
        ...(ctx.replyToEmail ? { replyTo: ctx.replyToEmail } : {}),
        subject,
        html,
        idempotencyKey: options.idempotencyKey,
      });
      if (fallback.sent) {
        console.info("[Resend] Direct provider fallback succeeded.");
        return { sent: true, skipped: false };
      }
      return { sent: false, skipped: false, reason: `${sdkReason}; fallback failed: ${fallback.reason ?? "unknown error"}` };
    }

    return { sent: true, skipped: false };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error("[Resend] Failed to send email:", err);
    return { sent: false, skipped: false, reason };
  }
}

/**
 * Return the rendered HTML and subject for a given email type without sending.
 * Used for preview in the Email Test admin page.
 */
export function getEmailPreview(type: EmailType, ctx: EmailContext): { subject: string; html: string } {
  return TEMPLATES[type](ctx);
}
