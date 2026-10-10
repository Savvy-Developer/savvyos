import mysql from "mysql2/promise";

async function columnExists(
  connection: mysql.Connection,
  table: string,
  column: string
) {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) AS count
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?`,
    [table, column]
  );
  return Number(rows[0]?.count ?? 0) > 0;
}

async function indexExists(
  connection: mysql.Connection,
  table: string,
  index: string
) {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) AS count
       FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND INDEX_NAME = ?`,
    [table, index]
  );
  return Number(rows[0]?.count ?? 0) > 0;
}

/**
 * Keeps event deliverable timing additive and ready before any Events Console
 * request selects the relative schedule column. The SQL migration remains the
 * durable schema record; this guard protects a Railway rollout that reaches a
 * new instance before its database migration is run.
 */
async function applyEventDeliverableTimelineSchema() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return;

  const connection = await mysql.createConnection(databaseUrl);
  try {
    if (
      !(await columnExists(
        connection,
        "event_sponsor_deliverables",
        "dueOffsetDays"
      ))
    ) {
      await connection.query(
        "ALTER TABLE `event_sponsor_deliverables` ADD COLUMN `dueOffsetDays` int NULL AFTER `dueDate`"
      );
    }
    if (
      !(await indexExists(
        connection,
        "event_sponsor_deliverables",
        "event_sponsor_deliverables_due_status_idx"
      ))
    ) {
      await connection.query(
        "ALTER TABLE `event_sponsor_deliverables` ADD KEY `event_sponsor_deliverables_due_status_idx` (`dueDate`, `status`)"
      );
    }
  } finally {
    await connection.end();
  }
}

let readiness: Promise<void> | null = null;

export function ensureEventDeliverableTimelineSchema() {
  readiness ??= applyEventDeliverableTimelineSchema();
  return readiness;
}
