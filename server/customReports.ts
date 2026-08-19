import { z } from "zod";
import { sql, type SQL } from "drizzle-orm";
import { getDb } from "./db";
import { invokeLLM } from "./_core/llm";

const DATASETS = [
  "transactions",
  "contacts",
  "proformas",
  "appointments",
  "tasks",
  "website_activity",
] as const;

const METRICS = [
  "transaction_count",
  "closed_count",
  "under_contract_count",
  "purchase_volume",
  "gross_commission",
  "savvy_net",
  "contact_count",
  "do_not_contact_count",
  "valid_email_count",
  "proforma_count",
  "final_proforma_count",
  "average_cash_flow",
  "average_cash_on_cash",
  "appointment_count",
  "task_count",
  "completed_task_count",
  "overdue_task_count",
  "website_activity_count",
  "property_view_count",
  "property_favorite_count",
  "analysis_request_count",
  "showing_request_count",
] as const;

const GROUP_BYS = [
  "none",
  "agent",
  "transaction_status",
  "transaction_type",
  "closing_month",
  "lead_source",
  "contact_status",
  "contact_state",
  "contact_created_month",
  "assigned_isa",
  "proforma_creator",
  "proforma_status",
  "proforma_created_month",
  "appointment_isa",
  "appointment_agent",
  "appointment_month",
  "task_assignee",
  "task_status",
  "task_type",
  "task_created_month",
  "activity_type",
  "activity_created_month",
] as const;

const dateValue = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable();

export const customReportDefinitionSchema = z.object({
  dataset: z.enum(DATASETS),
  title: z.string().min(3).max(120),
  description: z.string().min(8).max(360),
  metrics: z.array(z.enum(METRICS)).min(1).max(4),
  groupBy: z.enum(GROUP_BYS),
  dateFrom: dateValue,
  dateTo: dateValue,
  dateBasis: z.enum(["closing", "contract", "created"]),
  transactionStatus: z.enum(["all", "closed", "under_contract", "terminated"]),
  transactionType: z.enum(["all", "buyer", "seller", "dual"]),
  agentIds: z.array(z.number().int().positive()).max(25),
  isaIds: z.array(z.number().int().positive()).max(25).default([]),
  leadSourceIds: z.array(z.number().int().positive()).max(50),
  sortMetric: z.enum(METRICS),
  sortDirection: z.enum(["asc", "desc"]),
  limit: z.number().int().min(1).max(100),
});

export type CustomReportDefinition = z.infer<typeof customReportDefinitionSchema>;

export const customReportPromptSchema = z.object({
  prompt: z.string().trim().min(12).max(2_000),
});

type Dataset = CustomReportDefinition["dataset"];
type Metric = CustomReportDefinition["metrics"][number];
type GroupBy = CustomReportDefinition["groupBy"];

const metricsByDataset: Record<Dataset, ReadonlySet<string>> = {
  transactions: new Set([
    "transaction_count",
    "closed_count",
    "under_contract_count",
    "purchase_volume",
    "gross_commission",
    "savvy_net",
  ]),
  contacts: new Set([
    "contact_count",
    "do_not_contact_count",
    "valid_email_count",
  ]),
  proformas: new Set([
    "proforma_count",
    "final_proforma_count",
    "average_cash_flow",
    "average_cash_on_cash",
  ]),
  appointments: new Set(["appointment_count"]),
  tasks: new Set(["task_count", "completed_task_count", "overdue_task_count"]),
  website_activity: new Set([
    "website_activity_count",
    "property_view_count",
    "property_favorite_count",
    "analysis_request_count",
    "showing_request_count",
  ]),
};

const groupsByDataset: Record<Dataset, ReadonlySet<string>> = {
  transactions: new Set([
    "none",
    "agent",
    "transaction_status",
    "transaction_type",
    "closing_month",
    "lead_source",
  ]),
  contacts: new Set([
    "none",
    "lead_source",
    "contact_status",
    "contact_state",
    "contact_created_month",
    "assigned_isa",
  ]),
  proformas: new Set([
    "none",
    "proforma_creator",
    "proforma_status",
    "proforma_created_month",
  ]),
  appointments: new Set([
    "none",
    "appointment_isa",
    "appointment_agent",
    "appointment_month",
    "lead_source",
  ]),
  tasks: new Set([
    "none",
    "task_assignee",
    "task_status",
    "task_type",
    "task_created_month",
  ]),
  website_activity: new Set([
    "none",
    "activity_type",
    "activity_created_month",
    "lead_source",
    "assigned_isa",
  ]),
};

function rowsFromResult(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result) && Array.isArray(result[0])) {
    return result[0] as Array<Record<string, unknown>>;
  }
  if (Array.isArray(result)) return result as Array<Record<string, unknown>>;
  return [];
}

async function runRows(statement: SQL): Promise<Array<Record<string, unknown>>> {
  const db = await getDb();
  if (!db) throw new Error("SavvyOS data is temporarily unavailable.");
  const result = await (
    db as unknown as { execute: (query: SQL) => Promise<unknown> }
  ).execute(statement);
  return rowsFromResult(result);
}

