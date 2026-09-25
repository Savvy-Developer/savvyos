import mysql from "mysql2/promise";

/**
 * Adds the optional calculation-description column before the first request
 * that needs it. Existing measurable history is not rewritten.
 */
let readiness: Promise<void> | null = null;

async function columnExists(connection: mysql.Connection, columnName: string) {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) AS count
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = "rr_scorecard_metrics"
        AND COLUMN_NAME = ?`,
    [columnName],
  );
  return Number(rows[0]?.count ?? 0) > 0;
}

async function applyRrMeasurableSchema() {
  if (process.env.NODE_ENV !== "production") return;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return;

  const connection = await mysql.createConnection(databaseUrl);
  try {
    if (!(await columnExists(connection, "calculationDescription"))) {
      await connection.query(
        "ALTER TABLE `rr_scorecard_metrics` ADD COLUMN `calculationDescription` text NULL AFTER `zeroDenominatorLabel`",
      );
    }
  } finally {
    await connection.end();
  }
}

export function ensureRrMeasurableSchema() {
  readiness ??= applyRrMeasurableSchema();
  return readiness;
}
