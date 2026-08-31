import { and, asc, desc, eq, gte, inArray, isNotNull, lt, sql } from "drizzle-orm";
import {
  contacts,
  referralAgents,
  referralPayments,
  referrals,
  referralStatusOptions,
  scheduledReportRuns,
  users,
  webinarAttendees,
  webinars,
} from "../drizzle/schema";
import { getDb } from "./db";
import { sendTransactionalEmail } from "./_core/resendEmail";
import {
  addEasternDays,
  easternDateKey,
  easternDateTimeToUtc,
  getEasternTimeParts,
  type EasternTimeParts,
} from "./agentProductionReportScheduler";

const EASTERN_TIME_ZONE = "America/New_York";
const APP_URL = "https://os.savvy-agents.com";
const MONDAY_INDEX = 1;
const REPORT_HOUR = 12;
const STALE_RUN_MS = 60 * 60 * 1000;
const WEBINAR_REPORT_KEY = "weekly_webinar_report";
const REFERRAL_REPORT_KEY = "weekly_referral_report";

const REFERRAL_RECIPIENTS = [
  { name: "Marcus", email: "marcusclay@savvy.realty" },
  { name: "Elana", email: "elana@savvy.realty" },
  { name: "Amy Rollins", email: "amyrollins@savvy.realty" },
  { name: "Dyl", email: "dyl@savvy.realty" },
  { name: "Tyler", email: "tyler@savvy.realty" },
] as const;

type Weekday = EasternTimeParts["weekday"];

export interface WeeklyWebinarRow {
  id: number;
  title: string;
  startTime: Date;
  timezone: string;
  createdBy: string;
  registeredAttendees: number;
}

export interface WeeklyWebinarReport {
  reportDateKey: string;
  asOfLabel: string;
  rows: WeeklyWebinarRow[];
}

export interface WeeklyReferralRow {
  id: number;
  clientName: string;
  referralAgent: string;
  brokerage: string | null;
  market: string | null;
  status: string;
  statusKey: string;
  referralSentAt: Date;
  underContractAt: Date | null;
  closedAt: Date | null;
}

export interface WeeklyReferralPaymentRow extends WeeklyReferralRow {
  paymentId: number | null;
  paymentStatus: string;
  feeOwed: number;
  dueAt: Date | null;
  paymentNote: string | null;
}

export interface WeeklyReferralReport {
  reportDateKey: string;
  weekLabel: string;
  asOfLabel: string;
  sent: WeeklyReferralRow[];
  underContract: WeeklyReferralRow[];
  closedLast30Days: WeeklyReferralRow[];
  unpaid: WeeklyReferralPaymentRow[];
}

function weekdayIndex(weekday: Weekday): number {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
}

/** Return the next Monday at noon in SavvyOS's reporting timezone, with DST support. */
export function getNextMondayAtNoonEastern(now = new Date()): Date {
  const eastern = getEasternTimeParts(now);
  const daysUntilMonday = (MONDAY_INDEX - weekdayIndex(eastern.weekday) + 7) % 7;
  let targetDate = addEasternDays(easternDateKey(eastern), daysUntilMonday);

  if (
    daysUntilMonday === 0 &&
    (eastern.hour > REPORT_HOUR ||
      (eastern.hour === REPORT_HOUR && (eastern.minute > 0 || eastern.second > 0)) ||
      (eastern.hour === REPORT_HOUR && eastern.minute === 0 && eastern.second === 0))
  ) {
    targetDate = addEasternDays(targetDate, 7);
  }

  return easternDateTimeToUtc(targetDate, REPORT_HOUR);
}

function numberValue(value: string | number | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(value: Date | null | undefined, options: Intl.DateTimeFormatOptions = {}): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN_TIME_ZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
    ...options,
  }).format(value);
}

