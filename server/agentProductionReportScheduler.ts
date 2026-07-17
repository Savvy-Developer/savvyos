import { and, eq, gte, isNotNull, lte } from "drizzle-orm";
import { getDb } from "./db";
import {
  scheduledReportRuns,
  transactions,
  users,
} from "../drizzle/schema";
import { sendTransactionalEmail } from "./_core/resendEmail";

const EASTERN_TIME_ZONE = "America/New_York";
const REPORT_KEY = "agent_production_report";
const FRIDAY_INDEX = 5;
const REPORT_HOUR = 18;
const STALE_RUN_MS = 60 * 60 * 1000;

type Weekday = "Sun" | "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat";

export interface EasternTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: Weekday;
}

export interface ProductionMetric {
  units: number;
  volume: number;
}

export interface AgentProductionReportRow {
  agentId: number;
  agentName: string;
  currentUnderContract: ProductionMetric;
  newUnderContract7d: ProductionMetric;
  closed7d: ProductionMetric;
  closed30d: ProductionMetric;
  closedMtd: ProductionMetric;
  closedYtd: ProductionMetric;
}

export interface AgentProductionReport {
  reportDate: string;
  reportDateKey: string;
  asOfLabel: string;
  rows: AgentProductionReportRow[];
  totals: Omit<AgentProductionReportRow, "agentId" | "agentName">;
}

interface AgentRecord {
  id: number;
  name: string | null;
}

interface TransactionRecord {
  agentId: number;
  purchasePrice: string | number | null;
  contractDate?: Date | null;
  closingDate?: Date | null;
}

function numberPart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): number {
  const value = parts.find((part) => part.type === type)?.value;
  if (!value) throw new Error(`Missing ${type} in Eastern time conversion.`);
  return Number(value);
}

function weekdayPart(parts: Intl.DateTimeFormatPart[]): Weekday {
  const value = parts.find((part) => part.type === "weekday")?.value;
  if (!["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].includes(value ?? "")) {
    throw new Error("Missing weekday in Eastern time conversion.");
  }
  return value as Weekday;
}

/** Return calendar/time parts in the SavvyOS reporting timezone. */
export function getEasternTimeParts(date = new Date()): EasternTimeParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN_TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23",
  }).formatToParts(date);

  return {
    year: numberPart(parts, "year"),
    month: numberPart(parts, "month"),
    day: numberPart(parts, "day"),
    hour: numberPart(parts, "hour"),
    minute: numberPart(parts, "minute"),
    second: numberPart(parts, "second"),
    weekday: weekdayPart(parts),
  };
}

export function easternDateKey(parts: Pick<EasternTimeParts, "year" | "month" | "day">): string {
  return [parts.year, String(parts.month).padStart(2, "0"), String(parts.day).padStart(2, "0")].join("-");
}

function parseDateKey(dateKey: string): { year: number; month: number; day: number } {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) throw new Error(`Invalid report date key: ${dateKey}`);
  return { year, month, day };
}

