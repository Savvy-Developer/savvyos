import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import {
  scheduledReportRuns,
  users,
  vendorBillingPayments,
  vendorFeaturedSubscriptions,
  vendors,
} from "../drizzle/schema";
import { getDb } from "./db";
import {
  easternDateKey,
  easternDateTimeToUtc,
  getEasternTimeParts,
} from "./agentProductionReportScheduler";
import {
  FEATURED_VENDOR_LEADERSHIP_EMAILS,
  calculateAgentEarningsCents,
  formatUsdFromCents,
  isStripeConfigured,
} from "./vendorBilling";
import { sendTransactionalEmail } from "./_core/resendEmail";

const EASTERN_TIME_ZONE = "America/New_York";
const REPORT_KEY = "monthly_featured_vendor_earnings";
const REPORT_HOUR = 9;
const STALE_RUN_MS = 60 * 60 * 1000;
// Node clamps a timeout above ~24.8 days to 1 ms. Recheck daily so a report
// scheduled more than 24 days away cannot accidentally fire immediately.
const MAX_TIMER_DELAY_MS = 24 * 60 * 60 * 1000;
const APP_URL = "https://os.savvy-agents.com";

export interface FeaturedVendorPaymentRow {
  paymentId: number;
  vendorName: string;
  amountPaidCents: number;
  agentEarningsCents: number;
  paidAt: Date;
}

export interface FeaturedVendorAgentEarningsRow {
  agentId: number;
  agentName: string;
  agentEmail: string;
  payments: FeaturedVendorPaymentRow[];
  grossCollectedCents: number;
  agentEarningsCents: number;
  savvyShareCents: number;
}

export interface FeaturedVendorMonthlyEarningsReport {
  reportDate: string;
  reportDateLabel: string;
  periodStart: Date;
  periodEnd: Date;
  periodLabel: string;
  agents: FeaturedVendorAgentEarningsRow[];
  grossCollectedCents: number;
  agentEarningsCents: number;
  savvyShareCents: number;
  leadershipRecipients: Array<{ name: string; email: string }>;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN_TIME_ZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(value);
}

function formatMonth(value: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN_TIME_ZONE,
    month: "long",
    year: "numeric",
  }).format(value);
}

export function previousEasternMonthWindow(asOf = new Date()): { periodStart: Date; periodEnd: Date; periodLabel: string } {
  const eastern = getEasternTimeParts(asOf);
  let year = eastern.year;
  let month = eastern.month - 1;
  if (month === 0) {
    month = 12;
    year -= 1;
  }
  const periodStart = easternDateTimeToUtc(`${year}-${String(month).padStart(2, "0")}-01`, 0);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextMonthYear = month === 12 ? year + 1 : year;
  const periodEnd = easternDateTimeToUtc(`${nextMonthYear}-${String(nextMonth).padStart(2, "0")}-01`, 0);
  return { periodStart, periodEnd, periodLabel: formatMonth(periodStart) };
}

function leadershipSummaryRows(report: FeaturedVendorMonthlyEarningsReport): string {
  if (report.agents.length === 0) return `<tr><td colspan="4" style="padding:15px 0;color:#6B7280;font-size:13px;">No featured-vendor subscription payments were received in this period.</td></tr>`;
  return report.agents.map((agent) => `<tr>
    <td style="padding:11px 0;border-bottom:1px solid #E5E7EB;font-size:13px;font-weight:700;color:#111827;">${escapeHtml(agent.agentName)}</td>
    <td style="padding:11px 8px;border-bottom:1px solid #E5E7EB;font-size:12px;color:#4B5563;">${agent.payments.length}</td>
    <td style="padding:11px 8px;border-bottom:1px solid #E5E7EB;text-align:right;font-size:12px;color:#374151;">${formatUsdFromCents(agent.grossCollectedCents)}</td>
    <td style="padding:11px 0 11px 8px;border-bottom:1px solid #E5E7EB;text-align:right;font-size:13px;font-weight:700;color:#047857;">${formatUsdFromCents(agent.agentEarningsCents)}</td>
  </tr>`).join("");
}