function formatWebinarTime(value: Date, timezone: string): string {
  const options: Intl.DateTimeFormatOptions = { timeZone: timezone || EASTERN_TIME_ZONE, hour: "numeric", minute: "2-digit", timeZoneName: "short" };
  try {
    return new Intl.DateTimeFormat("en-US", options).format(value);
  } catch {
    return new Intl.DateTimeFormat("en-US", { ...options, timeZone: EASTERN_TIME_ZONE }).format(value);
  }
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function reportDateParts(asOf: Date) {
  const eastern = getEasternTimeParts(asOf);
  const reportDateKey = easternDateKey(eastern);
  const reportEnd = easternDateTimeToUtc(addEasternDays(reportDateKey, 1), 0);
  const weeklyStart = easternDateTimeToUtc(addEasternDays(reportDateKey, -6), 0);
  const closed30Start = easternDateTimeToUtc(addEasternDays(reportDateKey, -29), 0);
  const asOfLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN_TIME_ZONE,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(asOf);
  const weekLabel = `${formatDate(weeklyStart, { month: "short", day: "numeric" })}–${formatDate(new Date(reportEnd.getTime() - 1), { month: "short", day: "numeric", year: "numeric" })}`;
  return { reportDateKey, reportEnd, weeklyStart, closed30Start, asOfLabel, weekLabel };
}

/** Build the Monday company webinar listing from the current SavvyOS/Zoom attendee ledger. */
export async function buildWeeklyWebinarReport(asOf = new Date()): Promise<WeeklyWebinarReport> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available for the weekly webinar report.");

  const { reportDateKey, asOfLabel } = reportDateParts(asOf);
  const [webinarRows, attendeeCounts] = await Promise.all([
    db.select({
      webinar: webinars,
      creatorName: users.name,
      creatorEmail: users.email,
    })
      .from(webinars)
      .leftJoin(users, eq(webinars.createdById, users.id))
      .where(and(
        gte(webinars.startTime, asOf),
        inArray(webinars.status, ["scheduled", "live"]),
      ))
      .orderBy(asc(webinars.startTime)),
    db.select({
      webinarId: webinarAttendees.webinarId,
      registered: sql<number>`SUM(CASE WHEN ${webinarAttendees.status} IN ('registered', 'approved') THEN 1 ELSE 0 END)`.as("registered"),
    })
      .from(webinarAttendees)
      .groupBy(webinarAttendees.webinarId),
  ]);

  const registrations = new Map(
    attendeeCounts.map((row) => [row.webinarId, Number(row.registered ?? 0)]),
  );

  return {
    reportDateKey,
    asOfLabel,
    rows: webinarRows.map((row) => ({
      id: row.webinar.id,
      title: row.webinar.title,
      startTime: row.webinar.startTime,
      timezone: row.webinar.timezone || EASTERN_TIME_ZONE,
      createdBy: row.creatorName?.trim() || row.creatorEmail?.trim() || "Unknown",
      registeredAttendees: registrations.get(row.webinar.id) ?? 0,
    })),
  };
}

/** Resolve all active, sign-in-enabled company recipients for the webinar report. */
async function getCompanyWebinarRecipients() {
  const db = await getDb();
  if (!db) throw new Error("Database is not available for webinar report recipients.");
  const rows = await db.select({ name: users.name, email: users.email })
    .from(users)
    .where(and(
      eq(users.isActive, true),
      eq(users.personType, "full_user"),
      isNotNull(users.email),
      inArray(users.role, ["admin", "isa", "agent"]),
    ))
    .orderBy(asc(users.name));
  return rows
    .map((row) => ({ name: row.name?.trim() || row.email?.trim() || "SavvyOS member", email: row.email?.trim() || "" }))
    .filter((row) => Boolean(row.email));
}

