import mysql from "mysql2/promise";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");

async function hasColumn(connection: mysql.Connection, table: string, column: string) {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1`,
    [table, column]
  );
  return rows.length > 0;
}

async function hasTable(connection: mysql.Connection, table: string) {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1`,
    [table]
  );
  return rows.length > 0;
}

async function main() {
  const connection = await mysql.createConnection(databaseUrl);
  const applied: string[] = [];
  try {
    if (!(await hasColumn(connection, "chat_channels", "isPermanent"))) {
      await connection.query("ALTER TABLE `chat_channels` ADD COLUMN `isPermanent` tinyint(1) NOT NULL DEFAULT 1 AFTER `type`");
      applied.push("added chat_channels.isPermanent");
    }
    await connection.query("UPDATE `chat_channels` SET `isPermanent` = 0 WHERE `type` = 'direct'");
    if (!(await hasTable(connection, "chat_channel_hides"))) {
      await connection.query(`
        CREATE TABLE \`chat_channel_hides\` (
          \`id\` int NOT NULL AUTO_INCREMENT,
          \`channelId\` int NOT NULL,
          \`userId\` int NOT NULL,
          \`hiddenAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`chat_channel_hides_unique\` (\`channelId\`, \`userId\`),
          KEY \`chat_channel_hides_user_idx\` (\`userId\`, \`channelId\`),
          CONSTRAINT \`chat_channel_hides_channel_fk\` FOREIGN KEY (\`channelId\`) REFERENCES \`chat_channels\` (\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`chat_channel_hides_user_fk\` FOREIGN KEY (\`userId\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
      `);
      applied.push("created chat_channel_hides");
    }
    console.log(`Chat workspace migration applied: ${applied.length ? applied.join("; ") : "already current"}`);
  } finally {
    await connection.end();
  }
}

main().catch(error => { console.error(error); process.exit(1); });
