import { and, eq, lte, sql, type SQL } from "drizzle-orm";
import { createHash } from "node:crypto";
import {
  agentSupportAssignments,
  analyticsInsightCaches,
  users,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { invokeLLM } from "../_core/llm";

/**
 * Analytics workspace service
 * ---------------------------
 * This module is deliberately read-only with respect to operational records. It
 * converts the current SavvyOS data model into decision-ready metrics, exposes
 * the underlying records for drill-through, and only writes to the dedicated
 * analytics insight cache table.
 */

export type AnalyticsViewer = {
  id: number;
  role: "admin" | "agent" | "isa" | "agent_support";
};

export type AnalyticsFilters = {
  dateFrom?: Date;
  dateTo?: Date;
  agentId?: number;
  marketProfileId?: number;
  leadSourceId?: number;
  status?: "all" | "closed" | "under_contract" | "terminated";
};

type AnalyticsScope = {
  role: AnalyticsViewer["role"];
  viewerId: number;
  agentIds?: number[];
  isaId?: number;
  canSeeFinance: boolean;
  canRefreshInsights: boolean;
  label: string;
};

type Row = Record<string, unknown>;

type InsightEvidence = {
  label: string;
  value: string;
  report: string;
  drilldown: "transactions" | "pipeline" | "tasks" | "people" | "sources" | "dataQuality";
};

type AnalyticsInsight = {
  type: "warning" | "opportunity" | "coaching" | "success" | "data_quality";
  priority: "high" | "medium" | "low";
  title: string;
  observation: string;
  explanation: string;
  confidence: "high" | "medium" | "limited";
  owner: string;
  action: string;
  connectedSignals: string[];
  evidence: InsightEvidence[];
};

export type AnalyticsInsightPayload = {
  summary: string;
  dataQualityNote: string;
  insights: AnalyticsInsight[];
};

const DAY_MS = 24 * 60 * 60 * 1000;
const CACHE_TTL_MS = 7 * DAY_MS;
const CACHE_STALE_RUN_MS = 15 * 60 * 1000;
const MAX_RECORDS = 150;

const pipelineLabels: Record<string, string> = {
  new_lead: "New lead",
  attempted_contact: "Attempted contact",
  nurture: "Nurture",
  active_client: "Active client",
  under_contract: "Under contract",
  closed: "Closed",
  dead: "Dead",
};

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

function asDate(value: unknown): Date | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toIso(value: unknown): string | null {
  const date = asDate(value);
  return date ? date.toISOString() : null;
}

function median(values: number[]): number | null {
  const cleaned = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!cleaned.length) return null;
  const middle = Math.floor(cleaned.length / 2);
  return cleaned.length % 2 === 0 ? (cleaned[middle - 1] + cleaned[middle]) / 2 : cleaned[middle];
}

function safePercent(current: number, prior: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(prior) || prior === 0) return null;
  return ((current - prior) / Math.abs(prior)) * 100;
}

function previousRange(filters: AnalyticsFilters): { dateFrom?: Date; dateTo?: Date } {
  if (!filters.dateFrom || !filters.dateTo) return {};
  const span = Math.max(filters.dateTo.getTime() - filters.dateFrom.getTime(), DAY_MS);
  return {
    dateFrom: new Date(filters.dateFrom.getTime() - span),
    dateTo: new Date(filters.dateFrom.getTime() - 1),
  };
}

function isoDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function quoteColumn(alias: string, column: string): SQL {
  return sql.raw(`\`${alias}\`.\`${column}\``);
}

function numericListClause(alias: string, column: string, values?: number[]): SQL | undefined {
  if (!values || values.length === 0) return undefined;
  const unique = Array.from(new Set(values.filter((id) => Number.isInteger(id) && id > 0)));
  if (!unique.length) return sql`1 = 0`;
  return sql`${quoteColumn(alias, column)} IN (${sql.join(unique.map((id) => sql`${id}`), sql`, `)})`;
}

function combineWhere(clauses: Array<SQL | undefined>): SQL {
  const usable = clauses.filter((clause): clause is SQL => Boolean(clause));
  return usable.length ? sql`WHERE ${sql.join(usable, sql` AND `)}` : sql``;
}

async function runRows<T extends Row = Row>(query: SQL): Promise<T[]> {
  const db = await getDb();
  if (!db) return [];
  const result = await (db as any).execute(query);
  if (Array.isArray(result) && Array.isArray(result[0])) return result[0] as T[];
  if (Array.isArray(result)) return result as T[];
  return [];
}

async function resolveScope(viewer: AnalyticsViewer, requested: AnalyticsFilters): Promise<AnalyticsScope> {
  const db = await getDb();
  let agentIds: number[] | undefined;
  let isaId: number | undefined;
  let label = "Company";

  if (viewer.role === "agent") {
    agentIds = [viewer.id];
    label = "My portfolio";
  } else if (viewer.role === "isa") {
    isaId = viewer.id;
    label = "My ISA book";
  } else if (viewer.role === "agent_support") {
    const assignments = db
      ? await db
          .select({ agentId: agentSupportAssignments.agentId })
          .from(agentSupportAssignments)
          .where(eq(agentSupportAssignments.agentSupportUserId, viewer.id))
      : [];
    agentIds = assignments.map((assignment) => assignment.agentId);
    label = "Assigned agent portfolios";
  }

  if (requested.marketProfileId) {
    const marketRows = await runRows<{ agentId: number }>(sql`
      SELECT \`agentId\` AS agentId
      FROM \`market_agent_assignments\`
      WHERE \`marketProfileId\` = ${requested.marketProfileId}
    `);
    const marketAgentIds = marketRows.map((row) => asNumber(row.agentId));
    agentIds = agentIds === undefined
      ? marketAgentIds
      : agentIds.filter((id) => marketAgentIds.includes(id));
  }

  if (requested.agentId) {
    if (agentIds !== undefined && !agentIds.includes(requested.agentId)) {
      agentIds = [];
    } else {
      // For an ISA, the independent isaId condition remains in every contact
      // query; adding agentIds here therefore narrows to that ISA's own book
      // for the selected agent rather than granting broader agent access.
      agentIds = [requested.agentId];
    }
  }

  return {
    role: viewer.role,
    viewerId: viewer.id,
    agentIds,
    isaId,
    canSeeFinance: viewer.role === "admin" || viewer.role === "agent",
    // Every authenticated viewer may generate a cached brief only for the
    // server-enforced scope above. Forced regeneration remains admin-only in
    // the router so routine views reuse their seven-day cache.
    canRefreshInsights: true,
    label,
  };
}

function transactionWhere(filters: AnalyticsFilters, scope: AnalyticsScope, range = filters): SQL {
  const effectiveStatus = filters.status && filters.status !== "all" ? filters.status : undefined;
  return combineWhere([
    numericListClause("t", "agentId", scope.agentIds),
    scope.isaId ? sql`${quoteColumn("c", "assignedIsaId")} = ${scope.isaId}` : undefined,
    filters.marketProfileId ? sql`${quoteColumn("u", "marketProfileId")} = ${filters.marketProfileId}` : undefined,
    filters.leadSourceId ? sql`${quoteColumn("c", "leadSourceId")} = ${filters.leadSourceId}` : undefined,
    effectiveStatus ? sql`${quoteColumn("t", "status")} = ${effectiveStatus}` : undefined,
    range.dateFrom ? sql`COALESCE(${quoteColumn("t", "closingDate")}, ${quoteColumn("t", "contractDate")}, ${quoteColumn("t", "createdAt")}) >= ${range.dateFrom}` : undefined,
    range.dateTo ? sql`COALESCE(${quoteColumn("t", "closingDate")}, ${quoteColumn("t", "contractDate")}, ${quoteColumn("t", "createdAt")}) <= ${range.dateTo}` : undefined,
  ]);
}

function connectionWhere(filters: AnalyticsFilters, scope: AnalyticsScope): SQL {
  return combineWhere([
    numericListClause("ac", "agentId", scope.agentIds),
    scope.isaId ? sql`${quoteColumn("c", "assignedIsaId")} = ${scope.isaId}` : undefined,
    filters.marketProfileId ? sql`${quoteColumn("u", "marketProfileId")} = ${filters.marketProfileId}` : undefined,
    filters.leadSourceId ? sql`${quoteColumn("c", "leadSourceId")} = ${filters.leadSourceId}` : undefined,
    filters.dateFrom ? sql`${quoteColumn("ac", "createdAt")} >= ${filters.dateFrom}` : undefined,
    filters.dateTo ? sql`${quoteColumn("ac", "createdAt")} <= ${filters.dateTo}` : undefined,
  ]);
}

