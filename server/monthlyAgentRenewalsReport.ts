import { and, asc, eq, gt, inArray, isNotNull, lt } from "drizzle-orm";
import { agentRenewals, marketAgentAssignments, marketProfiles, scheduledReportRuns, users } from "../drizzle/schema";
import { getDb } from "./db";
import {
  addEasternDays,
  easternDateKey,
  easternDateTimeToUtc,
  getEasternTimeParts,
} from "./agentProductionReportScheduler";
import { sendTransactionalEmail } from "./_core/resendEmail";

const EASTERN_TIME_ZONE = "America/New_York";
const REPORT_KEY = "monthly_agent_renewals";
const REPORT_HOUR = 9;
const UPCOMING_WINDOW_DAYS = 60;
const STALE_RUN_MS = 60 * 60 * 1000;
// Node clamps a timeout above ~24.8 days to 1 ms. Recheck daily so a report
// scheduled more than 24 days away cannot start a tight rescheduling loop.
const MAX_TIMER_DELAY_MS = 24 * 60 * 60 * 1000;
const APP_URL = "https://os.savvy-agents.com";

/** The shared leadership report is intentionally restricted to the four recipients Tyler named. */
export const MONTHLY_AGENT_RENEWALS_RECIPIENT_EMAILS = [
  "philleone@savvy.realty",
  "elana@savvy.realty",
  "dyl@savvy.realty",
  "tyler@savvy.realty",
] as const;

export interface AgentRenewalReportRow {
  agentId: number;
  agentName: string;
  markets: string[];
  renewalDate: string;
  daysFromToday: number;
}

