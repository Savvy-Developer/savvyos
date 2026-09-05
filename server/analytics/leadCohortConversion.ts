import { createHash } from "crypto";
import { eq, sql, type SQL } from "drizzle-orm";
import { analyticsInsightCaches } from "../../drizzle/schema";
import { getDb } from "../db";
import { invokeLLM } from "../_core/llm";

/**
 * Lead Cohort Conversion & Sales Cycle
 * ------------------------------------
 * A cohort is a contact created during the selected date range. Conversion is
 * therefore an observed downstream outcome of that same acquired cohort, not a
 * comparison between unrelated current pipeline and closed-transaction counts.
 *
 * The database does not retain stage-transition history. Current pipeline stage
 * is presented as a current-state proxy only; time-to-contract and time-to-close
 * are calculated from contact creation to the first chronologically valid
 * transaction event. This service is read-only and administrator-gated by the
 * analytics router.
 */

export type LeadCohortConversionFilters = {
  dateFrom?: string;
  dateTo?: string;
  agentId?: number;
  leadSourceId?: number;
  lifecycleStage?: "new_lead" | "attempted_contact" | "nurture" | "active_client" | "under_contract" | "closed" | "dead";
};

type Row = Record<string, unknown>;
type LifecycleStage = NonNullable<LeadCohortConversionFilters["lifecycleStage"]>;

const lifecycleStages: LifecycleStage[] = ["new_lead", "attempted_contact", "nurture", "active_client", "under_contract", "closed", "dead"];

function rowsFromResult<T extends Row = Row>(result: unknown): T[] {
  if (Array.isArray(result) && Array.isArray(result[0])) return result[0] as T[];
  if (Array.isArray(result)) return result as T[];
  return [];
}

async function runRows<T extends Row = Row>(query: SQL): Promise<T[]> {
  const db = await getDb();
  if (!db) return [];
  const result = await (db as unknown as { execute: (statement: SQL) => Promise<unknown> }).execute(query);
  return rowsFromResult<T>(result);
}

function asNumber(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function day(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  const text = String(value);
  return text.length >= 10 ? text.slice(0, 10) : null;
}

function dateMs(value: string | null): number | null {
  if (!value) return null;
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00.000Z`).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function combineWhere(clauses: Array<SQL | undefined>): SQL {
  const usable = clauses.filter((clause): clause is SQL => Boolean(clause));
  return usable.length ? sql`WHERE ${sql.join(usable, sql` AND `)}` : sql``;
}

function cohortWhere(filters: LeadCohortConversionFilters): SQL {
  return combineWhere([
    sql`c.\`archived_at\` IS NULL`,
    filters.dateFrom ? sql`c.\`createdAt\` >= ${filters.dateFrom}` : undefined,
    filters.dateTo ? sql`c.\`createdAt\` < DATE_ADD(${filters.dateTo}, INTERVAL 1 DAY)` : undefined,
    filters.leadSourceId ? sql`c.\`leadSourceId\` = ${filters.leadSourceId}` : undefined,
  ]);
}

function cohortOutcomeWhere(filters: LeadCohortConversionFilters): SQL {
  return combineWhere([
    filters.agentId ? sql`owner.\`agentId\` = ${filters.agentId}` : undefined,
    filters.lifecycleStage ? sql`COALESCE(currentConnection.\`pipelineStatus\`, c.\`isa_status\`) = ${filters.lifecycleStage}` : undefined,
  ]);
}

/** The earliest connection is the report's accountable cohort owner proxy. */
const OwnerJoin = sql`
  LEFT JOIN (
    SELECT ac.\`contactId\`, ac.\`agentId\`
    FROM \`agent_connections\` ac
    INNER JOIN (
      SELECT \`contactId\`, MIN(\`id\`) AS firstConnectionId
      FROM \`agent_connections\`
      GROUP BY \`contactId\`
    ) firstConnection ON firstConnection.firstConnectionId = ac.\`id\`
  ) owner ON owner.\`contactId\` = c.\`id\`
  LEFT JOIN \`users\` ownerUser ON ownerUser.\`id\` = owner.\`agentId\`
`;

/** The most recently written connection supplies current pipeline status only. */
const CurrentConnectionJoin = sql`
  LEFT JOIN (
    SELECT ac.\`contactId\`, ac.\`pipelineStatus\`, ac.\`followUpDate\`, ac.\`agingUpdatedAt\`, ac.\`updatedAt\`
    FROM \`agent_connections\` ac
    INNER JOIN (
      SELECT \`contactId\`, MAX(\`id\`) AS latestConnectionId
      FROM \`agent_connections\`
      GROUP BY \`contactId\`
    ) latestConnection ON latestConnection.latestConnectionId = ac.\`id\`
  ) currentConnection ON currentConnection.\`contactId\` = c.\`id\`
`;

/**
 * Transaction outcomes are grouped once per cohort contact. "First" dates are
 * later checked against the lead-created date before being treated as conversion.
 * Financial outcomes include closed transactions only.
 */
const OutcomeJoin = sql`
  LEFT JOIN (
    SELECT
      t.\`primaryContactId\` AS contactId,
      MIN(CASE WHEN t.\`status\` IN ('under_contract', 'closed') AND t.\`contractDate\` IS NOT NULL THEN t.\`contractDate\` END) AS firstContractDate,
      MIN(CASE WHEN t.\`status\` = 'closed' AND t.\`closingDate\` IS NOT NULL THEN t.\`closingDate\` END) AS firstClosingDate,
      COUNT(DISTINCT CASE WHEN t.\`status\` = 'closed' THEN t.\`id\` END) AS closedUnits,
      COALESCE(SUM(CASE WHEN t.\`status\` = 'closed' THEN COALESCE(t.\`purchasePrice\`, 0) ELSE 0 END), 0) AS closedVolume,
      COALESCE(SUM(CASE WHEN t.\`status\` = 'closed' THEN COALESCE(t.\`grossCommissionIncome\`, 0) ELSE 0 END), 0) AS closedGci,
      COALESCE(SUM(CASE WHEN t.\`status\` = 'closed' THEN COALESCE(payout.savvyNet, 0) ELSE 0 END), 0) AS recordedSavvyNet,
      SUM(CASE WHEN t.\`status\` = 'closed' AND COALESCE(payout.payoutItemCount, 0) > 0 THEN 1 ELSE 0 END) AS payoutRecordedClosedUnits,
      COUNT(DISTINCT CASE WHEN t.\`status\` = 'under_contract' THEN t.\`id\` END) AS liveUnderContractUnits
    FROM \`transactions\` t
    LEFT JOIN (
      SELECT
        \`transactionId\`,
        COUNT(*) AS payoutItemCount,
        COALESCE(SUM(CASE WHEN \`payeeType\` IN ('savvy_str_agents', 'exp') THEN COALESCE(\`amount\`, 0) ELSE 0 END), 0) AS savvyNet
      FROM \`transaction_payout_items\`
      GROUP BY \`transactionId\`
    ) payout ON payout.transactionId = t.\`id\`
    GROUP BY t.\`primaryContactId\`
  ) outcomes ON outcomes.contactId = c.\`id\`
`;

