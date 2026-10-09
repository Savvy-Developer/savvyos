import { createHash } from "node:crypto";
import { hostname } from "node:os";
import { Readable, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
  type CompletedPart,
} from "@aws-sdk/client-s3";
import mysql from "mysql2";
import mysqlPromise from "mysql2/promise";

/**
 * Nightly off-Railway copy of the SavvyOS database (security audit, finding 04).
 *
 * Railway already keeps daily, weekly and monthly volume backups of the MySQL
 * service (checked 9 Oct 2026), but they live in the same Railway account as
 * the database. If that account or project is lost or taken over, so are they.
 * This adds a copy somewhere else: once a night (3 AM Eastern by default) a
 * full SQL copy of every table, view and trigger, gzipped and streamed to an S3
 * bucket that is NOT the app's own bucket, with keys that are NOT the app's
 * own keys. Those keys should only be able to add files (no delete), and the
 * bucket should have versioning and Object Lock, so a leaked app key or a bad
 * deploy cannot wipe the backups too. Old copies are removed by the bucket's
 * own lifecycle rule (30 days), never by this code.
 *
 * It runs in its own small Railway service (SAVVYOS_PROCESS=databaseBackupWorker,
 * see databaseBackupWorker.ts), never in the web server: the database volume
 * is large (about 89 GB on 9 Oct), and a dump that size must not take CPU from
 * the site. The file is streamed to S3 in 64 MB parts, so it needs no local
 * disk and has no size limit in practice (640 GB).
 *
 * Off until the DATABASE_BACKUP_* variables are set on that service:
 *   DATABASE_BACKUP_S3_BUCKET              the separate backup bucket
 *   DATABASE_BACKUP_AWS_ACCESS_KEY_ID      keys for that bucket only
 *   DATABASE_BACKUP_AWS_SECRET_ACCESS_KEY
 *   DATABASE_BACKUP_S3_REGION              default us-east-2
 *   DATABASE_BACKUP_S3_PREFIX              default savvyos-mysql/
 *   DATABASE_BACKUP_HOUR_ET                default 3 (3 AM Eastern)
 *   DATABASE_BACKUP_ALERT_EMAILS           comma-separated; emailed if a night fails 3 times
 *   DATABASE_BACKUP_SKIP_TABLES            optional, comma-separated: structure only, no rows
 *   DATABASE_BACKUP_DATABASE_URL           optional read-only user; default DATABASE_URL
 *   DATABASE_BACKUP=off                    stops it
 *
 * The copy is taken inside one consistent snapshot (InnoDB), so every table
 * is from the same moment. It has no DROP TABLE lines on purpose: restoring it
 * into a database that already has the tables stops at the first table instead
 * of overwriting anything. Restore into a new, empty database:
 *   gunzip -c savvyos-<time>.sql.gz | mysql -h HOST -P PORT -u USER -p NEW_DB
 * Next to each file is <file>.manifest.json with its SHA-256 and the row count
 * of every table, to check a restore against.
 *
 * Every run is recorded in database_backup_runs (created at startup).
 */

// ─── Settings ────────────────────────────────────────────────────────────────

export const DEFAULT_BACKUP_HOUR_ET = 3;
export const DEFAULT_BACKUP_PREFIX = "savvyos-mysql/";
export const DEFAULT_BACKUP_REGION = "us-east-2";
/** A night that fails this many times stops trying and emails the alert list. */
export const MAX_ATTEMPTS_PER_DAY = 3;
export const BACKUP_LOCK_NAME = "savvyos_database_backup";
export const BACKUP_COMPLETE_MARKER = "-- SavvyOS backup complete";

export type BackupConfig =
  | {
      enabled: true;
      bucket: string;
      region: string;
      prefix: string;
      accessKeyId: string;
      secretAccessKey: string;
      hourEastern: number;
      alertEmails: string[];
      skipTables: string[];
      databaseUrl: string;
    }
  | { enabled: false; reason: string };

/** "savvyos-mysql" -> "savvyos-mysql/", "/a/b/" -> "a/b/", "" -> "". */
export function normalizeBackupPrefix(value: string | undefined): string {
  const trimmed = (value ?? DEFAULT_BACKUP_PREFIX).trim().replace(/^\/+/, "");
  if (!trimmed) return "";
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}

