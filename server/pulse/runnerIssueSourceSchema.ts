import mysql from "mysql2/promise";

/**
 * Keeps the Pulse Meeting Runner source-to-Issue link available before a new
 * Railway instance serves the flagging controls. The committed migration is
 * the permanent record; this guard is idempotent during production startup.
 */
let readiness: Promise<void> | null = null;

async function tableExists(connection: mysql.Connection, tableName: string) {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) AS count
       FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?`,
    [tableName]
  );
  return Number(rows[0]?.count ?? 0) > 0;
}

async function applyRunnerIssueSourceSchema() {
  if (process.env.NODE_ENV !== "production") return;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return;

  const connection = await mysql.createConnection(databaseUrl);
  try {
    if (!(await tableExists(connection, "pulse_runner_issue_sources"))) {
      await connection.query(
        `CREATE TABLE \`pulse_runner_issue_sources\` (
          \`id\` varchar(36) NOT NULL,
          \`issueWorkItemId\` varchar(36) NOT NULL,
          \`meetingId\` varchar(36) NOT NULL,
          \`sessionId\` varchar(36) NOT NULL,
          \`sourceType\` enum('headline','scorecard','rock') NOT NULL,
          \`sourceId\` varchar(64) NOT NULL,
          \`sourceSnapshot\` json NOT NULL,
          \`createdById\` int NOT NULL,
          \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`pulse_runner_issue_sources_session_source_unique\` (\`sessionId\`, \`sourceType\`, \`sourceId\`),
          KEY \`pulse_runner_issue_sources_meeting_idx\` (\`meetingId\`, \`sessionId\`),
          KEY \`pulse_runner_issue_sources_issue_idx\` (\`issueWorkItemId\`),
          CONSTRAINT \`pulse_runner_issue_sources_issue_fk\` FOREIGN KEY (\`issueWorkItemId\`) REFERENCES \`pulse_work_items\` (\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`pulse_runner_issue_sources_meeting_fk\` FOREIGN KEY (\`meetingId\`) REFERENCES \`pulse_meetings\` (\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`pulse_runner_issue_sources_session_fk\` FOREIGN KEY (\`sessionId\`) REFERENCES \`pulse_meeting_sessions\` (\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`pulse_runner_issue_sources_creator_fk\` FOREIGN KEY (\`createdById\`) REFERENCES \`users\` (\`id\`) ON DELETE RESTRICT
        )`
      );
    }
  } finally {
    await connection.end();
  }
}

export function ensurePulseRunnerIssueSourceSchema() {
  readiness ??= applyRunnerIssueSourceSchema();
  return readiness;
}
