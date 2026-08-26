import { sql, type SQL } from "drizzle-orm";
import { getDb } from "../db";
import {
  getAgentOnboardingReportingData,
  getIsaActivitiesReportingData,
  getLeadSourcesReportingData,
  getMarketAnalyticsReportingData,
  getTasksReportingData,
} from "./reportingExpansion";

export type ReportingDateBasis = "closing" | "contract";
export type ReportingStatus = "all" | "closed" | "under_contract" | "terminated";
export type ReportingTransactionType = "all" | "buyer" | "seller" | "dual";

export type ReportingFilters = {
  dateFrom?: string;
  dateTo?: string;
  dateBasis?: ReportingDateBasis;
  agentId?: number;
  agentIds?: number[];
  groupLeaderId?: number;
  marketProfileId?: number;
  isaId?: number;
  isaIds?: number[];
  leadSourceId?: number;
  leadSourceIds?: number[];
  status?: ReportingStatus;
  transactionType?: ReportingTransactionType;
  includeLeaderStats?: boolean;
  page?: number;
  limit?: number;
};

type Row = Record<string, unknown>;

type Production = {
  closings: number;
  volume: number;
  grossCommission: number;
  savvyNet: number;
  averageGci: number | null;
  averagePurchasePrice: number | null;
  averageDaysToClose: number | null;
  units: number;
};

const PAYOUT_JOIN = sql`
  LEFT JOIN (
    SELECT
      \`transactionId\` AS transactionId,
      COALESCE(SUM(CASE WHEN \`payeeType\` = 'savvy_str_agents' THEN COALESCE(\`amount\`, 0) ELSE 0 END), 0) AS savvyNet,
      COALESCE(SUM(CASE WHEN \`payeeType\` = 'agent' THEN COALESCE(\`amount\`, 0) ELSE 0 END), 0) AS agentPayout,
      COUNT(*) AS payoutCount
    FROM \`transaction_payout_items\`
    GROUP BY \`transactionId\`
  ) pi ON pi.transactionId = t.id
`;

function asNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asDay(value: unknown): string | null {
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

async function runRows<T extends Row = Row>(statement: SQL): Promise<T[]> {
  const db = await getDb();
  if (!db) return [];
  const result = await (db as unknown as { execute: (query: SQL) => Promise<unknown> }).execute(statement);
  return rowsFromResult<T>(result);
}

function where(clauses: Array<SQL | undefined>): SQL {
  const valid = clauses.filter((clause): clause is SQL => Boolean(clause));
  return valid.length ? sql`WHERE ${sql.join(valid, sql` AND `)}` : sql``;
}

function withCondition(scope: SQL, condition: SQL): SQL {
  return scope.queryChunks.length ? sql`${scope} AND ${condition}` : sql`WHERE ${condition}`;
}

function dateColumn(filters: ReportingFilters): SQL {
  return filters.dateBasis === "contract" ? sql`t.\`contractDate\`` : sql`t.\`closingDate\``;
}

function transactionScope(
  filters: ReportingFilters,
  options: { applyDate?: boolean; forceStatus?: Exclude<ReportingStatus, "all"> } = {},
): SQL {
  const status = options.forceStatus ?? filters.status;
  const date = dateColumn(filters);
  return where([
    sql` t.\`referralId\` IS NULL AND NOT EXISTS (
      SELECT 1 FROM \`referral_transaction_links\` rtl
      WHERE rtl.\`transactionId\` = t.\`id\`
    ) `,
    (filters.agentIds?.length ? sql`t.\`agentId\` IN (${sql.join(filters.agentIds.map((id) => sql`${id}`), sql`, `)})` : filters.agentId ? sql`t.\`agentId\` = ${filters.agentId}` : undefined),
    filters.groupLeaderId ? (filters.includeLeaderStats ? sql`(
      t.\`agentId\` = ${filters.groupLeaderId}
      OR EXISTS (
        SELECT 1
        FROM \`group_members\` gm
        INNER JOIN \`groups\` g ON g.id = gm.\`groupId\`
        WHERE gm.\`userId\` = t.\`agentId\` AND g.\`leaderId\` = ${filters.groupLeaderId}
      )
    )` : sql`EXISTS (
      SELECT 1
      FROM \`group_members\` gm
      INNER JOIN \`groups\` g ON g.id = gm.\`groupId\`
      WHERE gm.\`userId\` = t.\`agentId\` AND g.\`leaderId\` = ${filters.groupLeaderId}
    )`) : undefined,
    filters.marketProfileId ? sql`EXISTS (
      SELECT 1 FROM \`users\` market_user
      WHERE market_user.id = t.\`agentId\` AND market_user.\`marketProfileId\` = ${filters.marketProfileId}
    )` : undefined,
    (filters.leadSourceIds?.length ? sql`EXISTS (
      SELECT 1 FROM \`contacts\` source_contact
      WHERE source_contact.id = t.\`primaryContactId\` AND source_contact.\`leadSourceId\` IN (${sql.join(filters.leadSourceIds.map((id) => sql`${id}`), sql`, `)})
    )` : filters.leadSourceId ? sql`EXISTS (
      SELECT 1 FROM \`contacts\` source_contact
      WHERE source_contact.id = t.\`primaryContactId\` AND source_contact.\`leadSourceId\` = ${filters.leadSourceId}
    )` : undefined),
    status && status !== "all" ? sql`t.\`status\` = ${status}` : undefined,
    filters.transactionType && filters.transactionType !== "all" ? sql`t.\`transactionType\` = ${filters.transactionType}` : undefined,
    options.applyDate === false ? undefined : sql`${date} IS NOT NULL`,
    options.applyDate === false || !filters.dateFrom ? undefined : sql`DATE(${date}) >= ${filters.dateFrom}`,
    options.applyDate === false || !filters.dateTo ? undefined : sql`DATE(${date}) <= ${filters.dateTo}`,
  ]);
}

function agentScope(filters: ReportingFilters): SQL {
  return where([
    sql`u.\`role\` = 'agent'`,
    sql`u.\`isActive\` = 1`,
    (filters.agentIds?.length ? sql`u.\`id\` IN (${sql.join(filters.agentIds.map((id) => sql`${id}`), sql`, `)})` : filters.agentId ? sql`u.\`id\` = ${filters.agentId}` : undefined),
    filters.groupLeaderId ? (filters.includeLeaderStats ? sql`(
      u.\`id\` = ${filters.groupLeaderId}
      OR EXISTS (
        SELECT 1
        FROM \`group_members\` gm
        INNER JOIN \`groups\` g ON g.id = gm.\`groupId\`
        WHERE gm.\`userId\` = u.\`id\` AND g.\`leaderId\` = ${filters.groupLeaderId}
      )
    )` : sql`EXISTS (
      SELECT 1
      FROM \`group_members\` gm
      INNER JOIN \`groups\` g ON g.id = gm.\`groupId\`
      WHERE gm.\`userId\` = u.\`id\` AND g.\`leaderId\` = ${filters.groupLeaderId}
    )`) : undefined,
    filters.marketProfileId ? sql`u.\`marketProfileId\` = ${filters.marketProfileId}` : undefined,
  ]);
}

function taskScope(filters: ReportingFilters): SQL {
  return where([
    (filters.agentIds?.length ? sql`tk.\`assignedToId\` IN (${sql.join(filters.agentIds.map((id) => sql`${id}`), sql`, `)})` : filters.agentId ? sql`tk.\`assignedToId\` = ${filters.agentId}` : undefined),
    filters.groupLeaderId ? (filters.includeLeaderStats ? sql`(
      tk.\`assignedToId\` = ${filters.groupLeaderId}
      OR EXISTS (
        SELECT 1
        FROM \`group_members\` gm
        INNER JOIN \`groups\` g ON g.id = gm.\`groupId\`
        WHERE gm.\`userId\` = tk.\`assignedToId\` AND g.\`leaderId\` = ${filters.groupLeaderId}
      )
    )` : sql`EXISTS (
      SELECT 1
      FROM \`group_members\` gm
      INNER JOIN \`groups\` g ON g.id = gm.\`groupId\`
      WHERE gm.\`userId\` = tk.\`assignedToId\` AND g.\`leaderId\` = ${filters.groupLeaderId}
    )`) : undefined,
  ]);
}

function productionSelect(): SQL {
  return sql`
    COUNT(*) AS units,
    SUM(CASE WHEN t.\`status\` = 'closed' THEN 1 ELSE 0 END) AS closings,
    COALESCE(SUM(COALESCE(t.\`purchasePrice\`, 0)), 0) AS volume,
    COALESCE(SUM(COALESCE(t.\`grossCommissionIncome\`, 0)), 0) AS grossCommission,
    COALESCE(SUM(COALESCE(pi.savvyNet, 0)), 0) AS savvyNet,
    AVG(t.\`grossCommissionIncome\`) AS averageGci,
    AVG(t.\`purchasePrice\`) AS averagePurchasePrice,
    AVG(CASE
      WHEN t.\`status\` = 'closed' AND t.\`contractDate\` IS NOT NULL AND t.\`closingDate\` IS NOT NULL
      THEN DATEDIFF(t.\`closingDate\`, t.\`contractDate\`)
      ELSE NULL
    END) AS averageDaysToClose
  `;
}

function toProduction(row?: Row): Production {
  return {
    units: asNumber(row?.units),
    closings: asNumber(row?.closings),
    volume: asNumber(row?.volume),
    grossCommission: asNumber(row?.grossCommission),
    savvyNet: asNumber(row?.savvyNet),
    averageGci: asNullableNumber(row?.averageGci),
    averagePurchasePrice: asNullableNumber(row?.averagePurchasePrice),
    averageDaysToClose: asNullableNumber(row?.averageDaysToClose),
  };
}

function previousPeriod(filters: ReportingFilters): ReportingFilters | null {
  if (!filters.dateFrom || !filters.dateTo) return null;
  const from = new Date(`${filters.dateFrom}T00:00:00.000Z`);
  const to = new Date(`${filters.dateTo}T00:00:00.000Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) return null;
  const days = Math.floor((to.getTime() - from.getTime()) / 86_400_000) + 1;
  const priorTo = new Date(from.getTime() - 86_400_000);
  const priorFrom = new Date(priorTo.getTime() - (days - 1) * 86_400_000);
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

function mapFlagRow(row?: Row) {
  return {
    commissionFlags: asNumber(row?.commissionFlags),
    pastExpectedCloseDate: asNumber(row?.pastExpectedCloseDate),
    noExpectedCloseDate: asNumber(row?.noExpectedCloseDate),
    overdueTasks: asNumber(row?.overdueTasks),
  };
}

async function getOperationalFlags(filters: ReportingFilters) {
  const transactionWhere = transactionScope({ ...filters, status: "all" }, { applyDate: false });
  const currentPipelineWhere = transactionScope({ ...filters, status: "under_contract" }, { applyDate: false, forceStatus: "under_contract" });
  const [commissionRows, pipelineRows, taskRows] = await Promise.all([
    runRows<Row>(sql`
      SELECT SUM(CASE WHEN t.\`payoutIntegrityFlag\` = 1 THEN 1 ELSE 0 END) AS commissionFlags
      FROM \`transactions\` t
      ${transactionWhere}
    `),
    runRows<Row>(sql`
      SELECT
        SUM(CASE WHEN t.\`closingDate\` IS NOT NULL AND DATE(t.\`closingDate\`) < CURRENT_DATE THEN 1 ELSE 0 END) AS pastExpectedCloseDate,
        SUM(CASE WHEN t.\`closingDate\` IS NULL THEN 1 ELSE 0 END) AS noExpectedCloseDate
      FROM \`transactions\` t
      ${currentPipelineWhere}
    `),
    runRows<Row>(sql`
      SELECT COUNT(*) AS overdueTasks
      FROM \`tasks\` tk
      ${taskScope(filters)}
      ${taskScope(filters).queryChunks.length ? sql`AND` : sql`WHERE`}
        tk.\`status\` NOT IN ('completed', 'cancelled')
        AND tk.\`dueDate\` IS NOT NULL
        AND DATE(tk.\`dueDate\`) < CURRENT_DATE
    `),
  ]);
  return mapFlagRow({
    commissionFlags: commissionRows[0]?.commissionFlags,
    pastExpectedCloseDate: pipelineRows[0]?.pastExpectedCloseDate,
    noExpectedCloseDate: pipelineRows[0]?.noExpectedCloseDate,
    overdueTasks: taskRows[0]?.overdueTasks,
  });
}

