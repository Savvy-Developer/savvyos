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

async function schemaColumnExistsOnTable(
  connection: mysql.Connection,
  tableName: string,
  columnName: string,
) {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) AS count
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?`,
    [tableName, columnName],
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

async function schemaTableExists(connection: mysql.Connection, tableName: string) {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) AS count
       FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?`,
    [tableName],
  );
  return Number(rows[0]?.count ?? 0) > 0;
}

async function applyProjectTodoWorkflowSchema() {
  if (process.env.NODE_ENV !== "production") return;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return;

  const connection = await mysql.createConnection(databaseUrl);
  try {
    if (!(await schemaColumnExists(connection, "startDate"))) {
      await connection.query(
        "ALTER TABLE `pm_tasks` ADD COLUMN `startDate` timestamp NULL AFTER `ownerId`",
      );
    }

    if (!(await schemaTableExists(connection, "pm_task_dependencies"))) {
      await connection.query(
        `CREATE TABLE \`pm_task_dependencies\` (
          \`id\` int NOT NULL AUTO_INCREMENT,
          \`taskId\` int NOT NULL,
          \`predecessorTaskId\` int NOT NULL,
          \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`pm_task_dependencies_task_predecessor_unique\` (\`taskId\`, \`predecessorTaskId\`),
          KEY \`pm_task_dependencies_predecessor_idx\` (\`predecessorTaskId\`, \`taskId\`),
          CONSTRAINT \`pm_task_dependencies_task_fk\` FOREIGN KEY (\`taskId\`) REFERENCES \`pm_tasks\` (\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`pm_task_dependencies_predecessor_fk\` FOREIGN KEY (\`predecessorTaskId\`) REFERENCES \`pm_tasks\` (\`id\`) ON DELETE CASCADE
        )`,
      );
    }

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

    if (!(await schemaColumnExistsOnTable(connection, "pm_todo_sections", "description"))) {
      await connection.query(
        "ALTER TABLE `pm_todo_sections` ADD COLUMN `description` text NULL AFTER `title`",
      );
    }

    if (!(await schemaTableExists(connection, "pm_milestone_dependencies"))) {
      await connection.query(
        `CREATE TABLE \`pm_milestone_dependencies\` (
          \`id\` int NOT NULL AUTO_INCREMENT,
          \`milestoneId\` int NOT NULL,
          \`predecessorMilestoneId\` int NOT NULL,
          \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`pm_milestone_dependencies_unique\` (\`milestoneId\`,\`predecessorMilestoneId\`),
          KEY \`pm_milestone_dependencies_predecessor_idx\` (\`predecessorMilestoneId\`,\`milestoneId\`),
          CONSTRAINT \`pm_milestone_dependencies_milestone_fk\` FOREIGN KEY (\`milestoneId\`) REFERENCES \`pm_todo_sections\` (\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`pm_milestone_dependencies_predecessor_fk\` FOREIGN KEY (\`predecessorMilestoneId\`) REFERENCES \`pm_todo_sections\` (\`id\`) ON DELETE CASCADE
        )`,
      );
    }

    if (!(await schemaTableExists(connection, "pm_task_attachments"))) {
      await connection.query(
        `CREATE TABLE \`pm_task_attachments\` (
          \`id\` int NOT NULL AUTO_INCREMENT,
          \`projectId\` int NOT NULL,
          \`taskId\` int NULL,
          \`fileName\` varchar(500) NOT NULL,
          \`fileKey\` varchar(1024) NOT NULL,
          \`mimeType\` varchar(128) NULL,
          \`fileSize\` bigint NULL,
          \`uploadedById\` int NOT NULL,
          \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`deletedAt\` timestamp NULL,
          PRIMARY KEY (\`id\`),
          KEY \`pm_task_attachments_task_idx\` (\`taskId\`, \`deletedAt\`),
          KEY \`pm_task_attachments_project_stage_idx\` (\`projectId\`, \`taskId\`, \`deletedAt\`),
          KEY \`pm_task_attachments_uploader_idx\` (\`uploadedById\`, \`createdAt\`),
          CONSTRAINT \`pm_task_attachments_project_fk\` FOREIGN KEY (\`projectId\`) REFERENCES \`pm_projects\` (\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`pm_task_attachments_task_fk\` FOREIGN KEY (\`taskId\`) REFERENCES \`pm_tasks\` (\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`pm_task_attachments_uploader_fk\` FOREIGN KEY (\`uploadedById\`) REFERENCES \`users\` (\`id\`)
        )`,
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
