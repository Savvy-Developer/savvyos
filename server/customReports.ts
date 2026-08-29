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
  "average_purchase_price",
  "average_gross_commission",
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

const CONTACT_DETAIL_COLUMNS = [
  "contact_name",
  "email",
  "phone",
  "lead_source",
  "assigned_isa",
  "contact_status",
  "created_at",
] as const;

const dateValue = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable();

export const customReportDefinitionSchema = z.object({
  dataset: z.enum(DATASETS),
  /** Aggregate reports are the original safe mode; detail and comparison use dedicated allowlists. */
  mode: z.enum(["aggregate", "detail", "comparison"]).default("aggregate"),
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
  emailFilter: z.enum(["all", "missing", "present"]).default("all"),
  detailColumns: z
    .array(z.enum(CONTACT_DETAIL_COLUMNS))
    .max(CONTACT_DETAIL_COLUMNS.length)
    .default([]),
  comparison: z.enum(["none", "prior_period"]).default("none"),
  sortMetric: z.enum(METRICS),
  sortDirection: z.enum(["asc", "desc"]),
  limit: z.number().int().min(1).max(100),
});

export type CustomReportDefinition = z.infer<
  typeof customReportDefinitionSchema
>;

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
    "average_purchase_price",
    "average_gross_commission",
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

async function runRows(
  statement: SQL
): Promise<Array<Record<string, unknown>>> {
  const db = await getDb();
  if (!db) throw new Error("SavvyOS data is temporarily unavailable.");
  const result = await (
    db as unknown as { execute: (query: SQL) => Promise<unknown> }
  ).execute(statement);
  return rowsFromResult(result);
}

function listClause(values: number[]): SQL | undefined {
  return values.length
    ? sql`(${sql.join(
        values.map(value => sql`${value}`),
        sql`, `
      )})`
    : undefined;
}

function whereClause(conditions: SQL[]): SQL {
  return conditions.length
    ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
    : sql``;
}

function dateRangeConditions(
  column: SQL,
  definition: CustomReportDefinition
): SQL[] {
  const conditions: SQL[] = [];
  if (definition.dateFrom)
    conditions.push(sql`DATE(${column}) >= ${definition.dateFrom}`);
  if (definition.dateTo)
    conditions.push(sql`DATE(${column}) <= ${definition.dateTo}`);
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
    average_purchase_price: sql`COALESCE(AVG(t.\`purchasePrice\`), 0) AS \`average_purchase_price\``,
    average_gross_commission: sql`COALESCE(AVG(t.\`grossCommissionIncome\`), 0) AS \`average_gross_commission\``,
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
  return metrics
    .filter(metric => metricsByDataset[dataset].has(metric))
    .map(metric => map[metric]);
}

function defaultGroup(): { select: SQL[]; group: SQL[] } {
  return {
    select: [
      sql`'all' AS \`group_key\``,
      sql`'All matching records' AS \`group_label\``,
    ],
    group: [],
  };
}

