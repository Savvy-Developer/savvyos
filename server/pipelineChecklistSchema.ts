import mysql from "mysql2/promise";

/**
 * Lets checklists attach to Pipeline connections (TR016) by widening the
 * checklist target to `pipeline_connection` and adding
 * agent_checklist_applications.agentConnectionId. The committed record is
 * drizzle/20261001_pipeline_checklists.sql.
 *
 * Runs before Railway accepts traffic. Every step checks INFORMATION_SCHEMA
 * first, so it is safe to repeat and only does what is still missing.
 *
 * Unlike the purely additive guards, a failure here is thrown, not logged:
 * existing checklist queries select every applications column, so starting
 * without agentConnectionId would break transaction and listing checklists.
 * Throwing fails the health check and Railway keeps the previous release.
 */

export const PIPELINE_TARGET = "pipeline_connection";
export const CHECKLIST_EXACT_TARGET_CHECK =
  "agent_checklist_applications_exact_target_chk";
export const CHECKLIST_CONNECTION_INDEX =
  "agent_checklist_applications_connection_idx";
export const CHECKLIST_CONNECTION_FK =
  "agent_checklist_applications_connection_fk";

export const CHECKLIST_EXACT_TARGET_CLAUSE =
  "((`transactionId` IS NOT NULL AND `listingId` IS NULL AND `agentConnectionId` IS NULL AND `targetType` = 'transaction')" +
  " OR (`transactionId` IS NULL AND `listingId` IS NOT NULL AND `agentConnectionId` IS NULL AND `targetType` = 'listing')" +
  " OR (`transactionId` IS NULL AND `listingId` IS NULL AND `agentConnectionId` IS NOT NULL AND `targetType` = 'pipeline_connection'))";

/** The target-type enum columns that gain `pipeline_connection`. */
export const PIPELINE_ENUM_COLUMNS: Array<[table: string, column: string]> = [
  ["agent_checklist_templates", "targetType"],
  ["agent_checklist_applications", "targetType"],
  ["agent_checklist_applications", "templateTargetTypeSnapshot"],
];

type ColumnInfo = {
  columnType: string;
  isNullable: boolean;
  columnDefault: string | null;
};

/**
 * The enum's values with `pipeline_connection` appended, or null when it is
 * already there. Existing values keep their order, so stored rows keep their
 * meaning.
 */
export function widenEnumColumnType(columnType: string): string | null {
  const match = /^enum\((.*)\)$/i.exec(columnType.trim());
  if (!match) throw new Error(`Expected an enum column, found ${columnType}`);
  const values = Array.from(match[1].matchAll(/'((?:[^']|'')*)'/g), part =>
    part[1].replace(/''/g, "'")
  );
  if (values.includes(PIPELINE_TARGET)) return null;
  return `enum(${[...values, PIPELINE_TARGET].map(value => `'${value.replace(/'/g, "''")}'`).join(",")})`;
}

/** MODIFY COLUMN that only widens the enum, keeping nullability and default. */
export function modifyEnumStatement(
  table: string,
  column: string,
  info: ColumnInfo
): string | null {
  const widened = widenEnumColumnType(info.columnType);
  if (!widened) return null;
  const nullability = info.isNullable ? "NULL" : "NOT NULL";
  const defaultClause =
    info.columnDefault == null
      ? ""
      : ` DEFAULT '${info.columnDefault.replace(/'/g, "''")}'`;
  return `ALTER TABLE \`${table}\` MODIFY COLUMN \`${column}\` ${widened} ${nullability}${defaultClause}`;
}

async function columnInfo(
  connection: mysql.Connection,
  table: string,
  column: string
): Promise<ColumnInfo | null> {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT COLUMN_TYPE AS columnType, IS_NULLABLE AS isNullable, COLUMN_DEFAULT AS columnDefault
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    columnType: String(row.columnType),
    isNullable: String(row.isNullable).toUpperCase() === "YES",
    columnDefault: row.columnDefault == null ? null : String(row.columnDefault),
  };
}

async function indexExists(
  connection: mysql.Connection,
  table: string,
  index: string
) {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) AS count FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [table, index]
  );
  return Number(rows[0]?.count ?? 0) > 0;
}

