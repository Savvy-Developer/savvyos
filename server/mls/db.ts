import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { getDb } from "../db";

/**
 * MLS Properties data lives in its own MySQL service when MLS_DATABASE_URL is
 * set, so imports never compete with the SavvyOS app database. When it is
 * unset (local development, tests, small deployments) the MLS tables stay in
 * the app database. App tables such as users and admin_permissions are always
 * read through ../db, never through this module.
 */
let pool: mysql.Pool | null = null;
let db: MySql2Database<Record<string, unknown>> | null = null;

/** The separate MLS database URL, or null when MLS shares the app database. */
export function separateMlsDatabaseUrl(): string | null {
  const url = process.env.MLS_DATABASE_URL?.trim();
  if (!url || url === process.env.DATABASE_URL?.trim()) return null;
  return url;
}

/** Where the MLS tables live. */
export function mlsDatabaseUrl(): string | undefined {
  return separateMlsDatabaseUrl() ?? process.env.DATABASE_URL;
}

export function mlsDatabaseMode(): "separate" | "app" {
  return separateMlsDatabaseUrl() ? "separate" : "app";
}

export async function getMlsDb() {
  const url = separateMlsDatabaseUrl();
  if (!url) return getDb();
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
