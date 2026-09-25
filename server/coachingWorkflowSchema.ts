import mysql from "mysql2/promise";

/**
 * Keeps the Coaching Hub deployable when production has not yet received the
 * additive workflow migration. The SQL migration remains the system record;
 * this guard runs before Railway receives traffic and is safe to repeat.
 */
let readiness: Promise<void> | null = null;

type ColumnDefinition = {
  name: string;
  definition: string;
};

const sessionColumns: ColumnDefinition[] = [
  {
    name: "schedulingSource",
    definition: "ENUM('SavvyOS','External') NOT NULL DEFAULT 'SavvyOS'",
  },
  { name: "zoomMeetingId", definition: "varchar(64) NULL" },
  { name: "zoomHostUserId", definition: "varchar(255) NULL" },
  {
    name: "calendarProvider",
    definition: "ENUM('google','none') NOT NULL DEFAULT 'none'",
  },
  { name: "calendarEventId", definition: "varchar(512) NULL" },
  { name: "calendarEventUrl", definition: "text NULL" },
  {
    name: "calendarSyncStatus",
    definition:
      "ENUM('Not Requested','Synced','Needs Attention','External') NOT NULL DEFAULT 'Not Requested'",
  },
  { name: "calendarSyncError", definition: "text NULL" },
  { name: "agentRecapSentAt", definition: "timestamp NULL" },
];

async function columnExists(
  connection: mysql.Connection,
  tableName: string,
  columnName: string
) {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) AS count
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?`,
    [tableName, columnName]
  );
  return Number(rows[0]?.count ?? 0) > 0;
}

async function columnIsNullable(
  connection: mysql.Connection,
  tableName: string,
  columnName: string
) {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT IS_NULLABLE AS isNullable
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?`,
    [tableName, columnName]
  );
  return rows[0]?.isNullable === "YES";
}

async function applyCoachingWorkflowSchema() {
  if (process.env.NODE_ENV !== "production") return;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return;

  const connection = await mysql.createConnection(databaseUrl);
  try {
    for (const column of sessionColumns) {
      if (await columnExists(connection, "coaching_sessions", column.name))
        continue;
      await connection.query(
        `ALTER TABLE \`coaching_sessions\` ADD COLUMN \`${column.name}\` ${column.definition}`
      );
    }

    if (
      !(await columnExists(
        connection,
        "coaching_commitments",
        "agreementEvidence"
      ))
    ) {
      await connection.query(
        "ALTER TABLE `coaching_commitments` ADD COLUMN `agreementEvidence` text NULL"
      );
    }

    if (
      !(await columnIsNullable(
        connection,
        "operations_escalations",
        "sessionId"
      ))
    ) {
      await connection.query(
        "ALTER TABLE `operations_escalations` MODIFY COLUMN `sessionId` int NULL"
      );
    }
  } finally {
    await connection.end();
  }
}

export function ensureCoachingWorkflowSchema() {
  readiness ??= applyCoachingWorkflowSchema();
  return readiness;
}