function contactWhere(filters: AnalyticsFilters, scope: AnalyticsScope): SQL {
  // Contacts are linked to agents through agent_connections rather than a direct
  // owner column. Apply this scope in every contact-based report so an agent or
  // support user cannot infer company-wide lead-source or data-quality data.
  const agentContactScope = scope.agentIds === undefined
    ? undefined
    : sql`EXISTS (
        SELECT 1 FROM \`agent_connections\` ac_scope
        WHERE ac_scope.\`contactId\` = \`c\`.\`id\`
          AND ${numericListClause("ac_scope", "agentId", scope.agentIds) ?? sql`1 = 0`}
      )`;
  return combineWhere([
    agentContactScope,
    scope.isaId ? sql`${quoteColumn("c", "assignedIsaId")} = ${scope.isaId}` : undefined,
    filters.leadSourceId ? sql`${quoteColumn("c", "leadSourceId")} = ${filters.leadSourceId}` : undefined,
    filters.dateFrom ? sql`${quoteColumn("c", "createdAt")} >= ${filters.dateFrom}` : undefined,
    filters.dateTo ? sql`${quoteColumn("c", "createdAt")} <= ${filters.dateTo}` : undefined,
    sql`${quoteColumn("c", "archived_at")} IS NULL`,
  ]);
}

function taskWhere(filters: AnalyticsFilters, scope: AnalyticsScope): SQL {
  const taskOwnerIds = scope.isaId ? [scope.isaId] : scope.agentIds;
  return combineWhere([
    numericListClause("tk", "assignedToId", taskOwnerIds),
    filters.dateFrom ? sql`COALESCE(${quoteColumn("tk", "completedAt")}, ${quoteColumn("tk", "dueDate")}, ${quoteColumn("tk", "createdAt")}) >= ${filters.dateFrom}` : undefined,
    filters.dateTo ? sql`COALESCE(${quoteColumn("tk", "completedAt")}, ${quoteColumn("tk", "dueDate")}, ${quoteColumn("tk", "createdAt")}) <= ${filters.dateTo}` : undefined,
  ]);
}

function normalizeTransaction(row: Row, includePayouts: boolean) {
  return {
    id: asNumber(row.id),
    transactionNumber: String(row.transactionNumber ?? `#${row.id}`),
    status: String(row.status ?? "unknown"),
    type: String(row.transactionType ?? "unknown"),
    contractDate: toIso(row.contractDate),
    closingDate: toIso(row.closingDate),
    amountDate: toIso(row.amountDate),
    purchasePrice: asNumber(row.purchasePrice),
    grossCommissionIncome: asNumber(row.grossCommissionIncome),
    // Payout-derived economics are deliberately omitted from data payloads for
    // roles without finance access, rather than merely hidden in the UI.
    companyDollars: includePayouts ? asNumber(row.companyDollars) : null,
    agentDollars: includePayouts ? asNumber(row.agentDollars) : null,
    referralDollars: includePayouts ? asNumber(row.referralDollars) : null,
    payoutIntegrityFlag: includePayouts ? Boolean(row.payoutIntegrityFlag) : false,
    agentId: asNumber(row.agentId),
    agentName: String(row.agentName ?? "Unassigned"),
    contactId: asNumber(row.contactId),
    contactName: String(row.contactName ?? "Unknown contact"),
    sourceId: asNullableNumber(row.sourceId),
    sourceName: String(row.sourceName ?? "Unattributed"),
  };
}

function calculateTransactionAggregates(rows: ReturnType<typeof normalizeTransaction>[]) {
  const gci = rows.map((row) => row.grossCommissionIncome);
  const volume = rows.map((row) => row.purchasePrice);
  const company = rows.flatMap((row) => row.companyDollars === null ? [] : [row.companyDollars]);
  return {
    count: rows.length,
    totalGci: gci.reduce((sum, value) => sum + value, 0),
    totalVolume: volume.reduce((sum, value) => sum + value, 0),
    totalCompanyDollars: company.length ? company.reduce((sum, value) => sum + value, 0) : null,
    averageGci: rows.length ? gci.reduce((sum, value) => sum + value, 0) / rows.length : 0,
    medianGci: median(gci),
    averageVolume: rows.length ? volume.reduce((sum, value) => sum + value, 0) / rows.length : 0,
    medianVolume: median(volume),
  };
}

async function getTransactions(filters: AnalyticsFilters, scope: AnalyticsScope) {
  const where = transactionWhere(filters, scope);
  const rows = await runRows(sql`
    SELECT
      t.\`id\` AS id,
      t.\`transactionNumber\` AS transactionNumber,
      t.\`status\` AS status,
      t.\`transactionType\` AS transactionType,
      t.\`contractDate\` AS contractDate,
      t.\`closingDate\` AS closingDate,
      COALESCE(t.\`closingDate\`, t.\`contractDate\`, t.\`createdAt\`) AS amountDate,
      t.\`purchasePrice\` AS purchasePrice,
      t.\`grossCommissionIncome\` AS grossCommissionIncome,
      t.\`payoutIntegrityFlag\` AS payoutIntegrityFlag,
      t.\`agentId\` AS agentId,
      u.\`name\` AS agentName,
      c.\`id\` AS contactId,
      CONCAT(c.\`firstName\`, ' ', c.\`lastName\`) AS contactName,
      ls.\`id\` AS sourceId,
      COALESCE(ls.\`name\`, c.\`campaignSource\`, c.\`leadSourceType\`, 'Unattributed') AS sourceName,
      COALESCE(pay.\`companyDollars\`, 0) AS companyDollars,
      COALESCE(pay.\`agentDollars\`, 0) AS agentDollars,
      COALESCE(pay.\`referralDollars\`, 0) AS referralDollars
    FROM \`transactions\` t
    INNER JOIN \`users\` u ON u.\`id\` = t.\`agentId\`
    INNER JOIN \`contacts\` c ON c.\`id\` = t.\`primaryContactId\`
    LEFT JOIN \`lead_sources\` ls ON ls.\`id\` = c.\`leadSourceId\`
    LEFT JOIN (
      SELECT
        \`transactionId\`,
        SUM(CASE WHEN \`payeeType\` = 'savvy_str_agents' THEN COALESCE(\`amount\`, 0) ELSE 0 END) AS companyDollars,
        SUM(CASE WHEN \`payeeType\` = 'agent' THEN COALESCE(\`amount\`, 0) ELSE 0 END) AS agentDollars,
        SUM(CASE WHEN \`payeeType\` = 'referral_partner' THEN COALESCE(\`amount\`, 0) ELSE 0 END) AS referralDollars
      FROM \`transaction_payout_items\`
      GROUP BY \`transactionId\`
    ) pay ON pay.\`transactionId\` = t.\`id\`
    ${where}
    ORDER BY COALESCE(t.\`closingDate\`, t.\`contractDate\`, t.\`createdAt\`) DESC
    LIMIT ${MAX_RECORDS}
  `);

  const normalized = rows.map((row) => normalizeTransaction(row, scope.canSeeFinance));
  return { rows: normalized, aggregates: calculateTransactionAggregates(normalized) };
}

async function getClosedPeriodMetrics(filters: AnalyticsFilters, scope: AnalyticsScope, range: { dateFrom?: Date; dateTo?: Date }) {
  const closedFilters: AnalyticsFilters = { ...filters, status: "closed" };
  const where = transactionWhere(closedFilters, scope, range);
  const rows = await runRows(sql`
    SELECT
      COUNT(*) AS closings,
      COALESCE(SUM(t.\`grossCommissionIncome\`), 0) AS gci,
      COALESCE(SUM(t.\`purchasePrice\`), 0) AS volume,
      COALESCE(AVG(t.\`grossCommissionIncome\`), 0) AS averageGci,
      COALESCE(AVG(t.\`purchasePrice\`), 0) AS averageVolume
    FROM \`transactions\` t
    INNER JOIN \`users\` u ON u.\`id\` = t.\`agentId\`
    INNER JOIN \`contacts\` c ON c.\`id\` = t.\`primaryContactId\`
    ${where}
  `);
  const row = rows[0] ?? {};
  return {
    closings: asNumber(row.closings),
    gci: asNumber(row.gci),
    volume: asNumber(row.volume),
    averageGci: asNumber(row.averageGci),
    averageVolume: asNumber(row.averageVolume),
  };
}

