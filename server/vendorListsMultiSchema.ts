import mysql from "mysql2/promise";

/**
 * Lets an agent keep more than one Vendor List (one per market, e.g. St. Louis
 * and Lake of the Ozarks), each with its own public link.
 *
 * vendor_lists.agentId was UNIQUE. This adds the `label` (market) column and a
 * plain index on agentId, then drops the UNIQUE index. The plain index is
 * created first because the agentId foreign key needs an index to remain.
 *
 * Runs before the new instance takes traffic. Every step checks
 * INFORMATION_SCHEMA first, so it is safe to repeat. The label column and the
 * plain index are required by this release (every list query selects label),
 * so a failure there is thrown and the deploy stops on the old version. Dropping
 * the UNIQUE index only gates creating a second list, so a failure there is
 * logged and the rest of Vendor Lists keeps working.
 */
export const VENDOR_LISTS_LABEL_COLUMN =
  "ALTER TABLE `vendor_lists` ADD COLUMN `label` varchar(120) NULL AFTER `agentId`";
export const VENDOR_LISTS_AGENT_INDEX =
  "CREATE INDEX `vendor_lists_agent_idx` ON `vendor_lists` (`agentId`)";

let readiness: Promise<void> | null = null;

async function columnExists(connection: mysql.Connection, tableName: string, columnName: string) {
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

async function indexExists(connection: mysql.Connection, tableName: string, indexName: string) {
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

/**
 * Names of UNIQUE indexes on vendor_lists that cover agentId alone (drizzle
 * named it vendor_lists_agentId_unique; looked up rather than assumed).
 */
async function uniqueAgentIndexes(connection: mysql.Connection): Promise<string[]> {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT INDEX_NAME AS name
       FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'vendor_lists'
        AND NON_UNIQUE = 0
        AND INDEX_NAME <> 'PRIMARY'
      GROUP BY INDEX_NAME
     HAVING COUNT(*) = 1 AND MAX(COLUMN_NAME) = 'agentId'`
  );
  return rows.map(row => String(row.name));
}

async function applyVendorListsMultiSchema() {
  if (process.env.NODE_ENV !== "production") return;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return;

  const connection = await mysql.createConnection(databaseUrl);
  try {
    if (!(await columnExists(connection, "vendor_lists", "label"))) {
      await connection.query(VENDOR_LISTS_LABEL_COLUMN);
    }
    if (!(await indexExists(connection, "vendor_lists", "vendor_lists_agent_idx"))) {
      await connection.query(VENDOR_LISTS_AGENT_INDEX);
    }
    try {
      for (const name of await uniqueAgentIndexes(connection)) {
        await connection.query(`ALTER TABLE \`vendor_lists\` DROP INDEX \`${name.replace(/`/g, "")}\``);
      }
    } catch (error) {
      console.error("[vendorListsMultiSchema] could not drop the one-list-per-agent UNIQUE index", error);
    }
  } finally {
    await connection.end().catch(() => undefined);
  }
}

export function ensureVendorListsMultiSchema() {
  readiness ??= applyVendorListsMultiSchema();
  return readiness;
}
