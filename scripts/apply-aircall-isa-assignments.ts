import mysql from "mysql2/promise";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const connection = await mysql.createConnection(databaseUrl);
try {
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS \`aircall_isa_assignments\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`savvyUserId\` int NOT NULL,
      \`aircallUserId\` int NOT NULL,
      \`aircallNumberId\` int NOT NULL,
      \`aircallNumberName\` varchar(255) NULL,
      \`aircallNumberDigits\` varchar(32) NULL,
      \`verifiedAt\` timestamp NULL,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT \`aircall_isa_assignments_id\` PRIMARY KEY(\`id\`),
      CONSTRAINT \`aircall_isa_assignments_savvy_user_unique\` UNIQUE(\`savvyUserId\`),
      CONSTRAINT \`aircall_isa_assignments_aircall_user_unique\` UNIQUE(\`aircallUserId\`),
      CONSTRAINT \`aircall_isa_assignments_aircall_number_unique\` UNIQUE(\`aircallNumberId\`),
      CONSTRAINT \`aircall_isa_assignments_savvy_user_fk\` FOREIGN KEY (\`savvyUserId\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE
    )
  `);
  console.log("aircall_isa_assignments is ready");
} finally {
  await connection.end();
}
