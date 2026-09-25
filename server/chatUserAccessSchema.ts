import mysql from "mysql2/promise";

/**
 * Chat access is an explicit entitlement, separate from membership in a
 * particular conversation. This lets a teammate start a direct message or
 * group chat without being added to a company channel just to unlock Chat.
 */
let readiness: Promise<void> | null = null;

async function applyChatUserAccessSchema() {
  if (process.env.NODE_ENV !== "production") return;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return;

  const connection = await mysql.createConnection(databaseUrl);
  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`chat_user_access\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`userId\` int NOT NULL,
        \`isEnabled\` tinyint(1) NOT NULL DEFAULT 1,
        \`updatedById\` int NOT NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`chat_user_access_user_unique\` (\`userId\`),
        KEY \`chat_user_access_enabled_user_idx\` (\`isEnabled\`, \`userId\`),
        CONSTRAINT \`chat_user_access_user_fk\`
          FOREIGN KEY (\`userId\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`chat_user_access_updated_by_fk\`
          FOREIGN KEY (\`updatedById\`) REFERENCES \`users\` (\`id\`) ON DELETE RESTRICT
      )
    `);
  } finally {
    await connection.end();
  }
}

export function ensureChatUserAccessSchema() {
  readiness ??= applyChatUserAccessSchema();
  return readiness;
}
