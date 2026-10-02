import mysql from "mysql2/promise";

export const CONTRACT_LABOR_EMPLOYMENT_TYPE = "contract_labor";

type EmploymentTypeColumn = mysql.RowDataPacket & {
  columnType: string;
};

/**
 * Widens the nullable users.employmentType enum before the release accepts
 * traffic. The committed SQL migration remains the system record; this guard
 * ensures the UI cannot offer Contract Labor against an older database.
 */
async function applyUserEmploymentTypeSchema() {
  if (process.env.NODE_ENV !== "production") return;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return;

  let connection: Awaited<ReturnType<typeof mysql.createConnection>> | null =
    null;
  try {
    connection = await mysql.createConnection(databaseUrl);
    const [columns] = await connection.query<EmploymentTypeColumn[]>(
      `SELECT COLUMN_TYPE AS columnType
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'users'
         AND COLUMN_NAME = 'employmentType'`
    );
    const columnType = columns[0]?.columnType ?? "";
    if (columnType.includes(`'${CONTRACT_LABOR_EMPLOYMENT_TYPE}'`)) return;

    await connection.query(
      "ALTER TABLE `users` MODIFY COLUMN `employmentType` enum('w2', '1099', 'contract_labor') NULL"
    );
  } finally {
    await connection?.end().catch(() => undefined);
  }
}

let readiness: Promise<void> | null = null;

export function ensureUserEmploymentTypeSchema() {
  readiness ??= applyUserEmploymentTypeSchema();
  return readiness;
}