async function getTrend(filters: AnalyticsFilters, scope: AnalyticsScope) {
  const closedFilters: AnalyticsFilters = { ...filters, status: "closed" };
  const where = transactionWhere(closedFilters, scope);
  const rows = await runRows(sql`
    SELECT
      DATE_FORMAT(t.\`closingDate\`, '%Y-%m') AS month,
      COUNT(*) AS closings,
      COALESCE(SUM(t.\`grossCommissionIncome\`), 0) AS gci,
      COALESCE(SUM(t.\`purchasePrice\`), 0) AS volume
    FROM \`transactions\` t
    INNER JOIN \`users\` u ON u.\`id\` = t.\`agentId\`
    INNER JOIN \`contacts\` c ON c.\`id\` = t.\`primaryContactId\`
    ${where}
    AND t.\`status\` = 'closed'
    AND t.\`closingDate\` IS NOT NULL
    GROUP BY DATE_FORMAT(t.\`closingDate\`, '%Y-%m')
    ORDER BY month ASC
    LIMIT 36
  `);
  return rows.map((row) => ({
    month: String(row.month ?? ""),
    closings: asNumber(row.closings),
    gci: asNumber(row.gci),
    volume: asNumber(row.volume),
  }));
}

async function getSources(filters: AnalyticsFilters, scope: AnalyticsScope) {
  const leadsWhere = contactWhere(filters, scope);
  const transactionFilters: AnalyticsFilters = { ...filters, status: "closed" };
  const transactionFilter = transactionWhere(transactionFilters, scope);

  const rows = await runRows(sql`
    SELECT
      source.\`id\` AS sourceId,
      source.\`name\` AS sourceName,
      parent.\`name\` AS parentSourceName,
      COALESCE(leads.\`leadCount\`, 0) AS leadCount,
      COALESCE(closed.\`closings\`, 0) AS closings,
      COALESCE(closed.\`gci\`, 0) AS gci,
      COALESCE(closed.\`volume\`, 0) AS volume,
      COALESCE(closed.\`averageGci\`, 0) AS averageGci
    FROM \`lead_sources\` source
    LEFT JOIN \`lead_sources\` parent ON parent.\`id\` = source.\`parentId\`
    LEFT JOIN (
      SELECT c.\`leadSourceId\` AS sourceId, COUNT(*) AS leadCount
      FROM \`contacts\` c
      ${leadsWhere}
      GROUP BY c.\`leadSourceId\`
    ) leads ON leads.sourceId = source.\`id\`
    LEFT JOIN (
      SELECT c.\`leadSourceId\` AS sourceId,
        COUNT(DISTINCT t.\`id\`) AS closings,
        SUM(t.\`grossCommissionIncome\`) AS gci,
        SUM(t.\`purchasePrice\`) AS volume,
        AVG(t.\`grossCommissionIncome\`) AS averageGci
      FROM \`transactions\` t
      INNER JOIN \`contacts\` c ON c.\`id\` = t.\`primaryContactId\`
      INNER JOIN \`users\` u ON u.\`id\` = t.\`agentId\`
      ${transactionFilter}
      AND t.\`status\` = 'closed'
      GROUP BY c.\`leadSourceId\`
    ) closed ON closed.sourceId = source.\`id\`
    WHERE source.\`isActive\` = 1
      AND (COALESCE(leads.\`leadCount\`, 0) > 0 OR COALESCE(closed.\`closings\`, 0) > 0)
    ORDER BY COALESCE(closed.\`gci\`, 0) DESC, COALESCE(leads.\`leadCount\`, 0) DESC
    LIMIT 75
  `);

  return rows.map((row) => {
    const leadCount = asNumber(row.leadCount);
    const closings = asNumber(row.closings);
    const gci = asNumber(row.gci);
    return {
      sourceId: asNullableNumber(row.sourceId),
      sourceName: String(row.sourceName ?? "Unattributed"),
      parentSourceName: row.parentSourceName ? String(row.parentSourceName) : null,
      leadCount,
      closings,
      gci,
      volume: asNumber(row.volume),
      averageGci: asNumber(row.averageGci),
      revenuePerLead: leadCount ? gci / leadCount : null,
      observedCloseYield: leadCount ? closings / leadCount : null,
      // This is an observed yield, not a cohort conversion rate. The UI repeats
      // this distinction instead of implying unsupported causal attribution.
      metricWarning: "Leads are acquired in the selected period; revenue reflects transactions closed in the selected period.",
    };
  });
}

async function getPipeline(filters: AnalyticsFilters, scope: AnalyticsScope) {
  const where = connectionWhere(filters, scope);
  const stageRows = await runRows(sql`
    SELECT ac.\`pipelineStatus\` AS stage, COUNT(*) AS count
    FROM \`agent_connections\` ac
    INNER JOIN \`contacts\` c ON c.\`id\` = ac.\`contactId\`
    INNER JOIN \`users\` u ON u.\`id\` = ac.\`agentId\`
    ${where}
    GROUP BY ac.\`pipelineStatus\`
  `);

  const records = await runRows(sql`
    SELECT
      ac.\`id\` AS connectionId,
      ac.\`pipelineStatus\` AS stage,
      ac.\`followUpDate\` AS followUpDate,
      COALESCE(ac.\`agingUpdatedAt\`, ac.\`updatedAt\`) AS activityDate,
      TIMESTAMPDIFF(DAY, COALESCE(ac.\`agingUpdatedAt\`, ac.\`updatedAt\`), NOW()) AS ageDays,
      c.\`id\` AS contactId,
      CONCAT(c.\`firstName\`, ' ', c.\`lastName\`) AS contactName,
      u.\`id\` AS agentId,
      u.\`name\` AS agentName,
      ls.\`id\` AS sourceId,
      COALESCE(ls.\`name\`, c.\`campaignSource\`, c.\`leadSourceType\`, 'Unattributed') AS sourceName
    FROM \`agent_connections\` ac
    INNER JOIN \`contacts\` c ON c.\`id\` = ac.\`contactId\`
    INNER JOIN \`users\` u ON u.\`id\` = ac.\`agentId\`
    LEFT JOIN \`lead_sources\` ls ON ls.\`id\` = c.\`leadSourceId\`
    ${where}
    ORDER BY ageDays DESC, ac.\`followUpDate\` ASC
    LIMIT ${MAX_RECORDS}
  `);

  const normalized = records.map((record) => ({
    connectionId: asNumber(record.connectionId),
    stage: String(record.stage ?? "new_lead"),
    stageLabel: pipelineLabels[String(record.stage ?? "new_lead")] ?? String(record.stage ?? "Unknown"),
    followUpDate: toIso(record.followUpDate),
    activityDate: toIso(record.activityDate),
    ageDays: asNumber(record.ageDays),
    contactId: asNumber(record.contactId),
    contactName: String(record.contactName ?? "Unknown contact"),
    agentId: asNumber(record.agentId),
    agentName: String(record.agentName ?? "Unassigned"),
    sourceId: asNullableNumber(record.sourceId),
    sourceName: String(record.sourceName ?? "Unattributed"),
  }));

  const stageMap = new Map(stageRows.map((row) => [String(row.stage ?? ""), asNumber(row.count)]));
  const funnel = Object.keys(pipelineLabels).map((stage) => ({
    stage,
    label: pipelineLabels[stage],
    count: stageMap.get(stage) ?? 0,
  }));
  const activeRecords = normalized.filter((record) => !["closed", "dead"].includes(record.stage));
  const stalled = activeRecords.filter((record) => record.ageDays >= 14);
  const overdueFollowUps = activeRecords.filter((record) => record.followUpDate && new Date(record.followUpDate).getTime() < Date.now());

  return {
    funnel,
    activeCount: activeRecords.length,
    stalledCount: stalled.length,
    overdueFollowUpCount: overdueFollowUps.length,
    staleRecords: stalled.slice(0, 50),
    overdueFollowUps: overdueFollowUps.slice(0, 50),
    allRecords: normalized,
  };
}

