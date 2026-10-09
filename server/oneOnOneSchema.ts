import mysql from "mysql2/promise";

/**
 * Keeps HR 1:1 Meetings deployable when the committed additive migration has
 * not yet been applied to production. It runs before Railway accepts traffic
 * and creates only the feature's own tables, indexes, and permission column.
 */
let readiness: Promise<void> | null = null;

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

async function columnDataType(
  connection: mysql.Connection,
  tableName: string,
  columnName: string
) {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT DATA_TYPE AS dataType
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
      LIMIT 1`,
    [tableName, columnName]
  );
  return typeof rows[0]?.dataType === "string" ? rows[0].dataType.toLowerCase() : null;
}

async function ensureColumn(
  connection: mysql.Connection,
  tableName: string,
  columnName: string,
  definition: string
) {
  if (!(await columnExists(connection, tableName, columnName))) {
    await connection.query(`ALTER TABLE \`${tableName}\` ADD COLUMN ${definition}`);
  }
}

async function indexExists(
  connection: mysql.Connection,
  tableName: string,
  indexName: string
) {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) AS count
       FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND INDEX_NAME = ?`,
    [tableName, indexName]
  );
  return Number(rows[0]?.count ?? 0) > 0;
}

async function ensureIndex(
  connection: mysql.Connection,
  tableName: string,
  indexName: string,
  createSql: string
) {
  if (!(await indexExists(connection, tableName, indexName))) {
    await connection.query(createSql);
  }
}

async function applyOneOnOneSchema() {
  if (process.env.NODE_ENV !== "production") return;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return;

  const connection = await mysql.createConnection(databaseUrl);
  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`one_on_one_relationships\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`employeeId\` int NOT NULL,
        \`leaderId\` int NOT NULL,
        \`frequencyDays\` int NOT NULL DEFAULT 30,
        \`lastCompletedAt\` timestamp NULL,
        \`nextScheduledAt\` timestamp NULL,
        \`isActive\` boolean NOT NULL DEFAULT true,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`one_on_one_relationships_employee_fk\`
          FOREIGN KEY (\`employeeId\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`one_on_one_relationships_leader_fk\`
          FOREIGN KEY (\`leaderId\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE,
        UNIQUE KEY \`one_on_one_relationship_employee_leader_unique\` (\`employeeId\`, \`leaderId\`)
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`one_on_one_meetings\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`relationshipId\` int NOT NULL,
        \`employeeId\` int NOT NULL,
        \`leaderId\` int NOT NULL,
        \`scheduledAt\` timestamp NULL,
        \`heldAt\` timestamp NULL,
        \`startedAt\` timestamp NULL,
        \`durationMinutes\` int NOT NULL DEFAULT 45,
        \`status\` enum('Scheduled','In Progress','Review','Completed','Canceled') NOT NULL DEFAULT 'Scheduled',
        \`calendarEventId\` varchar(512) NULL,
        \`calendarEventUrl\` text NULL,
        \`calendarSyncStatus\` enum('Not Requested','Synced','Needs Attention') NOT NULL DEFAULT 'Not Requested',
        \`calendarSyncError\` text NULL,
        \`zoomMeetingId\` varchar(64) NULL,
        \`zoomMeetingUuid\` varchar(255) NULL,
        \`zoomJoinUrl\` text NULL,
        \`zoomStartUrl\` text NULL,
        \`zoomSyncStatus\` enum('Not Requested','Synced','Needs Attention') NOT NULL DEFAULT 'Not Requested',
        \`zoomSyncError\` text NULL,
        \`zoomTranscriptStatus\` enum('Not Requested','Pending','Imported','Needs Attention') NOT NULL DEFAULT 'Not Requested',
        \`zoomTranscriptError\` text NULL,
        \`zoomTranscriptFileId\` varchar(128) NULL,
        \`zoomTranscriptImportedAt\` timestamp NULL,
        \`transcript\` mediumtext NULL,
        \`transcriptSource\` enum('Manual','Zoom') NULL,
        \`transcriptSavedAt\` timestamp NULL,
        \`aiProcessingStatus\` enum('None','Processing','Ready','Failed') NOT NULL DEFAULT 'None',
        \`aiDraftJson\` text NULL,
        \`aiQuestionSuggestions\` text NULL,
        \`meetingSummary\` text NULL,
        \`employeeFeedback\` text NULL,
        \`supportRequests\` text NULL,
        \`processIdeas\` text NULL,
        \`professionalDevelopment\` text NULL,
        \`followUps\` text NULL,
        \`leadershipAttention\` text NULL,
        \`finalizedById\` int NULL,
        \`finalizedAt\` timestamp NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`one_on_one_meetings_relationship_fk\`
          FOREIGN KEY (\`relationshipId\`) REFERENCES \`one_on_one_relationships\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`one_on_one_meetings_employee_fk\`
          FOREIGN KEY (\`employeeId\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`one_on_one_meetings_leader_fk\`
          FOREIGN KEY (\`leaderId\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`one_on_one_meetings_finalized_by_fk\`
          FOREIGN KEY (\`finalizedById\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL
      )
    `);

    await ensureColumn(connection, "one_on_one_meetings", "zoomMeetingId", "`zoomMeetingId` varchar(64) NULL AFTER `calendarSyncError`");
    await ensureColumn(connection, "one_on_one_meetings", "zoomMeetingUuid", "`zoomMeetingUuid` varchar(255) NULL AFTER `zoomMeetingId`");
    await ensureColumn(connection, "one_on_one_meetings", "zoomJoinUrl", "`zoomJoinUrl` text NULL AFTER `zoomMeetingUuid`");
    await ensureColumn(connection, "one_on_one_meetings", "zoomStartUrl", "`zoomStartUrl` text NULL AFTER `zoomJoinUrl`");
    await ensureColumn(connection, "one_on_one_meetings", "zoomSyncStatus", "`zoomSyncStatus` enum('Not Requested','Synced','Needs Attention') NOT NULL DEFAULT 'Not Requested' AFTER `zoomStartUrl`");
    await ensureColumn(connection, "one_on_one_meetings", "zoomSyncError", "`zoomSyncError` text NULL AFTER `zoomSyncStatus`");
    await ensureColumn(connection, "one_on_one_meetings", "zoomTranscriptStatus", "`zoomTranscriptStatus` enum('Not Requested','Pending','Imported','Needs Attention') NOT NULL DEFAULT 'Not Requested' AFTER `zoomSyncError`");
    await ensureColumn(connection, "one_on_one_meetings", "zoomTranscriptError", "`zoomTranscriptError` text NULL AFTER `zoomTranscriptStatus`");
    await ensureColumn(connection, "one_on_one_meetings", "zoomTranscriptFileId", "`zoomTranscriptFileId` varchar(128) NULL AFTER `zoomTranscriptError`");
    await ensureColumn(connection, "one_on_one_meetings", "zoomTranscriptImportedAt", "`zoomTranscriptImportedAt` timestamp NULL AFTER `zoomTranscriptFileId`");
    await ensureColumn(connection, "one_on_one_meetings", "transcriptSource", "`transcriptSource` enum('Manual','Zoom') NULL AFTER `transcript`");
    if ((await columnDataType(connection, "one_on_one_meetings", "transcript")) !== "mediumtext") {
      await connection.query("ALTER TABLE `one_on_one_meetings` MODIFY COLUMN `transcript` mediumtext NULL");
    }

    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`one_on_one_commitments\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`meetingId\` int NOT NULL,
        \`employeeId\` int NOT NULL,
        \`description\` text NOT NULL,
        \`ownerId\` int NULL,
        \`dueDate\` timestamp NULL,
        \`status\` enum('Open','In Progress','Completed','Dismissed') NOT NULL DEFAULT 'Open',
        \`isAiSuggested\` boolean NOT NULL DEFAULT false,
        \`createdById\` int NULL,
        \`completedAt\` timestamp NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`one_on_one_commitments_meeting_fk\`
          FOREIGN KEY (\`meetingId\`) REFERENCES \`one_on_one_meetings\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`one_on_one_commitments_employee_fk\`
          FOREIGN KEY (\`employeeId\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`one_on_one_commitments_owner_fk\`
          FOREIGN KEY (\`ownerId\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL,
        CONSTRAINT \`one_on_one_commitments_created_by_fk\`
          FOREIGN KEY (\`createdById\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`one_on_one_issues\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`meetingId\` int NOT NULL,
        \`employeeId\` int NOT NULL,
        \`title\` varchar(500) NOT NULL,
        \`details\` text NULL,
        \`requiresHrAttention\` boolean NOT NULL DEFAULT false,
        \`status\` enum('Open','Resolved','Dismissed') NOT NULL DEFAULT 'Open',
        \`createdById\` int NULL,
        \`resolvedAt\` timestamp NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`one_on_one_issues_meeting_fk\`
          FOREIGN KEY (\`meetingId\`) REFERENCES \`one_on_one_meetings\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`one_on_one_issues_employee_fk\`
          FOREIGN KEY (\`employeeId\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`one_on_one_issues_created_by_fk\`
          FOREIGN KEY (\`createdById\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL
      )
    `);

    await ensureIndex(
      connection,
      "one_on_one_relationships",
      "one_on_one_relationship_leader_next_idx",
      "CREATE INDEX `one_on_one_relationship_leader_next_idx` ON `one_on_one_relationships` (`leaderId`, `nextScheduledAt`)"
    );
    await ensureIndex(
      connection,
      "one_on_one_relationships",
      "one_on_one_relationship_employee_next_idx",
      "CREATE INDEX `one_on_one_relationship_employee_next_idx` ON `one_on_one_relationships` (`employeeId`, `nextScheduledAt`)"
    );
    await ensureIndex(
      connection,
      "one_on_one_meetings",
      "one_on_one_meeting_relationship_status_idx",
      "CREATE INDEX `one_on_one_meeting_relationship_status_idx` ON `one_on_one_meetings` (`relationshipId`, `status`, `scheduledAt`)"
    );
    await ensureIndex(
      connection,
      "one_on_one_meetings",
      "one_on_one_meeting_employee_status_idx",
      "CREATE INDEX `one_on_one_meeting_employee_status_idx` ON `one_on_one_meetings` (`employeeId`, `status`, `heldAt`)"
    );
    await ensureIndex(
      connection,
      "one_on_one_meetings",
      "one_on_one_meeting_zoom_id_idx",
      "CREATE INDEX `one_on_one_meeting_zoom_id_idx` ON `one_on_one_meetings` (`zoomMeetingId`)"
    );
    await ensureIndex(
      connection,
      "one_on_one_commitments",
      "one_on_one_commitment_employee_status_idx",
      "CREATE INDEX `one_on_one_commitment_employee_status_idx` ON `one_on_one_commitments` (`employeeId`, `status`, `dueDate`)"
    );
    await ensureIndex(
      connection,
      "one_on_one_commitments",
      "one_on_one_commitment_meeting_idx",
      "CREATE INDEX `one_on_one_commitment_meeting_idx` ON `one_on_one_commitments` (`meetingId`)"
    );
    await ensureIndex(
      connection,
      "one_on_one_issues",
      "one_on_one_issue_employee_status_idx",
      "CREATE INDEX `one_on_one_issue_employee_status_idx` ON `one_on_one_issues` (`employeeId`, `status`, `createdAt`)"
    );
    await ensureIndex(
      connection,
      "one_on_one_issues",
      "one_on_one_issue_meeting_idx",
      "CREATE INDEX `one_on_one_issue_meeting_idx` ON `one_on_one_issues` (`meetingId`)"
    );

    if (!(await columnExists(connection, "admin_permissions", "canViewOneOnOneMeetings"))) {
      await connection.query(
        "ALTER TABLE `admin_permissions` ADD COLUMN `canViewOneOnOneMeetings` boolean NOT NULL DEFAULT true AFTER `canViewAgentRenewals`"
      );
    }
  } finally {
    await connection.end();
  }
}

export function ensureOneOnOneSchema() {
  readiness ??= applyOneOnOneSchema();
  return readiness;
}
