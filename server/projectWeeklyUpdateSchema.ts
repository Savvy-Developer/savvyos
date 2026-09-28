import mysql from "mysql2/promise";

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

async function applyProjectWeeklyUpdateSchema() {
  if (process.env.NODE_ENV !== "production") return;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return;

  const connection = await mysql.createConnection(databaseUrl);
  try {
    if (
      !(await columnExists(connection, "pm_projects", "weeklyUpdatesEnabled"))
    ) {
      await connection.query(
        "ALTER TABLE `pm_projects` ADD COLUMN `weeklyUpdatesEnabled` tinyint(1) NOT NULL DEFAULT 0 AFTER `rockStatus`"
      );
    }
    if (
      !(await columnExists(connection, "pm_projects", "weeklyReportingOwnerId"))
    ) {
      await connection.query(
        "ALTER TABLE `pm_projects` ADD COLUMN `weeklyReportingOwnerId` int NULL AFTER `weeklyUpdatesEnabled`"
      );
    }

    const updateColumns: Array<[string, string]> = [
      ["weekOf", "date NULL AFTER `projectId`"],
      [
        "reportStatus",
        "varchar(16) NOT NULL DEFAULT 'submitted' AFTER `updateStatus`",
      ],
      ["currentState", "text NULL AFTER `progressPct`"],
      ["timelineOnTrack", "tinyint(1) NULL AFTER `currentState`"],
      ["revisedTargetDate", "timestamp NULL AFTER `timelineOnTrack`"],
      ["topObstacle", "text NULL AFTER `nextSteps`"],
      ["proposedFix", "text NULL AFTER `topObstacle`"],
      ["nextWeekPriority", "text NULL AFTER `proposedFix`"],
      ["askNeededFromId", "int NULL AFTER `nextWeekPriority`"],
      ["askNeededBy", "timestamp NULL AFTER `askNeededFromId`"],
      ["askSummary", "text NULL AFTER `askNeededBy`"],
      ["askProposedSolution", "text NULL AFTER `askSummary`"],
      [
        "snapshotTaskTotal",
        "int NOT NULL DEFAULT 0 AFTER `askProposedSolution`",
      ],
      [
        "snapshotTaskCompleted",
        "int NOT NULL DEFAULT 0 AFTER `snapshotTaskTotal`",
      ],
      [
        "snapshotMilestoneTotal",
        "int NOT NULL DEFAULT 0 AFTER `snapshotTaskCompleted`",
      ],
      [
        "snapshotMilestoneCompleted",
        "int NOT NULL DEFAULT 0 AFTER `snapshotMilestoneTotal`",
      ],
      [
        "snapshotOverdueTaskCount",
        "int NOT NULL DEFAULT 0 AFTER `snapshotMilestoneCompleted`",
      ],
      ["snapshotTargetDate", "timestamp NULL AFTER `snapshotOverdueTaskCount`"],
      [
        "snapshotNextMilestoneTitle",
        "varchar(128) NULL AFTER `snapshotTargetDate`",
      ],
      [
        "snapshotNextMilestoneDueDate",
        "timestamp NULL AFTER `snapshotNextMilestoneTitle`",
      ],
      ["reviewedAt", "timestamp NULL AFTER `snapshotNextMilestoneDueDate`"],
      ["reviewedById", "int NULL AFTER `reviewedAt`"],
      [
        "updatedAt",
        "timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER `createdAt`",
      ],
    ];
    for (const [name, definition] of updateColumns) {
      if (!(await columnExists(connection, "pm_weekly_updates", name))) {
        await connection.query(
          `ALTER TABLE \`pm_weekly_updates\` ADD COLUMN \`${name}\` ${definition}`
        );
      }
    }

    if (
      !(await indexExists(
        connection,
        "pm_weekly_updates",
        "pm_weekly_updates_project_week_unique"
      ))
    ) {
      await connection.query(
        "ALTER TABLE `pm_weekly_updates` ADD UNIQUE KEY `pm_weekly_updates_project_week_unique` (`projectId`, `weekOf`)"
      );
    }
    if (
      !(await indexExists(
        connection,
        "pm_weekly_updates",
        "pm_weekly_updates_week_status_idx"
      ))
    ) {
      await connection.query(
        "ALTER TABLE `pm_weekly_updates` ADD KEY `pm_weekly_updates_week_status_idx` (`weekOf`, `reportStatus`)"
      );
    }
  } finally {
    await connection.end();
  }
}

export function ensureProjectWeeklyUpdateSchema() {
  readiness ??= applyProjectWeeklyUpdateSchema();
  return readiness;
}