async function getTasks(filters: AnalyticsFilters, scope: AnalyticsScope) {
  const where = taskWhere(filters, scope);
  const records = await runRows(sql`
    SELECT
      tk.\`id\` AS id,
      tk.\`title\` AS title,
      tk.\`status\` AS status,
      tk.\`priority\` AS priority,
      tk.\`taskType\` AS taskType,
      tk.\`dueDate\` AS dueDate,
      tk.\`completedAt\` AS completedAt,
      assignee.\`id\` AS assigneeId,
      assignee.\`name\` AS assigneeName,
      c.\`id\` AS contactId,
      CONCAT(c.\`firstName\`, ' ', c.\`lastName\`) AS contactName,
      t.\`id\` AS transactionId,
      t.\`transactionNumber\` AS transactionNumber
    FROM \`tasks\` tk
    LEFT JOIN \`users\` assignee ON assignee.\`id\` = tk.\`assignedToId\`
    LEFT JOIN \`contacts\` c ON c.\`id\` = tk.\`relatedContactId\`
    LEFT JOIN \`transactions\` t ON t.\`id\` = tk.\`relatedTransactionId\`
    ${where}
    ORDER BY CASE WHEN tk.\`status\` IN ('pending', 'in_progress') AND tk.\`dueDate\` < NOW() THEN 0 ELSE 1 END,
      tk.\`dueDate\` ASC
    LIMIT ${MAX_RECORDS}
  `);
  const normalized = records.map((record) => ({
    id: asNumber(record.id),
    title: String(record.title ?? "Untitled task"),
    status: String(record.status ?? "pending"),
    priority: String(record.priority ?? "medium"),
    taskType: String(record.taskType ?? "other"),
    dueDate: toIso(record.dueDate),
    completedAt: toIso(record.completedAt),
    assigneeId: asNullableNumber(record.assigneeId),
    assigneeName: record.assigneeName ? String(record.assigneeName) : "Unassigned",
    contactId: asNullableNumber(record.contactId),
    contactName: record.contactName ? String(record.contactName) : null,
    transactionId: asNullableNumber(record.transactionId),
    transactionNumber: record.transactionNumber ? String(record.transactionNumber) : null,
  }));
  const open = normalized.filter((task) => ["pending", "in_progress"].includes(task.status));
  const overdue = open.filter((task) => task.dueDate && new Date(task.dueDate).getTime() < Date.now());
  const completed = normalized.filter((task) => task.status === "completed");
  return {
    total: normalized.length,
    openCount: open.length,
    completedCount: completed.length,
    overdueCount: overdue.length,
    completionRate: normalized.length ? completed.length / normalized.length : null,
    overdue,
    records: normalized,
  };
}

function peopleWhere(scope: AnalyticsScope): SQL {
  const personIds = scope.isaId ? [scope.isaId] : scope.agentIds;
  return combineWhere([
    numericListClause("u", "id", personIds),
    sql`u.\`isActive\` = 1`,
    scope.isaId ? sql`u.\`id\` = ${scope.isaId}` : sql`u.\`role\` IN ('agent', 'isa', 'agent_support')`,
  ]);
}

async function getPeople(filters: AnalyticsFilters, scope: AnalyticsScope) {
  const period = filters;
  const prior = previousRange(filters);
  const people = await runRows(sql`
    SELECT
      u.\`id\` AS userId,
      u.\`name\` AS name,
      u.\`email\` AS email,
      u.\`role\` AS role,
      u.\`title\` AS title,
      u.\`commissionSplit\` AS commissionSplit,
      u.\`marketProfileId\` AS marketProfileId,
      mp.\`name\` AS marketName,
      up.\`profilePhotoUrl\` AS profilePhotoUrl,
      ap.\`agentStatus\` AS agentStatus,
      ap.\`licenseExpirationDate\` AS licenseExpirationDate,
      COALESCE(cur.\`closings\`, 0) AS currentClosings,
      COALESCE(cur.\`gci\`, 0) AS currentGci,
      COALESCE(cur.\`volume\`, 0) AS currentVolume,
      COALESCE(prev.\`closings\`, 0) AS priorClosings,
      COALESCE(prev.\`gci\`, 0) AS priorGci,
      COALESCE(prev.\`volume\`, 0) AS priorVolume,
      COALESCE(pipe.\`activePipeline\`, 0) AS activePipeline,
      COALESCE(pipe.\`stalledPipeline\`, 0) AS stalledPipeline,
      COALESCE(task.\`openTasks\`, 0) AS openTasks,
      COALESCE(task.\`overdueTasks\`, 0) AS overdueTasks,
      COALESCE(act.\`activityCount\`, 0) AS activityCount,
      act.\`lastActivityAt\` AS lastActivityAt,
      coach.\`lastCoachingAt\` AS lastCoachingAt,
      coach.\`lastCoachName\` AS lastCoachName,
      COALESCE(coach.\`coachingCount\`, 0) AS coachingCount,
      coach.\`nextFollowUpDate\` AS nextFollowUpDate,
      ag.\`gciTarget\` AS annualGciTarget,
      ag.\`closingsTarget\` AS annualClosingsTarget,
      ob.\`onboardingStatus\` AS onboardingStatus,
      COALESCE(ob.\`remainingOnboardingTasks\`, 0) AS remainingOnboardingTasks
    FROM \`users\` u
    LEFT JOIN \`user_profiles\` up ON up.\`userId\` = u.\`id\`
    LEFT JOIN \`agent_profiles\` ap ON ap.\`userId\` = u.\`id\`
    LEFT JOIN \`market_profiles\` mp ON mp.\`id\` = u.\`marketProfileId\`
    LEFT JOIN (
      SELECT t.\`agentId\` AS agentId, COUNT(*) AS closings,
        SUM(t.\`grossCommissionIncome\`) AS gci, SUM(t.\`purchasePrice\`) AS volume
      FROM \`transactions\` t
      WHERE t.\`status\` = 'closed'
        ${period.dateFrom ? sql`AND t.\`closingDate\` >= ${period.dateFrom}` : sql``}
        ${period.dateTo ? sql`AND t.\`closingDate\` <= ${period.dateTo}` : sql``}
      GROUP BY t.\`agentId\`
    ) cur ON cur.agentId = u.\`id\`
    LEFT JOIN (
      SELECT t.\`agentId\` AS agentId, COUNT(*) AS closings,
        SUM(t.\`grossCommissionIncome\`) AS gci, SUM(t.\`purchasePrice\`) AS volume
      FROM \`transactions\` t
      WHERE t.\`status\` = 'closed'
        ${prior.dateFrom ? sql`AND t.\`closingDate\` >= ${prior.dateFrom}` : sql``}
        ${prior.dateTo ? sql`AND t.\`closingDate\` <= ${prior.dateTo}` : sql``}
      GROUP BY t.\`agentId\`
    ) prev ON prev.agentId = u.\`id\`
    LEFT JOIN (
      SELECT ac.\`agentId\` AS agentId,
        SUM(CASE WHEN ac.\`pipelineStatus\` NOT IN ('closed', 'dead') THEN 1 ELSE 0 END) AS activePipeline,
        SUM(CASE WHEN ac.\`pipelineStatus\` NOT IN ('closed', 'dead')
          AND TIMESTAMPDIFF(DAY, COALESCE(ac.\`agingUpdatedAt\`, ac.\`updatedAt\`), NOW()) >= 14 THEN 1 ELSE 0 END) AS stalledPipeline
      FROM \`agent_connections\` ac
      GROUP BY ac.\`agentId\`
    ) pipe ON pipe.agentId = u.\`id\`
    LEFT JOIN (
      SELECT tk.\`assignedToId\` AS userId,
        SUM(CASE WHEN tk.\`status\` IN ('pending', 'in_progress') THEN 1 ELSE 0 END) AS openTasks,
        SUM(CASE WHEN tk.\`status\` IN ('pending', 'in_progress') AND tk.\`dueDate\` < NOW() THEN 1 ELSE 0 END) AS overdueTasks
      FROM \`tasks\` tk
      GROUP BY tk.\`assignedToId\`
    ) task ON task.userId = u.\`id\`
    LEFT JOIN (
      SELECT com.\`authorId\` AS userId, COUNT(*) AS activityCount, MAX(com.\`communicatedAt\`) AS lastActivityAt
      FROM \`communications\` com
      WHERE com.\`communicatedAt\` >= ${period.dateFrom ?? new Date(Date.now() - 30 * DAY_MS)}
      GROUP BY com.\`authorId\`
    ) act ON act.userId = u.\`id\`
    LEFT JOIN (
      SELECT lf.\`agentUserId\` AS userId,
        MAX(lf.\`meetingDate\`) AS lastCoachingAt,
        SUBSTRING_INDEX(GROUP_CONCAT(coach.\`name\` ORDER BY lf.\`meetingDate\` DESC), ',', 1) AS lastCoachName,
        COUNT(*) AS coachingCount,
        MIN(CASE WHEN lf.\`followUpDate\` >= NOW() THEN lf.\`followUpDate\` END) AS nextFollowUpDate
      FROM \`leadership_feedback\` lf
      LEFT JOIN \`users\` coach ON coach.\`id\` = lf.\`conductedByUserId\`
      GROUP BY lf.\`agentUserId\`
    ) coach ON coach.userId = u.\`id\`
    LEFT JOIN \`agent_goals\` ag ON ag.\`agentId\` = u.\`id\`
      AND ag.\`year\` = ${new Date().getUTCFullYear()} AND ag.\`month\` = 0
    LEFT JOIN (
      SELECT oi.\`agentUserId\` AS userId,
        SUBSTRING_INDEX(GROUP_CONCAT(oi.\`status\` ORDER BY oi.\`startedAt\` DESC), ',', 1) AS onboardingStatus,
        SUM(CASE WHEN oit.\`completed\` = 0 THEN 1 ELSE 0 END) AS remainingOnboardingTasks
      FROM \`onboarding_instances\` oi
      LEFT JOIN \`onboarding_instance_tasks\` oit ON oit.\`instanceId\` = oi.\`id\`
      GROUP BY oi.\`agentUserId\`
    ) ob ON ob.userId = u.\`id\`
    ${peopleWhere(scope)}
    ORDER BY currentGci DESC, stalledPipeline DESC, overdueTasks DESC, u.\`name\` ASC
    LIMIT 150
  `);

  return people.map((person) => {
    const currentGci = asNumber(person.currentGci);
    const priorGci = asNumber(person.priorGci);
    const annualGciTarget = asNullableNumber(person.annualGciTarget);
    const currentClosings = asNumber(person.currentClosings);
    const annualClosingsTarget = asNullableNumber(person.annualClosingsTarget);
    return {
      userId: asNumber(person.userId),
      name: String(person.name ?? "Unnamed user"),
      email: person.email ? String(person.email) : null,
      role: String(person.role ?? "agent"),
      title: person.title ? String(person.title) : null,
      profilePhotoUrl: person.profilePhotoUrl ? String(person.profilePhotoUrl) : null,
      marketProfileId: asNullableNumber(person.marketProfileId),
      marketName: person.marketName ? String(person.marketName) : null,
      agentStatus: person.agentStatus ? String(person.agentStatus) : null,
      commissionSplit: asNullableNumber(person.commissionSplit),
      licenseExpirationDate: toIso(person.licenseExpirationDate),
      production: {
        currentClosings,
        currentGci,
        currentVolume: asNumber(person.currentVolume),
        priorClosings: asNumber(person.priorClosings),
        priorGci,
        priorVolume: asNumber(person.priorVolume),
        gciTrendPct: safePercent(currentGci, priorGci),
        annualGciTarget,
        annualGciAttainment: annualGciTarget && annualGciTarget > 0 ? currentGci / annualGciTarget : null,
        annualClosingsTarget,
        annualClosingsAttainment: annualClosingsTarget && annualClosingsTarget > 0 ? currentClosings / annualClosingsTarget : null,
      },
      execution: {
        activePipeline: asNumber(person.activePipeline),
        stalledPipeline: asNumber(person.stalledPipeline),
        openTasks: asNumber(person.openTasks),
        overdueTasks: asNumber(person.overdueTasks),
        recordedActivityCount: asNumber(person.activityCount),
        lastActivityAt: toIso(person.lastActivityAt),
      },
      coaching: {
        lastCoachingAt: toIso(person.lastCoachingAt),
        lastCoachName: person.lastCoachName ? String(person.lastCoachName) : null,
        coachingCount: asNumber(person.coachingCount),
        nextFollowUpDate: toIso(person.nextFollowUpDate),
      },
      onboarding: {
        status: person.onboardingStatus ? String(person.onboardingStatus) : null,
        remainingTasks: asNumber(person.remainingOnboardingTasks),
      },
    };
  });
}

