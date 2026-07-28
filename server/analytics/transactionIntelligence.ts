import { createHash } from "node:crypto";
import { eq, sql, type SQL } from "drizzle-orm";
import { analyticsInsightCaches } from "../../drizzle/schema";
import { getDb } from "../db";
import { invokeLLM } from "../_core/llm";

/**
 * Transaction Intelligence & Economics
 * ------------------------------------
 * This report intentionally separates three different concepts:
 *   1. closed-flow actuals: status = closed, filtered only by closing date;
 *   2. current pipeline: status = under_contract, a point-in-time snapshot;
 *   3. recorded economics: payout items already recorded for each transaction.
 *
 * It is read-only. The router restricts this report to administrators while the
 * service keeps its metric definitions explicit so its evidence links can match
 * the canonical Transactions page exactly.
 */

export type TransactionIntelligenceFilters = {
  dateFrom?: string;
  dateTo?: string;
  agentId?: number;
  marketProfileId?: number;
  leadSourceId?: number;
  transactionType?: "buyer" | "seller" | "dual";
};

type Row = Record<string, unknown>;

type Aggregate = {
  units: number;
  volume: number;
  averagePurchasePrice: number | null;
  gci: number;
  averageGci: number | null;
  averageCommissionRate: number | null;
  recordedSavvyNet: number;
  averageRecordedSavvyNet: number | null;
  recordedPayoutTransactions: number;
  payoutCoveragePct: number | null;
  referralPayouts: number;
  groupLeaderPayouts: number;
  agentPayouts: number;
  isaBonuses: number;
  otherPayouts: number;
  totalRecordedPayouts: number;
  unallocatedGci: number;
  missingPriceCount: number;
  missingGciCount: number;
  missingLeadSourceCount: number;
  payoutIntegrityCount: number;
};

const PayoutJoin = sql`
  LEFT JOIN (
    SELECT
      \`transactionId\` AS transactionId,
      COUNT(*) AS payoutItemCount,
      COALESCE(SUM(CASE WHEN \`payeeType\` IN ('savvy_str_agents', 'exp') THEN COALESCE(\`amount\`, 0) ELSE 0 END), 0) AS savvyNet,
      COALESCE(SUM(CASE WHEN \`payeeType\` = 'referral_partner' THEN COALESCE(\`amount\`, 0) ELSE 0 END), 0) AS referralPayouts,
      COALESCE(SUM(CASE WHEN \`payeeType\` = 'group_leader' THEN COALESCE(\`amount\`, 0) ELSE 0 END), 0) AS groupLeaderPayouts,
      COALESCE(SUM(CASE WHEN \`payeeType\` = 'agent' THEN COALESCE(\`amount\`, 0) ELSE 0 END), 0) AS agentPayouts,
      COALESCE(SUM(CASE WHEN \`payeeType\` = 'isa_bonus' THEN COALESCE(\`amount\`, 0) ELSE 0 END), 0) AS isaBonuses,
      COALESCE(SUM(CASE WHEN \`payeeType\` = 'other' THEN COALESCE(\`amount\`, 0) ELSE 0 END), 0) AS otherPayouts,
      COALESCE(SUM(COALESCE(\`amount\`, 0)), 0) AS totalPayouts
    FROM \`transaction_payout_items\`
    GROUP BY \`transactionId\`
  ) pi ON pi.transactionId = t.id
`;

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

function combineWhere(clauses: Array<SQL | undefined>): SQL {
  const usable = clauses.filter((clause): clause is SQL => Boolean(clause));
  return usable.length ? sql`WHERE ${sql.join(usable, sql` AND `)}` : sql``;
}

function commonClauses(filters: TransactionIntelligenceFilters): Array<SQL | undefined> {
  return [
    filters.agentId ? sql`t.\`agentId\` = ${filters.agentId}` : undefined,
    filters.marketProfileId ? sql`u.\`marketProfileId\` = ${filters.marketProfileId}` : undefined,
    filters.leadSourceId ? sql`c.\`leadSourceId\` = ${filters.leadSourceId}` : undefined,
    filters.transactionType ? sql`t.\`transactionType\` = ${filters.transactionType}` : undefined,
  ];
}

function closedFlowWhere(filters: TransactionIntelligenceFilters): SQL {
  return combineWhere([
    ...commonClauses(filters),
    sql`t.\`status\` = 'closed'`,
    sql`t.\`closingDate\` IS NOT NULL`,
    filters.dateFrom ? sql`DATE(t.\`closingDate\`) >= ${filters.dateFrom}` : undefined,
    filters.dateTo ? sql`DATE(t.\`closingDate\`) <= ${filters.dateTo}` : undefined,
  ]);
}

function underContractSnapshotWhere(filters: TransactionIntelligenceFilters): SQL {
  return combineWhere([
    ...commonClauses(filters),
    sql`t.\`status\` = 'under_contract'`,
  ]);
}

function baseFrom(where: SQL): SQL {
  return sql`
    FROM \`transactions\` t
    LEFT JOIN \`users\` u ON u.\`id\` = t.\`agentId\`
    LEFT JOIN \`contacts\` c ON c.\`id\` = t.\`primaryContactId\`
    LEFT JOIN \`lead_sources\` ls ON ls.\`id\` = c.\`leadSourceId\`
    ${PayoutJoin}
    ${where}
  `;
}