function groupFor(definition: CustomReportDefinition): {
  select: SQL[];
  group: SQL[];
} {
  switch (definition.groupBy) {
    case "agent":
      return {
        select: [
          sql`t.\`agentId\` AS \`group_key\``,
          sql`COALESCE(u.\`name\`, 'Unassigned') AS \`group_label\``,
        ],
        group: [sql`t.\`agentId\``, sql`u.\`name\``],
      };
    case "transaction_status":
      return {
        select: [
          sql`t.\`status\` AS \`group_key\``,
          sql`t.\`status\` AS \`group_label\``,
        ],
        group: [sql`t.\`status\``],
      };
    case "transaction_type":
      return {
        select: [
          sql`t.\`transactionType\` AS \`group_key\``,
          sql`t.\`transactionType\` AS \`group_label\``,
        ],
        group: [sql`t.\`transactionType\``],
      };
    case "closing_month": {
      const column =
        definition.dateBasis === "contract"
          ? sql`t.\`contractDate\``
          : definition.dateBasis === "created"
            ? sql`t.\`createdAt\``
            : sql`t.\`closingDate\``;
      return {
        select: [
          sql`DATE_FORMAT(${column}, '%Y-%m') AS \`group_key\``,
          sql`DATE_FORMAT(${column}, '%b %Y') AS \`group_label\``,
        ],
        group: [
          sql`DATE_FORMAT(${column}, '%Y-%m')`,
          sql`DATE_FORMAT(${column}, '%b %Y')`,
        ],
      };
    }
    case "lead_source":
      return {
        select: [
          sql`COALESCE(ls.\`id\`, 0) AS \`group_key\``,
          sql`COALESCE(ls.\`name\`, 'Unattributed') AS \`group_label\``,
        ],
        group: [sql`ls.\`id\``, sql`ls.\`name\``],
      };
    case "contact_status":
      return {
        select: [
          sql`COALESCE(c.\`isaStatus\`, 'unassigned') AS \`group_key\``,
          sql`COALESCE(c.\`isaStatus\`, 'Unassigned') AS \`group_label\``,
        ],
        group: [sql`c.\`isaStatus\``],
      };
    case "contact_state":
      return {
        select: [
          sql`COALESCE(c.\`state\`, 'unknown') AS \`group_key\``,
          sql`COALESCE(c.\`state\`, 'Unknown') AS \`group_label\``,
        ],
        group: [sql`c.\`state\``],
      };
    case "contact_created_month":
      return {
        select: [
          sql`DATE_FORMAT(c.\`createdAt\`, '%Y-%m') AS \`group_key\``,
          sql`DATE_FORMAT(c.\`createdAt\`, '%b %Y') AS \`group_label\``,
        ],
        group: [
          sql`DATE_FORMAT(c.\`createdAt\`, '%Y-%m')`,
          sql`DATE_FORMAT(c.\`createdAt\`, '%b %Y')`,
        ],
      };
    case "assigned_isa":
    case "appointment_isa":
      return {
        select: [
          sql`COALESCE(isa.\`id\`, 0) AS \`group_key\``,
          sql`COALESCE(isa.\`name\`, 'Unassigned') AS \`group_label\``,
        ],
        group: [sql`isa.\`id\``, sql`isa.\`name\``],
      };
    case "proforma_creator":
      return {
        select: [
          sql`COALESCE(pu.\`id\`, 0) AS \`group_key\``,
          sql`COALESCE(pu.\`name\`, 'Unknown user') AS \`group_label\``,
        ],
        group: [sql`pu.\`id\``, sql`pu.\`name\``],
      };
    case "proforma_status":
      return {
        select: [
          sql`p.\`status\` AS \`group_key\``,
          sql`p.\`status\` AS \`group_label\``,
        ],
        group: [sql`p.\`status\``],
      };
    case "proforma_created_month":
      return {
        select: [
          sql`DATE_FORMAT(p.\`createdAt\`, '%Y-%m') AS \`group_key\``,
          sql`DATE_FORMAT(p.\`createdAt\`, '%b %Y') AS \`group_label\``,
        ],
        group: [
          sql`DATE_FORMAT(p.\`createdAt\`, '%Y-%m')`,
          sql`DATE_FORMAT(p.\`createdAt\`, '%b %Y')`,
        ],
      };
    case "appointment_agent":
      return {
        select: [
          sql`COALESCE(au.\`id\`, 0) AS \`group_key\``,
          sql`COALESCE(au.\`name\`, 'Unknown agent') AS \`group_label\``,
        ],
        group: [sql`au.\`id\``, sql`au.\`name\``],
      };
    case "appointment_month":
      return {
        select: [
          sql`DATE_FORMAT(COALESCE(ac.\`appointmentSetAt\`, ac.\`createdAt\`), '%Y-%m') AS \`group_key\``,
          sql`DATE_FORMAT(COALESCE(ac.\`appointmentSetAt\`, ac.\`createdAt\`), '%b %Y') AS \`group_label\``,
        ],
        group: [
          sql`DATE_FORMAT(COALESCE(ac.\`appointmentSetAt\`, ac.\`createdAt\`), '%Y-%m')`,
          sql`DATE_FORMAT(COALESCE(ac.\`appointmentSetAt\`, ac.\`createdAt\`), '%b %Y')`,
        ],
      };
    case "task_assignee":
      return {
        select: [
          sql`COALESCE(tu.\`id\`, 0) AS \`group_key\``,
          sql`COALESCE(tu.\`name\`, 'Unassigned') AS \`group_label\``,
        ],
        group: [sql`tu.\`id\``, sql`tu.\`name\``],
      };
    case "task_status":
      return {
        select: [
          sql`tk.\`status\` AS \`group_key\``,
          sql`tk.\`status\` AS \`group_label\``,
        ],
        group: [sql`tk.\`status\``],
      };
    case "task_type":
      return {
        select: [
          sql`COALESCE(tk.\`taskType\`, 'other') AS \`group_key\``,
          sql`COALESCE(tk.\`taskType\`, 'Other') AS \`group_label\``,
        ],
        group: [sql`tk.\`taskType\``],
      };
    case "task_created_month":
      return {
        select: [
          sql`DATE_FORMAT(tk.\`createdAt\`, '%Y-%m') AS \`group_key\``,
          sql`DATE_FORMAT(tk.\`createdAt\`, '%b %Y') AS \`group_label\``,
        ],
        group: [
          sql`DATE_FORMAT(tk.\`createdAt\`, '%Y-%m')`,
          sql`DATE_FORMAT(tk.\`createdAt\`, '%b %Y')`,
        ],
      };
    case "activity_type":
      return {
        select: [
          sql`al.\`action\` AS \`group_key\``,
          sql`al.\`action\` AS \`group_label\``,
        ],
        group: [sql`al.\`action\``],
      };
    case "activity_created_month":
      return {
        select: [
          sql`DATE_FORMAT(al.\`createdAt\`, '%Y-%m') AS \`group_key\``,
          sql`DATE_FORMAT(al.\`createdAt\`, '%b %Y') AS \`group_label\``,
        ],
        group: [
          sql`DATE_FORMAT(al.\`createdAt\`, '%Y-%m')`,
          sql`DATE_FORMAT(al.\`createdAt\`, '%b %Y')`,
        ],
      };
    default:
      return defaultGroup();
  }
}

function transactionWhere(definition: CustomReportDefinition): SQL {
  const dateColumn =
    definition.dateBasis === "contract"
      ? sql`t.\`contractDate\``
      : definition.dateBasis === "created"
        ? sql`t.\`createdAt\``
        : sql`t.\`closingDate\``;
  const conditions = dateRangeConditions(dateColumn, definition);
  if (definition.transactionStatus !== "all")
    conditions.push(sql`t.\`status\` = ${definition.transactionStatus}`);
  if (definition.transactionType !== "all")
    conditions.push(sql`t.\`transactionType\` = ${definition.transactionType}`);
  const agentIds = listClause(definition.agentIds);
  if (agentIds) conditions.push(sql`t.\`agentId\` IN ${agentIds}`);
  const leadSourceIds = listClause(definition.leadSourceIds);
  if (leadSourceIds)
    conditions.push(sql`c.\`leadSourceId\` IN ${leadSourceIds}`);
  return whereClause(conditions);
}