export interface MonthlyAgentRenewalsReport {
  reportDate: string;
  reportDateLabel: string;
  upcomingThroughDate: string;
  upcomingThroughLabel: string;
  overdue: AgentRenewalReportRow[];
  upcoming: AgentRenewalReportRow[];
  recipients: Array<{ id: number; name: string; email: string }>;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function dateFromKey(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN_TIME_ZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(dateFromKey(value));
}

function daysBetween(start: string, end: string): number {
  return Math.round((dateFromKey(end).getTime() - dateFromKey(start).getTime()) / (24 * 60 * 60 * 1000));
}

function timelineLabel(daysFromToday: number): string {
  if (daysFromToday < 0) {
    const days = Math.abs(daysFromToday);
    return `${days} day${days === 1 ? "" : "s"} overdue`;
  }
  if (daysFromToday === 0) return "Due today";
  if (daysFromToday === 1) return "Due tomorrow";
  return `Due in ${daysFromToday} days`;
}

function metricCard(value: number, label: string, accent: string): string {
  return `<td width="50%" style="padding:5px;vertical-align:top;"><div style="border:1px solid #E5E7EB;border-radius:8px;padding:14px;background:#FFFFFF;"><div style="font-size:25px;font-weight:700;color:${accent};line-height:1.1;">${value}</div><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.45px;color:#6B7280;margin-top:5px;line-height:1.35;">${escapeHtml(label)}</div></div></td>`;
}

function renderRenewalRows(rows: AgentRenewalReportRow[], tone: "overdue" | "upcoming"): string {
  if (rows.length === 0) {
    return `<tr><td colspan="4" style="padding:15px 0;color:#6B7280;font-size:13px;">${tone === "overdue" ? "No renewals are currently overdue." : `No renewals are due in the next ${UPCOMING_WINDOW_DAYS} days.`}</td></tr>`;
  }

  const timelineColor = tone === "overdue" ? "#B91C1C" : "#0F7490";
  return rows.map((row) => `<tr>
    <td style="padding:11px 0;border-bottom:1px solid #E5E7EB;vertical-align:top;font-size:13px;font-weight:700;color:#111827;">${escapeHtml(row.agentName)}</td>
    <td style="padding:11px 8px;border-bottom:1px solid #E5E7EB;vertical-align:top;font-size:12px;color:#4B5563;">${escapeHtml(row.markets.length ? row.markets.join(" · ") : "No market assigned")}</td>
    <td style="padding:11px 8px;border-bottom:1px solid #E5E7EB;vertical-align:top;white-space:nowrap;font-size:12px;color:#374151;">${escapeHtml(formatDate(row.renewalDate))}</td>
    <td style="padding:11px 0 11px 8px;border-bottom:1px solid #E5E7EB;vertical-align:top;white-space:nowrap;text-align:right;font-size:12px;font-weight:700;color:${timelineColor};">${escapeHtml(timelineLabel(row.daysFromToday))}</td>
  </tr>`).join("");
}

export function renderMonthlyAgentRenewalsEmail(report: MonthlyAgentRenewalsReport): string {
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <div style="font-size:22px;font-weight:700;color:#111827;line-height:1.25;">Monthly Agent Renewals</div>
    <div style="font-size:12px;color:#6B7280;margin-top:5px;line-height:1.5;">As of ${escapeHtml(report.reportDateLabel)} · upcoming window through ${escapeHtml(report.upcomingThroughLabel)}</div>

    <div style="margin:25px 0 9px;font-size:15px;font-weight:700;color:#111827;">At a glance</div>
    <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation"><tr>
      ${metricCard(report.overdue.length, "Overdue renewals", "#B91C1C")}
      ${metricCard(report.upcoming.length, `Upcoming in ${UPCOMING_WINDOW_DAYS} days`, "#0F7490")}
    </tr></table>

    <div style="margin:29px 0 8px;font-size:15px;font-weight:700;color:#B91C1C;">Overdue renewals</div>
    <div style="font-size:12px;color:#6B7280;line-height:1.5;margin-bottom:8px;">These renewal meetings remain open and need to be marked done in SavvyOS once completed.</div>
    <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
      <thead><tr>
        <th align="left" style="padding:8px 0;border-bottom:1px solid #D1D5DB;font-size:10px;text-transform:uppercase;letter-spacing:.45px;color:#6B7280;">Agent</th>
        <th align="left" style="padding:8px;border-bottom:1px solid #D1D5DB;font-size:10px;text-transform:uppercase;letter-spacing:.45px;color:#6B7280;">Market</th>
        <th align="left" style="padding:8px;border-bottom:1px solid #D1D5DB;font-size:10px;text-transform:uppercase;letter-spacing:.45px;color:#6B7280;">Renewal date</th>
        <th align="right" style="padding:8px 0 8px 8px;border-bottom:1px solid #D1D5DB;font-size:10px;text-transform:uppercase;letter-spacing:.45px;color:#6B7280;">Status</th>
      </tr></thead>
      <tbody>${renderRenewalRows(report.overdue, "overdue")}</tbody>
    </table>

    <div style="margin:29px 0 8px;font-size:15px;font-weight:700;color:#111827;">Upcoming renewals</div>
    <div style="font-size:12px;color:#6B7280;line-height:1.5;margin-bottom:8px;">Renewal meetings due in the next ${UPCOMING_WINDOW_DAYS} days, including those due today.</div>
    <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
      <thead><tr>
        <th align="left" style="padding:8px 0;border-bottom:1px solid #D1D5DB;font-size:10px;text-transform:uppercase;letter-spacing:.45px;color:#6B7280;">Agent</th>
        <th align="left" style="padding:8px;border-bottom:1px solid #D1D5DB;font-size:10px;text-transform:uppercase;letter-spacing:.45px;color:#6B7280;">Market</th>
        <th align="left" style="padding:8px;border-bottom:1px solid #D1D5DB;font-size:10px;text-transform:uppercase;letter-spacing:.45px;color:#6B7280;">Renewal date</th>
        <th align="right" style="padding:8px 0 8px 8px;border-bottom:1px solid #D1D5DB;font-size:10px;text-transform:uppercase;letter-spacing:.45px;color:#6B7280;">Timeline</th>
      </tr></thead>
      <tbody>${renderRenewalRows(report.upcoming, "upcoming")}</tbody>
    </table>

    <table cellpadding="0" cellspacing="0" border="0" style="margin:27px 0 0;" role="presentation"><tr><td style="background:#0FC0DF;border-radius:7px;"><a href="${APP_URL}/agent-renewals" style="display:inline-block;padding:12px 22px;color:#0A0A0A;font-size:14px;font-weight:700;text-decoration:none;">Open Agent Renewals</a></td></tr></table>
    <div style="font-size:11px;line-height:1.5;color:#9CA3AF;margin-top:17px;">Renewal dates follow each agent’s signed/onboarded anniversary. This monthly report includes scheduled renewals only.</div>
  </div>`;
}

async function getRecipients(): Promise<MonthlyAgentRenewalsReport["recipients"]> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available for monthly Agent Renewals report recipients.");
  const rows = await db.select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(and(
      inArray(users.email, [...MONTHLY_AGENT_RENEWALS_RECIPIENT_EMAILS]),
      eq(users.isActive, true),
      isNotNull(users.email),
    ));
  const byEmail = new Map(rows.map((row) => [row.email!.toLowerCase(), row]));
  const missing = MONTHLY_AGENT_RENEWALS_RECIPIENT_EMAILS.filter((email) => !byEmail.has(email));
  if (missing.length > 0) {
    throw new Error(`Monthly Agent Renewals recipient account(s) missing or inactive: ${missing.join(", ")}`);
  }
  return MONTHLY_AGENT_RENEWALS_RECIPIENT_EMAILS.map((email) => {
    const row = byEmail.get(email)!;
    return { id: row.id, name: row.name?.trim() || email, email };
  });
}

/** Builds the shared leadership renewal report from active scheduled renewals. */
export async function buildMonthlyAgentRenewalsReport(asOf = new Date()): Promise<MonthlyAgentRenewalsReport> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available for the monthly Agent Renewals report.");

  const eastern = getEasternTimeParts(asOf);
  const reportDate = easternDateKey(eastern);
  const upcomingThroughDate = addEasternDays(reportDate, UPCOMING_WINDOW_DAYS);
  const [renewals, marketRows, recipients] = await Promise.all([
    db.select({ agentId: agentRenewals.agentId, renewalDate: agentRenewals.renewalDate, agentName: users.name, agentEmail: users.email })
      .from(agentRenewals)
      .innerJoin(users, eq(agentRenewals.agentId, users.id))
      .where(and(eq(agentRenewals.status, "scheduled"), eq(users.role, "agent"), eq(users.isActive, true)))
      .orderBy(asc(agentRenewals.renewalDate), asc(users.name)),
    db.select({ agentId: marketAgentAssignments.agentId, marketName: marketProfiles.name, marketState: marketProfiles.state, isPrimary: marketAgentAssignments.isPrimary })
      .from(marketAgentAssignments)
      .innerJoin(marketProfiles, eq(marketAgentAssignments.marketProfileId, marketProfiles.id)),
    getRecipients(),
  ]);

  const marketsByAgent = new Map<number, Array<{ name: string; state: string; isPrimary: boolean }>>();
  for (const market of marketRows) {
    const list = marketsByAgent.get(market.agentId) ?? [];
    list.push({ name: market.marketName, state: market.marketState, isPrimary: Boolean(market.isPrimary) });
    marketsByAgent.set(market.agentId, list);
  }

  const rows: AgentRenewalReportRow[] = renewals.map((renewal) => {
    const renewalDate = renewal.renewalDate instanceof Date
      ? renewal.renewalDate.toISOString().slice(0, 10)
      : String(renewal.renewalDate).slice(0, 10);
    const markets = (marketsByAgent.get(renewal.agentId) ?? [])
      .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.name.localeCompare(b.name))
      .map((market) => `${market.name}${market.state ? `, ${market.state}` : ""}`);
    return {
      agentId: renewal.agentId,
      agentName: renewal.agentName?.trim() || renewal.agentEmail || `Agent #${renewal.agentId}`,
      markets,
      renewalDate,
      daysFromToday: daysBetween(reportDate, renewalDate),
    };
  });

  return {
    reportDate,
    reportDateLabel: new Intl.DateTimeFormat("en-US", { timeZone: EASTERN_TIME_ZONE, month: "long", day: "numeric", year: "numeric" }).format(dateFromKey(reportDate)),
    upcomingThroughDate,
    upcomingThroughLabel: formatDate(upcomingThroughDate),
    overdue: rows.filter((row) => row.daysFromToday < 0),
    upcoming: rows.filter((row) => row.daysFromToday >= 0 && row.daysFromToday <= UPCOMING_WINDOW_DAYS),
    recipients,
  };
}

