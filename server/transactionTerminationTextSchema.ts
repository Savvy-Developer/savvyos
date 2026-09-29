import mysql from "mysql2/promise";

type ColumnRow = mysql.RowDataPacket & {
  TABLE_NAME: string;
  COLUMN_NAME: string;
  DATA_TYPE: string;
};

const LARGE_TEXT_TYPES = new Set(["mediumtext", "longtext"]);

/**
 * Expands the two fields used for a termination record before Railway serves
 * traffic. The committed SQL migration is the system record; this guard makes
 * the release safe on a database that has not yet received it.
 */
async function applyTransactionTerminationTextSchema() {
  if (process.env.NODE_ENV !== "production") return;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return;

  let connection: Awaited<ReturnType<typeof mysql.createConnection>> | null =
    null;
  try {
    connection = await mysql.createConnection(databaseUrl);
    const [columns] = await connection.query<ColumnRow[]>(`
      SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND (
          (TABLE_NAME = 'transactions' AND COLUMN_NAME = 'terminationReason')
          OR (TABLE_NAME = 'transaction_notes' AND COLUMN_NAME = 'content')
        )
    `);

    const columnTypes = new Map(
      columns.map(column => [
        `${column.TABLE_NAME}.${column.COLUMN_NAME}`,
        column.DATA_TYPE.toLowerCase(),
      ])
    );

    if (
      !LARGE_TEXT_TYPES.has(
        columnTypes.get("transactions.terminationReason") ?? ""
      )
    ) {
      await connection.query(
        "ALTER TABLE `transactions` MODIFY COLUMN `terminationReason` mediumtext NULL"
      );
    }

    if (
      !LARGE_TEXT_TYPES.has(columnTypes.get("transaction_notes.content") ?? "")
    ) {
      await connection.query(
        "ALTER TABLE `transaction_notes` MODIFY COLUMN `content` mediumtext NOT NULL"
      );
    }
  } catch (error) {
    console.error(
      "[transactionTerminationTextSchema] could not expand transaction termination text storage",
      error
    );
  } finally {
    await connection?.end().catch(() => undefined);
  }
}

let readiness: Promise<void> | null = null;

export function ensureTransactionTerminationTextSchema() {
  readiness ??= applyTransactionTerminationTextSchema();
  return readiness;
}
