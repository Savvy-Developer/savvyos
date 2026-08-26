import mysql from "mysql2/promise";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    const [rows] = await connection.query<mysql.RowDataPacket[]>(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admin_permissions' AND COLUMN_NAME = 'canViewWebinars'",
    );
    if (rows.length === 0) {
      await connection.query(
        "ALTER TABLE `admin_permissions` ADD COLUMN `canViewWebinars` boolean NOT NULL DEFAULT true AFTER `canViewMarketingAdmin`",
      );
      console.log("Created Webinar Super Permissions column.");
    } else {
      console.log("Webinar Super Permissions column is already available.");
    }
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