function listClause(values: number[]): SQL | undefined {
  return values.length
    ? sql`(${sql.join(values.map(value => sql`${value}`), sql`, `)})`
    : undefined;
}

function whereClause(conditions: SQL[]): SQL {
  return conditions.length ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;
}

function dateRangeConditions(column: SQL, definition: CustomReportDefinition): SQL[] {
  const conditions: SQL[] = [];
  if (definition.dateFrom) conditions.push(sql`DATE(${column}) >= ${definition.dateFrom}`);
  if (definition.dateTo) conditions.push(sql`DATE(${column}) <= ${definition.dateTo}`);
  return conditions;
}

function metricStatements(metrics: Metric[], dataset: Dataset): SQL[] {
  const map: Record<Metric, SQL> = {
    transaction_count: sql`COUNT(t.\`id\`) AS \`transaction_count\``,
    closed_count: sql`SUM(CASE WHEN t.\`status\` = 'closed' THEN 1 ELSE 0 END) AS \`closed_count\``,
    under_contract_count: sql`SUM(CASE WHEN t.\`status\` = 'under_contract' THEN 1 ELSE 0 END) AS \`under_contract_count\``,
    purchase_volume: sql`COALESCE(SUM(COALESCE(t.\`purchasePrice\`, 0)), 0) AS \`purchase_volume\``,
    gross_commission: sql`COALESCE(SUM(COALESCE(t.\`grossCommissionIncome\`, 0)), 0) AS \`gross_commission\``,
    savvy_net: sql`COALESCE(SUM(COALESCE(pi.savvyNet, 0)), 0) AS \`savvy_net\``,
    contact_count: sql`COUNT(c.\`id\`) AS \`contact_count\``,
    do_not_contact_count: sql`SUM(CASE WHEN c.\`doNotContact\` = 1 THEN 1 ELSE 0 END) AS \`do_not_contact_count\``,
    valid_email_count: sql`SUM(CASE WHEN c.\`emailStatus\` = 'valid' AND c.\`email\` IS NOT NULL THEN 1 ELSE 0 END) AS \`valid_email_count\``,
    proforma_count: sql`COUNT(p.\`id\`) AS \`proforma_count\``,
    final_proforma_count: sql`SUM(CASE WHEN p.\`status\` = 'final' THEN 1 ELSE 0 END) AS \`final_proforma_count\``,
    average_cash_flow: sql`COALESCE(AVG(COALESCE(p.\`cashFlowAnnual\`, 0)), 0) AS \`average_cash_flow\``,
    average_cash_on_cash: sql`COALESCE(AVG(COALESCE(p.\`cashOnCash\`, 0)), 0) AS \`average_cash_on_cash\``,
    appointment_count: sql`COUNT(ac.\`id\`) AS \`appointment_count\``,
    task_count: sql`COUNT(tk.\`id\`) AS \`task_count\``,
    completed_task_count: sql`SUM(CASE WHEN tk.\`status\` = 'completed' THEN 1 ELSE 0 END) AS \`completed_task_count\``,
    overdue_task_count: sql`SUM(CASE WHEN tk.\`status\` NOT IN ('completed', 'cancelled') AND tk.\`dueDate\` IS NOT NULL AND DATE(tk.\`dueDate\`) < CURRENT_DATE THEN 1 ELSE 0 END) AS \`overdue_task_count\``,
    website_activity_count: sql`COUNT(al.\`id\`) AS \`website_activity_count\``,
    property_view_count: sql`SUM(CASE WHEN al.\`action\` = 'property_viewed' THEN 1 ELSE 0 END) AS \`property_view_count\``,
    property_favorite_count: sql`SUM(CASE WHEN al.\`action\` = 'property_favorited' THEN 1 ELSE 0 END) AS \`property_favorite_count\``,
    analysis_request_count: sql`SUM(CASE WHEN al.\`action\` = 'analysis_requested' THEN 1 ELSE 0 END) AS \`analysis_request_count\``,
    showing_request_count: sql`SUM(CASE WHEN al.\`action\` = 'showing_requested' THEN 1 ELSE 0 END) AS \`showing_request_count\``,
  };
  return metrics.filter(metric => metricsByDataset[dataset].has(metric)).map(metric => map[metric]);
}

function defaultGroup(): { select: SQL[]; group: SQL[] } {
  return {
    select: [sql`'all' AS \`group_key\``, sql`'All matching records' AS \`group_label\``],
    group: [],
  };
}

