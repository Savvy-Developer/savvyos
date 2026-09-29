import mysql from "mysql2/promise";

/**
 * One-time fix: seven single-state markets carry the placeholder state "N/A",
 * so the public Markets page lists them under "Other" instead of their state.
 *
 * Done at startup rather than from the Agent Markets page on purpose: saving a
 * market there re-runs its AI market profile, and a changed profile emails
 * every agent assigned to that market. This only sets the state column.
 *
 * Each row changes only while its id, name and state are exactly what was
 * read live on 29 Sep 2026, so it runs once and never overrules a later edit.
 * Truly multi-state markets keep "N/A" (the public page still treats "N/A" as
 * no state). Production only; logged, never thrown.
 */
export const MARKET_STATE_FIXES = [
  { id: 180011, name: "Columbus, OH", state: "OH" },
  { id: 180002, name: "Northwest Arkansas", state: "AR" },
  { id: 180018, name: "Outer Banks, North Carolina", state: "NC" },
  { id: 180016, name: "Phoenix, Arizona", state: "AZ" },
  { id: 180009, name: "Pompano Beach - Fort Lauderdale", state: "FL" },
  { id: 180017, name: "Raleigh", state: "NC" },
  { id: 180019, name: "Western North Carolina", state: "NC" },
] as const;

let readiness: Promise<void> | null = null;

async function applyMarketStateFix() {
  if (process.env.NODE_ENV !== "production") return;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return;
  let connection: Awaited<ReturnType<typeof mysql.createConnection>> | null = null;
  try {
    connection = await mysql.createConnection(databaseUrl);
    for (const fix of MARKET_STATE_FIXES) {
      const [result] = await connection.query(
        "UPDATE market_profiles SET state = ? WHERE id = ? AND name = ? AND state = 'N/A'",
        [fix.state, fix.id, fix.name]
      );
      if (Number((result as { affectedRows?: number }).affectedRows) > 0) {
        console.log(`[MarketStateFix] ${fix.name}: state set to ${fix.state}.`);
      }
    }
  } catch (error) {
    console.error("[MarketStateFix] Could not set market states.", error);
  } finally {
    await connection?.end().catch(() => undefined);
  }
}

export function ensureMarketStateFix() {
  readiness ??= applyMarketStateFix();
  return readiness;
}