function contactWhere(definition: CustomReportDefinition): SQL {
  const conditions = dateRangeConditions(sql`c.\`createdAt\``, definition);
  if (definition.emailFilter === "missing") {
    conditions.push(sql`NULLIF(TRIM(COALESCE(c.\`email\`, '')), '') IS NULL`);
  }
  if (definition.emailFilter === "present") {
    conditions.push(
      sql`NULLIF(TRIM(COALESCE(c.\`email\`, '')), '') IS NOT NULL`
    );
  }
  const leadSourceIds = listClause(definition.leadSourceIds);
  if (leadSourceIds)
    conditions.push(sql`c.\`leadSourceId\` IN ${leadSourceIds}`);
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
  const conditions: SQL[] = [
    sql`ac.\`appointmentSet\` = 1`,
    ...dateRangeConditions(
      sql`COALESCE(ac.\`appointmentSetAt\`, ac.\`createdAt\`)`,
      definition
    ),
  ];
  const agentIds = listClause(definition.agentIds);
  if (agentIds) conditions.push(sql`ac.\`agentId\` IN ${agentIds}`);
  const isaIds = listClause(definition.isaIds);
  if (isaIds) conditions.push(sql`c.\`assignedIsaId\` IN ${isaIds}`);
  const leadSourceIds = listClause(definition.leadSourceIds);
  if (leadSourceIds)
    conditions.push(sql`c.\`leadSourceId\` IN ${leadSourceIds}`);
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
  if (leadSourceIds)
    conditions.push(sql`c.\`leadSourceId\` IN ${leadSourceIds}`);
  const isaIds = listClause(definition.isaIds);
  if (isaIds) conditions.push(sql`c.\`assignedIsaId\` IN ${isaIds}`);
  const agentIds = listClause(definition.agentIds);
  if (agentIds)
    conditions.push(
      sql`EXISTS (SELECT 1 FROM \`agent_connections\` ac_scope WHERE ac_scope.\`contactId\` = ${contactExpression} AND ac_scope.\`agentId\` IN ${agentIds})`
    );
  return whereClause(conditions);
}