export function databaseBackupConfig(env: NodeJS.ProcessEnv = process.env): BackupConfig {
  if ((env.DATABASE_BACKUP || "").trim().toLowerCase() === "off") {
    return { enabled: false, reason: "DATABASE_BACKUP=off" };
  }
  const bucket = (env.DATABASE_BACKUP_S3_BUCKET || "").trim();
  const accessKeyId = (env.DATABASE_BACKUP_AWS_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = (env.DATABASE_BACKUP_AWS_SECRET_ACCESS_KEY || "").trim();
  const databaseUrl = (env.DATABASE_BACKUP_DATABASE_URL || env.DATABASE_URL || "").trim();
  const missing = [
    !bucket && "DATABASE_BACKUP_S3_BUCKET",
    !accessKeyId && "DATABASE_BACKUP_AWS_ACCESS_KEY_ID",
    !secretAccessKey && "DATABASE_BACKUP_AWS_SECRET_ACCESS_KEY",
    !databaseUrl && "DATABASE_URL",
  ].filter(Boolean);
  if (missing.length) {
    return { enabled: false, reason: `not set up yet (missing ${missing.join(", ")})` };
  }
  // A backup in the bucket it protects, or behind the same keys, is lost with it.
  const appBuckets = [env.AWS_BUCKET_NAME || "savvyos", env.MLS_MEDIA_BUCKET]
    .map(value => (value || "").trim().toLowerCase())
    .filter(Boolean);
  if (appBuckets.includes(bucket.toLowerCase())) {
    return { enabled: false, reason: "DATABASE_BACKUP_S3_BUCKET must be a separate bucket, not one the app uses" };
  }
  if (env.AWS_ACCESS_KEY_ID && accessKeyId === env.AWS_ACCESS_KEY_ID.trim()) {
    return { enabled: false, reason: "DATABASE_BACKUP_AWS_ACCESS_KEY_ID must be its own key, not the app's AWS key" };
  }
  const hour = Number.parseInt((env.DATABASE_BACKUP_HOUR_ET || "").trim(), 10);
  const alertEmails = (env.DATABASE_BACKUP_ALERT_EMAILS || "")
    .split(/[,;\s]+/)
    .map(email => email.trim())
    .filter(email => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email));
  return {
    enabled: true,
    bucket,
    region: (env.DATABASE_BACKUP_S3_REGION || "").trim() || DEFAULT_BACKUP_REGION,
    prefix: normalizeBackupPrefix(env.DATABASE_BACKUP_S3_PREFIX),
    accessKeyId,
    secretAccessKey,
    hourEastern: Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : DEFAULT_BACKUP_HOUR_ET,
    alertEmails,
    skipTables: Array.from(
      new Set(
        (env.DATABASE_BACKUP_SKIP_TABLES || "")
          .split(/[,;\s]+/)
          .map(name => name.trim())
          .filter(name => /^[A-Za-z0-9_$]+$/.test(name))
      )
    ).sort(),
    databaseUrl,
  };
}

// ─── When to run ─────────────────────────────────────────────────────────────

const easternFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
});