function baseFrom(where: SQL): SQL {
  return sql`
    FROM \`contacts\` c
    LEFT JOIN \`lead_sources\` ls ON ls.\`id\` = c.\`leadSourceId\`
    ${OwnerJoin}
    ${CurrentConnectionJoin}
    ${OutcomeJoin}
    ${where}
  `;
}

type CohortRow = {
  contactId: unknown;
  contactName: unknown;
  createdAt: unknown;
  leadSourceId: unknown;
  sourceName: unknown;
  ownerId: unknown;
  ownerName: unknown;
  lifecycleStage: unknown;
  followUpDate: unknown;
  agingUpdatedAt: unknown;
  firstContractDate: unknown;
  firstClosingDate: unknown;
  closedUnits: unknown;
  closedVolume: unknown;
  closedGci: unknown;
  recordedSavvyNet: unknown;
  payoutRecordedClosedUnits: unknown;
  liveUnderContractUnits: unknown;
};

type NormalizedCohortRow = {
  contactId: number;
  contactName: string;
  createdAt: string | null;
  leadSourceId: number | null;
  sourceName: string;
  ownerId: number | null;
  ownerName: string;
  lifecycleStage: LifecycleStage | "unknown";
  followUpDate: string | null;
  agingUpdatedAt: string | null;
  firstContractDate: string | null;
  firstClosingDate: string | null;
  closedUnits: number;
  closedVolume: number;
  closedGci: number;
  recordedSavvyNet: number;
  payoutRecordedClosedUnits: number;
  liveUnderContractUnits: number;
  convertedToContract: boolean;
  convertedToClose: boolean;
  daysToContract: number | null;
  daysToClose: number | null;
};

function normalize(row: CohortRow): NormalizedCohortRow {
  const createdAt = day(row.createdAt);
  const firstContractDate = day(row.firstContractDate);
  const firstClosingDate = day(row.firstClosingDate);
  const createdMs = dateMs(createdAt);
  const contractMs = dateMs(firstContractDate);
  const closeMs = dateMs(firstClosingDate);
  const hasValidContractDate = createdMs !== null && contractMs !== null && contractMs >= createdMs;
  const convertedToClose = createdMs !== null && closeMs !== null && closeMs >= createdMs;
  // A valid close is necessarily a downstream contract outcome even when legacy
  // transaction data lacks its explicit contract date. It contributes to the
  // conversion numerator but not to days-to-contract, which requires a recorded date.
  const convertedToContract = hasValidContractDate || convertedToClose;
  const rawStage = String(row.lifecycleStage ?? "unknown") as LifecycleStage | "unknown";
  return {
    contactId: asNumber(row.contactId),
    contactName: String(row.contactName ?? "—"),
    createdAt,
    leadSourceId: asNullableNumber(row.leadSourceId),
    sourceName: String(row.sourceName ?? "Unattributed"),
    ownerId: asNullableNumber(row.ownerId),
    ownerName: String(row.ownerName ?? "Unassigned"),
    lifecycleStage: lifecycleStages.includes(rawStage as LifecycleStage) ? rawStage : "unknown",
    followUpDate: day(row.followUpDate),
    agingUpdatedAt: day(row.agingUpdatedAt),
    firstContractDate,
    firstClosingDate,
    closedUnits: asNumber(row.closedUnits),
    closedVolume: asNumber(row.closedVolume),
    closedGci: asNumber(row.closedGci),
    recordedSavvyNet: asNumber(row.recordedSavvyNet),
    payoutRecordedClosedUnits: asNumber(row.payoutRecordedClosedUnits),
    liveUnderContractUnits: asNumber(row.liveUnderContractUnits),
    convertedToContract,
    convertedToClose,
    daysToContract: hasValidContractDate && createdMs !== null && contractMs !== null ? Math.round((contractMs - createdMs) / 86_400_000) : null,
    daysToClose: convertedToClose && createdMs !== null && closeMs !== null ? Math.round((closeMs - createdMs) / 86_400_000) : null,
  };
}

function percentage(numerator: number, denominator: number): number | null {
  return denominator > 0 ? (numerator / denominator) * 100 : null;
}

function average(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value !== null && Number.isFinite(value));
  return present.length ? present.reduce((sum, value) => sum + value, 0) / present.length : null;
}

function filtersMetadata(filters: LeadCohortConversionFilters) {
  return {
    dateFrom: filters.dateFrom ?? null,
    dateTo: filters.dateTo ?? null,
    agentId: filters.agentId ?? null,
    leadSourceId: filters.leadSourceId ?? null,
    lifecycleStage: filters.lifecycleStage ?? null,
  };
}

function monthOf(value: string | null): string {
  return value?.slice(0, 7) ?? "Unknown";
}