function hasWhere(scope: SQL): boolean {
  return scope.queryChunks.length > 0;
}

function taskWhereWithOpenOverdue(filters: ReportingFilters): SQL {
  const scope = taskScope(filters);
  return sql`${scope} ${hasWhere(scope) ? sql`AND` : sql`WHERE`}
    tk.\`status\` NOT IN ('completed', 'cancelled')
    AND tk.\`dueDate\` IS NOT NULL
    AND DATE(tk.\`dueDate\`) < CURRENT_DATE`;
}

export async function getReportingFilters() {
  const [agentRows, leaderRows, marketRows, isaRows, leadSourceRows] = await Promise.all([
    runRows<Row>(sql`
      SELECT u.\`id\` AS id, u.\`name\` AS name
      FROM \`users\` u
      WHERE u.\`role\` = 'agent' AND u.\`isActive\` = 1
      ORDER BY COALESCE(u.\`name\`, '') ASC
    `),
    runRows<Row>(sql`
      SELECT
        g.\`leaderId\` AS id,
        u.\`name\` AS name,
        GROUP_CONCAT(g.\`name\` ORDER BY g.\`name\` SEPARATOR ' · ') AS groupNames,
        COUNT(*) AS groupCount
      FROM \`groups\` g
      INNER JOIN \`users\` u ON u.\`id\` = g.\`leaderId\`
      WHERE g.\`leaderId\` IS NOT NULL
      GROUP BY g.\`leaderId\`, u.\`name\`
      ORDER BY COALESCE(u.\`name\`, '') ASC
    `),
    runRows<Row>(sql`
      SELECT mp.id AS id, mp.name AS name, mp.state AS state, mp.status AS status
      FROM \`market_profiles\` mp
      ORDER BY mp.name ASC
    `),
    runRows<Row>(sql`
      SELECT u.id AS id, u.name AS name
      FROM \`users\` u
      WHERE u.\`role\` = 'isa' AND u.\`isActive\` = 1
      ORDER BY COALESCE(u.name, '') ASC
    `),
    runRows<Row>(sql`
      SELECT ls.id AS id, ls.name AS name, ls.\`campaignType\` AS campaignType, ls.\`parentId\` AS parentId
      FROM \`lead_sources\` ls
      WHERE ls.\`isActive\` = 1
      ORDER BY COALESCE(ls.name, '') ASC
    `),
  ]);

  return {
    agents: agentRows.map((row) => ({ id: asNumber(row.id), name: String(row.name ?? "Unknown") })),
    groupLeaders: leaderRows.map((row) => ({
      id: asNumber(row.id),
      name: String(row.name ?? "Unknown"),
      groupNames: String(row.groupNames ?? ""),
      groupCount: asNumber(row.groupCount),
    })),
    markets: marketRows.map((row) => ({
      id: asNumber(row.id),
      name: String(row.name ?? "Unknown market"),
      state: String(row.state ?? ""),
      status: String(row.status ?? "active"),
    })),
    isas: isaRows.map((row) => ({ id: asNumber(row.id), name: String(row.name ?? "Unknown") })),
    leadSources: leadSourceRows.map((row) => ({
      id: asNumber(row.id),
      name: String(row.name ?? "Unknown source"),
      campaignType: String(row.campaignType ?? "general"),
      parentId: asNullableNumber(row.parentId),
    })),
  };
}

function referralScope(
  filters: ReportingFilters,
  options: { dateColumn?: SQL; applyDate?: boolean } = {},
): SQL {
  const date = options.dateColumn ?? sql`r.\`referralSentAt\``;
  return where([
    filters.agentId ? sql`r.\`relationshipOwnerId\` = ${filters.agentId}` : undefined,
    filters.leadSourceId ? sql`c.\`leadSourceId\` = ${filters.leadSourceId}` : undefined,
    options.applyDate === false ? undefined : sql`${date} IS NOT NULL`,
    options.applyDate === false || !filters.dateFrom ? undefined : sql`DATE(${date}) >= ${filters.dateFrom}`,
    options.applyDate === false || !filters.dateTo ? undefined : sql`DATE(${date}) <= ${filters.dateTo}`,
  ]);
}

