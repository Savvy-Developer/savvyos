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

/** Returns the indexes it built. When another process holds the build lock it
 * returns immediately. Both indexes are added in one statement: one metadata
 * lock handshake and one table scan. An interrupted online build rolls back. */
export async function applySearchCoverIndexes(connection: Connection): Promise<string[]> {
  const lockName = "savvyos_mls_search_cover_idx_v1";
  const [lock] = await connection.query<any[]>("SELECT GET_LOCK(?, 0) AS acquired", [lockName]);
  if (Number(lock[0]?.acquired) !== 1) return [];
  try {
    const missing: Array<(typeof SEARCH_COVER_INDEX_DDL)[number]> = [];
    for (const index of SEARCH_COVER_INDEX_DDL) {
      const [existing] = await connection.query<any[]>("SHOW INDEX FROM mls_listings WHERE Key_name = ?", [index.name]);
      if (!existing.length) missing.push(index);
    }
    if (!missing.length) return [];
    await connection.query(`ALTER TABLE mls_listings ${missing.map(index => `ADD INDEX ${index.name} (${index.columns})`).join(", ")}, ALGORITHM=INPLACE, LOCK=NONE`);
    return missing.map(index => index.name);
  } finally {
    await connection.query("SELECT RELEASE_LOCK(?)", [lockName]);
  }
}

/** Sessions currently holding mls_listings open, as normalized statement
 * digests (MySQL replaces every literal with ?), so logs never carry values.
 * An idle holder means an open transaction: MDL lasts until it commits. */
export async function listingLockHolders(connection: Connection): Promise<Array<{ id: number; command: string; seconds: number; digest: string }> | null> {
  try {
    const [rows] = await connection.query<any[]>(`
      SELECT DISTINCT t.PROCESSLIST_ID AS id, t.PROCESSLIST_COMMAND AS command,
             COALESCE(t.PROCESSLIST_TIME, 0) AS seconds, LEFT(COALESCE(s.DIGEST_TEXT, ''), 160) AS digest
        FROM performance_schema.metadata_locks ml
        JOIN performance_schema.threads t ON t.THREAD_ID = ml.OWNER_THREAD_ID
        LEFT JOIN performance_schema.events_statements_current s ON s.THREAD_ID = t.THREAD_ID
       WHERE ml.OBJECT_SCHEMA = DATABASE() AND ml.OBJECT_NAME = 'mls_listings'
         AND ml.LOCK_STATUS = 'GRANTED' AND t.PROCESSLIST_ID IS NOT NULL AND t.PROCESSLIST_ID <> CONNECTION_ID()
       ORDER BY seconds DESC LIMIT 8`);
    return rows.map(row => ({ id: Number(row.id), command: String(row.command ?? ""), seconds: Number(row.seconds ?? 0), digest: String(row.digest ?? "") }));
  } catch {
    return null;
  }
}

/** Holders that would make the ALTER wait out its lock timeout: open
 * transactions (idle holders) and statements already running for 8 s+. */
export function blockingHolders<T extends { command: string; seconds: number }>(holders: T[]): T[] {
  return holders.filter(holder => holder.command === "Sleep" || holder.seconds >= 8);
}

const COVER_BUILD_ATTEMPTS = 90;
const COVER_BUILD_RETRY_MS = 30_000;

/** Runs in the ingestion worker only. While MySQL waits for the metadata
 * lock, new queries on mls_listings queue behind it, so the build never waits
 * on a long holder: it skips that window and retries. The 12 s cap outlasts
 * the 10 s execution guard on search queries. */
async function buildSearchCoverIndexes(databaseUrl: string) {
  let lastLoggedAt = 0;
  for (let attempt = 1; attempt <= COVER_BUILD_ATTEMPTS; attempt++) {
    let connection: Connection | null = null;
    const logHolders = (reason: string, holders: Awaited<ReturnType<typeof listingLockHolders>>) => {
      if (Date.now() - lastLoggedAt < 5 * 60_000 && attempt !== 1) return;
      lastLoggedAt = Date.now();
      const summary = holders?.length ? holders.map(holder => `#${holder.id} ${holder.command} ${holder.seconds}s ${holder.digest || "(no statement)"}`).join(" | ") : "none visible";
      console.warn(`[mlsSchema] covering index build ${reason} (attempt ${attempt}/${COVER_BUILD_ATTEMPTS}); mls_listings holders: ${summary}`);
    };
    try {
      connection = await mysql.createConnection(databaseUrl);
      const holders = await listingLockHolders(connection);
      const blocking = holders ? blockingHolders(holders) : [];
      if (blocking.length) {
        logHolders("waiting for long mls_listings holders", blocking);
      } else {
        await connection.query("SET SESSION lock_wait_timeout = 12");
        const started = Date.now();
        const built = await applySearchCoverIndexes(connection);
        if (built.length) console.log(`[mlsSchema] built ${built.join(", ")} in ${Math.round((Date.now() - started) / 1000)}s`);
        return;
      }
    } catch (error) {
      const code = String((error as any)?.code ?? "unknown");
      const holders = connection ? await listingLockHolders(connection) : null;
      logHolders(`failed with ${code}`, holders);
    } finally {
      await connection?.end().catch(() => undefined);
    }
    await new Promise(resolve => setTimeout(resolve, COVER_BUILD_RETRY_MS));
  }
  console.error(`[mlsSchema] gave up building MLS search covering indexes after ${COVER_BUILD_ATTEMPTS} attempts; the next worker start retries`);
}

let coverBuild: Promise<void> | null = null;

/** Start the online covering-index build once per worker process. */
export function startSearchCoverIndexBuild() {
  const enabled = process.env.NODE_ENV === "production" || process.env.MLS_SCHEMA_ENSURE === "on";
  const databaseUrl = process.env.DATABASE_URL;
  if (!enabled || !databaseUrl || process.env.MLS_SEARCH_COVER_INDEXES === "off") return;
  coverBuild ??= buildSearchCoverIndexes(databaseUrl);
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