/** The Eastern calendar day ("2026-10-09") and hour (0 to 23) of a moment. */
export function easternClock(at: Date): { day: string; hour: number } {
  const parts = Object.fromEntries(easternFormat.formatToParts(at).map(part => [part.type, part.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) % 24 };
}

/**
 * Due once per Eastern day, from the chosen hour on. A server that was down
 * at 3 AM catches up when it starts; a night that failed three times waits
 * for the next day (and has emailed the alert list).
 */
export function backupDue(input: {
  now: Date;
  hourEastern: number;
  lastSuccessAt: Date | null;
  failedStartsToday: number;
}): { due: boolean; reason: string } {
  const today = easternClock(input.now);
  if (input.lastSuccessAt && easternClock(input.lastSuccessAt).day === today.day) {
    return { due: false, reason: "already backed up today" };
  }
  if (today.hour < input.hourEastern) {
    return { due: false, reason: `waiting for ${input.hourEastern}:00 Eastern` };
  }
  if (input.failedStartsToday >= MAX_ATTEMPTS_PER_DAY) {
    return { due: false, reason: `failed ${input.failedStartsToday} times today; next try tomorrow` };
  }
  return { due: true, reason: "due" };
}

/** Failed runs that started on the same Eastern day as `now`. */
export function countFailedToday(runs: Array<{ status: string; startedAt: Date }>, now: Date): number {
  const today = easternClock(now).day;
  return runs.filter(run => run.status === "failed" && easternClock(run.startedAt).day === today).length;
}

/** "savvyos-mysql/2026/10/savvyos-2026-10-09T07-00-05Z.sql.gz" (UTC time). */
export function backupObjectKey(prefix: string, at: Date): string {
  const iso = at.toISOString().replace(/\.\d{3}Z$/, "Z").replace(/:/g, "-");
  return `${prefix}${iso.slice(0, 4)}/${iso.slice(5, 7)}/savvyos-${iso}.sql.gz`;
}

// ─── Writing SQL ─────────────────────────────────────────────────────────────

export function quoteIdentifier(name: string): string {
  return "`" + String(name).replace(/`/g, "``") + "`";
}

const STRING_ESCAPES: Record<string, string> = {
  "\0": "\\0",
  "\b": "\\b",
  "\t": "\\t",
  "\n": "\\n",
  "\r": "\\r",
  "\x1a": "\\Z",
  "'": "\\'",
  '"': '\\"',
  "\\": "\\\\",
};

/** A MySQL string literal, escaped the way mysqldump does. */
export function sqlString(value: string): string {
  return "'" + value.replace(/[\0\b\t\n\r\x1a'"\\]/g, char => STRING_ESCAPES[char]) + "'";
}

function pad(value: number, size = 2) {
  return String(value).padStart(size, "0");
}

/**
 * One value as SQL. The dump connection returns dates and big numbers as the
 * exact text MySQL stored, and JSON as its raw text, so almost everything is a
 * string, a number, a Buffer (binary columns) or null. Date and object are
 * only a fallback.
 */
export function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (Buffer.isBuffer(value)) return value.length ? `X'${value.toString("hex")}'` : "''";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "string") return sqlString(value);
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "NULL";
    return sqlString(
      `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())} ${pad(value.getUTCHours())}:${pad(
        value.getUTCMinutes()
      )}:${pad(value.getUTCSeconds())}.${pad(value.getUTCMilliseconds(), 3)}`
    );
  }
  return sqlString(JSON.stringify(value));
}

/**
 * The columns a restore can write: everything except generated columns.
 * MySQL marks those "VIRTUAL GENERATED" or "STORED GENERATED". A column with
 * a default like CURRENT_TIMESTAMP says "DEFAULT_GENERATED" and IS written.
 */
export function insertableColumnNames(columns: Array<{ name: string; extra: string | null }>): string[] {
  return columns.filter(column => !/\b(VIRTUAL|STORED|PERSISTENT) GENERATED\b/i.test(column.extra || "")).map(column => column.name);
}

/** CREATE ... DEFINER=`user`@`host` ... -> the same without the DEFINER, so it restores under any user. */
export function stripDefiner(statement: string): string {
  return statement.replace(/\s+DEFINER\s*=\s*(`[^`]*`|'[^']*'|[^\s@]+)@(`[^`]*`|'[^']*'|[^\s]+)/i, "");
}

export type DumpSource = {
  serverVersion(): Promise<string>;
  /** Tables and views, by name. */
  tables(): Promise<Array<{ name: string; type: string }>>;
  createTable(name: string): Promise<string>;
  createView(name: string): Promise<string>;
  insertableColumns(name: string): Promise<string[]>;
  rows(name: string, columns: string[]): AsyncIterable<unknown[]>;
  triggers(): Promise<Array<{ name: string; statement: string }>>;
};

export type DumpStats = {
  tables: number;
  views: number;
  triggers: number;
  rows: number;
  rowsByTable: Record<string, number>;
  /** Tables written as structure only (DATABASE_BACKUP_SKIP_TABLES). */
  skippedTables: string[];
};

export function emptyDumpStats(): DumpStats {
  return { tables: 0, views: 0, triggers: 0, rows: 0, rowsByTable: {}, skippedTables: [] };
}

/**
 * The whole backup as SQL text, in pieces. `stats` is filled in as it goes;
 * the last line is the completion marker, so a cut-off file is obvious.
 */
export async function* dumpSql(
  source: DumpSource,
  stats: DumpStats,
  options: { now: Date; batchBytes?: number; batchRows?: number; skipRowsOf?: readonly string[] }
): AsyncGenerator<string> {
  const skipRowsOf = new Set(options.skipRowsOf ?? []);
  const batchBytes = options.batchBytes ?? 512 * 1024;
  const batchRows = options.batchRows ?? 1000;
  const version = await source.serverVersion();
  yield [
    "-- SavvyOS database backup",
    `-- Taken: ${options.now.toISOString()}`,
    `-- Server: ${version}`,
    "-- Restore into a NEW, EMPTY database only:",
    "--   gunzip -c this-file.sql.gz | mysql -h HOST -P PORT -u USER -p NEW_DATABASE",
    "-- It never drops a table: a database that already has these tables stops the restore.",
    "",
    "SET NAMES utf8mb4;",
    "SET time_zone = '+00:00';",
    "SET FOREIGN_KEY_CHECKS = 0;",
    "SET UNIQUE_CHECKS = 0;",
    "SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';",
    "",
    "",
  ].join("\n");

  const all = await source.tables();
  const baseTables = all.filter(table => table.type !== "VIEW").map(table => table.name).sort();
  const views = all.filter(table => table.type === "VIEW").map(table => table.name).sort();

  for (const table of baseTables) {
    const create = await source.createTable(table);
    yield `-- Table ${quoteIdentifier(table)}\n${create.trim()};\n`;
    if (skipRowsOf.has(table)) {
      stats.tables += 1;
      stats.skippedTables.push(table);
      yield `-- ${quoteIdentifier(table)}: rows not included (DATABASE_BACKUP_SKIP_TABLES)\n\n`;
      continue;
    }
    const columns = await source.insertableColumns(table);
    let count = 0;
    if (columns.length) {
      const head = `INSERT INTO ${quoteIdentifier(table)} (${columns.map(quoteIdentifier).join(",")}) VALUES\n`;
      let batch: string[] = [];
      let size = 0;
      for await (const row of source.rows(table, columns)) {
        const tuple = "(" + row.map(sqlLiteral).join(",") + ")";
        if (batch.length && (size + tuple.length > batchBytes || batch.length >= batchRows)) {
          yield head + batch.join(",\n") + ";\n";
          batch = [];
          size = 0;
        }
        batch.push(tuple);
        size += tuple.length + 2;
        count += 1;
      }
      if (batch.length) yield head + batch.join(",\n") + ";\n";
    }
    stats.tables += 1;
    stats.rows += count;
    stats.rowsByTable[table] = count;
    yield `-- ${quoteIdentifier(table)}: ${count} rows\n\n`;
  }

  for (const view of views) {
    const create = stripDefiner(await source.createView(view));
    yield `-- View ${quoteIdentifier(view)}\n${create.trim()};\n\n`;
    stats.views += 1;
  }

  const triggers = await source.triggers();
  for (const trigger of triggers) {
    yield `-- Trigger ${quoteIdentifier(trigger.name)}\nDELIMITER ;;\n${stripDefiner(trigger.statement).trim()};;\nDELIMITER ;\n\n`;
    stats.triggers += 1;
  }

  yield [
    "SET FOREIGN_KEY_CHECKS = 1;",
    "SET UNIQUE_CHECKS = 1;",
    `${BACKUP_COMPLETE_MARKER}: ${stats.tables} tables, ${stats.views} views, ${stats.triggers} triggers, ${stats.rows} rows`,
    "",
  ].join("\n");
}

// ─── Reading from MySQL ──────────────────────────────────────────────────────

/**
 * The dump connection hands back values exactly as stored: dates as text (no
 * time zone shifts), big integers and decimals as text (no rounding), JSON as
 * its raw text (not parsed into an object), and geometry as raw bytes.
 */
function openDumpConnection(databaseUrl: string): mysql.Connection {
  return mysql.createConnection({
    uri: databaseUrl,
    enableKeepAlive: true,
    dateStrings: true,
    supportBigNumbers: true,
    bigNumberStrings: true,
    timezone: "Z",
    charset: "UTF8MB4_UNICODE_CI",
    typeCast: ((field: any, next: () => unknown) => {
      if (field.type === "JSON") return field.string("utf8");
      if (field.type === "GEOMETRY") return field.buffer();
      return next();
    }) as any,
  } as any);
}

function mysqlSource(connection: mysql.Connection): DumpSource {
  const db = connection.promise();
  return {
    async serverVersion() {
      const [rows] = await db.query<any[]>("SELECT VERSION() AS version");
      return String(rows[0]?.version ?? "unknown");
    },
    async tables() {
      const [rows] = await db.query<any[]>({ sql: "SHOW FULL TABLES", rowsAsArray: true });
      return rows.map((row: any[]) => ({ name: String(row[0]), type: String(row[1]) }));
    },
    async createTable(name) {
      const [rows] = await db.query<any[]>({ sql: `SHOW CREATE TABLE ${quoteIdentifier(name)}`, rowsAsArray: true });
      return String(rows[0][1]);
    },
    async createView(name) {
      const [rows] = await db.query<any[]>({ sql: `SHOW CREATE VIEW ${quoteIdentifier(name)}`, rowsAsArray: true });
      return String(rows[0][1]);
    },
    async insertableColumns(name) {
      const [rows] = await db.query<any[]>(
        "SELECT COLUMN_NAME AS name, EXTRA AS extra FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION",
        [name]
      );
      return insertableColumnNames(rows.map((row: any) => ({ name: String(row.name), extra: row.extra == null ? null : String(row.extra) })));
    },
    rows(name, columns) {
      const query = connection.query({
        sql: `SELECT ${columns.map(quoteIdentifier).join(",")} FROM ${quoteIdentifier(name)}`,
        rowsAsArray: true,
      });
      return query.stream({ highWaterMark: 500 }) as unknown as AsyncIterable<unknown[]>;
    },
    async triggers() {
      const [rows] = await db.query<any[]>("SHOW TRIGGERS");
      const out: Array<{ name: string; statement: string }> = [];
      for (const row of rows) {
        const name = String(row.Trigger);
        const [created] = await db.query<any[]>(`SHOW CREATE TRIGGER ${quoteIdentifier(name)}`);
        out.push({ name, statement: String(created[0]?.["SQL Original Statement"] ?? "") });
      }
      return out.sort((a, b) => a.name.localeCompare(b.name));
    },
  };
}

// ─── The run ─────────────────────────────────────────────────────────────────

export const DATABASE_BACKUP_RUNS_DDL = `
  CREATE TABLE IF NOT EXISTS \`database_backup_runs\` (
    \`id\` int NOT NULL AUTO_INCREMENT,
    \`runTrigger\` varchar(16) NOT NULL,
    \`status\` varchar(16) NOT NULL,
    \`startedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    \`finishedAt\` timestamp NULL DEFAULT NULL,
    \`objectKey\` varchar(512) NULL,
    \`bytes\` bigint NULL,
    \`sha256\` char(64) NULL,
    \`tableCount\` int NULL,
    \`rowCount\` bigint NULL,
    \`host\` varchar(128) NULL,
    \`error\` text NULL,
    PRIMARY KEY (\`id\`),
    KEY \`database_backup_runs_started_idx\` (\`startedAt\`)
  )
`;

let readiness: Promise<void> | null = null;

async function applyDatabaseBackupSchema() {
  if (process.env.NODE_ENV !== "production") return;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return;
  let connection: Awaited<ReturnType<typeof mysqlPromise.createConnection>> | null = null;
  try {
    connection = await mysqlPromise.createConnection(databaseUrl);
    await connection.query(DATABASE_BACKUP_RUNS_DDL);
  } catch (error) {
    console.error("[DatabaseBackup] could not create database_backup_runs", error);
  } finally {
    await connection?.end().catch(() => undefined);
  }
}

export function ensureDatabaseBackupSchema() {
  readiness ??= applyDatabaseBackupSchema();
  return readiness;
}

export type BackupTrigger = "schedule" | "manual";
export type BackupOutcome =
  | { status: "off"; reason: string }
  | { status: "skipped"; reason: string }
  | { status: "busy" }
  | { status: "succeeded"; objectKey: string; bytes: number; tables: number; rows: number; seconds: number }
  | { status: "failed"; error: string };

type StatusConnection = Awaited<ReturnType<typeof mysqlPromise.createConnection>>;

async function loadDueState(status: StatusConnection, config: Extract<BackupConfig, { enabled: true }>, now: Date) {
  const [lastRows] = await status.query<any[]>(
    "SELECT MAX(`finishedAt`) AS lastSuccessAt FROM `database_backup_runs` WHERE `status` = 'succeeded'"
  );
  const [recentRows] = await status.query<any[]>(
    "SELECT `status`, `startedAt` FROM `database_backup_runs` WHERE `startedAt` >= ? ",
    [new Date(now.getTime() - 36 * 60 * 60_000)]
  );
  const lastSuccessAt = lastRows[0]?.lastSuccessAt ? new Date(lastRows[0].lastSuccessAt) : null;
  const failedStartsToday = countFailedToday(
    recentRows.map((row: any) => ({ status: String(row.status), startedAt: new Date(row.startedAt) })),
    now
  );
  return {
    lastSuccessAt,
    failedStartsToday,
    ...backupDue({ now, hourEastern: config.hourEastern, lastSuccessAt, failedStartsToday }),
  };
}

/** S3 parts: at least 5 MB each except the last; 64 MB keeps memory small and allows 640 GB. */
export const UPLOAD_PART_BYTES = 64 * 1024 * 1024;

/**
 * A stream that cuts what is written to it into fixed-size parts and hands
 * each one to `uploadPart`, in order, one at a time (so memory stays at about
 * one part). It also counts the bytes and hashes the whole file.
 */
export function partWriter(options: {
  partSize: number;
  uploadPart: (partNumber: number, body: Buffer) => Promise<void>;
}) {
  const hash = createHash("sha256");
  let pending: Buffer[] = [];
  let pendingBytes = 0;
  let partNumber = 0;
  let bytes = 0;

  async function flush(final: boolean) {
    while (pendingBytes >= options.partSize || (final && pendingBytes > 0)) {
      const all = pending.length === 1 ? pending[0] : Buffer.concat(pending, pendingBytes);
      const size = final ? Math.min(all.length, options.partSize) : options.partSize;
      const body = all.subarray(0, size);
      const rest = all.subarray(size);
      pending = rest.length ? [Buffer.from(rest)] : [];
      pendingBytes = rest.length;
      partNumber += 1;
      await options.uploadPart(partNumber, Buffer.from(body));
    }
  }

  const writable = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      hash.update(buffer);
      bytes += buffer.length;
      pending.push(buffer);
      pendingBytes += buffer.length;
      if (pendingBytes < options.partSize) return callback();
      flush(false).then(() => callback(), callback);
    },
    final(callback) {
      flush(true).then(() => callback(), callback);
    },
  });

  return {
    writable,
    result: (() => {
      let digest: string | null = null;
      return () => ({ bytes, parts: partNumber, sha256: (digest ??= hash.digest("hex")) });
    })(),
  };
}