function toReferralRow(row: {
  referral: typeof referrals.$inferSelect;
  contact: Pick<typeof contacts.$inferSelect, "firstName" | "lastName">;
  referralAgent: Pick<typeof referralAgents.$inferSelect, "name" | "brokerage">;
  statusName: string | null;
}): WeeklyReferralRow {
  return {
    id: row.referral.id,
    clientName: [row.contact.firstName, row.contact.lastName].filter(Boolean).join(" ").trim() || "Unnamed client",
    referralAgent: row.referralAgent.name,
    brokerage: row.referralAgent.brokerage,
    market: row.referral.market || row.referral.metro || row.referral.state || null,
    status: row.statusName || row.referral.statusKey.replace(/_/g, " "),
    statusKey: row.referral.statusKey,
    referralSentAt: row.referral.referralSentAt,
    underContractAt: row.referral.underContractAt,
    closedAt: row.referral.closedAt,
  };
}

/** Build the weekly outbound referral pipeline, close, and payment-collection report. */
export async function buildWeeklyReferralReport(asOf = new Date()): Promise<WeeklyReferralReport> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available for the weekly referral report.");

  const { reportDateKey, reportEnd, weeklyStart, closed30Start, asOfLabel, weekLabel } = reportDateParts(asOf);
  const referralRows = await db.select({
    referral: referrals,
    contact: { firstName: contacts.firstName, lastName: contacts.lastName },
    referralAgent: { name: referralAgents.name, brokerage: referralAgents.brokerage },
    statusName: referralStatusOptions.name,
  })
    .from(referrals)
    .innerJoin(contacts, eq(referrals.contactId, contacts.id))
    .innerJoin(referralAgents, eq(referrals.referralAgentId, referralAgents.id))
    .leftJoin(referralStatusOptions, eq(referrals.statusKey, referralStatusOptions.key))
    .orderBy(desc(referrals.referralSentAt));

  const baseRows = referralRows.map(toReferralRow);
  const rowByReferralId = new Map(baseRows.map((row) => [row.id, row]));
  const payments = await db.select().from(referralPayments).orderBy(desc(referralPayments.dueAt), desc(referralPayments.createdAt));

  const sent = baseRows.filter((row) => row.referralSentAt >= weeklyStart && row.referralSentAt < reportEnd);
  const underContract = baseRows.filter((row) => row.statusKey === "under_contract");
  const closedLast30Days = baseRows.filter((row) => Boolean(row.closedAt && row.closedAt >= closed30Start && row.closedAt < reportEnd));

  const unpaid: WeeklyReferralPaymentRow[] = payments
    .filter((payment) => payment.paymentStatus !== "paid")
    .map((payment): WeeklyReferralPaymentRow | null => {
      const referral = rowByReferralId.get(payment.referralId);
      if (!referral) return null;
      return {
        ...referral,
        paymentId: payment.id,
        paymentStatus: payment.paymentStatus.replace(/_/g, " "),
        feeOwed: numberValue(payment.referralFeeOwed),
        dueAt: payment.dueAt,
        paymentNote: payment.notes,
      };
    })
    .filter((row): row is WeeklyReferralPaymentRow => Boolean(row));

  // A closed referral without an entered payment record must remain visible until
  // operations records and resolves its collection status.
  const paymentReferralIds = new Set(payments.map((payment) => payment.referralId));
  for (const referral of baseRows) {
    if (referral.statusKey === "closed" && !paymentReferralIds.has(referral.id)) {
      unpaid.push({
        ...referral,
        paymentId: null,
        paymentStatus: "payment record missing",
        feeOwed: 0,
        dueAt: referral.closedAt,
        paymentNote: "Add the referral payment record to begin payment tracking.",
      });
    }
  }

  return {
    reportDateKey,
    weekLabel,
    asOfLabel,
    sent,
    underContract,
    closedLast30Days,
    unpaid,
  };
}

function tableHeader(columns: string[]): string {
  return `<thead><tr>${columns.map((column) => `<th style="padding:9px 8px;background:#111827;color:#FFFFFF;font-size:10px;letter-spacing:.25px;text-align:left;white-space:nowrap;">${escapeHtml(column)}</th>`).join("")}</tr></thead>`;
}

function emptyTable(message: string, columnCount: number): string {
  return `<tr><td colspan="${columnCount}" style="padding:16px 8px;text-align:center;color:#6B7280;font-size:12px;">${escapeHtml(message)}</td></tr>`;
}