function groupFor(definition: CustomReportDefinition): { select: SQL[]; group: SQL[] } {
  switch (definition.groupBy) {
    case "agent":
      return {
        select: [sql`t.\`agentId\` AS \`group_key\``, sql`COALESCE(u.\`name\`, 'Unassigned') AS \`group_label\``],
        group: [sql`t.\`agentId\``, sql`u.\`name\``],
      };
    case "transaction_status":
      return { select: [sql`t.\`status\` AS \`group_key\``, sql`t.\`status\` AS \`group_label\``], group: [sql`t.\`status\``] };
    case "transaction_type":
      return { select: [sql`t.\`transactionType\` AS \`group_key\``, sql`t.\`transactionType\` AS \`group_label\``], group: [sql`t.\`transactionType\``] };
    case "closing_month": {
      const column = definition.dateBasis === "contract" ? sql`t.\`contractDate\`` : definition.dateBasis === "created" ? sql`t.\`createdAt\`` : sql`t.\`closingDate\``;
      return {
        select: [sql`DATE_FORMAT(${column}, '%Y-%m') AS \`group_key\``, sql`DATE_FORMAT(${column}, '%b %Y') AS \`group_label\``],
        group: [sql`DATE_FORMAT(${column}, '%Y-%m')`, sql`DATE_FORMAT(${column}, '%b %Y')`],
      };
    }
    case "lead_source":
      return {
        select: [sql`COALESCE(ls.\`id\`, 0) AS \`group_key\``, sql`COALESCE(ls.\`name\`, 'Unattributed') AS \`group_label\``],
        group: [sql`ls.\`id\``, sql`ls.\`name\``],
      };
    case "contact_status":
      return { select: [sql`COALESCE(c.\`isaStatus\`, 'unassigned') AS \`group_key\``, sql`COALESCE(c.\`isaStatus\`, 'Unassigned') AS \`group_label\``], group: [sql`c.\`isaStatus\``] };
    case "contact_state":
      return { select: [sql`COALESCE(c.\`state\`, 'unknown') AS \`group_key\``, sql`COALESCE(c.\`state\`, 'Unknown') AS \`group_label\``], group: [sql`c.\`state\``] };
    case "contact_created_month":
      return {
        select: [sql`DATE_FORMAT(c.\`createdAt\`, '%Y-%m') AS \`group_key\``, sql`DATE_FORMAT(c.\`createdAt\`, '%b %Y') AS \`group_label\``],
        group: [sql`DATE_FORMAT(c.\`createdAt\`, '%Y-%m')`, sql`DATE_FORMAT(c.\`createdAt\`, '%b %Y')`],
      };
    case "assigned_isa":
    case "appointment_isa":
      return {
        select: [sql`COALESCE(isa.\`id\`, 0) AS \`group_key\``, sql`COALESCE(isa.\`name\`, 'Unassigned') AS \`group_label\``],
        group: [sql`isa.\`id\``, sql`isa.\`name\``],
      };
    case "proforma_creator":
      return {
        select: [sql`COALESCE(pu.\`id\`, 0) AS \`group_key\``, sql`COALESCE(pu.\`name\`, 'Unknown user') AS \`group_label\``],
        group: [sql`pu.\`id\``, sql`pu.\`name\``],
      };
    case "proforma_status":
      return { select: [sql`p.\`status\` AS \`group_key\``, sql`p.\`status\` AS \`group_label\``], group: [sql`p.\`status\``] };
    case "proforma_created_month":
      return {
        select: [sql`DATE_FORMAT(p.\`createdAt\`, '%Y-%m') AS \`group_key\``, sql`DATE_FORMAT(p.\`createdAt\`, '%b %Y') AS \`group_label\``],
        group: [sql`DATE_FORMAT(p.\`createdAt\`, '%Y-%m')`, sql`DATE_FORMAT(p.\`createdAt\`, '%b %Y')`],
      };
    case "appointment_agent":
      return {
        select: [sql`COALESCE(au.\`id\`, 0) AS \`group_key\``, sql`COALESCE(au.\`name\`, 'Unknown agent') AS \`group_label\``],
        group: [sql`au.\`id\``, sql`au.\`name\``],
      };
    case "appointment_month":
      return {
        select: [sql`DATE_FORMAT(COALESCE(ac.\`appointmentSetAt\`, ac.\`createdAt\`), '%Y-%m') AS \`group_key\``, sql`DATE_FORMAT(COALESCE(ac.\`appointmentSetAt\`, ac.\`createdAt\`), '%b %Y') AS \`group_label\``],
        group: [sql`DATE_FORMAT(COALESCE(ac.\`appointmentSetAt\`, ac.\`createdAt\`), '%Y-%m')`, sql`DATE_FORMAT(COALESCE(ac.\`appointmentSetAt\`, ac.\`createdAt\`), '%b %Y')`],
      };
    case "task_assignee":
      return {
        select: [sql`COALESCE(tu.\`id\`, 0) AS \`group_key\``, sql`COALESCE(tu.\`name\`, 'Unassigned') AS \`group_label\``],
        group: [sql`tu.\`id\``, sql`tu.\`name\``],
      };
    case "task_status":
      return { select: [sql`tk.\`status\` AS \`group_key\``, sql`tk.\`status\` AS \`group_label\``], group: [sql`tk.\`status\``] };
    case "task_type":
      return { select: [sql`COALESCE(tk.\`taskType\`, 'other') AS \`group_key\``, sql`COALESCE(tk.\`taskType\`, 'Other') AS \`group_label\``], group: [sql`tk.\`taskType\``] };
    case "task_created_month":
      return {
        select: [sql`DATE_FORMAT(tk.\`createdAt\`, '%Y-%m') AS \`group_key\``, sql`DATE_FORMAT(tk.\`createdAt\`, '%b %Y') AS \`group_label\``],
        group: [sql`DATE_FORMAT(tk.\`createdAt\`, '%Y-%m')`, sql`DATE_FORMAT(tk.\`createdAt\`, '%b %Y')`],
      };
    case "activity_type":
      return { select: [sql`al.\`action\` AS \`group_key\``, sql`al.\`action\` AS \`group_label\``], group: [sql`al.\`action\``] };
    case "activity_created_month":
      return {
        select: [sql`DATE_FORMAT(al.\`createdAt\`, '%Y-%m') AS \`group_key\``, sql`DATE_FORMAT(al.\`createdAt\`, '%b %Y') AS \`group_label\``],
        group: [sql`DATE_FORMAT(al.\`createdAt\`, '%Y-%m')`, sql`DATE_FORMAT(al.\`createdAt\`, '%b %Y')`],
      };
    default:
      return defaultGroup();
  }
}

