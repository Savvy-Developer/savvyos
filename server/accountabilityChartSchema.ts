import mysql from "mysql2/promise";

/**
 * Keeps the Accountability Chart additive and available on Railway immediately
 * after deploy. The committed SQL migration remains the durable schema record;
 * this guard protects the app when that migration has not yet been run there.
 */
export const ACCOUNTABILITY_CHART_TABLES_DDL = [
  `CREATE TABLE IF NOT EXISTS \`accountability_seats\` (
    \`id\` int NOT NULL AUTO_INCREMENT,
    \`title\` varchar(255) NOT NULL,
    \`description\` text NULL,
    \`parentSeatId\` int NULL,
    \`sortOrder\` int NOT NULL DEFAULT 0,
    \`createdById\` int NULL,
    \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (\`id\`),
    KEY \`accountability_seats_parent_sort_idx\` (\`parentSeatId\`, \`sortOrder\`),
    KEY \`accountability_seats_title_idx\` (\`title\`),
    CONSTRAINT \`accountability_seats_parent_fk\` FOREIGN KEY (\`parentSeatId\`) REFERENCES \`accountability_seats\` (\`id\`) ON DELETE SET NULL,
    CONSTRAINT \`accountability_seats_creator_fk\` FOREIGN KEY (\`createdById\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL
  )`,
  `CREATE TABLE IF NOT EXISTS \`accountability_seat_holders\` (
    \`id\` int NOT NULL AUTO_INCREMENT,
    \`seatId\` int NOT NULL,
    \`userId\` int NOT NULL,
    \`sortOrder\` int NOT NULL DEFAULT 0,
    \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (\`id\`),
    UNIQUE KEY \`accountability_seat_holders_seat_user_unique\` (\`seatId\`, \`userId\`),
    KEY \`accountability_seat_holders_user_idx\` (\`userId\`),
    CONSTRAINT \`accountability_seat_holders_seat_fk\` FOREIGN KEY (\`seatId\`) REFERENCES \`accountability_seats\` (\`id\`) ON DELETE CASCADE,
    CONSTRAINT \`accountability_seat_holders_user_fk\` FOREIGN KEY (\`userId\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
  )`,
];

async function columnExists(connection: mysql.Connection, table: string, column: string) {
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

async function indexExists(connection: mysql.Connection, table: string, index: string) {
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

async function foreignKeyExists(connection: mysql.Connection, table: string, constraint: string) {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) AS count
       FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND CONSTRAINT_NAME = ?`,
    [table, constraint]
  );
  return Number(rows[0]?.count ?? 0) > 0;
}

async function applyAccountabilityChartSchema() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return;

  const connection = await mysql.createConnection(databaseUrl);
  try {
    for (const statement of ACCOUNTABILITY_CHART_TABLES_DDL) {
      await connection.query(statement);
    }
    if (!(await columnExists(connection, "roles_responsibilities", "seatId"))) {
      await connection.query(
        "ALTER TABLE `roles_responsibilities` ADD COLUMN `seatId` int NULL AFTER `ownerId`"
      );
    }
    if (!(await indexExists(connection, "roles_responsibilities", "rr_seat_status_idx"))) {
      await connection.query(
        "ALTER TABLE `roles_responsibilities` ADD KEY `rr_seat_status_idx` (`seatId`, `status`)"
      );
    }
    if (!(await foreignKeyExists(connection, "roles_responsibilities", "rr_seat_fk"))) {
      await connection.query(
        "ALTER TABLE `roles_responsibilities` ADD CONSTRAINT `rr_seat_fk` FOREIGN KEY (`seatId`) REFERENCES `accountability_seats` (`id`) ON DELETE SET NULL"
      );
    }
  } finally {
    await connection.end();
  }
}

let readiness: Promise<void> | null = null;

export function ensureAccountabilityChartSchema() {
  readiness ??= applyAccountabilityChartSchema();
  return readiness;
}