async function getDataQuality(filters: AnalyticsFilters, scope: AnalyticsScope) {
  const transactionBase = transactionWhere({ ...filters, status: "closed" }, scope);
  const contactBase = contactWhere(filters, scope);
  const connectionBase = connectionWhere(filters, scope);
  const taskBase = taskWhere(filters, scope);
  const peopleBase = peopleWhere(scope);

  const [closedTransactionIssues] = await runRows(sql`
    SELECT
      SUM(CASE WHEN t.\`grossCommissionIncome\` IS NULL OR t.\`grossCommissionIncome\` <= 0 THEN 1 ELSE 0 END) AS missingGci,
      SUM(CASE WHEN t.\`payoutIntegrityFlag\` = 1 THEN 1 ELSE 0 END) AS payoutIntegrityFlags,
      SUM(CASE WHEN pay.\`payoutCount\` = 0 THEN 1 ELSE 0 END) AS missingPayouts
    FROM \`transactions\` t
    INNER JOIN \`users\` u ON u.\`id\` = t.\`agentId\`
    INNER JOIN \`contacts\` c ON c.\`id\` = t.\`primaryContactId\`
    LEFT JOIN (
      SELECT \`transactionId\`, COUNT(*) AS payoutCount
      FROM \`transaction_payout_items\`
      GROUP BY \`transactionId\`
    ) pay ON pay.\`transactionId\` = t.\`id\`
    ${transactionBase}
  `);
  const [contactIssues] = await runRows(sql`
    SELECT
      SUM(CASE WHEN c.\`leadSourceId\` IS NULL AND (c.\`campaignSource\` IS NULL OR c.\`campaignSource\` = '') THEN 1 ELSE 0 END) AS missingSource,
      SUM(CASE WHEN c.\`email\` IS NULL AND c.\`phone\` IS NULL THEN 1 ELSE 0 END) AS missingContactMethod
    FROM \`contacts\` c
    ${contactBase}
  `);
  const [pipelineIssues] = await runRows(sql`
    SELECT SUM(CASE WHEN ac.\`pipelineStatus\` NOT IN ('closed', 'dead')
      AND TIMESTAMPDIFF(DAY, COALESCE(ac.\`agingUpdatedAt\`, ac.\`updatedAt\`), NOW()) >= 14 THEN 1 ELSE 0 END) AS stalePipeline
    FROM \`agent_connections\` ac
    INNER JOIN \`contacts\` c ON c.\`id\` = ac.\`contactId\`
    INNER JOIN \`users\` u ON u.\`id\` = ac.\`agentId\`
    ${connectionBase}
  `);
  const [taskIssues] = await runRows(sql`
    SELECT SUM(CASE WHEN tk.\`status\` IN ('pending', 'in_progress') AND tk.\`dueDate\` < NOW() THEN 1 ELSE 0 END) AS overdueTasks
    FROM \`tasks\` tk
    ${taskBase}
  `);
  const [goalIssues] = await runRows(sql`
    SELECT COUNT(*) AS missingAnnualGoals
    FROM \`users\` u
    LEFT JOIN \`agent_goals\` ag ON ag.\`agentId\` = u.\`id\`
      AND ag.\`year\` = ${new Date().getUTCFullYear()} AND ag.\`month\` = 0
    ${peopleBase}
    AND u.\`role\` = 'agent'
    AND ag.\`id\` IS NULL
  `);

  const issues = [
    { key: "missingGci", label: "Closed transactions missing GCI", count: asNumber(closedTransactionIssues?.missingGci), severity: "high", drilldown: "transactions" as const },
    { key: "payoutIntegrityFlags", label: "Transactions with payout integrity flags", count: asNumber(closedTransactionIssues?.payoutIntegrityFlags), severity: "high", drilldown: "transactions" as const },
    { key: "missingPayouts", label: "Closed transactions without payout items", count: asNumber(closedTransactionIssues?.missingPayouts), severity: "medium", drilldown: "transactions" as const },
    { key: "missingSource", label: "Contacts without a lead source", count: asNumber(contactIssues?.missingSource), severity: "medium", drilldown: "sources" as const },
    { key: "missingContactMethod", label: "Contacts without email or phone", count: asNumber(contactIssues?.missingContactMethod), severity: "medium", drilldown: "sources" as const },
    { key: "stalePipeline", label: "Pipeline records inactive for 14+ days", count: asNumber(pipelineIssues?.stalePipeline), severity: "high", drilldown: "pipeline" as const },
    { key: "overdueTasks", label: "Overdue open tasks", count: asNumber(taskIssues?.overdueTasks), severity: "high", drilldown: "tasks" as const },
    { key: "missingAnnualGoals", label: "Active agents without annual goals", count: asNumber(goalIssues?.missingAnnualGoals), severity: "low", drilldown: "people" as const },
  ];
  return { issues, total: issues.reduce((sum, issue) => sum + issue.count, 0) };
}