function paymentRows(payments: FeaturedVendorPaymentRow[]): string {
  if (payments.length === 0) return `<tr><td colspan="3" style="padding:15px 0;color:#6B7280;font-size:13px;">No featured-vendor payments were received in this period.</td></tr>`;
  return payments.map((payment) => `<tr>
    <td style="padding:11px 0;border-bottom:1px solid #E5E7EB;font-size:13px;font-weight:700;color:#111827;">${escapeHtml(payment.vendorName)}</td>
    <td style="padding:11px 8px;border-bottom:1px solid #E5E7EB;font-size:12px;color:#4B5563;">${escapeHtml(formatDate(payment.paidAt))}</td>
    <td style="padding:11px 0 11px 8px;border-bottom:1px solid #E5E7EB;text-align:right;font-size:13px;font-weight:700;color:#047857;">${formatUsdFromCents(payment.agentEarningsCents)}</td>
  </tr>`).join("");
}

export function renderFeaturedVendorLeadershipReport(report: FeaturedVendorMonthlyEarningsReport): string {
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <div style="font-size:22px;font-weight:700;color:#111827;line-height:1.25;">Featured Vendor Earnings</div>
    <div style="font-size:12px;color:#6B7280;margin-top:5px;line-height:1.5;">${escapeHtml(report.periodLabel)} collections · report generated ${escapeHtml(report.reportDateLabel)}</div>
    <div style="margin:25px 0 9px;font-size:15px;font-weight:700;color:#111827;">At a glance</div>
    <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation"><tr>
      <td width="33.33%" style="padding:5px;vertical-align:top;"><div style="border:1px solid #E5E7EB;border-radius:8px;padding:14px;background:#FFFFFF;"><div style="font-size:22px;font-weight:700;color:#111827;line-height:1.1;">${formatUsdFromCents(report.grossCollectedCents)}</div><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.45px;color:#6B7280;margin-top:5px;">Gross collected</div></div></td>
      <td width="33.33%" style="padding:5px;vertical-align:top;"><div style="border:1px solid #BBF7D0;border-radius:8px;padding:14px;background:#F0FDF4;"><div style="font-size:22px;font-weight:700;color:#047857;line-height:1.1;">${formatUsdFromCents(report.agentEarningsCents)}</div><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.45px;color:#047857;margin-top:5px;">Agent payouts due (75%)</div></div></td>
      <td width="33.33%" style="padding:5px;vertical-align:top;"><div style="border:1px solid #E5E7EB;border-radius:8px;padding:14px;background:#FFFFFF;"><div style="font-size:22px;font-weight:700;color:#0F7490;line-height:1.1;">${formatUsdFromCents(report.savvyShareCents)}</div><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.45px;color:#6B7280;margin-top:5px;">Savvy share (25%)</div></div></td>
    </tr></table>
    <div style="margin:29px 0 8px;font-size:15px;font-weight:700;color:#111827;">Agent payout detail</div>
    <div style="font-size:12px;color:#6B7280;line-height:1.5;margin-bottom:8px;">Pay each agent the amount in the final column. Stripe processing fees are not deducted from these reported revenue shares.</div>
    <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation"><thead><tr>
      <th align="left" style="padding:8px 0;border-bottom:1px solid #D1D5DB;font-size:10px;text-transform:uppercase;letter-spacing:.45px;color:#6B7280;">Agent</th>
      <th align="left" style="padding:8px;border-bottom:1px solid #D1D5DB;font-size:10px;text-transform:uppercase;letter-spacing:.45px;color:#6B7280;">Paid vendors</th>
      <th align="right" style="padding:8px;border-bottom:1px solid #D1D5DB;font-size:10px;text-transform:uppercase;letter-spacing:.45px;color:#6B7280;">Gross</th>
      <th align="right" style="padding:8px 0 8px 8px;border-bottom:1px solid #D1D5DB;font-size:10px;text-transform:uppercase;letter-spacing:.45px;color:#6B7280;">Amount due</th>
    </tr></thead><tbody>${leadershipSummaryRows(report)}</tbody></table>
    <table cellpadding="0" cellspacing="0" border="0" style="margin:27px 0 0;" role="presentation"><tr><td style="background:#0FC0DF;border-radius:7px;"><a href="${APP_URL}/admin/vendors" style="display:inline-block;padding:12px 22px;color:#0A0A0A;font-size:14px;font-weight:700;text-decoration:none;">Open Vendor Lists</a></td></tr></table>
  </div>`;
}

export function renderAgentFeaturedVendorEarningsReport(report: Pick<FeaturedVendorMonthlyEarningsReport, "periodLabel">, agent: FeaturedVendorAgentEarningsRow): string {
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <div style="font-size:22px;font-weight:700;color:#111827;line-height:1.25;">Your Featured Vendor Earnings</div>
    <div style="font-size:12px;color:#6B7280;margin-top:5px;line-height:1.5;">${escapeHtml(report.periodLabel)} collections</div>
    <div style="margin:25px 0 18px;border:1px solid #BBF7D0;border-radius:8px;padding:16px 18px;background:#F0FDF4;"><div style="font-size:27px;font-weight:700;color:#047857;line-height:1.1;">${formatUsdFromCents(agent.agentEarningsCents)}</div><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.45px;color:#047857;margin-top:6px;">Your 75% earnings</div></div>
    <div style="font-size:13px;color:#374151;line-height:1.55;margin-bottom:8px;">This report includes completed Stripe payments from your featured vendors. Your earnings equal 75% of the gross payment collected; Savvy will process payment separately.</div>
    <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation"><thead><tr>
      <th align="left" style="padding:8px 0;border-bottom:1px solid #D1D5DB;font-size:10px;text-transform:uppercase;letter-spacing:.45px;color:#6B7280;">Vendor</th>
      <th align="left" style="padding:8px;border-bottom:1px solid #D1D5DB;font-size:10px;text-transform:uppercase;letter-spacing:.45px;color:#6B7280;">Payment date</th>
      <th align="right" style="padding:8px 0 8px 8px;border-bottom:1px solid #D1D5DB;font-size:10px;text-transform:uppercase;letter-spacing:.45px;color:#6B7280;">Your earnings</th>
    </tr></thead><tbody>${paymentRows(agent.payments)}</tbody></table>
    <table cellpadding="0" cellspacing="0" border="0" style="margin:27px 0 0;" role="presentation"><tr><td style="background:#0FC0DF;border-radius:7px;"><a href="${APP_URL}/vendors" style="display:inline-block;padding:12px 22px;color:#0A0A0A;font-size:14px;font-weight:700;text-decoration:none;">Open My Vendor List</a></td></tr></table>
  </div>`;
}

