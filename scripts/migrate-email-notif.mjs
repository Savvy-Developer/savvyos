/**
 * Migration: create email_notification_settings table
 * Run: node scripts/migrate-email-notif.mjs
 */
import mysql from "mysql2/promise";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const conn = await mysql.createConnection(DATABASE_URL);

const sql = `
CREATE TABLE IF NOT EXISTS \`email_notification_settings\` (
  \`id\` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  \`notificationKey\` varchar(128) NOT NULL,
  \`isEnabled\` boolean NOT NULL DEFAULT true,
  \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  \`updatedBy\` int,
  CONSTRAINT \`email_notification_settings_notificationKey_unique\` UNIQUE(\`notificationKey\`),
  CONSTRAINT \`email_notification_settings_updatedBy_users_id_fk\` FOREIGN KEY (\`updatedBy\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL
)
`;

try {
  await conn.execute(sql);
  console.log("✅ email_notification_settings table created (or already exists)");
} catch (err) {
  console.error("❌ Migration failed:", err.message);
  process.exit(1);
} finally {
  await conn.end();
}