function transactionWhere(definition: CustomReportDefinition): SQL {
  const dateColumn = definition.dateBasis === "contract" ? sql`t.\`contractDate\`` : definition.dateBasis === "created" ? sql`t.\`createdAt\`` : sql`t.\`closingDate\``;
  const conditions = dateRangeConditions(dateColumn, definition);
  if (definition.transactionStatus !== "all") conditions.push(sql`t.\`status\` = ${definition.transactionStatus}`);
  if (definition.transactionType !== "all") conditions.push(sql`t.\`transactionType\` = ${definition.transactionType}`);
  const agentIds = listClause(definition.agentIds);
  if (agentIds) conditions.push(sql`t.\`agentId\` IN ${agentIds}`);
  const leadSourceIds = listClause(definition.leadSourceIds);
  if (leadSourceIds) conditions.push(sql`c.\`leadSourceId\` IN ${leadSourceIds}`);
  return whereClause(conditions);
}

function contactWhere(definition: CustomReportDefinition): SQL {
  const conditions = dateRangeConditions(sql`c.\`createdAt\``, definition);
  const leadSourceIds = listClause(definition.leadSourceIds);
  if (leadSourceIds) conditions.push(sql`c.\`leadSourceId\` IN ${leadSourceIds}`);
  const isaIds = listClause(definition.isaIds);
  if (isaIds) conditions.push(sql`c.\`assignedIsaId\` IN ${isaIds}`);
  return whereClause(conditions);
}

function proformaWhere(definition: CustomReportDefinition): SQL {
  const conditions = dateRangeConditions(sql`p.\`createdAt\``, definition);
  const agentIds = listClause(definition.agentIds);
  if (agentIds) conditions.push(sql`p.\`createdByUserId\` IN ${agentIds}`);
  return whereClause(conditions);
}

function appointmentWhere(definition: CustomReportDefinition): SQL {
  const conditions: SQL[] = [sql`ac.\`appointmentSet\` = 1`, ...dateRangeConditions(sql`COALESCE(ac.\`appointmentSetAt\`, ac.\`createdAt\`)`, definition)];
  const agentIds = listClause(definition.agentIds);
  if (agentIds) conditions.push(sql`ac.\`agentId\` IN ${agentIds}`);
  const isaIds = listClause(definition.isaIds);
  if (isaIds) conditions.push(sql`c.\`assignedIsaId\` IN ${isaIds}`);
  const leadSourceIds = listClause(definition.leadSourceIds);
  if (leadSourceIds) conditions.push(sql`c.\`leadSourceId\` IN ${leadSourceIds}`);
  return whereClause(conditions);
}

function taskWhere(definition: CustomReportDefinition): SQL {
  const conditions = dateRangeConditions(sql`tk.\`createdAt\``, definition);
  const assigneeIds = listClause(definition.agentIds);
  if (assigneeIds) conditions.push(sql`tk.\`assignedToId\` IN ${assigneeIds}`);
  return whereClause(conditions);
}

function activityWhere(definition: CustomReportDefinition): SQL {
  const contactExpression = sql`COALESCE(al.\`relatedContactId\`, CASE WHEN al.\`entityType\` = 'contact' THEN al.\`entityId\` END)`;
  const conditions: SQL[] = [
    sql`al.\`action\` IN ('property_viewed', 'property_favorited', 'analysis_requested', 'showing_requested')`,
    ...dateRangeConditions(sql`al.\`createdAt\``, definition),
  ];
  const leadSourceIds = listClause(definition.leadSourceIds);
  if (leadSourceIds) conditions.push(sql`c.\`leadSourceId\` IN ${leadSourceIds}`);
  const isaIds = listClause(definition.isaIds);
  if (isaIds) conditions.push(sql`c.\`assignedIsaId\` IN ${isaIds}`);
  const agentIds = listClause(definition.agentIds);
  if (agentIds) conditions.push(sql`EXISTS (SELECT 1 FROM \`agent_connections\` ac_scope WHERE ac_scope.\`contactId\` = ${contactExpression} AND ac_scope.\`agentId\` IN ${agentIds})`);
  return whereClause(conditions);
}

