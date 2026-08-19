import { z } from "zod";
import { sql, type SQL } from "drizzle-orm";
import { getDb } from "./db";
import { invokeLLM } from "./_core/llm";

const dateValue = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable();

export const customReportDefinitionSchema = z.object({
  dataset: z.enum(["transactions", "contacts"]),
  title: z.string().min(3).max(120),
  description: z.string().min(8).max(360),
  metrics: z
    .array(
      z.enum([
        "transaction_count",
        "closed_count",
        "under_contract_count",
        "purchase_volume",
        "gross_commission",
        "savvy_net",
        "contact_count",
        "do_not_contact_count",
        "valid_email_count",
      ])
    )
    .min(1)
    .max(4),
  groupBy: z.enum([
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
  ]),
  dateFrom: dateValue,
  dateTo: dateValue,
  dateBasis: z.enum(["closing", "contract", "created"]),
  transactionStatus: z.enum(["all", "closed", "under_contract", "terminated"]),
  transactionType: z.enum(["all", "buyer", "seller", "dual"]),
  agentIds: z.array(z.number().int().positive()).max(25),
  leadSourceIds: z.array(z.number().int().positive()).max(50),
  sortMetric: z.enum([
    "transaction_count",
    "closed_count",
    "under_contract_count",
    "purchase_volume",
    "gross_commission",
    "savvy_net",
    "contact_count",
    "do_not_contact_count",
    "valid_email_count",
  ]),
  sortDirection: z.enum(["asc", "desc"]),
  limit: z.number().int().min(1).max(100),
});

export type CustomReportDefinition = z.infer<
  typeof customReportDefinitionSchema
>;

export const customReportPromptSchema = z.object({
  prompt: z.string().trim().min(12).max(2_000),
});

const transactionMetrics = new Set([
  "transaction_count",
  "closed_count",
  "under_contract_count",
  "purchase_volume",
  "gross_commission",
  "savvy_net",
]);
const contactMetrics = new Set([
  "contact_count",
  "do_not_contact_count",
  "valid_email_count",
]);

const transactionGroupBy = new Set([
  "none",
  "agent",
  "transaction_status",
  "transaction_type",
  "closing_month",
  "lead_source",
]);
const contactGroupBy = new Set([
  "none",
  "lead_source",
  "contact_status",
  "contact_state",
  "contact_created_month",
  "assigned_isa",
]);

function rowsFromResult(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result) && Array.isArray(result[0]))
    return result[0] as Array<Record<string, unknown>>;
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

function metricStatements(
  metrics: CustomReportDefinition["metrics"],
  dataset: CustomReportDefinition["dataset"]
): SQL[] {
  const map: Record<string, SQL> = {
    transaction_count: sql`COUNT(t.\`id\`) AS \`transaction_count\``,
    closed_count: sql`SUM(CASE WHEN t.\`status\` = 'closed' THEN 1 ELSE 0 END) AS \`closed_count\``,
    under_contract_count: sql`SUM(CASE WHEN t.\`status\` = 'under_contract' THEN 1 ELSE 0 END) AS \`under_contract_count\``,
    purchase_volume: sql`COALESCE(SUM(COALESCE(t.\`purchasePrice\`, 0)), 0) AS \`purchase_volume\``,
    gross_commission: sql`COALESCE(SUM(COALESCE(t.\`grossCommissionIncome\`, 0)), 0) AS \`gross_commission\``,
    savvy_net: sql`COALESCE(SUM(COALESCE(pi.savvyNet, 0)), 0) AS \`savvy_net\``,
    contact_count: sql`COUNT(c.\`id\`) AS \`contact_count\``,
    do_not_contact_count: sql`SUM(CASE WHEN c.\`doNotContact\` = 1 THEN 1 ELSE 0 END) AS \`do_not_contact_count\``,
    valid_email_count: sql`SUM(CASE WHEN c.\`emailStatus\` = 'valid' AND c.\`email\` IS NOT NULL THEN 1 ELSE 0 END) AS \`valid_email_count\``,
  };
  const allowed =
    dataset === "transactions" ? transactionMetrics : contactMetrics;
  return metrics
    .filter(metric => allowed.has(metric))
    .map(metric => map[metric]);
}

