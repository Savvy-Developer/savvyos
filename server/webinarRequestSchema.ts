import mysql from "mysql2/promise";

/**
 * Keeps the webinar request form compatible with production during its first
 * deployment. The SQL migration remains the permanent schema record; this
 * idempotent guard applies it before Railway makes the new instance healthy.
 */
let readiness: Promise<void> | null = null;

async function columnExists(connection: mysql.Connection, columnName: string) {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) AS count
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = "webinars"
        AND COLUMN_NAME = ?`,
    [columnName],
  );
  return Number(rows[0]?.count ?? 0) > 0;
}

async function applyWebinarRequestSchema() {
  if (process.env.NODE_ENV !== "production") return;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return;

  const connection = await mysql.createConnection(databaseUrl);
  try {
    if (!(await columnExists(connection, "partnerGuestInfo"))) {
      await connection.query(
        "ALTER TABLE `webinars` ADD COLUMN `partnerGuestInfo` text NULL AFTER `description`",
      );
    }
    if (!(await columnExists(connection, "guestBios"))) {
      await connection.query(
        "ALTER TABLE `webinars` ADD COLUMN `guestBios` text NULL AFTER `partnerGuestInfo`",
      );
    }
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`webinar_guest_headshots\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`webinarId\` int NOT NULL,
        \`fileUrl\` text NOT NULL,
        \`fileKey\` varchar(512) NOT NULL,
        \`fileName\` varchar(255) NOT NULL,
        \`mimeType\` varchar(128) NOT NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`webinar_guest_headshots_webinar_idx\` (\`webinarId\`),
        CONSTRAINT \`webinar_guest_headshots_webinar_fk\`
          FOREIGN KEY (\`webinarId\`) REFERENCES \`webinars\` (\`id\`) ON DELETE CASCADE
      )
    `);
  } finally {
    await connection.end();
  }
}

export function ensureWebinarRequestSchema() {
  readiness ??= applyWebinarRequestSchema();
  return readiness;
}