function reportTable(headers: string[], rows: string, emptyMessage: string): string {
  return `<div style="overflow-x:auto;margin:0 -4px 18px;"><table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="border:1px solid #D1D5DB;border-collapse:collapse;min-width:620px;">${tableHeader(headers)}<tbody>${rows || emptyTable(emptyMessage, headers.length)}</tbody></table></div>`;
}

function sectionHeading(title: string, detail: string): string {
  return `<div style="margin:24px 0 9px;"><div style="font-size:15px;font-weight:700;color:#111827;">${escapeHtml(title)}</div><div style="font-size:11px;line-height:1.45;color:#6B7280;margin-top:3px;">${escapeHtml(detail)}</div></div>`;
}

function metricCard(label: string, value: string, color: string): string {
  return `<td width="25%" style="padding:4px;vertical-align:top;"><div style="border:1px solid #E5E7EB;border-radius:8px;padding:12px;background:#FFFFFF;"><div style="font-size:22px;font-weight:700;color:${color};line-height:1.1;">${escapeHtml(value)}</div><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:#6B7280;margin-top:5px;line-height:1.35;">${escapeHtml(label)}</div></div></td>`;
}

/** Render the company-wide upcoming webinar listing for the shared email layout. */
export function renderWeeklyWebinarReport(report: WeeklyWebinarReport): string {
  const rows = report.rows.map((row, index) => `<tr style="background:${index % 2 ? "#F9FAFB" : "#FFFFFF"};"><td style="padding:10px 8px;border-bottom:1px solid #E5E7EB;font-size:12px;font-weight:600;color:#111827;">${escapeHtml(row.title)}</td><td style="padding:10px 8px;border-bottom:1px solid #E5E7EB;font-size:12px;color:#374151;white-space:nowrap;">${escapeHtml(formatDate(row.startTime, { weekday: "short", month: "short", day: "numeric", year: "numeric" }))}</td><td style="padding:10px 8px;border-bottom:1px solid #E5E7EB;font-size:12px;color:#374151;white-space:nowrap;">${escapeHtml(formatWebinarTime(row.startTime, row.timezone))}</td><td style="padding:10px 8px;border-bottom:1px solid #E5E7EB;font-size:12px;color:#374151;">${escapeHtml(row.createdBy)}</td><td style="padding:10px 8px;border-bottom:1px solid #E5E7EB;font-size:12px;text-align:center;font-weight:700;color:#0891B2;">${escapeHtml(row.registeredAttendees)}</td></tr>`).join("");

  return `<div style="font-size:20px;font-weight:700;line-height:1.3;color:#111827;">Upcoming Webinars</div>
    <div style="margin:5px 0 20px;font-size:12px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:.45px;">Monday webinar briefing · generated ${escapeHtml(report.asOfLabel)}</div>
    <div style="font-size:14px;color:#374151;line-height:1.6;">Here are all currently scheduled SavvyOS webinars and their registration totals as of this report.</div>
    <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin:18px -4px 12px;"><tr>${metricCard("Upcoming webinars", String(report.rows.length), "#0891B2")}${metricCard("Registered attendees", String(report.rows.reduce((total, row) => total + row.registeredAttendees, 0)), "#059669")}${metricCard("Hosted by", String(new Set(report.rows.map((row) => row.createdBy)).size), "#7C3AED")}${metricCard("Report timezone", "Eastern", "#374151")}</tr></table>
    ${reportTable(["Webinar", "Date", "Time", "Created by", "Registered"], rows, "No upcoming webinars are scheduled at this time.")}`;
}

