import mysql from "mysql2/promise";

/**
 * Keeps the application and its project to-do schema compatible during the
 * first deployment of the status/recurrence feature. The committed SQL file is
 * the permanent migration record; this small, idempotent guard means Railway
 * adds the columns before the new application instance receives traffic.
 */
let readiness: Promise<void> | null = null;

async function schemaColumnExists(connection: mysql.Connection, columnName: string) {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) AS count
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = "pm_tasks"
        AND COLUMN_NAME = ?`,
    [columnName],
  );
  return Number(rows[0]?.count ?? 0) > 0;
}

async function schemaIndexExists(connection: mysql.Connection, indexName: string) {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) AS count
       FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = "pm_tasks"
        AND INDEX_NAME = ?`,
    [indexName],
  );
  return Number(rows[0]?.count ?? 0) > 0;
}

async function applyProjectTodoWorkflowSchema() {
  if (process.env.NODE_ENV !== "production") return;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return;

  const connection = await mysql.createConnection(databaseUrl);
  try {
    const needsStatus = !(await schemaColumnExists(connection, "status"));
    if (needsStatus) {
      await connection.query(
        "ALTER TABLE `pm_tasks` ADD COLUMN `status` varchar(16) NOT NULL DEFAULT 'not_started' AFTER `priority`",
      );
      // Preserve completed history while giving incomplete legacy todos the
      // actionable starting state that Pulse users already recognize.
      await connection.query(
        "UPDATE `pm_tasks` SET `status` = CASE WHEN `completed` = 1 THEN 'completed' ELSE 'not_started' END",
      );
    }

    if (!(await schemaColumnExists(connection, "recurrence"))) {
      await connection.query(
        "ALTER TABLE `pm_tasks` ADD COLUMN `recurrence` varchar(16) NOT NULL DEFAULT 'none' AFTER `dueDate`",
      );
    }

    if (!(await schemaIndexExists(connection, "pm_tasks_project_status_idx"))) {
      await connection.query(
        "ALTER TABLE `pm_tasks` ADD KEY `pm_tasks_project_status_idx` (`projectId`, `status`, `dueDate`)",
      );
    }
  } finally {
    await connection.end();
  }
}

export function ensureProjectTodoWorkflowSchema() {
  readiness ??= applyProjectTodoWorkflowSchema();
  return readiness;
}