function transactionGroup(definition: CustomReportDefinition): {
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
      const dateColumn =
        definition.dateBasis === "contract"
          ? sql`t.\`contractDate\``
          : definition.dateBasis === "created"
            ? sql`t.\`createdAt\``
            : sql`t.\`closingDate\``;
      return {
        select: [
          sql`DATE_FORMAT(${dateColumn}, '%Y-%m') AS \`group_key\``,
          sql`DATE_FORMAT(${dateColumn}, '%b %Y') AS \`group_label\``,
        ],
        group: [
          sql`DATE_FORMAT(${dateColumn}, '%Y-%m')`,
          sql`DATE_FORMAT(${dateColumn}, '%b %Y')`,
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
    default:
      return {
        select: [
          sql`'all' AS \`group_key\``,
          sql`'All matching records' AS \`group_label\``,
        ],
        group: [],
      };
  }
}

function contactGroup(definition: CustomReportDefinition): {
  select: SQL[];
  group: SQL[];
} {
  switch (definition.groupBy) {
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
      return {
        select: [
          sql`COALESCE(c.\`assignedIsaId\`, 0) AS \`group_key\``,
          sql`COALESCE(isa.\`name\`, 'Unassigned') AS \`group_label\``,
        ],
        group: [sql`c.\`assignedIsaId\``, sql`isa.\`name\``],
      };
    default:
      return {
        select: [
          sql`'all' AS \`group_key\``,
          sql`'All matching records' AS \`group_label\``,
        ],
        group: [],
      };
  }
}

function listClause(values: number[]): SQL | undefined {
  return values.length
    ? sql`(${sql.join(
        values.map(value => sql`${value}`),
        sql`, `
      )})`
    : undefined;
}

function transactionWhere(definition: CustomReportDefinition): SQL {
  const dateColumn =
    definition.dateBasis === "contract"
      ? sql`t.\`contractDate\``
      : definition.dateBasis === "created"
        ? sql`t.\`createdAt\``
        : sql`t.\`closingDate\``;
  const conditions: SQL[] = [];
  if (definition.dateFrom)
    conditions.push(sql`DATE(${dateColumn}) >= ${definition.dateFrom}`);
  if (definition.dateTo)
    conditions.push(sql`DATE(${dateColumn}) <= ${definition.dateTo}`);
  if (definition.transactionStatus !== "all")
    conditions.push(sql`t.\`status\` = ${definition.transactionStatus}`);
  if (definition.transactionType !== "all")
    conditions.push(sql`t.\`transactionType\` = ${definition.transactionType}`);
  const agentIds = listClause(definition.agentIds);
  if (agentIds) conditions.push(sql`t.\`agentId\` IN ${agentIds}`);
  const leadSourceIds = listClause(definition.leadSourceIds);
  if (leadSourceIds)
    conditions.push(sql`c.\`leadSourceId\` IN ${leadSourceIds}`);
  return conditions.length
    ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
    : sql``;
}

function contactWhere(definition: CustomReportDefinition): SQL {
  const conditions: SQL[] = [];
  if (definition.dateFrom)
    conditions.push(sql`DATE(c.\`createdAt\`) >= ${definition.dateFrom}`);
  if (definition.dateTo)
    conditions.push(sql`DATE(c.\`createdAt\`) <= ${definition.dateTo}`);
  const leadSourceIds = listClause(definition.leadSourceIds);
  if (leadSourceIds)
    conditions.push(sql`c.\`leadSourceId\` IN ${leadSourceIds}`);
  return conditions.length
    ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
    : sql``;
}

function formatMetricLabel(metric: string): string {
  return metric
    .replace(/_/g, " ")
    .replace(/\b\w/g, character => character.toUpperCase());
}

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeRows(
  rows: Array<Record<string, unknown>>,
  metrics: string[]
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

export async function executeCustomReport(rawDefinition: unknown) {
  const definition = customReportDefinitionSchema.parse(rawDefinition);
  const validMetrics = definition.metrics.filter(metric =>
    definition.dataset === "transactions"
      ? transactionMetrics.has(metric)
      : contactMetrics.has(metric)
  );
  if (validMetrics.length === 0)
    throw new Error(
      "The report definition has no valid metrics for its selected dataset."
    );
  if (
    definition.dataset === "transactions" &&
    !transactionGroupBy.has(definition.groupBy)
  )
    throw new Error("This grouping is not available for transaction reports.");
  if (
    definition.dataset === "contacts" &&
    !contactGroupBy.has(definition.groupBy)
  )
    throw new Error("This grouping is not available for contact reports.");
  if (!validMetrics.includes(definition.sortMetric))
    throw new Error(
      "The sorting metric must be included in the report metrics."
    );

  const group =
    definition.dataset === "transactions"
      ? transactionGroup(definition)
      : contactGroup(definition);
  const metrics = metricStatements(validMetrics, definition.dataset);
  const order = definition.sortDirection === "asc" ? sql`ASC` : sql`DESC`;
  let statement: SQL;

  if (definition.dataset === "transactions") {
    statement = sql`
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
      ${group.group.length ? sql`GROUP BY ${sql.join(group.group, sql`, `)}` : sql``}
      ORDER BY \`${sql.raw(definition.sortMetric)}\` ${order}, \`group_label\` ASC
      LIMIT ${definition.limit}
    `;
  } else {
    statement = sql`
      SELECT ${sql.join([...group.select, ...metrics], sql`, `)}
      FROM \`contacts\` c
      LEFT JOIN \`lead_sources\` ls ON ls.\`id\` = c.\`leadSourceId\`
      LEFT JOIN \`users\` isa ON isa.\`id\` = c.\`assignedIsaId\`
      ${contactWhere(definition)}
      ${group.group.length ? sql`GROUP BY ${sql.join(group.group, sql`, `)}` : sql``}
      ORDER BY \`${sql.raw(definition.sortMetric)}\` ${order}, \`group_label\` ASC
      LIMIT ${definition.limit}
    `;
  }

  const rows = normalizeRows(await runRows(statement), validMetrics);
  return {
    definition: { ...definition, metrics: validMetrics },
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
    summary: `${rows.length} ${rows.length === 1 ? "result" : "results"} from the approved ${definition.dataset} reporting dataset.`,
    generatedAt: new Date().toISOString(),
  };
}

const plannerSchema = {
  type: "object",
  properties: {
    dataset: { type: "string", enum: ["transactions", "contacts"] },
    title: { type: "string" },
    description: { type: "string" },
    metrics: {
      type: "array",
      items: {
        type: "string",
        enum: [
          "transaction_count",
          "closed_count",
          "under_contract_count",
          "purchase_volume",
          "gross_commission",
          "savvy_net",
          "contact_count",
          "do_not_contact_count",
          "valid_email_count",
        ],
      },
    },
    groupBy: {
      type: "string",
      enum: [
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
      ],
    },
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
    leadSourceIds: { type: "array", items: { type: "integer" } },
    sortMetric: {
      type: "string",
      enum: [
        "transaction_count",
        "closed_count",
        "under_contract_count",
        "purchase_volume",
        "gross_commission",
        "savvy_net",
        "contact_count",
        "do_not_contact_count",
        "valid_email_count",
      ],
    },
    sortDirection: { type: "string", enum: ["asc", "desc"] },
    limit: { type: "integer" },
  },
  required: [
    "dataset",
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
    "leadSourceIds",
    "sortMetric",
    "sortDirection",
    "limit",
  ],
  additionalProperties: false,
};

export async function planCustomReport(
  prompt: string
): Promise<CustomReportDefinition> {
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content:
          "You are SavvyOS's report planner. Convert an administrator's natural-language request into one safe report definition. You never create SQL, never request personal contact details, and only use the provided schema. Transaction metrics may only be grouped by none, agent, status, type, closing month, or lead source. Contact metrics may only be grouped by none, lead source, contact status, state, created month, or assigned ISA. Use only numeric record-count, status-count, purchase-volume, commission, Savvy-net, do-not-contact, and valid-email measures. If the request is ambiguous, choose a sensible aggregate report and explain the assumptions in description. Date values must use YYYY-MM-DD or null. Do not invent agent or lead-source IDs; use empty arrays when no specific ID was supplied.",
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
  return customReportDefinitionSchema.parse(JSON.parse(content));
}

export function suggestedCustomReportPrompts(): string[] {
  return [
    "Show closed transaction count, purchase volume, gross commission, and Savvy net by agent for the current quarter.",
    "Break down new contacts by lead source for the last 90 days, sorted by the largest source.",
    "Show under-contract transaction count and expected purchase volume by closing month for the next 12 months.",
    "Show contact count and valid email count by assigned ISA for the current year.",
  ];
}