function referralRows(rows: WeeklyReferralRow[], dateKey: "referralSentAt" | "underContractAt" | "closedAt"): string {
  return rows.map((row, index) => `<tr style="background:${index % 2 ? "#F9FAFB" : "#FFFFFF"};"><td style="padding:9px 8px;border-bottom:1px solid #E5E7EB;font-size:12px;font-weight:600;color:#111827;">${escapeHtml(row.clientName)}</td><td style="padding:9px 8px;border-bottom:1px solid #E5E7EB;font-size:12px;color:#374151;">${escapeHtml(row.referralAgent)}${row.brokerage ? `<div style="font-size:10px;color:#6B7280;margin-top:2px;">${escapeHtml(row.brokerage)}</div>` : ""}</td><td style="padding:9px 8px;border-bottom:1px solid #E5E7EB;font-size:12px;color:#374151;">${escapeHtml(row.market || "—")}</td><td style="padding:9px 8px;border-bottom:1px solid #E5E7EB;font-size:12px;color:#374151;">${escapeHtml(formatDate(row[dateKey]))}</td></tr>`).join("");
}

function unpaidRows(rows: WeeklyReferralPaymentRow[]): string {
  return rows.map((row, index) => `<tr style="background:${index % 2 ? "#F9FAFB" : "#FFFFFF"};"><td style="padding:9px 8px;border-bottom:1px solid #E5E7EB;font-size:12px;font-weight:600;color:#111827;">${escapeHtml(row.clientName)}</td><td style="padding:9px 8px;border-bottom:1px solid #E5E7EB;font-size:12px;color:#374151;">${escapeHtml(row.referralAgent)}</td><td style="padding:9px 8px;border-bottom:1px solid #E5E7EB;font-size:12px;color:#374151;text-transform:capitalize;">${escapeHtml(row.paymentStatus)}</td><td style="padding:9px 8px;border-bottom:1px solid #E5E7EB;font-size:12px;color:#374151;white-space:nowrap;">${escapeHtml(formatCurrency(row.feeOwed))}</td><td style="padding:9px 8px;border-bottom:1px solid #E5E7EB;font-size:12px;color:#374151;white-space:nowrap;">${escapeHtml(formatDate(row.dueAt))}</td></tr>`).join("");
}

/** Render the leadership referral report, retaining every uncollected payment until paid. */
export function renderWeeklyReferralReport(report: WeeklyReferralReport): string {
  return `<div style="font-size:20px;font-weight:700;line-height:1.3;color:#111827;">Weekly Referral Report</div>
    <div style="margin:5px 0 20px;font-size:12px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:.45px;">${escapeHtml(report.weekLabel)} · generated ${escapeHtml(report.asOfLabel)}</div>
    <div style="font-size:14px;color:#374151;line-height:1.6;">This report covers outbound referrals sent this week, the current contract pipeline, recent closings, and the complete unpaid-payment tracking list.</div>
    <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin:18px -4px 12px;"><tr>${metricCard("Sent this week", String(report.sent.length), "#0891B2")}${metricCard("Under contract", String(report.underContract.length), "#D97706")}${metricCard("Closed · 30 days", String(report.closedLast30Days.length), "#059669")}${metricCard("Unpaid tracking", String(report.unpaid.length), report.unpaid.length ? "#DC2626" : "#059669")}</tr></table>
    ${sectionHeading("1. Referrals sent this week", "Every referral created during the last seven Eastern calendar days, grouped here by the receiving agent.")}
    ${reportTable(["Client", "Receiving agent", "Market", "Sent"], referralRows(report.sent, "referralSentAt"), "No outbound referrals were sent this week.")}
    ${sectionHeading("2. Currently under contract", "Referrals presently marked Under Contract in SavvyOS.")}
    ${reportTable(["Client", "Receiving agent", "Market", "Under contract"], referralRows(report.underContract, "underContractAt"), "No referrals are currently marked under contract.")}
    ${sectionHeading("3. Closed in the last 30 days", "Referral records marked closed during the rolling 30-day window.")}
    ${reportTable(["Client", "Receiving agent", "Market", "Closed"], referralRows(report.closedLast30Days, "closedAt"), "No referrals closed in the last 30 days.")}
    ${sectionHeading("4. Unpaid referral fees", "Every payment that has not been marked Paid remains here each week until it is paid. Closed referrals without a payment record are included so they cannot be missed.")}
    ${reportTable(["Client", "Receiving agent", "Payment status", "Fee owed", "Due date"], unpaidRows(report.unpaid), "No unpaid referral fees are currently being tracked.")}
    <table cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin:22px 0 0;"><tr><td style="background:#0fc0df;border-radius:7px;"><a href="${APP_URL}/referrals" style="display:inline-block;padding:12px 22px;font-size:13px;font-weight:700;color:#0A0A0A;text-decoration:none;">Open Referrals</a></td></tr></table>`;
}

