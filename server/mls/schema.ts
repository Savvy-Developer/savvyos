import mysql from "mysql2/promise";
import { MLS_TABLE_DDL } from "./schemaDdl";
import { MLS_SOURCE_SEEDS, seedCompliance } from "./sources";

/**
 * Creates the MLS Properties tables, adds the two page permissions, and seeds
 * the MLS source registry, so this release needs no hand-run SQL.
 *
 * Additive and safe to repeat: CREATE TABLE IF NOT EXISTS, ADD COLUMN only
 * when missing, and INSERT only for source codes that do not exist yet (an
 * admin's edits to a source are never overwritten).
 *
 * Runs in production, or anywhere with MLS_SCHEMA_ENSURE=on. A failure is
 * logged, not thrown, except that the permission columns are checked first:
 * admin_permissions is read on every request, so those columns must exist
 * before Drizzle selects them.
 */
type Connection = Awaited<ReturnType<typeof mysql.createConnection>>;

const PERMISSION_COLUMNS = [
  { name: "canViewMlsProperties", definition: "boolean NOT NULL DEFAULT false" },
  { name: "canManageMlsFeeds", definition: "boolean NOT NULL DEFAULT false" },
];

async function columnExists(connection: Connection, table: string, column: string) {
  const [rows] = await connection.query<any[]>(
    `SELECT COUNT(*) AS count FROM information_schema.columns
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return Number(rows[0]?.count ?? 0) > 0;
}

export async function applyMlsSchema(connection: Connection) {
  for (const column of PERMISSION_COLUMNS) {
    if (!(await columnExists(connection, "admin_permissions", column.name))) {
      await connection.query(
        `ALTER TABLE \`admin_permissions\` ADD COLUMN \`${column.name}\` ${column.definition}`
      );
    }
  }
  for (const statement of MLS_TABLE_DDL) {
    await connection.query(statement.sql);
  }
  if (!(await columnExists(connection, "mls_sync_cursors", "sweepStartedAt"))) {
    await connection.query("ALTER TABLE mls_sync_cursors ADD COLUMN sweepStartedAt datetime NULL");
  }
  const [oldIndexes] = await connection.query<any[]>("SHOW INDEX FROM mls_listings WHERE Key_name = 'mls_listings_source_number_uq'");
  if (oldIndexes.length) await connection.query("ALTER TABLE mls_listings DROP INDEX mls_listings_source_number_uq, ADD INDEX mls_listings_source_number_idx (sourceId, listingNumber)");
  await seedMlsSources(connection);
}

export async function seedMlsSources(connection: Connection) {
  const [rows] = await connection.query<any[]>("SELECT code FROM `mls_sources`");
  const existing = new Set(rows.map(row => String(row.code)));
  let sortOrder = 0;
  for (const seed of MLS_SOURCE_SEEDS) {
    sortOrder += 10;
    if (existing.has(seed.code)) continue;
    await connection.query(
      `INSERT INTO \`mls_sources\`
        (code, name, shortName, territory, providerRoute, onboardingStatus, routeNote,
         originatingSystemName, keyPrefix, websiteUrl, compliance, sortOrder)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        seed.code,
        seed.name,
        seed.shortName,
        seed.territory,
        seed.providerRoute,
        seed.onboardingStatus,
        seed.routeNote,
        seed.originatingSystemName ?? null,
        seed.keyPrefix ?? null,
        seed.websiteUrl ?? null,
        JSON.stringify(seedCompliance(seed)),
        sortOrder,
      ]
    );
  }
}

let readiness: Promise<void> | null = null;

async function ensure() {
  const enabled = process.env.NODE_ENV === "production" || process.env.MLS_SCHEMA_ENSURE === "on";
  if (!enabled) return;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return;
  let connection: Connection | null = null;
  try {
    connection = await mysql.createConnection(databaseUrl);
    await applyMlsSchema(connection);
  } catch (error) {
    console.error("[mlsSchema] could not apply MLS Properties schema", error);
  } finally {
    await connection?.end().catch(() => undefined);
  }
}

export function ensureMlsSchema() {
  readiness ??= ensure();
  return readiness;
}
