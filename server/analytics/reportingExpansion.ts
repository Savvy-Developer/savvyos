import { sql, type SQL } from "drizzle-orm";
import { getDb } from "../db";

export type ExpansionFilters = {
  dateFrom?: string;
  dateTo?: string;
  agentId?: number;
  agentIds?: number[];
  groupLeaderId?: number;
  marketProfileId?: number;
  isaId?: number;
  isaIds?: number[];
  leadSourceId?: number;
  leadSourceIds?: number[];
  status?: "all" | "closed" | "under_contract" | "terminated";
  transactionType?: "all" | "buyer" | "seller" | "dual";
  page?: number;
  limit?: number;
};

type Row = Record<string, unknown>;

const PAYOUT_JOIN = sql`
  LEFT JOIN (
    SELECT
      \`transactionId\` AS transactionId,
      COALESCE(SUM(CASE WHEN \`payeeType\` = 'savvy_str_agents' THEN COALESCE(\`amount\`, 0) ELSE 0 END), 0) AS savvyNet
    FROM \`transaction_payout_items\`
    GROUP BY \`transactionId\`
  ) pi ON pi.transactionId = t.id
`;

function asNumber(value: unknown): number {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? result : 0;
}

function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
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

function hasWhere(scope: SQL): boolean {
  return scope.queryChunks.length > 0;
}

function withCondition(scope: SQL, condition: SQL): SQL {
  return hasWhere(scope) ? sql`${scope} AND ${condition}` : sql`WHERE ${condition}`;
}

function pagination(filters: ExpansionFilters) {
  const page = Math.max(1, Math.floor(asNumber(filters.page) || 1));
  const limit = Math.min(500, Math.max(10, Math.floor(asNumber(filters.limit) || 25)));
  return { page, limit, offset: (page - 1) * limit };
}

