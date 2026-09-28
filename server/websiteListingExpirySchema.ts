import mysql from "mysql2/promise";

/**
 * Creates the listing clock table for the 90-day expiry before the new
 * instance takes traffic, so this release needs no hand-run SQL. Additive and
 * safe to repeat: CREATE TABLE IF NOT EXISTS never touches a table that is
 * already there.
 *
 * A failure is logged, not thrown. Only the expiry check reads this table, and
 * it logs and skips its run when the table is missing, so it must never stop
 * the app from starting.
 */
export const WEBSITE_LISTING_CLOCKS_DDL = `
  CREATE TABLE IF NOT EXISTS \`website_listing_clocks\` (
    \`websitePropertyId\` int NOT NULL,
    \`liveSince\` timestamp NOT NULL,
    \`wasLive\` boolean NOT NULL DEFAULT true,
    \`expiredAt\` timestamp NULL,
    \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (\`websitePropertyId\`)
  )
`;

let readiness: Promise<void> | null = null;

async function applyWebsiteListingExpirySchema() {
  if (process.env.NODE_ENV !== "production") return;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return;
  let connection: Awaited<ReturnType<typeof mysql.createConnection>> | null = null;
  try {
    connection = await mysql.createConnection(databaseUrl);
    await connection.query(WEBSITE_LISTING_CLOCKS_DDL);
  } catch (error) {
    console.error("[websiteListingExpirySchema] could not create website_listing_clocks", error);
  } finally {
    await connection?.end().catch(() => undefined);
  }
}

export function ensureWebsiteListingExpirySchema() {
  readiness ??= applyWebsiteListingExpirySchema();
  return readiness;
}