async function constraintExists(
  connection: mysql.Connection,
  table: string,
  name: string,
  type: "FOREIGN KEY" | "CHECK"
) {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) AS count FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? AND CONSTRAINT_TYPE = ?`,
    [table, name, type]
  );
  return Number(rows[0]?.count ?? 0) > 0;
}

async function checkClause(
  connection: mysql.Connection,
  name: string
): Promise<string | null> {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT CHECK_CLAUSE AS clause FROM INFORMATION_SCHEMA.CHECK_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = ?`,
    [name]
  );
  return rows[0]?.clause == null ? null : String(rows[0].clause);
}

let readiness: Promise<void> | null = null;

/** Every step, each guarded by an INFORMATION_SCHEMA check. Exported for tests. */
export async function migratePipelineChecklists(connection: mysql.Connection) {
  const table = "agent_checklist_applications";

  // 1. The old exact-target CHECK names only transactions and listings. Drop
  //    it before anything else so the enum and column changes can't trip it;
  //    step 5 adds the three-way version back.
  const hasCheck = await constraintExists(
    connection,
    table,
    CHECKLIST_EXACT_TARGET_CHECK,
    "CHECK"
  );
  if (hasCheck) {
    const clause = await checkClause(connection, CHECKLIST_EXACT_TARGET_CHECK);
    if (!clause || !clause.includes(PIPELINE_TARGET)) {
      await connection.query(
        `ALTER TABLE \`${table}\` DROP CHECK \`${CHECKLIST_EXACT_TARGET_CHECK}\``
      );
    }
  }

  // 2. Widen the three target-type enums, keeping their existing values.
  for (const [enumTable, column] of PIPELINE_ENUM_COLUMNS) {
    const info = await columnInfo(connection, enumTable, column);
    if (!info) throw new Error(`${enumTable}.${column} is missing`);
    const statement = modifyEnumStatement(enumTable, column, info);
    if (statement) await connection.query(statement);
  }

  // 3. The connection a pipeline checklist belongs to.
  if (!(await columnInfo(connection, table, "agentConnectionId"))) {
    await connection.query(
      `ALTER TABLE \`${table}\` ADD COLUMN \`agentConnectionId\` int NULL AFTER \`listingId\``
    );
  }

  // 4. Index and foreign key: removing a connection removes its checklists,
  //    as removing a transaction or listing already does.
  if (!(await indexExists(connection, table, CHECKLIST_CONNECTION_INDEX))) {
    await connection.query(
      `CREATE INDEX \`${CHECKLIST_CONNECTION_INDEX}\` ON \`${table}\` (\`agentConnectionId\`, \`removedAt\`, \`createdAt\`)`
    );
  }
  if (
    !(await constraintExists(
      connection,
      table,
      CHECKLIST_CONNECTION_FK,
      "FOREIGN KEY"
    ))
  ) {
    await connection.query(
      `ALTER TABLE \`${table}\` ADD CONSTRAINT \`${CHECKLIST_CONNECTION_FK}\` FOREIGN KEY (\`agentConnectionId\`) REFERENCES \`agent_connections\` (\`id\`) ON DELETE CASCADE`
    );
  }

  // 5. The exact-target CHECK again, now covering pipeline connections.
  if (
    !(await constraintExists(
      connection,
      table,
      CHECKLIST_EXACT_TARGET_CHECK,
      "CHECK"
    ))
  ) {
    await connection.query(
      `ALTER TABLE \`${table}\` ADD CONSTRAINT \`${CHECKLIST_EXACT_TARGET_CHECK}\` CHECK ${CHECKLIST_EXACT_TARGET_CLAUSE}`
    );
  }
}

async function applyPipelineChecklistSchema() {
  if (process.env.NODE_ENV !== "production") return;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return;

  const connection = await mysql.createConnection(databaseUrl);
  try {
    await migratePipelineChecklists(connection);
  } finally {
    await connection.end().catch(() => undefined);
  }
}

export function ensurePipelineChecklistSchema() {
  readiness ??= applyPipelineChecklistSchema();
  return readiness;
}
