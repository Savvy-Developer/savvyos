import fs from "node:fs/promises";
import mysql from "mysql2/promise";

if (process.env.APPLY_PULSE_WORK_ITEMS_MIGRATION !== "true") {
  throw new Error("Set APPLY_PULSE_WORK_ITEMS_MIGRATION=true to run this migration.");
}
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");

const migrationPath = "/home/ubuntu/savvyos/drizzle/0047_pulse_work_items.sql";
const connection = await mysql.createConnection({ uri: process.env.DATABASE_URL, multipleStatements: true });

try {
  const [existingItems] = await connection.query<any[]>(
    "SELECT type, status, COUNT(*) AS count FROM pulse_work_items GROUP BY type, status ORDER BY type, status",
  );
  const invalidExisting = existingItems.filter((row) => (
    (row.type === "todo" && !["open", "done", "dropped"].includes(row.status))
    || (row.type === "issue" && !["open", "discussing", "solved", "dropped"].includes(row.status))
    || (row.type === "rock" && !["on_track", "at_risk", "off_track", "done", "dropped"].includes(row.status))
  ));
  if (invalidExisting.length) {
    throw new Error(`Migration blocked: existing work-item statuses do not match the new type rule: ${JSON.stringify(invalidExisting)}`);
  }

  const migration = await fs.readFile(migrationPath, "utf8");
  await connection.query(migration);
  console.log(JSON.stringify({ applied: true, existingItems }, null, 2));
} finally {
  await connection.end();
}