function formatMetricLabel(metric: string): string {
  const labels: Record<string, string> = {
    proforma_count: "Proformas Run",
    final_proforma_count: "Final Proformas",
    average_cash_flow: "Average Annual Cash Flow",
    average_cash_on_cash: "Average Cash-on-Cash Return",
    appointment_count: "Appointments Set",
    task_count: "Tasks",
    completed_task_count: "Completed Tasks",
    overdue_task_count: "Overdue Tasks",
    website_activity_count: "Website Intent Signals",
    property_view_count: "Property Views",
    property_favorite_count: "Properties Favorited",
    analysis_request_count: "Analysis Requests",
    showing_request_count: "Showing Requests",
  };
  return labels[metric] ?? metric.replace(/_/g, " ").replace(/\b\w/g, character => character.toUpperCase());
}

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeRows(rows: Array<Record<string, unknown>>, metrics: Metric[]) {
  return rows.map(row => {
    const normalized: Record<string, string | number> = {
      group_key: String(row.group_key ?? "all"),
      group_label: String(row.group_label ?? "All matching records"),
    };
    for (const metric of metrics) normalized[metric] = toNumber(row[metric]);
    return normalized;
  });
}

function buildStatement(definition: CustomReportDefinition, group: { select: SQL[]; group: SQL[] }, metrics: SQL[]): SQL {
  const order = definition.sortDirection === "asc" ? sql`ASC` : sql`DESC`;
  const groupBy = group.group.length ? sql`GROUP BY ${sql.join(group.group, sql`, `)}` : sql``;
  const orderBy = sql`ORDER BY \`${sql.raw(definition.sortMetric)}\` ${order}, \`group_label\` ASC LIMIT ${definition.limit}`;

  switch (definition.dataset) {
    case "transactions":
      return sql`
        SELECT ${sql.join([...group.select, ...metrics], sql`, `)}
        FROM \`transactions\` t
        LEFT JOIN \`users\` u ON u.\`id\` = t.\`agentId\`
        LEFT JOIN \`contacts\` c ON c.\`id\` = t.\`primaryContactId\`
        LEFT JOIN \`lead_sources\` ls ON ls.\`id\` = c.\`leadSourceId\`
        LEFT JOIN (
          SELECT \`transactionId\`, COALESCE(SUM(CASE WHEN \`payeeType\` = 'savvy_str_agents' THEN COALESCE(\`amount\`, 0) ELSE 0 END), 0) AS savvyNet
          FROM \`transaction_payout_items\`
          GROUP BY \`transactionId\`
        ) pi ON pi.\`transactionId\` = t.\`id\`
        ${transactionWhere(definition)}
        ${groupBy}
        ${orderBy}
      `;
    case "contacts":
      return sql`
        SELECT ${sql.join([...group.select, ...metrics], sql`, `)}
        FROM \`contacts\` c
        LEFT JOIN \`lead_sources\` ls ON ls.\`id\` = c.\`leadSourceId\`
        LEFT JOIN \`users\` isa ON isa.\`id\` = c.\`assignedIsaId\`
        ${contactWhere(definition)}
        ${groupBy}
        ${orderBy}
      `;
    case "proformas":
      return sql`
        SELECT ${sql.join([...group.select, ...metrics], sql`, `)}
        FROM \`proformas\` p
        LEFT JOIN \`users\` pu ON pu.\`id\` = p.\`createdByUserId\`
        ${proformaWhere(definition)}
        ${groupBy}
        ${orderBy}
      `;
    case "appointments":
      return sql`
        SELECT ${sql.join([...group.select, ...metrics], sql`, `)}
        FROM \`agent_connections\` ac
        INNER JOIN \`contacts\` c ON c.\`id\` = ac.\`contactId\`
        LEFT JOIN \`users\` isa ON isa.\`id\` = c.\`assignedIsaId\`
        LEFT JOIN \`users\` au ON au.\`id\` = ac.\`agentId\`
        LEFT JOIN \`lead_sources\` ls ON ls.\`id\` = c.\`leadSourceId\`
        ${appointmentWhere(definition)}
        ${groupBy}
        ${orderBy}
      `;
    case "tasks":
      return sql`
        SELECT ${sql.join([...group.select, ...metrics], sql`, `)}
        FROM \`tasks\` tk
        LEFT JOIN \`users\` tu ON tu.\`id\` = tk.\`assignedToId\`
        ${taskWhere(definition)}
        ${groupBy}
        ${orderBy}
      `;
    case "website_activity":
      return sql`
        SELECT ${sql.join([...group.select, ...metrics], sql`, `)}
        FROM \`activity_log\` al
        LEFT JOIN \`contacts\` c ON c.\`id\` = COALESCE(al.\`relatedContactId\`, CASE WHEN al.\`entityType\` = 'contact' THEN al.\`entityId\` END)
        LEFT JOIN \`lead_sources\` ls ON ls.\`id\` = c.\`leadSourceId\`
        LEFT JOIN \`users\` isa ON isa.\`id\` = c.\`assignedIsaId\`
        ${activityWhere(definition)}
        ${groupBy}
        ${orderBy}
      `;
  }
}