async function claimReportRun(reportDate: string): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available for report-run tracking.");
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
    console.warn("[MonthlyAgentRenewals] Report run was claimed by another process.", error);
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
    status, recipientCount, successfulRecipientCount, errorMessage: errorMessage ?? null, completedAt: new Date(),
  }).where(and(eq(scheduledReportRuns.reportKey, REPORT_KEY), eq(scheduledReportRuns.reportDate, reportDate)));
}

/** Sends one shared email to Phil with Elana, Dyl, and Tyler copied for Reply All. */
export async function sendMonthlyAgentRenewalsReport(asOf = new Date()): Promise<void> {
  const reportDate = easternDateKey(getEasternTimeParts(asOf));
  if (!(await claimReportRun(reportDate))) {
    console.info(`[MonthlyAgentRenewals] ${reportDate} already handled; skipping duplicate run.`);
    return;
  }

  try {
    const report = await buildMonthlyAgentRenewalsReport(asOf);
    const primaryRecipient = report.recipients[0];
    const copiedRecipients = report.recipients.slice(1);
    if (!primaryRecipient || copiedRecipients.length !== MONTHLY_AGENT_RENEWALS_RECIPIENT_EMAILS.length - 1) {
      throw new Error("The configured monthly Agent Renewals recipient group is incomplete.");
    }

    const delivery = await sendTransactionalEmail(
      "monthly_agent_renewals",
      {
        recipientName: primaryRecipient.name,
        recipientEmail: primaryRecipient.email,
        ccEmails: copiedRecipients.map((recipient) => recipient.email),
        monthlyRenewalsDate: report.reportDateLabel,
        monthlyRenewalsHtml: renderMonthlyAgentRenewalsEmail(report),
        monthlyRenewalsSubject: `Monthly Agent Renewals | ${report.reportDateLabel}`,
      },
      {
        allowTemplateOverride: false,
        injectMagicLinks: false,
        idempotencyKey: `${REPORT_KEY}:${reportDate}:shared-leadership`,
      },
    );

    const recipientCount = report.recipients.length;
    if (delivery.sent) {
      await finalizeReportRun(reportDate, "sent", recipientCount, recipientCount);
      console.info(`[MonthlyAgentRenewals] Sent ${reportDate} report to ${primaryRecipient.email} with ${copiedRecipients.length} copied recipient(s).`);
      return;
    }
    await finalizeReportRun(reportDate, delivery.skipped ? "skipped" : "failed", recipientCount, 0, delivery.reason);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await finalizeReportRun(reportDate, "failed", MONTHLY_AGENT_RENEWALS_RECIPIENT_EMAILS.length, 0, reason);
    console.error("[MonthlyAgentRenewals] Shared leadership delivery failed:", error);
  }
}

