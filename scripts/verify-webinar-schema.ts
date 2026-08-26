import mysql from "mysql2/promise";

const expectedTables = [
  "webinar_marketing_templates",
  "webinar_marketing_template_tasks",
  "webinars",
  "webinar_task_links",
  "webinar_attendees",
  "zoom_webhook_events",
];

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    const [rows] = await connection.query<(mysql.RowDataPacket & { TABLE_NAME: string })[]>(
      "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (?) ORDER BY TABLE_NAME",
      [expectedTables],
    );
    const found = rows.map((row) => row.TABLE_NAME).sort();
    const missing = expectedTables.filter((table) => !found.includes(table));
    if (missing.length) throw new Error(`Missing Webinar tables: ${missing.join(", ")}`);
    console.log(`Verified Webinar tables: ${found.join(", ")}`);
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