export async function executeCustomReport(rawDefinition: unknown) {
  const definition = customReportDefinitionSchema.parse(rawDefinition);
  const validMetrics = definition.metrics.filter(metric => metricsByDataset[definition.dataset].has(metric));
  if (!validMetrics.length) throw new Error("The report definition has no valid metrics for its selected dataset.");
  if (!groupsByDataset[definition.dataset].has(definition.groupBy)) {
    throw new Error(`This grouping is not available for ${definition.dataset.replace(/_/g, " ")} reports.`);
  }
  if (!validMetrics.includes(definition.sortMetric)) {
    throw new Error("The sorting metric must be included in the report metrics.");
  }

  const rows = normalizeRows(
    await runRows(buildStatement(definition, groupFor(definition), metricStatements(validMetrics, definition.dataset))),
    validMetrics,
  );

  return {
    definition: { ...definition, metrics: validMetrics },
    columns: [
      { key: "group_label", label: definition.groupBy === "none" ? "Scope" : "Group", type: "text" as const },
      ...validMetrics.map(metric => ({ key: metric, label: formatMetricLabel(metric), type: "number" as const })),
    ],
    rows,
    summary: `${rows.length} ${rows.length === 1 ? "result" : "results"} from the approved ${definition.dataset.replace(/_/g, " ")} reporting dataset.`,
    generatedAt: new Date().toISOString(),
  };
}

const plannerSchema = {
  type: "object",
  properties: {
    dataset: { type: "string", enum: DATASETS },
    title: { type: "string" },
    description: { type: "string" },
    metrics: { type: "array", items: { type: "string", enum: METRICS } },
    groupBy: { type: "string", enum: GROUP_BYS },
    dateFrom: { type: ["string", "null"] },
    dateTo: { type: ["string", "null"] },
    dateBasis: { type: "string", enum: ["closing", "contract", "created"] },
    transactionStatus: { type: "string", enum: ["all", "closed", "under_contract", "terminated"] },
    transactionType: { type: "string", enum: ["all", "buyer", "seller", "dual"] },
    agentIds: { type: "array", items: { type: "integer" } },
    isaIds: { type: "array", items: { type: "integer" } },
    leadSourceIds: { type: "array", items: { type: "integer" } },
    sortMetric: { type: "string", enum: METRICS },
    sortDirection: { type: "string", enum: ["asc", "desc"] },
    limit: { type: "integer" },
  },
  required: ["dataset", "title", "description", "metrics", "groupBy", "dateFrom", "dateTo", "dateBasis", "transactionStatus", "transactionType", "agentIds", "isaIds", "leadSourceIds", "sortMetric", "sortDirection", "limit"],
  additionalProperties: false,
};

function localDate(value: Date): string {
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 10);
}

function deterministicDateRange(prompt: string): Pick<CustomReportDefinition, "dateFrom" | "dateTo"> {
  const normalized = prompt.toLowerCase();
  const today = new Date();
  const todayValue = localDate(today);
  if (/\b(this|current) week\b/.test(normalized)) {
    const start = new Date(today);
    const dayOffset = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - dayOffset);
    return { dateFrom: localDate(start), dateTo: todayValue };
  }
  if (/\blast week\b/.test(normalized)) {
    const end = new Date(today);
    const dayOffset = (end.getDay() + 6) % 7;
    end.setDate(end.getDate() - dayOffset - 1);
    const start = new Date(end);
    start.setDate(start.getDate() - 6);
    return { dateFrom: localDate(start), dateTo: localDate(end) };
  }
  if (/\b(this|current) quarter\b/.test(normalized)) {
    const quarterStartMonth = Math.floor(today.getMonth() / 3) * 3;
    return { dateFrom: localDate(new Date(today.getFullYear(), quarterStartMonth, 1)), dateTo: todayValue };
  }
  if (/\blast quarter\b/.test(normalized)) {
    const currentQuarterStart = Math.floor(today.getMonth() / 3) * 3;
    const end = new Date(today.getFullYear(), currentQuarterStart, 0);
    const start = new Date(end.getFullYear(), Math.floor(end.getMonth() / 3) * 3, 1);
    return { dateFrom: localDate(start), dateTo: localDate(end) };
  }
  if (/\b(this|current) year\b|\bytd\b|\byear to date\b/.test(normalized)) {
    return { dateFrom: localDate(new Date(today.getFullYear(), 0, 1)), dateTo: todayValue };
  }
  if (/\blast year\b/.test(normalized)) {
    return { dateFrom: `${today.getFullYear() - 1}-01-01`, dateTo: `${today.getFullYear() - 1}-12-31` };
  }
  const lastDays = normalized.match(/\blast\s+(\d{1,3})\s+days?\b/);
  if (lastDays) {
    const days = Math.max(1, Math.min(365, Number(lastDays[1])));
    const start = new Date(today);
    start.setDate(start.getDate() - days + 1);
    return { dateFrom: localDate(start), dateTo: todayValue };
  }
  if (/\b(this|current) month\b/.test(normalized)) {
    return { dateFrom: localDate(new Date(today.getFullYear(), today.getMonth(), 1)), dateTo: todayValue };
  }
  return { dateFrom: null, dateTo: null };
}