async function getFilters(scope: AnalyticsScope) {
  const agents = await runRows(sql`
    SELECT u.\`id\` AS id, u.\`name\` AS name, u.\`role\` AS role, u.\`marketProfileId\` AS marketProfileId
    FROM \`users\` u
    ${combineWhere([
      numericListClause("u", "id", scope.isaId ? [scope.isaId] : scope.agentIds),
      sql`u.\`isActive\` = 1`,
      scope.isaId ? sql`u.\`id\` = ${scope.isaId}` : sql`u.\`role\` IN ('agent', 'isa', 'agent_support')`,
    ])}
    ORDER BY u.\`name\` ASC
  `);
  const markets = scope.role === "admin"
    ? await runRows(sql`SELECT \`id\` AS id, \`name\` AS name, \`status\` AS status FROM \`market_profiles\` ORDER BY \`name\` ASC`)
    : [];
  const sources = await runRows(sql`
    SELECT \`id\` AS id, \`name\` AS name, \`parentId\` AS parentId, \`campaignType\` AS campaignType
    FROM \`lead_sources\`
    WHERE \`isActive\` = 1
    ORDER BY \`name\` ASC
  `);
  return {
    agents: agents.map((agent) => ({ id: asNumber(agent.id), name: String(agent.name ?? "Unnamed"), role: String(agent.role ?? "agent"), marketProfileId: asNullableNumber(agent.marketProfileId) })),
    markets: markets.map((market) => ({ id: asNumber(market.id), name: String(market.name ?? "Unnamed market"), status: String(market.status ?? "active") })),
    sources: sources.map((source) => ({ id: asNumber(source.id), name: String(source.name ?? "Unattributed"), parentId: asNullableNumber(source.parentId), campaignType: source.campaignType ? String(source.campaignType) : null })),
  };
}

async function getMarketConfiguration(scope: AnalyticsScope) {
  if (scope.role !== "admin") return [];
  const rows = await runRows(sql`
    SELECT
      mp.\`id\` AS id,
      mp.\`name\` AS name,
      mp.\`state\` AS state,
      mp.\`region\` AS region,
      mp.\`status\` AS status,
      mp.\`annualGciGoal\` AS annualGciGoal,
      COUNT(DISTINCT maa.\`agentId\`) AS assignedAgents,
      SUM(CASE WHEN ap.\`licenseExpirationDate\` IS NOT NULL AND ap.\`licenseExpirationDate\` < DATE_ADD(NOW(), INTERVAL 90 DAY) THEN 1 ELSE 0 END) AS licensesExpiringSoon
    FROM \`market_profiles\` mp
    LEFT JOIN \`market_agent_assignments\` maa ON maa.\`marketProfileId\` = mp.\`id\`
    LEFT JOIN \`agent_profiles\` ap ON ap.\`userId\` = maa.\`agentId\`
    GROUP BY mp.\`id\`, mp.\`name\`, mp.\`state\`, mp.\`region\`, mp.\`status\`, mp.\`annualGciGoal\`
    ORDER BY mp.\`name\` ASC
  `);
  return rows.map((row) => ({
    id: asNumber(row.id),
    name: String(row.name ?? "Unnamed market"),
    state: String(row.state ?? ""),
    region: row.region ? String(row.region) : null,
    status: String(row.status ?? "active"),
    annualGciGoal: asNullableNumber(row.annualGciGoal),
    assignedAgents: asNumber(row.assignedAgents),
    licensesExpiringSoon: asNumber(row.licensesExpiringSoon),
  }));
}

export async function getAnalyticsWorkspace(viewer: AnalyticsViewer, rawFilters: AnalyticsFilters) {
  const filters: AnalyticsFilters = {
    ...rawFilters,
    status: rawFilters.status ?? "all",
    dateFrom: rawFilters.dateFrom ?? new Date(new Date().getUTCFullYear(), 0, 1),
    dateTo: rawFilters.dateTo ?? new Date(),
  };
  const scope = await resolveScope(viewer, filters);
  const prior = previousRange(filters);

  const [transactions, current, priorMetrics, trend, sources, pipeline, tasks, people, dataQuality, availableFilters, markets] = await Promise.all([
    getTransactions(filters, scope),
    getClosedPeriodMetrics(filters, scope, filters),
    getClosedPeriodMetrics(filters, scope, prior),
    getTrend(filters, scope),
    getSources(filters, scope),
    getPipeline(filters, scope),
    getTasks(filters, scope),
    getPeople(filters, scope),
    getDataQuality(filters, scope),
    getFilters(scope),
    getMarketConfiguration(scope),
  ]);

  const underContract = transactions.rows.filter((transaction) => transaction.status === "under_contract");
  const pipelineValue = underContract.reduce((sum, transaction) => sum + transaction.purchasePrice, 0);
  const summary = {
    closings: current.closings,
    gci: current.gci,
    volume: current.volume,
    averageGci: current.averageGci,
    averageVolume: current.averageVolume,
    medianGci: transactions.aggregates.medianGci,
    medianVolume: transactions.aggregates.medianVolume,
    companyDollars: transactions.aggregates.totalCompanyDollars,
    underContractCount: underContract.length,
    pipelineValue,
    gciTrendPct: safePercent(current.gci, priorMetrics.gci),
    closingsTrendPct: safePercent(current.closings, priorMetrics.closings),
    volumeTrendPct: safePercent(current.volume, priorMetrics.volume),
    prior: priorMetrics,
  };

  return {
    version: "analytics-workspace-v1",
    generatedAt: new Date().toISOString(),
    scope: {
      label: scope.label,
      role: scope.role,
      canSeeFinance: scope.canSeeFinance,
      canRefreshInsights: scope.canRefreshInsights,
      agentIds: scope.agentIds ?? null,
      isaId: scope.isaId ?? null,
    },
    filters: {
      dateFrom: filters.dateFrom?.toISOString() ?? null,
      dateTo: filters.dateTo?.toISOString() ?? null,
      agentId: filters.agentId ?? null,
      marketProfileId: filters.marketProfileId ?? null,
      leadSourceId: filters.leadSourceId ?? null,
      status: filters.status ?? "all",
    },
    availableFilters,
    summary,
    trend,
    transactions,
    sources,
    pipeline,
    tasks,
    people,
    growth: {
      annualGoalCoverage: {
        peopleWithAnnualGciTargets: people.filter((person) => person.production.annualGciTarget !== null).length,
        activePeople: people.length,
        attainment: people.map((person) => ({
          userId: person.userId,
          name: person.name,
          gciTarget: person.production.annualGciTarget,
          gciAttainment: person.production.annualGciAttainment,
          closingsTarget: person.production.annualClosingsTarget,
          closingsAttainment: person.production.annualClosingsAttainment,
        })),
      },
      onboarding: people.filter((person) => person.onboarding.status === "in_progress" || person.onboarding.remainingTasks > 0),
      markets,
    },
    dataQuality,
    drilldowns: {
      transactions: transactions.rows,
      stalePipeline: pipeline.staleRecords,
      overdueFollowUps: pipeline.overdueFollowUps,
      overdueTasks: tasks.overdue,
      people,
    },
  };
}

async function makeScopeKey(viewer: AnalyticsViewer, filters: AnalyticsFilters): Promise<string> {
  // Requested filters never confer access. Include the resolved server-side scope
  // in the cache key so a reassignment, role change, or market reconfiguration
  // cannot surface an older cache that was generated for a broader portfolio.
  const resolvedScope = await resolveScope(viewer, filters);
  const dateFrom = filters.dateFrom ? isoDay(filters.dateFrom) : "all";
  const dateTo = filters.dateTo ? isoDay(filters.dateTo) : "now";
  const scopeDescriptor = resolvedScope.agentIds === undefined
    ? "company"
    : `agents:${Array.from(new Set(resolvedScope.agentIds)).sort((a, b) => a - b).join(",") || "none"}`;
  // Keep the persistent key safely below the indexed varchar(255) limit even
  // for an ISA or support user assigned to a large agent portfolio.
  const scopeFingerprint = createHash("sha256").update(scopeDescriptor).digest("hex").slice(0, 24);
  return [
    "v2",
    `viewer:${viewer.id}`,
    `role:${viewer.role}`,
    `scope:${scopeFingerprint}`,
    `isa:${resolvedScope.isaId ?? "none"}`,
    `from:${dateFrom}`,
    `to:${dateTo}`,
    `agent:${filters.agentId ?? "all"}`,
    `market:${filters.marketProfileId ?? "all"}`,
    `source:${filters.leadSourceId ?? "all"}`,
    `status:${filters.status ?? "all"}`,
  ].join("|");
}