function formatMetricLabel(metric: string): string {
  const labels: Record<string, string> = {
    average_purchase_price: "Average Purchase Price",
    average_gross_commission: "Average Gross Commission",
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
  return (
    labels[metric] ??
    metric
      .replace(/_/g, " ")
      .replace(/\b\w/g, character => character.toUpperCase())
  );
}

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeRows(
  rows: Array<Record<string, unknown>>,
  metrics: Metric[]
) {
  return rows.map(row => {
    const normalized: Record<string, string | number> = {
      group_key: String(row.group_key ?? "all"),
      group_label: String(row.group_label ?? "All matching records"),
    };
    for (const metric of metrics) normalized[metric] = toNumber(row[metric]);
    return normalized;
  });
}

function buildStatement(
  definition: CustomReportDefinition,
  group: { select: SQL[]; group: SQL[] },
  metrics: SQL[]
): SQL {
  const order = definition.sortDirection === "asc" ? sql`ASC` : sql`DESC`;
  const groupBy = group.group.length
    ? sql`GROUP BY ${sql.join(group.group, sql`, `)}`
    : sql``;
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

const contactDetailColumnDefinitions: Record<
  (typeof CONTACT_DETAIL_COLUMNS)[number],
  { label: string; statement: SQL }
> = {
  contact_name: {
    label: "Contact",
    statement: sql`TRIM(CONCAT(COALESCE(c.\`firstName\`, ''), ' ', COALESCE(c.\`lastName\`, ''))) AS \`contact_name\``,
  },
  email: {
    label: "Email",
    statement: sql`COALESCE(NULLIF(TRIM(c.\`email\`), ''), '—') AS \`email\``,
  },
  phone: {
    label: "Phone",
    statement: sql`COALESCE(NULLIF(TRIM(c.\`phone\`), ''), '—') AS \`phone\``,
  },
  lead_source: {
    label: "Lead Source",
    statement: sql`COALESCE(ls.\`name\`, 'Unattributed') AS \`lead_source\``,
  },
  assigned_isa: {
    label: "Assigned ISA",
    statement: sql`COALESCE(isa.\`name\`, 'Unassigned') AS \`assigned_isa\``,
  },
  contact_status: {
    label: "Contact Status",
    statement: sql`COALESCE(c.\`isaStatus\`, 'Unassigned') AS \`contact_status\``,
  },
  created_at: {
    label: "Created",
    statement: sql`DATE_FORMAT(c.\`createdAt\`, '%Y-%m-%d') AS \`created_at\``,
  },
};

async function executeContactDetailReport(definition: CustomReportDefinition) {
  if (
    definition.dataset !== "contacts" ||
    definition.emailFilter !== "missing"
  ) {
    throw new Error(
      "Contact detail reports currently support the Missing Email filter only."
    );
  }

  const selectedKeys = definition.detailColumns.length
    ? definition.detailColumns
    : ([
        "contact_name",
        "email",
        "lead_source",
        "assigned_isa",
        "contact_status",
        "created_at",
      ] as const);
  const columns = selectedKeys.map(key => ({
    key,
    label: contactDetailColumnDefinitions[key].label,
    type: "text" as const,
  }));
  const where = contactWhere(definition);
  const [rows, countRows] = await Promise.all([
    runRows(sql`
      SELECT c.\`id\` AS \`group_key\`, ${sql.join(
        selectedKeys.map(key => contactDetailColumnDefinitions[key].statement),
        sql`, `
      )}
      FROM \`contacts\` c
      LEFT JOIN \`lead_sources\` ls ON ls.\`id\` = c.\`leadSourceId\`
      LEFT JOIN \`users\` isa ON isa.\`id\` = c.\`assignedIsaId\`
      ${where}
      ORDER BY c.\`createdAt\` DESC, c.\`id\` DESC
      LIMIT ${definition.limit}
    `),
    runRows(sql`
      SELECT COUNT(c.\`id\`) AS \`total_count\`
      FROM \`contacts\` c
      ${where}
    `),
  ]);
  const totalCount = toNumber(countRows[0]?.total_count);

  return {
    definition,
    mode: "detail" as const,
    columns,
    rows: rows.map(row => {
      const normalized: Record<string, string | number> = {
        group_key: String(row.group_key ?? ""),
      };
      for (const key of selectedKeys) normalized[key] = String(row[key] ?? "—");
      return normalized;
    }),
    totalCount,
    isTruncated: totalCount > definition.limit,
    summary: `${totalCount.toLocaleString()} contact${totalCount === 1 ? "" : "s"} with no email address match this scope.`,
    generatedAt: new Date().toISOString(),
  };
}

function dateDaysBefore(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
}

async function executeLeadSourceComparison(definition: CustomReportDefinition) {
  if (
    definition.dataset !== "contacts" ||
    definition.groupBy !== "lead_source"
  ) {
    throw new Error(
      "Prior-period comparisons currently support contact volume by lead source only."
    );
  }
  if (!definition.dateFrom || !definition.dateTo) {
    throw new Error(
      "Choose a start and end date before comparing with the prior period."
    );
  }

  const days =
    Math.floor(
      (new Date(`${definition.dateTo}T12:00:00.000Z`).getTime() -
        new Date(`${definition.dateFrom}T12:00:00.000Z`).getTime()) /
        86_400_000
    ) + 1;
  if (days < 1 || days > 366)
    throw new Error("Comparison ranges must be between 1 and 366 days.");
  const priorTo = dateDaysBefore(definition.dateFrom, 1);
  const priorFrom = dateDaysBefore(definition.dateFrom, days);
  const conditions: SQL[] = [
    sql`DATE(c.\`createdAt\`) >= ${priorFrom}`,
    sql`DATE(c.\`createdAt\`) <= ${definition.dateTo}`,
  ];
  const leadSourceIds = listClause(definition.leadSourceIds);
  if (leadSourceIds)
    conditions.push(sql`c.\`leadSourceId\` IN ${leadSourceIds}`);
  const scope = whereClause(conditions);
  const [rows, countRows] = await Promise.all([
    runRows(sql`
      SELECT
        COALESCE(ls.\`id\`, 0) AS \`group_key\`,
        COALESCE(ls.\`name\`, 'Unattributed') AS \`group_label\`,
        SUM(CASE WHEN DATE(c.\`createdAt\`) >= ${definition.dateFrom} AND DATE(c.\`createdAt\`) <= ${definition.dateTo} THEN 1 ELSE 0 END) AS \`current_period\`,
        SUM(CASE WHEN DATE(c.\`createdAt\`) >= ${priorFrom} AND DATE(c.\`createdAt\`) <= ${priorTo} THEN 1 ELSE 0 END) AS \`prior_period\`
      FROM \`contacts\` c
      LEFT JOIN \`lead_sources\` ls ON ls.\`id\` = c.\`leadSourceId\`
      ${scope}
      GROUP BY ls.\`id\`, ls.\`name\`
      HAVING \`current_period\` > 0 OR \`prior_period\` > 0
      ORDER BY \`current_period\` DESC, \`group_label\` ASC
      LIMIT ${definition.limit}
    `),
    runRows(sql`
      SELECT COUNT(*) AS \`total_count\`
      FROM (
        SELECT COALESCE(c.\`leadSourceId\`, 0) AS \`source_key\`
        FROM \`contacts\` c
        ${scope}
        GROUP BY COALESCE(c.\`leadSourceId\`, 0)
      ) scoped_sources
    `),
  ]);
  const normalizedRows = rows.map(row => {
    const current = toNumber(row.current_period);
    const prior = toNumber(row.prior_period);
    return {
      group_key: String(row.group_key ?? "0"),
      group_label: String(row.group_label ?? "Unattributed"),
      current_period: current,
      prior_period: prior,
      change: current - prior,
      change_percent: prior > 0 ? ((current - prior) / prior) * 100 : null,
    };
  });

  return {
    definition,
    mode: "comparison" as const,
    comparisonRange: { from: priorFrom, to: priorTo },
    columns: [
      { key: "group_label", label: "Lead Source", type: "text" as const },
      {
        key: "current_period",
        label: `${definition.dateFrom} to ${definition.dateTo}`,
        type: "number" as const,
      },
      {
        key: "prior_period",
        label: `${priorFrom} to ${priorTo}`,
        type: "number" as const,
      },
      { key: "change", label: "Change", type: "number" as const },
      {
        key: "change_percent",
        label: "Change %",
        type: "number" as const,
        format: "percent",
      },
    ],
    rows: normalizedRows,
    totalCount: toNumber(countRows[0]?.total_count),
    isTruncated: toNumber(countRows[0]?.total_count) > definition.limit,
    summary: `Lead volume by source for ${definition.dateFrom} to ${definition.dateTo}, compared with the immediately preceding ${days}-day period.`,
    generatedAt: new Date().toISOString(),
  };
}

export async function executeCustomReport(rawDefinition: unknown) {
  const definition = customReportDefinitionSchema.parse(rawDefinition);
  if (
    definition.dateFrom &&
    definition.dateTo &&
    definition.dateFrom > definition.dateTo
  ) {
    throw new Error("The start date must be on or before the end date.");
  }
  if (definition.mode === "detail")
    return executeContactDetailReport(definition);
  if (
    definition.mode === "comparison" ||
    definition.comparison === "prior_period"
  ) {
    return executeLeadSourceComparison({
      ...definition,
      mode: "comparison",
      comparison: "prior_period",
    });
  }
  const validMetrics = definition.metrics.filter(metric =>
    metricsByDataset[definition.dataset].has(metric)
  );
  if (!validMetrics.length)
    throw new Error(
      "The report definition has no valid metrics for its selected dataset."
    );
  if (!groupsByDataset[definition.dataset].has(definition.groupBy)) {
    throw new Error(
      `This grouping is not available for ${definition.dataset.replace(/_/g, " ")} reports.`
    );
  }
  if (!validMetrics.includes(definition.sortMetric)) {
    throw new Error(
      "The sorting metric must be included in the report metrics."
    );
  }

  const rows = normalizeRows(
    await runRows(
      buildStatement(
        definition,
        groupFor(definition),
        metricStatements(validMetrics, definition.dataset)
      )
    ),
    validMetrics
  );

  return {
    definition: { ...definition, metrics: validMetrics },
    mode: "aggregate" as const,
    columns: [
      {
        key: "group_label",
        label: definition.groupBy === "none" ? "Scope" : "Group",
        type: "text" as const,
      },
      ...validMetrics.map(metric => ({
        key: metric,
        label: formatMetricLabel(metric),
        type: "number" as const,
      })),
    ],
    rows,
    totalCount: null,
    isTruncated: rows.length >= definition.limit,
    summary: `${rows.length} ${rows.length === 1 ? "result" : "results"} from the approved ${definition.dataset.replace(/_/g, " ")} reporting dataset.`,
    generatedAt: new Date().toISOString(),
  };
}

const plannerSchema = {
  type: "object",
  properties: {
    dataset: { type: "string", enum: DATASETS },
    mode: { type: "string", enum: ["aggregate", "detail", "comparison"] },
    title: { type: "string" },
    description: { type: "string" },
    metrics: { type: "array", items: { type: "string", enum: METRICS } },
    groupBy: { type: "string", enum: GROUP_BYS },
    dateFrom: { type: ["string", "null"] },
    dateTo: { type: ["string", "null"] },
    dateBasis: { type: "string", enum: ["closing", "contract", "created"] },
    transactionStatus: {
      type: "string",
      enum: ["all", "closed", "under_contract", "terminated"],
    },
    transactionType: {
      type: "string",
      enum: ["all", "buyer", "seller", "dual"],
    },
    agentIds: { type: "array", items: { type: "integer" } },
    isaIds: { type: "array", items: { type: "integer" } },
    leadSourceIds: { type: "array", items: { type: "integer" } },
    emailFilter: { type: "string", enum: ["all", "missing", "present"] },
    detailColumns: {
      type: "array",
      items: { type: "string", enum: CONTACT_DETAIL_COLUMNS },
    },
    comparison: { type: "string", enum: ["none", "prior_period"] },
    sortMetric: { type: "string", enum: METRICS },
    sortDirection: { type: "string", enum: ["asc", "desc"] },
    limit: { type: "integer" },
  },
  required: [
    "dataset",
    "mode",
    "title",
    "description",
    "metrics",
    "groupBy",
    "dateFrom",
    "dateTo",
    "dateBasis",
    "transactionStatus",
    "transactionType",
    "agentIds",
    "isaIds",
    "leadSourceIds",
    "emailFilter",
    "detailColumns",
    "comparison",
    "sortMetric",
    "sortDirection",
    "limit",
  ],
  additionalProperties: false,
};

function localDate(value: Date): string {
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 10);
}

function deterministicDateRange(
  prompt: string
): Pick<CustomReportDefinition, "dateFrom" | "dateTo"> {
  const normalized = prompt.toLowerCase();
  const today = new Date();
  const todayValue = localDate(today);
  const isoRange = normalized.match(
    /\b(20\d{2}-\d{2}-\d{2})\s*(?:to|through|until|-)\s*(20\d{2}-\d{2}-\d{2})\b/
  );
  if (isoRange) return { dateFrom: isoRange[1], dateTo: isoRange[2] };
  const shortRange = normalized.match(
    /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s*(?:to|through|until|-)\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/
  );
  if (shortRange) {
    const normalizeYear = (value: string | undefined) => {
      if (!value) return today.getFullYear();
      const year = Number(value);
      return year < 100 ? 2000 + year : year;
    };
    const from = `${normalizeYear(shortRange[3])}-${shortRange[1].padStart(2, "0")}-${shortRange[2].padStart(2, "0")}`;
    const to = `${normalizeYear(shortRange[6] ?? shortRange[3])}-${shortRange[4].padStart(2, "0")}-${shortRange[5].padStart(2, "0")}`;
    return { dateFrom: from, dateTo: to };
  }
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
    return {
      dateFrom: localDate(new Date(today.getFullYear(), quarterStartMonth, 1)),
      dateTo: todayValue,
    };
  }
  if (/\blast quarter\b/.test(normalized)) {
    const currentQuarterStart = Math.floor(today.getMonth() / 3) * 3;
    const end = new Date(today.getFullYear(), currentQuarterStart, 0);
    const start = new Date(
      end.getFullYear(),
      Math.floor(end.getMonth() / 3) * 3,
      1
    );
    return { dateFrom: localDate(start), dateTo: localDate(end) };
  }
  if (/\b(this|current) year\b|\bytd\b|\byear to date\b/.test(normalized)) {
    return {
      dateFrom: localDate(new Date(today.getFullYear(), 0, 1)),
      dateTo: todayValue,
    };
  }
  if (/\blast year\b/.test(normalized)) {
    return {
      dateFrom: `${today.getFullYear() - 1}-01-01`,
      dateTo: `${today.getFullYear() - 1}-12-31`,
    };
  }
  const lastDays = normalized.match(/\b(?:last|past)\s+(\d{1,3})\s+days?\b/);
  if (lastDays) {
    const days = Math.max(1, Math.min(365, Number(lastDays[1])));
    const start = new Date(today);
    start.setDate(start.getDate() - days + 1);
    return { dateFrom: localDate(start), dateTo: todayValue };
  }
  if (/\b(this|current) month\b/.test(normalized)) {
    return {
      dateFrom: localDate(new Date(today.getFullYear(), today.getMonth(), 1)),
      dateTo: todayValue,
    };
  }
  return { dateFrom: null, dateTo: null };
}

