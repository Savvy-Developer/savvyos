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
  const lastDays = normalized.match(/\blast\s+(\d{1,3})\s+days?\b/);
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

function deterministicCustomReportPlan(prompt: string): CustomReportDefinition {
  const normalized = prompt.toLowerCase();
  const wantsContacts =
    /\b(contact|contacts|lead|leads|isa|email|emails|do not contact|dnc)\b/.test(
      normalized
    );
  const dataset: CustomReportDefinition["dataset"] = wantsContacts
    ? "contacts"
    : "transactions";
  const dateRange = deterministicDateRange(normalized);

  if (dataset === "contacts") {
    const groupBy: CustomReportDefinition["groupBy"] =
      /\b(lead source|source)\b/.test(normalized)
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
    const metrics: CustomReportDefinition["metrics"] = ["contact_count"];
    if (/\b(valid email|email quality|emails)\b/.test(normalized))
      metrics.push("valid_email_count");
    if (/\b(do not contact|dnc|opted out)\b/.test(normalized))
      metrics.push("do_not_contact_count");
    return customReportDefinitionSchema.parse({
      dataset,
      title: "Custom Contact Report",
      description:
        "SavvyOS applied a safe contact-reporting interpretation of your request. You can save or refine this approved definition after review.",
      metrics,
      groupBy,
      ...dateRange,
      dateBasis: "created",
      transactionStatus: "all",
      transactionType: "all",
      agentIds: [],
      leadSourceIds: [],
      sortMetric: metrics[0],
      sortDirection: "desc",
      limit: 100,
    });
  }

  const groupBy: CustomReportDefinition["groupBy"] =
    /\b(by|per) agent\b|\bagents?\b/.test(normalized)
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
  const metrics: CustomReportDefinition["metrics"] = [];
  if (/\b(closed|closings)\b/.test(normalized)) metrics.push("closed_count");
  if (/\b(under contract|pending)\b/.test(normalized))
    metrics.push("under_contract_count");
  if (/\b(volume|purchase price|purchase volume)\b/.test(normalized))
    metrics.push("purchase_volume");
  if (/\b(gci|gross commission|commission)\b/.test(normalized))
    metrics.push("gross_commission");
  if (/\b(savvy net|net revenue|company net)\b/.test(normalized))
    metrics.push("savvy_net");
  if (metrics.length === 0) metrics.push("transaction_count");
  const transactionStatus: CustomReportDefinition["transactionStatus"] =
    /\bunder contract\b/.test(normalized)
      ? "under_contract"
      : /\bclosed\b/.test(normalized)
        ? "closed"
        : /\bterminated\b/.test(normalized)
          ? "terminated"
          : "all";
  const transactionType: CustomReportDefinition["transactionType"] =
    /\bdual\b/.test(normalized)
      ? "dual"
      : /\bbuyer\b/.test(normalized)
        ? "buyer"
        : /\bseller\b/.test(normalized)
          ? "seller"
          : "all";
  return customReportDefinitionSchema.parse({
    dataset,
    title: "Custom Transaction Report",
    description:
      "SavvyOS applied a safe transaction-reporting interpretation of your request. You can save or refine this approved definition after review.",
    metrics,
    groupBy,
    ...dateRange,
    dateBasis: /\bcontract\b/.test(normalized) ? "contract" : "closing",
    transactionStatus,
    transactionType,
    agentIds: [],
    leadSourceIds: [],
    sortMetric: metrics[0],
    sortDirection: "desc",
    limit: 100,
  });
}

function hasManagedForgeProvider(): boolean {
  return Boolean(
    process.env.BUILT_IN_FORGE_API_URL?.trim() &&
      process.env.BUILT_IN_FORGE_API_KEY?.trim()
  );
}

export async function planCustomReport(
  prompt: string
): Promise<CustomReportDefinition> {
  // Do not fall through to direct OpenAI billing when a managed Forge provider was
  // not configured for this Railway service. The deterministic planner preserves a
  // safe, useful reporting path until a managed model provider is available.
  if (!hasManagedForgeProvider()) return deterministicCustomReportPlan(prompt);

  try {
    const response = await invokeLLM({
      model: process.env.CUSTOM_REPORTS_MODEL?.trim() || "gpt-5-mini",
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
  } catch (error) {
    console.warn(
      "[Custom Reports] Managed planner unavailable; using safe deterministic planner.",
      error
    );
    return deterministicCustomReportPlan(prompt);
  }
}

export function suggestedCustomReportPrompts(): string[] {
  return [
    "Show closed transaction count, purchase volume, gross commission, and Savvy net by agent for the current quarter.",
    "Break down new contacts by lead source for the last 90 days, sorted by the largest source.",
    "Show under-contract transaction count and expected purchase volume by closing month for the next 12 months.",
    "Show contact count and valid email count by assigned ISA for the current year.",
  ];
}