async function claimReportRun(reportKey: string, reportDate: string): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available for scheduled report tracking.");

  const [run] = await db.select().from(scheduledReportRuns)
    .where(and(eq(scheduledReportRuns.reportKey, reportKey), eq(scheduledReportRuns.reportDate, reportDate)))
    .limit(1);
  if (run?.status === "sent") return false;
  if (run?.status === "running" && Date.now() - run.startedAt.getTime() < STALE_RUN_MS) return false;

  if (run) {
    await db.update(scheduledReportRuns).set({
      status: "running",
      startedAt: new Date(),
      completedAt: null,
      recipientCount: 0,
      successfulRecipientCount: 0,
      errorMessage: null,
    }).where(eq(scheduledReportRuns.id, run.id));
  } else {
    try {
      await db.insert(scheduledReportRuns).values({ reportKey, reportDate, status: "running", startedAt: new Date() });
    } catch (error) {
      console.warn(`[WeeklyOperationsReports] Could not claim ${reportKey} for ${reportDate}:`, error);
      return false;
    }
  }
  return true;
}

async function finalizeReportRun(
  reportKey: string,
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
  }).where(and(eq(scheduledReportRuns.reportKey, reportKey), eq(scheduledReportRuns.reportDate, reportDate)));
}

/** Deliver the upcoming-webinar report to every active admin, ISA, and agent. */
export async function sendWeeklyWebinarReport(asOf = new Date()): Promise<void> {
  const report = await buildWeeklyWebinarReport(asOf);
  if (!(await claimReportRun(WEBINAR_REPORT_KEY, report.reportDateKey))) return;

  try {
    const recipients = await getCompanyWebinarRecipients();
    const reportHtml = renderWeeklyWebinarReport(report);
    let successfulRecipientCount = 0;
    const failures: string[] = [];
    for (const recipient of recipients) {
      const delivery = await sendTransactionalEmail("weekly_webinar_report", {
        recipientName: recipient.name,
        recipientEmail: recipient.email,
        weeklyWebinarReportHtml: reportHtml,
        weeklyWebinarReportSubject: `Upcoming Webinars | ${formatDate(asOf, { month: "long", day: "numeric", year: "numeric" })}`,
      }, {
        allowTemplateOverride: false,
        injectMagicLinks: false,
        idempotencyKey: `${WEBINAR_REPORT_KEY}:${report.reportDateKey}:${recipient.email}`,
      });
      if (delivery.sent) successfulRecipientCount += 1;
      else if (!delivery.skipped) failures.push(`${recipient.email}: ${delivery.reason ?? "email delivery failed"}`);
    }
    const status = successfulRecipientCount === recipients.length ? "sent"
      : successfulRecipientCount > 0 ? "partial"
        : failures.length > 0 ? "failed" : "skipped";
    await finalizeReportRun(WEBINAR_REPORT_KEY, report.reportDateKey, status, recipients.length, successfulRecipientCount, failures.join(" | ") || undefined);
    console.info(`[WeeklyWebinarReport] ${status}: ${successfulRecipientCount}/${recipients.length} delivery attempt(s) completed for ${report.reportDateKey}.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finalizeReportRun(WEBINAR_REPORT_KEY, report.reportDateKey, "failed", 0, 0, message);
    console.error("[WeeklyWebinarReport] Report failed:", error);
  }
}

/** Deliver the weekly referral report to the approved leadership recipients. */
export async function sendWeeklyReferralReport(asOf = new Date()): Promise<void> {
  const report = await buildWeeklyReferralReport(asOf);
  if (!(await claimReportRun(REFERRAL_REPORT_KEY, report.reportDateKey))) return;

  try {
    const reportHtml = renderWeeklyReferralReport(report);
    let successfulRecipientCount = 0;
    const failures: string[] = [];
    for (const recipient of REFERRAL_RECIPIENTS) {
      const delivery = await sendTransactionalEmail("weekly_referral_report", {
        recipientName: recipient.name,
        recipientEmail: recipient.email,
        weeklyReferralReportHtml: reportHtml,
        weeklyReferralReportSubject: `Weekly Referral Report | ${report.weekLabel}`,
      }, {
        allowTemplateOverride: false,
        injectMagicLinks: false,
        idempotencyKey: `${REFERRAL_REPORT_KEY}:${report.reportDateKey}:${recipient.email}`,
      });
      if (delivery.sent) successfulRecipientCount += 1;
      else if (!delivery.skipped) failures.push(`${recipient.email}: ${delivery.reason ?? "email delivery failed"}`);
    }
    const status = successfulRecipientCount === REFERRAL_RECIPIENTS.length ? "sent"
      : successfulRecipientCount > 0 ? "partial"
        : failures.length > 0 ? "failed" : "skipped";
    await finalizeReportRun(REFERRAL_REPORT_KEY, report.reportDateKey, status, REFERRAL_RECIPIENTS.length, successfulRecipientCount, failures.join(" | ") || undefined);
    console.info(`[WeeklyReferralReport] ${status}: ${successfulRecipientCount}/${REFERRAL_RECIPIENTS.length} delivery attempt(s) completed for ${report.reportDateKey}.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finalizeReportRun(REFERRAL_REPORT_KEY, report.reportDateKey, "failed", 0, 0, message);
    console.error("[WeeklyReferralReport] Report failed:", error);
  }
}

let webinarReportTimer: NodeJS.Timeout | undefined;
let referralReportTimer: NodeJS.Timeout | undefined;
let mondayRecoveryTimer: NodeJS.Timeout | undefined;

function scheduleNextWeeklyOperationsReports(): void {
  if (webinarReportTimer) clearTimeout(webinarReportTimer);
  if (referralReportTimer) clearTimeout(referralReportTimer);
  const nextRun = getNextMondayAtNoonEastern();
  const delay = Math.max(nextRun.getTime() - Date.now(), 1_000);
  console.info(`[WeeklyOperationsReports] Next Monday reports scheduled for ${nextRun.toLocaleString("en-US", { timeZone: EASTERN_TIME_ZONE })}.`);
  webinarReportTimer = setTimeout(() => {
    sendWeeklyWebinarReport().catch((error) => console.error("[WeeklyWebinarReport] Scheduled send failed:", error));
  }, delay);
  referralReportTimer = setTimeout(async () => {
    await sendWeeklyReferralReport().catch((error) => console.error("[WeeklyReferralReport] Scheduled send failed:", error));
    scheduleNextWeeklyOperationsReports();
  }, delay);
}

/** Schedule both weekly operations reports for Monday at 12:00 PM Eastern. */
export function scheduleWeeklyOperationsReports(): void {
  scheduleNextWeeklyOperationsReports();
  if (mondayRecoveryTimer) clearTimeout(mondayRecoveryTimer);
  mondayRecoveryTimer = setTimeout(() => {
    const eastern = getEasternTimeParts();
    if (eastern.weekday === "Mon" && eastern.hour >= REPORT_HOUR) {
      sendWeeklyWebinarReport().catch((error) => console.error("[WeeklyWebinarReport] Startup recovery failed:", error));
      sendWeeklyReferralReport().catch((error) => console.error("[WeeklyReferralReport] Startup recovery failed:", error));
    }
  }, 30_000);
}
