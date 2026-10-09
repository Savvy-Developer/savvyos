import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { getDb } from "../db";

/**
 * MLS Properties data lives in its own MySQL service when MLS_DATABASE_URL is
 * set, so imports never compete with the SavvyOS app database. When it is
 * unset (local development, tests, small deployments) the MLS tables stay in
 * the app database. App tables such as users and admin_permissions are always
 * read through ../db, never through this module.
 *
 * Production never falls back silently. If MLS_DATABASE_URL goes missing
 * there, MLS reads fail closed instead of re-creating empty MLS tables in the
 * app database and re-importing millions of listings into it. A deliberate
 * single-database production setup sets MLS_ALLOW_APP_DATABASE=on.
 */
let pool: mysql.Pool | null = null;
let db: MySql2Database<Record<string, unknown>> | null = null;
let fallbackWarned = false;

/** The separate MLS database URL, or null when MLS shares the app database. */
export function separateMlsDatabaseUrl(): string | null {
  const url = process.env.MLS_DATABASE_URL?.trim();
  if (!url || url === process.env.DATABASE_URL?.trim()) return null;
  return url;
}

/** True when MLS must not use the app database (production, unless opted in). */
export function mlsAppDatabaseFallbackBlocked(): boolean {
  if (separateMlsDatabaseUrl()) return false;
  return process.env.NODE_ENV === "production" && process.env.MLS_ALLOW_APP_DATABASE !== "on";
}

function warnBlockedFallback() {
  if (fallbackWarned) return;
  fallbackWarned = true;
  console.error(
    "[mlsDb] MLS_DATABASE_URL is not set in production. MLS Properties is offline rather than writing to the app database. Set MLS_DATABASE_URL, or MLS_ALLOW_APP_DATABASE=on for a deliberate single-database setup."
  );
}

/** Where the MLS tables live. */
export function mlsDatabaseUrl(): string | undefined {
  const separate = separateMlsDatabaseUrl();
  if (separate) return separate;
  if (mlsAppDatabaseFallbackBlocked()) {
    warnBlockedFallback();
    return undefined;
  }
  return process.env.DATABASE_URL;
}

export function mlsDatabaseMode(): "separate" | "app" | "missing" {
  if (separateMlsDatabaseUrl()) return "separate";
  return mlsAppDatabaseFallbackBlocked() ? "missing" : "app";
}

export async function getMlsDb() {
  const url = separateMlsDatabaseUrl();
  if (!url) {
    if (mlsAppDatabaseFallbackBlocked()) {
      warnBlockedFallback();
      return null;
    }
    return getDb();
  }
  if (!db) {
    try {
      // A pool, like ../db: one connection would serialize every MLS query.
      const size = Number(process.env.MLS_DB_POOL_SIZE) || 24;
      pool = mysql.createPool({
        uri: url,
        connectionLimit: size,
        maxIdle: size,
        idleTimeout: 60000,
        enableKeepAlive: true,
        keepAliveInitialDelay: 10000,
      });
      db = drizzle(pool);
    } catch (error) {
      console.warn("[mlsDb] Failed to connect:", error);
      db = null;
    }
  }
  return db;
}

/**
 * The raw pool behind getMlsDb (the app pool when MLS shares the app
 * database), for session-scoped features such as named locks.
 */
export async function getMlsPool(): Promise<mysql.Pool | null> {
  const mlsDb = await getMlsDb();
  const client = (mlsDb as unknown as { $client?: mysql.Pool } | null)?.$client;
  return client && typeof client.getConnection === "function" ? client : null;
}