function aggregateSelect(): SQL {
  return sql`
    COUNT(*) AS units,
    COALESCE(SUM(COALESCE(t.\`purchasePrice\`, 0)), 0) AS volume,
    AVG(t.\`purchasePrice\`) AS averagePurchasePrice,
    COALESCE(SUM(COALESCE(t.\`grossCommissionIncome\`, 0)), 0) AS gci,
    AVG(t.\`grossCommissionIncome\`) AS averageGci,
    AVG(t.\`commissionRate\`) AS averageCommissionRate,
    COALESCE(SUM(COALESCE(pi.savvyNet, 0)), 0) AS recordedSavvyNet,
    CASE WHEN SUM(CASE WHEN COALESCE(pi.payoutItemCount, 0) > 0 THEN 1 ELSE 0 END) > 0
      THEN SUM(COALESCE(pi.savvyNet, 0)) / SUM(CASE WHEN COALESCE(pi.payoutItemCount, 0) > 0 THEN 1 ELSE 0 END)
      ELSE NULL END AS averageRecordedSavvyNet,
    SUM(CASE WHEN COALESCE(pi.payoutItemCount, 0) > 0 THEN 1 ELSE 0 END) AS recordedPayoutTransactions,
    COALESCE(SUM(COALESCE(pi.referralPayouts, 0)), 0) AS referralPayouts,
    COALESCE(SUM(COALESCE(pi.groupLeaderPayouts, 0)), 0) AS groupLeaderPayouts,
    COALESCE(SUM(COALESCE(pi.agentPayouts, 0)), 0) AS agentPayouts,
    COALESCE(SUM(COALESCE(pi.isaBonuses, 0)), 0) AS isaBonuses,
    COALESCE(SUM(COALESCE(pi.otherPayouts, 0)), 0) AS otherPayouts,
    COALESCE(SUM(COALESCE(pi.totalPayouts, 0)), 0) AS totalRecordedPayouts,
    COALESCE(SUM(COALESCE(t.\`grossCommissionIncome\`, 0)), 0) - COALESCE(SUM(COALESCE(pi.totalPayouts, 0)), 0) AS unallocatedGci,
    SUM(CASE WHEN t.\`purchasePrice\` IS NULL THEN 1 ELSE 0 END) AS missingPriceCount,
    SUM(CASE WHEN t.\`grossCommissionIncome\` IS NULL THEN 1 ELSE 0 END) AS missingGciCount,
    SUM(CASE WHEN c.\`leadSourceId\` IS NULL THEN 1 ELSE 0 END) AS missingLeadSourceCount,
    SUM(CASE WHEN t.\`payoutIntegrityFlag\` = 1 THEN 1 ELSE 0 END) AS payoutIntegrityCount
  `;
}

function toAggregate(row?: Row): Aggregate {
  const units = asNumber(row?.units);
  const recordedPayoutTransactions = asNumber(row?.recordedPayoutTransactions);
  return {
    units,
    volume: asNumber(row?.volume),
    averagePurchasePrice: asNullableNumber(row?.averagePurchasePrice),
    gci: asNumber(row?.gci),
    averageGci: asNullableNumber(row?.averageGci),
    averageCommissionRate: asNullableNumber(row?.averageCommissionRate),
    recordedSavvyNet: asNumber(row?.recordedSavvyNet),
    averageRecordedSavvyNet: asNullableNumber(row?.averageRecordedSavvyNet),
    recordedPayoutTransactions,
    payoutCoveragePct: units > 0 ? (recordedPayoutTransactions / units) * 100 : null,
    referralPayouts: asNumber(row?.referralPayouts),
    groupLeaderPayouts: asNumber(row?.groupLeaderPayouts),
    agentPayouts: asNumber(row?.agentPayouts),
    isaBonuses: asNumber(row?.isaBonuses),
    otherPayouts: asNumber(row?.otherPayouts),
    totalRecordedPayouts: asNumber(row?.totalRecordedPayouts),
    unallocatedGci: asNumber(row?.unallocatedGci),
    missingPriceCount: asNumber(row?.missingPriceCount),
    missingGciCount: asNumber(row?.missingGciCount),
    missingLeadSourceCount: asNumber(row?.missingLeadSourceCount),
    payoutIntegrityCount: asNumber(row?.payoutIntegrityCount),
  };
}

