import { and, asc, eq, gte, lt, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import {
  agentConnections,
  communications,
  contacts,
  scheduledReportRuns,
  users,
} from "../drizzle/schema";
import { getDb } from "./db";
import { sendTransactionalEmail } from "./_core/resendEmail";
import {
  addEasternDays,
  easternDateKey,
  easternDateTimeToUtc,
  getEasternTimeParts,
} from "./agentProductionReportScheduler";

const EASTERN_TIME_ZONE = "America/New_York";
const REPORT_KEY = "daily_isa_activities";
const REPORT_HOUR = 8;
const STALE_RUN_MS = 60 * 60 * 1000;
const APP_URL = "https://os.savvy-agents.com";
const PRIMARY_RECIPIENT = { name: "Tyler", email: "tyler@savvy.realty" };
const COPIED_RECIPIENTS = [
  "marcusclay@savvy.realty",
  "elana@savvy.realty",
  "dyl@savvy.realty",
];

const appointmentAgent = alias(users, "daily_isa_appointment_agent");

export interface IsaActivityMetrics {
  outboundCalls: number;
  inboundCalls: number;
  texts: number;
  notes: number;
  appointments: number;
}

export interface DailyIsaActivityRow {
  isaId: number;
  isaName: string;
  metrics: IsaActivityMetrics;
  appointmentAgents: Array<{ agentId: number; agentName: string; count: number }>;
}

export interface DailyIsaActivitiesReport {
  reportDate: string;
  periodLabel: string;
  generatedAt: string;
  rows: DailyIsaActivityRow[];
  totals: IsaActivityMetrics & { totalCalls: number };
  unattributedAppointments: number;
}

function emptyMetrics(): IsaActivityMetrics {
  return { outboundCalls: 0, inboundCalls: 0, texts: 0, notes: 0, appointments: 0 };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatPeriodLabel(reportDate: string): string {
  const start = easternDateTimeToUtc(reportDate, 0);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN_TIME_ZONE,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(start);
}

function reportWindow(reportDate: string): { start: Date; end: Date } {
  return {
    start: easternDateTimeToUtc(reportDate, 0),
    end: easternDateTimeToUtc(addEasternDays(reportDate, 1), 0),
  };
}

function reportDateForPriorEasternDay(asOf = new Date()): string {
  return addEasternDays(easternDateKey(getEasternTimeParts(asOf)), -1);
}

function metricCard(value: number, label: string, tone = "#111827"): string {
  return `
    <td width="25%" style="padding:5px;vertical-align:top;">
      <div style="border:1px solid #E5E7EB;border-radius:8px;padding:12px;background:#FFFFFF;">
        <div style="font-size:23px;font-weight:700;color:${tone};line-height:1.1;">${value}</div>
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.45px;color:#6B7280;margin-top:5px;line-height:1.35;">${escapeHtml(label)}</div>
      </div>
    </td>`;
}

function activityRow(row: DailyIsaActivityRow): string {
  const { metrics } = row;
  const totalCalls = metrics.outboundCalls + metrics.inboundCalls;
  const appointmentSummary = metrics.appointments > 0
    ? `${metrics.appointments} appointment${metrics.appointments === 1 ? "" : "s"} set across ${row.appointmentAgents.length} agent${row.appointmentAgents.length === 1 ? "" : "s"}.`
    : totalCalls + metrics.texts + metrics.notes === 0
      ? "No trackable calls, texts, notes, or ISA-set appointments logged."
      : "No ISA-set appointments recorded.";

  return `
    <tr>
      <td style="padding:13px 0;border-bottom:1px solid #E5E7EB;vertical-align:top;">
        <div style="font-size:14px;font-weight:700;color:#111827;">${escapeHtml(row.isaName)}</div>
        <div style="font-size:11px;color:#6B7280;margin-top:3px;line-height:1.45;">${escapeHtml(appointmentSummary)}</div>
      </td>
      <td style="padding:13px 0 13px 9px;border-bottom:1px solid #E5E7EB;text-align:center;font-size:13px;color:#374151;">${metrics.outboundCalls}</td>
      <td style="padding:13px 0 13px 9px;border-bottom:1px solid #E5E7EB;text-align:center;font-size:13px;color:#374151;">${metrics.inboundCalls}</td>
      <td style="padding:13px 0 13px 9px;border-bottom:1px solid #E5E7EB;text-align:center;font-size:13px;color:#374151;">${metrics.texts}</td>
      <td style="padding:13px 0 13px 9px;border-bottom:1px solid #E5E7EB;text-align:center;font-size:13px;color:#374151;">${metrics.notes}</td>
      <td style="padding:13px 0 13px 9px;border-bottom:1px solid #E5E7EB;text-align:center;font-size:13px;font-weight:700;color:${metrics.appointments > 0 ? "#0F7490" : "#374151"};">${metrics.appointments}</td>
    </tr>`;
}

function appointmentAttributionRows(rows: DailyIsaActivityRow[]): string {
  const rowsWithAppointments = rows.filter((row) => row.metrics.appointments > 0);
  if (rowsWithAppointments.length === 0) {
    return `<tr><td style="padding:13px 0;font-size:12px;color:#6B7280;">No ISA-set appointments were recorded for this reporting day.</td></tr>`;
  }

  return rowsWithAppointments.map((row) => {
    const agents = row.appointmentAgents
      .map((agent) => `${escapeHtml(agent.agentName)} (${agent.count})`)
      .join(", ");
    return `
      <tr><td style="padding:0 0 12px;">
        <div style="background:#F0F9FF;border:1px solid #BAE6FD;border-radius:8px;padding:13px 15px;">
          <div style="font-size:13px;font-weight:700;color:#0C4A6E;">${escapeHtml(row.isaName)} · ${row.metrics.appointments} appointment${row.metrics.appointments === 1 ? "" : "s"}</div>
          <div style="font-size:12px;color:#155E75;line-height:1.58;margin-top:4px;">${agents}</div>
        </div>
      </td></tr>`;
  }).join("");
}

function signalCard(title: string, body: string, tone: string): string {
  return `<tr><td style="padding:0 0 9px;"><div style="border-left:3px solid ${tone};background:#F9FAFB;border-radius:6px;padding:11px 13px;font-size:12px;color:#374151;line-height:1.55;"><strong style="color:#111827;">${escapeHtml(title)}</strong> ${escapeHtml(body)}</div></td></tr>`;
}

function importantSignals(report: DailyIsaActivitiesReport): string {
  const inactiveIsas = report.rows.filter((row) => {
    const metrics = row.metrics;
    return metrics.outboundCalls + metrics.inboundCalls + metrics.texts + metrics.notes + metrics.appointments === 0;
  });
  const rankedByAppointments = [...report.rows]
    .filter((row) => row.metrics.appointments > 0)
    .sort((a, b) => b.metrics.appointments - a.metrics.appointments || a.isaName.localeCompare(b.isaName));
  const signals: string[] = [];

  if (report.totals.texts === 0) {
    signals.push(signalCard(
      "No texts were logged in SavvyOS.",
      "A zero means no outbound or inbound SMS communication record was available for an active ISA during this reporting window.",
      "#0F7490",
    ));
  }

  if (inactiveIsas.length > 0) {
    signals.push(signalCard(
      `${inactiveIsas.length} active ISA${inactiveIsas.length === 1 ? " has" : "s have"} no trackable activity.`,
      `${inactiveIsas.map((row) => row.isaName).join(", ")} had no calls, texts, notes, or ISA-set appointments recorded in SavvyOS.`,
      "#D97706",
    ));
  }

  const lead = rankedByAppointments[0];
  if (lead && report.totals.appointments > 0) {
    const share = Math.round((lead.metrics.appointments / report.totals.appointments) * 100);
    signals.push(signalCard(
      "Appointment concentration:",
      `${lead.isaName} set ${lead.metrics.appointments} of ${report.totals.appointments} appointments (${share}%).`,
      "#0891B2",
    ));
  } else {
    signals.push(signalCard(
      "No ISA-set appointments recorded.",
      "Review the ISA Dashboard for current lead follow-up and appointment activity.",
      "#0891B2",
    ));
  }

  if (report.unattributedAppointments > 0) {
    signals.push(signalCard(
      `${report.unattributedAppointments} appointment${report.unattributedAppointments === 1 ? " is" : "s are"} not attributed to an ISA.`,
      "These records were included in the total but could not be linked to an active ISA through the appointment or contact assignment.",
      "#DC2626",
    ));
  }

  return signals.join("");
}

export async function buildDailyIsaActivitiesReport(reportDate: string): Promise<DailyIsaActivitiesReport> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available for Daily ISA Activities reporting.");

  const { start, end } = reportWindow(reportDate);
  const activeIsas = await db.select({ id: users.id, name: users.name })
    .from(users)
    .where(and(eq(users.role, "isa"), eq(users.isActive, true)))
    .orderBy(asc(users.name));

  const rowsByIsa = new Map<number, DailyIsaActivityRow>();
  for (const isa of activeIsas) {
    rowsByIsa.set(isa.id, {
      isaId: isa.id,
      isaName: isa.name?.trim() || "Unnamed ISA",
      metrics: emptyMetrics(),
      appointmentAgents: [],
    });
  }

  const communicationRows = await db.select({
    isaId: users.id,
    type: communications.type,
    direction: communications.direction,
    count: sql<number>`COUNT(*)`,
  })
    .from(communications)
    .innerJoin(users, eq(communications.authorId, users.id))
    .where(and(
      eq(users.role, "isa"),
      eq(users.isActive, true),
      gte(communications.communicatedAt, start),
      lt(communications.communicatedAt, end),
    ))
    .groupBy(users.id, communications.type, communications.direction);

  for (const row of communicationRows) {
    const target = rowsByIsa.get(row.isaId);
    if (!target) continue;
    const count = Number(row.count) || 0;
    if (row.type === "call" && row.direction === "outbound") target.metrics.outboundCalls += count;
    if (row.type === "call" && row.direction === "inbound") target.metrics.inboundCalls += count;
    if (row.type === "sms") target.metrics.texts += count;
    if (row.type === "note") target.metrics.notes += count;
  }

  const appointmentTimestamp = sql<Date>`COALESCE(${agentConnections.appointmentSetAt}, ${agentConnections.createdAt})`;
  const appointmentIsaId = sql<number | null>`COALESCE(${agentConnections.appointmentSetByUserId}, ${contacts.assignedIsaId})`;
  const appointmentRows = await db.select({
    isaId: appointmentIsaId,
    agentId: agentConnections.agentId,
    agentName: appointmentAgent.name,
    count: sql<number>`COUNT(*)`,
  })
    .from(agentConnections)
    .innerJoin(contacts, eq(agentConnections.contactId, contacts.id))
    .innerJoin(appointmentAgent, eq(agentConnections.agentId, appointmentAgent.id))
    .where(and(
      eq(agentConnections.appointmentSet, true),
      gte(appointmentTimestamp, start),
      lt(appointmentTimestamp, end),
    ))
    .groupBy(appointmentIsaId, agentConnections.agentId, appointmentAgent.name);

  let unattributedAppointments = 0;
  for (const row of appointmentRows) {
    const count = Number(row.count) || 0;
    const target = row.isaId ? rowsByIsa.get(row.isaId) : undefined;
    if (!target) {
      unattributedAppointments += count;
      continue;
    }
    target.metrics.appointments += count;
    target.appointmentAgents.push({
      agentId: row.agentId,
      agentName: row.agentName?.trim() || "Unnamed Agent",
      count,
    });
  }

  const rows: DailyIsaActivityRow[] = Array.from(rowsByIsa.values()).map((row: DailyIsaActivityRow) => ({
    ...row,
    appointmentAgents: [...row.appointmentAgents].sort((a, b) => b.count - a.count || a.agentName.localeCompare(b.agentName)),
  }));
  const metrics = rows.reduce((totals, row) => ({
    outboundCalls: totals.outboundCalls + row.metrics.outboundCalls,
    inboundCalls: totals.inboundCalls + row.metrics.inboundCalls,
    texts: totals.texts + row.metrics.texts,
    notes: totals.notes + row.metrics.notes,
    appointments: totals.appointments + row.metrics.appointments,
  }), emptyMetrics());

  return {
    reportDate,
    periodLabel: formatPeriodLabel(reportDate),
    generatedAt: new Date().toISOString(),
    rows,
    totals: { ...metrics, appointments: metrics.appointments + unattributedAppointments, totalCalls: metrics.outboundCalls + metrics.inboundCalls },
    unattributedAppointments,
  };
}

export function renderDailyIsaActivitiesReportEmail(report: DailyIsaActivitiesReport): string {
  const reportRows = report.rows.map(activityRow).join("");
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
      <div style="font-size:22px;font-weight:700;color:#111827;line-height:1.25;">Daily ISA Activities</div>
      <div style="font-size:12px;color:#6B7280;margin-top:5px;line-height:1.5;">${escapeHtml(report.periodLabel)} · All activity recorded in SavvyOS from 12:00 AM to 11:59 PM ET</div>

      <div style="margin:27px 0 9px;font-size:15px;font-weight:700;color:#111827;">At a glance</div>
      <div style="font-size:12px;color:#6B7280;line-height:1.5;margin-bottom:8px;">A shared operating view of tracked outreach, documentation, and ISA-set appointments.</div>
      <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation"><tr>
        ${metricCard(report.totals.outboundCalls, "Outbound calls", "#0F7490")}
        ${metricCard(report.totals.inboundCalls, "Inbound calls")}
        ${metricCard(report.totals.notes, "Notes logged")}
        ${metricCard(report.totals.appointments, "Appointments set", "#0F7490")}
      </tr></table>

      <div style="margin:29px 0 9px;font-size:15px;font-weight:700;color:#111827;">Activity by ISA</div>
      <div style="font-size:12px;color:#6B7280;line-height:1.5;margin-bottom:8px;">Calls and notes are communications authored by each ISA. Texts are logged SMS communications.</div>
      <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
        <thead><tr>
          <th align="left" style="padding:8px 0;border-bottom:1px solid #D1D5DB;font-size:10px;text-transform:uppercase;letter-spacing:.45px;color:#6B7280;">ISA</th>
          <th style="padding:8px 0 8px 9px;border-bottom:1px solid #D1D5DB;font-size:10px;text-transform:uppercase;letter-spacing:.45px;color:#6B7280;">Out</th>
          <th style="padding:8px 0 8px 9px;border-bottom:1px solid #D1D5DB;font-size:10px;text-transform:uppercase;letter-spacing:.45px;color:#6B7280;">In</th>
          <th style="padding:8px 0 8px 9px;border-bottom:1px solid #D1D5DB;font-size:10px;text-transform:uppercase;letter-spacing:.45px;color:#6B7280;">Texts</th>
          <th style="padding:8px 0 8px 9px;border-bottom:1px solid #D1D5DB;font-size:10px;text-transform:uppercase;letter-spacing:.45px;color:#6B7280;">Notes</th>
          <th style="padding:8px 0 8px 9px;border-bottom:1px solid #D1D5DB;font-size:10px;text-transform:uppercase;letter-spacing:.45px;color:#6B7280;">Appts</th>
        </tr></thead>
        <tbody>${reportRows}</tbody>
      </table>

      <div style="margin:29px 0 9px;font-size:15px;font-weight:700;color:#111827;">Appointment attribution</div>
      <div style="font-size:12px;color:#6B7280;line-height:1.5;margin-bottom:10px;">Appointments identify the receiving agent but do not confirm calendar attendance or eventual outcome.</div>
      <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">${appointmentAttributionRows(report.rows)}</table>

      <div style="margin:28px 0 9px;font-size:15px;font-weight:700;color:#111827;">Important signals</div>
      <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">${importantSignals(report)}</table>

      <table cellpadding="0" cellspacing="0" border="0" style="margin:27px 0 0;" role="presentation"><tr><td style="background:#0FC0DF;border-radius:7px;">
        <a href="${APP_URL}/" style="display:inline-block;padding:12px 22px;color:#0A0A0A;font-size:14px;font-weight:700;text-decoration:none;">Open ISA Dashboard</a>
      </td></tr></table>
      <div style="font-size:11px;line-height:1.5;color:#9CA3AF;margin-top:17px;">This report is a decision-support snapshot. It reports communications and appointments recorded in SavvyOS for the prior Eastern calendar day.</div>
    </div>`;
}

async function claimReportRun(reportDate: string): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available for Daily ISA Activities report tracking.");

  const [run] = await db.select()
    .from(scheduledReportRuns)
    .where(and(eq(scheduledReportRuns.reportKey, REPORT_KEY), eq(scheduledReportRuns.reportDate, reportDate)))
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
      await db.insert(scheduledReportRuns).values({
        reportKey: REPORT_KEY,
        reportDate,
        status: "running",
        startedAt: new Date(),
      });
    } catch (error) {
      console.warn("[DailyIsaActivities] Report run was claimed by another process.", error);
      return false;
    }
  }
  return true;
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

/** Sends one shared leadership report at 8:00 AM Eastern for the prior calendar day. */
export async function sendDailyIsaActivitiesReport(asOf = new Date()): Promise<void> {
  const reportDate = reportDateForPriorEasternDay(asOf);
  if (!(await claimReportRun(reportDate))) {
    console.info(`[DailyIsaActivities] ${reportDate} already handled; skipping duplicate run.`);
    return;
  }

  const recipientCount = 1 + COPIED_RECIPIENTS.length;
  try {
    const report = await buildDailyIsaActivitiesReport(reportDate);
    const delivery = await sendTransactionalEmail(
      "daily_isa_activities",
      {
        recipientName: PRIMARY_RECIPIENT.name,
        recipientEmail: PRIMARY_RECIPIENT.email,
        ccEmails: COPIED_RECIPIENTS,
        dailyIsaReportDate: report.periodLabel,
        dailyIsaReportHtml: renderDailyIsaActivitiesReportEmail(report),
        dailyIsaReportSubject: `Daily ISA Activities | ${report.periodLabel}`,
      },
      {
        allowTemplateOverride: false,
        injectMagicLinks: false,
        idempotencyKey: `${REPORT_KEY}:${reportDate}:shared-leadership`,
      },
    );

    if (delivery.sent) {
      await finalizeReportRun(reportDate, "sent", recipientCount, recipientCount);
      console.info(`[DailyIsaActivities] Sent ${reportDate} report to ${PRIMARY_RECIPIENT.email} with ${COPIED_RECIPIENTS.length} copied recipient(s).`);
      return;
    }

    await finalizeReportRun(
      reportDate,
      delivery.skipped ? "skipped" : "failed",
      recipientCount,
      0,
      delivery.reason,
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await finalizeReportRun(reportDate, "failed", recipientCount, 0, reason);
    console.error("[DailyIsaActivities] Shared leadership delivery failed:", error);
  }
}

/** Returns the next 8:00 AM America/New_York execution time, including DST. */
export function getNextDailyIsaActivitiesAt8AmEastern(now = new Date()): Date {
  const eastern = getEasternTimeParts(now);
  let targetDate = easternDateKey(eastern);
  if (eastern.hour > REPORT_HOUR || (eastern.hour === REPORT_HOUR && (eastern.minute > 0 || eastern.second > 0))) {
    targetDate = addEasternDays(targetDate, 1);
  }
  return easternDateTimeToUtc(targetDate, REPORT_HOUR);
}

let schedulerTimer: NodeJS.Timeout | undefined;
let startupRecoveryTimer: NodeJS.Timeout | undefined;

function scheduleNextReport(): void {
  if (schedulerTimer) clearTimeout(schedulerTimer);
  const nextRun = getNextDailyIsaActivitiesAt8AmEastern();
  const delay = Math.max(nextRun.getTime() - Date.now(), 1_000);
  console.info(`[DailyIsaActivities] Next report scheduled for ${nextRun.toLocaleString("en-US", { timeZone: EASTERN_TIME_ZONE })}.`);
  schedulerTimer = setTimeout(async () => {
    await sendDailyIsaActivitiesReport();
    scheduleNextReport();
  }, delay);
}

/** Schedules the prior-day shared leadership report for 8:00 AM Eastern every day. */
export function scheduleDailyIsaActivitiesReport(): void {
  scheduleNextReport();
  if (startupRecoveryTimer) clearTimeout(startupRecoveryTimer);
  startupRecoveryTimer = setTimeout(() => {
    const eastern = getEasternTimeParts();
    if (eastern.hour >= REPORT_HOUR) {
      sendDailyIsaActivitiesReport().catch((error) =>
        console.error("[DailyIsaActivities] Startup recovery failed:", error),
      );
    }
  }, 30_000);
}
