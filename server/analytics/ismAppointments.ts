import { sql, type SQL } from "drizzle-orm";
import { getDb } from "../db";

type Row = Record<string, unknown>;

export type IsmAppointmentEventType = "all" | "appointments" | "connections";

export type IsmAppointmentActivityOptions = {
  page?: number;
  limit?: number;
  isaIds?: number[];
  eventType?: IsmAppointmentEventType;
  dateFrom?: Date;
  dateTo?: Date;
  search?: string;
};

function rowsFromResult<T extends Row = Row>(result: unknown): T[] {
  if (Array.isArray(result) && Array.isArray(result[0])) {
    return result[0] as T[];
  }
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

function idScope(column: SQL, ids: number[]): SQL | undefined {
  return ids.length
    ? sql`${column} IN (${sql.join(
        ids.map(id => sql`${id}`),
        sql`, `
      )})`
    : undefined;
}

function where(clauses: Array<SQL | undefined>): SQL {
  const usable = clauses.filter((clause): clause is SQL => Boolean(clause));
  return usable.length ? sql`WHERE ${sql.join(usable, sql` AND `)}` : sql``;
}

export function normaliseIsmAppointmentSearch(
  value: string | undefined
): string | undefined {
  const cleaned = value?.replace(/\s+/g, " ").trim();
  return cleaned || undefined;
}

/**
 * Returns the audit-backed activity stream used by the ISM "ISA Appts" tab.
 * Appointment rows prefer the immutable appointment-setter attribution. ISA-created
 * connections without that attribution retain the ISA who recorded the connection.
 */
export async function getIsmAppointmentActivity(
  options: IsmAppointmentActivityOptions = {}
) {
  const db = await getDb();
  if (!db) {
    return {
      rows: [],
      total: 0,
      summary: { appointments: 0, connections: 0 },
      isas: [],
    };
  }

  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(Math.max(1, options.limit ?? 50), 100);
  const offset = (page - 1) * limit;
  const isaIds = Array.from(
    new Set((options.isaIds ?? []).filter(id => Number.isInteger(id) && id > 0))
  );
  const eventType = options.eventType ?? "all";
  const search = normaliseIsmAppointmentSearch(options.search);

  // The first source represents appointments with canonical ISA ownership. The
  // second source records ISA-created connections that do not already have a
  // canonical appointment setter, preventing an appointment from appearing twice.
  const eventSource = sql`(
    SELECT
      ac.id AS connectionId,
      appointment_isa.id AS isaId,
      appointment_isa.name AS isaName,
      appointment_isa.email AS isaEmail,
      appointment_isa.title AS isaTitle,
      agent.id AS agentId,
      agent.name AS agentName,
      agent.email AS agentEmail,
      c.id AS contactId,
      CONCAT_WS(' ', c.firstName, c.lastName) AS contactName,
      c.email AS contactEmail,
      c.phone AS contactPhone,
      'appointment' AS eventType,
      COALESCE(ac.appointmentSetAt, ac.createdAt) AS eventAt,
      ac.pipelineStatus,
      ac.followUpDate,
      ac.agentNotes
    FROM \`agent_connections\` ac
    INNER JOIN \`users\` appointment_isa
      ON appointment_isa.id = ac.appointmentSetByUserId
      AND appointment_isa.role = 'isa'
    INNER JOIN \`contacts\` c ON c.id = ac.contactId
    LEFT JOIN \`users\` agent ON agent.id = ac.agentId
    WHERE ac.appointmentSet = 1

    UNION ALL

    SELECT DISTINCT
      ac.id AS connectionId,
      actor_isa.id AS isaId,
      actor_isa.name AS isaName,
      actor_isa.email AS isaEmail,
      actor_isa.title AS isaTitle,
      agent.id AS agentId,
      agent.name AS agentName,
      agent.email AS agentEmail,
      c.id AS contactId,
      CONCAT_WS(' ', c.firstName, c.lastName) AS contactName,
      c.email AS contactEmail,
      c.phone AS contactPhone,
      CASE WHEN ac.appointmentSet = 1 THEN 'appointment' ELSE 'connection' END AS eventType,
      CASE
        WHEN ac.appointmentSet = 1 THEN COALESCE(ac.appointmentSetAt, activity.createdAt)
        ELSE activity.createdAt
      END AS eventAt,
      ac.pipelineStatus,
      ac.followUpDate,
      ac.agentNotes
    FROM \`activity_log\` activity
    INNER JOIN \`agent_connections\` ac
      ON ac.id = activity.entityId
    INNER JOIN \`users\` actor_isa
      ON actor_isa.id = activity.userId
      AND actor_isa.role = 'isa'
    LEFT JOIN \`users\` appointment_isa
      ON appointment_isa.id = ac.appointmentSetByUserId
      AND appointment_isa.role = 'isa'
    INNER JOIN \`contacts\` c ON c.id = ac.contactId
    LEFT JOIN \`users\` agent ON agent.id = ac.agentId
    WHERE activity.entityType = 'agent_connection'
      AND activity.action = 'agent_connection_created'
      AND appointment_isa.id IS NULL
  ) AS isa_events`;

  const escapedSearch = search
    ? `%${search.replace(/[\\%_]/g, "\\$&")}%`
    : undefined;
  const scope = where([
    idScope(sql`isa_events.isaId`, isaIds),
    eventType === "appointments"
      ? sql`isa_events.eventType = 'appointment'`
      : eventType === "connections"
        ? sql`isa_events.eventType = 'connection'`
        : undefined,
    options.dateFrom
      ? sql`isa_events.eventAt >= ${options.dateFrom}`
      : undefined,
    options.dateTo ? sql`isa_events.eventAt <= ${options.dateTo}` : undefined,
    escapedSearch
      ? sql`(
          COALESCE(isa_events.isaName, '') LIKE ${escapedSearch} ESCAPE '\\\\'
          OR COALESCE(isa_events.agentName, '') LIKE ${escapedSearch} ESCAPE '\\\\'
          OR COALESCE(isa_events.contactName, '') LIKE ${escapedSearch} ESCAPE '\\\\'
          OR COALESCE(isa_events.contactEmail, '') LIKE ${escapedSearch} ESCAPE '\\\\'
          OR COALESCE(isa_events.contactPhone, '') LIKE ${escapedSearch} ESCAPE '\\\\'
          OR CAST(isa_events.connectionId AS CHAR) = ${search}
        )`
      : undefined,
  ]);

  const [rows, countRows, summaryRows, isas] = await Promise.all([
    runRows<Row>(sql`
      SELECT isa_events.*
      FROM ${eventSource}
      ${scope}
      ORDER BY isa_events.eventAt DESC, isa_events.connectionId DESC
      LIMIT ${limit} OFFSET ${offset}
    `),
    runRows<Row>(sql`
      SELECT COUNT(*) AS total
      FROM ${eventSource}
      ${scope}
    `),
    runRows<Row>(sql`
      SELECT
        SUM(CASE WHEN isa_events.eventType = 'appointment' THEN 1 ELSE 0 END) AS appointments,
        SUM(CASE WHEN isa_events.eventType = 'connection' THEN 1 ELSE 0 END) AS connections
      FROM ${eventSource}
      ${scope}
    `),
    db
      .execute(
        sql`
      SELECT id, name, email, title, isActive
      FROM \`users\`
      WHERE role = 'isa'
      ORDER BY COALESCE(name, email, '') ASC
    `
      )
      .then(rowsFromResult<Row>),
  ]);

  const summary = summaryRows[0] ?? {};
  return {
    rows: rows.map(row => ({
      connectionId: asNumber(row.connectionId),
      isa: {
        id: asNumber(row.isaId),
        name: asString(row.isaName, asString(row.isaEmail, "Unnamed ISA")),
        email: row.isaEmail ? asString(row.isaEmail) : null,
        title: row.isaTitle ? asString(row.isaTitle) : null,
      },
      agent: {
        id: asNullableNumber(row.agentId),
        name: asString(
          row.agentName,
          asString(row.agentEmail, "Unknown agent")
        ),
        email: row.agentEmail ? asString(row.agentEmail) : null,
      },
      contact: {
        id: asNullableNumber(row.contactId),
        name: asString(row.contactName, "Unknown contact"),
        email: row.contactEmail ? asString(row.contactEmail) : null,
        phone: row.contactPhone ? asString(row.contactPhone) : null,
      },
      eventType: row.eventType === "appointment" ? "appointment" : "connection",
      eventAt: asDateTime(row.eventAt),
      pipelineStatus: row.pipelineStatus ? asString(row.pipelineStatus) : null,
      followUpDate: asDateTime(row.followUpDate),
      agentNotes: row.agentNotes ? asString(row.agentNotes) : null,
    })),
    total: asNumber(countRows[0]?.total),
    summary: {
      appointments: asNumber(summary.appointments),
      connections: asNumber(summary.connections),
    },
    isas: isas.map(row => ({
      id: asNumber(row.id),
      name: asString(row.name, asString(row.email, "Unnamed ISA")),
      email: row.email ? asString(row.email) : null,
      title: row.title ? asString(row.title) : null,
      isActive: Boolean(row.isActive),
    })),
  };
}