/** Returns the next first-of-month 9:00 AM America/New_York execution time, including DST. */
export function getNextMonthlyAgentRenewalsAt9AmEastern(now = new Date()): Date {
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

export function monthlyAgentRenewalsTimerDelay(
  nextRun: Date,
  now = new Date()
): number {
  return Math.min(
    Math.max(nextRun.getTime() - now.getTime(), 1_000),
    MAX_TIMER_DELAY_MS
  );
}

let schedulerTimer: NodeJS.Timeout | undefined;
let startupRecoveryTimer: NodeJS.Timeout | undefined;

function scheduleNextReport(): void {
  if (schedulerTimer) clearTimeout(schedulerTimer);
  const nextRun = getNextMonthlyAgentRenewalsAt9AmEastern();
  const delay = monthlyAgentRenewalsTimerDelay(nextRun);
  console.info(`[MonthlyAgentRenewals] Next report scheduled for ${nextRun.toLocaleString("en-US", { timeZone: EASTERN_TIME_ZONE })}.`);
  schedulerTimer = setTimeout(async () => {
    if (Date.now() >= nextRun.getTime()) await sendMonthlyAgentRenewalsReport();
    scheduleNextReport();
  }, delay);
}

/** Schedules a shared leadership report for 9:00 AM Eastern on the first of every month. */
export function scheduleMonthlyAgentRenewalsReport(): void {
  scheduleNextReport();
  if (startupRecoveryTimer) clearTimeout(startupRecoveryTimer);
  startupRecoveryTimer = setTimeout(() => {
    const eastern = getEasternTimeParts();
    if (eastern.day === 1 && eastern.hour >= REPORT_HOUR) {
      sendMonthlyAgentRenewalsReport().catch((error) =>
        console.error("[MonthlyAgentRenewals] First-of-month startup recovery failed:", error),
      );
    }
  }, 30_000);
}
