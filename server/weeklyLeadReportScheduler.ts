import { and, eq, gte, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import { getDb } from "./db";
import {
  agentConnections,
  communications,
  contacts,
  leadSources,
  tasks,
  transactions,
} from "../drizzle/schema";
import { sendTransactionalEmail } from "./_core/resendEmail";
import { addEasternDays, easternDateKey, easternDateTimeToUtc, getEasternTimeParts } from "./agentProductionReportScheduler";

const EASTERN_TIME_ZONE = "America/New_York";
const APP_URL = "https://os.savvy-agents.com";
const TEST_RECIPIENT_EMAIL = "tyler@savvy.realty";

type SourceKey = number | null;
type PipelineStatus = "new_lead" | "attempted_contact" | "nurture" | "active_client" | "under_contract" | "closed" | "dead" | "do_not_contact";

interface MetricTotals {
  newLeads: number;
  r30Leads: number;
  r30Appointments: number;
  r90Leads: number;
  r90Appointments: number;
  transactionsCreated: number;
  historicalTransactionsAdded: number;
  newUnderContract: number;
  closedTransactions: number;
  contractVolume: number;
  closedVolume: number;
  closedGci: number;
  appointmentsSet: number;
  newAgentConnections: number;
  communications: number;
}

interface CohortMetrics {
  leads: number;
  appointments: number;
  transactionsStarted: number;
  transactionsClosed: number;
  closedGci: number;
}

export interface WeeklyLeadReportSourceRow extends MetricTotals {
  sourceId: number | null;
  sourceName: string;
  parentSourceName: string | null;
  cohort: CohortMetrics;
}

export interface WeeklyLeadReport {
  reportDateKey: string;
  periodLabel: string;
  asOfLabel: string;
  rows: WeeklyLeadReportSourceRow[];
  totals: MetricTotals;
  cohortTotals: CohortMetrics;
  pipeline: Record<PipelineStatus, number>;
  dataEntry: {
    transactionRecordsAdded: number;
    historicalTransactionsAdded: number;
    historicalUnderContractAdded: number;
    historicalClosedAdded: number;
    historicalTerminatedAdded: number;
  };
  quality: {
    unattributedNewLeads: number;
    unattributedTransactions: number;
    unassignedNewLeads: number;
    agingUnworkedLeads: number;
    overdueOpenTasks: number;
    inactiveSourcesReceivingNewLeads: number;
  };
}

interface SourceDefinition {
  id: number;
  name: string;
  parentId: number | null;
  isActive: boolean;
}

interface ContactRecord {
  id: number;
  leadSourceId: number | null;
  createdAt: Date;
  assignedIsaId: number | null;
  isaStatus: PipelineStatus | null;
  doNotContact: boolean;
}

function emptyTotals(): MetricTotals {
  return {
    newLeads: 0,
    r30Leads: 0,
    r30Appointments: 0,
    r90Leads: 0,
    r90Appointments: 0,
    transactionsCreated: 0,
    historicalTransactionsAdded: 0,
    newUnderContract: 0,
    closedTransactions: 0,
    contractVolume: 0,
    closedVolume: 0,
    closedGci: 0,
    appointmentsSet: 0,
    newAgentConnections: 0,
    communications: 0,
  };
}

function emptyCohort(): CohortMetrics {
  return { leads: 0, appointments: 0, transactionsStarted: 0, transactionsClosed: 0, closedGci: 0 };
}

function emptyPipeline(): Record<PipelineStatus, number> {
  return {
    new_lead: 0,
    attempted_contact: 0,
    nurture: 0,
    active_client: 0,
    under_contract: 0,
    closed: 0,
    dead: 0,
    do_not_contact: 0,
  };
}

function sourceMapKey(sourceId: SourceKey): string {
  return sourceId === null ? "unattributed" : String(sourceId);
}

function numberValue(value: unknown): number {
  return Number(value ?? 0) || 0;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(numerator: number, denominator: number): string {
  if (!denominator) return "—";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function weekWindow(asOf: Date): { start: Date; end: Date; reportDateKey: string; cohortStart: Date; cohortEnd: Date } {
  const eastern = getEasternTimeParts(asOf);
  const reportDateKey = easternDateKey(eastern);
  const end = easternDateTimeToUtc(addEasternDays(reportDateKey, 1), 0);
  const start = easternDateTimeToUtc(addEasternDays(reportDateKey, -6), 0);
  // Leads in this range are 90–179 days old as of the report cutoff, giving them
  // time to mature before their source conversion is evaluated.
  const cohortStart = easternDateTimeToUtc(addEasternDays(reportDateKey, -179), 0);
  const cohortEnd = easternDateTimeToUtc(addEasternDays(reportDateKey, -89), 0);
  return { start, end, reportDateKey, cohortStart, cohortEnd };
}

function createSourceRows(sources: SourceDefinition[]): Map<string, WeeklyLeadReportSourceRow> {
  const byId = new Map(sources.map((source) => [source.id, source]));
  const rows = new Map<string, WeeklyLeadReportSourceRow>();

  function get(sourceId: SourceKey): WeeklyLeadReportSourceRow {
    const key = sourceMapKey(sourceId);
    const existing = rows.get(key);
    if (existing) return existing;

    const source = sourceId === null ? undefined : byId.get(sourceId);
    const parent = source?.parentId ? byId.get(source.parentId) : undefined;
    const sourceName = !source ? "Missing Source Attribution" : parent ? `${parent.name} · ${source.name}` : source.name;
    const row: WeeklyLeadReportSourceRow = {
      sourceId,
      sourceName,
      parentSourceName: parent?.name ?? null,
      ...emptyTotals(),
      cohort: emptyCohort(),
    };
    rows.set(key, row);
    return row;
  }

  // Start with the unattributed bucket so incomplete attribution is always visible.
  get(null);
  for (const source of sources) get(source.id);
  return rows;
}

function addTotals(target: MetricTotals, source: MetricTotals): void {
  target.newLeads += source.newLeads;
  target.r30Leads += source.r30Leads;
  target.r30Appointments += source.r30Appointments;
  target.r90Leads += source.r90Leads;
  target.r90Appointments += source.r90Appointments;
  target.transactionsCreated += source.transactionsCreated;
  target.historicalTransactionsAdded += source.historicalTransactionsAdded;
  target.newUnderContract += source.newUnderContract;
  target.closedTransactions += source.closedTransactions;
  target.contractVolume += source.contractVolume;
  target.closedVolume += source.closedVolume;
  target.closedGci += source.closedGci;
  target.appointmentsSet += source.appointmentsSet;
  target.newAgentConnections += source.newAgentConnections;
  target.communications += source.communications;
}

function addCohort(target: CohortMetrics, source: CohortMetrics): void {
  target.leads += source.leads;
  target.appointments += source.appointments;
  target.transactionsStarted += source.transactionsStarted;
  target.transactionsClosed += source.transactionsClosed;
  target.closedGci += source.closedGci;
}

function totalRows(rows: WeeklyLeadReportSourceRow[]): MetricTotals {
  return rows.reduce((total, row) => {
    addTotals(total, row);
    return total;
  }, emptyTotals());
}

function totalCohort(rows: WeeklyLeadReportSourceRow[]): CohortMetrics {
  return rows.reduce((total, row) => {
    addCohort(total, row.cohort);
    return total;
  }, emptyCohort());
}

function sourceMetricRows(rows: WeeklyLeadReportSourceRow[]): WeeklyLeadReportSourceRow[] {
  return rows
    .filter((row) => row.newLeads || row.r30Leads || row.r90Leads || row.transactionsCreated || row.newUnderContract || row.closedTransactions || row.appointmentsSet || row.closedGci || row.cohort.leads || row.cohort.transactionsStarted || row.cohort.transactionsClosed)
    .sort((a, b) => {
      const revenue = b.closedGci - a.closedGci;
      if (revenue !== 0) return revenue;
      const contracts = b.newUnderContract - a.newUnderContract;
      if (contracts !== 0) return contracts;
      const leads = b.newLeads - a.newLeads;
      if (leads !== 0) return leads;
      return a.sourceName.localeCompare(b.sourceName);
    });
}

/**
 * Build one source-attributed leadership report for the completed rolling seven
 * calendar days in America/New_York. The source hierarchy is preserved in the
 * email while all aggregation is performed at the contact's assigned lead source.
 */
export async function buildWeeklyLeadReport(asOf = new Date()): Promise<WeeklyLeadReport> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available for the weekly Lead Report.");

  const { start, end, reportDateKey, cohortStart, cohortEnd } = weekWindow(asOf);
  const recentLeadStart = easternDateTimeToUtc(addEasternDays(reportDateKey, -29), 0);
  const rolling30Start = recentLeadStart;
  const rolling90Start = easternDateTimeToUtc(addEasternDays(reportDateKey, -89), 0);
  const [sources, weeklyContacts, rolling30Contacts, rolling90Contacts, cohortContacts, weeklyConnections, weeklyAppointments, rolling30Appointments, rolling90Appointments, weeklyCommunications, createdTransactions, contractedTransactions, closedTransactions, cohortAppointments, cohortStartedTransactions, cohortClosedTransactions, activePipelineRows, qualityRows, overdueTaskRows] = await Promise.all([
    db.select({ id: leadSources.id, name: leadSources.name, parentId: leadSources.parentId, isActive: leadSources.isActive }).from(leadSources),
    db.select({ id: contacts.id, leadSourceId: contacts.leadSourceId, createdAt: contacts.createdAt, assignedIsaId: contacts.assignedIsaId, isaStatus: contacts.isaStatus, doNotContact: contacts.doNotContact })
      .from(contacts)
      .where(and(isNull(contacts.archivedAt), gte(contacts.createdAt, start), lt(contacts.createdAt, end))),
    db.select({ leadSourceId: contacts.leadSourceId, count: sql<number>`COUNT(*)` })
      .from(contacts)
      .where(and(isNull(contacts.archivedAt), gte(contacts.createdAt, rolling30Start), lt(contacts.createdAt, end)))
      .groupBy(contacts.leadSourceId),
    db.select({ leadSourceId: contacts.leadSourceId, count: sql<number>`COUNT(*)` })
      .from(contacts)
      .where(and(isNull(contacts.archivedAt), gte(contacts.createdAt, rolling90Start), lt(contacts.createdAt, end)))
      .groupBy(contacts.leadSourceId),
    db.select({ id: contacts.id, leadSourceId: contacts.leadSourceId, createdAt: contacts.createdAt })
      .from(contacts)
      .where(and(isNull(contacts.archivedAt), gte(contacts.createdAt, cohortStart), lt(contacts.createdAt, cohortEnd))),
    db.select({ leadSourceId: contacts.leadSourceId })
      .from(agentConnections)
      .innerJoin(contacts, eq(agentConnections.contactId, contacts.id))
      .where(and(gte(agentConnections.createdAt, start), lt(agentConnections.createdAt, end))),
    db.select({ leadSourceId: contacts.leadSourceId, count: sql<number>`COUNT(DISTINCT ${agentConnections.contactId})` })
      .from(agentConnections)
      .innerJoin(contacts, eq(agentConnections.contactId, contacts.id))
      .where(and(isNull(contacts.archivedAt), gte(contacts.createdAt, start), lt(contacts.createdAt, end), eq(agentConnections.appointmentSet, true), lt(sql<Date>`COALESCE(${agentConnections.appointmentSetAt}, ${agentConnections.createdAt})`, end)))
      .groupBy(contacts.leadSourceId),
    db.select({ leadSourceId: contacts.leadSourceId, count: sql<number>`COUNT(DISTINCT ${agentConnections.contactId})` })
      .from(agentConnections)
      .innerJoin(contacts, eq(agentConnections.contactId, contacts.id))
      .where(and(isNull(contacts.archivedAt), gte(contacts.createdAt, rolling30Start), lt(contacts.createdAt, end), eq(agentConnections.appointmentSet, true), lt(sql<Date>`COALESCE(${agentConnections.appointmentSetAt}, ${agentConnections.createdAt})`, end)))
      .groupBy(contacts.leadSourceId),
    db.select({ leadSourceId: contacts.leadSourceId, count: sql<number>`COUNT(DISTINCT ${agentConnections.contactId})` })
      .from(agentConnections)
      .innerJoin(contacts, eq(agentConnections.contactId, contacts.id))
      .where(and(isNull(contacts.archivedAt), gte(contacts.createdAt, rolling90Start), lt(contacts.createdAt, end), eq(agentConnections.appointmentSet, true), lt(sql<Date>`COALESCE(${agentConnections.appointmentSetAt}, ${agentConnections.createdAt})`, end)))
      .groupBy(contacts.leadSourceId),
    db.select({ leadSourceId: contacts.leadSourceId, count: sql<number>`COUNT(*)` })
      .from(communications)
      .innerJoin(contacts, eq(communications.relatedContactId, contacts.id))
      .where(and(gte(communications.communicatedAt, start), lt(communications.communicatedAt, end)))
      .groupBy(contacts.leadSourceId),
    db.select({ leadSourceId: contacts.leadSourceId, purchasePrice: transactions.purchasePrice, grossCommissionIncome: transactions.grossCommissionIncome, contractDate: transactions.contractDate, status: transactions.status })
      .from(transactions)
      .innerJoin(contacts, eq(transactions.primaryContactId, contacts.id))
      .where(and(gte(transactions.createdAt, start), lt(transactions.createdAt, end))),
    db.select({ leadSourceId: contacts.leadSourceId, purchasePrice: transactions.purchasePrice })
      .from(transactions)
      .innerJoin(contacts, eq(transactions.primaryContactId, contacts.id))
      .where(and(isNotNull(transactions.contractDate), gte(transactions.contractDate, start), lt(transactions.contractDate, end))),
    db.select({ leadSourceId: contacts.leadSourceId, purchasePrice: transactions.purchasePrice, grossCommissionIncome: transactions.grossCommissionIncome })
      .from(transactions)
      .innerJoin(contacts, eq(transactions.primaryContactId, contacts.id))
      .where(and(eq(transactions.status, "closed"), isNotNull(transactions.closingDate), gte(transactions.closingDate, start), lt(transactions.closingDate, end))),
    db.select({ leadSourceId: contacts.leadSourceId, count: sql<number>`COUNT(DISTINCT ${agentConnections.contactId})` })
      .from(agentConnections)
      .innerJoin(contacts, eq(agentConnections.contactId, contacts.id))
      .where(and(isNull(contacts.archivedAt), gte(contacts.createdAt, cohortStart), lt(contacts.createdAt, cohortEnd), eq(agentConnections.appointmentSet, true), lt(sql<Date>`COALESCE(${agentConnections.appointmentSetAt}, ${agentConnections.createdAt})`, end)))
      .groupBy(contacts.leadSourceId),
    db.select({ leadSourceId: contacts.leadSourceId, count: sql<number>`COUNT(DISTINCT ${transactions.id})` })
      .from(transactions)
      .innerJoin(contacts, eq(transactions.primaryContactId, contacts.id))
      .where(and(isNull(contacts.archivedAt), gte(contacts.createdAt, cohortStart), lt(contacts.createdAt, cohortEnd), isNotNull(transactions.contractDate), lt(transactions.contractDate, end)))
      .groupBy(contacts.leadSourceId),
    db.select({ leadSourceId: contacts.leadSourceId, count: sql<number>`COUNT(DISTINCT ${contacts.id})`, gci: sql<number>`COALESCE(SUM(${transactions.grossCommissionIncome}), 0)` })
      .from(transactions)
      .innerJoin(contacts, eq(transactions.primaryContactId, contacts.id))
      .where(and(isNull(contacts.archivedAt), gte(contacts.createdAt, cohortStart), lt(contacts.createdAt, cohortEnd), eq(transactions.status, "closed"), isNotNull(transactions.closingDate), lt(transactions.closingDate, end)))
      .groupBy(contacts.leadSourceId),
    db.select({ isaStatus: contacts.isaStatus, doNotContact: contacts.doNotContact, count: sql<number>`COUNT(*)` })
      .from(contacts)
      .where(isNull(contacts.archivedAt))
      .groupBy(contacts.isaStatus, contacts.doNotContact),
    db.select({
      unattributedNewLeads: sql<number>`SUM(CASE WHEN ${contacts.leadSourceId} IS NULL AND ${contacts.createdAt} >= ${start} AND ${contacts.createdAt} < ${end} AND ${contacts.archivedAt} IS NULL THEN 1 ELSE 0 END)`,
      unassignedNewLeads: sql<number>`SUM(CASE WHEN ${contacts.assignedIsaId} IS NULL AND ${contacts.createdAt} >= ${start} AND ${contacts.createdAt} < ${end} AND ${contacts.archivedAt} IS NULL THEN 1 ELSE 0 END)`,
      agingUnworkedLeads: sql<number>`SUM(CASE WHEN ${contacts.archivedAt} IS NULL AND ${contacts.createdAt} >= ${recentLeadStart} AND ${contacts.createdAt} < ${start} AND ${contacts.isaStatus} IN ('new_lead', 'attempted_contact') THEN 1 ELSE 0 END)`,
    }).from(contacts),
    db.select({ count: sql<number>`COUNT(*)` })
      .from(tasks)
      .where(and(or(eq(tasks.status, "pending"), eq(tasks.status, "in_progress")), isNotNull(tasks.dueDate), lt(tasks.dueDate, end))),
  ]);

  const rowsBySource = createSourceRows(sources);
  const rowFor = (sourceId: SourceKey) => rowsBySource.get(sourceMapKey(sourceId))!;

  for (const contact of weeklyContacts as ContactRecord[]) {
    const row = rowFor(contact.leadSourceId);
    row.newLeads += 1;
  }
  for (const contact of cohortContacts) rowFor(contact.leadSourceId).cohort.leads += 1;
  for (const result of rolling30Contacts) rowFor(result.leadSourceId).r30Leads += numberValue(result.count);
  for (const result of rolling90Contacts) rowFor(result.leadSourceId).r90Leads += numberValue(result.count);
  for (const connection of weeklyConnections) rowFor(connection.leadSourceId).newAgentConnections += 1;
  for (const appointment of weeklyAppointments) rowFor(appointment.leadSourceId).appointmentsSet += numberValue(appointment.count);
  for (const result of rolling30Appointments) rowFor(result.leadSourceId).r30Appointments += numberValue(result.count);
  for (const result of rolling90Appointments) rowFor(result.leadSourceId).r90Appointments += numberValue(result.count);
  for (const communication of weeklyCommunications) rowFor(communication.leadSourceId).communications += numberValue(communication.count);
  for (const transaction of createdTransactions) {
    const row = rowFor(transaction.leadSourceId);
    row.transactionsCreated += 1;
    if (transaction.contractDate && transaction.contractDate < start) row.historicalTransactionsAdded += 1;
  }
  for (const transaction of contractedTransactions) {
    const row = rowFor(transaction.leadSourceId);
    row.newUnderContract += 1;
    row.contractVolume += numberValue(transaction.purchasePrice);
  }
  for (const transaction of closedTransactions) {
    const row = rowFor(transaction.leadSourceId);
    row.closedTransactions += 1;
    row.closedVolume += numberValue(transaction.purchasePrice);
    row.closedGci += numberValue(transaction.grossCommissionIncome);
  }
  for (const result of cohortAppointments) rowFor(result.leadSourceId).cohort.appointments += numberValue(result.count);
  for (const result of cohortStartedTransactions) rowFor(result.leadSourceId).cohort.transactionsStarted += numberValue(result.count);
  for (const result of cohortClosedTransactions) {
    const row = rowFor(result.leadSourceId);
    row.cohort.transactionsClosed += numberValue(result.count);
    row.cohort.closedGci += numberValue(result.gci);
  }

  const pipeline = emptyPipeline();
  for (const record of activePipelineRows) {
    const count = numberValue(record.count);
    const status = record.doNotContact ? "do_not_contact" : record.isaStatus;
    if (status && status in pipeline) pipeline[status as PipelineStatus] += count;
  }

  const allRows = Array.from(rowsBySource.values());
  const rows = sourceMetricRows(allRows);
  const sourceDefinitions = new Map(sources.map((source) => [source.id, source]));
  const inactiveSourcesReceivingNewLeads = rows.filter((row) => row.sourceId !== null && row.newLeads > 0 && !sourceDefinitions.get(row.sourceId)?.isActive).length;
  const weeklyAttributedTransactions = createdTransactions.length + contractedTransactions.length + closedTransactions.length;
  const unattributedTransactions = createdTransactions.filter((item) => item.leadSourceId === null).length
    + contractedTransactions.filter((item) => item.leadSourceId === null).length
    + closedTransactions.filter((item) => item.leadSourceId === null).length;
  const quality = qualityRows[0];
  const historicalTransactionRecords = createdTransactions.filter((transaction) => transaction.contractDate && transaction.contractDate < start);
  const historicalUnderContractAdded = historicalTransactionRecords.filter((transaction) => transaction.status === "under_contract").length;
  const historicalClosedAdded = historicalTransactionRecords.filter((transaction) => transaction.status === "closed").length;
  const historicalTerminatedAdded = historicalTransactionRecords.filter((transaction) => transaction.status === "terminated").length;
  const dateLabel = new Intl.DateTimeFormat("en-US", { timeZone: EASTERN_TIME_ZONE, month: "long", day: "numeric", year: "numeric" }).format(asOf);
  const asOfLabel = new Intl.DateTimeFormat("en-US", { timeZone: EASTERN_TIME_ZONE, weekday: "long", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(asOf);

  return {
    reportDateKey,
    periodLabel: `${new Intl.DateTimeFormat("en-US", { timeZone: EASTERN_TIME_ZONE, month: "short", day: "numeric" }).format(start)}–${new Intl.DateTimeFormat("en-US", { timeZone: EASTERN_TIME_ZONE, month: "short", day: "numeric", year: "numeric" }).format(new Date(end.getTime() - 1))}`,
    asOfLabel,
    rows,
    totals: totalRows(rows),
    cohortTotals: totalCohort(allRows),
    pipeline,
    dataEntry: {
      transactionRecordsAdded: createdTransactions.length,
      historicalTransactionsAdded: historicalTransactionRecords.length,
      historicalUnderContractAdded,
      historicalClosedAdded,
      historicalTerminatedAdded,
    },
    quality: {
      unattributedNewLeads: numberValue(quality?.unattributedNewLeads),
      unattributedTransactions: weeklyAttributedTransactions ? unattributedTransactions : 0,
      unassignedNewLeads: numberValue(quality?.unassignedNewLeads),
      agingUnworkedLeads: numberValue(quality?.agingUnworkedLeads),
      overdueOpenTasks: numberValue(overdueTaskRows[0]?.count),
      inactiveSourcesReceivingNewLeads,
    },
  };
}

function metricCard(value: string, label: string, color = "#111827", width = "33.333%"): string {
  return `<td width="${width}" style="padding:5px;vertical-align:top;"><div style="border:1px solid #E5E7EB;border-radius:8px;padding:13px;background:#FFFFFF;"><div style="font-size:22px;font-weight:700;color:${color};line-height:1.1;">${escapeHtml(value)}</div><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:#6B7280;margin-top:5px;line-height:1.35;">${escapeHtml(label)}</div></div></td>`;
}

function sectionHeading(title: string, detail?: string): string {
  return `<div style="margin:26px 0 10px;"><div style="font-size:15px;font-weight:700;color:#111827;">${escapeHtml(title)}</div>${detail ? `<div style="font-size:11px;color:#6B7280;line-height:1.45;margin-top:3px;">${escapeHtml(detail)}</div>` : ""}</div>`;
}

function weeklyLeadTable(rows: WeeklyLeadReportSourceRow[]): string {
  const visibleRows = rows
    .filter((row) => row.newLeads > 0)
    .sort((a, b) => b.newLeads - a.newLeads || b.r30Leads - a.r30Leads || a.sourceName.localeCompare(b.sourceName));
  const tableRows = visibleRows.map((row, index) => `<tr style="background:${index % 2 ? "#F9FAFB" : "#FFFFFF"};"><td style="padding:10px 8px;border-bottom:1px solid #E5E7EB;font-size:12px;font-weight:600;color:#111827;white-space:nowrap;">${escapeHtml(row.sourceName)}</td><td style="padding:10px 6px;border-bottom:1px solid #E5E7EB;text-align:center;font-size:12px;color:#374151;">${formatInteger(row.newLeads)}</td><td style="padding:10px 6px;border-bottom:1px solid #E5E7EB;text-align:center;font-size:12px;color:#374151;">${formatInteger(row.appointmentsSet)}</td><td style="padding:10px 6px;border-bottom:1px solid #E5E7EB;text-align:center;font-size:12px;font-weight:600;color:#111827;">${formatPercent(row.appointmentsSet, row.newLeads)}</td><td style="padding:10px 6px;border-bottom:1px solid #E5E7EB;text-align:center;font-size:12px;color:#374151;">${formatInteger(row.r30Leads)}</td><td style="padding:10px 6px;border-bottom:1px solid #E5E7EB;text-align:center;font-size:12px;color:#374151;">${formatInteger(row.r30Appointments)}</td><td style="padding:10px 6px;border-bottom:1px solid #E5E7EB;text-align:center;font-size:12px;font-weight:600;color:#111827;">${formatPercent(row.r30Appointments, row.r30Leads)}</td><td style="padding:10px 6px;border-bottom:1px solid #E5E7EB;text-align:center;font-size:12px;color:#374151;">${formatInteger(row.r90Leads)}</td><td style="padding:10px 6px;border-bottom:1px solid #E5E7EB;text-align:center;font-size:12px;color:#374151;">${formatInteger(row.r90Appointments)}</td><td style="padding:10px 6px;border-bottom:1px solid #E5E7EB;text-align:center;font-size:12px;font-weight:600;color:#111827;">${formatPercent(row.r90Appointments, row.r90Leads)}</td></tr>`).join("");
  return `<div style="overflow-x:auto;margin:0 -12px;"><table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="min-width:950px;border:1px solid #D1D5DB;border-collapse:collapse;"><tr style="background:#111827;"><th rowspan="2" style="padding:9px 8px;text-align:left;color:#FFFFFF;font-size:10px;letter-spacing:.3px;border-bottom:1px solid #374151;">LEAD SOURCE</th><th colspan="3" style="padding:9px 6px;text-align:center;color:#FFFFFF;font-size:10px;letter-spacing:.3px;border-bottom:1px solid #374151;">THIS WEEK</th><th colspan="3" style="padding:9px 6px;text-align:center;color:#FFFFFF;font-size:10px;letter-spacing:.3px;border-bottom:1px solid #374151;">R30</th><th colspan="3" style="padding:9px 6px;text-align:center;color:#FFFFFF;font-size:10px;letter-spacing:.3px;border-bottom:1px solid #374151;">R90</th></tr><tr style="background:#0A0A0A;"><th style="padding:8px 6px;text-align:center;color:#FFFFFF;font-size:9px;">LEADS</th><th style="padding:8px 6px;text-align:center;color:#FFFFFF;font-size:9px;">APPTS</th><th style="padding:8px 6px;text-align:center;color:#FFFFFF;font-size:9px;">RATE</th><th style="padding:8px 6px;text-align:center;color:#FFFFFF;font-size:9px;">LEADS</th><th style="padding:8px 6px;text-align:center;color:#FFFFFF;font-size:9px;">APPTS</th><th style="padding:8px 6px;text-align:center;color:#FFFFFF;font-size:9px;">RATE</th><th style="padding:8px 6px;text-align:center;color:#FFFFFF;font-size:9px;">LEADS</th><th style="padding:8px 6px;text-align:center;color:#FFFFFF;font-size:9px;">APPTS</th><th style="padding:8px 6px;text-align:center;color:#FFFFFF;font-size:9px;">RATE</th></tr>${tableRows || `<tr><td colspan="10" style="padding:18px;text-align:center;color:#6B7280;font-size:12px;">No new leads were recorded this week.</td></tr>`}</table></div>`;
}

function matureYieldTable(rows: WeeklyLeadReportSourceRow[]): string {
  const visibleRows = rows
    .filter((row) => row.cohort.leads >= 10 || row.cohort.transactionsClosed > 0)
    .sort((a, b) => b.cohort.closedGci - a.cohort.closedGci || b.cohort.transactionsClosed - a.cohort.transactionsClosed || b.cohort.leads - a.cohort.leads || a.sourceName.localeCompare(b.sourceName));
  const tableRows = visibleRows.map((row, index) => `<tr style="background:${index % 2 ? "#F9FAFB" : "#FFFFFF"};"><td style="padding:10px 8px;border-bottom:1px solid #E5E7EB;font-size:12px;font-weight:600;color:#111827;">${escapeHtml(row.sourceName)}</td><td style="padding:10px 7px;border-bottom:1px solid #E5E7EB;text-align:center;font-size:12px;color:#374151;">${formatInteger(row.cohort.leads)}</td><td style="padding:10px 7px;border-bottom:1px solid #E5E7EB;text-align:center;font-size:12px;color:#374151;">${formatInteger(row.cohort.transactionsClosed)}</td><td style="padding:10px 7px;border-bottom:1px solid #E5E7EB;text-align:center;font-size:12px;font-weight:600;color:#111827;">${formatPercent(row.cohort.transactionsClosed, row.cohort.leads)}</td><td style="padding:10px 7px;border-bottom:1px solid #E5E7EB;text-align:right;font-size:12px;font-weight:600;color:#111827;white-space:nowrap;">${formatCurrency(row.cohort.closedGci)}</td></tr>`).join("");
  return `<div style="overflow-x:auto;margin:0 -12px;"><table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="min-width:570px;border:1px solid #D1D5DB;border-collapse:collapse;"><tr style="background:#0A0A0A;"><th style="padding:9px 8px;text-align:left;color:#FFFFFF;font-size:10px;letter-spacing:.3px;">LEAD SOURCE</th><th style="padding:9px 7px;text-align:center;color:#FFFFFF;font-size:10px;letter-spacing:.3px;">MATURE LEADS</th><th style="padding:9px 7px;text-align:center;color:#FFFFFF;font-size:10px;letter-spacing:.3px;">LEADS CLOSED</th><th style="padding:9px 7px;text-align:center;color:#FFFFFF;font-size:10px;letter-spacing:.3px;">CLOSE RATE</th><th style="padding:9px 7px;text-align:right;color:#FFFFFF;font-size:10px;letter-spacing:.3px;">CLOSED GCI</th></tr>${tableRows || `<tr><td colspan="5" style="padding:18px;text-align:center;color:#6B7280;font-size:12px;">No mature source cohort activity was recorded.</td></tr>`}</table></div>`;
}

function signalCard(title: string, body: string, color: string): string {
  return `<div style="margin:0 0 9px;border-left:3px solid ${color};background:#F9FAFB;border-radius:6px;padding:11px 13px;font-size:12px;color:#374151;line-height:1.55;"><strong style="color:#111827;">${escapeHtml(title)}</strong> ${escapeHtml(body)}</div>`;
}

function signals(report: WeeklyLeadReport): string {
  const output: string[] = [];
  const largestSource = [...report.rows].filter((row) => row.newLeads > 0).sort((a, b) => b.newLeads - a.newLeads)[0];
  const highestMatureYield = [...report.rows].filter((row) => row.cohort.closedGci > 0).sort((a, b) => b.cohort.closedGci - a.cohort.closedGci)[0];
  const highVolumeNoAppointment = [...report.rows].filter((row) => row.newLeads >= 5 && row.appointmentsSet === 0).sort((a, b) => b.newLeads - a.newLeads)[0];
  if (largestSource) output.push(signalCard("Watch the largest weekly source:", `${largestSource.sourceName} delivered ${largestSource.newLeads} new leads; ${largestSource.appointmentsSet} have an appointment recorded (${formatPercent(largestSource.appointmentsSet, largestSource.newLeads)}).`, "#0891B2"));
  if (highestMatureYield) output.push(signalCard("Mature source yield:", `${highestMatureYield.sourceName} generated ${formatCurrency(highestMatureYield.cohort.closedGci)} in closed GCI from its 90–179-day-old lead cohort.`, "#059669"));
  if (highVolumeNoAppointment) output.push(signalCard("Follow up now:", `${highVolumeNoAppointment.sourceName} produced ${highVolumeNoAppointment.newLeads} new leads but no appointment is recorded yet. Confirm ownership and first contact.`, "#D97706"));
  else if (report.quality.unassignedNewLeads > 0) output.push(signalCard("Assign new leads:", `${report.quality.unassignedNewLeads} of this week’s new leads do not have an ISA assignment yet.`, "#DC2626"));
  return output.join("");
}

/** Render the leadership-ready content placed inside the shared SavvyOS email template. */
export function renderWeeklyLeadReport(report: WeeklyLeadReport): string {
  const totals = report.totals;
  const mature = report.cohortTotals;

  return `<div style="font-size:20px;font-weight:700;line-height:1.3;color:#111827;">Weekly Lead Report</div>
    <div style="margin:5px 0 20px;font-size:12px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:.45px;">${escapeHtml(report.periodLabel)} · generated ${escapeHtml(report.asOfLabel)}</div>
    <div style="font-size:14px;color:#374151;line-height:1.6;">This report follows new leads through the early funnel, then separately measures the downstream value of source cohorts that have had time to mature.</div>
    ${sectionHeading("1. This Week’s New Leads — Early Funnel", "R30 and R90 are rolling lead cohorts ending at the report cutoff. Each shows leads, leads with an appointment recorded, and appointment conversion for the same source cohort.")}
    <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin:0 -5px;"><tr>${metricCard(formatInteger(totals.newLeads), "New leads", "#0891B2", "50%")}${metricCard(formatInteger(totals.appointmentsSet), "Leads with appointment", "#0F766E", "50%")}</tr><tr>${metricCard(formatPercent(totals.appointmentsSet, totals.newLeads), "Appointment rate", "#0F766E", "50%")}${metricCard(formatInteger(report.quality.unassignedNewLeads), "Unassigned new leads", report.quality.unassignedNewLeads ? "#DC2626" : "#059669", "50%")}</tr></table>
    ${weeklyLeadTable(report.rows)}
    ${sectionHeading("2. Mature Source Yield — 90-Day Cohort", "Leads created 90–179 days before the report cutoff. This is the fair source-quality view: each lead has had at least 90 days to develop.")}
    <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin:0 -5px;"><tr>${metricCard(formatInteger(mature.leads), "Mature leads", "#374151", "50%")}${metricCard(formatInteger(mature.transactionsClosed), "Leads closed", "#059669", "50%")}</tr><tr>${metricCard(formatPercent(mature.transactionsClosed, mature.leads), "Close rate", "#059669", "50%")}${metricCard(formatCurrency(mature.closedGci), "Closed GCI", "#059669", "50%")}</tr></table>
    ${matureYieldTable(report.rows)}
    ${sectionHeading("This Week’s Actions")}
    ${signals(report)}
    <div style="margin:18px 0 0;font-size:11px;line-height:1.55;color:#4B5563;background:#F9FAFB;border-left:3px solid #7C3AED;border-radius:6px;padding:10px 12px;"><strong style="color:#111827;">CRM activity:</strong> ${formatInteger(report.dataEntry.transactionRecordsAdded)} transaction records were added this week, including ${formatInteger(report.dataEntry.historicalTransactionsAdded)} historical deals newly captured in SavvyOS.</div>
    <table cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin:24px 0 0;"><tr><td style="background:#0fc0df;border-radius:7px;"><a href="${APP_URL}/analytics/lead-cohorts" style="display:inline-block;padding:12px 22px;font-size:13px;font-weight:700;color:#0A0A0A;text-decoration:none;">Open Lead Analytics</a></td></tr></table>
    <div style="margin-top:16px;font-size:10px;line-height:1.45;color:#6B7280;">Appointments are shown only for fresh leads because historical appointment capture is incomplete. Mature source yield therefore uses the more reliable close conversion and closed GCI measures. Source attribution follows the lead source on the primary transaction contact.</div>`;
}

/**
 * Sends the requested review copy only to Tyler. This does not activate recurring
 * distribution or send to the future leadership recipient list.
 */
export async function sendWeeklyLeadReportTest(asOf = new Date()): Promise<{ sent: boolean; skipped: boolean; reason?: string; report: WeeklyLeadReport }> {
  const report = await buildWeeklyLeadReport(asOf);
  const delivery = await sendTransactionalEmail(
    "weekly_lead_report",
    {
      recipientName: "Tyler",
      recipientEmail: TEST_RECIPIENT_EMAIL,
      weeklyLeadReportDate: report.periodLabel,
      weeklyLeadReportHtml: renderWeeklyLeadReport(report),
      weeklyLeadReportSubject: `TEST — Weekly Lead Report | ${report.periodLabel}`,
    },
    {
      allowTemplateOverride: false,
      bypassNotificationSetting: true,
      idempotencyKey: `weekly-lead-report:test:cohort-funnel-r30-r90-v5:${report.reportDateKey}:${TEST_RECIPIENT_EMAIL}`,
    },
  );
  return { ...delivery, report };
}