async function getLeadershipRecipients(): Promise<Array<{ name: string; email: string }>> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable while preparing featured vendor report recipients.");
  const rows = await db.select({ name: users.name, email: users.email }).from(users)
    .where(and(inArray(users.email, [...FEATURED_VENDOR_LEADERSHIP_EMAILS]), eq(users.isActive, true)));
  const byEmail = new Map(rows.filter((row) => row.email).map((row) => [row.email!.toLowerCase(), row]));
  const missing = FEATURED_VENDOR_LEADERSHIP_EMAILS.filter((email) => !byEmail.has(email));
  if (missing.length) throw new Error(`Featured Vendor leadership recipient account(s) missing or inactive: ${missing.join(", ")}`);
  return FEATURED_VENDOR_LEADERSHIP_EMAILS.map((email) => {
    const recipient = byEmail.get(email)!;
    return { name: recipient.name?.trim() || email, email };
  });
}

/** Builds the prior calendar-month earnings report from successfully paid Stripe invoices. */
export async function buildMonthlyFeaturedVendorEarningsReport(asOf = new Date()): Promise<FeaturedVendorMonthlyEarningsReport> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable while building the featured vendor report.");
  const eastern = getEasternTimeParts(asOf);
  const reportDate = easternDateKey(eastern);
  const window = previousEasternMonthWindow(asOf);
  const [payments, billingAgents, leadershipRecipients] = await Promise.all([
    db.select({
      paymentId: vendorBillingPayments.id,
      amountPaidCents: vendorBillingPayments.amountPaidCents,
      agentEarningsCents: vendorBillingPayments.agentEarningsCents,
      paidAt: vendorBillingPayments.paidAt,
      agentId: vendorFeaturedSubscriptions.agentId,
      agentName: users.name,
      agentEmail: users.email,
      vendorName: vendors.businessName,
    }).from(vendorBillingPayments)
      .innerJoin(vendorFeaturedSubscriptions, eq(vendorBillingPayments.vendorFeaturedSubscriptionId, vendorFeaturedSubscriptions.id))
      .innerJoin(users, eq(vendorFeaturedSubscriptions.agentId, users.id))
      .innerJoin(vendors, eq(vendorFeaturedSubscriptions.vendorId, vendors.id))
      .where(and(
        eq(vendorBillingPayments.paymentStatus, "paid"),
        gte(vendorBillingPayments.paidAt, window.periodStart),
        lt(vendorBillingPayments.paidAt, window.periodEnd),
      ))
      .orderBy(asc(users.name), asc(vendors.businessName), asc(vendorBillingPayments.paidAt)),
    db.select({ agentId: users.id, agentName: users.name, agentEmail: users.email })
      .from(vendorFeaturedSubscriptions)
      .innerJoin(users, eq(vendorFeaturedSubscriptions.agentId, users.id))
      .where(and(
        eq(users.isActive, true),
        inArray(vendorFeaturedSubscriptions.billingStatus, ["pending_checkout", "checkout_complete", "active", "past_due", "unpaid", "paused", "incomplete"]),
      ))
      .groupBy(users.id, users.name, users.email),
    getLeadershipRecipients(),
  ]);

  const byAgent = new Map<number, FeaturedVendorAgentEarningsRow>();
  for (const payment of payments) {
    if (!payment.agentEmail || !payment.paidAt) continue;
    const amountPaidCents = Number(payment.amountPaidCents);
    const storedEarnings = Number(payment.agentEarningsCents);
    const earnings = Number.isFinite(storedEarnings) ? storedEarnings : calculateAgentEarningsCents(amountPaidCents);
    const agent = byAgent.get(payment.agentId) ?? {
      agentId: payment.agentId,
      agentName: payment.agentName?.trim() || payment.agentEmail,
      agentEmail: payment.agentEmail,
      payments: [],
      grossCollectedCents: 0,
      agentEarningsCents: 0,
      savvyShareCents: 0,
    };
    agent.payments.push({
      paymentId: payment.paymentId,
      vendorName: payment.vendorName,
      amountPaidCents,
      agentEarningsCents: earnings,
      paidAt: payment.paidAt,
    });
    agent.grossCollectedCents += amountPaidCents;
    agent.agentEarningsCents += earnings;
    agent.savvyShareCents += amountPaidCents - earnings;
    byAgent.set(payment.agentId, agent);
  }
  for (const agent of billingAgents) {
    if (!agent.agentEmail || byAgent.has(agent.agentId)) continue;
    byAgent.set(agent.agentId, {
      agentId: agent.agentId,
      agentName: agent.agentName?.trim() || agent.agentEmail,
      agentEmail: agent.agentEmail,
      payments: [],
      grossCollectedCents: 0,
      agentEarningsCents: 0,
      savvyShareCents: 0,
    });
  }
  const agents = Array.from(byAgent.values()).sort((a, b) => a.agentName.localeCompare(b.agentName));
  return {
    reportDate,
    reportDateLabel: formatDate(asOf),
    periodStart: window.periodStart,
    periodEnd: window.periodEnd,
    periodLabel: window.periodLabel,
    agents,
    grossCollectedCents: agents.reduce((sum, agent) => sum + agent.grossCollectedCents, 0),
    agentEarningsCents: agents.reduce((sum, agent) => sum + agent.agentEarningsCents, 0),
    savvyShareCents: agents.reduce((sum, agent) => sum + agent.savvyShareCents, 0),
    leadershipRecipients,
  };
}