function summarize(rows: NormalizedCohortRow[]) {
  const cohortLeads = rows.length;
  const contractedContacts = rows.filter((row) => row.convertedToContract).length;
  const closedContacts = rows.filter((row) => row.convertedToClose).length;
  const closedUnits = rows.reduce((sum, row) => sum + row.closedUnits, 0);
  const closedVolume = rows.reduce((sum, row) => sum + row.closedVolume, 0);
  const closedGci = rows.reduce((sum, row) => sum + row.closedGci, 0);
  const recordedSavvyNet = rows.reduce((sum, row) => sum + row.recordedSavvyNet, 0);
  const payoutRecordedClosedUnits = rows.reduce((sum, row) => sum + row.payoutRecordedClosedUnits, 0);
  const liveUnderContractUnits = rows.reduce((sum, row) => sum + row.liveUnderContractUnits, 0);
  const activeOpenContacts = rows.filter((row) => ["new_lead", "attempted_contact", "nurture", "active_client"].includes(row.lifecycleStage)).length;
  const deadContacts = rows.filter((row) => row.lifecycleStage === "dead").length;
  const unattributedContacts = rows.filter((row) => row.leadSourceId === null).length;
  const unassignedContacts = rows.filter((row) => row.ownerId === null).length;
  const chronologicalExceptions = rows.filter((row) => {
    const createdMs = dateMs(row.createdAt);
    const contractMs = dateMs(row.firstContractDate);
    const closeMs = dateMs(row.firstClosingDate);
    const invalidContract = Boolean(row.firstContractDate) && (createdMs === null || contractMs === null || contractMs < createdMs);
    const invalidClose = Boolean(row.firstClosingDate) && (createdMs === null || closeMs === null || closeMs < createdMs);
    return invalidContract || invalidClose;
  }).length;
  return {
    cohortLeads,
    contractedContacts,
    closedContacts,
    contractConversionPct: percentage(contractedContacts, cohortLeads),
    closeConversionPct: percentage(closedContacts, cohortLeads),
    contractToClosePct: percentage(closedContacts, contractedContacts),
    closedUnits,
    closedVolume,
    closedGci,
    recordedSavvyNet,
    payoutRecordedClosedUnits,
    payoutCoveragePct: percentage(payoutRecordedClosedUnits, closedUnits),
    liveUnderContractUnits,
    activeOpenContacts,
    deadContacts,
    averageDaysToContract: average(rows.map((row) => row.daysToContract)),
    averageDaysToClose: average(rows.map((row) => row.daysToClose)),
    unattributedContacts,
    unassignedContacts,
    chronologicalExceptions,
  };
}

function groupedBreakdown(rows: NormalizedCohortRow[], key: (row: NormalizedCohortRow) => { id: number | null; name: string }) {
  const groups = new Map<string, { id: number | null; name: string; rows: NormalizedCohortRow[] }>();
  for (const row of rows) {
    const descriptor = key(row);
    const groupKey = `${descriptor.id ?? "none"}|${descriptor.name}`;
    const group = groups.get(groupKey) ?? { ...descriptor, rows: [] };
    group.rows.push(row);
    groups.set(groupKey, group);
  }
  // Keep intermediate rows private to this reducer. Returning them here duplicates
  // the full cohort in both source and owner breakdowns, inflating the tRPC payload
  // without supporting any report interaction.
  return Array.from(groups.values()).map(({ id, name, rows: groupRows }) => ({
    id,
    name,
    ...summarize(groupRows),
  })).sort((a, b) => b.closedVolume - a.closedVolume || b.cohortLeads - a.cohortLeads);
}

function monthlyBreakdown(rows: NormalizedCohortRow[]) {
  const grouped = new Map<string, NormalizedCohortRow[]>();
  for (const row of rows) {
    const key = monthOf(row.createdAt);
    const values = grouped.get(key) ?? [];
    values.push(row);
    grouped.set(key, values);
  }
  return Array.from(grouped.entries()).map(([month, cohortRows]) => ({ month, ...summarize(cohortRows) })).sort((a, b) => a.month.localeCompare(b.month));
}

function currentStageBreakdown(rows: NormalizedCohortRow[]) {
  return [...lifecycleStages, "unknown" as const].map((stage) => ({
    stage,
    contacts: rows.filter((row) => row.lifecycleStage === stage).length,
  }));
}

