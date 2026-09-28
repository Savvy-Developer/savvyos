import mysql from "mysql2/promise";

/**
 * Creates the sold sweep log before the new instance takes traffic, so this
 * release needs no hand-run SQL. Additive and safe to repeat: CREATE TABLE IF
 * NOT EXISTS never touches a table that is already there.
 *
 * A failure is logged, not thrown. Only the sold sweep reads this table, and
 * the sweep logs and skips its run when the table is missing, so it must never
 * stop the app from starting.
 */
export const WEBSITE_SOLD_SWEEPS_DDL = `
  CREATE TABLE IF NOT EXISTS \`website_sold_sweeps\` (
    \`id\` int NOT NULL AUTO_INCREMENT,
    \`saleKey\` varchar(64) NOT NULL,
    \`propertyId\` int NULL,
    \`websitePropertyId\` int NULL,
    \`action\` enum('baseline','unpublished') NOT NULL,
    \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (\`id\`),
    UNIQUE KEY \`website_sold_sweeps_saleKey_uq\` (\`saleKey\`)
  )
`;

let readiness: Promise<void> | null = null;

async function applyWebsiteSoldSweepSchema() {
  if (process.env.NODE_ENV !== "production") return;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return;
  let connection: Awaited<ReturnType<typeof mysql.createConnection>> | null = null;
  try {
    connection = await mysql.createConnection(databaseUrl);
    await connection.query(WEBSITE_SOLD_SWEEPS_DDL);
  } catch (error) {
    console.error("[websiteSoldSweepSchema] could not create website_sold_sweeps", error);
  } finally {
    await connection?.end().catch(() => undefined);
  }
}

export function ensureWebsiteSoldSweepSchema() {
  readiness ??= applyWebsiteSoldSweepSchema();
  return readiness;
}