function baseDefinition(
  dataset: Dataset,
  title: string,
  description: string,
  metrics: Metric[],
  groupBy: GroupBy,
  prompt: string
): CustomReportDefinition {
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
    emailFilter: "all",
    detailColumns: [],
    comparison: "none",
    sortMetric: metrics[0],
    sortDirection: "desc",
    limit: 100,
  });
}

function deterministicCustomReportPlan(prompt: string): CustomReportDefinition {
  const normalized = prompt.toLowerCase();

  const asksForMissingEmail =
    /\b(missing|empty|without|no)\s+(?:an?\s+)?email\b|\bemail\s+(?:is\s+)?(?:missing|empty|blank)\b/.test(
      normalized
    );
  if (asksForMissingEmail) {
    const base = baseDefinition(
      "contacts",
      "Contacts Missing Email",
      "A contact detail list filtered to contacts with no email address.",
      ["contact_count"],
      "none",
      prompt
    );
    return {
      ...base,
      mode: "detail",
      emailFilter: "missing",
      detailColumns: [
        "contact_name",
        "email",
        "lead_source",
        "assigned_isa",
        "contact_status",
        "created_at",
      ],
    };
  }

  const asksForComparison =
    /\b(vs\.?|versus|verses|compared to|prior period|previous period)\b/.test(
      normalized
    );
  const asksForLeadSource = /\b(lead source|source|sources)\b/.test(normalized);
  const asksForLeadVolume =
    /\b(contact|contacts|lead|leads|new lead|new leads)\b/.test(normalized);
  if (asksForComparison && asksForLeadSource && asksForLeadVolume) {
    const base = baseDefinition(
      "contacts",
      "Lead Source Volume Comparison",
      "New contacts by lead source for the selected period compared with the immediately preceding period of the same length.",
      ["contact_count"],
      "lead_source",
      prompt
    );
    return { ...base, mode: "comparison", comparison: "prior_period" };
  }

  if (/\b(proformas?|pro-formas?|pro formas?)\b/.test(normalized)) {
    const groupBy: GroupBy = /\b(by|per) (agent|user)|\bagents?\b/.test(
      normalized
    )
      ? "proforma_creator"
      : /\b(status|draft|final)\b/.test(normalized)
        ? "proforma_status"
        : /\b(month|monthly)\b/.test(normalized)
          ? "proforma_created_month"
          : "none";
    const metrics: Metric[] = ["proforma_count"];
    if (/\b(final|finalized)\b/.test(normalized))
      metrics.push("final_proforma_count");
    if (/\b(cash flow)\b/.test(normalized)) metrics.push("average_cash_flow");
    if (/\b(cash on cash|coc)\b/.test(normalized))
      metrics.push("average_cash_on_cash");
    return baseDefinition(
      "proformas",
      "Custom Pro Forma Report",
      "SavvyOS interpreted your request against saved pro forma records.",
      metrics,
      groupBy,
      prompt
    );
  }

  if (/\b(appointment|appointments)\b/.test(normalized)) {
    const groupBy: GroupBy = /\b(by|per) (isa|isas)|\bisas?\b/.test(normalized)
      ? "appointment_isa"
      : /\b(by|per) agent|\bagents?\b/.test(normalized)
        ? "appointment_agent"
        : /\b(month|monthly)\b/.test(normalized)
          ? "appointment_month"
          : /\b(lead source|source)\b/.test(normalized)
            ? "lead_source"
            : "none";
    return baseDefinition(
      "appointments",
      "Custom Appointment Report",
      "Appointments are counted from agent connections marked as set and attributed to the assigned ISA.",
      ["appointment_count"],
      groupBy,
      prompt
    );
  }

  if (/\b(task|tasks|overdue|completed task)\b/.test(normalized)) {
    const groupBy: GroupBy =
      /\b(by|per) (assignee|owner|user)|\b(assignee|owner)s?\b/.test(normalized)
        ? "task_assignee"
        : /\b(status|statuses)\b/.test(normalized)
          ? "task_status"
          : /\b(type|types)\b/.test(normalized)
            ? "task_type"
            : /\b(month|monthly)\b/.test(normalized)
              ? "task_created_month"
              : "none";
    const metrics: Metric[] = ["task_count"];
    if (/\b(completed|complete)\b/.test(normalized))
      metrics.push("completed_task_count");
    if (/\b(overdue|late)\b/.test(normalized))
      metrics.push("overdue_task_count");
    return baseDefinition(
      "tasks",
      "Custom Task Report",
      "SavvyOS interpreted your request against work items and their current completion state.",
      metrics,
      groupBy,
      prompt
    );
  }

  if (
    /\b(property view|property views|favorited|favourite|favorite|analysis request|showing request|website activity|intent signal)\b/.test(
      normalized
    )
  ) {
    const groupBy: GroupBy = /\b(type|types|action|actions)\b/.test(normalized)
      ? "activity_type"
      : /\b(month|monthly)\b/.test(normalized)
        ? "activity_created_month"
        : /\b(lead source|source)\b/.test(normalized)
          ? "lead_source"
          : /\b(assigned isa|\bisa\b)\b/.test(normalized)
            ? "assigned_isa"
            : "none";
    const metrics: Metric[] = [];
    if (/\b(view|views)\b/.test(normalized))
      metrics.push("property_view_count");
    if (/\b(favorited|favourite|favorite)\b/.test(normalized))
      metrics.push("property_favorite_count");
    if (/\b(analysis request|analysis)\b/.test(normalized))
      metrics.push("analysis_request_count");
    if (/\b(showing request|showing)\b/.test(normalized))
      metrics.push("showing_request_count");
    if (!metrics.length) metrics.push("website_activity_count");
    return baseDefinition(
      "website_activity",
      "Custom Website Activity Report",
      "SavvyOS interpreted your request against approved website engagement events.",
      metrics,
      groupBy,
      prompt
    );
  }

  const wantsContacts =
    /\b(contact|contacts|lead|leads|isa|email|emails|do not contact|dnc)\b/.test(
      normalized
    );
  if (wantsContacts) {
    const groupBy: GroupBy = /\b(lead source|source)\b/.test(normalized)
      ? "lead_source"
      : /\b(assigned isa|\bisa\b)\b/.test(normalized)
        ? "assigned_isa"
        : /\b(state|states)\b/.test(normalized)
          ? "contact_state"
          : /\b(status|statuses)\b/.test(normalized)
            ? "contact_status"
            : /\b(month|monthly)\b/.test(normalized)
              ? "contact_created_month"
              : "none";
    const metrics: Metric[] = ["contact_count"];
    if (/\b(valid email|email quality|emails)\b/.test(normalized))
      metrics.push("valid_email_count");
    if (/\b(do not contact|dnc|opted out)\b/.test(normalized))
      metrics.push("do_not_contact_count");
    return baseDefinition(
      "contacts",
      "Custom Contact Report",
      "SavvyOS applied a safe contact-reporting interpretation of your request.",
      metrics,
      groupBy,
      prompt
    );
  }

  const groupBy: GroupBy = /\b(by|per) agent\b|\bagents?\b/.test(normalized)
    ? "agent"
    : /\b(status|statuses)\b/.test(normalized)
      ? "transaction_status"
      : /\b(type|buyer|seller|dual)\b/.test(normalized)
        ? "transaction_type"
        : /\b(month|monthly)\b/.test(normalized)
          ? "closing_month"
          : /\b(lead source|source)\b/.test(normalized)
            ? "lead_source"
            : "none";
  const metrics: Metric[] = [];
  if (/\b(closed|closings)\b/.test(normalized)) metrics.push("closed_count");
  if (/\b(under contract|pending)\b/.test(normalized))
    metrics.push("under_contract_count");
  if (/\b(average|avg) (purchase price|price)\b/.test(normalized))
    metrics.push("average_purchase_price");
  else if (/\b(volume|purchase price|purchase volume)\b/.test(normalized))
    metrics.push("purchase_volume");
  if (/\b(average|avg) (gci|gross commission|commission)\b/.test(normalized))
    metrics.push("average_gross_commission");
  else if (/\b(gci|gross commission|commission)\b/.test(normalized))
    metrics.push("gross_commission");
  if (/\b(savvy net|net revenue|company net)\b/.test(normalized))
    metrics.push("savvy_net");
  if (!metrics.length) metrics.push("transaction_count");
  const report = baseDefinition(
    "transactions",
    "Custom Transaction Report",
    "SavvyOS applied a safe transaction-reporting interpretation of your request.",
    metrics,
    groupBy,
    prompt
  );
  return {
    ...report,
    dateBasis: /\bcontract\b/.test(normalized) ? "contract" : "closing",
    transactionStatus: /\bunder contract\b/.test(normalized)
      ? "under_contract"
      : /\bclosed\b/.test(normalized)
        ? "closed"
        : /\bterminated\b/.test(normalized)
          ? "terminated"
          : "all",
    transactionType: /\bdual\b/.test(normalized)
      ? "dual"
      : /\bbuyer\b/.test(normalized)
        ? "buyer"
        : /\bseller\b/.test(normalized)
          ? "seller"
          : "all",
  };
}

