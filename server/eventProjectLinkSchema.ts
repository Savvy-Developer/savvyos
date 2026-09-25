import mysql from "mysql2/promise";

/**
 * Keeps the Event–Project planning link deployable when the production database
 * has not yet received its committed additive migration. This runs before the
 * new Railway instance receives traffic and is safe to repeat.
 */
let readiness: Promise<void> | null = null;

async function applyEventProjectLinkSchema() {
  if (process.env.NODE_ENV !== "production") return;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return;

  const connection = await mysql.createConnection(databaseUrl);
  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`event_project_links\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`eventId\` int NOT NULL,
        \`projectId\` int NOT NULL,
        \`createdById\` int NOT NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`event_project_links_event_unique\` (\`eventId\`),
        UNIQUE KEY \`event_project_links_project_unique\` (\`projectId\`),
        CONSTRAINT \`event_project_links_eventId_event_portfolio_id_fk\`
          FOREIGN KEY (\`eventId\`) REFERENCES \`event_portfolio\` (\`id\`) ON DELETE RESTRICT,
        CONSTRAINT \`event_project_links_projectId_pm_projects_id_fk\`
          FOREIGN KEY (\`projectId\`) REFERENCES \`pm_projects\` (\`id\`) ON DELETE RESTRICT,
        CONSTRAINT \`event_project_links_createdById_users_id_fk\`
          FOREIGN KEY (\`createdById\`) REFERENCES \`users\` (\`id\`) ON DELETE RESTRICT
      )
    `);
  } finally {
    await connection.end();
  }
}

export function ensureEventProjectLinkSchema() {
  readiness ??= applyEventProjectLinkSchema();
  return readiness;
}