function previousPeriod(filters: TransactionIntelligenceFilters): TransactionIntelligenceFilters | null {
  if (!filters.dateFrom || !filters.dateTo) return null;
  const from = new Date(`${filters.dateFrom}T00:00:00.000Z`);
  const to = new Date(`${filters.dateTo}T00:00:00.000Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) return null;
  const length = Math.floor((to.getTime() - from.getTime()) / 86_400_000) + 1;
  const priorTo = new Date(from.getTime() - 86_400_000);
  const priorFrom = new Date(priorTo.getTime() - (length - 1) * 86_400_000);
  return {
    ...filters,
    dateFrom: priorFrom.toISOString().slice(0, 10),
    dateTo: priorTo.toISOString().slice(0, 10),
  };
}

function change(current: number, prior: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(prior) || prior === 0) return null;
  return ((current - prior) / Math.abs(prior)) * 100;
}

function staticTransactionTypeBreakdown(rows: Row[]): Array<Aggregate & { transactionType: "buyer" | "seller" | "dual" }> {
  const byType = new Map(rows.map((row) => [String(row.transactionType), row]));
  return (["buyer", "seller", "dual"] as const).map((transactionType) => ({
    transactionType,
    ...toAggregate(byType.get(transactionType)),
  }));
}

function filterMetadata(filters: TransactionIntelligenceFilters) {
  return {
    dateFrom: filters.dateFrom ?? null,
    dateTo: filters.dateTo ?? null,
    agentId: filters.agentId ?? null,
    marketProfileId: filters.marketProfileId ?? null,
    leadSourceId: filters.leadSourceId ?? null,
    transactionType: filters.transactionType ?? null,
  };
}

export async function getTransactionIntelligenceReport(filters: TransactionIntelligenceFilters = {}) {
  const closedWhere = closedFlowWhere(filters);
  const snapshotWhere = underContractSnapshotWhere(filters);
  const priorFilters = previousPeriod(filters);
  const priorWhere = priorFilters ? closedFlowWhere(priorFilters) : null;

  const [actualRows, snapshotRows, priorRows, sideRows, monthlyRows, closedAgentRows, pipelineAgentRows, sourceRows, evidenceRows, agentFilters, marketFilters, sourceFilters] = await Promise.all([
    runRows<Row>(sql`SELECT ${aggregateSelect()} ${baseFrom(closedWhere)}`),
    runRows<Row>(sql`
      SELECT
        COUNT(*) AS units,
        COALESCE(SUM(COALESCE(t.\`purchasePrice\`, 0)), 0) AS volume,
        AVG(t.\`purchasePrice\`) AS averagePurchasePrice,
        COALESCE(SUM(COALESCE(t.\`grossCommissionIncome\`, 0)), 0) AS recordedGci,
        COALESCE(SUM(COALESCE(pi.savvyNet, 0)), 0) AS recordedSavvyNet,
        SUM(CASE WHEN t.\`closingDate\` IS NULL THEN 1 ELSE 0 END) AS missingExpectedCloseDateCount,
        SUM(CASE WHEN t.\`closingDate\` IS NOT NULL AND DATE(t.\`closingDate\`) < CURRENT_DATE THEN 1 ELSE 0 END) AS pastExpectedCloseDateCount,
        SUM(CASE WHEN t.\`payoutIntegrityFlag\` = 1 THEN 1 ELSE 0 END) AS payoutIntegrityCount
      ${baseFrom(snapshotWhere)}
    `),
    priorWhere ? runRows<Row>(sql`SELECT ${aggregateSelect()} ${baseFrom(priorWhere)}`) : Promise.resolve([]),
    runRows<Row>(sql`
      SELECT t.\`transactionType\` AS transactionType, ${aggregateSelect()}
      ${baseFrom(closedWhere)}
      GROUP BY t.\`transactionType\`
      ORDER BY FIELD(t.\`transactionType\`, 'buyer', 'seller', 'dual')
    `),
    runRows<Row>(sql`
      SELECT
        DATE_FORMAT(t.\`closingDate\`, '%Y-%m') AS month,
        COUNT(*) AS units,
        COALESCE(SUM(COALESCE(t.\`purchasePrice\`, 0)), 0) AS volume,
        COALESCE(SUM(COALESCE(t.\`grossCommissionIncome\`, 0)), 0) AS gci,
        COALESCE(SUM(COALESCE(pi.savvyNet, 0)), 0) AS recordedSavvyNet
      ${baseFrom(closedWhere)}
      GROUP BY DATE_FORMAT(t.\`closingDate\`, '%Y-%m')
      ORDER BY DATE_FORMAT(t.\`closingDate\`, '%Y-%m') ASC
    `),
    runRows<Row>(sql`
      SELECT
        t.\`agentId\` AS agentId,
        COALESCE(u.\`name\`, 'Unknown') AS agentName,
        COUNT(*) AS closedUnits,
        COALESCE(SUM(COALESCE(t.\`purchasePrice\`, 0)), 0) AS closedVolume,
        AVG(t.\`purchasePrice\`) AS averagePurchasePrice,
        COALESCE(SUM(COALESCE(t.\`grossCommissionIncome\`, 0)), 0) AS gci,
        COALESCE(SUM(COALESCE(pi.savvyNet, 0)), 0) AS recordedSavvyNet,
        SUM(CASE WHEN COALESCE(pi.payoutItemCount, 0) > 0 THEN 1 ELSE 0 END) AS payoutedClosedUnits
      ${baseFrom(closedWhere)}
      GROUP BY t.\`agentId\`, u.\`name\`
    `),
    runRows<Row>(sql`
      SELECT
        t.\`agentId\` AS agentId,
        COALESCE(u.\`name\`, 'Unknown') AS agentName,
        COUNT(*) AS underContractUnits,
        COALESCE(SUM(COALESCE(t.\`purchasePrice\`, 0)), 0) AS underContractVolume,
        COALESCE(SUM(COALESCE(t.\`grossCommissionIncome\`, 0)), 0) AS underContractRecordedGci,
        SUM(CASE WHEN t.\`closingDate\` IS NULL THEN 1 ELSE 0 END) AS missingExpectedCloseDateCount,
        SUM(CASE WHEN t.\`closingDate\` IS NOT NULL AND DATE(t.\`closingDate\`) < CURRENT_DATE THEN 1 ELSE 0 END) AS pastExpectedCloseDateCount
      ${baseFrom(snapshotWhere)}
      GROUP BY t.\`agentId\`, u.\`name\`
    `),
    runRows<Row>(sql`
      SELECT
        COALESCE(ls.\`name\`, 'Unattributed') AS sourceName,
        c.\`leadSourceId\` AS leadSourceId,
        COUNT(*) AS closedUnits,
        COALESCE(SUM(COALESCE(t.\`purchasePrice\`, 0)), 0) AS closedVolume,
        COALESCE(SUM(COALESCE(t.\`grossCommissionIncome\`, 0)), 0) AS gci,
        COALESCE(SUM(COALESCE(pi.savvyNet, 0)), 0) AS recordedSavvyNet,
        AVG(t.\`purchasePrice\`) AS averagePurchasePrice
      ${baseFrom(closedWhere)}
      GROUP BY c.\`leadSourceId\`, ls.\`name\`
      ORDER BY closedVolume DESC, closedUnits DESC
      LIMIT 12
    `),
    runRows<Row>(sql`
      SELECT
        t.\`id\` AS transactionId,
        t.\`transactionNumber\` AS transactionNumber,
        t.\`status\` AS status,
        t.\`transactionType\` AS transactionType,
        t.\`contractDate\` AS contractDate,
        t.\`closingDate\` AS closingDate,
        t.\`purchasePrice\` AS purchasePrice,
        t.\`grossCommissionIncome\` AS gci,
        t.\`payoutIntegrityFlag\` AS payoutIntegrityFlag,
        COALESCE(pi.savvyNet, 0) AS recordedSavvyNet,
        COALESCE(u.\`name\`, 'Unknown') AS agentName,
        t.\`agentId\` AS agentId,
        CONCAT_WS(' ', c.\`firstName\`, c.\`lastName\`) AS contactName,
        COALESCE(ls.\`name\`, 'Unattributed') AS sourceName,
        p.\`address\` AS propertyAddress,
        p.\`city\` AS propertyCity,
        m.\`name\` AS marketName
      FROM \`transactions\` t
      LEFT JOIN \`users\` u ON u.\`id\` = t.\`agentId\`
      LEFT JOIN \`contacts\` c ON c.\`id\` = t.\`primaryContactId\`
      LEFT JOIN \`properties\` p ON p.\`id\` = t.\`propertyId\`
      LEFT JOIN \`lead_sources\` ls ON ls.\`id\` = c.\`leadSourceId\`
      LEFT JOIN \`market_profiles\` m ON m.\`id\` = u.\`marketProfileId\`
      ${PayoutJoin}
      ${closedWhere}
      ORDER BY t.\`closingDate\` DESC, t.\`id\` DESC
      LIMIT 75
    `),
    runRows<Row>(sql`
      SELECT \`id\` AS id, \`name\` AS name
      FROM \`users\`
      WHERE \`role\` = 'agent' AND \`isActive\` = 1
      ORDER BY \`name\` ASC
    `),
    runRows<Row>(sql`
      SELECT \`id\` AS id, \`name\` AS name
      FROM \`market_profiles\`
      ORDER BY \`name\` ASC
    `),
    runRows<Row>(sql`
      SELECT \`id\` AS id, \`name\` AS name, \`parentId\` AS parentId
      FROM \`lead_sources\`
      ORDER BY \`name\` ASC
    `),
  ]);

  const actuals = toAggregate(actualRows[0]);
  const prior = priorFilters ? toAggregate(priorRows[0]) : null;
  const snapshot = snapshotRows[0] ?? {};
  const pipelineByAgent = new Map(pipelineAgentRows.map((row) => [asNumber(row.agentId), row]));
  const agentsById = new Map<number, Row>();
  for (const row of closedAgentRows) agentsById.set(asNumber(row.agentId), row);
  for (const row of pipelineAgentRows) {
    const id = asNumber(row.agentId);
    if (!agentsById.has(id)) agentsById.set(id, row);
  }

  const agents = Array.from(agentsById.entries()).map(([agentId, closed]) => {
    const pipeline = pipelineByAgent.get(agentId) ?? {};
    const closedUnits = asNumber(closed.closedUnits);
    const payoutedClosedUnits = asNumber(closed.payoutedClosedUnits);
    return {
      agentId,
      agentName: String(closed.agentName ?? pipeline.agentName ?? "Unknown"),
      closedUnits,
      closedVolume: asNumber(closed.closedVolume),
      averagePurchasePrice: asNullableNumber(closed.averagePurchasePrice),
      gci: asNumber(closed.gci),
      recordedSavvyNet: asNumber(closed.recordedSavvyNet),
      payoutCoveragePct: closedUnits > 0 ? (payoutedClosedUnits / closedUnits) * 100 : null,
      underContractUnits: asNumber(pipeline.underContractUnits),
      underContractVolume: asNumber(pipeline.underContractVolume),
      underContractRecordedGci: asNumber(pipeline.underContractRecordedGci),
      missingExpectedCloseDateCount: asNumber(pipeline.missingExpectedCloseDateCount),
      pastExpectedCloseDateCount: asNumber(pipeline.pastExpectedCloseDateCount),
    };
  }).sort((a, b) => b.closedVolume - a.closedVolume || b.underContractVolume - a.underContractVolume);

  const period = filterMetadata(filters);
  const reportedPipeline = {
    units: asNumber(snapshot.units),
    volume: asNumber(snapshot.volume),
    averagePurchasePrice: asNullableNumber(snapshot.averagePurchasePrice),
    recordedGci: asNumber(snapshot.recordedGci),
    recordedSavvyNet: asNumber(snapshot.recordedSavvyNet),
    missingExpectedCloseDateCount: asNumber(snapshot.missingExpectedCloseDateCount),
    pastExpectedCloseDateCount: asNumber(snapshot.pastExpectedCloseDateCount),
    payoutIntegrityCount: asNumber(snapshot.payoutIntegrityCount),
  };

  return {
    definitionVersion: "transaction-intelligence-v1",
    generatedAt: new Date().toISOString(),
    scope: { label: "Company reporting — administrator access", financeVisible: true },
    filters: period,
    definitions: {
      closedActuals: "Closed transactions whose closing date falls within the reporting period.",
      underContractPipeline: "Current under-contract transactions, shown as a live snapshot and intentionally not limited by the closed-actuals reporting period.",
      recordedSavvyNet: "The sum of recorded transaction payout items assigned to Savvy STR Agents or EXP. It is not a projection and is accompanied by payout coverage.",
      economicsBridge: "GCI less all recorded payout items. Any remaining amount is shown as unallocated recorded GCI and requires review rather than being assumed to be Savvy Net.",
    },
    actuals,
    prior: prior ? {
      period: { dateFrom: priorFilters?.dateFrom ?? null, dateTo: priorFilters?.dateTo ?? null },
      ...prior,
      changes: {
        unitsPct: change(actuals.units, prior.units),
        volumePct: change(actuals.volume, prior.volume),
        gciPct: change(actuals.gci, prior.gci),
        recordedSavvyNetPct: change(actuals.recordedSavvyNet, prior.recordedSavvyNet),
      },
    } : null,
    pipeline: reportedPipeline,
    byTransactionType: staticTransactionTypeBreakdown(sideRows),
    monthly: monthlyRows.map((row) => ({
      month: String(row.month ?? ""),
      units: asNumber(row.units),
      volume: asNumber(row.volume),
      gci: asNumber(row.gci),
      recordedSavvyNet: asNumber(row.recordedSavvyNet),
    })),
    agents,
    sources: sourceRows.map((row) => ({
      leadSourceId: asNullableNumber(row.leadSourceId),
      sourceName: String(row.sourceName ?? "Unattributed"),
      closedUnits: asNumber(row.closedUnits),
      closedVolume: asNumber(row.closedVolume),
      averagePurchasePrice: asNullableNumber(row.averagePurchasePrice),
      gci: asNumber(row.gci),
      recordedSavvyNet: asNumber(row.recordedSavvyNet),
    })),
    evidence: evidenceRows.map((row) => ({
      transactionId: asNumber(row.transactionId),
      transactionNumber: String(row.transactionNumber ?? `#${row.transactionId}`),
      status: String(row.status ?? "closed"),
      transactionType: String(row.transactionType ?? "—"),
      contractDate: day(row.contractDate),
      closingDate: day(row.closingDate),
      purchasePrice: asNumber(row.purchasePrice),
      gci: asNumber(row.gci),
      recordedSavvyNet: asNumber(row.recordedSavvyNet),
      payoutIntegrityFlag: Boolean(row.payoutIntegrityFlag),
      agentId: asNumber(row.agentId),
      agentName: String(row.agentName ?? "Unknown"),
      contactName: String(row.contactName ?? "—"),
      sourceName: String(row.sourceName ?? "Unattributed"),
      property: [row.propertyAddress, row.propertyCity].filter(Boolean).join(", ") || "—",
      marketName: String(row.marketName ?? "—"),
    })),
    availableFilters: {
      agents: agentFilters.map((row) => ({ id: asNumber(row.id), name: String(row.name ?? "Unknown") })),
      markets: marketFilters.map((row) => ({ id: asNumber(row.id), name: String(row.name ?? "Unknown") })),
      sources: sourceFilters.map((row) => ({ id: asNumber(row.id), name: String(row.name ?? "Unknown"), parentId: asNullableNumber(row.parentId) })),
    },
  };
}

export function buildTransactionIntelligenceFacts(report: Awaited<ReturnType<typeof getTransactionIntelligenceReport>>) {
  return {
    report: "Transaction Intelligence & Economics",
    reportingPeriod: report.filters,
    definitions: report.definitions,
    closedActuals: report.actuals,
    priorPeriod: report.prior,
    liveUnderContractPipeline: report.pipeline,
    transactionTypeMix: report.byTransactionType,
    topAgents: report.agents.slice(0, 12),
    topSources: report.sources.slice(0, 12),
    dataQuality: {
      missingPriceCount: report.actuals.missingPriceCount,
      missingGciCount: report.actuals.missingGciCount,
      missingLeadSourceCount: report.actuals.missingLeadSourceCount,
      payoutIntegrityCount: report.actuals.payoutIntegrityCount,
      payoutCoveragePct: report.actuals.payoutCoveragePct,
      unallocatedGci: report.actuals.unallocatedGci,
    },
  };
}


export type TransactionIntelligenceViewer = {
  id: number;
  role: "admin" | "agent" | "isa" | "agent_support";
};

export type TransactionIntelligenceInsightEvidence = {
  label: string;
  value: string;
  drilldown: "transactions" | "pipeline" | "data_quality";
};

export type TransactionIntelligenceInsight = {
  type: "warning" | "opportunity" | "coaching" | "success" | "data_quality";
  priority: "high" | "medium" | "low";
  title: string;
  observation: string;
  explanation: string;
  confidence: "high" | "medium" | "limited";
  owner: string;
  action: string;
  connectedSignals: string[];
  evidence: TransactionIntelligenceInsightEvidence[];
};

export type TransactionIntelligenceInsightPayload = {
  summary: string;
  dataQualityNote: string;
  generationMethod: "model" | "deterministic";
  insights: TransactionIntelligenceInsight[];
};

const TRANSACTION_INTELLIGENCE_INSIGHT_TTL_MS = 6 * 60 * 60 * 1000;
const TRANSACTION_INTELLIGENCE_REFRESH_LOCK_MS = 10 * 60 * 1000;

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}

