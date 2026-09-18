import mysql from "mysql2/promise";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

async function main() {
  const connection = await mysql.createConnection(databaseUrl!);
  console.log("Connected to database for mobile devices migration...");

  try {
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS \`mobile_devices\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`userId\` int NOT NULL,
        \`deviceToken\` varchar(255) NOT NULL,
        \`platform\` enum('ios','android') NOT NULL,
        \`appVersion\` varchar(32),
        \`deviceModel\` varchar(128),
        \`osVersion\` varchar(32),
        \`isActive\` boolean NOT NULL DEFAULT true,
        \`lastSeenAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT \`mobile_devices_id\` PRIMARY KEY(\`id\`),
        CONSTRAINT \`mobile_devices_token_unique\` UNIQUE(\`deviceToken\`),
        CONSTRAINT \`mobile_devices_user_fk\` FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log("Ensured mobile_devices table exists.");

    try {
      await connection.execute(`
        CREATE INDEX \`mobile_devices_user_active_idx\` ON \`mobile_devices\` (\`userId\`, \`isActive\`);
      `);
      console.log("Created mobile_devices_user_active_idx index.");
    } catch (e: any) {
      if (e.code === "ER_DUP_KEYNAME") {
        console.log("Index already exists.");
      } else {
        console.warn("Index warning:", e.message);
      }
    }

    console.log("Mobile devices migration completed successfully!");
  } finally {
    await connection.end();
  }
}

main().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
