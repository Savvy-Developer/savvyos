import { sql, type SQL } from "drizzle-orm";
import { getDb } from "../db";

type Row = Record<string, unknown>;

export type IsmDashboardFilters = {
  dateFrom?: string;
  dateTo?: string;
  isaIds?: number[];
  leadSourceId?: number;
};

export type IsmHealthStatus = "healthy" | "warning" | "critical";
export type IsmMetricConfidence = "trusted" | "provisional";

const ACTIVE_ISA_STATUSES = [
  "new_lead",
  "attempted_contact",
  "nurture",
  "active_client",
  "under_contract",
] as const;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function asNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asString(value: unknown, fallback = ""): string {
  return value === null || value === undefined ? fallback : String(value);
}

function asDateTime(value: unknown): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function asDay(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string" && DATE_PATTERN.test(value.slice(0, 10)))
    return value.slice(0, 10);
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function dayString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseDay(value: string | undefined, fallback: Date): Date {
  if (!value || !DATE_PATTERN.test(value)) return fallback;
  const parsed = new Date(`${value}T12:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

export function resolveIsmDateRange(
  filters: IsmDashboardFilters,
  now = new Date()
): { dateFrom: string; dateTo: string } {
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12)
  );
  const defaultFrom = new Date(today);
  defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 29);

  let from = parseDay(filters.dateFrom, defaultFrom);
  let to = parseDay(filters.dateTo, today);
  if (from.getTime() > to.getTime()) [from, to] = [to, from];

  return { dateFrom: dayString(from), dateTo: dayString(to) };
}

export function percentage(
  numerator: number,
  denominator: number
): number | null {
  if (!denominator) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

export function classifyHigherIsWorse(
  rate: number | null,
  warningAt: number,
  criticalAt: number
): IsmHealthStatus {
  if (rate === null) return "warning";
  if (rate >= criticalAt) return "critical";
  if (rate >= warningAt) return "warning";
  return "healthy";
}

export function classifyLowerIsWorse(
  rate: number | null,
  warningBelow: number,
  criticalBelow: number
): IsmHealthStatus {
  if (rate === null) return "warning";
  if (rate <= criticalBelow) return "critical";
  if (rate <= warningBelow) return "warning";
  return "healthy";
}

function rowsFromResult<T extends Row = Row>(result: unknown): T[] {
  if (Array.isArray(result) && Array.isArray(result[0]))
    return result[0] as T[];
  if (Array.isArray(result)) return result as T[];
  return [];
}

async function runRows<T extends Row = Row>(statement: SQL): Promise<T[]> {
  const db = await getDb();
  if (!db) return [];
  const result = await (
    db as unknown as { execute: (query: SQL) => Promise<unknown> }
  ).execute(statement);
  return rowsFromResult<T>(result);
}

function where(clauses: Array<SQL | undefined>): SQL {
  const usable = clauses.filter((clause): clause is SQL => Boolean(clause));
  return usable.length ? sql`WHERE ${sql.join(usable, sql` AND `)}` : sql``;
}

function selectedIds(filters: IsmDashboardFilters): number[] {
  return Array.from(
    new Set((filters.isaIds ?? []).filter(id => Number.isInteger(id) && id > 0))
  );
}

function idScope(column: SQL, ids: number[]): SQL | undefined {
  return ids.length
    ? sql`${column} IN (${sql.join(
        ids.map(id => sql`${id}`),
        sql`, `
      )})`
    : undefined;
}

function inclusiveDateRange(
  column: SQL,
  dateFrom: string,
  dateTo: string
): SQL {
  return sql`${column} >= ${dateFrom} AND ${column} < DATE_ADD(${dateTo}, INTERVAL 1 DAY)`;
}

function formatWeekLabel(day: string): string {
  if (!day) return "";
  const date = new Date(`${day}T12:00:00.000Z`);
  return Number.isNaN(date.getTime())
    ? day
    : date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      });
}

export function mergeWeeklyTrend(
  dateFrom: string,
  dateTo: string,
  sources: Array<Array<{ weekStart: string; value: number }>>
): Array<{
  period: string;
  label: string;
  assignedLeads: number;
  completedSessions: number;
  callAttempts: number;
  completedTasks: number;
}> {
  const start = new Date(`${dateFrom}T12:00:00.000Z`);
  const end = new Date(`${dateTo}T12:00:00.000Z`);
  const monday = new Date(start);
  const weekday = monday.getUTCDay() || 7;
  monday.setUTCDate(monday.getUTCDate() - (weekday - 1));

  const maps = sources.map(
    rows => new Map(rows.map(row => [row.weekStart, row.value]))
  );
  const result: Array<{
    period: string;
    label: string;
    assignedLeads: number;
    completedSessions: number;
    callAttempts: number;
    completedTasks: number;
  }> = [];
  for (
    const cursor = new Date(monday);
    cursor <= end;
    cursor.setUTCDate(cursor.getUTCDate() + 7)
  ) {
    const period = dayString(cursor);
    result.push({
      period,
      label: formatWeekLabel(period),
      assignedLeads: maps[0]?.get(period) ?? 0,
      completedSessions: maps[1]?.get(period) ?? 0,
      callAttempts: maps[2]?.get(period) ?? 0,
      completedTasks: maps[3]?.get(period) ?? 0,
    });
  }
  return result;
}

const metricDefinitions: Record<
  string,
  { label: string; description: string; confidence: IsmMetricConfidence }
> = {
  recentAssigned: {
    label: "Assigned intake",
    description:
      "Contacts created in the selected period that are currently assigned to an active ISA. This is a current-owner proxy, not assignment-event history.",
    confidence: "provisional",
  },
  assignmentCoverage: {
    label: "Recent assignment coverage",
    description:
      "Contacts created in the selected period currently assigned to an active ISA divided by all unarchived contacts created in the period. ISA eligibility is not yet modeled.",
    confidence: "provisional",
  },
  activeBook: {
    label: "Active book",
    description:
      "Currently assigned contacts in new lead, attempted contact, nurture, active client, or under contract status.",
    confidence: "trusted",
  },
  untouched: {
    label: "Untouched assigned leads",
    description:
      "Currently assigned contacts created in the selected period with no contact-linked communication at or after creation. Unmatched Aircall activity may not be represented.",
    confidence: "provisional",
  },
  staleSevenDays: {
    label: "Stale over 7 days",
    description:
      "Active-book contacts whose latest contact-linked communication is older than seven days, or that have no linked communication.",
    confidence: "provisional",
  },
  overdueFollowUps: {
    label: "Overdue follow-ups",
    description:
      "Pending or in-progress tasks assigned to an ISA with a due date before the current time.",
    confidence: "trusted",
  },
  completedSessions: {
    label: "Completed Market Match sessions",
    description:
      "Market Match sessions started in the selected period whose current status is completed.",
    confidence: "trusted",
  },
  stuckSessions: {
    label: "Stuck Market Match sessions",
    description: "Active Market Match sessions started more than 24 hours ago.",
    confidence: "trusted",
  },
  callAttempts: {
    label: "Aircall attempts",
    description:
      "Matched and unmatched Aircall records in the selected period, attributed by Aircall user email to an active ISA.",
    confidence: "provisional",
  },
  callMatchRate: {
    label: "Aircall contact match rate",
    description:
      "Contact-matched Aircall records divided by all attributed Aircall records in the selected period.",
    confidence: "trusted",
  },
};

export async function getIsmDashboard(filters: IsmDashboardFilters = {}) {
  const range = resolveIsmDateRange(filters);
  const ids = selectedIds(filters);
  const sourceId =
    filters.leadSourceId && filters.leadSourceId > 0
      ? filters.leadSourceId
      : undefined;

  const rosterWhere = where([sql`u.\`role\` = 'isa'`, sql`u.\`isActive\` = 1`]);
  const userWhere = where([
    sql`u.\`role\` = 'isa'`,
    sql`u.\`isActive\` = 1`,
    idScope(sql`u.\`id\``, ids),
  ]);
  const assignedContactScope =
    idScope(sql`c.\`assignedIsaId\``, ids) ??
    sql`c.\`assignedIsaId\` IN (SELECT active_isa.id FROM \`users\` active_isa WHERE active_isa.\`role\` = 'isa' AND active_isa.\`isActive\` = 1)`;
  const taskIsaScope =
    idScope(sql`t.\`assignedToId\``, ids) ??
    sql`t.\`assignedToId\` IN (SELECT active_isa.id FROM \`users\` active_isa WHERE active_isa.\`role\` = 'isa' AND active_isa.\`isActive\` = 1)`;
  const sessionIsaScope =
    idScope(sql`ms.\`isaId\``, ids) ??
    sql`ms.\`isaId\` IN (SELECT active_isa.id FROM \`users\` active_isa WHERE active_isa.\`role\` = 'isa' AND active_isa.\`isActive\` = 1)`;

  const contactSourceJoin = sourceId
    ? sql`AND c.\`leadSourceId\` = ${sourceId}`
    : sql``;
  const contactSourceWhere = sourceId
    ? sql`c.\`leadSourceId\` = ${sourceId}`
    : undefined;
  const taskSourceJoin = sourceId
    ? sql`AND EXISTS (SELECT 1 FROM \`contacts\` task_contact WHERE task_contact.id = t.\`relatedContactId\` AND task_contact.\`leadSourceId\` = ${sourceId})`
    : sql``;
  const sessionSourceJoin = sourceId
    ? sql`AND EXISTS (SELECT 1 FROM \`contacts\` session_contact WHERE session_contact.id = ms.\`contactId\` AND session_contact.\`leadSourceId\` = ${sourceId})`
    : sql``;

  const [
    rosterRows,
    leadSourceRows,
    intakeRows,
    contactRows,
    taskRows,
    sessionRows,
    callRows,
    unassignedQueueRows,
    untouchedQueueRows,
    staleQueueRows,
    overdueTaskQueueRows,
    stuckSessionQueueRows,
    sourceMixRows,
    assignedTrendRows,
    sessionTrendRows,
    callTrendRows,
    taskTrendRows,
    appointmentRows,
  ] = await Promise.all([
    runRows<Row>(sql`
      SELECT
        u.id,
        u.name,
        u.title,
        u.\`reportsToId\`,
        manager.name AS managerName,
        u.\`lastSignedIn\`
      FROM \`users\` u
      LEFT JOIN \`users\` manager ON manager.id = u.\`reportsToId\`
      ${rosterWhere}
      ORDER BY COALESCE(u.name, '') ASC
    `),
    runRows<Row>(sql`
      SELECT ls.id, ls.name, parent.name AS parentName
      FROM \`lead_sources\` ls
      LEFT JOIN \`lead_sources\` parent ON parent.id = ls.\`parentId\`
      WHERE ls.\`isActive\` = 1
      ORDER BY COALESCE(parent.name, ls.name), ls.name
    `),
    runRows<Row>(sql`
      SELECT
        COUNT(*) AS recentContacts,
        SUM(CASE WHEN active_isa.id IS NOT NULL THEN 1 ELSE 0 END) AS recentAssigned,
        SUM(CASE WHEN c.\`assignedIsaId\` IS NULL THEN 1 ELSE 0 END) AS recentUnassigned,
        SUM(CASE WHEN c.\`assignedIsaId\` IS NOT NULL AND active_isa.id IS NULL THEN 1 ELSE 0 END) AS assignedOutsideActiveRoster,
        SUM(CASE WHEN c.\`isa_status\` IS NULL THEN 1 ELSE 0 END) AS missingIsaStatus,
        SUM(CASE WHEN c.phone IS NULL OR TRIM(c.phone) = '' THEN 1 ELSE 0 END) AS missingPhone
      FROM \`contacts\` c
      LEFT JOIN \`users\` active_isa ON active_isa.id = c.\`assignedIsaId\` AND active_isa.\`role\` = 'isa' AND active_isa.\`isActive\` = 1
      ${where([
        sql`c.\`archived_at\` IS NULL`,
        inclusiveDateRange(sql`c.\`createdAt\``, range.dateFrom, range.dateTo),
        contactSourceWhere,
      ])}
    `),
    runRows<Row>(sql`
      SELECT
        u.id AS isaId,
        u.name AS isaName,
        u.title,
        manager.name AS managerName,
        COUNT(c.id) AS currentAssigned,
        SUM(CASE WHEN c.\`isa_status\` IN ('new_lead','attempted_contact','nurture','active_client','under_contract') THEN 1 ELSE 0 END) AS activeBook,
        SUM(CASE WHEN ${inclusiveDateRange(sql`c.\`createdAt\``, range.dateFrom, range.dateTo)} THEN 1 ELSE 0 END) AS newAssigned,
        SUM(CASE WHEN c.\`isa_status\` = 'new_lead' THEN 1 ELSE 0 END) AS newLeads,
        SUM(CASE WHEN c.\`isa_status\` = 'attempted_contact' THEN 1 ELSE 0 END) AS attemptedContact,
        SUM(CASE WHEN c.\`isa_status\` = 'nurture' THEN 1 ELSE 0 END) AS nurture,
        SUM(CASE WHEN c.\`isa_status\` = 'active_client' THEN 1 ELSE 0 END) AS activeClients,
        SUM(CASE WHEN c.\`isa_status\` = 'under_contract' THEN 1 ELSE 0 END) AS underContract,
        SUM(CASE WHEN c.\`isa_status\` = 'closed' THEN 1 ELSE 0 END) AS closed,
        SUM(CASE WHEN ${inclusiveDateRange(sql`c.\`createdAt\``, range.dateFrom, range.dateTo)} AND (last_touch.lastTouchAt IS NULL OR last_touch.lastTouchAt < c.\`createdAt\`) THEN 1 ELSE 0 END) AS untouched,
        SUM(CASE WHEN c.\`isa_status\` IN ('new_lead','attempted_contact','nurture','active_client','under_contract') AND (last_touch.lastTouchAt IS NULL OR last_touch.lastTouchAt < NOW() - INTERVAL 7 DAY) THEN 1 ELSE 0 END) AS staleSevenDays
      FROM \`users\` u
      LEFT JOIN \`users\` manager ON manager.id = u.\`reportsToId\`
      LEFT JOIN \`contacts\` c ON c.\`assignedIsaId\` = u.id AND c.\`archived_at\` IS NULL ${contactSourceJoin}
      LEFT JOIN (
        SELECT cm.\`relatedContactId\` AS contactId, MAX(cm.\`communicatedAt\`) AS lastTouchAt
        FROM \`communications\` cm
        WHERE cm.\`relatedContactId\` IS NOT NULL
        GROUP BY cm.\`relatedContactId\`
      ) last_touch ON last_touch.contactId = c.id
      ${userWhere}
      GROUP BY u.id, u.name, u.title, manager.name
      ORDER BY COALESCE(u.name, '') ASC
    `),
    runRows<Row>(sql`
      SELECT
        u.id AS isaId,
        SUM(CASE WHEN t.status IN ('pending','in_progress') THEN 1 ELSE 0 END) AS openTasks,
        SUM(CASE WHEN t.status IN ('pending','in_progress') AND t.\`dueDate\` < NOW() THEN 1 ELSE 0 END) AS overdueTasks,
        SUM(CASE WHEN t.status = 'completed' AND ${inclusiveDateRange(sql`t.\`completedAt\``, range.dateFrom, range.dateTo)} THEN 1 ELSE 0 END) AS completedTasks
      FROM \`users\` u
      LEFT JOIN \`tasks\` t ON t.\`assignedToId\` = u.id ${taskSourceJoin}
      ${userWhere}
      GROUP BY u.id
    `),
    runRows<Row>(sql`
      SELECT
        u.id AS isaId,
        SUM(CASE WHEN ${inclusiveDateRange(sql`ms.\`startedAt\``, range.dateFrom, range.dateTo)} THEN 1 ELSE 0 END) AS sessions,
        SUM(CASE WHEN ms.status = 'completed' AND ${inclusiveDateRange(sql`ms.\`startedAt\``, range.dateFrom, range.dateTo)} THEN 1 ELSE 0 END) AS completedSessions,
        SUM(CASE WHEN ms.status = 'active' THEN 1 ELSE 0 END) AS activeSessions,
        SUM(CASE WHEN ms.status = 'active' AND ms.\`startedAt\` < NOW() - INTERVAL 1 DAY THEN 1 ELSE 0 END) AS stuckSessions,
        SUM(CASE WHEN ms.status = 'active' AND (ms.\`nextActionRecommendation\` IS NULL OR TRIM(ms.\`nextActionRecommendation\`) = '') THEN 1 ELSE 0 END) AS missingNextAction
      FROM \`users\` u
      LEFT JOIN \`market_match_sessions\` ms ON ms.\`isaId\` = u.id ${sessionSourceJoin}
      ${userWhere}
      GROUP BY u.id
    `),
    runRows<Row>(sql`
      SELECT
        call_events.userId AS isaId,
        COUNT(*) AS callAttempts,
        SUM(call_events.isMatched) AS matchedCalls,
        SUM(CASE WHEN call_events.duration >= 30 THEN 1 ELSE 0 END) AS connectedThirtySeconds,
        ROUND(SUM(COALESCE(call_events.duration, 0)) / 60, 1) AS talkMinutes,
        COUNT(DISTINCT CASE WHEN call_events.isMatched = 1 THEN call_events.contactId ELSE NULL END) AS uniqueMatchedContacts
      FROM (
        SELECT u.id AS userId, 1 AS isMatched, ac.duration, ac.\`contactId\`, ac.\`startedAt\`
        FROM \`aircall_calls\` ac
        INNER JOIN \`users\` u ON LOWER(u.email) = LOWER(JSON_UNQUOTE(JSON_EXTRACT(ac.\`rawPayload\`, '$.user.email')))
        ${where([
          sql`u.\`role\` = 'isa'`,
          sql`u.\`isActive\` = 1`,
          idScope(sql`u.id`, ids),
          inclusiveDateRange(
            sql`ac.\`startedAt\``,
            range.dateFrom,
            range.dateTo
          ),
        ])}
        UNION ALL
        SELECT u.id AS userId, 0 AS isMatched, auc.duration, NULL AS contactId, auc.\`startedAt\`
        FROM \`aircall_unmatched_calls\` auc
        INNER JOIN \`users\` u ON LOWER(u.email) = LOWER(JSON_UNQUOTE(JSON_EXTRACT(auc.\`rawPayload\`, '$.user.email')))
        ${where([
          sql`u.\`role\` = 'isa'`,
          sql`u.\`isActive\` = 1`,
          idScope(sql`u.id`, ids),
          inclusiveDateRange(
            sql`auc.\`startedAt\``,
            range.dateFrom,
            range.dateTo
          ),
        ])}
      ) call_events
      GROUP BY call_events.userId
    `),
    runRows<Row>(sql`
      SELECT
        c.id AS contactId,
        CONCAT_WS(' ', c.\`firstName\`, c.\`lastName\`) AS contactName,
        c.email,
        c.phone,
        c.\`createdAt\`,
        COALESCE(ls.name, c.\`leadSourceType\`, 'Unclassified') AS sourceName,
        TIMESTAMPDIFF(HOUR, c.\`createdAt\`, NOW()) AS ageHours
      FROM \`contacts\` c
      LEFT JOIN \`lead_sources\` ls ON ls.id = c.\`leadSourceId\`
      ${where([
        sql`c.\`archived_at\` IS NULL`,
        sql`c.\`assignedIsaId\` IS NULL`,
        inclusiveDateRange(sql`c.\`createdAt\``, range.dateFrom, range.dateTo),
        contactSourceWhere,
      ])}
      ORDER BY c.\`createdAt\` ASC
      LIMIT 50
    `),
    runRows<Row>(sql`
      SELECT
        c.id AS contactId,
        CONCAT_WS(' ', c.\`firstName\`, c.\`lastName\`) AS contactName,
        c.email,
        c.phone,
        c.\`isa_status\` AS isaStatus,
        c.\`assignedIsaId\` AS isaId,
        u.name AS isaName,
        c.\`createdAt\`,
        last_touch.lastTouchAt,
        COALESCE(ls.name, c.\`leadSourceType\`, 'Unclassified') AS sourceName,
        TIMESTAMPDIFF(HOUR, c.\`createdAt\`, NOW()) AS ageHours
      FROM \`contacts\` c
      INNER JOIN \`users\` u ON u.id = c.\`assignedIsaId\` AND u.\`role\` = 'isa' AND u.\`isActive\` = 1
      LEFT JOIN \`lead_sources\` ls ON ls.id = c.\`leadSourceId\`
      LEFT JOIN (
        SELECT cm.\`relatedContactId\` AS contactId, MAX(cm.\`communicatedAt\`) AS lastTouchAt
        FROM \`communications\` cm
        WHERE cm.\`relatedContactId\` IS NOT NULL
        GROUP BY cm.\`relatedContactId\`
      ) last_touch ON last_touch.contactId = c.id
      ${where([
        sql`c.\`archived_at\` IS NULL`,
        assignedContactScope,
        inclusiveDateRange(sql`c.\`createdAt\``, range.dateFrom, range.dateTo),
        sql`last_touch.lastTouchAt IS NULL OR last_touch.lastTouchAt < c.\`createdAt\``,
        contactSourceWhere,
      ])}
      ORDER BY c.\`createdAt\` ASC
      LIMIT 50
    `),
    runRows<Row>(sql`
      SELECT
        c.id AS contactId,
        CONCAT_WS(' ', c.\`firstName\`, c.\`lastName\`) AS contactName,
        c.email,
        c.phone,
        c.\`isa_status\` AS isaStatus,
        c.\`assignedIsaId\` AS isaId,
        u.name AS isaName,
        c.\`createdAt\`,
        last_touch.lastTouchAt,
        COALESCE(ls.name, c.\`leadSourceType\`, 'Unclassified') AS sourceName,
        TIMESTAMPDIFF(HOUR, COALESCE(last_touch.lastTouchAt, c.\`createdAt\`), NOW()) AS ageHours
      FROM \`contacts\` c
      INNER JOIN \`users\` u ON u.id = c.\`assignedIsaId\` AND u.\`role\` = 'isa' AND u.\`isActive\` = 1
      LEFT JOIN \`lead_sources\` ls ON ls.id = c.\`leadSourceId\`
      LEFT JOIN (
        SELECT cm.\`relatedContactId\` AS contactId, MAX(cm.\`communicatedAt\`) AS lastTouchAt
        FROM \`communications\` cm
        WHERE cm.\`relatedContactId\` IS NOT NULL
        GROUP BY cm.\`relatedContactId\`
      ) last_touch ON last_touch.contactId = c.id
      ${where([
        sql`c.\`archived_at\` IS NULL`,
        assignedContactScope,
        sql`c.\`isa_status\` IN ('new_lead','attempted_contact','nurture','active_client','under_contract')`,
        sql`last_touch.lastTouchAt IS NULL OR last_touch.lastTouchAt < NOW() - INTERVAL 7 DAY`,
        contactSourceWhere,
      ])}
      ORDER BY COALESCE(last_touch.lastTouchAt, c.\`createdAt\`) ASC
      LIMIT 50
    `),
    runRows<Row>(sql`
      SELECT
        t.id AS taskId,
        t.title,
        t.priority,
        t.status,
        t.\`dueDate\`,
        t.\`assignedToId\` AS isaId,
        u.name AS isaName,
        c.id AS contactId,
        CONCAT_WS(' ', c.\`firstName\`, c.\`lastName\`) AS contactName,
        TIMESTAMPDIFF(HOUR, t.\`dueDate\`, NOW()) AS ageHours
      FROM \`tasks\` t
      INNER JOIN \`users\` u ON u.id = t.\`assignedToId\` AND u.\`role\` = 'isa' AND u.\`isActive\` = 1
      LEFT JOIN \`contacts\` c ON c.id = t.\`relatedContactId\`
      ${where([
        taskIsaScope,
        sql`t.status IN ('pending','in_progress')`,
        sql`t.\`dueDate\` < NOW()`,
        sourceId ? sql`c.\`leadSourceId\` = ${sourceId}` : undefined,
      ])}
      ORDER BY t.\`dueDate\` ASC
      LIMIT 50
    `),
    runRows<Row>(sql`
      SELECT
        ms.id AS sessionId,
        ms.\`contactId\`,
        CONCAT_WS(' ', c.\`firstName\`, c.\`lastName\`) AS contactName,
        ms.\`isaId\`,
        u.name AS isaName,
        ms.status,
        ms.\`startedAt\`,
        ms.\`nextActionRecommendation\`,
        ms.\`overallConfidenceScore\`,
        TIMESTAMPDIFF(HOUR, ms.\`startedAt\`, NOW()) AS ageHours
      FROM \`market_match_sessions\` ms
      INNER JOIN \`users\` u ON u.id = ms.\`isaId\` AND u.\`role\` = 'isa' AND u.\`isActive\` = 1
      INNER JOIN \`contacts\` c ON c.id = ms.\`contactId\`
      ${where([
        sessionIsaScope,
        sql`ms.status = 'active'`,
        sql`ms.\`startedAt\` < NOW() - INTERVAL 1 DAY`,
        contactSourceWhere,
      ])}
      ORDER BY ms.\`startedAt\` ASC
      LIMIT 50
    `),
    runRows<Row>(sql`
      SELECT
        c.\`leadSourceId\` AS sourceId,
        COALESCE(ls.name, c.\`leadSourceType\`, 'Unclassified') AS sourceName,
        parent.name AS parentName,
        COUNT(*) AS contacts,
        SUM(CASE WHEN active_isa.id IS NOT NULL THEN 1 ELSE 0 END) AS assigned,
        SUM(CASE WHEN c.\`isa_status\` = 'active_client' THEN 1 ELSE 0 END) AS activeClients,
        SUM(CASE WHEN c.\`isa_status\` = 'under_contract' THEN 1 ELSE 0 END) AS underContract,
        SUM(CASE WHEN c.\`isa_status\` = 'closed' THEN 1 ELSE 0 END) AS closed
      FROM \`contacts\` c
      LEFT JOIN \`lead_sources\` ls ON ls.id = c.\`leadSourceId\`
      LEFT JOIN \`lead_sources\` parent ON parent.id = ls.\`parentId\`
      LEFT JOIN \`users\` active_isa ON active_isa.id = c.\`assignedIsaId\` AND active_isa.\`role\` = 'isa' AND active_isa.\`isActive\` = 1
      ${where([
        sql`c.\`archived_at\` IS NULL`,
        inclusiveDateRange(sql`c.\`createdAt\``, range.dateFrom, range.dateTo),
        contactSourceWhere,
      ])}
      GROUP BY c.\`leadSourceId\`, ls.name, c.\`leadSourceType\`, parent.name
      ORDER BY contacts DESC
      LIMIT 15
    `),
    runRows<Row>(sql`
      SELECT DATE_SUB(DATE(c.\`createdAt\`), INTERVAL WEEKDAY(c.\`createdAt\`) DAY) AS weekStart, COUNT(*) AS value
      FROM \`contacts\` c
      ${where([
        sql`c.\`archived_at\` IS NULL`,
        assignedContactScope,
        inclusiveDateRange(sql`c.\`createdAt\``, range.dateFrom, range.dateTo),
        contactSourceWhere,
      ])}
      GROUP BY weekStart
      ORDER BY weekStart ASC
    `),
    runRows<Row>(sql`
      SELECT DATE_SUB(DATE(ms.\`completedAt\`), INTERVAL WEEKDAY(ms.\`completedAt\`) DAY) AS weekStart, COUNT(*) AS value
      FROM \`market_match_sessions\` ms
      INNER JOIN \`contacts\` c ON c.id = ms.\`contactId\`
      ${where([
        sessionIsaScope,
        sql`ms.status = 'completed'`,
        inclusiveDateRange(
          sql`ms.\`completedAt\``,
          range.dateFrom,
          range.dateTo
        ),
        contactSourceWhere,
      ])}
      GROUP BY weekStart
      ORDER BY weekStart ASC
    `),
    runRows<Row>(sql`
      SELECT DATE_SUB(DATE(call_events.startedAt), INTERVAL WEEKDAY(call_events.startedAt) DAY) AS weekStart, COUNT(*) AS value
      FROM (
        SELECT ac.\`startedAt\` AS startedAt
        FROM \`aircall_calls\` ac
        INNER JOIN \`users\` u ON LOWER(u.email) = LOWER(JSON_UNQUOTE(JSON_EXTRACT(ac.\`rawPayload\`, '$.user.email')))
        ${where([
          sql`u.\`role\` = 'isa'`,
          sql`u.\`isActive\` = 1`,
          idScope(sql`u.id`, ids),
          inclusiveDateRange(
            sql`ac.\`startedAt\``,
            range.dateFrom,
            range.dateTo
          ),
        ])}
        UNION ALL
        SELECT auc.\`startedAt\` AS startedAt
        FROM \`aircall_unmatched_calls\` auc
        INNER JOIN \`users\` u ON LOWER(u.email) = LOWER(JSON_UNQUOTE(JSON_EXTRACT(auc.\`rawPayload\`, '$.user.email')))
        ${where([
          sql`u.\`role\` = 'isa'`,
          sql`u.\`isActive\` = 1`,
          idScope(sql`u.id`, ids),
          inclusiveDateRange(
            sql`auc.\`startedAt\``,
            range.dateFrom,
            range.dateTo
          ),
        ])}
      ) call_events
      GROUP BY weekStart
      ORDER BY weekStart ASC
    `),
    runRows<Row>(sql`
      SELECT DATE_SUB(DATE(t.\`completedAt\`), INTERVAL WEEKDAY(t.\`completedAt\`) DAY) AS weekStart, COUNT(*) AS value
      FROM \`tasks\` t
      LEFT JOIN \`contacts\` c ON c.id = t.\`relatedContactId\`
      ${where([
        taskIsaScope,
        sql`t.status = 'completed'`,
        inclusiveDateRange(
          sql`t.\`completedAt\``,
          range.dateFrom,
          range.dateTo
        ),
        sourceId ? sql`c.\`leadSourceId\` = ${sourceId}` : undefined,
      ])}
      GROUP BY weekStart
      ORDER BY weekStart ASC
    `),
    runRows<Row>(sql`
      SELECT
        COUNT(*) AS connections,
        SUM(CASE WHEN ac.\`appointmentSet\` = 1 THEN 1 ELSE 0 END) AS appointmentsSet
      FROM \`agent_connections\` ac
      INNER JOIN \`contacts\` c ON c.id = ac.\`contactId\`
      ${where([
        assignedContactScope,
        inclusiveDateRange(
          sql`COALESCE(ac.\`appointmentSetAt\`, ac.\`createdAt\`)`,
          range.dateFrom,
          range.dateTo
        ),
        contactSourceWhere,
      ])}
    `),
  ]);

  const intake = intakeRows[0] ?? {};
  const taskMap = new Map(taskRows.map(row => [asNumber(row.isaId), row]));
  const sessionMap = new Map(
    sessionRows.map(row => [asNumber(row.isaId), row])
  );
  const callMap = new Map(callRows.map(row => [asNumber(row.isaId), row]));

  const scorecard = contactRows.map(row => {
    const isaId = asNumber(row.isaId);
    const task = taskMap.get(isaId) ?? {};
    const session = sessionMap.get(isaId) ?? {};
    const calls = callMap.get(isaId) ?? {};
    const callAttempts = asNumber(calls.callAttempts);
    const matchedCalls = asNumber(calls.matchedCalls);
    return {
      isaId,
      isaName: asString(row.isaName, "Unknown ISA"),
      title: row.title ? asString(row.title) : null,
      managerName: row.managerName ? asString(row.managerName) : null,
      currentAssigned: asNumber(row.currentAssigned),
      activeBook: asNumber(row.activeBook),
      newAssigned: asNumber(row.newAssigned),
      newLeads: asNumber(row.newLeads),
      attemptedContact: asNumber(row.attemptedContact),
      nurture: asNumber(row.nurture),
      activeClients: asNumber(row.activeClients),
      underContract: asNumber(row.underContract),
      closed: asNumber(row.closed),
      untouched: asNumber(row.untouched),
      staleSevenDays: asNumber(row.staleSevenDays),
      openTasks: asNumber(task.openTasks),
      overdueTasks: asNumber(task.overdueTasks),
      completedTasks: asNumber(task.completedTasks),
      sessions: asNumber(session.sessions),
      completedSessions: asNumber(session.completedSessions),
      activeSessions: asNumber(session.activeSessions),
      stuckSessions: asNumber(session.stuckSessions),
      missingNextAction: asNumber(session.missingNextAction),
      callAttempts,
      matchedCalls,
      connectedThirtySeconds: asNumber(calls.connectedThirtySeconds),
      talkMinutes: asNumber(calls.talkMinutes),
      uniqueMatchedContacts: asNumber(calls.uniqueMatchedContacts),
      callMatchRate: percentage(matchedCalls, callAttempts),
    };
  });

  const recentContacts = asNumber(intake.recentContacts);
  const recentAssigned = asNumber(intake.recentAssigned);
  const recentUnassigned = asNumber(intake.recentUnassigned);
  const totalCallAttempts = scorecard.reduce(
    (sum, row) => sum + row.callAttempts,
    0
  );
  const totalMatchedCalls = scorecard.reduce(
    (sum, row) => sum + row.matchedCalls,
    0
  );
  const totalStuckSessions = scorecard.reduce(
    (sum, row) => sum + row.stuckSessions,
    0
  );
  const totalMissingNextAction = scorecard.reduce(
    (sum, row) => sum + row.missingNextAction,
    0
  );
  const appointment = appointmentRows[0] ?? {};
  const connections = asNumber(appointment.connections);
  const appointmentsSet = asNumber(appointment.appointmentsSet);

  const summary = {
    activeIsas: scorecard.length,
    recentContacts,
    recentAssigned,
    recentUnassigned,
    assignmentCoverageRate: percentage(recentAssigned, recentContacts),
    activeBook: scorecard.reduce((sum, row) => sum + row.activeBook, 0),
    staleSevenDays: scorecard.reduce((sum, row) => sum + row.staleSevenDays, 0),
    untouched: scorecard.reduce((sum, row) => sum + row.untouched, 0),
    openFollowUps: scorecard.reduce((sum, row) => sum + row.openTasks, 0),
    overdueFollowUps: scorecard.reduce((sum, row) => sum + row.overdueTasks, 0),
    completedSessions: scorecard.reduce(
      (sum, row) => sum + row.completedSessions,
      0
    ),
    stuckSessions: totalStuckSessions,
    callAttempts: totalCallAttempts,
    talkMinutes:
      Math.round(
        scorecard.reduce((sum, row) => sum + row.talkMinutes, 0) * 10
      ) / 10,
    callMatchRate: percentage(totalMatchedCalls, totalCallAttempts),
  };

  const mapContactQueue = (row: Row) => ({
    contactId: asNumber(row.contactId),
    contactName: asString(row.contactName, "Unknown contact"),
    email: row.email ? asString(row.email) : null,
    phone: row.phone ? asString(row.phone) : null,
    isaStatus: row.isaStatus ? asString(row.isaStatus) : null,
    isaId: asNullableNumber(row.isaId),
    isaName: row.isaName ? asString(row.isaName) : null,
    sourceName: asString(row.sourceName, "Unclassified"),
    createdAt: asDateTime(row.createdAt),
    lastTouchAt: asDateTime(row.lastTouchAt),
    ageHours: asNumber(row.ageHours),
  });

  const callMatchRate = summary.callMatchRate;
  const unassignedRate = percentage(recentUnassigned, recentContacts);
  const missingStatus = asNumber(intake.missingIsaStatus);
  const missingStatusRate = percentage(missingStatus, recentContacts);
  const missingPhone = asNumber(intake.missingPhone);
  const missingPhoneRate = percentage(missingPhone, recentContacts);
  const appointmentCaptureRate = percentage(appointmentsSet, connections);

  const dataHealth = [
    {
      key: "aircall_match_rate",
      label: "Aircall contact match rate",
      value: totalMatchedCalls,
      denominator: totalCallAttempts,
      rate: callMatchRate,
      status: classifyLowerIsWorse(callMatchRate, 90, 75),
      confidence: "trusted" as const,
      description:
        "Matched calls divided by all Aircall records attributed to active ISAs in the selected period.",
    },
    {
      key: "recent_unassigned",
      label: "Recent unassigned share",
      value: recentUnassigned,
      denominator: recentContacts,
      rate: unassignedRate,
      status: classifyHigherIsWorse(unassignedRate, 10, 25),
      confidence: "provisional" as const,
      description:
        "Recent contacts without an ISA owner. SavvyOS does not yet store whether each contact is ISA-eligible.",
    },
    {
      key: "missing_isa_status",
      label: "Recent contacts missing ISA status",
      value: missingStatus,
      denominator: recentContacts,
      rate: missingStatusRate,
      status: classifyHigherIsWorse(missingStatusRate, 10, 25),
      confidence: "trusted" as const,
      description:
        "Contacts created in the selected period with no current ISA pipeline status.",
    },
    {
      key: "stuck_sessions",
      label: "Stuck Market Match sessions",
      value: totalStuckSessions,
      denominator: scorecard.reduce((sum, row) => sum + row.activeSessions, 0),
      rate: percentage(
        totalStuckSessions,
        scorecard.reduce((sum, row) => sum + row.activeSessions, 0)
      ),
      status:
        totalStuckSessions > 0 ? ("critical" as const) : ("healthy" as const),
      confidence: "trusted" as const,
      description: `${totalMissingNextAction} active sessions are also missing a next-action recommendation.`,
    },
    {
      key: "appointment_capture",
      label: "Appointment capture",
      value: appointmentsSet,
      denominator: connections,
      rate: appointmentCaptureRate,
      status: classifyLowerIsWorse(appointmentCaptureRate, 5, 1),
      confidence: "provisional" as const,
      description:
        "Connections marked appointment-set in the selected period. This measures instrumentation coverage, not ISA conversion.",
    },
    {
      key: "missing_phone",
      label: "Recent contacts missing phone",
      value: missingPhone,
      denominator: recentContacts,
      rate: missingPhoneRate,
      status: classifyHigherIsWorse(missingPhoneRate, 5, 15),
      confidence: "trusted" as const,
      description:
        "Contacts created in the selected period without a primary phone number.",
    },
  ];

  const normalizeTrend = (rows: Row[]) =>
    rows
      .map(row => ({
        weekStart: asDay(row.weekStart),
        value: asNumber(row.value),
      }))
      .filter(row => row.weekStart);

  return {
    generatedAt: new Date(),
    range,
    scope: {
      selectedIsaIds: ids,
      leadSourceId: sourceId ?? null,
      summaryIsTeamwide: true,
      note: [
        ids.length
          ? "Team intake and unassigned metrics remain teamwide; roster scorecard, ISA queues, tasks, sessions, and calls reflect the selected ISAs."
          : "All active ISAs are included.",
        sourceId
          ? "Aircall metrics remain all-source because unmatched calls cannot be attributed to a lead source."
          : "",
      ]
        .filter(Boolean)
        .join(" "),
    },
    filters: {
      isas: rosterRows.map(row => ({
        id: asNumber(row.id),
        name: asString(row.name, "Unknown ISA"),
        title: row.title ? asString(row.title) : null,
        reportsToId: asNullableNumber(row.reportsToId),
        managerName: row.managerName ? asString(row.managerName) : null,
        lastSignedIn: asDateTime(row.lastSignedIn),
      })),
      leadSources: leadSourceRows.map(row => ({
        id: asNumber(row.id),
        name: asString(row.name, "Unknown source"),
        parentName: row.parentName ? asString(row.parentName) : null,
      })),
    },
    summary,
    attention: {
      recentUnassigned: unassignedQueueRows.map(mapContactQueue),
      untouchedAssigned: untouchedQueueRows.map(mapContactQueue),
      staleLeads: staleQueueRows.map(mapContactQueue),
      overdueTasks: overdueTaskQueueRows.map(row => ({
        taskId: asNumber(row.taskId),
        title: asString(row.title, "Untitled task"),
        priority: asString(row.priority, "medium"),
        status: asString(row.status, "pending"),
        dueDate: asDateTime(row.dueDate),
        isaId: asNumber(row.isaId),
        isaName: asString(row.isaName, "Unknown ISA"),
        contactId: asNullableNumber(row.contactId),
        contactName: row.contactName ? asString(row.contactName) : null,
        ageHours: asNumber(row.ageHours),
      })),
      stuckSessions: stuckSessionQueueRows.map(row => ({
        sessionId: asNumber(row.sessionId),
        contactId: asNumber(row.contactId),
        contactName: asString(row.contactName, "Unknown contact"),
        isaId: asNumber(row.isaId),
        isaName: asString(row.isaName, "Unknown ISA"),
        status: asString(row.status, "active"),
        startedAt: asDateTime(row.startedAt),
        nextActionRecommendation: row.nextActionRecommendation
          ? asString(row.nextActionRecommendation)
          : null,
        confidenceScore: asNullableNumber(row.overallConfidenceScore),
        ageHours: asNumber(row.ageHours),
      })),
    },
    scorecard,
    sourceMix: sourceMixRows.map(row => ({
      sourceId: asNullableNumber(row.sourceId),
      sourceName: asString(row.sourceName, "Unclassified"),
      parentName: row.parentName ? asString(row.parentName) : null,
      contacts: asNumber(row.contacts),
      assigned: asNumber(row.assigned),
      activeClients: asNumber(row.activeClients),
      underContract: asNumber(row.underContract),
      closed: asNumber(row.closed),
    })),
    trend: mergeWeeklyTrend(range.dateFrom, range.dateTo, [
      normalizeTrend(assignedTrendRows),
      normalizeTrend(sessionTrendRows),
      normalizeTrend(callTrendRows),
      normalizeTrend(taskTrendRows),
    ]),
    dataHealth,
    definitions: metricDefinitions,
  };
}

export const ISM_ACTIVE_STATUSES = ACTIVE_ISA_STATUSES;