function buildInsightFacts(workspace: Awaited<ReturnType<typeof getAnalyticsWorkspace>>) {
  return {
    generatedAt: workspace.generatedAt,
    reportScope: workspace.scope.label,
    dateRange: workspace.filters,
    company: workspace.summary,
    pipeline: {
      activeCount: workspace.pipeline.activeCount,
      stalledCount: workspace.pipeline.stalledCount,
      overdueFollowUpCount: workspace.pipeline.overdueFollowUpCount,
      stages: workspace.pipeline.funnel,
    },
    tasks: {
      openCount: workspace.tasks.openCount,
      overdueCount: workspace.tasks.overdueCount,
      completedCount: workspace.tasks.completedCount,
      completionRate: workspace.tasks.completionRate,
    },
    topSources: workspace.sources.slice(0, 8),
    people: workspace.people.slice(0, 25).map((person) => ({
      name: person.name,
      role: person.role,
      market: person.marketName,
      production: person.production,
      execution: person.execution,
      coaching: person.coaching,
      onboarding: person.onboarding,
    })),
    dataQuality: workspace.dataQuality,
  };
}

function buildDeterministicFallback(workspace: Awaited<ReturnType<typeof getAnalyticsWorkspace>>): AnalyticsInsightPayload {
  const insights: AnalyticsInsight[] = [];
  if (workspace.pipeline.stalledCount > 0) {
    insights.push({
      type: "warning",
      priority: "high",
      title: "Stalled active pipeline",
      observation: `${workspace.pipeline.stalledCount} active pipeline record(s) have had no qualifying activity for at least 14 days.`,
      explanation: "Inactive pipeline records and overdue follow-ups together indicate that execution coverage should be reviewed. This is an operational association, not proof of the cause of lost revenue.",
      confidence: "high",
      owner: "Agent / team leader",
      action: "Open the stale-pipeline drill-down, assign next steps, and confirm a dated follow-up for each active record.",
      connectedSignals: ["Pipeline aging", "Follow-up due dates"],
      evidence: [
        { label: "Stalled pipeline", value: String(workspace.pipeline.stalledCount), report: "Pipeline & Follow-Up", drilldown: "pipeline" },
        { label: "Overdue follow-ups", value: String(workspace.pipeline.overdueFollowUpCount), report: "Pipeline & Follow-Up", drilldown: "pipeline" },
      ],
    });
  }
  if (workspace.tasks.overdueCount > 0) {
    insights.push({
      type: "warning",
      priority: "high",
      title: "Open work past due",
      observation: `${workspace.tasks.overdueCount} open task(s) are overdue in the selected scope.`,
      explanation: "Tasks are the explicit execution commitments recorded in SavvyOS. Their age does not establish individual productivity, but unresolved work can help explain stalled records when it is linked to the same people or contacts.",
      confidence: "high",
      owner: "Task assignee",
      action: "Use the overdue-task drill-down to reassign, complete, or reschedule each item with an owner and due date.",
      connectedSignals: ["Task status", "Pipeline execution"],
      evidence: [
        { label: "Overdue tasks", value: String(workspace.tasks.overdueCount), report: "Pipeline & Follow-Up", drilldown: "tasks" },
        { label: "Completion rate", value: workspace.tasks.completionRate === null ? "Not available" : `${(workspace.tasks.completionRate * 100).toFixed(0)}%`, report: "Pipeline & Follow-Up", drilldown: "tasks" },
      ],
    });
  }
  if ((workspace.summary.gciTrendPct ?? 0) < -10) {
    insights.push({
      type: "coaching",
      priority: "medium",
      title: "Production is below prior period",
      observation: `Closed GCI is ${Math.abs(workspace.summary.gciTrendPct ?? 0).toFixed(1)}% below the comparable prior period.`,
      explanation: "The change can reflect timing, deal size, mix, or execution. Compare individual production, active pipeline, recorded activity, and coaching cadence before attributing a cause.",
      confidence: workspace.summary.prior.closings >= 3 ? "medium" : "limited",
      owner: "Leadership",
      action: "Open People & Execution and review production trends alongside last coaching date, current pipeline, and overdue work for the affected team members.",
      connectedSignals: ["Closed GCI trend", "Agent production", "Coaching cadence"],
      evidence: [
        { label: "Current GCI", value: `$${workspace.summary.gci.toLocaleString()}`, report: "Executive Scorecard", drilldown: "transactions" },
        { label: "Prior GCI", value: `$${workspace.summary.prior.gci.toLocaleString()}`, report: "Executive Scorecard", drilldown: "transactions" },
      ],
    });
  }
  if (!insights.length) {
    insights.push({
      type: "success",
      priority: "low",
      title: "No critical exception is currently surfaced",
      observation: "The selected scope has no recorded overdue task or 14-day stale pipeline exception in the current drill-down set.",
      explanation: "This reflects data currently captured in SavvyOS, not a statement that no business risk exists outside the system.",
      confidence: "limited",
      owner: "Leadership",
      action: "Review data-quality coverage and keep operational records current so future insights remain reliable.",
      connectedSignals: ["Data completeness", "Execution tracking"],
      evidence: [
        { label: "Data-quality issues", value: String(workspace.dataQuality.total), report: "Data Trust", drilldown: "dataQuality" },
        { label: "Active pipeline", value: String(workspace.pipeline.activeCount), report: "Pipeline & Follow-Up", drilldown: "pipeline" },
      ],
    });
  }
  return {
    summary: "This analysis is grounded in current SavvyOS operational and production records. It describes evidence-backed patterns and prioritizes drill-through rather than asserting unsupported causal conclusions.",
    dataQualityNote: `${workspace.dataQuality.total} data-quality exception(s) are currently surfaced in this scope; incomplete records reduce the confidence of downstream explanations.`,
    insights: insights.slice(0, 6),
  };
}

const INSIGHT_SCHEMA = {
  name: "savvy_analytics_insights",
  strict: true,
  schema: {
    type: "object",
    properties: {
      summary: { type: "string" },
      dataQualityNote: { type: "string" },
      insights: {
        type: "array",
        minItems: 1,
        maxItems: 7,
        items: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["warning", "opportunity", "coaching", "success", "data_quality"] },
            priority: { type: "string", enum: ["high", "medium", "low"] },
            title: { type: "string" },
            observation: { type: "string" },
            explanation: { type: "string" },
            confidence: { type: "string", enum: ["high", "medium", "limited"] },
            owner: { type: "string" },
            action: { type: "string" },
            connectedSignals: { type: "array", items: { type: "string" }, maxItems: 5 },
            evidence: {
              type: "array",
              minItems: 2,
              maxItems: 4,
              items: {
                type: "object",
                properties: {
                  label: { type: "string" },
                  value: { type: "string" },
                  report: { type: "string" },
                  drilldown: { type: "string", enum: ["transactions", "pipeline", "tasks", "people", "sources", "dataQuality"] },
                },
                required: ["label", "value", "report", "drilldown"],
                additionalProperties: false,
              },
            },
          },
          required: ["type", "priority", "title", "observation", "explanation", "confidence", "owner", "action", "connectedSignals", "evidence"],
          additionalProperties: false,
        },
      },
    },
    required: ["summary", "dataQualityNote", "insights"],
    additionalProperties: false,
  },
} as const;

async function createInsightPayload(workspace: Awaited<ReturnType<typeof getAnalyticsWorkspace>>): Promise<AnalyticsInsightPayload> {
  const facts = buildInsightFacts(workspace);
  try {
    const response = await invokeLLM({
      model: process.env.ANALYTICS_INSIGHTS_MODEL || "gpt-5",
      maxTokens: 6000,
      reasoning: { effort: "high" },
      messages: [
        {
          role: "system",
          content: `You are Savvy STR Agents' analytics strategist. Analyze only the supplied structured facts. Produce decision-quality explanations, not generic observations.\n\nRules:\n1. Never invent data, records, coaching outcomes, activity, or attribution.\n2. Never claim causation from observational data. State plausible mechanisms as hypotheses and distinguish them from evidence.\n3. Every insight must contain at least two exact evidence values already present in the facts, a report location, an accountable owner, and a concrete next action.\n4. Connect multiple levels where support exists: outcome -> pipeline/execution -> coaching/activity/data quality.\n5. Small counts, absent history, or data-quality exceptions require limited confidence.\n6. Do not shame individuals; use facts to prepare coaching or operational review.\n7. Explain why the pattern matters to Savvy's business, but preserve the limits of the data.`,
        },
        {
          role: "user",
          content: `Create 3–7 evidence-grounded analytics insights from this SavvyOS facts object:\n\n${JSON.stringify(facts)}`,
        },
      ],
      response_format: { type: "json_schema", json_schema: INSIGHT_SCHEMA },
    });
    const content = response.choices[0]?.message?.content;
    const parsed = typeof content === "string" ? JSON.parse(content) : null;
    if (!parsed || !Array.isArray(parsed.insights) || !parsed.insights.length) {
      throw new Error("Insight model returned an empty or malformed structured payload.");
    }
    return parsed as AnalyticsInsightPayload;
  } catch (error) {
    console.error("[AnalyticsInsights] Falling back to deterministic analysis:", error);
    return buildDeterministicFallback(workspace);
  }
}