function formatPercent(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "—" : `${value.toFixed(1)}%`;
}

function transactionIntelligenceScopeKey(viewer: TransactionIntelligenceViewer, filters: TransactionIntelligenceFilters): string {
  const descriptor = JSON.stringify({
    version: "transaction-intelligence-v1",
    viewerId: viewer.id,
    role: viewer.role,
    filters: filterMetadata(filters),
  });
  const fingerprint = createHash("sha256").update(descriptor).digest("hex");
  return `transaction-intelligence-v1|${fingerprint}`;
}

function serializeInsightFilters(filters: TransactionIntelligenceFilters) {
  return filterMetadata(filters);
}

function toIso(value: unknown): string | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  return null;
}

function cachedInsightPayload(row: Record<string, unknown>) {
  const rawPayload = row.insightPayload && typeof row.insightPayload === "object"
    ? row.insightPayload as Partial<TransactionIntelligenceInsightPayload>
    : {};
  const expiresAt = toIso(row.expiresAt);
  return {
    summary: typeof rawPayload.summary === "string" ? rawPayload.summary : "",
    dataQualityNote: typeof rawPayload.dataQualityNote === "string" ? rawPayload.dataQualityNote : "",
    generationMethod: rawPayload.generationMethod === "model" ? "model" : "deterministic",
    insights: Array.isArray(rawPayload.insights) ? rawPayload.insights : [],
    generatedAt: toIso(row.generatedAt),
    expiresAt,
    isStale: !expiresAt || new Date(expiresAt).getTime() <= Date.now(),
    status: typeof row.status === "string" ? row.status : "unknown",
    model: typeof row.model === "string" ? row.model : null,
    errorMessage: typeof row.errorMessage === "string" ? row.errorMessage : null,
    refreshReason: typeof row.refreshReason === "string" ? row.refreshReason : null,
  };
}