function hasManagedForgeProvider(): boolean {
  return Boolean(
    process.env.BUILT_IN_FORGE_API_URL?.trim() &&
      process.env.BUILT_IN_FORGE_API_KEY?.trim()
  );
}

export type CustomReportPlan = {
  definition: CustomReportDefinition;
  supportStatus: "supported" | "needs_clarification" | "unsupported";
  plannerMode: "ai" | "safe_fallback";
  preview: string;
  assumptions: string[];
  unsupportedConcepts: string[];
  clarification: string | null;
};

function reportPlanPreview(definition: CustomReportDefinition): string {
  const scope =
    definition.dateFrom && definition.dateTo
      ? `${definition.dateFrom} through ${definition.dateTo}`
      : definition.dateFrom
        ? `${definition.dateFrom} through today`
        : "all available dates";
  if (definition.mode === "detail")
    return `Contact detail list for contacts with no email address, scoped to ${scope}.`;
  if (definition.mode === "comparison")
    return `New-contact volume by lead source for ${scope}, compared with the immediately preceding period of the same length.`;
  const measures = definition.metrics.map(formatMetricLabel).join(", ");
  return `${measures} from ${definition.dataset.replace(/_/g, " ")}, grouped by ${definition.groupBy.replace(/_/g, " ")}, scoped to ${scope}.`;
}

