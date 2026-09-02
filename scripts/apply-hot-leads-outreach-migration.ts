import fs from "node:fs/promises";
import path from "node:path";
import mysql from "mysql2/promise";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");

  const migrationPath = path.resolve(
    process.cwd(),
    "drizzle/0129_hot_leads_outreach_and_thread_completion.sql"
  );
  const sql = await fs.readFile(migrationPath, "utf8");
  const connection = await mysql.createConnection(databaseUrl);
  try {
    const statements = sql
      .split(/;\s*(?:\r?\n|$)/g)
      .map(statement => statement.replace(/^\s*--.*$/gm, "").trim())
      .filter(Boolean);
    for (const statement of statements) await connection.query(statement);
    console.log(
      `Applied ${statements.length} Hot Leads outreach schema statements.`
    );
  } finally {
    await connection.end();
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