function baseDefinition(dataset: Dataset, title: string, description: string, metrics: Metric[], groupBy: GroupBy, prompt: string): CustomReportDefinition {
  const dateRange = deterministicDateRange(prompt);
  return customReportDefinitionSchema.parse({
    dataset,
    title,
    description,
    metrics,
    groupBy,
    ...dateRange,
    dateBasis: "created",
    transactionStatus: "all",
    transactionType: "all",
    agentIds: [],
    isaIds: [],
    leadSourceIds: [],
    sortMetric: metrics[0],
    sortDirection: "desc",
    limit: 100,
  });
}

function deterministicCustomReportPlan(prompt: string): CustomReportDefinition {
  const normalized = prompt.toLowerCase();

  if (/\b(proformas?|pro-formas?|pro formas?)\b/.test(normalized)) {
    const groupBy: GroupBy = /\b(by|per) (agent|user)|\bagents?\b/.test(normalized) ? "proforma_creator" : /\b(status|draft|final)\b/.test(normalized) ? "proforma_status" : /\b(month|monthly)\b/.test(normalized) ? "proforma_created_month" : "none";
    const metrics: Metric[] = ["proforma_count"];
    if (/\b(final|finalized)\b/.test(normalized)) metrics.push("final_proforma_count");
    if (/\b(cash flow)\b/.test(normalized)) metrics.push("average_cash_flow");
    if (/\b(cash on cash|coc)\b/.test(normalized)) metrics.push("average_cash_on_cash");
    return baseDefinition("proformas", "Custom Pro Forma Report", "SavvyOS interpreted your request against saved pro forma records.", metrics, groupBy, prompt);
  }

  if (/\b(appointment|appointments)\b/.test(normalized)) {
    const groupBy: GroupBy = /\b(by|per) (isa|isas)|\bisas?\b/.test(normalized) ? "appointment_isa" : /\b(by|per) agent|\bagents?\b/.test(normalized) ? "appointment_agent" : /\b(month|monthly)\b/.test(normalized) ? "appointment_month" : /\b(lead source|source)\b/.test(normalized) ? "lead_source" : "none";
    return baseDefinition("appointments", "Custom Appointment Report", "Appointments are counted from agent connections marked as set and attributed to the assigned ISA.", ["appointment_count"], groupBy, prompt);
  }

  if (/\b(task|tasks|overdue|completed task)\b/.test(normalized)) {
    const groupBy: GroupBy = /\b(by|per) (assignee|owner|user)|\b(assignee|owner)s?\b/.test(normalized) ? "task_assignee" : /\b(status|statuses)\b/.test(normalized) ? "task_status" : /\b(type|types)\b/.test(normalized) ? "task_type" : /\b(month|monthly)\b/.test(normalized) ? "task_created_month" : "none";
    const metrics: Metric[] = ["task_count"];
    if (/\b(completed|complete)\b/.test(normalized)) metrics.push("completed_task_count");
    if (/\b(overdue|late)\b/.test(normalized)) metrics.push("overdue_task_count");
    return baseDefinition("tasks", "Custom Task Report", "SavvyOS interpreted your request against work items and their current completion state.", metrics, groupBy, prompt);
  }

  if (/\b(property view|property views|favorited|favourite|favorite|analysis request|showing request|website activity|intent signal)\b/.test(normalized)) {
    const groupBy: GroupBy = /\b(type|types|action|actions)\b/.test(normalized) ? "activity_type" : /\b(month|monthly)\b/.test(normalized) ? "activity_created_month" : /\b(lead source|source)\b/.test(normalized) ? "lead_source" : /\b(assigned isa|\bisa\b)\b/.test(normalized) ? "assigned_isa" : "none";
    const metrics: Metric[] = [];
    if (/\b(view|views)\b/.test(normalized)) metrics.push("property_view_count");
    if (/\b(favorited|favourite|favorite)\b/.test(normalized)) metrics.push("property_favorite_count");
    if (/\b(analysis request|analysis)\b/.test(normalized)) metrics.push("analysis_request_count");
    if (/\b(showing request|showing)\b/.test(normalized)) metrics.push("showing_request_count");
    if (!metrics.length) metrics.push("website_activity_count");
    return baseDefinition("website_activity", "Custom Website Activity Report", "SavvyOS interpreted your request against approved website engagement events.", metrics, groupBy, prompt);
  }

  const wantsContacts = /\b(contact|contacts|lead|leads|isa|email|emails|do not contact|dnc)\b/.test(normalized);
  if (wantsContacts) {
    const groupBy: GroupBy = /\b(lead source|source)\b/.test(normalized) ? "lead_source" : /\b(assigned isa|\bisa\b)\b/.test(normalized) ? "assigned_isa" : /\b(state|states)\b/.test(normalized) ? "contact_state" : /\b(status|statuses)\b/.test(normalized) ? "contact_status" : /\b(month|monthly)\b/.test(normalized) ? "contact_created_month" : "none";
    const metrics: Metric[] = ["contact_count"];
    if (/\b(valid email|email quality|emails)\b/.test(normalized)) metrics.push("valid_email_count");
    if (/\b(do not contact|dnc|opted out)\b/.test(normalized)) metrics.push("do_not_contact_count");
    return baseDefinition("contacts", "Custom Contact Report", "SavvyOS applied a safe contact-reporting interpretation of your request.", metrics, groupBy, prompt);
  }

  const groupBy: GroupBy = /\b(by|per) agent\b|\bagents?\b/.test(normalized) ? "agent" : /\b(status|statuses)\b/.test(normalized) ? "transaction_status" : /\b(type|buyer|seller|dual)\b/.test(normalized) ? "transaction_type" : /\b(month|monthly)\b/.test(normalized) ? "closing_month" : /\b(lead source|source)\b/.test(normalized) ? "lead_source" : "none";
  const metrics: Metric[] = [];
  if (/\b(closed|closings)\b/.test(normalized)) metrics.push("closed_count");
  if (/\b(under contract|pending)\b/.test(normalized)) metrics.push("under_contract_count");
  if (/\b(volume|purchase price|purchase volume)\b/.test(normalized)) metrics.push("purchase_volume");
  if (/\b(gci|gross commission|commission)\b/.test(normalized)) metrics.push("gross_commission");
  if (/\b(savvy net|net revenue|company net)\b/.test(normalized)) metrics.push("savvy_net");
  if (!metrics.length) metrics.push("transaction_count");
  const report = baseDefinition("transactions", "Custom Transaction Report", "SavvyOS applied a safe transaction-reporting interpretation of your request.", metrics, groupBy, prompt);
  return { ...report, dateBasis: /\bcontract\b/.test(normalized) ? "contract" : "closing", transactionStatus: /\bunder contract\b/.test(normalized) ? "under_contract" : /\bclosed\b/.test(normalized) ? "closed" : /\bterminated\b/.test(normalized) ? "terminated" : "all", transactionType: /\bdual\b/.test(normalized) ? "dual" : /\bbuyer\b/.test(normalized) ? "buyer" : /\bseller\b/.test(normalized) ? "seller" : "all" };
}