function deterministicInsights(summary: ReturnType<typeof summarize>, sources: ReturnType<typeof groupedBreakdown>, agents: ReturnType<typeof groupedBreakdown>) {
  const insights: Array<{ type: "warning" | "opportunity" | "coaching" | "success" | "data_quality"; priority: "high" | "medium" | "low"; title: string; observation: string; explanation: string; owner: string; action: string; confidence: "high" | "medium" | "limited"; evidence: Array<{ label: string; value: string; drilldown: "cohort_evidence" | "source" | "agent" }> }> = [];
  if (summary.unassignedContacts || summary.unattributedContacts) {
    insights.push({
      type: "data_quality", priority: summary.unassignedContacts > 0 ? "high" : "medium", title: "Cohort ownership or source is incomplete",
      observation: `${summary.unassignedContacts} cohort lead${summary.unassignedContacts === 1 ? " is" : "s are"} unassigned and ${summary.unattributedContacts} ${summary.unattributedContacts === 1 ? "is" : "are"} without a recorded source.`,
      explanation: "A lead can still close without these fields, but source and owner conversion comparisons become incomplete because the cohort denominator cannot be assigned reliably.",
      owner: "ISA leadership and sales operations", action: "Assign the open cohort contacts and complete source attribution before using agent or source conversion comparisons for accountability.", confidence: "high",
      evidence: [{ label: "Unassigned cohort leads", value: String(summary.unassignedContacts), drilldown: "cohort_evidence" }, { label: "Unattributed cohort leads", value: String(summary.unattributedContacts), drilldown: "cohort_evidence" }],
    });
  }
  if (summary.averageDaysToContract !== null || summary.averageDaysToClose !== null) {
    insights.push({
      type: "coaching", priority: "medium", title: "Cohort timing defines the follow-up horizon",
      observation: `Observed converted cohort contacts average ${summary.averageDaysToContract?.toFixed(0) ?? "—"} days to first contract and ${summary.averageDaysToClose?.toFixed(0) ?? "—"} days to first close.`,
      explanation: "These are lead-created-to-first-outcome intervals, not stage dwell time. They indicate how long the sales organization must sustain follow-up before interpreting an early cohort as lost.",
      owner: "Sales leadership and ISAs", action: "Compare the current-stage mix for newer cohorts with these observed timelines, then assign explicit nurture ownership before early-stage leads age out.", confidence: "high",
      evidence: [{ label: "Cohort leads", value: String(summary.cohortLeads), drilldown: "cohort_evidence" }, { label: "Ever contracted", value: String(summary.contractedContacts), drilldown: "cohort_evidence" }],
    });
  }
  const topSource = sources[0];
  if (topSource && summary.closedVolume > 0) {
    const share = (topSource.closedVolume / summary.closedVolume) * 100;
    insights.push({
      type: "opportunity", priority: share >= 35 ? "medium" : "low", title: "Cohort outcomes are source-concentrated",
      observation: `${topSource.name} produced ${topSource.closedUnits} closed unit${topSource.closedUnits === 1 ? "" : "s"} and ${(share).toFixed(1)}% of downstream closed volume from the selected cohort.`,
      explanation: "This compares leads acquired in the selected cohort to their downstream observed outcomes. It is performance attribution, not ROI: spend and acquisition cost are not recorded in SavvyOS.",
      owner: "Growth and sales leadership", action: "Review the source evidence, conversion rate, sales-cycle timing, and price profile before scaling or de-prioritizing the source.", confidence: "medium",
      evidence: [{ label: topSource.name, value: `${topSource.closedUnits} closed units`, drilldown: "source" }, { label: "Cohort close conversion", value: `${summary.closeConversionPct?.toFixed(1) ?? "—"}%`, drilldown: "cohort_evidence" }],
    });
  }
  const topAgent = agents[0];
  if (topAgent && topAgent.cohortLeads > 0) {
    insights.push({
      type: "coaching", priority: "medium", title: "Owner-level cohort comparison is available",
      observation: `${topAgent.name} owns ${topAgent.cohortLeads} cohort leads with ${topAgent.closeConversionPct?.toFixed(1) ?? "—"}% observed close conversion and ${topAgent.closedUnits} downstream closed units.`,
      explanation: "Ownership is the first recorded agent connection for a contact. It is a consistent cohort-accountability proxy, not a reconstruction of later reassignment history.",
      owner: "Sales leadership", action: "Use the agent table to compare conversion and timing only among sufficiently sized cohorts, then open individual contact evidence before setting coaching actions.", confidence: "medium",
      evidence: [{ label: topAgent.name, value: `${topAgent.cohortLeads} cohort leads`, drilldown: "agent" }, { label: "All cohort leads", value: String(summary.cohortLeads), drilldown: "cohort_evidence" }],
    });
  }
  if (!insights.length) {
    insights.push({
      type: "success", priority: "low", title: "Cohort evidence is ready for review",
      observation: `${summary.cohortLeads} leads are in the selected acquisition cohort, producing ${summary.closedUnits} downstream closed units to date.`,
      explanation: "The report keeps the lead-created denominator fixed and lets downstream outcomes mature over time, preventing unrelated current pipeline and closed-transaction populations from being treated as a conversion rate.",
      owner: "Sales leadership", action: "Use the monthly cohort trend, source and owner comparisons, and contact evidence to decide the next follow-up and attribution priorities.", confidence: "high",
      evidence: [{ label: "Cohort leads", value: String(summary.cohortLeads), drilldown: "cohort_evidence" }],
    });
  }
  return insights.slice(0, 4);
}

