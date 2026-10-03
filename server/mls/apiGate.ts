import { createHash } from "node:crypto";
import type mysql from "mysql2/promise";
import { getMlsPool } from "./db";

/**
 * One API pace per provider token across every process.
 *
 * Each process already spaces its own requests (SlidingLimiter), but provider
 * limits are per token, not per process. During a Railway deploy the new
 * worker starts before the old one stops, and the web process can call the API
 * too (feed tests). On Oct 3, 2026 two overlapping workers each sent 2
 * requests in the same second on one MLS Grid token, and MLS Grid measured
 * 4.0 requests per second against its 2 per second limit.
 *
 * Before a request starts, the caller takes a MySQL named lock for its token
 * on the MLS database and keeps it for the token's minimum spacing. Any other
 * process waits for the lock, so request starts on one token are at least that
 * far apart no matter how many processes run. If a process dies, MySQL frees
 * its locks when the connection closes, so a crash never blocks the token.
 */
export type PaceStats = { takes: number; waitedMs: number; errors: number };

export type ApiGate = {
  /** Resolves when this process may start one request on `key`. */
  take(key: string, holdMs: number, signal?: AbortSignal): Promise<number>;
  stats(key: string): PaceStats;
};

const WAIT_SECONDS = 10;

/** MySQL lock names are limited to 64 characters. */
export function paceLockName(key: string) {
  const name = `savvyos:mls-api:${key}`;
  return name.length <= 64 ? name : `savvyos:mls-api:${createHash("sha1").update(key).digest("hex")}`;
}

export class PaceGateUnavailableError extends Error {}

export function createApiGate(getPool: () => Promise<mysql.Pool | null>): ApiGate {
  const counters = new Map<string, PaceStats>();
  let warned = false;
  const statsFor = (key: string) => {
    let stats = counters.get(key);
    if (!stats) {
      stats = { takes: 0, waitedMs: 0, errors: 0 };
      counters.set(key, stats);
    }
    return stats;
  };

  return {
    stats: key => ({ ...statsFor(key) }),

    async take(key, holdMs, signal) {
      const stats = statsFor(key);
      const pool = await getPool();
      if (!pool) {
        // No database at all means local tooling with one process; there is
        // nothing to coordinate with. Production always has the MLS database.
        if (!warned) console.warn("[mls] no MLS database; API pace is per process only");
        warned = true;
        return 0;
      }
      const name = paceLockName(key);
      const started = Date.now();
      for (;;) {
        if (signal?.aborted) throw new Error("aborted");
        let connection: mysql.PoolConnection | null = null;
        try {
          connection = await pool.getConnection();
          const [rows] = await connection.query("SELECT GET_LOCK(?, ?) AS got", [name, WAIT_SECONDS]);
          const got = Number((rows as Array<{ got: number | null }>)[0]?.got);
          if (got !== 1) {
            // 0 = another process still holds the pace (this session holds
            // nothing, so the connection can go back); NULL = server error.
            if (got !== 0) throw new Error("GET_LOCK returned NULL");
            connection.release();
            connection = null;
            continue;
          }
          const held = connection;
          connection = null;
          // Keep the lock for the spacing, then free it. The connection holding
          // a lock never returns to the pool: a pooled session must not keep it.
          setTimeout(() => {
            held
              .query("SELECT RELEASE_LOCK(?)", [name])
              .then(() => held.release())
              .catch(() => held.destroy());
          }, Math.max(1, holdMs));
          const waited = Date.now() - started;
          stats.takes += 1;
          stats.waitedMs += waited;
          return waited;
        } catch (error) {
          connection?.destroy();
          stats.errors += 1;
          // Fail closed: without the shared pace, do not call the provider.
          throw new PaceGateUnavailableError(
            `API pace lock unavailable for ${key}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    },
  };
}

export const apiGate = createApiGate(getMlsPool);
