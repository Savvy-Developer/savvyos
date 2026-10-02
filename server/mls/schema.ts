import mysql from "mysql2/promise";
import { ensureDeclaredMlsFeeds } from "./feedBootstrap";
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

async function ensureNewestListingIndex(connection: Connection) {
  // Web and ingestion worker start together; serialize the online index build.
  // InnoDB's LOCK=NONE permits listing writes while the secondary index builds.
  const name = "savvyos_mls_status_entry_idx_v1";
  const [lock] = await connection.query<any[]>("SELECT GET_LOCK(?, 300) AS acquired", [name]);
  if (Number(lock[0]?.acquired) !== 1) throw new Error("Timed out waiting for the MLS Newest-search index migration");
  try {
    const [indexes] = await connection.query<any[]>("SHOW INDEX FROM mls_listings WHERE Key_name = 'mls_listings_status_entry_idx'");
    if (!indexes.length) {
      await connection.query("ALTER TABLE mls_listings ADD INDEX mls_listings_status_entry_idx (standardStatus, originalEntryAt), ALGORITHM=INPLACE, LOCK=NONE");
    }
  } finally {
    await connection.query("SELECT RELEASE_LOCK(?)", [name]);
  }
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
  await ensureNewestListingIndex(connection);
  await seedMlsSources(connection);
}

/** Covering indexes for map clusters, exact counts and the MARIS BBO-over-IDX
 * check. They are large, so they build online in the background and never
 * hold up MLS requests (which await ensureMlsSchema). Search code forces them
 * only after MySQL lists them. */
export const SEARCH_COVER_INDEX_DDL = [
  {
    name: "mls_listings_search_cover_idx",
    columns: "standardStatus, latitude, longitude, feedId, propertyType, removedFromFeedAt, listPrice, sourceId, listingNumber",
  },
  {
    name: "mls_listings_source_number_feed_idx",
    columns: "sourceId, listingNumber, feedId, removedFromFeedAt",
  },
] as const;

/** Returns the indexes it built. When another process (web or worker) holds
 * the build lock it returns immediately; the next start retries anything
 * still missing, and an interrupted online build simply rolls back. */
export async function applySearchCoverIndexes(connection: Connection): Promise<string[]> {
  const lockName = "savvyos_mls_search_cover_idx_v1";
  const [lock] = await connection.query<any[]>("SELECT GET_LOCK(?, 0) AS acquired", [lockName]);
  if (Number(lock[0]?.acquired) !== 1) return [];
  const built: string[] = [];
  try {
    for (const index of SEARCH_COVER_INDEX_DDL) {
      const [existing] = await connection.query<any[]>("SHOW INDEX FROM mls_listings WHERE Key_name = ?", [index.name]);
      if (existing.length) continue;
      await connection.query(`ALTER TABLE mls_listings ADD INDEX ${index.name} (${index.columns}), ALGORITHM=INPLACE, LOCK=NONE`);
      built.push(index.name);
    }
  } finally {
    await connection.query("SELECT RELEASE_LOCK(?)", [lockName]);
  }
  return built;
}

async function buildSearchCoverIndexes(databaseUrl: string) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    let connection: Connection | null = null;
    try {
      connection = await mysql.createConnection(databaseUrl);
      // The online build briefly needs an exclusive metadata lock at the end.
      // Give up after 20 s rather than queueing every MLS query behind a
      // long-running read; the build rolls back and is retried.
      await connection.query("SET SESSION lock_wait_timeout = 20");
      const started = Date.now();
      const built = await applySearchCoverIndexes(connection);
      if (built.length) console.log(`[mlsSchema] built ${built.join(", ")} in ${Math.round((Date.now() - started) / 1000)}s`);
      return;
    } catch (error) {
      console.error(`[mlsSchema] could not build MLS search covering indexes (attempt ${attempt}/3)`, error);
    } finally {
      await connection?.end().catch(() => undefined);
    }
    await new Promise(resolve => setTimeout(resolve, 60_000));
  }
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
    await connection?.end().catch(() => undefined);
    return;
  }
  if (process.env.MLS_SEARCH_COVER_INDEXES !== "off") void buildSearchCoverIndexes(databaseUrl);
  try {
    if (process.env.MLS_DECLARED_FEEDS !== "off") await ensureDeclaredMlsFeeds(connection);
  } catch (error) {
    console.error("[mlsFeeds] could not create declared MLS feeds", error);
  } finally {
    await connection?.end().catch(() => undefined);
  }
}

export function ensureMlsSchema() {
  readiness ??= ensure();
  return readiness;
}
