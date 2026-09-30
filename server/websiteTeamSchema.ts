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
    \`section\` varchar(20) NOT NULL DEFAULT 'staff',
    \`status\` enum('draft','published','archived') NOT NULL DEFAULT 'draft',
    \`sortOrder\` int NOT NULL DEFAULT 0,
    \`updatedById\` int NULL,
    \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (\`id\`),
    KEY \`website_team_members_status_idx\` (\`status\`, \`sortOrder\`)
  )
`;

/**
 * The Team page's sections (Leadership, Savvy Staff) came after the table.
 * Added once, only when missing; existing people land in "staff".
 */
export const WEBSITE_TEAM_SECTION_COLUMN_DDL =
  "ALTER TABLE `website_team_members` ADD COLUMN `section` varchar(20) NOT NULL DEFAULT 'staff' AFTER `linkedinUrl`";

let readiness: Promise<void> | null = null;

async function applyWebsiteTeamSchema() {
  if (process.env.NODE_ENV !== "production") return;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return;
  let connection: Awaited<ReturnType<typeof mysql.createConnection>> | null = null;
  try {
    connection = await mysql.createConnection(databaseUrl);
    await connection.query(WEBSITE_TEAM_MEMBERS_DDL);
    const [columns] = await connection.query(
      `SELECT COUNT(*) AS count FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'website_team_members' AND COLUMN_NAME = 'section'`
    );
    if (Number((columns as Array<{ count: number }>)[0]?.count ?? 0) === 0) {
      await connection.query(WEBSITE_TEAM_SECTION_COLUMN_DDL);
      console.log("[websiteTeamSchema] added website_team_members.section");
    }
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