export async function getLeadCohortConversionReport(filters: LeadCohortConversionFilters = {}, options: { includeAllEvidence?: boolean } = {}) {
  // Build the cohort first. The previous query materialized every connection and
  // transaction before applying the lead-created date range, which can stall an
  // otherwise modest YTD report on production-sized tables.
  const cohortFilters = cohortWhere(filters);
  const outcomeFilters = cohortOutcomeWhere(filters);
  const [rows, agents, sources] = await Promise.all([
    runRows<CohortRow>(sql`
      WITH cohort AS (
        SELECT c.\`id\`, c.\`firstName\`, c.\`lastName\`, c.\`createdAt\`, c.\`leadSourceId\`, c.\`isa_status\`
        FROM \`contacts\` c
        ${cohortFilters}
      ),
      first_owner AS (
        SELECT ac.\`contactId\`, MIN(ac.\`id\`) AS firstConnectionId
        FROM \`agent_connections\` ac
        INNER JOIN cohort scopedContact ON scopedContact.\`id\` = ac.\`contactId\`
        GROUP BY ac.\`contactId\`
      ),
      latest_connection AS (
        SELECT ac.\`contactId\`, MAX(ac.\`id\`) AS latestConnectionId
        FROM \`agent_connections\` ac
        INNER JOIN cohort scopedContact ON scopedContact.\`id\` = ac.\`contactId\`
        GROUP BY ac.\`contactId\`
      ),
      scoped_payout AS (
        SELECT payout.\`transactionId\`,
          COUNT(*) AS payoutItemCount,
          COALESCE(SUM(CASE WHEN payout.\`payeeType\` IN ('savvy_str_agents', 'exp') THEN COALESCE(payout.\`amount\`, 0) ELSE 0 END), 0) AS savvyNet
        FROM \`transaction_payout_items\` payout
        INNER JOIN \`transactions\` payoutTransaction ON payoutTransaction.\`id\` = payout.\`transactionId\`
        INNER JOIN cohort scopedContact ON scopedContact.\`id\` = payoutTransaction.\`primaryContactId\`
        GROUP BY payout.\`transactionId\`
      ),
      outcomes AS (
        SELECT t.\`primaryContactId\` AS contactId,
          MIN(CASE WHEN t.\`status\` IN ('under_contract', 'closed') AND t.\`contractDate\` IS NOT NULL THEN t.\`contractDate\` END) AS firstContractDate,
          MIN(CASE WHEN t.\`status\` = 'closed' AND t.\`closingDate\` IS NOT NULL THEN t.\`closingDate\` END) AS firstClosingDate,
          COUNT(DISTINCT CASE WHEN t.\`status\` = 'closed' THEN t.\`id\` END) AS closedUnits,
          COALESCE(SUM(CASE WHEN t.\`status\` = 'closed' THEN COALESCE(t.\`purchasePrice\`, 0) ELSE 0 END), 0) AS closedVolume,
          COALESCE(SUM(CASE WHEN t.\`status\` = 'closed' THEN COALESCE(t.\`grossCommissionIncome\`, 0) ELSE 0 END), 0) AS closedGci,
          COALESCE(SUM(CASE WHEN t.\`status\` = 'closed' THEN COALESCE(payout.savvyNet, 0) ELSE 0 END), 0) AS recordedSavvyNet,
          SUM(CASE WHEN t.\`status\` = 'closed' AND COALESCE(payout.payoutItemCount, 0) > 0 THEN 1 ELSE 0 END) AS payoutRecordedClosedUnits,
          COUNT(DISTINCT CASE WHEN t.\`status\` = 'under_contract' THEN t.\`id\` END) AS liveUnderContractUnits
        FROM \`transactions\` t
        INNER JOIN cohort scopedContact ON scopedContact.\`id\` = t.\`primaryContactId\`
        LEFT JOIN scoped_payout payout ON payout.\`transactionId\` = t.\`id\`
        GROUP BY t.\`primaryContactId\`
      )
      SELECT
        c.\`id\` AS contactId,
        CONCAT_WS(' ', c.\`firstName\`, c.\`lastName\`) AS contactName,
        c.\`createdAt\` AS createdAt,
        c.\`leadSourceId\` AS leadSourceId,
        COALESCE(ls.\`name\`, 'Unattributed') AS sourceName,
        owner.\`agentId\` AS ownerId,
        COALESCE(ownerUser.\`name\`, 'Unassigned') AS ownerName,
        COALESCE(currentConnection.\`pipelineStatus\`, c.\`isa_status\`, 'unknown') AS lifecycleStage,
        currentConnection.\`followUpDate\` AS followUpDate,
        currentConnection.\`agingUpdatedAt\` AS agingUpdatedAt,
        outcomes.firstContractDate AS firstContractDate,
        outcomes.firstClosingDate AS firstClosingDate,
        COALESCE(outcomes.closedUnits, 0) AS closedUnits,
        COALESCE(outcomes.closedVolume, 0) AS closedVolume,
        COALESCE(outcomes.closedGci, 0) AS closedGci,
        COALESCE(outcomes.recordedSavvyNet, 0) AS recordedSavvyNet,
        COALESCE(outcomes.payoutRecordedClosedUnits, 0) AS payoutRecordedClosedUnits,
        COALESCE(outcomes.liveUnderContractUnits, 0) AS liveUnderContractUnits
      FROM cohort c
      LEFT JOIN \`lead_sources\` ls ON ls.\`id\` = c.\`leadSourceId\`
      LEFT JOIN first_owner firstOwner ON firstOwner.\`contactId\` = c.\`id\`
      LEFT JOIN \`agent_connections\` owner ON owner.\`id\` = firstOwner.firstConnectionId
      LEFT JOIN \`users\` ownerUser ON ownerUser.\`id\` = owner.\`agentId\`
      LEFT JOIN latest_connection latestConnection ON latestConnection.\`contactId\` = c.\`id\`
      LEFT JOIN \`agent_connections\` currentConnection ON currentConnection.\`id\` = latestConnection.latestConnectionId
      LEFT JOIN outcomes ON outcomes.contactId = c.\`id\`
      ${outcomeFilters}
      ORDER BY c.\`createdAt\` DESC, c.\`id\` DESC
    `),
    runRows<Row>(sql`SELECT \`id\`, \`name\` FROM \`users\` WHERE \`role\` = 'agent' AND \`isActive\` = 1 ORDER BY \`name\` ASC`),
    runRows<Row>(sql`SELECT \`id\`, \`name\`, \`parentId\` FROM \`lead_sources\` WHERE \`isActive\` = 1 ORDER BY \`name\` ASC`),
  ]);
  const cohortRows = rows.map(normalize);
  const summary = summarize(cohortRows);
  const sourceBreakdown = groupedBreakdown(cohortRows, (row) => ({ id: row.leadSourceId, name: row.sourceName }));
  const agentBreakdown = groupedBreakdown(cohortRows, (row) => ({ id: row.ownerId, name: row.ownerName }));
  const evidence = cohortRows.slice(0, options.includeAllEvidence ? undefined : 150).map((row) => ({
    contactId: row.contactId,
    contactName: row.contactName,
    createdAt: row.createdAt,
    sourceName: row.sourceName,
    leadSourceId: row.leadSourceId,
    ownerName: row.ownerName,
    ownerId: row.ownerId,
    lifecycleStage: row.lifecycleStage,
    followUpDate: row.followUpDate,
    agingUpdatedAt: row.agingUpdatedAt,
    firstContractDate: row.firstContractDate,
    firstClosingDate: row.firstClosingDate,
    convertedToContract: row.convertedToContract,
    convertedToClose: row.convertedToClose,
    daysToContract: row.daysToContract,
    daysToClose: row.daysToClose,
    closedUnits: row.closedUnits,
    closedVolume: row.closedVolume,
    closedGci: row.closedGci,
    recordedSavvyNet: row.recordedSavvyNet,
  }));
  const insights = deterministicInsights(summary, sourceBreakdown, agentBreakdown);
  return {
    definitionVersion: "lead-cohort-conversion-v1",
    filters: filtersMetadata(filters),
    definitions: {
      cohort: "A contact whose created date falls in the selected cohort range. Archived contacts are excluded.",
      contractConversion: "Unique cohort contacts with a first valid transaction contract date or a valid downstream closing date on or after the contact-created date, divided by cohort leads. A closing is counted as an observed contract outcome when legacy data lacks an explicit contract date.",
      closeConversion: "Unique cohort contacts with a first closed transaction date on or after the contact-created date, divided by cohort leads. It is observed-to-date and not a maturity-adjusted forecast.",
      salesCycle: "Average calendar days from contact creation to the first recorded chronologically valid contract date or closing date. A close with no recorded contract date contributes to days-to-close but not days-to-contract. Stage-to-stage timing is unavailable because SavvyOS does not store lifecycle-history timestamps.",
      owner: "The agent in the first recorded agent connection for a cohort contact. It is a stable accountability proxy, not historical reassignment reconstruction.",
      currentLifecycle: "Most recently recorded agent-connection status, falling back to the contact ISA status. It is a current-state distribution, not a conversion funnel.",
      downstreamProduction: "All closed transaction units, purchase-price volume, recorded GCI, and recorded Savvy Net linked to contacts in the selected cohort, regardless of the transaction close date.",
      savvyNet: "Recorded payout items paid to Savvy STR Agents or EXP, not an inferred split. Payout coverage is disclosed separately.",
    },
    summary,
    monthly: monthlyBreakdown(cohortRows),
    currentStages: currentStageBreakdown(cohortRows),
    sources: sourceBreakdown.slice(0, 20),
    agents: agentBreakdown.slice(0, 30),
    evidence,
    evidenceTotal: cohortRows.length,
    availableFilters: {
      agents: agents.map((row) => ({ id: asNumber(row.id), name: String(row.name ?? "Unknown") })),
      sources: sources.map((row) => ({ id: asNumber(row.id), name: String(row.name ?? "Unknown"), parentId: asNullableNumber(row.parentId) })),
      lifecycleStages,
    },
    intelligence: {
      summary: `The selected acquisition cohort contains ${summary.cohortLeads} leads, with ${summary.contractedContacts} observed contracts and ${summary.closedContacts} observed closed contacts to date. The cohort has produced ${summary.closedUnits} closed units and ${summary.closedVolume.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })} in downstream purchase-price volume.`,
      dataQualityNote: [
        summary.unattributedContacts ? `${summary.unattributedContacts} cohort lead${summary.unattributedContacts === 1 ? " is" : "s are"} unattributed` : "",
        summary.unassignedContacts ? `${summary.unassignedContacts} cohort lead${summary.unassignedContacts === 1 ? " is" : "s are"} unassigned` : "",
        summary.chronologicalExceptions ? `${summary.chronologicalExceptions} linked outcome${summary.chronologicalExceptions === 1 ? " has" : "s have"} a date before lead creation and ${summary.chronologicalExceptions === 1 ? "is" : "are"} excluded from conversion rates` : "",
      ].filter(Boolean).join("; ") || "Current cohort attribution and outcome chronology passed the report’s available checks.",
      generationMethod: "deterministic" as const,
      insights,
    },
  };
}