function sha256Base64(body: Buffer): string {
  return createHash("sha256").update(body).digest("base64");
}

async function sendBackupAlert(config: Extract<BackupConfig, { enabled: true }>, subject: string, lines: string[]) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!config.alertEmails.length || !apiKey) {
    console.error(`[DatabaseBackup] ALERT (no alert email set): ${subject}`);
    return;
  }
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({
        from: "Savvy STR Agents <notifications@savvy-agents.com>",
        to: config.alertEmails,
        subject,
        text: lines.join("\n"),
      }),
    });
    if (!response.ok) console.error(`[DatabaseBackup] Alert email failed: HTTP ${response.status}`);
  } catch (error) {
    console.error("[DatabaseBackup] Alert email failed", error);
  }
}

let running = false;

/**
 * Take one backup if it is due (a manual run skips the "due" check, not the
 * lock). Only one server takes it: a MySQL lock, then a second "due" check
 * once the lock is held, so two Railway instances never both upload.
 */
export async function runDatabaseBackup(trigger: BackupTrigger, env: NodeJS.ProcessEnv = process.env): Promise<BackupOutcome> {
  const config = databaseBackupConfig(env);
  if (!config.enabled) return { status: "off", reason: config.reason };
  if (running) return { status: "busy" };
  running = true;
  const now = new Date();
  let status: StatusConnection | null = null;
  let dump: mysql.Connection | null = null;
  let runId: number | null = null;
  let s3: S3Client | null = null;
  let upload: { key: string; id: string } | null = null;
  try {
    status = await mysqlPromise.createConnection({ uri: config.databaseUrl, timezone: "Z", enableKeepAlive: true } as any);
    await status.query("SET SESSION time_zone = '+00:00'");
    if (trigger === "schedule") {
      const state = await loadDueState(status, config, now);
      if (!state.due) return { status: "skipped", reason: state.reason };
    }

    dump = openDumpConnection(config.databaseUrl);
    const dumpDb = dump.promise();
    const [lockRows] = await dumpDb.query<any[]>("SELECT GET_LOCK(?, 0) AS got", [BACKUP_LOCK_NAME]);
    if (Number(lockRows[0]?.got) !== 1) return { status: "busy" };
    if (trigger === "schedule") {
      const state = await loadDueState(status, config, now);
      if (!state.due) return { status: "skipped", reason: state.reason };
    }

    const [inserted] = await status.query<any>(
      "INSERT INTO `database_backup_runs` (`runTrigger`, `status`, `host`) VALUES (?, 'running', ?)",
      [trigger, hostname().slice(0, 128)]
    );
    runId = Number(inserted.insertId) || null;

    const started = Date.now();
    await dumpDb.query("SET SESSION time_zone = '+00:00'");
    await dumpDb.query("SET SESSION net_write_timeout = 1800");
    await dumpDb.query("SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    await dumpDb.query("START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY");

    const stats = emptyDumpStats();
    const objectKey = backupObjectKey(config.prefix, now);
    s3 = new S3Client({
      region: config.region,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
    const created = await s3.send(
      new CreateMultipartUploadCommand({
        Bucket: config.bucket,
        Key: objectKey,
        ContentType: "application/gzip",
        ServerSideEncryption: "AES256",
        // Object Lock buckets require a checksum on every part; S3 also checks them.
        ChecksumAlgorithm: "SHA256",
        Metadata: { "savvyos-format": "sql-gzip-v1" },
      })
    );
    if (!created.UploadId) throw new Error("S3 did not start the upload.");
    upload = { key: objectKey, id: created.UploadId };
    const parts: CompletedPart[] = [];
    const client = s3;
    const writer = partWriter({
      partSize: UPLOAD_PART_BYTES,
      uploadPart: async (partNumber, body) => {
        const checksum = sha256Base64(body);
        const result = await client.send(
          new UploadPartCommand({
            Bucket: config.bucket,
            Key: objectKey,
            UploadId: created.UploadId,
            PartNumber: partNumber,
            Body: body,
            ContentLength: body.length,
            ChecksumSHA256: checksum,
          })
        );
        parts.push({ ETag: result.ETag, PartNumber: partNumber, ChecksumSHA256: result.ChecksumSHA256 ?? checksum });
      },
    });
    await pipeline(
      Readable.from(dumpSql(mysqlSource(dump), stats, { now, skipRowsOf: config.skipTables })),
      createGzip({ level: 6 }),
      writer.writable
    );
    await dumpDb.query("COMMIT");
    await s3.send(
      new CompleteMultipartUploadCommand({
        Bucket: config.bucket,
        Key: objectKey,
        UploadId: created.UploadId,
        MultipartUpload: { Parts: parts },
      })
    );
    upload = null;
    const { bytes, sha256 } = writer.result();
    const head = await s3.send(new HeadObjectCommand({ Bucket: config.bucket, Key: objectKey }));
    if (Number(head.ContentLength) !== bytes) {
      throw new Error(`Uploaded size ${head.ContentLength} does not match what was written (${bytes} bytes).`);
    }
    const manifest = Buffer.from(
      JSON.stringify(
        {
          format: "savvyos-sql-gzip-v1",
          takenAt: now.toISOString(),
          objectKey,
          bytes,
          sha256,
          tables: stats.tables,
          views: stats.views,
          triggers: stats.triggers,
          rows: stats.rows,
          skippedTables: stats.skippedTables,
          rowsByTable: stats.rowsByTable,
        },
        null,
        2
      )
    );
    await s3.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: `${objectKey}.manifest.json`,
        Body: manifest,
        ContentLength: manifest.length,
        ContentType: "application/json",
        ServerSideEncryption: "AES256",
        ChecksumSHA256: sha256Base64(manifest),
      })
    );

    const seconds = Math.round((Date.now() - started) / 1000);
    if (runId) {
      await status.query(
        "UPDATE `database_backup_runs` SET `status` = 'succeeded', `finishedAt` = CURRENT_TIMESTAMP, `objectKey` = ?, `bytes` = ?, `sha256` = ?, `tableCount` = ?, `rowCount` = ? WHERE `id` = ?",
        [objectKey, bytes, sha256, stats.tables, stats.rows, runId]
      );
    }
    console.info(
      `[DatabaseBackup] Saved s3://${config.bucket}/${objectKey} (${(bytes / 1024 / 1024).toFixed(1)} MB, ${stats.tables} tables, ${stats.rows} rows) in ${seconds}s.`
    );
    return { status: "succeeded", objectKey, bytes, tables: stats.tables, rows: stats.rows, seconds };
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 2000);
    console.error(`[DatabaseBackup] Backup failed (${trigger}): ${message}`);
    try {
      await dump?.promise().query("ROLLBACK");
    } catch {
      // The connection may already be gone.
    }
    if (s3 && upload) {
      // Drops the unfinished parts (not a stored backup); the bucket's
      // "abort incomplete uploads" rule is the safety net if this fails.
      await s3
        .send(new AbortMultipartUploadCommand({ Bucket: config.bucket, Key: upload.key, UploadId: upload.id }))
        .catch(() => undefined);
    }
    if (status && runId) {
      try {
        await status.query(
          "UPDATE `database_backup_runs` SET `status` = 'failed', `finishedAt` = CURRENT_TIMESTAMP, `error` = ? WHERE `id` = ?",
          [message, runId]
        );
        const state = await loadDueState(status, config, now);
        if (state.failedStartsToday >= MAX_ATTEMPTS_PER_DAY) {
          await sendBackupAlert(config, "SavvyOS database backup failed", [
            `Tonight's SavvyOS database backup failed ${state.failedStartsToday} times and will try again tomorrow.`,
            `Last error: ${message}`,
            `Last good backup: ${state.lastSuccessAt ? state.lastSuccessAt.toISOString() : "none yet"}`,
            "Railway logs: search for [DatabaseBackup].",
          ]);
        }
      } catch (recordError) {
        console.error("[DatabaseBackup] Could not record the failure", recordError);
      }
    }
    return { status: "failed", error: message };
  } finally {
    running = false;
    if (dump) {
      try {
        await dump.promise().query("SELECT RELEASE_LOCK(?)", [BACKUP_LOCK_NAME]);
      } catch {
        // Closing the connection releases it anyway.
      }
      await dump.promise().end().catch(() => dump?.destroy());
    }
    await status?.end().catch(() => undefined);
  }
}

let timer: ReturnType<typeof setInterval> | null = null;

/** Checks every 15 minutes, and 3 minutes after start. Nothing happens until it is set up. */
export function scheduleDatabaseBackup(): void {
  const config = databaseBackupConfig();
  if (!config.enabled) {
    console.info(`[DatabaseBackup] Off: ${config.reason}.`);
    return;
  }
  console.info(
    `[DatabaseBackup] On: nightly from ${config.hourEastern}:00 Eastern to s3://${config.bucket}/${config.prefix}`
  );
  const tick = (label: string) =>
    runDatabaseBackup("schedule")
      .then(outcome => {
        if (outcome.status === "failed") console.error(`[DatabaseBackup] ${label}: failed.`);
      })
      .catch(error => console.error(`[DatabaseBackup] ${label} failed.`, error));
  if (timer) clearInterval(timer);
  timer = setInterval(() => void tick("Check"), 15 * 60_000);
  setTimeout(() => void tick("Startup check"), 3 * 60_000);
}