function hydrateCachedInsight(row: Row) {
  const payload = row.insightPayload && typeof row.insightPayload === "object"
    ? row.insightPayload as AnalyticsInsightPayload
    : { summary: "No cached analysis is available.", dataQualityNote: "", insights: [] };
  return {
    ...payload,
    generatedAt: toIso(row.generatedAt),
    expiresAt: toIso(row.expiresAt),
    isStale: (asDate(row.expiresAt)?.getTime() ?? 0) <= Date.now(),
    status: String(row.status ?? "ready"),
    model: row.model ? String(row.model) : null,
    refreshReason: row.refreshReason ? String(row.refreshReason) : null,
    errorMessage: row.errorMessage ? String(row.errorMessage) : null,
  };
}

export async function getCachedAnalyticsInsights(viewer: AnalyticsViewer, filters: AnalyticsFilters) {
  const db = await getDb();
  if (!db) return null;
  const scopeKey = await makeScopeKey(viewer, filters);
  const [row] = await db
    .select()
    .from(analyticsInsightCaches)
    .where(eq(analyticsInsightCaches.scopeKey, scopeKey))
    .limit(1);
  return row ? hydrateCachedInsight(row as unknown as Row) : null;
}

export async function refreshAnalyticsInsights(options: {
  viewer: AnalyticsViewer;
  filters: AnalyticsFilters;
  force?: boolean;
  reason?: "manual" | "scheduled" | "automatic";
}) {
  const { viewer, filters, force = false, reason = "automatic" } = options;
  const db = await getDb();
  if (!db) throw new Error("Database is not available for analytics insight caching.");

  const scopeKey = await makeScopeKey(viewer, filters);
  const [existing] = await db
    .select()
    .from(analyticsInsightCaches)
    .where(eq(analyticsInsightCaches.scopeKey, scopeKey))
    .limit(1);

  const now = new Date();
  if (existing && !force && existing.status === "ready" && existing.expiresAt > now) {
    return { cache: hydrateCachedInsight(existing as unknown as Row), cacheHit: true };
  }
  if (existing && existing.status === "refreshing" && now.getTime() - existing.generatedAt.getTime() < CACHE_STALE_RUN_MS) {
    return { cache: hydrateCachedInsight(existing as unknown as Row), cacheHit: true, refreshing: true };
  }

  const serializedFilters = {
    dateFrom: filters.dateFrom?.toISOString() ?? null,
    dateTo: filters.dateTo?.toISOString() ?? null,
    agentId: filters.agentId ?? null,
    marketProfileId: filters.marketProfileId ?? null,
    leadSourceId: filters.leadSourceId ?? null,
    status: filters.status ?? "all",
  };

  if (existing) {
    await db
      .update(analyticsInsightCaches)
      .set({
        status: "refreshing",
        ownerUserId: viewer.id,
        viewerRole: viewer.role,
        filters: serializedFilters,
        generatedAt: now,
        errorMessage: null,
        refreshReason: reason,
      })
      .where(eq(analyticsInsightCaches.id, existing.id));
  } else {
    await db.insert(analyticsInsightCaches).values({
      scopeKey,
      ownerUserId: viewer.id,
      viewerRole: viewer.role,
      filters: serializedFilters,
      insightPayload: { summary: "Generating analysis…", dataQualityNote: "", insights: [] },
      facts: {},
      status: "refreshing",
      generatedAt: now,
      expiresAt: new Date(now.getTime() + CACHE_TTL_MS),
      refreshReason: reason,
      model: process.env.ANALYTICS_INSIGHTS_MODEL || "gpt-5",
    });
  }

  try {
    const workspace = await getAnalyticsWorkspace(viewer, filters);
    const payload = await createInsightPayload(workspace);
    const expiresAt = new Date(Date.now() + CACHE_TTL_MS);
    await db
      .update(analyticsInsightCaches)
      .set({
        insightPayload: payload,
        facts: buildInsightFacts(workspace),
        status: "ready",
        generatedAt: new Date(),
        expiresAt,
        errorMessage: null,
        refreshReason: reason,
        model: process.env.ANALYTICS_INSIGHTS_MODEL || "gpt-5",
      })
      .where(eq(analyticsInsightCaches.scopeKey, scopeKey));

    return {
      cache: {
        ...payload,
        generatedAt: new Date().toISOString(),
        expiresAt: expiresAt.toISOString(),
        isStale: false,
        status: "ready",
        model: process.env.ANALYTICS_INSIGHTS_MODEL || "gpt-5",
        refreshReason: reason,
        errorMessage: null,
      },
      cacheHit: false,
    };
  } catch (error: any) {
    const message = error instanceof Error ? error.message : String(error);
    await db
      .update(analyticsInsightCaches)
      .set({ status: "failed", errorMessage: message, expiresAt: new Date(Date.now() + DAY_MS) })
      .where(eq(analyticsInsightCaches.scopeKey, scopeKey));
    throw error;
  }
}

function filtersFromCachedRow(row: { filters: unknown }): AnalyticsFilters {
  const raw = (row.filters && typeof row.filters === "object" ? row.filters : {}) as Record<string, unknown>;
  const status = raw.status === "closed" || raw.status === "under_contract" || raw.status === "terminated" || raw.status === "all"
    ? raw.status
    : "all";
  return {
    dateFrom: raw.dateFrom ? new Date(String(raw.dateFrom)) : undefined,
    dateTo: raw.dateTo ? new Date(String(raw.dateTo)) : undefined,
    agentId: asNullableNumber(raw.agentId) ?? undefined,
    marketProfileId: asNullableNumber(raw.marketProfileId) ?? undefined,
    leadSourceId: asNullableNumber(raw.leadSourceId) ?? undefined,
    status,
  };
}

/**
 * Rebuilds only expired caches. It is safe to call daily because each cache has
 * a seven-day TTL; reports generate a cache on first authorized view and the
 * scheduler then keeps that exact scope fresh without multiplying rolling-date
 * cache records every day.
 */
export async function refreshDueAnalyticsInsights(): Promise<{ refreshed: number; failed: number }> {
  const db = await getDb();
  if (!db) return { refreshed: 0, failed: 0 };

  let refreshed = 0;
  let failed = 0;
  const due = await db
    .select()
    .from(analyticsInsightCaches)
    .where(lte(analyticsInsightCaches.expiresAt, new Date()))
    .limit(20);
  for (const entry of due) {
    const [owner] = await db
      .select({ id: users.id, role: users.role, isActive: users.isActive })
      .from(users)
      .where(eq(users.id, entry.ownerUserId))
      .limit(1);
    if (!owner || !owner.isActive) continue;
    try {
      await refreshAnalyticsInsights({
        viewer: { id: owner.id, role: owner.role },
        filters: filtersFromCachedRow(entry),
        force: true,
        reason: "scheduled",
      });
      refreshed += 1;
    } catch (error) {
      failed += 1;
      console.error(`[AnalyticsInsights] Scheduled refresh failed for cache ${entry.id}:`, error);
    }
  }
  return { refreshed, failed };
}

let insightScheduler: NodeJS.Timeout | undefined;
let insightStartupTimer: NodeJS.Timeout | undefined;

/** Poll daily; individual cache expiry preserves the required weekly minimum. */
export function scheduleAnalyticsInsightRefresh(): void {
  if (insightScheduler) clearInterval(insightScheduler);
  insightScheduler = setInterval(() => {
    refreshDueAnalyticsInsights()
      .then((result) => console.info(`[AnalyticsInsights] Scheduled refresh completed: ${result.refreshed} refreshed, ${result.failed} failed.`))
      .catch((error) => console.error("[AnalyticsInsights] Scheduled refresh error:", error));
  }, DAY_MS);

  if (insightStartupTimer) clearTimeout(insightStartupTimer);
  insightStartupTimer = setTimeout(() => {
    refreshDueAnalyticsInsights()
      .then((result) => console.info(`[AnalyticsInsights] Startup refresh completed: ${result.refreshed} refreshed, ${result.failed} failed.`))
      .catch((error) => console.error("[AnalyticsInsights] Startup refresh error:", error));
  }, 45_000);
}

export const analyticsInsightRefreshApi = {
  refreshDueAnalyticsInsights,
};