export type LeadCohortDrilldownMetric = "cohortLeads" | "contractedContacts" | "closedContacts" | "closedUnits" | "activeOpenContacts" | "deadContacts";
export type LeadCohortDrilldownInput = LeadCohortConversionFilters & {
  metric: LeadCohortDrilldownMetric;
  page?: number;
  limit?: number;
};

const cohortDrilldownMetadata: Record<LeadCohortDrilldownMetric, { title: string; description: string }> = {
  cohortLeads: { title: "Cohort leads", description: "Contacts created in the selected acquisition cohort and filters." },
  contractedContacts: { title: "Contacts with observed contracts", description: "Cohort contacts with a valid contract or downstream close on or after lead creation." },
  closedContacts: { title: "Contacts with observed closes", description: "Cohort contacts with a recorded close on or after lead creation." },
  closedUnits: { title: "Closed units in this cohort", description: "Cohort contacts with one or more closed transaction units; a contact may have multiple units." },
  activeOpenContacts: { title: "Active open cohort contacts", description: "Current-state operational worklist: cohort contacts in new lead, attempted contact, nurture, or active client." },
  deadContacts: { title: "Dead cohort contacts", description: "Cohort contacts whose current recorded lifecycle state is dead." },
};

/** Paginated, exact source contacts behind a Lead Cohort Conversion count. */
export async function getLeadCohortDrilldown(input: LeadCohortDrilldownInput) {
  const page = Math.max(1, Math.floor(input.page ?? 1));
  const limit = Math.min(100, Math.max(10, Math.floor(input.limit ?? 50)));
  const report = await getLeadCohortConversionReport({
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    agentId: input.agentId,
    leadSourceId: input.leadSourceId,
    lifecycleStage: input.lifecycleStage,
  }, { includeAllEvidence: true });
  const allRows = report.evidence as Array<any>;
  const filtered = allRows.filter(row => {
    if (input.metric === "contractedContacts") return row.convertedToContract;
    if (input.metric === "closedContacts") return row.convertedToClose;
    if (input.metric === "closedUnits") return Number(row.closedUnits ?? 0) > 0;
    if (input.metric === "activeOpenContacts") return ["new_lead", "attempted_contact", "nurture", "active_client"].includes(row.lifecycleStage);
    if (input.metric === "deadContacts") return row.lifecycleStage === "dead";
    return true;
  });
  const metadata = cohortDrilldownMetadata[input.metric];
  const records = filtered.slice((page - 1) * limit, page * limit).map(row => ({
    recordId: row.contactId,
    recordType: "contact" as const,
    contactId: row.contactId,
    contactName: row.contactName,
    leadSourceName: row.sourceName,
    agentName: row.ownerName,
    lastCallAt: row.createdAt,
    calls: 0,
    transcriptCalls: 0,
    intentTier: row.lifecycleStage,
    intentScore: 0,
    appointmentSet: false,
    firstContractAt: row.firstContractDate,
    firstCloseAt: row.firstClosingDate,
    closedGci: row.closedGci,
    recordedSavvyNet: row.recordedSavvyNet,
    nextBestAction: row.followUpDate ? `Review follow-up due ${row.followUpDate}.` : "Open the contact and set the next operational follow-up.",
    hasOpenTask: false,
    firstCallSpeedHours: null,
  }));
  return { ...metadata, recordNoun: "contacts", total: filtered.length, page, limit, records };
}

export type LeadCohortConversionViewer = { id: number; role: "admin" | "agent" | "isa" | "agent_support" };

/** A namespaced cache-safe descriptor reserved for model-backed report intelligence in the next iteration. */
export function leadCohortConversionScopeDescriptor(viewer: LeadCohortConversionViewer, filters: LeadCohortConversionFilters) {
  return JSON.stringify({ version: "lead-cohort-conversion-v1", viewerId: viewer.id, role: viewer.role, filters: filtersMetadata(filters) });
}


export type LeadCohortConversionInsightEvidence = {
  label: string;
  value: string;
  drilldown: "cohort_evidence" | "source" | "agent";
};

export type LeadCohortConversionInsight = {
  type: "warning" | "opportunity" | "coaching" | "success" | "data_quality";
  priority: "high" | "medium" | "low";
  title: string;
  observation: string;
  explanation: string;
  confidence: "high" | "medium" | "limited";
  owner: string;
  action: string;
  connectedSignals: string[];
  evidence: LeadCohortConversionInsightEvidence[];
};

export type LeadCohortConversionInsightPayload = {
  summary: string;
  dataQualityNote: string;
  generationMethod: "model" | "deterministic";
  insights: LeadCohortConversionInsight[];
};

const LEAD_COHORT_INSIGHT_TTL_MS = 6 * 60 * 60 * 1000;
const LEAD_COHORT_REFRESH_LOCK_MS = 10 * 60 * 1000;

