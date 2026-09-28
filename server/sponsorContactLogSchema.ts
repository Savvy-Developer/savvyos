import mysql from "mysql2/promise";

/**
 * Creates the sponsor relationship-history table before a newly deployed
 * Events workspace can accept traffic. The committed migration is canonical;
 * this guard is idempotent for Railway's first application boot.
 */
let readiness: Promise<void> | null = null;

async function applySponsorContactLogSchema() {
  if (process.env.NODE_ENV !== "production") return;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return;

  const connection = await mysql.createConnection(databaseUrl);
  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`event_sponsor_contact_logs\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`sponsorId\` int NOT NULL,
        \`contactType\` enum('call','email','text','meeting','note') NOT NULL,
        \`body\` text NOT NULL,
        \`occurredAt\` timestamp NOT NULL,
        \`createdById\` int NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`event_sponsor_contact_logs_sponsor_occurred_idx\` (\`sponsorId\`,\`occurredAt\`),
        CONSTRAINT \`event_sponsor_contact_logs_sponsor_fk\`
          FOREIGN KEY (\`sponsorId\`) REFERENCES \`event_sponsors\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`event_sponsor_contact_logs_created_by_fk\`
          FOREIGN KEY (\`createdById\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL
      )
    `);
  } finally {
    await connection.end();
  }
}

export function ensureSponsorContactLogSchema() {
  readiness ??= applySponsorContactLogSchema();
  return readiness;
}