export async function getReferralReport(filters: ReportingFilters = {}) {
  const sentScope = referralScope(filters);
  const closedScope = referralScope(filters, { dateColumn: sql`r.\`closedAt\`` });
  const liveScope = referralScope(filters, { applyDate: false });
  const paymentScope = referralScope(filters, { applyDate: false });

  const [sentRows, closedRows, liveRows, paymentRows, statusRows, evidenceRows] = await Promise.all([
    runRows<Row>(sql`
      SELECT
        COUNT(*) AS sent,
        SUM(CASE WHEN r.\`statusCategory\` = 'active' THEN 1 ELSE 0 END) AS activeFromPeriod,
        SUM(CASE WHEN r.\`statusCategory\` = 'closed' THEN 1 ELSE 0 END) AS closedFromPeriod,
        SUM(CASE WHEN r.\`statusCategory\` = 'lost' THEN 1 ELSE 0 END) AS lostFromPeriod
      FROM \`referrals\` r
      LEFT JOIN \`contacts\` c ON c.\`id\` = r.\`contactId\`
      ${sentScope}
    `),
    runRows<Row>(sql`
      SELECT
        COUNT(*) AS closed,
        COALESCE(SUM(CASE WHEN r.\`referralType\` = 'buyer' THEN 1 ELSE 0 END), 0) AS buyerClosings,
        COALESCE(SUM(CASE WHEN r.\`referralType\` = 'seller' THEN 1 ELSE 0 END), 0) AS sellerClosings
      FROM \`referrals\` r
      LEFT JOIN \`contacts\` c ON c.\`id\` = r.\`contactId\`
      ${closedScope} ${hasWhere(closedScope) ? sql`AND` : sql`WHERE`} r.\`statusCategory\` = 'closed'
    `),
    runRows<Row>(sql`
      SELECT
        COUNT(*) AS active,
        SUM(CASE WHEN r.\`statusKey\` = 'under_contract' THEN 1 ELSE 0 END) AS underContract,
        SUM(CASE WHEN r.\`statusCategory\` = 'on_hold' THEN 1 ELSE 0 END) AS onHold
      FROM \`referrals\` r
      LEFT JOIN \`contacts\` c ON c.\`id\` = r.\`contactId\`
      ${liveScope} ${hasWhere(liveScope) ? sql`AND` : sql`WHERE`} r.\`statusCategory\` = 'active'
    `),
    runRows<Row>(sql`
      SELECT
        COALESCE(SUM(COALESCE(rp.\`referralFeeOwed\`, 0)), 0) AS expectedFee,
        COALESCE(SUM(CASE WHEN rp.\`paymentStatus\` = 'paid' AND rp.\`paidAt\` IS NOT NULL
          ${filters.dateFrom ? sql`AND DATE(rp.\`paidAt\`) >= ${filters.dateFrom}` : sql``}
          ${filters.dateTo ? sql`AND DATE(rp.\`paidAt\`) <= ${filters.dateTo}` : sql``}
          THEN COALESCE(rp.\`referralFeeOwed\`, 0) ELSE 0 END), 0) AS paidFee,
        COALESCE(SUM(CASE WHEN rp.\`paymentStatus\` NOT IN ('paid', 'written_off') THEN COALESCE(rp.\`referralFeeOwed\`, 0) ELSE 0 END), 0) AS outstandingFee
      FROM \`referral_payments\` rp
      INNER JOIN \`referrals\` r ON r.\`id\` = rp.\`referralId\`
      LEFT JOIN \`contacts\` c ON c.\`id\` = r.\`contactId\`
      ${paymentScope}
    `),
    runRows<Row>(sql`
      SELECT
        r.\`statusCategory\` AS statusCategory,
        r.\`statusKey\` AS statusKey,
        COALESCE(so.\`name\`, r.\`statusKey\`) AS statusName,
        COUNT(*) AS count
      FROM \`referrals\` r
      LEFT JOIN \`contacts\` c ON c.\`id\` = r.\`contactId\`
      LEFT JOIN \`referral_status_options\` so ON so.\`key\` = r.\`statusKey\`
      ${liveScope}
      GROUP BY r.\`statusCategory\`, r.\`statusKey\`, so.\`name\`
      ORDER BY FIELD(r.\`statusCategory\`, 'active', 'on_hold', 'closed', 'lost'), r.\`statusKey\`
    `),
    runRows<Row>(sql`
      SELECT
        r.\`id\` AS referralId,
        CONCAT_WS(' ', c.\`firstName\`, c.\`lastName\`) AS contactName,
        ra.\`name\` AS referralAgentName,
        ra.\`brokerage\` AS brokerage,
        r.\`referralType\` AS referralType,
        r.\`statusCategory\` AS statusCategory,
        r.\`statusKey\` AS statusKey,
        COALESCE(so.\`name\`, r.\`statusKey\`) AS statusName,
        r.\`market\` AS market,
        r.\`state\` AS state,
        r.\`referralSentAt\` AS referralSentAt,
        r.\`underContractAt\` AS underContractAt,
        r.\`closedAt\` AS closedAt,
        COALESCE(pay.expectedFee, 0) AS expectedFee,
        COALESCE(pay.paidFee, 0) AS paidFee,
        COALESCE(pay.outstandingFee, 0) AS outstandingFee
      FROM \`referrals\` r
      INNER JOIN \`contacts\` c ON c.\`id\` = r.\`contactId\`
      INNER JOIN \`referral_agents\` ra ON ra.\`id\` = r.\`referralAgentId\`
      LEFT JOIN \`referral_status_options\` so ON so.\`key\` = r.\`statusKey\`
      LEFT JOIN (
        SELECT
          rp.\`referralId\` AS referralId,
          SUM(COALESCE(rp.\`referralFeeOwed\`, 0)) AS expectedFee,
          SUM(CASE WHEN rp.\`paymentStatus\` = 'paid' THEN COALESCE(rp.\`referralFeeOwed\`, 0) ELSE 0 END) AS paidFee,
          SUM(CASE WHEN rp.\`paymentStatus\` NOT IN ('paid', 'written_off') THEN COALESCE(rp.\`referralFeeOwed\`, 0) ELSE 0 END) AS outstandingFee
        FROM \`referral_payments\` rp
        GROUP BY rp.\`referralId\`
      ) pay ON pay.referralId = r.\`id\`
      ${sentScope}
      ORDER BY r.\`referralSentAt\` DESC, r.\`updatedAt\` DESC
      LIMIT 100
    `),
  ]);

  const sent = sentRows[0] ?? {};
  const closed = closedRows[0] ?? {};
  const live = liveRows[0] ?? {};
  const payments = paymentRows[0] ?? {};
  const resolved = asNumber(closed.closed) + asNumber(sent.lostFromPeriod);

  return {
    filters: { dateFrom: filters.dateFrom ?? null, dateTo: filters.dateTo ?? null, agentId: filters.agentId ?? null, leadSourceId: filters.leadSourceId ?? null },
    summary: {
      sent: asNumber(sent.sent),
      closed: asNumber(closed.closed),
      active: asNumber(live.active),
      underContract: asNumber(live.underContract),
      onHold: asNumber(live.onHold),
      expectedFee: asNumber(payments.expectedFee),
      paidFee: asNumber(payments.paidFee),
      outstandingFee: asNumber(payments.outstandingFee),
      closeRate: resolved ? (asNumber(closed.closed) / resolved) * 100 : null,
      buyerClosings: asNumber(closed.buyerClosings),
      sellerClosings: asNumber(closed.sellerClosings),
    },
    statuses: statusRows.map((row) => ({ statusCategory: String(row.statusCategory ?? 'active'), statusKey: String(row.statusKey ?? ''), statusName: String(row.statusName ?? 'Unknown'), count: asNumber(row.count) })),
    referrals: evidenceRows.map((row) => ({
      referralId: asNumber(row.referralId), contactName: String(row.contactName ?? 'Unknown contact'), referralAgentName: String(row.referralAgentName ?? 'Unassigned'), brokerage: String(row.brokerage ?? ''), referralType: String(row.referralType ?? 'other'), statusCategory: String(row.statusCategory ?? 'active'), statusKey: String(row.statusKey ?? ''), statusName: String(row.statusName ?? 'Unknown'), market: String(row.market ?? ''), state: String(row.state ?? ''), referralSentAt: asDay(row.referralSentAt), underContractAt: asDay(row.underContractAt), closedAt: asDay(row.closedAt), expectedFee: asNumber(row.expectedFee), paidFee: asNumber(row.paidFee), outstandingFee: asNumber(row.outstandingFee),
    })),
  };
}

export async function getAgentReport(filters: ReportingFilters = {}) {
  const closedFilters: ReportingFilters = { ...filters, status: "closed", dateBasis: "closing" };
  const closedWhere = transactionScope(closedFilters, { forceStatus: "closed" });
  const priorFilters = previousPeriod(closedFilters);
  const priorWhere = priorFilters ? transactionScope(priorFilters, { forceStatus: "closed" }) : null;
  const periodDate = dateColumn(closedFilters);
  const underContractScope = transactionScope({ ...filters, status: "under_contract" }, { applyDate: false, forceStatus: "under_contract" });

  const [productionRows, priorRows, representationRows, flagSummary, monthlyRows, underContractMonthlyRows, agentRows, flaggedTransactions, overdueTasks] = await Promise.all([
    runRows<Row>(sql`SELECT ${productionSelect()} FROM \`transactions\` t ${PAYOUT_JOIN} ${closedWhere}`),
    priorWhere ? runRows<Row>(sql`SELECT ${productionSelect()} FROM \`transactions\` t ${PAYOUT_JOIN} ${priorWhere}`) : Promise.resolve([]),
    runRows<Row>(sql`
      SELECT
        t.\`transactionType\` AS transactionType,
        COUNT(*) AS units,
        AVG(t.\`purchasePrice\`) AS averagePurchasePrice,
        AVG(t.\`grossCommissionIncome\`) AS averageGci,
        SUM(CASE WHEN t.\`commissionType\` = 'percentage' AND t.\`commissionRate\` IS NOT NULL THEN 1 ELSE 0 END) AS commissionRateUnits,
        AVG(CASE WHEN t.\`commissionType\` = 'percentage' AND t.\`commissionRate\` IS NOT NULL THEN t.\`commissionRate\` * 100 ELSE NULL END) AS averageCommissionRate
      FROM \`transactions\` t
      ${closedWhere}
      AND t.\`transactionType\` IN ('buyer', 'seller')
      GROUP BY t.\`transactionType\`
    `),
    getOperationalFlags(filters),
    runRows<Row>(sql`
      SELECT
        DATE_FORMAT(${periodDate}, '%Y-%m') AS month,
        COUNT(*) AS closings,
        COALESCE(SUM(COALESCE(t.\`purchasePrice\`, 0)), 0) AS volume,
        COALESCE(SUM(COALESCE(t.\`grossCommissionIncome\`, 0)), 0) AS grossCommission,
        COALESCE(SUM(COALESCE(pi.savvyNet, 0)), 0) AS savvyNet
      FROM \`transactions\` t
      ${PAYOUT_JOIN}
      ${closedWhere}
      GROUP BY DATE_FORMAT(${periodDate}, '%Y-%m')
      ORDER BY month ASC
    `),
    runRows<Row>(sql`
      SELECT
        DATE_FORMAT(COALESCE(t.\`closingDate\`, t.\`contractDate\`, t.\`createdAt\`), '%Y-%m') AS month,
        COUNT(*) AS underContract,
        COALESCE(SUM(COALESCE(t.\`purchasePrice\`, 0)), 0) AS futureVolume,
        COALESCE(SUM(COALESCE(t.\`grossCommissionIncome\`, 0)), 0) AS futureGci,
        COALESCE(SUM(COALESCE(pi.savvyNet, 0)), 0) AS futureSavvyNet
      FROM \`transactions\` t
      ${PAYOUT_JOIN}
      ${underContractScope}
      GROUP BY DATE_FORMAT(COALESCE(t.\`closingDate\`, t.\`contractDate\`, t.\`createdAt\`), '%Y-%m')
      ORDER BY month ASC
    `),
    runRows<Row>(sql`
      SELECT
        u.\`id\` AS agentId,
        u.\`name\` AS agentName,
        COALESCE(p.closings, 0) AS closings,
        COALESCE(p.volume, 0) AS volume,
        COALESCE(p.grossCommission, 0) AS grossCommission,
        COALESCE(p.savvyNet, 0) AS savvyNet,
        p.averageGci AS averageGci,
        COALESCE(openTx.underContract, 0) AS underContract,
        COALESCE(openTx.commissionFlags, 0) AS commissionFlags,
        COALESCE(openTx.pastExpectedCloseDate, 0) AS pastExpectedCloseDate,
        COALESCE(openTx.noExpectedCloseDate, 0) AS noExpectedCloseDate,
        COALESCE(overdue.overdueTasks, 0) AS overdueTasks
      FROM \`users\` u
      LEFT JOIN (
        SELECT
          t.\`agentId\` AS agentId,
          COUNT(*) AS closings,
          COALESCE(SUM(COALESCE(t.\`purchasePrice\`, 0)), 0) AS volume,
          COALESCE(SUM(COALESCE(t.\`grossCommissionIncome\`, 0)), 0) AS grossCommission,
          COALESCE(SUM(COALESCE(pi.savvyNet, 0)), 0) AS savvyNet,
          AVG(t.\`grossCommissionIncome\`) AS averageGci
        FROM \`transactions\` t
        ${PAYOUT_JOIN}
        ${closedWhere}
        GROUP BY t.\`agentId\`
      ) p ON p.agentId = u.\`id\`
      LEFT JOIN (
        SELECT
          t.\`agentId\` AS agentId,
          SUM(CASE WHEN t.\`status\` = 'under_contract' THEN 1 ELSE 0 END) AS underContract,
          SUM(CASE WHEN t.\`payoutIntegrityFlag\` = 1 THEN 1 ELSE 0 END) AS commissionFlags,
          SUM(CASE WHEN t.\`status\` = 'under_contract' AND t.\`closingDate\` IS NOT NULL AND DATE(t.\`closingDate\`) < CURRENT_DATE THEN 1 ELSE 0 END) AS pastExpectedCloseDate,
          SUM(CASE WHEN t.\`status\` = 'under_contract' AND t.\`closingDate\` IS NULL THEN 1 ELSE 0 END) AS noExpectedCloseDate
        FROM \`transactions\` t
        ${transactionScope({ ...filters, status: "all" }, { applyDate: false })}
        GROUP BY t.\`agentId\`
      ) openTx ON openTx.agentId = u.\`id\`
      LEFT JOIN (
        SELECT tk.\`assignedToId\` AS agentId, COUNT(*) AS overdueTasks
        FROM \`tasks\` tk
        ${taskWhereWithOpenOverdue(filters)}
        GROUP BY tk.\`assignedToId\`
      ) overdue ON overdue.agentId = u.\`id\`
      ${agentScope(filters)}
      ORDER BY COALESCE(p.grossCommission, 0) DESC, COALESCE(u.\`name\`, '') ASC
    `),
    runRows<Row>(sql`
      SELECT
        t.\`id\` AS transactionId,
        t.\`status\` AS status,
        t.\`transactionType\` AS transactionType,
        t.\`closingDate\` AS closingDate,
        t.\`purchasePrice\` AS volume,
        t.\`grossCommissionIncome\` AS grossCommission,
        t.\`payoutIntegrityFlag\` AS commissionFlag,
        u.\`id\` AS agentId,
        u.\`name\` AS agentName,
        CONCAT_WS(' ', c.\`firstName\`, c.\`lastName\`) AS contactName,
        p.\`address\` AS propertyAddress,
        CASE
          WHEN t.\`status\` = 'under_contract' AND t.\`closingDate\` IS NULL THEN 'Missing expected close date'
          WHEN t.\`status\` = 'under_contract' AND DATE(t.\`closingDate\`) < CURRENT_DATE THEN 'Past expected close date'
          WHEN t.\`payoutIntegrityFlag\` = 1 THEN 'Commission review flag'
          ELSE 'Review'
        END AS flagLabel
      FROM \`transactions\` t
      LEFT JOIN \`users\` u ON u.\`id\` = t.\`agentId\`
      LEFT JOIN \`contacts\` c ON c.\`id\` = t.\`primaryContactId\`
      LEFT JOIN \`properties\` p ON p.\`id\` = t.\`propertyId\`
      ${transactionScope({ ...filters, status: "all" }, { applyDate: false })}
      ${transactionScope({ ...filters, status: "all" }, { applyDate: false }).queryChunks.length ? sql`AND` : sql`WHERE`}
      (
        t.\`payoutIntegrityFlag\` = 1
        OR (t.\`status\` = 'under_contract' AND t.\`closingDate\` IS NULL)
        OR (t.\`status\` = 'under_contract' AND t.\`closingDate\` IS NOT NULL AND DATE(t.\`closingDate\`) < CURRENT_DATE)
      )
      ORDER BY
        CASE WHEN t.\`status\` = 'under_contract' AND t.\`closingDate\` IS NOT NULL AND DATE(t.\`closingDate\`) < CURRENT_DATE THEN 0 ELSE 1 END,
        t.\`closingDate\` ASC,
        t.\`updatedAt\` DESC
      LIMIT 24
    `),
    runRows<Row>(sql`
      SELECT
        tk.\`id\` AS taskId,
        tk.\`title\` AS title,
        tk.\`priority\` AS priority,
        tk.\`dueDate\` AS dueDate,
        u.\`id\` AS agentId,
        u.\`name\` AS agentName,
        tk.\`relatedTransactionId\` AS transactionId
      FROM \`tasks\` tk
      LEFT JOIN \`users\` u ON u.\`id\` = tk.\`assignedToId\`
      ${taskWhereWithOpenOverdue(filters)}
      ORDER BY tk.\`dueDate\` ASC, FIELD(tk.\`priority\`, 'urgent', 'high', 'medium', 'low')
      LIMIT 24
    `),
  ]);

  const production = toProduction(productionRows[0]);
  const prior = toProduction(priorRows[0]);
  const representationAverages = {
    buyer: { units: 0, averagePurchasePrice: null as number | null, averageGci: null as number | null, commissionRateUnits: 0, averageCommissionRate: null as number | null },
    seller: { units: 0, averagePurchasePrice: null as number | null, averageGci: null as number | null, commissionRateUnits: 0, averageCommissionRate: null as number | null },
  };
  representationRows.forEach((row) => {
    const transactionType = String(row.transactionType ?? "");
    if (transactionType !== "buyer" && transactionType !== "seller") return;
    representationAverages[transactionType] = {
      units: asNumber(row.units),
      averagePurchasePrice: asNullableNumber(row.averagePurchasePrice),
      averageGci: asNullableNumber(row.averageGci),
      commissionRateUnits: asNumber(row.commissionRateUnits),
      averageCommissionRate: asNullableNumber(row.averageCommissionRate),
    };
  });
  const commissionRateUnits = representationAverages.buyer.commissionRateUnits + representationAverages.seller.commissionRateUnits;
  const averageCommissionRate = commissionRateUnits
    ? ((representationAverages.buyer.averageCommissionRate ?? 0) * representationAverages.buyer.commissionRateUnits
      + (representationAverages.seller.averageCommissionRate ?? 0) * representationAverages.seller.commissionRateUnits) / commissionRateUnits
    : null;

  return {
    filters: {
      dateFrom: filters.dateFrom ?? null,
      dateTo: filters.dateTo ?? null,
      agentId: filters.agentId ?? null,
      groupLeaderId: filters.groupLeaderId ?? null,
      includeLeaderStats: Boolean(filters.includeLeaderStats),
    },
    production,
    prior,
    representationAverages,
    averageCommissionRate,
    change: {
      closings: change(production.closings, prior.closings),
      volume: change(production.volume, prior.volume),
      grossCommission: change(production.grossCommission, prior.grossCommission),
      savvyNet: change(production.savvyNet, prior.savvyNet),
    },
    flags: flagSummary,
    monthly: (() => {
      const monthly = new Map<string, { month: string; closings: number; volume: number; grossCommission: number; savvyNet: number; underContract: number; futureVolume: number; futureGci: number; futureSavvyNet: number }>();
      monthlyRows.forEach((row) => {
        const month = String(row.month ?? "");
        monthly.set(month, { month, closings: asNumber(row.closings), volume: asNumber(row.volume), grossCommission: asNumber(row.grossCommission), savvyNet: asNumber(row.savvyNet), underContract: 0, futureVolume: 0, futureGci: 0, futureSavvyNet: 0 });
      });
      underContractMonthlyRows.forEach((row) => {
        const month = String(row.month ?? "");
        const current = monthly.get(month) ?? { month, closings: 0, volume: 0, grossCommission: 0, savvyNet: 0, underContract: 0, futureVolume: 0, futureGci: 0, futureSavvyNet: 0 };
        monthly.set(month, { ...current, underContract: asNumber(row.underContract), futureVolume: asNumber(row.futureVolume), futureGci: asNumber(row.futureGci), futureSavvyNet: asNumber(row.futureSavvyNet) });
      });
      return Array.from(monthly.values()).sort((left, right) => left.month.localeCompare(right.month));
    })(),
    agents: agentRows.map((row) => ({
      agentId: asNumber(row.agentId),
      agentName: String(row.agentName ?? "Unknown"),
      closings: asNumber(row.closings),
      volume: asNumber(row.volume),
      grossCommission: asNumber(row.grossCommission),
      savvyNet: asNumber(row.savvyNet),
      averageGci: asNullableNumber(row.averageGci),
      underContract: asNumber(row.underContract),
      commissionFlags: asNumber(row.commissionFlags),
      pastExpectedCloseDate: asNumber(row.pastExpectedCloseDate),
      noExpectedCloseDate: asNumber(row.noExpectedCloseDate),
      overdueTasks: asNumber(row.overdueTasks),
    })),
    flaggedTransactions: flaggedTransactions.map((row) => ({
      transactionId: asNumber(row.transactionId),
      status: String(row.status ?? ""),
      transactionType: String(row.transactionType ?? ""),
      closingDate: asDay(row.closingDate),
      volume: asNumber(row.volume),
      grossCommission: asNumber(row.grossCommission),
      commissionFlag: Boolean(asNumber(row.commissionFlag)),
      agentId: asNumber(row.agentId),
      agentName: String(row.agentName ?? "Unknown"),
      contactName: String(row.contactName ?? "Unknown client"),
      propertyAddress: row.propertyAddress ? String(row.propertyAddress) : null,
      flagLabel: String(row.flagLabel ?? "Review"),
    })),
    overdueTasks: overdueTasks.map((row) => ({
      taskId: asNumber(row.taskId),
      title: String(row.title ?? "Untitled task"),
      priority: String(row.priority ?? "medium"),
      dueDate: asDay(row.dueDate),
      agentId: asNumber(row.agentId),
      agentName: String(row.agentName ?? "Unassigned"),
      transactionId: asNullableNumber(row.transactionId),
    })),
  };
}

export async function getGroupLeaderReport(filters: ReportingFilters = {}) {
  const reportFilters: ReportingFilters = { ...filters, agentId: undefined };
  const [agentReport, groupRows] = await Promise.all([
    getAgentReport(reportFilters),
    runRows<Row>(sql`
      SELECT
        g.\`id\` AS groupId,
        g.\`name\` AS groupName,
        g.\`leaderId\` AS leaderId,
        u.\`name\` AS leaderName,
        COUNT(DISTINCT gm.\`userId\`) AS memberCount
      FROM \`groups\` g
      LEFT JOIN \`users\` u ON u.\`id\` = g.\`leaderId\`
      LEFT JOIN \`group_members\` gm ON gm.\`groupId\` = g.\`id\`
      ${filters.groupLeaderId ? sql`WHERE g.\`leaderId\` = ${filters.groupLeaderId}` : sql``}
      GROUP BY g.\`id\`, g.\`name\`, g.\`leaderId\`, u.\`name\`
      ORDER BY g.\`name\` ASC
    `),
  ]);

  const coaching = agentReport.agents
    .map((agent) => {
      const issues: string[] = [];
      if (agent.pastExpectedCloseDate) issues.push(`${agent.pastExpectedCloseDate} past expected close date${agent.pastExpectedCloseDate === 1 ? "" : "s"}`);
      if (agent.noExpectedCloseDate) issues.push(`${agent.noExpectedCloseDate} missing expected close date${agent.noExpectedCloseDate === 1 ? "" : "s"}`);
      if (agent.commissionFlags) issues.push(`${agent.commissionFlags} commission review flag${agent.commissionFlags === 1 ? "" : "s"}`);
      if (agent.overdueTasks) issues.push(`${agent.overdueTasks} overdue task${agent.overdueTasks === 1 ? "" : "s"}`);
      if (agent.closings === 0) issues.push("no closed production in the selected period");
      return {
        ...agent,
        priority: issues.length >= 3 ? "high" : issues.length ? "medium" : "healthy",
        prompt: issues.length ? `Discuss ${issues.join(", ")}.` : "Recognize current production and confirm the next pipeline milestone.",
        issues,
      };
    })
    .sort((a, b) => {
      const score = (agent: typeof a) => agent.pastExpectedCloseDate * 8 + agent.commissionFlags * 5 + agent.noExpectedCloseDate * 4 + agent.overdueTasks * 2 + (agent.closings === 0 ? 1 : 0);
      return score(b) - score(a) || b.grossCommission - a.grossCommission;
    });

  return {
    ...agentReport,
    groups: groupRows.map((row) => ({
      groupId: asNumber(row.groupId),
      groupName: String(row.groupName ?? "Unnamed group"),
      leaderId: asNullableNumber(row.leaderId),
      leaderName: String(row.leaderName ?? "Unassigned"),
      memberCount: asNumber(row.memberCount),
    })),
    coaching,
  };
}