function leadCohortConversionScopeKey(viewer: LeadCohortConversionViewer, filters: LeadCohortConversionFilters): string {
  const fingerprint = createHash("sha256").update(leadCohortConversionScopeDescriptor(viewer, filters)).digest("hex");
  return `lead-cohort-conversion-v1|${fingerprint}`;
}

function toInsightIso(value: unknown): string | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  return null;
}

function cohortCachedInsightPayload(row: Record<string, unknown>) {
  const rawPayload = row.insightPayload && typeof row.insightPayload === "object"
    ? row.insightPayload as Partial<LeadCohortConversionInsightPayload>
    : {};
  const expiresAt = toInsightIso(row.expiresAt);
  return {
    summary: typeof rawPayload.summary === "string" ? rawPayload.summary : "",
    dataQualityNote: typeof rawPayload.dataQualityNote === "string" ? rawPayload.dataQualityNote : "",
    generationMethod: rawPayload.generationMethod === "model" ? "model" : "deterministic",
    insights: Array.isArray(rawPayload.insights) ? rawPayload.insights : [],
    generatedAt: toInsightIso(row.generatedAt),
    expiresAt,
    isStale: !expiresAt || new Date(expiresAt).getTime() <= Date.now(),
    status: typeof row.status === "string" ? row.status : "unknown",
    model: typeof row.model === "string" ? row.model : null,
    errorMessage: typeof row.errorMessage === "string" ? row.errorMessage : null,
    refreshReason: typeof row.refreshReason === "string" ? row.refreshReason : null,
  };
}

function buildLeadCohortFacts(report: Awaited<ReturnType<typeof getLeadCohortConversionReport>>) {
  return {
    definitionVersion: report.definitionVersion,
    filters: report.filters,
    cohortDefinition: report.definitions.cohort,
    conversionDefinitions: {
      contract: report.definitions.contractConversion,
      close: report.definitions.closeConversion,
      salesCycle: report.definitions.salesCycle,
    },
    summary: report.summary,
    currentLifecycleDistribution: report.currentStages,
    recentMonthlyCohorts: report.monthly.slice(-12),
    topSources: report.sources.slice(0, 12),
    topAgents: report.agents.slice(0, 12),
    dataLimitations: {
      lifecycleHistory: "SavvyOS does not retain stage-transition timestamps; current stage is a present-state proxy, not a historical conversion funnel.",
      downstreamProduction: report.definitions.downstreamProduction,
      savvyNet: report.definitions.savvyNet,
    },
  };
}

function deterministicCohortInsightPayload(report: Awaited<ReturnType<typeof getLeadCohortConversionReport>>): LeadCohortConversionInsightPayload {
  return {
    summary: report.intelligence.summary,
    dataQualityNote: report.intelligence.dataQualityNote,
    generationMethod: "deterministic",
    insights: report.intelligence.insights.map((insight) => ({
      ...insight,
      connectedSignals: ["Cohort leads", "Observed contract conversion", "Observed close conversion", "Sales-cycle timing"],
    })),
  };
}

function coerceLeadCohortInsightPayload(input: unknown, fallback: LeadCohortConversionInsightPayload): LeadCohortConversionInsightPayload {
  if (!input || typeof input !== "object") return fallback;
  const raw = input as Record<string, unknown>;
  if (!Array.isArray(raw.insights) || !raw.insights.length) return fallback;
  const permittedTypes = new Set(["warning", "opportunity", "coaching", "success", "data_quality"]);
  const permittedPriorities = new Set(["high", "medium", "low"]);
  const permittedConfidence = new Set(["high", "medium", "limited"]);
  const permittedDrilldowns = new Set(["cohort_evidence", "source", "agent"]);
  const insights = raw.insights.slice(0, 4).flatMap((candidate): LeadCohortConversionInsight[] => {
    if (!candidate || typeof candidate !== "object") return [];
    const item = candidate as Record<string, unknown>;
    if (typeof item.title !== "string" || typeof item.observation !== "string" || typeof item.explanation !== "string" || typeof item.owner !== "string" || typeof item.action !== "string") return [];
    const type = permittedTypes.has(String(item.type)) ? String(item.type) as LeadCohortConversionInsight["type"] : "opportunity";
    const priority = permittedPriorities.has(String(item.priority)) ? String(item.priority) as LeadCohortConversionInsight["priority"] : "medium";
    const confidence = permittedConfidence.has(String(item.confidence)) ? String(item.confidence) as LeadCohortConversionInsight["confidence"] : "limited";
    const connectedSignals = Array.isArray(item.connectedSignals)
      ? item.connectedSignals.filter((value): value is string => typeof value === "string").slice(0, 6)
      : [];
    const evidence = Array.isArray(item.evidence) ? item.evidence.flatMap((candidateEvidence): LeadCohortConversionInsightEvidence[] => {
      if (!candidateEvidence || typeof candidateEvidence !== "object") return [];
      const evidenceItem = candidateEvidence as Record<string, unknown>;
      if (typeof evidenceItem.label !== "string" || typeof evidenceItem.value !== "string") return [];
      const drilldown = permittedDrilldowns.has(String(evidenceItem.drilldown))
        ? String(evidenceItem.drilldown) as LeadCohortConversionInsightEvidence["drilldown"]
        : "cohort_evidence";
      return [{ label: evidenceItem.label, value: evidenceItem.value, drilldown }];
    }).slice(0, 3) : [];
    return [{ type, priority, title: item.title, observation: item.observation, explanation: item.explanation, confidence, owner: item.owner, action: item.action, connectedSignals, evidence }];
  });
  if (!insights.length) return fallback;
  return {
    summary: typeof raw.summary === "string" && raw.summary.trim() ? raw.summary : fallback.summary,
    dataQualityNote: typeof raw.dataQualityNote === "string" && raw.dataQualityNote.trim() ? raw.dataQualityNote : fallback.dataQualityNote,
    generationMethod: "model",
    insights,
  };
}