async function claimReportRun(reportDate: string): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable for featured vendor report tracking.");
  const [run] = await db.select().from(scheduledReportRuns)
    .where(and(eq(scheduledReportRuns.reportKey, REPORT_KEY), eq(scheduledReportRuns.reportDate, reportDate)))
    .limit(1);
  if (run?.status === "sent") return false;
  if (run?.status === "running" && Date.now() - run.startedAt.getTime() < STALE_RUN_MS) return false;
  if (run) {
    await db.update(scheduledReportRuns).set({
      status: "running", startedAt: new Date(), completedAt: null,
      recipientCount: 0, successfulRecipientCount: 0, errorMessage: null,
    }).where(eq(scheduledReportRuns.id, run.id));
    return true;
  }
  try {
    await db.insert(scheduledReportRuns).values({ reportKey: REPORT_KEY, reportDate, status: "running", startedAt: new Date() });
    return true;
  } catch (error) {
    console.warn("[FeaturedVendorEarnings] Report run was claimed by another process.", error);
    return false;
  }
}

async function finalizeReportRun(
  reportDate: string,
  status: "sent" | "partial" | "failed" | "skipped",
  recipientCount: number,
  successfulRecipientCount: number,
  errorMessage?: string,
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(scheduledReportRuns).set({
    status,
    recipientCount,
    successfulRecipientCount,
    errorMessage: errorMessage ?? null,
    completedAt: new Date(),
  }).where(and(eq(scheduledReportRuns.reportKey, REPORT_KEY), eq(scheduledReportRuns.reportDate, reportDate)));
}