function deterministicInsightPayload(report: Awaited<ReturnType<typeof getTransactionIntelligenceReport>>): TransactionIntelligenceInsightPayload {
  const insights: TransactionIntelligenceInsight[] = [];
  const { actuals, pipeline, prior } = report;

  if (pipeline.pastExpectedCloseDateCount > 0 || pipeline.missingExpectedCloseDateCount > 0) {
    insights.push({
      type: "warning",
      priority: pipeline.pastExpectedCloseDateCount > 0 ? "high" : "medium",
      title: "Pipeline timing needs review",
      observation: `${pipeline.pastExpectedCloseDateCount} current under-contract transaction${pipeline.pastExpectedCloseDateCount === 1 ? " is" : "s are"} past its expected close date and ${pipeline.missingExpectedCloseDateCount} ${pipeline.missingExpectedCloseDateCount === 1 ? "has" : "have"} no expected close date.`,
      explanation: "Expected-close hygiene connects live pipeline inventory to a credible near-term production forecast. Missing or overdue dates weaken the timing—not the value—of the under-contract inventory shown above.",
      confidence: "high",
      owner: "Transaction owners and operations",
      action: "Review the live under-contract evidence, update expected close dates, and flag transactions requiring escalation.",
      connectedSignals: ["Live under-contract units", "Past expected close", "Missing expected close date"],
      evidence: [
        { label: "Past expected close", value: String(pipeline.pastExpectedCloseDateCount), drilldown: "pipeline" },
        { label: "Missing expected close date", value: String(pipeline.missingExpectedCloseDateCount), drilldown: "pipeline" },
      ],
    });
  }

  if (actuals.payoutCoveragePct !== null && actuals.payoutCoveragePct < 100) {
    insights.push({
      type: "data_quality",
      priority: actuals.payoutCoveragePct < 80 ? "high" : "medium",
      title: "Savvy Net is partially recorded",
      observation: `${formatPercent(actuals.payoutCoveragePct)} of closed transactions in the selected period have at least one recorded payout item.`,
      explanation: "Savvy Net is reported only from payout items assigned to Savvy STR Agents or EXP. A missing payout must remain unknown rather than be interpreted as zero, so economics comparisons should be qualified until coverage improves.",
      confidence: "high",
      owner: "Transaction operations and finance",
      action: "Open the closed transaction evidence and complete payout records before using per-agent or source net comparisons for management decisions.",
      connectedSignals: ["Recorded Savvy Net", "Payout coverage", "Closed units"],
      evidence: [
        { label: "Payout-recorded closings", value: `${actuals.recordedPayoutTransactions} of ${actuals.units}`, drilldown: "data_quality" },
        { label: "Recorded Savvy Net", value: formatMoney(actuals.recordedSavvyNet), drilldown: "transactions" },
      ],
    });
  }

  const volumeChange = prior?.changes?.volumePct;
  const unitsChange = prior?.changes?.unitsPct;
  if (typeof volumeChange === "number" || typeof unitsChange === "number") {
    const down = (volumeChange ?? 0) < 0 || (unitsChange ?? 0) < 0;
    insights.push({
      type: down ? "warning" : "success",
      priority: down ? "medium" : "low",
      title: down ? "Closed production is below the comparable prior period" : "Closed production improved versus the comparable prior period",
      observation: `Closed units changed ${formatPercent(unitsChange ?? null)} and closed volume changed ${formatPercent(volumeChange ?? null)} versus the immediately preceding period of equal length.`,
      explanation: "Units and volume are shown separately because price mix can move volume even when transaction count does not. Review the monthly trend and side mix before attributing the change to agent execution, source flow, or market conditions.",
      confidence: "high",
      owner: "Sales leadership",
      action: "Use the trend, transaction-side mix, and evidence register to identify which closings account for the movement and determine whether live pipeline supports a recovery or continuation.",
      connectedSignals: ["Closed units", "Closed volume", "Average purchase price", "Live under-contract inventory"],
      evidence: [
        { label: "Closed units", value: `${actuals.units}`, drilldown: "transactions" },
        { label: "Closed volume", value: formatMoney(actuals.volume), drilldown: "transactions" },
      ],
    });
  }

  const topSource = report.sources[0];
  if (topSource && actuals.volume > 0 && topSource.closedVolume / actuals.volume >= 0.35) {
    const sourceShare = (topSource.closedVolume / actuals.volume) * 100;
    insights.push({
      type: "opportunity",
      priority: "medium",
      title: "Closed volume is concentrated in one attributed source",
      observation: `${topSource.sourceName} accounts for ${formatPercent(sourceShare)} of selected-period closed volume (${formatMoney(topSource.closedVolume)} across ${topSource.closedUnits} closed units).`,
      explanation: "Source concentration can be productive, but it creates dependency. Because spend is not yet recorded, this report deliberately evaluates observed downstream outcomes—not ROI.",
      confidence: "medium",
      owner: "Sales and growth leadership",
      action: "Inspect the source-linked transaction evidence, compare its price and net profile with other sources, and decide whether its volume reflects scalable lead flow or a small number of exceptional transactions.",
      connectedSignals: ["Closed source contribution", "Closed volume", "Average purchase price", "Recorded Savvy Net"],
      evidence: [
        { label: topSource.sourceName, value: `${formatMoney(topSource.closedVolume)} / ${topSource.closedUnits} units`, drilldown: "transactions" },
        { label: "All closed volume", value: formatMoney(actuals.volume), drilldown: "transactions" },
      ],
    });
  }

  if (!insights.length) {
    insights.push({
      type: "success",
      priority: "low",
      title: "Transaction evidence is ready for review",
      observation: `${actuals.units} closed units and ${formatMoney(actuals.volume)} of closed volume are in the selected period, with ${pipeline.units} live under-contract units tracked separately.`,
      explanation: "This report intentionally keeps closed flow separate from live pipeline so actual production and future inventory are not blended into a single misleading total.",
      confidence: "high",
      owner: "Sales leadership",
      action: "Use the monthly trend, agent comparison, source contribution, and evidence register to set the next production and transaction-hygiene priorities.",
      connectedSignals: ["Closed units", "Closed volume", "Live under-contract inventory"],
      evidence: [
        { label: "Closed units", value: String(actuals.units), drilldown: "transactions" },
        { label: "Live under-contract units", value: String(pipeline.units), drilldown: "pipeline" },
      ],
    });
  }

  const dataQualityNotes: string[] = [];
  if (actuals.missingPriceCount) dataQualityNotes.push(`${actuals.missingPriceCount} closed record${actuals.missingPriceCount === 1 ? " is" : "s are"} missing purchase price`);
  if (actuals.missingGciCount) dataQualityNotes.push(`${actuals.missingGciCount} closed record${actuals.missingGciCount === 1 ? " is" : "s are"} missing GCI`);
  if (actuals.missingLeadSourceCount) dataQualityNotes.push(`${actuals.missingLeadSourceCount} closed record${actuals.missingLeadSourceCount === 1 ? " is" : "s are"} not source-attributed`);
  if (actuals.payoutIntegrityCount) dataQualityNotes.push(`${actuals.payoutIntegrityCount} closed record${actuals.payoutIntegrityCount === 1 ? " has" : "s have"} payout-integrity flags`);

  return {
    summary: `The selected closing period produced ${actuals.units} closed units, ${formatMoney(actuals.volume)} in purchase-price volume, ${formatMoney(actuals.gci)} in recorded GCI, and ${formatMoney(actuals.recordedSavvyNet)} in recorded Savvy Net. Current under-contract inventory is ${pipeline.units} units and ${formatMoney(pipeline.volume)} in volume.`,
    dataQualityNote: dataQualityNotes.length ? `${dataQualityNotes.join("; ")}. These conditions limit the precision of comparisons.` : "No material data-quality exception was detected by the report’s current checks.",
    generationMethod: "deterministic",
    insights: insights.slice(0, 4),
  };
}