async function createLeadCohortInsightPayload(report: Awaited<ReturnType<typeof getLeadCohortConversionReport>>) {
  const fallback = deterministicCohortInsightPayload(report);
  const facts = buildLeadCohortFacts(report);
  const model = process.env.LEAD_COHORT_INSIGHTS_MODEL || process.env.ANALYTICS_INSIGHTS_MODEL || "gpt-5";
  try {
    const response = await invokeLLM({
      model,
      maxTokens: 1800,
      reasoning: { effort: "low" },
      messages: [
        {
          role: "system",
          content: "You are Savvy STR Agents' lead-cohort conversion analyst. Use only the supplied SavvyOS facts. A cohort is contacts created in the selected date range; contract and close outcomes are observed downstream outcomes of that same acquired cohort. Never equate the current lifecycle distribution with a historical funnel, invent stage-transition timing, infer causes, claim ROI, or forecast dollars. Savvy Net means only recorded payout items to Savvy STR Agents or EXP and must be qualified by payout coverage. Produce at most four concise operational insights in this sequence: signal, likely upstream/downstream relationship, impact, specific action, accountable owner, and evidence. State limitations plainly when the evidence cannot support a conclusion.",
        },
        { role: "user", content: JSON.stringify(facts) },
      ],
      outputSchema: {
        name: "lead_cohort_conversion_brief",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["summary", "dataQualityNote", "insights"],
          properties: {
            summary: { type: "string" },
            dataQualityNote: { type: "string" },
            insights: {
              type: "array",
              maxItems: 4,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["type", "priority", "title", "observation", "explanation", "confidence", "owner", "action", "connectedSignals", "evidence"],
                properties: {
                  type: { type: "string", enum: ["warning", "opportunity", "coaching", "success", "data_quality"] },
                  priority: { type: "string", enum: ["high", "medium", "low"] },
                  title: { type: "string" },
                  observation: { type: "string" },
                  explanation: { type: "string" },
                  confidence: { type: "string", enum: ["high", "medium", "limited"] },
                  owner: { type: "string" },
                  action: { type: "string" },
                  connectedSignals: { type: "array", items: { type: "string" } },
                  evidence: {
                    type: "array",
                    maxItems: 3,
                    items: {
                      type: "object",
                      additionalProperties: false,
                      required: ["label", "value", "drilldown"],
                      properties: {
                        label: { type: "string" },
                        value: { type: "string" },
                        drilldown: { type: "string", enum: ["cohort_evidence", "source", "agent"] },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    const content = response.choices[0]?.message.content;
    const text = typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content.filter((part) => part.type === "text").map((part) => part.text).join("\n")
        : "";
    return { payload: coerceLeadCohortInsightPayload(JSON.parse(text), fallback), model };
  } catch (error) {
    console.warn("[LeadCohortConversion] Model insight generation was unavailable; using deterministic report signals.", error instanceof Error ? error.message : error);
    return { payload: fallback, model: "deterministic-fallback" };
  }
}

export async function getCachedLeadCohortConversionInsights(viewer: LeadCohortConversionViewer, filters: LeadCohortConversionFilters) {
  if (viewer.role !== "admin") return null;
  const db = await getDb();
  if (!db) return null;
  const scopeKey = leadCohortConversionScopeKey(viewer, filters);
  const [row] = await db.select().from(analyticsInsightCaches).where(eq(analyticsInsightCaches.scopeKey, scopeKey)).limit(1);
  return row ? cohortCachedInsightPayload(row as unknown as Record<string, unknown>) : null;
}

export async function refreshLeadCohortConversionInsights(options: {
  viewer: LeadCohortConversionViewer;
  filters: LeadCohortConversionFilters;
  force?: boolean;
  reason?: "manual" | "automatic";
}) {
  const { viewer, filters, force = false, reason = "automatic" } = options;
  if (viewer.role !== "admin") throw new Error("Lead Cohort Conversion insights are restricted to administrators.");
  const db = await getDb();
  if (!db) throw new Error("Database is not available for Lead Cohort Conversion insight caching.");
  const scopeKey = leadCohortConversionScopeKey(viewer, filters);
  const [existing] = await db.select().from(analyticsInsightCaches).where(eq(analyticsInsightCaches.scopeKey, scopeKey)).limit(1);
  const now = new Date();
  if (existing && !force && existing.status === "ready" && existing.expiresAt > now) {
    return { cache: cohortCachedInsightPayload(existing as unknown as Record<string, unknown>), cacheHit: true };
  }
  if (existing && existing.status === "refreshing" && now.getTime() - existing.generatedAt.getTime() < LEAD_COHORT_REFRESH_LOCK_MS) {
    return { cache: cohortCachedInsightPayload(existing as unknown as Record<string, unknown>), cacheHit: true, refreshing: true };
  }
  const serializedFilters = filtersMetadata(filters);
  if (existing) {
    await db.update(analyticsInsightCaches).set({
      status: "refreshing", ownerUserId: viewer.id, viewerRole: viewer.role, filters: serializedFilters,
      generatedAt: now, errorMessage: null, refreshReason: reason,
    }).where(eq(analyticsInsightCaches.id, existing.id));
  } else {
    await db.insert(analyticsInsightCaches).values({
      scopeKey, ownerUserId: viewer.id, viewerRole: viewer.role, filters: serializedFilters,
      insightPayload: { summary: "Generating Lead Cohort Conversion intelligence…", dataQualityNote: "", generationMethod: "deterministic", insights: [] },
      facts: {}, status: "refreshing", generatedAt: now,
      expiresAt: new Date(now.getTime() + LEAD_COHORT_INSIGHT_TTL_MS), refreshReason: reason,
      model: process.env.LEAD_COHORT_INSIGHTS_MODEL || process.env.ANALYTICS_INSIGHTS_MODEL || "gpt-5",
    });
  }
  const report = await getLeadCohortConversionReport(filters);
  const { payload, model } = await createLeadCohortInsightPayload(report);
  const expiresAt = new Date(Date.now() + LEAD_COHORT_INSIGHT_TTL_MS);
  await db.update(analyticsInsightCaches).set({
    insightPayload: payload, facts: buildLeadCohortFacts(report), status: "ready", generatedAt: new Date(),
    expiresAt, errorMessage: null, refreshReason: reason, model,
  }).where(eq(analyticsInsightCaches.scopeKey, scopeKey));
  return {
    cache: { ...payload, generatedAt: new Date().toISOString(), expiresAt: expiresAt.toISOString(), isStale: false, status: "ready", model, errorMessage: null, refreshReason: reason },
    cacheHit: false,
  };
}