function paginationResult(page: number, limit: number, total: number) {
  return { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

function onboardingScope(filters: ExpansionFilters): SQL {
  return where([
    (filters.agentIds?.length ? sql`oi.\`agentUserId\` IN (${sql.join(filters.agentIds.map((id) => sql`${id}`), sql`, `)})` : filters.agentId ? sql`oi.\`agentUserId\` = ${filters.agentId}` : undefined),
    filters.groupLeaderId ? sql`EXISTS (
      SELECT 1
      FROM \`group_members\` gm
      INNER JOIN \`groups\` g ON g.id = gm.\`groupId\`
      WHERE gm.\`userId\` = oi.\`agentUserId\` AND g.\`leaderId\` = ${filters.groupLeaderId}
    )` : undefined,
    filters.marketProfileId ? sql`EXISTS (
      SELECT 1 FROM \`users\` onboarding_agent
      WHERE onboarding_agent.id = oi.\`agentUserId\` AND onboarding_agent.\`marketProfileId\` = ${filters.marketProfileId}
    )` : undefined,
    filters.dateFrom ? sql`DATE(oi.\`startedAt\`) >= ${filters.dateFrom}` : undefined,
    filters.dateTo ? sql`DATE(oi.\`startedAt\`) <= ${filters.dateTo}` : undefined,
  ]);
}

function taskPeriodScope(filters: ExpansionFilters): SQL {
  return where([
    (filters.agentIds?.length ? sql`tk.\`assignedToId\` IN (${sql.join(filters.agentIds.map((id) => sql`${id}`), sql`, `)})` : filters.agentId ? sql`tk.\`assignedToId\` = ${filters.agentId}` : undefined),
    filters.groupLeaderId ? sql`EXISTS (
      SELECT 1
      FROM \`group_members\` gm
      INNER JOIN \`groups\` g ON g.id = gm.\`groupId\`
      WHERE gm.\`userId\` = tk.\`assignedToId\` AND g.\`leaderId\` = ${filters.groupLeaderId}
    )` : undefined,
    filters.marketProfileId ? sql`EXISTS (
      SELECT 1 FROM \`users\` task_owner
      WHERE task_owner.id = tk.\`assignedToId\` AND task_owner.\`marketProfileId\` = ${filters.marketProfileId}
    )` : undefined,
    filters.dateFrom ? sql`DATE(tk.\`createdAt\`) >= ${filters.dateFrom}` : undefined,
    filters.dateTo ? sql`DATE(tk.\`createdAt\`) <= ${filters.dateTo}` : undefined,
  ]);
}

function taskOpenScope(filters: ExpansionFilters): SQL {
  const scope = taskPeriodScope(filters);
  return sql`${scope} ${hasWhere(scope) ? sql`AND` : sql`WHERE`}
    tk.\`status\` NOT IN ('completed', 'cancelled')`;
}

function contactScope(filters: ExpansionFilters): SQL {
  return where([
    sql`c.\`archived_at\` IS NULL`,
    (filters.isaIds?.length ? sql`c.\`assignedIsaId\` IN (${sql.join(filters.isaIds.map((id) => sql`${id}`), sql`, `)})` : filters.isaId ? sql`c.\`assignedIsaId\` = ${filters.isaId}` : undefined),
    (filters.leadSourceIds?.length ? sql`c.\`leadSourceId\` IN (${sql.join(filters.leadSourceIds.map((id) => sql`${id}`), sql`, `)})` : filters.leadSourceId ? sql`c.\`leadSourceId\` = ${filters.leadSourceId}` : undefined),
    (filters.agentIds?.length ? sql`EXISTS (
      SELECT 1 FROM \`agent_connections\` ac
      WHERE ac.\`contactId\` = c.id AND ac.\`agentId\` IN (${sql.join(filters.agentIds.map((id) => sql`${id}`), sql`, `)})
    )` : filters.agentId ? sql`EXISTS (
      SELECT 1 FROM \`agent_connections\` ac
      WHERE ac.\`contactId\` = c.id AND ac.\`agentId\` = ${filters.agentId}
    )` : undefined),
    filters.groupLeaderId ? sql`EXISTS (
      SELECT 1
      FROM \`agent_connections\` ac
      INNER JOIN \`group_members\` gm ON gm.\`userId\` = ac.\`agentId\`
      INNER JOIN \`groups\` g ON g.id = gm.\`groupId\`
      WHERE ac.\`contactId\` = c.id AND g.\`leaderId\` = ${filters.groupLeaderId}
    )` : undefined,
    filters.marketProfileId ? sql`EXISTS (
      SELECT 1
      FROM \`agent_connections\` ac
      INNER JOIN \`users\` market_agent ON market_agent.id = ac.\`agentId\`
      WHERE ac.\`contactId\` = c.id AND market_agent.\`marketProfileId\` = ${filters.marketProfileId}
    )` : undefined,
    filters.dateFrom ? sql`DATE(c.\`createdAt\`) >= ${filters.dateFrom}` : undefined,
    filters.dateTo ? sql`DATE(c.\`createdAt\`) <= ${filters.dateTo}` : undefined,
  ]);
}

function sessionScope(filters: ExpansionFilters): SQL {
  return where([
    (filters.isaIds?.length ? sql`ms.\`isaId\` IN (${sql.join(filters.isaIds.map((id) => sql`${id}`), sql`, `)})` : filters.isaId ? sql`ms.\`isaId\` = ${filters.isaId}` : undefined),
    (filters.leadSourceIds?.length ? sql`c.\`leadSourceId\` IN (${sql.join(filters.leadSourceIds.map((id) => sql`${id}`), sql`, `)})` : filters.leadSourceId ? sql`c.\`leadSourceId\` = ${filters.leadSourceId}` : undefined),
    (filters.agentIds?.length ? sql`EXISTS (
      SELECT 1 FROM \`agent_connections\` ac
      WHERE ac.\`contactId\` = c.id AND ac.\`agentId\` IN (${sql.join(filters.agentIds.map((id) => sql`${id}`), sql`, `)})
    )` : filters.agentId ? sql`EXISTS (
      SELECT 1 FROM \`agent_connections\` ac
      WHERE ac.\`contactId\` = c.id AND ac.\`agentId\` = ${filters.agentId}
    )` : undefined),
    filters.groupLeaderId ? sql`EXISTS (
      SELECT 1
      FROM \`agent_connections\` ac
      INNER JOIN \`group_members\` gm ON gm.\`userId\` = ac.\`agentId\`
      INNER JOIN \`groups\` g ON g.id = gm.\`groupId\`
      WHERE ac.\`contactId\` = c.id AND g.\`leaderId\` = ${filters.groupLeaderId}
    )` : undefined,
    filters.marketProfileId ? sql`EXISTS (
      SELECT 1
      FROM \`agent_connections\` ac
      INNER JOIN \`users\` market_agent ON market_agent.id = ac.\`agentId\`
      WHERE ac.\`contactId\` = c.id AND market_agent.\`marketProfileId\` = ${filters.marketProfileId}
    )` : undefined,
    filters.dateFrom ? sql`DATE(ms.\`startedAt\`) >= ${filters.dateFrom}` : undefined,
    filters.dateTo ? sql`DATE(ms.\`startedAt\`) <= ${filters.dateTo}` : undefined,
  ]);
}

function transactionScope(filters: ExpansionFilters, opts: { closedOnly?: boolean; applyDate?: boolean } = {}): SQL {
  const status = opts.closedOnly ? "closed" : filters.status;
  return where([
    (filters.agentIds?.length ? sql`t.\`agentId\` IN (${sql.join(filters.agentIds.map((id) => sql`${id}`), sql`, `)})` : filters.agentId ? sql`t.\`agentId\` = ${filters.agentId}` : undefined),
    filters.groupLeaderId ? sql`EXISTS (
      SELECT 1
      FROM \`group_members\` gm
      INNER JOIN \`groups\` g ON g.id = gm.\`groupId\`
      WHERE gm.\`userId\` = t.\`agentId\` AND g.\`leaderId\` = ${filters.groupLeaderId}
    )` : undefined,
    filters.marketProfileId ? sql`EXISTS (
      SELECT 1 FROM \`users\` market_agent
      WHERE market_agent.id = t.\`agentId\` AND market_agent.\`marketProfileId\` = ${filters.marketProfileId}
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
    opts.applyDate === false ? undefined : sql`t.\`closingDate\` IS NOT NULL`,
    opts.applyDate === false || !filters.dateFrom ? undefined : sql`DATE(t.\`closingDate\`) >= ${filters.dateFrom}`,
    opts.applyDate === false || !filters.dateTo ? undefined : sql`DATE(t.\`closingDate\`) <= ${filters.dateTo}`,
  ]);
}

export async function getAgentOnboardingReportingData(filters: ExpansionFilters = {}) {
  const scope = onboardingScope(filters);
  const { page, limit, offset } = pagination(filters);
  const [summaryRows, monthlyRows, evidenceRows, countRows] = await Promise.all([
    runRows<Row>(sql`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN onboarding.status = 'in_progress' THEN 1 ELSE 0 END) AS inProgress,
        SUM(CASE WHEN onboarding.status = 'completed' THEN 1 ELSE 0 END) AS completed,
        COALESCE(SUM(onboarding.totalTasks), 0) AS totalTasks,
        COALESCE(SUM(onboarding.completedTasks), 0) AS completedTasks,
        COALESCE(SUM(onboarding.overdueTasks), 0) AS overdueTasks,
        SUM(CASE WHEN onboarding.status = 'in_progress' AND onboarding.overdueTasks > 0 THEN 1 ELSE 0 END) AS overdueInstances,
        AVG(CASE WHEN onboarding.completedAt IS NOT NULL THEN DATEDIFF(onboarding.completedAt, onboarding.startedAt) ELSE NULL END) AS averageDaysToComplete
      FROM (
        SELECT
          oi.id,
          oi.\`status\`,
          oi.\`startedAt\`,
          oi.\`completedAt\`,
          COUNT(oit.id) AS totalTasks,
          SUM(CASE WHEN oit.\`completed\` = 1 THEN 1 ELSE 0 END) AS completedTasks,
          SUM(CASE WHEN oit.\`completed\` = 0 AND oit.\`dueDate\` IS NOT NULL AND DATE(oit.\`dueDate\`) < CURRENT_DATE THEN 1 ELSE 0 END) AS overdueTasks
        FROM \`onboarding_instances\` oi
        LEFT JOIN \`onboarding_instance_tasks\` oit ON oit.\`instanceId\` = oi.id
        ${scope}
        GROUP BY oi.id, oi.\`status\`, oi.\`startedAt\`, oi.\`completedAt\`
      ) onboarding
    `),
    runRows<Row>(sql`
      SELECT
        DATE_FORMAT(oi.\`startedAt\`, '%Y-%m') AS month,
        COUNT(*) AS started,
        SUM(CASE WHEN oi.\`status\` = 'completed' THEN 1 ELSE 0 END) AS completed,
        SUM(CASE WHEN COALESCE(task_summary.overdueTasks, 0) > 0 AND oi.\`status\` = 'in_progress' THEN 1 ELSE 0 END) AS atRisk
      FROM \`onboarding_instances\` oi
      LEFT JOIN (
        SELECT instanceId,
          SUM(CASE WHEN completed = 0 AND dueDate IS NOT NULL AND DATE(dueDate) < CURRENT_DATE THEN 1 ELSE 0 END) AS overdueTasks
        FROM \`onboarding_instance_tasks\`
        GROUP BY instanceId
      ) task_summary ON task_summary.instanceId = oi.id
      ${scope}
      GROUP BY DATE_FORMAT(oi.\`startedAt\`, '%Y-%m')
      ORDER BY month ASC
    `),
    runRows<Row>(sql`
      SELECT
        oi.id AS instanceId,
        oi.\`agentUserId\` AS agentId,
        u.\`name\` AS agentName,
        ot.\`name\` AS templateName,
        oi.\`status\` AS status,
        oi.\`startedAt\` AS startedAt,
        oi.\`completedAt\` AS completedAt,
        COUNT(oit.id) AS totalTasks,
        SUM(CASE WHEN oit.\`completed\` = 1 THEN 1 ELSE 0 END) AS completedTasks,
        SUM(CASE WHEN oit.\`completed\` = 0 AND oit.\`dueDate\` IS NOT NULL AND DATE(oit.\`dueDate\`) < CURRENT_DATE THEN 1 ELSE 0 END) AS overdueTasks,
        MIN(CASE WHEN oit.\`completed\` = 0 THEN oit.\`dueDate\` ELSE NULL END) AS nextDueDate
      FROM \`onboarding_instances\` oi
      INNER JOIN \`users\` u ON u.id = oi.\`agentUserId\`
      LEFT JOIN \`onboarding_templates\` ot ON ot.id = oi.\`templateId\`
      LEFT JOIN \`onboarding_instance_tasks\` oit ON oit.\`instanceId\` = oi.id
      ${scope}
      GROUP BY oi.id, oi.\`agentUserId\`, u.\`name\`, ot.\`name\`, oi.\`status\`, oi.\`startedAt\`, oi.\`completedAt\`
      ORDER BY
        CASE WHEN oi.\`status\` = 'in_progress' AND SUM(CASE WHEN oit.\`completed\` = 0 AND oit.\`dueDate\` IS NOT NULL AND DATE(oit.\`dueDate\`) < CURRENT_DATE THEN 1 ELSE 0 END) > 0 THEN 1 ELSE 0 END DESC,
        oi.\`status\` = 'in_progress' DESC,
        overdueTasks DESC,
        oi.\`startedAt\` DESC
      LIMIT ${limit} OFFSET ${offset}
    `),
    runRows<Row>(sql`SELECT COUNT(*) AS total FROM \`onboarding_instances\` oi ${scope}`),
  ]);

  const summary = summaryRows[0] ?? {};
  const totalTasks = asNumber(summary.totalTasks);
  const completedTasks = asNumber(summary.completedTasks);
  const total = asNumber(summary.total);
  return {
    summary: {
      total,
      inProgress: asNumber(summary.inProgress),
      completed: asNumber(summary.completed),
      totalTasks,
      completedTasks,
      completionRate: totalTasks ? (completedTasks / totalTasks) * 100 : null,
      overdueTasks: asNumber(summary.overdueTasks),
      overdueInstances: asNumber(summary.overdueInstances),
      averageDaysToComplete: asNullableNumber(summary.averageDaysToComplete),
    },
    monthly: monthlyRows.map((row) => ({ month: String(row.month ?? ""), started: asNumber(row.started), completed: asNumber(row.completed), atRisk: asNumber(row.atRisk) })),
    instances: evidenceRows.map((row) => {
      const tasks = asNumber(row.totalTasks);
      const completed = asNumber(row.completedTasks);
      return {
        instanceId: asNumber(row.instanceId),
        agentId: asNumber(row.agentId),
        agentName: String(row.agentName ?? "Unknown"),
        templateName: String(row.templateName ?? "Onboarding"),
        status: String(row.status ?? "in_progress"),
        startedAt: asDay(row.startedAt),
        completedAt: asDay(row.completedAt),
        totalTasks: tasks,
        completedTasks: completed,
        progress: tasks ? (completed / tasks) * 100 : 0,
        overdueTasks: asNumber(row.overdueTasks),
        nextDueDate: asDay(row.nextDueDate),
      };
    }),
    pagination: paginationResult(page, limit, asNumber(countRows[0]?.total)),
  };
}

export async function getMarketAnalyticsReportingData(filters: ExpansionFilters = {}) {
  const transactionWhere = transactionScope(filters, { closedOnly: true });
  const pipelineWhere = where([sql`t.\`status\` = 'under_contract'`]);
  const futureTrendWhere = transactionScope({ ...filters, status: "under_contract" }, { applyDate: false });
  const marketScope = where([
    filters.marketProfileId ? sql`mp.id = ${filters.marketProfileId}` : undefined,
    (filters.agentIds?.length ? sql`u.id IN (${sql.join(filters.agentIds.map((id) => sql`${id}`), sql`, `)})` : filters.agentId ? sql`u.id = ${filters.agentId}` : undefined),
    filters.groupLeaderId ? sql`EXISTS (
      SELECT 1
      FROM \`group_members\` gm
      INNER JOIN \`groups\` g ON g.id = gm.\`groupId\`
      WHERE gm.\`userId\` = u.id AND g.\`leaderId\` = ${filters.groupLeaderId}
    )` : undefined,
  ]);
  const [marketRows, monthlyRows, underContractMonthlyRows] = await Promise.all([
    runRows<Row>(sql`
      SELECT
        mp.id AS marketId,
        mp.\`name\` AS marketName,
        mp.\`state\` AS state,
        mp.\`region\` AS region,
        mp.\`status\` AS marketStatus,
        mp.\`annualGciGoal\` AS annualGciGoal,
        COUNT(DISTINCT u.id) AS agentCount,
        GROUP_CONCAT(DISTINCT u.\`name\` ORDER BY u.\`name\` SEPARATOR ', ') AS agentNames,
        COALESCE(SUM(tx.units), 0) AS units,
        COALESCE(SUM(tx.closings), 0) AS closings,
        COALESCE(SUM(pipeline.underContract), 0) AS underContract,
        COALESCE(SUM(pipeline.futureVolume), 0) AS futureVolume,
        COALESCE(SUM(pipeline.futureGci), 0) AS futureGci,
        COALESCE(SUM(tx.volume), 0) AS volume,
        COALESCE(SUM(tx.grossCommission), 0) AS grossCommission,
        COALESCE(SUM(tx.savvyNet), 0) AS savvyNet,
        COALESCE(SUM(tx.buyerClosings), 0) AS buyerClosings,
        COALESCE(SUM(tx.buyerGci), 0) AS buyerGci,
        COALESCE(SUM(tx.sellerClosings), 0) AS sellerClosings,
        COALESCE(SUM(tx.sellerGci), 0) AS sellerGci,
        COALESCE(cap.assignedAgents, 0) AS assignedAgents,
        COALESCE(cap.availableAgents, 0) AS availableAgents,
        COALESCE(cap.currentLeadCount, 0) AS currentLeadCount,
        COALESCE(cap.maxLeadCapacity, 0) AS maxLeadCapacity
      FROM \`market_profiles\` mp
      LEFT JOIN \`users\` u ON u.\`marketProfileId\` = mp.id AND u.\`role\` = 'agent' AND u.\`isActive\` = 1
      LEFT JOIN (
        SELECT
          t.\`agentId\` AS agentId,
          COUNT(*) AS units,
          SUM(CASE WHEN t.\`status\` = 'closed' THEN 1 ELSE 0 END) AS closings,
          COALESCE(SUM(CASE WHEN t.\`status\` = 'closed' THEN COALESCE(t.\`purchasePrice\`, 0) ELSE 0 END), 0) AS volume,
          COALESCE(SUM(CASE WHEN t.\`status\` = 'closed' THEN COALESCE(t.\`grossCommissionIncome\`, 0) ELSE 0 END), 0) AS grossCommission,
          COALESCE(SUM(CASE WHEN t.\`status\` = 'closed' THEN COALESCE(pi.savvyNet, 0) ELSE 0 END), 0) AS savvyNet,
          SUM(CASE WHEN t.\`status\` = 'closed' AND t.\`transactionType\` = 'buyer' THEN 1 ELSE 0 END) AS buyerClosings,
          COALESCE(SUM(CASE WHEN t.\`status\` = 'closed' AND t.\`transactionType\` = 'buyer' THEN COALESCE(t.\`grossCommissionIncome\`, 0) ELSE 0 END), 0) AS buyerGci,
          SUM(CASE WHEN t.\`status\` = 'closed' AND t.\`transactionType\` = 'seller' THEN 1 ELSE 0 END) AS sellerClosings,
          COALESCE(SUM(CASE WHEN t.\`status\` = 'closed' AND t.\`transactionType\` = 'seller' THEN COALESCE(t.\`grossCommissionIncome\`, 0) ELSE 0 END), 0) AS sellerGci
        FROM \`transactions\` t
        ${PAYOUT_JOIN}
        ${transactionWhere}
        GROUP BY t.\`agentId\`
      ) tx ON tx.agentId = u.id
      LEFT JOIN (
        SELECT
          t.\`agentId\` AS agentId,
          COUNT(*) AS underContract,
          COALESCE(SUM(COALESCE(t.\`purchasePrice\`, 0)), 0) AS futureVolume,
          COALESCE(SUM(COALESCE(t.\`grossCommissionIncome\`, 0)), 0) AS futureGci
        FROM \`transactions\` t
        ${pipelineWhere}
        GROUP BY t.\`agentId\`
      ) pipeline ON pipeline.agentId = u.id
      LEFT JOIN (
        SELECT
          \`marketProfileId\` AS marketProfileId,
          COUNT(*) AS assignedAgents,
          SUM(CASE WHEN \`isAvailable\` = 1 THEN 1 ELSE 0 END) AS availableAgents,
          COALESCE(SUM(COALESCE(\`currentLeadCount\`, 0)), 0) AS currentLeadCount,
          COALESCE(SUM(COALESCE(\`maxLeadCapacity\`, 0)), 0) AS maxLeadCapacity
        FROM \`market_agent_assignments\`
        GROUP BY \`marketProfileId\`
      ) cap ON cap.marketProfileId = mp.id
      ${marketScope}
      GROUP BY mp.id, mp.\`name\`, mp.\`state\`, mp.\`region\`, mp.\`status\`, mp.\`annualGciGoal\`, cap.assignedAgents, cap.availableAgents, cap.currentLeadCount, cap.maxLeadCapacity
      ORDER BY grossCommission DESC, mp.\`name\` ASC
    `),
    runRows<Row>(sql`
      SELECT
        DATE_FORMAT(t.\`closingDate\`, '%Y-%m') AS month,
        COUNT(*) AS units,
        SUM(CASE WHEN t.\`status\` = 'closed' THEN 1 ELSE 0 END) AS closings,
        COALESCE(SUM(CASE WHEN t.\`status\` = 'closed' THEN COALESCE(t.\`purchasePrice\`, 0) ELSE 0 END), 0) AS volume,
        COALESCE(SUM(CASE WHEN t.\`status\` = 'closed' THEN COALESCE(t.\`grossCommissionIncome\`, 0) ELSE 0 END), 0) AS grossCommission
      FROM \`transactions\` t
      ${transactionWhere}
      GROUP BY DATE_FORMAT(t.\`closingDate\`, '%Y-%m')
      ORDER BY month ASC
    `),
    runRows<Row>(sql`
      SELECT
        DATE_FORMAT(COALESCE(t.\`closingDate\`, t.\`contractDate\`, t.\`createdAt\`), '%Y-%m') AS month,
        COUNT(*) AS underContract,
        COALESCE(SUM(COALESCE(t.\`purchasePrice\`, 0)), 0) AS futureVolume,
        COALESCE(SUM(COALESCE(t.\`grossCommissionIncome\`, 0)), 0) AS futureGci
      FROM \`transactions\` t
      ${futureTrendWhere}
      GROUP BY DATE_FORMAT(COALESCE(t.\`closingDate\`, t.\`contractDate\`, t.\`createdAt\`), '%Y-%m')
      ORDER BY month ASC
    `),
  ]);

  const markets = marketRows.map((row) => ({
    marketId: asNumber(row.marketId),
    marketName: String(row.marketName ?? "Unknown market"),
    state: String(row.state ?? ""),
    region: String(row.region ?? ""),
    marketStatus: String(row.marketStatus ?? "active"),
    annualGciGoal: asNullableNumber(row.annualGciGoal),
    agentCount: asNumber(row.agentCount),
    agentNames: String(row.agentNames ?? ""),
    units: asNumber(row.units),
    closings: asNumber(row.closings),
    underContract: asNumber(row.underContract),
    futureVolume: asNumber(row.futureVolume),
    futureGci: asNumber(row.futureGci),
    volume: asNumber(row.volume),
    grossCommission: asNumber(row.grossCommission),
    savvyNet: asNumber(row.savvyNet),
    buyerClosings: asNumber(row.buyerClosings),
    buyerGci: asNumber(row.buyerGci),
    sellerClosings: asNumber(row.sellerClosings),
    sellerGci: asNumber(row.sellerGci),
    assignedAgents: asNumber(row.assignedAgents),
    availableAgents: asNumber(row.availableAgents),
    currentLeadCount: asNumber(row.currentLeadCount),
    maxLeadCapacity: asNumber(row.maxLeadCapacity),
  }));
  const summary = markets.reduce((result, market) => ({
    markets: result.markets + 1,
    agents: result.agents + market.agentCount,
    closings: result.closings + market.closings,
    underContract: result.underContract + market.underContract,
    futureVolume: result.futureVolume + market.futureVolume,
    futureGci: result.futureGci + market.futureGci,
    volume: result.volume + market.volume,
    grossCommission: result.grossCommission + market.grossCommission,
    savvyNet: result.savvyNet + market.savvyNet,
    buyerClosings: result.buyerClosings + market.buyerClosings,
    buyerGci: result.buyerGci + market.buyerGci,
    sellerClosings: result.sellerClosings + market.sellerClosings,
    sellerGci: result.sellerGci + market.sellerGci,
    availableAgents: result.availableAgents + market.availableAgents,
    currentLeadCount: result.currentLeadCount + market.currentLeadCount,
    maxLeadCapacity: result.maxLeadCapacity + market.maxLeadCapacity,
  }), { markets: 0, agents: 0, closings: 0, underContract: 0, futureVolume: 0, futureGci: 0, volume: 0, grossCommission: 0, savvyNet: 0, buyerClosings: 0, buyerGci: 0, sellerClosings: 0, sellerGci: 0, availableAgents: 0, currentLeadCount: 0, maxLeadCapacity: 0 });
  return {
    summary: {
      ...summary,
      capacityUtilization: summary.maxLeadCapacity ? (summary.currentLeadCount / summary.maxLeadCapacity) * 100 : null,
      averageBuyerGci: summary.buyerClosings ? summary.buyerGci / summary.buyerClosings : null,
      averageSellerGci: summary.sellerClosings ? summary.sellerGci / summary.sellerClosings : null,
      savvyNetPerDeal: summary.closings ? summary.savvyNet / summary.closings : null,
    },
    monthly: (() => {
      const monthly = new Map<string, { month: string; units: number; closings: number; volume: number; grossCommission: number; underContract: number; futureVolume: number; futureGci: number }>();
      monthlyRows.forEach((row) => {
        const month = String(row.month ?? "");
        monthly.set(month, { month, units: asNumber(row.units), closings: asNumber(row.closings), volume: asNumber(row.volume), grossCommission: asNumber(row.grossCommission), underContract: 0, futureVolume: 0, futureGci: 0 });
      });
      underContractMonthlyRows.forEach((row) => {
        const month = String(row.month ?? "");
        const current = monthly.get(month) ?? { month, units: 0, closings: 0, volume: 0, grossCommission: 0, underContract: 0, futureVolume: 0, futureGci: 0 };
        monthly.set(month, { ...current, underContract: asNumber(row.underContract), futureVolume: asNumber(row.futureVolume), futureGci: asNumber(row.futureGci) });
      });
      return Array.from(monthly.values()).sort((left, right) => left.month.localeCompare(right.month));
    })(),
    markets,
  };
}

export async function getTasksReportingData(filters: ExpansionFilters = {}) {
  const scope = taskPeriodScope(filters);
  const openScope = taskOpenScope(filters);
  const { page, limit, offset } = pagination(filters);
  const [summaryRows, monthlyRows, ownerRows, taskRows, countRows, priorityRows, typeRows] = await Promise.all([
    runRows<Row>(sql`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN tk.\`status\` = 'completed' THEN 1 ELSE 0 END) AS completed,
        SUM(CASE WHEN tk.\`status\` IN ('pending', 'in_progress') THEN 1 ELSE 0 END) AS open,
        SUM(CASE WHEN tk.\`status\` NOT IN ('completed', 'cancelled') AND tk.\`dueDate\` IS NOT NULL AND DATE(tk.\`dueDate\`) < CURRENT_DATE THEN 1 ELSE 0 END) AS overdue,
        SUM(CASE WHEN tk.\`status\` NOT IN ('completed', 'cancelled') AND tk.\`dueDate\` IS NOT NULL AND DATE(tk.\`dueDate\`) = CURRENT_DATE THEN 1 ELSE 0 END) AS dueToday,
        SUM(CASE WHEN tk.\`status\` NOT IN ('completed', 'cancelled') AND tk.\`priority\` = 'urgent' THEN 1 ELSE 0 END) AS urgent,
        SUM(CASE WHEN tk.\`status\` NOT IN ('completed', 'cancelled') AND tk.\`assignedToId\` IS NULL THEN 1 ELSE 0 END) AS unassigned,
        AVG(CASE WHEN tk.\`completedAt\` IS NOT NULL THEN DATEDIFF(tk.\`completedAt\`, tk.\`createdAt\`) ELSE NULL END) AS averageDaysToComplete
      FROM \`tasks\` tk
      ${scope}
    `),
    runRows<Row>(sql`
      SELECT
        DATE_FORMAT(tk.\`createdAt\`, '%Y-%m') AS month,
        COUNT(*) AS created,
        SUM(CASE WHEN tk.\`status\` = 'completed' THEN 1 ELSE 0 END) AS completed,
        SUM(CASE WHEN tk.\`status\` NOT IN ('completed', 'cancelled') AND tk.\`dueDate\` IS NOT NULL AND DATE(tk.\`dueDate\`) < CURRENT_DATE THEN 1 ELSE 0 END) AS overdue
      FROM \`tasks\` tk
      ${scope}
      GROUP BY DATE_FORMAT(tk.\`createdAt\`, '%Y-%m')
      ORDER BY month ASC
    `),
    runRows<Row>(sql`
      SELECT
        tk.\`assignedToId\` AS ownerId,
        u.\`name\` AS ownerName,
        COUNT(*) AS total,
        SUM(CASE WHEN tk.\`status\` = 'completed' THEN 1 ELSE 0 END) AS completed,
        SUM(CASE WHEN tk.\`status\` NOT IN ('completed', 'cancelled') AND tk.\`dueDate\` IS NOT NULL AND DATE(tk.\`dueDate\`) < CURRENT_DATE THEN 1 ELSE 0 END) AS overdue
      FROM \`tasks\` tk
      LEFT JOIN \`users\` u ON u.id = tk.\`assignedToId\`
      ${scope}
      GROUP BY tk.\`assignedToId\`, u.\`name\`
      ORDER BY overdue DESC, total DESC
      LIMIT 25
    `),
    runRows<Row>(sql`
      SELECT
        tk.id AS taskId,
        tk.\`title\` AS title,
        tk.\`priority\` AS priority,
        tk.\`status\` AS status,
        tk.\`taskType\` AS taskType,
        tk.\`dueDate\` AS dueDate,
        tk.\`createdAt\` AS createdAt,
        tk.\`isAutomated\` AS isAutomated,
        tk.\`relatedContactId\` AS contactId,
        tk.\`relatedTransactionId\` AS transactionId,
        u.\`name\` AS ownerName
      FROM \`tasks\` tk
      LEFT JOIN \`users\` u ON u.id = tk.\`assignedToId\`
      ${openScope}
      ORDER BY
        CASE WHEN tk.\`dueDate\` IS NOT NULL AND DATE(tk.\`dueDate\`) < CURRENT_DATE THEN 1 ELSE 0 END DESC,
        FIELD(tk.\`priority\`, 'urgent', 'high', 'medium', 'low'),
        tk.\`dueDate\` ASC,
        tk.\`createdAt\` DESC
      LIMIT ${limit} OFFSET ${offset}
    `),
    runRows<Row>(sql`SELECT COUNT(*) AS total FROM \`tasks\` tk ${openScope}`),
    runRows<Row>(sql`
      SELECT tk.\`priority\` AS label, COUNT(*) AS value
      FROM \`tasks\` tk
      ${scope}
      GROUP BY tk.\`priority\`
      ORDER BY FIELD(tk.\`priority\`, 'urgent', 'high', 'medium', 'low')
    `),
    runRows<Row>(sql`
      SELECT tk.\`taskType\` AS label, COUNT(*) AS value
      FROM \`tasks\` tk
      ${scope}
      GROUP BY tk.\`taskType\`
      ORDER BY value DESC
    `),
  ]);
  const summary = summaryRows[0] ?? {};
  const total = asNumber(summary.total);
  const completed = asNumber(summary.completed);
  return {
    summary: {
      total,
      completed,
      open: asNumber(summary.open),
      overdue: asNumber(summary.overdue),
      dueToday: asNumber(summary.dueToday),
      urgent: asNumber(summary.urgent),
      unassigned: asNumber(summary.unassigned),
      completionRate: total ? (completed / total) * 100 : null,
      averageDaysToComplete: asNullableNumber(summary.averageDaysToComplete),
    },
    monthly: monthlyRows.map((row) => ({ month: String(row.month ?? ""), created: asNumber(row.created), completed: asNumber(row.completed), overdue: asNumber(row.overdue) })),
    owners: ownerRows.map((row) => {
      const ownerTotal = asNumber(row.total);
      const ownerCompleted = asNumber(row.completed);
      return { ownerId: asNullableNumber(row.ownerId), ownerName: String(row.ownerName ?? "Unassigned"), total: ownerTotal, completed: ownerCompleted, overdue: asNumber(row.overdue), completionRate: ownerTotal ? (ownerCompleted / ownerTotal) * 100 : null };
    }),
    priorities: priorityRows.map((row) => ({ label: String(row.label ?? "other"), value: asNumber(row.value) })),
    types: typeRows.map((row) => ({ label: String(row.label ?? "other"), value: asNumber(row.value) })),
    tasks: taskRows.map((row) => ({
      taskId: asNumber(row.taskId), title: String(row.title ?? "Untitled task"), priority: String(row.priority ?? "medium"), status: String(row.status ?? "pending"), taskType: String(row.taskType ?? "other"), dueDate: asDay(row.dueDate), createdAt: asDay(row.createdAt), isAutomated: Boolean(asNumber(row.isAutomated)), contactId: asNullableNumber(row.contactId), transactionId: asNullableNumber(row.transactionId), ownerName: String(row.ownerName ?? "Unassigned"),
    })),
    pagination: paginationResult(page, limit, asNumber(countRows[0]?.total)),
  };
}

export async function getIsaActivitiesReportingData(filters: ExpansionFilters = {}) {
  const contactsWhere = contactScope(filters);
  const sessionsWhere = sessionScope(filters);
  const followUpSessionsWhere = withCondition(sessionsWhere, sql`ms.\`status\` IN ('active', 'abandoned')`);
  const { page, limit, offset } = pagination(filters);
  const [summaryRows, funnelRows, isaRows, sessionRows, queueRows, monthlyRows, queueCountRows] = await Promise.all([
    runRows<Row>(sql`
      SELECT
        COUNT(*) AS contacts,
        SUM(CASE WHEN c.\`isa_status\` = 'new_lead' THEN 1 ELSE 0 END) AS newLeads,
        SUM(CASE WHEN c.\`isa_status\` = 'attempted_contact' THEN 1 ELSE 0 END) AS attemptedContact,
        SUM(CASE WHEN c.\`isa_status\` = 'nurture' THEN 1 ELSE 0 END) AS nurture,
        SUM(CASE WHEN c.\`isa_status\` = 'active_client' THEN 1 ELSE 0 END) AS activeClients,
        SUM(CASE WHEN c.\`isa_status\` = 'under_contract' THEN 1 ELSE 0 END) AS underContract,
        SUM(CASE WHEN c.\`isa_status\` = 'closed' THEN 1 ELSE 0 END) AS closed,
        SUM(CASE WHEN c.\`isa_status\` = 'dead' THEN 1 ELSE 0 END) AS dead,
        SUM(CASE WHEN c.\`assignedIsaId\` IS NULL THEN 1 ELSE 0 END) AS unassigned
      FROM \`contacts\` c
      ${contactsWhere}
    `),
    runRows<Row>(sql`
      SELECT COALESCE(c.\`isa_status\`, 'unclassified') AS status, COUNT(*) AS count
      FROM \`contacts\` c
      ${contactsWhere}
      GROUP BY c.\`isa_status\`
    `),
    runRows<Row>(sql`
      SELECT
        c.\`assignedIsaId\` AS isaId,
        u.\`name\` AS isaName,
        COUNT(*) AS contacts,
        SUM(CASE WHEN c.\`isa_status\` = 'active_client' THEN 1 ELSE 0 END) AS activeClients,
        SUM(CASE WHEN c.\`isa_status\` = 'under_contract' THEN 1 ELSE 0 END) AS underContract,
        SUM(CASE WHEN c.\`isa_status\` = 'closed' THEN 1 ELSE 0 END) AS closed,
        SUM(CASE WHEN c.\`isa_status\` = 'dead' THEN 1 ELSE 0 END) AS dead
      FROM \`contacts\` c
      LEFT JOIN \`users\` u ON u.id = c.\`assignedIsaId\`
      ${contactsWhere}
      GROUP BY c.\`assignedIsaId\`, u.\`name\`
      ORDER BY closed DESC, activeClients DESC, contacts DESC
      LIMIT 25
    `),
    runRows<Row>(sql`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN ms.\`status\` = 'completed' THEN 1 ELSE 0 END) AS completed,
        SUM(CASE WHEN ms.\`status\` = 'active' THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN ms.\`status\` = 'abandoned' THEN 1 ELSE 0 END) AS abandoned,
        AVG(ms.\`durationSeconds\`) AS averageDurationSeconds
      FROM \`market_match_sessions\` ms
      INNER JOIN \`contacts\` c ON c.id = ms.\`contactId\`
      ${sessionsWhere}
    `),
    runRows<Row>(sql`
      SELECT
        ms.id AS sessionId,
        ms.\`status\` AS status,
        ms.\`startedAt\` AS startedAt,
        ms.\`nextActionRecommendation\` AS nextActionRecommendation,
        ms.\`overallConfidenceScore\` AS confidenceScore,
        c.id AS contactId,
        CONCAT(c.\`firstName\`, ' ', c.\`lastName\`) AS contactName,
        u.\`name\` AS isaName
      FROM \`market_match_sessions\` ms
      INNER JOIN \`contacts\` c ON c.id = ms.\`contactId\`
      LEFT JOIN \`users\` u ON u.id = ms.\`isaId\`
      ${followUpSessionsWhere}
      ORDER BY FIELD(ms.\`status\`, 'active', 'abandoned'), ms.\`startedAt\` ASC
      LIMIT ${limit} OFFSET ${offset}
    `),
    runRows<Row>(sql`
      SELECT
        DATE_FORMAT(c.\`createdAt\`, '%Y-%m') AS month,
        COUNT(*) AS leads,
        SUM(CASE WHEN c.\`isa_status\` IN ('active_client', 'under_contract') THEN 1 ELSE 0 END) AS activeClients,
        SUM(CASE WHEN c.\`isa_status\` = 'closed' THEN 1 ELSE 0 END) AS closed
      FROM \`contacts\` c
      ${contactsWhere}
      GROUP BY DATE_FORMAT(c.\`createdAt\`, '%Y-%m')
      ORDER BY month ASC
    `),
    runRows<Row>(sql`
      SELECT COUNT(*) AS total
      FROM \`market_match_sessions\` ms
      INNER JOIN \`contacts\` c ON c.id = ms.\`contactId\`
      ${followUpSessionsWhere}
    `),
  ]);
  const summary = summaryRows[0] ?? {};
  const contacts = asNumber(summary.contacts);
  const closed = asNumber(summary.closed);
  const session = sessionRows[0] ?? {};
  const funnelOrder = ["new_lead", "attempted_contact", "nurture", "active_client", "under_contract", "closed", "dead", "unclassified"];
  const funnelMap = new Map(funnelRows.map((row) => [String(row.status ?? "unclassified"), asNumber(row.count)]));
  return {
    summary: {
      contacts,
      newLeads: asNumber(summary.newLeads),
      activeClients: asNumber(summary.activeClients),
      underContract: asNumber(summary.underContract),
      closed,
      dead: asNumber(summary.dead),
      unassigned: asNumber(summary.unassigned),
      closeRate: contacts ? (closed / contacts) * 100 : null,
      sessions: asNumber(session.total),
      completedSessions: asNumber(session.completed),
      activeSessions: asNumber(session.active),
      abandonedSessions: asNumber(session.abandoned),
      averageSessionMinutes: asNullableNumber(session.averageDurationSeconds) === null ? null : asNumber(session.averageDurationSeconds) / 60,
    },
    funnel: funnelOrder.map((status) => ({ status, count: funnelMap.get(status) ?? 0 })),
    isaPerformance: isaRows.map((row) => {
      const total = asNumber(row.contacts);
      const isaClosed = asNumber(row.closed);
      return { isaId: asNullableNumber(row.isaId), isaName: String(row.isaName ?? "Unassigned"), contacts: total, activeClients: asNumber(row.activeClients), underContract: asNumber(row.underContract), closed: isaClosed, dead: asNumber(row.dead), closeRate: total ? (isaClosed / total) * 100 : null };
    }),
    sessions: {
      total: asNumber(session.total), completed: asNumber(session.completed), active: asNumber(session.active), abandoned: asNumber(session.abandoned), averageDurationMinutes: asNullableNumber(session.averageDurationSeconds) === null ? null : asNumber(session.averageDurationSeconds) / 60,
    },
    monthly: monthlyRows.map((row) => ({ month: String(row.month ?? ""), leads: asNumber(row.leads), activeClients: asNumber(row.activeClients), closed: asNumber(row.closed) })),
    followUpQueue: queueRows.map((row) => ({ sessionId: asNumber(row.sessionId), status: String(row.status ?? "active"), startedAt: asDay(row.startedAt), nextActionRecommendation: row.nextActionRecommendation ? String(row.nextActionRecommendation) : null, confidenceScore: asNullableNumber(row.confidenceScore), contactId: asNumber(row.contactId), contactName: String(row.contactName ?? "Unknown contact"), isaName: String(row.isaName ?? "Unknown") })),
    pagination: paginationResult(page, limit, asNumber(queueCountRows[0]?.total)),
  };
}

export async function getLeadSourcesReportingData(filters: ExpansionFilters = {}) {
  const contactsWhere = contactScope(filters);
  const closedTransactionsWhere = transactionScope(filters, { closedOnly: true });
  // Under-contract transactions scope (no closedOnly restriction, just UC status)
  const ucTransactionsWhere = where([
    (filters.agentIds?.length ? sql`t.\`agentId\` IN (${sql.join(filters.agentIds.map((id) => sql`${id}`), sql`, `)})` : filters.agentId ? sql`t.\`agentId\` = ${filters.agentId}` : undefined),
    filters.groupLeaderId ? sql`EXISTS (
      SELECT 1
      FROM \`group_members\` gm
      INNER JOIN \`groups\` g ON g.id = gm.\`groupId\`
      WHERE gm.\`userId\` = t.\`agentId\` AND g.\`leaderId\` = ${filters.groupLeaderId}
    )` : undefined,
    filters.marketProfileId ? sql`EXISTS (
      SELECT 1 FROM \`users\` market_agent
      WHERE market_agent.id = t.\`agentId\` AND market_agent.\`marketProfileId\` = ${filters.marketProfileId}
    )` : undefined,
    (filters.leadSourceIds?.length ? sql`EXISTS (
      SELECT 1 FROM \`contacts\` source_contact
      WHERE source_contact.id = t.\`primaryContactId\` AND source_contact.\`leadSourceId\` IN (${sql.join(filters.leadSourceIds.map((id) => sql`${id}`), sql`, `)})
    )` : filters.leadSourceId ? sql`EXISTS (
      SELECT 1 FROM \`contacts\` source_contact
      WHERE source_contact.id = t.\`primaryContactId\` AND source_contact.\`leadSourceId\` = ${filters.leadSourceId}
    )` : undefined),
    sql`t.\`status\` = 'under_contract'`,
  ]);
  const [summaryRows, sourceRows, revenueRows, ucRows, appointmentRows, monthlyRows] = await Promise.all([
    runRows<Row>(sql`
      SELECT
        COUNT(*) AS leads,
        SUM(CASE WHEN c.\`leadSourceId\` IS NULL THEN 1 ELSE 0 END) AS unclassified,
        SUM(CASE WHEN c.\`isa_status\` IN ('active_client', 'under_contract') THEN 1 ELSE 0 END) AS activeClients,
        SUM(CASE WHEN c.\`isa_status\` = 'closed' THEN 1 ELSE 0 END) AS closed
      FROM \`contacts\` c
      ${contactsWhere}
    `),
    runRows<Row>(sql`
      SELECT
        COALESCE(c.\`leadSourceId\`, 0) AS sourceId,
        COALESCE(ls.\`name\`, 'Unknown / No source') AS sourceName,
        COALESCE(ls.\`campaignType\`, 'unclassified') AS campaignType,
        ls.\`clickCount\` AS clickCount,
        ls.\`submissionCount\` AS submissionCount,
        COUNT(*) AS leads,
        SUM(CASE WHEN c.\`isa_status\` IN ('active_client', 'under_contract') THEN 1 ELSE 0 END) AS activeClients,
        SUM(CASE WHEN c.\`isa_status\` = 'closed' THEN 1 ELSE 0 END) AS closed
      FROM \`contacts\` c
      LEFT JOIN \`lead_sources\` ls ON ls.id = c.\`leadSourceId\`
      ${contactsWhere}
      GROUP BY c.\`leadSourceId\`, ls.\`name\`, ls.\`campaignType\`, ls.\`clickCount\`, ls.\`submissionCount\`
      ORDER BY leads DESC, sourceName ASC
    `),
    runRows<Row>(sql`
      SELECT
        COALESCE(c.\`leadSourceId\`, 0) AS sourceId,
        COUNT(DISTINCT t.id) AS closings,
        COALESCE(SUM(COALESCE(t.\`purchasePrice\`, 0)), 0) AS volume,
        COALESCE(SUM(COALESCE(t.\`grossCommissionIncome\`, 0)), 0) AS grossCommission,
        COALESCE(SUM(COALESCE(pi.savvyNet, 0)), 0) AS savvyNet
      FROM \`transactions\` t
      INNER JOIN \`contacts\` c ON c.id = t.\`primaryContactId\`
      ${PAYOUT_JOIN}
      ${closedTransactionsWhere}
      GROUP BY c.\`leadSourceId\`
    `),
    runRows<Row>(sql`
      SELECT
        COALESCE(c.\`leadSourceId\`, 0) AS sourceId,
        COUNT(DISTINCT t.id) AS underContract
      FROM \`transactions\` t
      INNER JOIN \`contacts\` c ON c.id = t.\`primaryContactId\`
      ${ucTransactionsWhere}
      GROUP BY c.\`leadSourceId\`
    `),
    runRows<Row>(sql`
      SELECT
        COALESCE(c.\`leadSourceId\`, 0) AS sourceId,
        SUM(CASE WHEN ac.\`appointmentSet\` = 1 THEN 1 ELSE 0 END) AS appointmentsSet
      FROM \`contacts\` c
      INNER JOIN \`agent_connections\` ac ON ac.\`contactId\` = c.id
      ${contactsWhere}
      GROUP BY c.\`leadSourceId\`
    `),
    runRows<Row>(sql`
      SELECT
        DATE_FORMAT(c.\`createdAt\`, '%Y-%m') AS month,
        COUNT(*) AS leads,
        SUM(CASE WHEN c.\`isa_status\` IN ('active_client', 'under_contract') THEN 1 ELSE 0 END) AS activeClients,
        SUM(CASE WHEN c.\`isa_status\` = 'closed' THEN 1 ELSE 0 END) AS closed
      FROM \`contacts\` c
      ${contactsWhere}
      GROUP BY DATE_FORMAT(c.\`createdAt\`, '%Y-%m')
      ORDER BY month ASC
    `),
  ]);
  const revenueBySource = new Map(revenueRows.map((row) => [asNumber(row.sourceId), row]));
  const ucBySource = new Map(ucRows.map((row) => [asNumber(row.sourceId), asNumber(row.underContract)]));
  const appointmentsBySource = new Map(appointmentRows.map((row) => [asNumber(row.sourceId), asNumber(row.appointmentsSet)]));
  const sources = sourceRows.map((row) => {
    const sourceId = asNumber(row.sourceId);
    const revenue = revenueBySource.get(sourceId);
    const leads = asNumber(row.leads);
    const closed = asNumber(row.closed);
    return {
      sourceId,
      sourceName: String(row.sourceName ?? "Unknown / No source"),
      campaignType: String(row.campaignType ?? "unclassified"),
      clickCount: asNumber(row.clickCount),
      submissionCount: asNumber(row.submissionCount),
      leads,
      activeClients: asNumber(row.activeClients),
      closed,
      closeRate: leads ? (closed / leads) * 100 : null,
      underContract: ucBySource.get(sourceId) ?? 0,
      appointmentsSet: appointmentsBySource.get(sourceId) ?? 0,
      closings: asNumber(revenue?.closings),
      volume: asNumber(revenue?.volume),
      grossCommission: asNumber(revenue?.grossCommission),
      savvyNet: asNumber(revenue?.savvyNet),
      gciPerLead: leads ? asNumber(revenue?.grossCommission) / leads : null,
    };
  });
  const summaryRow = summaryRows[0] ?? {};
  const leads = asNumber(summaryRow.leads);
  const closed = asNumber(summaryRow.closed);
  const revenue = revenueRows.reduce<{ closings: number; volume: number; grossCommission: number; savvyNet: number }>(
    (result, row) => ({
      closings: result.closings + asNumber(row.closings),
      volume: result.volume + asNumber(row.volume),
      grossCommission: result.grossCommission + asNumber(row.grossCommission),
      savvyNet: result.savvyNet + asNumber(row.savvyNet),
    }),
    { closings: 0, volume: 0, grossCommission: 0, savvyNet: 0 },
  );
  return {
    summary: {
      leads,
      activeClients: asNumber(summaryRow.activeClients),
      closed,
      unclassified: asNumber(summaryRow.unclassified),
      closeRate: leads ? (closed / leads) * 100 : null,
      sourceCount: sources.filter((source) => source.sourceId !== 0).length,
      lowConversionSources: sources.filter((source) => source.leads >= 5 && source.closed === 0).length,
      ...revenue,
    },
    monthly: monthlyRows.map((row) => ({ month: String(row.month ?? ""), leads: asNumber(row.leads), activeClients: asNumber(row.activeClients), closed: asNumber(row.closed) })),
    sources,
  };
}
