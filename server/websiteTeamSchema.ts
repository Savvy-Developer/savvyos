import mysql from "mysql2/promise";

/**
 * Creates the Meet the Team table before the new instance takes traffic, so
 * this release needs no hand-run SQL. Additive and safe to repeat: CREATE
 * TABLE IF NOT EXISTS never touches a table that is already there.
 *
 * A failure is logged, not thrown. The table only backs the Team page and the
 * Studio's Team tab, both of which cope with it missing (the page shows no
 * people, the tab shows the error), so it must never stop the whole app from
 * starting.
 */
export const WEBSITE_TEAM_MEMBERS_DDL = `
  CREATE TABLE IF NOT EXISTS \`website_team_members\` (
    \`id\` int NOT NULL AUTO_INCREMENT,
    \`name\` varchar(160) NOT NULL,
    \`title\` varchar(160) NULL,
    \`bio\` text NULL,
    \`imageUrl\` text NULL,
    \`email\` varchar(320) NULL,
    \`linkedinUrl\` varchar(512) NULL,
    \`status\` enum('draft','published','archived') NOT NULL DEFAULT 'draft',
    \`sortOrder\` int NOT NULL DEFAULT 0,
    \`updatedById\` int NULL,
    \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (\`id\`),
    KEY \`website_team_members_status_idx\` (\`status\`, \`sortOrder\`)
  )
`;

let readiness: Promise<void> | null = null;

async function applyWebsiteTeamSchema() {
  if (process.env.NODE_ENV !== "production") return;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return;
  let connection: Awaited<ReturnType<typeof mysql.createConnection>> | null = null;
  try {
    connection = await mysql.createConnection(databaseUrl);
    await connection.query(WEBSITE_TEAM_MEMBERS_DDL);
  } catch (error) {
    console.error("[websiteTeamSchema] could not create website_team_members", error);
  } finally {
    await connection?.end().catch(() => undefined);
  }
}

export function ensureWebsiteTeamSchema() {
  readiness ??= applyWebsiteTeamSchema();
  return readiness;
}
