import mysql from "mysql2/promise";

type CountRow = mysql.RowDataPacket & { count: number };

const PERMISSION_COLUMN = "canAddMissingTerminationReason";

/**
 * The transactions permission matrix is read on every admin request. Ensure the
 * new, default-off legacy-termination capability exists before Railway serves a
 * release whose Drizzle schema selects it.
 */
async function applyTransactionTerminationBackfillSchema() {
  if (process.env.NODE_ENV !== "production") return;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return;

  let connection: Awaited<ReturnType<typeof mysql.createConnection>> | null =
    null;
  try {
    connection = await mysql.createConnection(databaseUrl);
    const [rows] = await connection.query<CountRow[]>(
      `SELECT COUNT(*) AS count
       FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name = 'admin_permissions'
         AND column_name = ?`,
      [PERMISSION_COLUMN]
    );
    if (Number(rows[0]?.count ?? 0) === 0) {
      await connection.query(
        "ALTER TABLE `admin_permissions` ADD COLUMN `canAddMissingTerminationReason` boolean NOT NULL DEFAULT false AFTER `canEditTransactionLeadSource`"
      );
    }
  } catch (error) {
    console.error(
      "[transactionTerminationBackfillSchema] could not add the missing termination reason permission",
      error
    );
  } finally {
    await connection?.end().catch(() => undefined);
  }
}

let readiness: Promise<void> | null = null;

export function ensureTransactionTerminationBackfillSchema() {
  readiness ??= applyTransactionTerminationBackfillSchema();
  return readiness;
}
