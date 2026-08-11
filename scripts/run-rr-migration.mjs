import fs from "node:fs/promises";
import mysql from "mysql2/promise";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");

const sql = await fs.readFile(new URL("../drizzle/0014_roles_responsibilities.sql", import.meta.url), "utf8");
const statements = sql
  .split(/;\s*(?:\r?\n|$)/)
  .map((statement) => statement.replace(/^\s*--.*$/gm, "").trim())
  .filter(Boolean);

const connection = await mysql.createConnection(databaseUrl);
try {
  for (const [index, statement] of statements.entries()) {
    const label = statement.match(/(?:CREATE TABLE IF NOT EXISTS|ALTER TABLE)\s+`?([\w_]+)`?/i)?.[1] ?? `statement ${index + 1}`;
    if (/ALTER TABLE\s+`?admin_permissions`?/i.test(statement)) {
      const [existingColumns] = await connection.query(
        "SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'admin_permissions' AND column_name = 'canViewRolesResponsibilities'"
      );
      if (existingColumns.length > 0) {
        console.log(`Skipped ${index + 1}/${statements.length}: ${label} permission column already exists`);
        continue;
      }
    }
    await connection.query(statement);
    console.log(`Applied ${index + 1}/${statements.length}: ${label}`);
  }

  const [tables] = await connection.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('roles_responsibilities','rr_sops','rr_sop_steps','rr_resources','rr_task_links','rr_scorecard_metrics','rr_metric_values','rr_metric_auto_configs') ORDER BY table_name"
  );
  const [columns] = await connection.query(
    "SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'admin_permissions' AND column_name = 'canViewRolesResponsibilities'"
  );
  console.log(`Verified ${tables.length} R&R tables and ${columns.length} permission column.`);
} finally {
  await connection.end();
}