export async function getTransactionStatisticsReport(filters: ReportingFilters = {}) {
  const resolvedFilters: ReportingFilters = {
    ...filters,
    dateBasis: filters.dateBasis ?? "closing",
    status: filters.status ?? "all",
    transactionType: filters.transactionType ?? "all",
  };
  const scope = transactionScope(resolvedFilters);
  // Closed and terminated outcomes are performance events in the selected period.
  // Under-contract inventory is a current pipeline snapshot and must not be reduced
  // by the report's historical closing/contract date range.
  const periodOutcomeScope = withCondition(scope, sql`t.\`status\` IN ('closed', 'terminated')`);
  const pipelineScope = transactionScope({ ...resolvedFilters, status: "under_contract" }, { applyDate: false, forceStatus: "under_contract" });
  const monthlyPerformanceStatus = resolvedFilters.status === "terminated" ? "terminated" : "closed";
  const monthlyPerformanceScope = transactionScope({ ...resolvedFilters, status: monthlyPerformanceStatus }, { forceStatus: monthlyPerformanceStatus });
  const priorFilters = previousPeriod(resolvedFilters);
  const priorScope = priorFilters ? transactionScope(priorFilters) : null;
  const date = dateColumn(resolvedFilters);
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(100, Math.max(10, filters.limit ?? 25));
  const offset = (page - 1) * limit;

  const [summaryRows, priorRows, statusRows, pipelineRows, periodRepresentationRows, pipelineRepresentationRows, typeRows, monthlyRows, underContractMonthlyRows, agentOutcomeRows, flagsRows, evidenceRows, countRows] = await Promise.all([
    runRows<Row>(sql`SELECT ${productionSelect()} FROM \`transactions\` t ${PAYOUT_JOIN} ${scope}`),
    priorScope ? runRows<Row>(sql`SELECT ${productionSelect()} FROM \`transactions\` t ${PAYOUT_JOIN} ${priorScope}`) : Promise.resolve([]),
    runRows<Row>(sql`
      SELECT t.\`status\` AS status, COUNT(*) AS units,
        COALESCE(SUM(COALESCE(t.\`purchasePrice\`, 0)), 0) AS volume,
        COALESCE(SUM(COALESCE(t.\`grossCommissionIncome\`, 0)), 0) AS grossCommission,
        COALESCE(SUM(COALESCE(pi.savvyNet, 0)), 0) AS savvyNet
      FROM \`transactions\` t
      ${PAYOUT_JOIN}
      ${periodOutcomeScope}
      GROUP BY t.\`status\`
      ORDER BY FIELD(t.\`status\`, 'closed', 'terminated')
    `),
    runRows<Row>(sql`SELECT ${productionSelect()} FROM \`transactions\` t ${PAYOUT_JOIN} ${pipelineScope}`),
    runRows<Row>(sql`
      SELECT t.\`status\` AS status, t.\`transactionType\` AS transactionType, COUNT(*) AS units,
        COALESCE(SUM(COALESCE(t.\`grossCommissionIncome\`, 0)), 0) AS grossCommission,
        COALESCE(SUM(COALESCE(pi.savvyNet, 0)), 0) AS savvyNet
      FROM \`transactions\` t
      ${PAYOUT_JOIN}
      ${periodOutcomeScope}
      GROUP BY t.\`status\`, t.\`transactionType\`
      ORDER BY FIELD(t.\`status\`, 'closed', 'terminated'), FIELD(t.\`transactionType\`, 'buyer', 'seller', 'dual')
    `),
    runRows<Row>(sql`
      SELECT 'under_contract' AS status, t.\`transactionType\` AS transactionType, COUNT(*) AS units,
        COALESCE(SUM(COALESCE(t.\`grossCommissionIncome\`, 0)), 0) AS grossCommission,
        COALESCE(SUM(COALESCE(pi.savvyNet, 0)), 0) AS savvyNet
      FROM \`transactions\` t
      ${PAYOUT_JOIN}
      ${pipelineScope}
      GROUP BY t.\`transactionType\`
      ORDER BY FIELD(t.\`transactionType\`, 'buyer', 'seller', 'dual')
    `),
    runRows<Row>(sql`
      SELECT t.\`transactionType\` AS transactionType, COUNT(*) AS units,
        COALESCE(SUM(COALESCE(t.\`purchasePrice\`, 0)), 0) AS volume,
        COALESCE(SUM(COALESCE(t.\`grossCommissionIncome\`, 0)), 0) AS grossCommission,
        COALESCE(SUM(COALESCE(pi.savvyNet, 0)), 0) AS savvyNet
      FROM \`transactions\` t
      ${PAYOUT_JOIN}
      ${scope}
      GROUP BY t.\`transactionType\`
      ORDER BY FIELD(t.\`transactionType\`, 'buyer', 'seller', 'dual')
    `),
    runRows<Row>(sql`
      SELECT
        DATE_FORMAT(${date}, '%Y-%m') AS month,
        COUNT(*) AS units,
        SUM(CASE WHEN t.\`status\` = 'closed' THEN 1 ELSE 0 END) AS closings,
        COALESCE(SUM(COALESCE(t.\`purchasePrice\`, 0)), 0) AS volume,
        COALESCE(SUM(COALESCE(t.\`grossCommissionIncome\`, 0)), 0) AS grossCommission,
        COALESCE(SUM(COALESCE(pi.savvyNet, 0)), 0) AS savvyNet
      FROM \`transactions\` t
      ${PAYOUT_JOIN}
      ${monthlyPerformanceScope}
      GROUP BY DATE_FORMAT(${date}, '%Y-%m')
      ORDER BY month ASC
    `),
    runRows<Row>(sql`
      SELECT
        DATE_FORMAT(COALESCE(t.\`closingDate\`, t.\`contractDate\`, t.\`createdAt\`), '%Y-%m') AS month,
        COUNT(*) AS underContract,
        COALESCE(SUM(COALESCE(t.\`purchasePrice\`, 0)), 0) AS futureVolume,
        COALESCE(SUM(COALESCE(t.\`grossCommissionIncome\`, 0)), 0) AS futureGci,
        COALESCE(SUM(COALESCE(pi.savvyNet, 0)), 0) AS futureSavvyNet
      FROM \`transactions\` t
      ${PAYOUT_JOIN}
      ${pipelineScope}
      GROUP BY DATE_FORMAT(COALESCE(t.\`closingDate\`, t.\`contractDate\`, t.\`createdAt\`), '%Y-%m')
      ORDER BY month ASC
    `),
    runRows<Row>(sql`
      SELECT
        t.\`agentId\` AS agentId,
        COALESCE(u.\`name\`, 'Unassigned') AS agentName,
        COUNT(*) AS units,
        SUM(CASE WHEN t.\`status\` = 'closed' THEN 1 ELSE 0 END) AS closings,
        SUM(CASE WHEN t.\`status\` = 'terminated' THEN 1 ELSE 0 END) AS terminations,
        COALESCE(SUM(COALESCE(t.\`purchasePrice\`, 0)), 0) AS volume,
        COALESCE(SUM(COALESCE(t.\`grossCommissionIncome\`, 0)), 0) AS grossCommission,
        COALESCE(SUM(COALESCE(pi.savvyNet, 0)), 0) AS savvyNet
      FROM \`transactions\` t
      LEFT JOIN \`users\` u ON u.\`id\` = t.\`agentId\`
      ${PAYOUT_JOIN}
      ${periodOutcomeScope}
      GROUP BY t.\`agentId\`, u.\`name\`
      ORDER BY terminations DESC, units DESC, grossCommission DESC, agentName ASC
      LIMIT 100
    `),
    getOperationalFlags(resolvedFilters),
    runRows<Row>(sql`
      SELECT
        t.\`id\` AS transactionId,
        t.\`transactionNumber\` AS transactionNumber,
        t.\`transactionType\` AS transactionType,
        t.\`status\` AS status,
        t.\`contractDate\` AS contractDate,
        t.\`closingDate\` AS closingDate,
        t.\`purchasePrice\` AS volume,
        t.\`grossCommissionIncome\` AS grossCommission,
        COALESCE(pi.savvyNet, 0) AS savvyNet,
        t.\`payoutIntegrityFlag\` AS commissionFlag,
        u.\`id\` AS agentId,
        u.\`name\` AS agentName,
        CONCAT_WS(' ', c.\`firstName\`, c.\`lastName\`) AS contactName,
        p.\`address\` AS propertyAddress,
        CASE WHEN t.\`status\` = 'under_contract' AND t.\`closingDate\` IS NULL THEN 1 ELSE 0 END AS missingExpectedCloseDate,
        CASE WHEN t.\`status\` = 'under_contract' AND t.\`closingDate\` IS NOT NULL AND DATE(t.\`closingDate\`) < CURRENT_DATE THEN 1 ELSE 0 END AS pastExpectedCloseDate
      FROM \`transactions\` t
      LEFT JOIN \`users\` u ON u.\`id\` = t.\`agentId\`
      LEFT JOIN \`contacts\` c ON c.\`id\` = t.\`primaryContactId\`
      LEFT JOIN \`properties\` p ON p.\`id\` = t.\`propertyId\`
      ${PAYOUT_JOIN}
      ${scope}
      ORDER BY ${date} DESC, t.\`updatedAt\` DESC
      LIMIT ${limit} OFFSET ${offset}
    `),
    runRows<Row>(sql`SELECT COUNT(*) AS total FROM \`transactions\` t ${scope}`),
  ]);

  const summary = toProduction(summaryRows[0]);
  const prior = toProduction(priorRows[0]);
  const pipeline = toProduction(pipelineRows[0]);
  const statuses = statusRows.map((row) => ({
    status: String(row.status ?? ""),
    units: asNumber(row.units),
    volume: asNumber(row.volume),
    grossCommission: asNumber(row.grossCommission),
    savvyNet: asNumber(row.savvyNet),
  }));
  const closed = statuses.find((row) => row.status === "closed")?.units ?? 0;
  const terminated = statuses.find((row) => row.status === "terminated")?.units ?? 0;

  return {
    filters: {
      dateFrom: resolvedFilters.dateFrom ?? null,
      dateTo: resolvedFilters.dateTo ?? null,
      dateBasis: resolvedFilters.dateBasis,
      agentId: resolvedFilters.agentId ?? null,
      groupLeaderId: resolvedFilters.groupLeaderId ?? null,
      includeLeaderStats: Boolean(resolvedFilters.includeLeaderStats),
      status: resolvedFilters.status,
      transactionType: resolvedFilters.transactionType,
    },
    summary: {
      ...summary,
      closedUnits: closed,
      terminationRate: resolvedFilters.status === "all" && closed + terminated > 0 ? (terminated / (closed + terminated)) * 100 : null,
      change: {
        units: change(summary.units, prior.units),
        closings: change(summary.closings, prior.closings),
        volume: change(summary.volume, prior.volume),
        grossCommission: change(summary.grossCommission, prior.grossCommission),
        savvyNet: change(summary.savvyNet, prior.savvyNet),
        averageGci: change(Number(summary.averageGci ?? 0), Number(prior.averageGci ?? 0)),
        averageDaysToClose: change(Number(summary.averageDaysToClose ?? 0), Number(prior.averageDaysToClose ?? 0)),
      },
    },
    flags: flagsRows,
    statuses,
    pipeline: {
      units: pipeline.units,
      volume: pipeline.volume,
      grossCommission: pipeline.grossCommission,
      savvyNet: pipeline.savvyNet,
    },
    representationByStatus: [...periodRepresentationRows, ...pipelineRepresentationRows].map((row) => ({
      status: String(row.status ?? ""),
      transactionType: String(row.transactionType ?? ""),
      units: asNumber(row.units),
      grossCommission: asNumber(row.grossCommission),
      savvyNet: asNumber(row.savvyNet),
    })),
    transactionTypes: typeRows.map((row) => ({
      transactionType: String(row.transactionType ?? ""),
      units: asNumber(row.units),
      volume: asNumber(row.volume),
      grossCommission: asNumber(row.grossCommission),
      savvyNet: asNumber(row.savvyNet),
    })),
    monthly: (() => {
      const monthly = new Map<string, { month: string; units: number; closings: number; volume: number; grossCommission: number; savvyNet: number; underContract: number; futureVolume: number; futureGci: number; futureSavvyNet: number }>();
      monthlyRows.forEach((row) => {
        const month = String(row.month ?? "");
        monthly.set(month, { month, units: asNumber(row.units), closings: asNumber(row.closings), volume: asNumber(row.volume), grossCommission: asNumber(row.grossCommission), savvyNet: asNumber(row.savvyNet), underContract: 0, futureVolume: 0, futureGci: 0, futureSavvyNet: 0 });
      });
      underContractMonthlyRows.forEach((row) => {
        const month = String(row.month ?? "");
        const current = monthly.get(month) ?? { month, units: 0, closings: 0, volume: 0, grossCommission: 0, savvyNet: 0, underContract: 0, futureVolume: 0, futureGci: 0, futureSavvyNet: 0 };
        monthly.set(month, { ...current, underContract: asNumber(row.underContract), futureVolume: asNumber(row.futureVolume), futureGci: asNumber(row.futureGci), futureSavvyNet: asNumber(row.futureSavvyNet) });
      });
      return Array.from(monthly.values()).sort((left, right) => left.month.localeCompare(right.month));
    })(),
    agentOutcomes: agentOutcomeRows.map((row) => ({
      agentId: asNullableNumber(row.agentId),
      agentName: String(row.agentName ?? "Unassigned"),
      units: asNumber(row.units),
      closings: asNumber(row.closings),
      terminations: asNumber(row.terminations),
      volume: asNumber(row.volume),
      grossCommission: asNumber(row.grossCommission),
      savvyNet: asNumber(row.savvyNet),
    })),
    evidence: evidenceRows.map((row) => ({
      transactionId: asNumber(row.transactionId),
      transactionNumber: row.transactionNumber ? String(row.transactionNumber) : null,
      transactionType: String(row.transactionType ?? ""),
      status: String(row.status ?? ""),
      contractDate: asDay(row.contractDate),
      closingDate: asDay(row.closingDate),
      volume: asNumber(row.volume),
      grossCommission: asNumber(row.grossCommission),
      savvyNet: asNumber(row.savvyNet),
      commissionFlag: Boolean(asNumber(row.commissionFlag)),
      agentId: asNumber(row.agentId),
      agentName: String(row.agentName ?? "Unknown"),
      contactName: String(row.contactName ?? "Unknown client"),
      propertyAddress: row.propertyAddress ? String(row.propertyAddress) : null,
      missingExpectedCloseDate: Boolean(asNumber(row.missingExpectedCloseDate)),
      pastExpectedCloseDate: Boolean(asNumber(row.pastExpectedCloseDate)),
    })),
    pagination: {
      page,
      limit,
      total: asNumber(countRows[0]?.total),
      totalPages: Math.max(1, Math.ceil(asNumber(countRows[0]?.total) / limit)),
    },
  };
}