function assessCustomReportSupport(
  prompt: string,
  definition: CustomReportDefinition
): Omit<CustomReportPlan, "definition" | "plannerMode" | "preview"> {
  const normalized = prompt.toLowerCase();
  const unsupportedConcepts: string[] = [];
  const needsNamedFilter =
    /\b(for|from|with|in)\s+(?:these|the|our)\s+(?:lead sources?|agents?|isas?)\b|\b(?:affiliate referral|referral partners?)\b|["'][^"']{3,}["']/.test(
      normalized
    );
  const asksForGroupOrPayout =
    /\b(group leader|\w+ group|payout|agent gci|group leader gci|savvy gci)\b/.test(
      normalized
    );
  const asksForConversion = /\b(conversion|conversion rate|funnel)\b/.test(
    normalized
  );
  const asksForGeneralList =
    /\b(list|records?|which contacts?|which leads?|who did .* generate.* for)\b/.test(
      normalized
    );
  const asksForComparison =
    /\b(vs\.?|versus|verses|compared to|prior period|previous period)\b/.test(
      normalized
    );
  const asksForAverage = /\b(average|avg)\b/.test(normalized);
  const asksForProformas = /\b(proformas?|pro-formas?|pro formas?)\b/.test(
    normalized
  );
  const asksForAppointments = /\b(appointment|appointments)\b/.test(normalized);
  const asksForWebsiteActivity =
    /\b(property view|property views|favorited|favourite|favorite|analysis request|showing request|website activity|intent signal)\b/.test(
      normalized
    );

  if (asksForGroupOrPayout) unsupportedConcepts.push("group and payout detail");
  if (asksForConversion)
    unsupportedConcepts.push("conversion or funnel calculation");
  if (asksForGeneralList && definition.mode !== "detail")
    unsupportedConcepts.push("requested detail list");
  if (asksForComparison && definition.mode !== "comparison")
    unsupportedConcepts.push("period comparison");
  if (
    asksForAverage &&
    !definition.metrics.some(metric => metric.startsWith("average_"))
  )
    unsupportedConcepts.push("requested average metric");
  if (asksForProformas && definition.dataset !== "proformas")
    unsupportedConcepts.push("requested pro forma dataset");
  if (asksForAppointments && definition.dataset !== "appointments")
    unsupportedConcepts.push("requested appointments dataset");
  if (asksForWebsiteActivity && definition.dataset !== "website_activity")
    unsupportedConcepts.push("requested website activity dataset");

  if (unsupportedConcepts.length) {
    return {
      supportStatus: "unsupported",
      assumptions: [],
      unsupportedConcepts,
      clarification: `SavvyOS cannot safely produce ${unsupportedConcepts.join(" and ")} from this page yet. It will not substitute a different report.`,
    };
  }
  if (
    needsNamedFilter &&
    !definition.leadSourceIds.length &&
    !definition.agentIds.length &&
    !definition.isaIds.length
  ) {
    return {
      supportStatus: "needs_clarification",
      assumptions: ["No named people or lead sources have been applied yet."],
      unsupportedConcepts: [],
      clarification:
        "Choose the requested people or lead sources in the report controls before running this report.",
    };
  }
  return {
    supportStatus: "supported",
    assumptions:
      definition.mode === "comparison"
        ? [
            "The comparison uses the immediately preceding period of the same length.",
          ]
        : [],
    unsupportedConcepts: [],
    clarification: null,
  };
}