function coerceInsightPayload(input: unknown, fallback: TransactionIntelligenceInsightPayload): TransactionIntelligenceInsightPayload {
  if (!input || typeof input !== "object") return fallback;
  const raw = input as Record<string, unknown>;
  if (!Array.isArray(raw.insights) || !raw.insights.length) return fallback;
  const permittedTypes = new Set(["warning", "opportunity", "coaching", "success", "data_quality"]);
  const permittedPriorities = new Set(["high", "medium", "low"]);
  const permittedConfidence = new Set(["high", "medium", "limited"]);
  const permittedDrilldowns = new Set(["transactions", "pipeline", "data_quality"]);
  const insights = raw.insights.slice(0, 4).flatMap((candidate): TransactionIntelligenceInsight[] => {
    if (!candidate || typeof candidate !== "object") return [];
    const item = candidate as Record<string, unknown>;
    if (typeof item.title !== "string" || typeof item.observation !== "string" || typeof item.explanation !== "string" || typeof item.owner !== "string" || typeof item.action !== "string") return [];
    const type = permittedTypes.has(String(item.type)) ? String(item.type) as TransactionIntelligenceInsight["type"] : "opportunity";
    const priority = permittedPriorities.has(String(item.priority)) ? String(item.priority) as TransactionIntelligenceInsight["priority"] : "medium";
    const confidence = permittedConfidence.has(String(item.confidence)) ? String(item.confidence) as TransactionIntelligenceInsight["confidence"] : "limited";
    const connectedSignals = Array.isArray(item.connectedSignals) ? item.connectedSignals.filter((value): value is string => typeof value === "string").slice(0, 6) : [];
    const evidence = Array.isArray(item.evidence) ? item.evidence.flatMap((candidateEvidence): TransactionIntelligenceInsightEvidence[] => {
      if (!candidateEvidence || typeof candidateEvidence !== "object") return [];
      const evidenceItem = candidateEvidence as Record<string, unknown>;
      if (typeof evidenceItem.label !== "string" || typeof evidenceItem.value !== "string") return [];
      const drilldown = permittedDrilldowns.has(String(evidenceItem.drilldown)) ? String(evidenceItem.drilldown) as TransactionIntelligenceInsightEvidence["drilldown"] : "transactions";
      return [{ label: evidenceItem.label, value: evidenceItem.value, drilldown }];
    }).slice(0, 3) : [];
    return [{ type, priority, confidence, title: item.title, observation: item.observation, explanation: item.explanation, owner: item.owner, action: item.action, connectedSignals, evidence }];
  });
  if (!insights.length) return fallback;
  return {
    summary: typeof raw.summary === "string" && raw.summary.trim() ? raw.summary : fallback.summary,
    dataQualityNote: typeof raw.dataQualityNote === "string" && raw.dataQualityNote.trim() ? raw.dataQualityNote : fallback.dataQualityNote,
    generationMethod: "model",
    insights,
  };
}