/** Add calendar days without changing the reporting timezone. */
export function addEasternDays(dateKey: string, days: number): string {
  const { year, month, day } = parseDateKey(dateKey);
  const value = new Date(Date.UTC(year, month - 1, day + days, 12));
  return [
    value.getUTCFullYear(),
    String(value.getUTCMonth() + 1).padStart(2, "0"),
    String(value.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

/**
 * Converts a wall-clock time in America/New_York to UTC. The report boundaries
 * are at midnight and the run time is 6 PM, neither of which is a DST transition.
 */
export function easternDateTimeToUtc(
  dateKey: string,
  hour = 0,
  minute = 0,
  second = 0,
): Date {
  const { year, month, day } = parseDateKey(dateKey);
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  const localParts = getEasternTimeParts(new Date(utcGuess));
  const interpretedAsUtc = Date.UTC(
    localParts.year,
    localParts.month - 1,
    localParts.day,
    localParts.hour,
    localParts.minute,
    localParts.second,
  );
  const offsetMs = interpretedAsUtc - utcGuess;
  return new Date(utcGuess - offsetMs);
}

function weekdayIndex(weekday: Weekday): number {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
}

/** Find the next Friday at 6:00 PM in Eastern time, including DST adjustments. */
export function getNextFridayAt6PmEastern(now = new Date()): Date {
  const eastern = getEasternTimeParts(now);
  const daysUntilFriday = (FRIDAY_INDEX - weekdayIndex(eastern.weekday) + 7) % 7;
  let targetDate = addEasternDays(easternDateKey(eastern), daysUntilFriday);

  if (
    daysUntilFriday === 0 &&
    (eastern.hour > REPORT_HOUR ||
      (eastern.hour === REPORT_HOUR && (eastern.minute > 0 || eastern.second > 0)) ||
      (eastern.hour === REPORT_HOUR && eastern.minute === 0 && eastern.second === 0))
  ) {
    targetDate = addEasternDays(targetDate, 7);
  }

  return easternDateTimeToUtc(targetDate, REPORT_HOUR);
}

function metric(): ProductionMetric {
  return { units: 0, volume: 0 };
}

function emptyReportRow(agent: AgentRecord): AgentProductionReportRow {
  return {
    agentId: agent.id,
    agentName: agent.name?.trim() || "Unnamed Agent",
    currentUnderContract: metric(),
    newUnderContract7d: metric(),
    closed7d: metric(),
    closed30d: metric(),
    closedMtd: metric(),
    closedYtd: metric(),
  };
}

function sumMetric(target: ProductionMetric, transaction: TransactionRecord): void {
  target.units += 1;
  target.volume += Number(transaction.purchasePrice ?? 0);
}

function sumReportRows(rows: AgentProductionReportRow[]): AgentProductionReport["totals"] {
  const totals = {
    currentUnderContract: metric(),
    newUnderContract7d: metric(),
    closed7d: metric(),
    closed30d: metric(),
    closedMtd: metric(),
    closedYtd: metric(),
  };

  for (const row of rows) {
    for (const key of Object.keys(totals) as Array<keyof typeof totals>) {
      totals[key].units += row[key].units;
      totals[key].volume += row[key].volume;
    }
  }

  return totals;
}

function isInRange(value: Date | null | undefined, start: Date, end: Date): boolean {
  return Boolean(value && value >= start && value <= end);
}

/**
 * Aggregate the report's current-pipeline and closed-production windows. All
 * agents with an active SavvyOS agent account are retained, including zero rows.
 */
export function aggregateAgentProductionMetrics(
  agents: AgentRecord[],
  currentUnderContractTransactions: TransactionRecord[],
  newUnderContractTransactions: TransactionRecord[],
  closedTransactions: TransactionRecord[],
  asOf: Date,
): AgentProductionReportRow[] {
  const asOfEastern = getEasternTimeParts(asOf);
  const sevenDayStart = new Date(asOf.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDayStart = new Date(asOf.getTime() - 30 * 24 * 60 * 60 * 1000);
  const monthStart = easternDateTimeToUtc(`${asOfEastern.year}-${String(asOfEastern.month).padStart(2, "0")}-01`);
  const yearStart = easternDateTimeToUtc(`${asOfEastern.year}-01-01`);

  const rowMap = new Map<number, AgentProductionReportRow>(
    agents.map((agent) => [agent.id, emptyReportRow(agent)]),
  );

  for (const transaction of currentUnderContractTransactions) {
    const row = rowMap.get(transaction.agentId);
    if (!row) continue;
    sumMetric(row.currentUnderContract, transaction);
  }

  for (const transaction of newUnderContractTransactions) {
    const row = rowMap.get(transaction.agentId);
    if (row && isInRange(transaction.contractDate, sevenDayStart, asOf)) {
      sumMetric(row.newUnderContract7d, transaction);
    }
  }

  for (const transaction of closedTransactions) {
    const row = rowMap.get(transaction.agentId);
    if (!row || !transaction.closingDate) continue;
    if (isInRange(transaction.closingDate, sevenDayStart, asOf)) {
      sumMetric(row.closed7d, transaction);
    }
    if (isInRange(transaction.closingDate, thirtyDayStart, asOf)) {
      sumMetric(row.closed30d, transaction);
    }
    if (isInRange(transaction.closingDate, monthStart, asOf)) {
      sumMetric(row.closedMtd, transaction);
    }
    if (isInRange(transaction.closingDate, yearStart, asOf)) {
      sumMetric(row.closedYtd, transaction);
    }
  }

  return Array.from(rowMap.values()).sort((a, b) => {
    const volumeDifference = b.closedYtd.volume - a.closedYtd.volume;
    return volumeDifference !== 0 ? volumeDifference : a.agentName.localeCompare(b.agentName);
  });
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function metricCells(value: ProductionMetric, isTotal = false): string {
  const style = isTotal
    ? "padding:11px 8px;font-size:12px;font-weight:700;color:#FFFFFF;text-align:right;border-top:1px solid #374151;"
    : "padding:10px 8px;font-size:12px;color:#1F2937;text-align:right;border-bottom:1px solid #E5E7EB;white-space:nowrap;";
  return `<td style="${style}">${value.units}</td><td style="${style}">${formatCurrency(value.volume)}</td>`;
}

/** Render the compact, email-client-safe table requested for the weekly report. */
export function renderAgentProductionTable(report: AgentProductionReport): string {
  const groupHeaderStyle = "padding:9px 8px;background:#0A0A0A;color:#FFFFFF;font-size:10px;font-weight:700;letter-spacing:.35px;text-align:center;border-right:1px solid #374151;white-space:nowrap;";
  const subHeaderStyle = "padding:8px;background:#1F2937;color:#E5E7EB;font-size:10px;font-weight:600;text-align:right;border-right:1px solid #374151;white-space:nowrap;";
  const agentHeaderStyle = "padding:9px 10px;background:#0A0A0A;color:#FFFFFF;font-size:10px;font-weight:700;letter-spacing:.35px;text-align:left;border-right:1px solid #374151;white-space:nowrap;";

  const rows = report.rows.map((row, index) => {
    const background = index % 2 === 0 ? "#FFFFFF" : "#F9FAFB";
    return `<tr style="background:${background};"><td style="padding:10px;font-size:12px;font-weight:600;color:#111827;text-align:left;border-bottom:1px solid #E5E7EB;white-space:nowrap;">${escapeHtml(row.agentName)}</td>${metricCells(row.currentUnderContract)}${metricCells(row.newUnderContract7d)}${metricCells(row.closed7d)}${metricCells(row.closed30d)}${metricCells(row.closedMtd)}${metricCells(row.closedYtd)}</tr>`;
  }).join("");

  const total = report.totals;
  return `<div style="margin:20px -16px 20px;overflow-x:auto;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse;min-width:1040px;border:1px solid #D1D5DB;">
      <tr>
        <th rowspan="2" style="${agentHeaderStyle}">Agent</th>
        <th colspan="2" style="${groupHeaderStyle}">Current Under Contract</th>
        <th colspan="2" style="${groupHeaderStyle}">New Under Contract · 7 Days</th>
        <th colspan="2" style="${groupHeaderStyle}">Closed · 7 Days</th>
        <th colspan="2" style="${groupHeaderStyle}">Closed · 30 Days</th>
        <th colspan="2" style="${groupHeaderStyle}">Closed · MTD</th>
        <th colspan="2" style="${groupHeaderStyle}">Closed · YTD</th>
      </tr>
      <tr>
        <th style="${subHeaderStyle}">Units</th><th style="${subHeaderStyle}">Volume</th>
        <th style="${subHeaderStyle}">Units</th><th style="${subHeaderStyle}">Volume</th>
        <th style="${subHeaderStyle}">Units</th><th style="${subHeaderStyle}">Volume</th>
        <th style="${subHeaderStyle}">Units</th><th style="${subHeaderStyle}">Volume</th>
        <th style="${subHeaderStyle}">Units</th><th style="${subHeaderStyle}">Volume</th>
        <th style="${subHeaderStyle}">Units</th><th style="${subHeaderStyle}">Volume</th>
      </tr>
      ${rows || `<tr><td colspan="13" style="padding:18px;text-align:center;color:#6B7280;font-size:13px;">No active agents were found.</td></tr>`}
      <tr style="background:#0A0A0A;">
        <td style="padding:11px 10px;font-size:12px;font-weight:700;color:#FFFFFF;text-align:left;border-top:1px solid #374151;">Total</td>
        ${metricCells(total.currentUnderContract, true)}
        ${metricCells(total.newUnderContract7d, true)}
        ${metricCells(total.closed7d, true)}
        ${metricCells(total.closed30d, true)}
        ${metricCells(total.closedMtd, true)}
        ${metricCells(total.closedYtd, true)}
      </tr>
    </table>
  </div>`;
}

export async function buildAgentProductionReport(asOf = new Date()): Promise<AgentProductionReport> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available for the agent production report.");

  const eastern = getEasternTimeParts(asOf);
  const reportDateKey = easternDateKey(eastern);
  const yearStart = easternDateTimeToUtc(`${eastern.year}-01-01`);
  const sevenDayStart = new Date(asOf.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [agents, currentUnderContractTransactions, newUnderContractTransactions, closedTransactions] = await Promise.all([
    db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(and(eq(users.role, "agent"), eq(users.isActive, true)))
      .orderBy(users.name),
    db
      .select({
        agentId: transactions.agentId,
        purchasePrice: transactions.purchasePrice,
        contractDate: transactions.contractDate,
      })
      .from(transactions)
      .where(eq(transactions.status, "under_contract")),
    db
      .select({
        agentId: transactions.agentId,
        purchasePrice: transactions.purchasePrice,
        contractDate: transactions.contractDate,
      })
      .from(transactions)
      .where(
        and(
          isNotNull(transactions.contractDate),
          gte(transactions.contractDate, sevenDayStart),
          lte(transactions.contractDate, asOf),
        ),
      ),
    db
      .select({
        agentId: transactions.agentId,
        purchasePrice: transactions.purchasePrice,
        closingDate: transactions.closingDate,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.status, "closed"),
          isNotNull(transactions.closingDate),
          gte(transactions.closingDate, yearStart),
          lte(transactions.closingDate, asOf),
        ),
      ),
  ]);

  const rows = aggregateAgentProductionMetrics(
    agents,
    currentUnderContractTransactions,
    newUnderContractTransactions,
    closedTransactions,
    asOf,
  );
  const dateLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN_TIME_ZONE,
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(asOf);
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

  return {
    reportDate: dateLabel,
    reportDateKey,
    asOfLabel,
    rows,
    totals: sumReportRows(rows),
  };
}

async function claimReportRun(reportDate: string): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available for report-run tracking.");

  const existing = await db
    .select()
    .from(scheduledReportRuns)
    .where(and(eq(scheduledReportRuns.reportKey, REPORT_KEY), eq(scheduledReportRuns.reportDate, reportDate)))
    .limit(1);
  const run = existing[0];

  if (run?.status === "sent") {
    console.info(`[AgentProductionReport] ${reportDate} already delivered — skipping duplicate run.`);
    return false;
  }
  if (run?.status === "running" && Date.now() - run.startedAt.getTime() < STALE_RUN_MS) {
    console.info(`[AgentProductionReport] ${reportDate} is already running — skipping overlap.`);
    return false;
  }

  if (run) {
    await db
      .update(scheduledReportRuns)
      .set({
        status: "running",
        startedAt: new Date(),
        completedAt: null,
        recipientCount: 0,
        successfulRecipientCount: 0,
        errorMessage: null,
      })
      .where(eq(scheduledReportRuns.id, run.id));
  } else {
    try {
      await db.insert(scheduledReportRuns).values({
        reportKey: REPORT_KEY,
        reportDate,
        status: "running",
        startedAt: new Date(),
      });
    } catch (error) {
      // A concurrent process may have claimed the same report between the read and insert.
      console.warn("[AgentProductionReport] Could not claim report run:", error);
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

  await db
    .update(scheduledReportRuns)
    .set({
      status,
      recipientCount,
      successfulRecipientCount,
      errorMessage: errorMessage ?? null,
      completedAt: new Date(),
    })
    .where(and(eq(scheduledReportRuns.reportKey, REPORT_KEY), eq(scheduledReportRuns.reportDate, reportDate)));
}

/** Build and deliver the report to every active SavvyOS administrator. */
export async function sendAgentProductionReport(asOf = new Date()): Promise<void> {
  const report = await buildAgentProductionReport(asOf);
  if (!(await claimReportRun(report.reportDateKey))) return;

  try {
    const db = await getDb();
    if (!db) throw new Error("Database is not available for administrator lookup.");

    const admins = await db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(and(eq(users.role, "admin"), eq(users.isActive, true), isNotNull(users.email)));

    if (admins.length === 0) {
      await finalizeReportRun(report.reportDateKey, "skipped", 0, 0, "No active administrators with email addresses were found.");
      console.warn("[AgentProductionReport] No active administrator recipients found.");
      return;
    }

    const tableHtml = renderAgentProductionTable(report);
    let successfulRecipientCount = 0;
    const failures: string[] = [];

    for (const admin of admins) {
      const delivery = await sendTransactionalEmail(
        "agent_production_report",
        {
          recipientName: admin.name ?? undefined,
          recipientEmail: admin.email!,
          reportDate: report.reportDate,
          reportAsOf: report.asOfLabel,
          reportTableHtml: tableHtml,
        },
        {
          allowTemplateOverride: false,
          idempotencyKey: `${REPORT_KEY}:${report.reportDateKey}:admin:${admin.id}`,
        },
      );

      if (delivery.sent) {
        successfulRecipientCount += 1;
      } else if (delivery.skipped) {
        console.info(`[AgentProductionReport] Delivery to ${admin.email} was skipped: ${delivery.reason ?? "notification disabled"}.`);
      } else {
        failures.push(`${admin.email}: ${delivery.reason ?? "email delivery failed"}`);
      }
    }

    const status = successfulRecipientCount === admins.length
      ? "sent"
      : successfulRecipientCount > 0
        ? "partial"
        : failures.length > 0
          ? "failed"
          : "skipped";
    await finalizeReportRun(
      report.reportDateKey,
      status,
      admins.length,
      successfulRecipientCount,
      failures.length ? failures.join(" | ") : undefined,
    );
    console.info(`[AgentProductionReport] ${status}: ${successfulRecipientCount}/${admins.length} administrator delivery attempt(s) completed for ${report.reportDateKey}.`);
  } catch (error: any) {
    const message = error instanceof Error ? error.message : String(error);
    await finalizeReportRun(report.reportDateKey, "failed", 0, 0, message);
    console.error("[AgentProductionReport] Weekly report failed:", error);
  }
}

let schedulerTimer: NodeJS.Timeout | undefined;
let startupRecoveryTimer: NodeJS.Timeout | undefined;

function scheduleNextReport(): void {
  if (schedulerTimer) clearTimeout(schedulerTimer);
  const nextRun = getNextFridayAt6PmEastern();
  const delay = Math.max(nextRun.getTime() - Date.now(), 1_000);
  console.info(`[AgentProductionReport] Next Friday report scheduled for ${nextRun.toLocaleString("en-US", { timeZone: EASTERN_TIME_ZONE })}.`);

  schedulerTimer = setTimeout(async () => {
    await sendAgentProductionReport();
    scheduleNextReport();
  }, delay);
}

/**
 * Schedule the report for 6:00 PM every Friday in America/New_York. A startup
 * recovery check covers a same-Friday service restart after the scheduled time;
 * durable run records prevent duplicate sends.
 */
export function scheduleAgentProductionReport(): void {
  scheduleNextReport();

  if (startupRecoveryTimer) clearTimeout(startupRecoveryTimer);
  startupRecoveryTimer = setTimeout(() => {
    const eastern = getEasternTimeParts();
    if (eastern.weekday === "Fri" && eastern.hour >= REPORT_HOUR) {
      sendAgentProductionReport().catch((error) =>
        console.error("[AgentProductionReport] Startup recovery failed:", error),
      );
    }
  }, 30_000);
}
