/**
 * Cross-process API pace (apiGate.ts) against real MySQL. Opt-in like the
 * other MLS e2e files:
 * MLS_E2E_DATABASE_URL=mysql://root@127.0.0.1:3307/savvyos_mls_e2e
 *
 * Two pools stand in for two processes (for example the old and new worker
 * during a Railway deploy). Named locks are per connection, so separate pools
 * behave exactly like separate processes.
 */
import mysql from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApiGate, paceLockName } from "./apiGate";

const BASE = process.env.MLS_E2E_DATABASE_URL;

describe.skipIf(!BASE)("cross-process API pace", () => {
  let oldWorker: mysql.Pool;
  let newWorker: mysql.Pool;

  beforeAll(() => {
    const url = new URL(BASE!);
    if (!["127.0.0.1", "localhost"].includes(url.hostname)) throw new Error("Pace test is restricted to localhost");
    oldWorker = mysql.createPool({ uri: BASE!, connectionLimit: 4 });
    newWorker = mysql.createPool({ uri: BASE!, connectionLimit: 4 });
  });

  afterAll(async () => {
    await oldWorker?.end();
    await newWorker?.end();
  });

  it("keeps request starts on one token at least the spacing apart across two processes", async () => {
    const a = createApiGate(async () => oldWorker);
    const b = createApiGate(async () => newWorker);
    const key = `mls_grid:PACE_${Date.now()}`;
    const holdMs = 250;
    const starts: number[] = [];
    const run = async (gate: typeof a, n: number) => {
      for (let i = 0; i < n; i++) {
        await gate.take(key, holdMs);
        starts.push(Date.now());
      }
    };
    // Each "process" tries to fire as fast as it can, at the same time.
    await Promise.all([run(a, 4), run(b, 4)]);
    starts.sort((x, y) => x - y);
    expect(starts).toHaveLength(8);
    const gaps = starts.slice(1).map((at, i) => at - starts[i]);
    // Timers can fire a few ms early; nothing may come close to two at once.
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(holdMs - 15);
    // No more than one start in any single spacing window.
    for (let i = 0; i < starts.length; i++) {
      expect(starts.filter(at => at >= starts[i] && at < starts[i] + holdMs - 15)).toHaveLength(1);
    }
    expect(a.stats(key).takes + b.stats(key).takes).toBe(8);
    // Different tokens do not wait on each other.
    const other = Date.now();
    await a.take(`mls_grid:OTHER_${Date.now()}`, 5_000);
    expect(Date.now() - other).toBeLessThan(200);
  });

  it("frees the pace when a process dies while holding it", async () => {
    const key = `mls_grid:CRASH_${Date.now()}`;
    const crashed = await mysql.createConnection(BASE!);
    const [rows] = await crashed.query("SELECT GET_LOCK(?, 0) AS got", [paceLockName(key)]);
    expect(Number((rows as Array<{ got: number }>)[0].got)).toBe(1);
    const survivor = createApiGate(async () => newWorker);
    const waiting = survivor.take(key, 50);
    await new Promise(resolve => setTimeout(resolve, 300));
    crashed.destroy(); // like a container killed mid-hold
    const started = Date.now();
    await waiting;
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it("never returns a connection that still holds the pace to the pool", async () => {
    const pool = mysql.createPool({ uri: BASE!, connectionLimit: 1 });
    try {
      const gate = createApiGate(async () => pool);
      const key = `mls_grid:POOL_${Date.now()}`;
      await gate.take(key, 100);
      await new Promise(resolve => setTimeout(resolve, 250));
      // The only connection is back and holds nothing: another session can lock at once.
      const [mine] = await pool.query("SELECT IS_USED_LOCK(?) AS holder", [paceLockName(key)]);
      expect((mine as Array<{ holder: number | null }>)[0].holder).toBeNull();
    } finally {
      await pool.end();
    }
  });

  it("uses a short stable lock name for long credential keys", () => {
    expect(paceLockName("mls_grid:MLSGRID_BBO")).toBe("savvyos:mls-api:mls_grid:MLSGRID_BBO");
    const long = paceLockName(`trestle:${"X".repeat(80)}`);
    expect(long.length).toBeLessThanOrEqual(64);
    expect(long).toBe(paceLockName(`trestle:${"X".repeat(80)}`));
  });
});
