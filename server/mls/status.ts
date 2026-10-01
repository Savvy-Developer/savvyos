import type { Express } from "express";
import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { MLS_TABLE_DDL } from "./schemaDdl";
import { MLS_SOURCE_SEEDS } from "./sources";

/**
 * GET /healthz/mls: a public, count-only check that the MLS Properties schema
 * exists in production. It exists so Tyler, his tech lead, and agents can
 * confirm a deploy without an admin login. It returns table, column, and source
 * counts only. No listing data, no source names, no error text. Results are
 * cached for 30 seconds so it can't be used to load the database.
 */
export type MlsSchemaStatus = {
  status: "ok" | "incomplete" | "unavailable";
  tables: { found: number; expected: number };
  permissionColumns: { found: number; expected: number };
  sources: { found: number; expected: number };
  checkedAt: string;
};

const PERMISSION_COLUMNS = ["canViewMlsProperties", "canManageMlsFeeds"];
const CACHE_MS = 30_000;
let cached: { at: number; value: MlsSchemaStatus } | null = null;
let workerCached: { at: number; value: Awaited<ReturnType<typeof readMlsWorkerStatus>> } | null = null;

function rowsOf(result: unknown): any[] {
  if (Array.isArray(result) && Array.isArray(result[0])) return result[0] as any[];
  return Array.isArray(result) ? (result as any[]) : [];
}

export function summarize(found: { tables: number; permissionColumns: number; sources: number }, now = new Date()): MlsSchemaStatus {
  const expected = { tables: MLS_TABLE_DDL.length, permissionColumns: PERMISSION_COLUMNS.length, sources: MLS_SOURCE_SEEDS.length };
  const complete =
    found.tables >= expected.tables &&
    found.permissionColumns >= expected.permissionColumns &&
    found.sources >= expected.sources;
  return {
    status: complete ? "ok" : "incomplete",
    tables: { found: found.tables, expected: expected.tables },
    permissionColumns: { found: found.permissionColumns, expected: expected.permissionColumns },
    sources: { found: found.sources, expected: expected.sources },
    checkedAt: now.toISOString(),
  };
}

export async function readMlsSchemaStatus(): Promise<MlsSchemaStatus> {
  const db = await getDb();
  if (!db) throw new Error("database unavailable");
  const names = MLS_TABLE_DDL.map(statement => statement.table);
  const tableRows = rowsOf(await db.execute(sql`
    SELECT COUNT(*) AS count FROM information_schema.tables
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (${sql.join(names.map(name => sql`${name}`), sql`, `)})`));
  const columnRows = rowsOf(await db.execute(sql`
    SELECT COUNT(*) AS count FROM information_schema.columns
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admin_permissions'
       AND COLUMN_NAME IN (${sql.join(PERMISSION_COLUMNS.map(name => sql`${name}`), sql`, `)})`));
  const tables = Number(tableRows[0]?.count ?? 0);
  let sources = 0;
  if (names.includes("mls_sources") && tables > 0) {
    try {
      sources = Number(rowsOf(await db.execute(sql`SELECT COUNT(*) AS count FROM mls_sources`))[0]?.count ?? 0);
    } catch {
      sources = 0;
    }
  }
  return summarize({ tables, permissionColumns: Number(columnRows[0]?.count ?? 0), sources });
}

/** Public liveness only. No worker ID, feed names, MLS data, or credentials. */
export async function readMlsWorkerStatus(now = new Date()) {
  const db = await getDb();
  if (!db) throw new Error("database unavailable");
  const rows = rowsOf(await db.execute(sql`
    SELECT version, lastBeatAt FROM mls_worker_heartbeats
     ORDER BY lastBeatAt DESC LIMIT 1`));
  const beat = rows[0];
  const ageSeconds = beat ? Math.max(0, Math.floor((now.getTime() - new Date(beat.lastBeatAt).getTime()) / 1000)) : null;
  return {
    status: ageSeconds !== null && ageSeconds <= 90 ? "ok" as const : "stale" as const,
    alive: ageSeconds !== null && ageSeconds <= 90,
    version: beat?.version ?? null,
    ageSeconds,
    checkedAt: now.toISOString(),
  };
}

export function registerMlsStatusRoute(app: Express) {
  app.get("/healthz/mls", async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      if (!cached || Date.now() - cached.at > CACHE_MS) {
        cached = { at: Date.now(), value: await readMlsSchemaStatus() };
      }
      res.status(cached.value.status === "ok" ? 200 : 503).json(cached.value);
    } catch {
      res.status(503).json({ status: "unavailable", checkedAt: new Date().toISOString() });
    }
  });
  app.get("/healthz/mls/worker", async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      if (!workerCached || Date.now() - workerCached.at > CACHE_MS) {
        workerCached = { at: Date.now(), value: await readMlsWorkerStatus() };
      }
      res.status(workerCached.value.alive ? 200 : 503).json(workerCached.value);
    } catch {
      res.status(503).json({ status: "unavailable", checkedAt: new Date().toISOString() });
    }
  });
}
