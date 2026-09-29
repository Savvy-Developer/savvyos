import mysql from "mysql2/promise";

/**
 * Creates the link forwarding settings table before the new instance takes
 * traffic, so this release needs no hand-run SQL. Additive and safe to repeat:
 * CREATE TABLE IF NOT EXISTS never touches a table that is already there.
 *
 * A failure is logged, not thrown. Forwarding treats a missing table as "off",
 * so it must never stop the app from starting.
 */
export const WEBSITE_LINK_FORWARDING_DDL = `
  CREATE TABLE IF NOT EXISTS \`website_link_forwarding\` (
    \`id\` int NOT NULL AUTO_INCREMENT,
    \`singletonKey\` varchar(64) NOT NULL DEFAULT 'primary',
    \`enabled\` tinyint(1) NOT NULL DEFAULT 0,
    \`targetOrigin\` varchar(255) NULL,
    \`keepBasePath\` tinyint(1) NOT NULL DEFAULT 0,
    \`updatedById\` int NULL,
    \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (\`id\`),
    UNIQUE KEY \`website_link_forwarding_singletonKey_unique\` (\`singletonKey\`)
  )
`;

let readiness: Promise<void> | null = null;

async function applyWebsiteLinkForwardingSchema() {
  if (process.env.NODE_ENV !== "production") return;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return;
  let connection: Awaited<ReturnType<typeof mysql.createConnection>> | null = null;
  try {
    connection = await mysql.createConnection(databaseUrl);
    await connection.query(WEBSITE_LINK_FORWARDING_DDL);
  } catch (error) {
    console.error("[websiteLinkForwardingSchema] could not create website_link_forwarding", error);
  } finally {
    await connection?.end().catch(() => undefined);
  }
}

export function ensureWebsiteLinkForwardingSchema() {
  readiness ??= applyWebsiteLinkForwardingSchema();
  return readiness;
}