async function createTransactionIntelligenceInsightPayload(report: Awaited<ReturnType<typeof getTransactionIntelligenceReport>>) {
  const fallback = deterministicInsightPayload(report);
  const facts = buildTransactionIntelligenceFacts(report);
  const model = process.env.TRANSACTION_INTELLIGENCE_INSIGHTS_MODEL || process.env.ANALYTICS_INSIGHTS_MODEL || "gpt-5";
  try {
    const response = await invokeLLM({
      model,
      maxTokens: 1800,
      reasoning: { effort: "low" },
      messages: [
        {
          role: "system",
          content: "You are Savvy STR Agents' transaction-intelligence analyst. Use only the supplied SavvyOS facts. Do not invent causes, records, goals, costs, ROI, or forecasted dollars. Distinguish closed actuals from the current under-contract snapshot. Savvy Net means only recorded payouts to Savvy STR Agents or EXP and must be qualified by payout coverage. Produce at most four concise operational insights in this exact management sequence: signal, how connected upstream/downstream metrics may relate, operational impact, specific action, accountable owner, and evidence. When evidence is incomplete, say so plainly.",
        },
        {
          role: "user",
          content: JSON.stringify(facts),
        },
      ],
      outputSchema: {
        name: "transaction_intelligence_brief",
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
                        drilldown: { type: "string", enum: ["transactions", "pipeline", "data_quality"] },
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
    return { payload: coerceInsightPayload(JSON.parse(text), fallback), model };
  } catch (error) {
    console.warn("[TransactionIntelligence] Model insight generation was unavailable; using deterministic report signals.", error instanceof Error ? error.message : error);
    return { payload: fallback, model: "deterministic-fallback" };
  }
}

export async function getCachedTransactionIntelligenceInsights(viewer: TransactionIntelligenceViewer, filters: TransactionIntelligenceFilters) {
  if (viewer.role !== "admin") return null;
  const db = await getDb();
  if (!db) return null;
  const scopeKey = transactionIntelligenceScopeKey(viewer, filters);
  const [row] = await db.select().from(analyticsInsightCaches).where(eq(analyticsInsightCaches.scopeKey, scopeKey)).limit(1);
  return row ? cachedInsightPayload(row as unknown as Record<string, unknown>) : null;
}

export async function refreshTransactionIntelligenceInsights(options: {
  viewer: TransactionIntelligenceViewer;
  filters: TransactionIntelligenceFilters;
  force?: boolean;
  reason?: "manual" | "automatic";
}) {
  const { viewer, filters, force = false, reason = "automatic" } = options;
  if (viewer.role !== "admin") throw new Error("Transaction Intelligence insights are restricted to administrators.");
  const db = await getDb();
  if (!db) throw new Error("Database is not available for Transaction Intelligence insight caching.");

  const scopeKey = transactionIntelligenceScopeKey(viewer, filters);
  const [existing] = await db.select().from(analyticsInsightCaches).where(eq(analyticsInsightCaches.scopeKey, scopeKey)).limit(1);
  const now = new Date();
  if (existing && !force && existing.status === "ready" && existing.expiresAt > now) {
    return { cache: cachedInsightPayload(existing as unknown as Record<string, unknown>), cacheHit: true };
  }
  if (existing && existing.status === "refreshing" && now.getTime() - existing.generatedAt.getTime() < TRANSACTION_INTELLIGENCE_REFRESH_LOCK_MS) {
    return { cache: cachedInsightPayload(existing as unknown as Record<string, unknown>), cacheHit: true, refreshing: true };
  }

  const serializedFilters = serializeInsightFilters(filters);
  if (existing) {
    await db.update(analyticsInsightCaches).set({
      status: "refreshing",
      ownerUserId: viewer.id,
      viewerRole: viewer.role,
      filters: serializedFilters,
      generatedAt: now,
      errorMessage: null,
      refreshReason: reason,
    }).where(eq(analyticsInsightCaches.id, existing.id));
  } else {
    await db.insert(analyticsInsightCaches).values({
      scopeKey,
      ownerUserId: viewer.id,
      viewerRole: viewer.role,
      filters: serializedFilters,
      insightPayload: { summary: "Generating Transaction Intelligence…", dataQualityNote: "", generationMethod: "deterministic", insights: [] },
      facts: {},
      status: "refreshing",
      generatedAt: now,
      expiresAt: new Date(now.getTime() + TRANSACTION_INTELLIGENCE_INSIGHT_TTL_MS),
      refreshReason: reason,
      model: process.env.TRANSACTION_INTELLIGENCE_INSIGHTS_MODEL || process.env.ANALYTICS_INSIGHTS_MODEL || "gpt-5",
    });
  }

  const report = await getTransactionIntelligenceReport(filters);
  const { payload, model } = await createTransactionIntelligenceInsightPayload(report);
  const expiresAt = new Date(Date.now() + TRANSACTION_INTELLIGENCE_INSIGHT_TTL_MS);
  await db.update(analyticsInsightCaches).set({
    insightPayload: payload,
    facts: buildTransactionIntelligenceFacts(report),
    status: "ready",
    generatedAt: new Date(),
    expiresAt,
    errorMessage: null,
    refreshReason: reason,
    model,
  }).where(eq(analyticsInsightCaches.scopeKey, scopeKey));

  return {
    cache: {
      ...payload,
      generatedAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString(),
      isStale: false,
      status: "ready",
      model,
      errorMessage: null,
      refreshReason: reason,
    },
    cacheHit: false,
  };
}