function hasManagedForgeProvider(): boolean {
  return Boolean(process.env.BUILT_IN_FORGE_API_URL?.trim() && process.env.BUILT_IN_FORGE_API_KEY?.trim());
}

export async function planCustomReport(prompt: string): Promise<CustomReportDefinition> {
  if (!hasManagedForgeProvider()) return deterministicCustomReportPlan(prompt);
  try {
    const response = await invokeLLM({
      model: process.env.CUSTOM_REPORTS_MODEL?.trim() || "gpt-5-mini",
      messages: [
        {
          role: "system",
          content: "You are SavvyOS's report planner. Convert an administrator's natural-language request into one safe report definition. You never create SQL, never request personal contact details, and only use the provided schema. Approved datasets are transactions, contacts, proformas, appointments, tasks, and website_activity. Proformas are saved analyses created by users. Appointments are agent connections marked appointmentSet and are attributed to the contact's assigned ISA. Website activity includes property views, favorites, analysis requests, and showing requests. Use only the selected dataset's approved numeric metrics and groupings. For natural-language date ranges, use YYYY-MM-DD or null. Do not invent user, ISA, agent, or lead-source IDs; use empty arrays when no specific ID was supplied. If a request is ambiguous, choose a sensible aggregate report and explain assumptions in description.",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_schema", json_schema: { name: "custom_report_definition", strict: true, schema: plannerSchema } },
      maxTokens: 1_800,
    });
    const content = response.choices[0]?.message?.content;
    if (typeof content !== "string") throw new Error("The report planner returned an empty response.");
    return customReportDefinitionSchema.parse(JSON.parse(content));
  } catch (error) {
    console.warn("[Custom Reports] Managed planner unavailable; using safe deterministic planner.", error);
    return deterministicCustomReportPlan(prompt);
  }
}

export function suggestedCustomReportPrompts(): string[] {
  return [
    "How many proformas have agents run so far, broken down by agent?",
    "How many appointments did ISAs set this week, broken down by ISA?",
    "Show property favorites and analysis requests by lead source for the last 30 days.",
    "Show completed and overdue tasks by assignee for the current month.",
    "Show closed transaction count, purchase volume, gross commission, and Savvy net by agent for the current quarter.",
    "Break down new contacts by lead source for the last 90 days, sorted by the largest source.",
  ];
}