/** Emails the leadership summary and private 75% earnings statement to each agent with paid vendor revenue. */
export async function sendMonthlyFeaturedVendorEarningsReport(asOf = new Date()): Promise<void> {
  if (!isStripeConfigured()) {
    console.info("[FeaturedVendorEarnings] Stripe is not configured; monthly report scheduler is idle.");
    return;
  }
  const reportDate = easternDateKey(getEasternTimeParts(asOf));
  if (!(await claimReportRun(reportDate))) {
    console.info(`[FeaturedVendorEarnings] ${reportDate} already handled; skipping duplicate run.`);
    return;
  }
  try {
    const report = await buildMonthlyFeaturedVendorEarningsReport(asOf);
    const primaryRecipient = report.leadershipRecipients[0];
    const copiedRecipients = report.leadershipRecipients.slice(1);
    const outcomes: Array<{ recipient: string; sent: boolean; reason?: string }> = [];
    const leadershipDelivery = await sendTransactionalEmail("monthly_featured_vendor_earnings", {
      recipientName: primaryRecipient.name,
      recipientEmail: primaryRecipient.email,
      ccEmails: copiedRecipients.map((recipient) => recipient.email),
      featuredVendorEarningsDate: report.periodLabel,
      featuredVendorEarningsHtml: renderFeaturedVendorLeadershipReport(report),
      featuredVendorEarningsSubject: `Featured Vendor Earnings | ${report.periodLabel}`,
    }, {
      allowTemplateOverride: false,
      injectMagicLinks: false,
      idempotencyKey: `${REPORT_KEY}:${reportDate}:leadership`,
    });
    outcomes.push({ recipient: primaryRecipient.email, sent: leadershipDelivery.sent, reason: leadershipDelivery.reason });

    for (const agent of report.agents) {
      const delivery = await sendTransactionalEmail("agent_featured_vendor_earnings", {
        recipientName: agent.agentName,
        recipientEmail: agent.agentEmail,
        featuredVendorEarningsDate: report.periodLabel,
        featuredVendorEarningsHtml: renderAgentFeaturedVendorEarningsReport(report, agent),
        featuredVendorEarningsSubject: `Your Featured Vendor Earnings | ${report.periodLabel}`,
      }, {
        allowTemplateOverride: false,
        idempotencyKey: `${REPORT_KEY}:${reportDate}:agent:${agent.agentId}`,
      });
      outcomes.push({ recipient: agent.agentEmail, sent: delivery.sent, reason: delivery.reason });
    }

    const successfulRecipientCount = outcomes.filter((outcome) => outcome.sent).length;
    const failures = outcomes.filter((outcome) => !outcome.sent).map((outcome) => `${outcome.recipient}: ${outcome.reason ?? "not delivered"}`);
    await finalizeReportRun(
      reportDate,
      failures.length ? (successfulRecipientCount ? "partial" : "failed") : "sent",
      outcomes.length,
      successfulRecipientCount,
      failures.join(" | ") || undefined,
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await finalizeReportRun(reportDate, "failed", 0, 0, reason);
    console.error("[FeaturedVendorEarnings] Monthly report delivery failed:", error);
  }
}

/** Returns the next first-of-month 9:00 AM America/New_York execution time, including DST. */
export function getNextMonthlyFeaturedVendorEarningsAt9AmEastern(now = new Date()): Date {
  const eastern = getEasternTimeParts(now);
  let year = eastern.year;
  let month = eastern.month;
  const isPastRun = eastern.day > 1
    || (eastern.day === 1 && (eastern.hour > REPORT_HOUR || (eastern.hour === REPORT_HOUR && (eastern.minute > 0 || eastern.second > 0))));
  if (isPastRun) {
    month += 1;
    if (month === 13) { month = 1; year += 1; }
  }
  return easternDateTimeToUtc(`${year}-${String(month).padStart(2, "0")}-01`, REPORT_HOUR);
}

let schedulerTimer: NodeJS.Timeout | undefined;
let startupRecoveryTimer: NodeJS.Timeout | undefined;

function scheduleNextReport(): void {
  if (schedulerTimer) clearTimeout(schedulerTimer);
  const nextRun = getNextMonthlyFeaturedVendorEarningsAt9AmEastern();
  const delay = Math.max(nextRun.getTime() - Date.now(), 1_000);
  console.info(`[FeaturedVendorEarnings] Next report scheduled for ${nextRun.toLocaleString("en-US", { timeZone: EASTERN_TIME_ZONE })}.`);
  schedulerTimer = setTimeout(async () => {
    // On long waits this is a daily recheck; deliver only when the intended
    // first-of-month execution time is actually due.
    if (Date.now() >= nextRun.getTime()) await sendMonthlyFeaturedVendorEarningsReport();
    scheduleNextReport();
  }, Math.min(delay, MAX_TIMER_DELAY_MS));
}

/** Schedules featured vendor earnings reports for 9:00 AM Eastern on the first of each month. */
export function scheduleMonthlyFeaturedVendorEarningsReport(): void {
  scheduleNextReport();
  if (startupRecoveryTimer) clearTimeout(startupRecoveryTimer);
  startupRecoveryTimer = setTimeout(() => {
    const eastern = getEasternTimeParts();
    if (eastern.day === 1 && eastern.hour >= REPORT_HOUR) {
      sendMonthlyFeaturedVendorEarningsReport().catch((error) =>
        console.error("[FeaturedVendorEarnings] First-of-month startup recovery failed:", error),
      );
    }
  }, 45_000);
}