async function planCustomReportDefinition(
  prompt: string
): Promise<{
  definition: CustomReportDefinition;
  plannerMode: CustomReportPlan["plannerMode"];
}> {
  if (!hasManagedForgeProvider())
    return {
      definition: deterministicCustomReportPlan(prompt),
      plannerMode: "safe_fallback",
    };
  try {
    const response = await invokeLLM({
      model: process.env.CUSTOM_REPORTS_MODEL?.trim() || "gpt-5-mini",
      messages: [
        {
          role: "system",
          content:
            "You are SavvyOS's report planner. Convert an administrator's natural-language request into one safe report definition. You never create SQL and only use the provided schema. Approved datasets are transactions, contacts, proformas, appointments, tasks, and website_activity. Detail mode is allowed only for contacts missing an email address. Comparison mode is allowed only for new contacts by lead source, with comparison='prior_period'. Proformas are saved analyses created by users. Appointments are agent connections marked appointmentSet and are attributed to the contact's assigned ISA. Website activity includes property views, favorites, analysis requests, and showing requests. Use only the selected dataset's approved numeric metrics and groupings. For natural-language date ranges, use YYYY-MM-DD or null. Do not invent user, ISA, agent, or lead-source IDs; use empty arrays when no specific ID was supplied. If a request is ambiguous, choose a sensible aggregate report and explain assumptions in description.",
        },
        { role: "user", content: prompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "custom_report_definition",
          strict: true,
          schema: plannerSchema,
        },
      },
      maxTokens: 1_800,
    });
    const content = response.choices[0]?.message?.content;
    if (typeof content !== "string")
      throw new Error("The report planner returned an empty response.");
    return {
      definition: customReportDefinitionSchema.parse(JSON.parse(content)),
      plannerMode: "ai",
    };
  } catch (error) {
    console.warn(
      "[Custom Reports] Managed planner unavailable; using safe deterministic planner.",
      error
    );
    return {
      definition: deterministicCustomReportPlan(prompt),
      plannerMode: "safe_fallback",
    };
  }
}

export function planCustomReportWithSafeFallback(
  prompt: string
): CustomReportPlan {
  const definition = deterministicCustomReportPlan(prompt);
  return {
    definition,
    plannerMode: "safe_fallback",
    preview: reportPlanPreview(definition),
    ...assessCustomReportSupport(prompt, definition),
  };
}

export async function planCustomReport(
  prompt: string
): Promise<CustomReportPlan> {
  const { definition, plannerMode } = await planCustomReportDefinition(prompt);
  if (plannerMode === "safe_fallback")
    return planCustomReportWithSafeFallback(prompt);
  return {
    definition,
    plannerMode,
    preview: reportPlanPreview(definition),
    ...assessCustomReportSupport(prompt, definition),
  };
}

export function suggestedCustomReportPrompts(): string[] {
  return [
    "Show a list of contacts with an empty email field.",
    "Compare new leads by lead source for the last 30 days versus the prior 30 days.",
    "How many proformas have agents run so far, broken down by agent?",
    "How many appointments did ISAs set this week, broken down by ISA?",
    "Show property favorites and analysis requests by lead source for the last 30 days.",
    "Show completed and overdue tasks by assignee for the current month.",
    "Show closed transaction count, purchase volume, gross commission, and Savvy net by agent for the current quarter.",
    "Break down new contacts by lead source for the last 90 days, sorted by the largest source.",
  ];
}