const PIPELINE_STAGE_ORDER = ["new_lead", "attempted_contact", "nurture", "active_client", "under_contract", "closed", "dead", "do_not_contact"] as const;

/** Live, agent-owned CRM pipeline health snapshot; date filters are intentionally ignored. */
export async function getPipelineReport(filters: ReportingFilters = {}) {
  const scopedAgents = where([
    sql`u.\`role\` = 'agent'`,
    sql`u.\`isActive\` = 1`,
    filters.agentIds?.length ? sql`u.\`id\` IN (${sql.join(filters.agentIds.map((id) => sql`${id}`), sql`, `)})` : filters.agentId ? sql`u.\`id\` = ${filters.agentId}` : undefined,
  ]);
  const open = sql`ac.\`pipelineStatus\` NOT IN ('closed', 'dead', 'do_not_contact')`;
  const activity = sql`COALESCE(ac.\`agingUpdatedAt\`, ac.\`updatedAt\`)`;
  const [agentRows, stageRows] = await Promise.all([
    runRows<Row>(sql`
      SELECT
        u.\`id\` AS agentId,
        COALESCE(NULLIF(TRIM(u.\`name\`), ''), u.\`email\`, 'Unassigned') AS agentName,
        COUNT(ac.\`id\`) AS total,
        COALESCE(SUM(CASE WHEN ${open} THEN 1 ELSE 0 END), 0) AS openCount,
        COALESCE(SUM(CASE WHEN ac.\`pipelineStatus\` = 'new_lead' THEN 1 ELSE 0 END), 0) AS newLeads,
        COALESCE(SUM(CASE WHEN ac.\`pipelineStatus\` = 'attempted_contact' THEN 1 ELSE 0 END), 0) AS attemptedContact,
        COALESCE(SUM(CASE WHEN ac.\`pipelineStatus\` = 'nurture' THEN 1 ELSE 0 END), 0) AS nurture,
        COALESCE(SUM(CASE WHEN ac.\`pipelineStatus\` = 'active_client' THEN 1 ELSE 0 END), 0) AS activeClient,
        COALESCE(SUM(CASE WHEN ac.\`pipelineStatus\` = 'under_contract' THEN 1 ELSE 0 END), 0) AS underContract,
        COALESCE(SUM(CASE WHEN ac.\`appointmentSet\` = 1 THEN 1 ELSE 0 END), 0) AS appointments,
        COALESCE(SUM(CASE WHEN ${open} AND ac.\`followUpDate\` IS NOT NULL THEN 1 ELSE 0 END), 0) AS scheduledFollowUps,
        COALESCE(SUM(CASE WHEN ${open} AND ac.\`followUpDate\` < CURDATE() THEN 1 ELSE 0 END), 0) AS overdueFollowUps,
        COALESCE(SUM(CASE WHEN ${open} AND DATE(ac.\`followUpDate\`) = CURDATE() THEN 1 ELSE 0 END), 0) AS dueToday,
        COALESCE(SUM(CASE WHEN ${open} AND ac.\`followUpDate\` IS NULL THEN 1 ELSE 0 END), 0) AS missingFollowUps,
        COALESCE(AVG(CASE WHEN ${open} THEN GREATEST(DATEDIFF(NOW(), ${activity}), 0) ELSE NULL END), 0) AS averageAgeDays,
        COALESCE(MAX(CASE WHEN ${open} THEN GREATEST(DATEDIFF(NOW(), ${activity}), 0) ELSE NULL END), 0) AS oldestAgeDays,
        COALESCE(SUM(CASE WHEN ${open} AND DATEDIFF(NOW(), ${activity}) BETWEEN 0 AND 2 THEN 1 ELSE 0 END), 0) AS freshCount,
        COALESCE(SUM(CASE WHEN ${open} AND DATEDIFF(NOW(), ${activity}) BETWEEN 3 AND 6 THEN 1 ELSE 0 END), 0) AS idleCount,
        COALESCE(SUM(CASE WHEN ${open} AND DATEDIFF(NOW(), ${activity}) BETWEEN 7 AND 13 THEN 1 ELSE 0 END), 0) AS staleCount,
        COALESCE(SUM(CASE WHEN ${open} AND DATEDIFF(NOW(), ${activity}) BETWEEN 14 AND 29 THEN 1 ELSE 0 END), 0) AS olderCount,
        COALESCE(SUM(CASE WHEN ${open} AND DATEDIFF(NOW(), ${activity}) >= 30 THEN 1 ELSE 0 END), 0) AS criticalCount,
        MAX(CASE WHEN ${open} THEN ${activity} ELSE NULL END) AS latestActivityAt
      FROM \`users\` u
      LEFT JOIN \`agent_connections\` ac ON ac.\`agentId\` = u.\`id\`
      ${scopedAgents}
      GROUP BY u.\`id\`, u.\`name\`, u.\`email\`
      ORDER BY openCount DESC, overdueFollowUps DESC, agentName ASC
    `),
    runRows<Row>(sql`
      SELECT ac.\`pipelineStatus\` AS stage, COUNT(*) AS count
      FROM \`agent_connections\` ac
      INNER JOIN \`users\` u ON u.\`id\` = ac.\`agentId\`
      ${scopedAgents}
      GROUP BY ac.\`pipelineStatus\`
    `),
  ]);
  const agents = agentRows.map((row) => ({
    agentId: asNumber(row.agentId), agentName: String(row.agentName ?? "Unassigned"), total: asNumber(row.total), openCount: asNumber(row.openCount), newLeads: asNumber(row.newLeads), attemptedContact: asNumber(row.attemptedContact), nurture: asNumber(row.nurture), activeClient: asNumber(row.activeClient), underContract: asNumber(row.underContract), appointments: asNumber(row.appointments), scheduledFollowUps: asNumber(row.scheduledFollowUps), overdueFollowUps: asNumber(row.overdueFollowUps), dueToday: asNumber(row.dueToday), missingFollowUps: asNumber(row.missingFollowUps), averageAgeDays: asNumber(row.averageAgeDays), oldestAgeDays: asNumber(row.oldestAgeDays), freshCount: asNumber(row.freshCount), idleCount: asNumber(row.idleCount), staleCount: asNumber(row.staleCount), olderCount: asNumber(row.olderCount), criticalCount: asNumber(row.criticalCount), latestActivityAt: asDay(row.latestActivityAt),
  }));
  const summary = agents.reduce((total, agent) => ({ total: total.total + agent.total, openCount: total.openCount + agent.openCount, appointments: total.appointments + agent.appointments, scheduledFollowUps: total.scheduledFollowUps + agent.scheduledFollowUps, overdueFollowUps: total.overdueFollowUps + agent.overdueFollowUps, dueToday: total.dueToday + agent.dueToday, missingFollowUps: total.missingFollowUps + agent.missingFollowUps, freshCount: total.freshCount + agent.freshCount, idleCount: total.idleCount + agent.idleCount, staleCount: total.staleCount + agent.staleCount, olderCount: total.olderCount + agent.olderCount, criticalCount: total.criticalCount + agent.criticalCount, totalAgeDays: total.totalAgeDays + (agent.averageAgeDays * agent.openCount) }), { total: 0, openCount: 0, appointments: 0, scheduledFollowUps: 0, overdueFollowUps: 0, dueToday: 0, missingFollowUps: 0, freshCount: 0, idleCount: 0, staleCount: 0, olderCount: 0, criticalCount: 0, totalAgeDays: 0 });
  const stageCounts = new Map(stageRows.map((row) => [String(row.stage), asNumber(row.count)]));
  return { filters: { agentId: filters.agentId ?? null, agentIds: filters.agentIds ?? [] }, summary: { ...summary, averageAgeDays: summary.openCount ? summary.totalAgeDays / summary.openCount : 0, followUpCoverage: summary.openCount ? (summary.scheduledFollowUps / summary.openCount) * 100 : null }, stageDistribution: PIPELINE_STAGE_ORDER.map((stage) => ({ stage, count: stageCounts.get(stage) ?? 0 })), agents };
}

export async function getAgentOnboardingReport(filters: ReportingFilters = {}) {
  return getAgentOnboardingReportingData(filters);
}

export async function getMarketAnalyticsReport(filters: ReportingFilters = {}) {
  return getMarketAnalyticsReportingData(filters);
}

export async function getTasksReport(filters: ReportingFilters = {}) {
  return getTasksReportingData(filters);
}

export async function getIsaActivitiesReport(filters: ReportingFilters = {}) {
  return getIsaActivitiesReportingData(filters);
}

export async function getLeadSourcesReport(filters: ReportingFilters = {}) {
  return getLeadSourcesReportingData(filters);
}
