import mysql from "mysql2/promise";

/**
 * Repairs the onboarding lifecycle schema before Railway accepts traffic.
 *
 * The lifecycle release selects these fields from every onboarding instance.
 * Railway deploys do not run Drizzle migrations, so this guard prevents a
 * partial deployment from making active onboarding records appear to vanish.
 */

type ColumnInfo = {
  columnType: string;
  isNullable: boolean;
  columnDefault: string | null;
};

type LifecycleColumn = {
  name: string;
  definition: string;
  after: string;
};

const REQUIRED_STATUS_VALUES = ["graduated", "terminated"] as const;

const LIFECYCLE_COLUMNS: LifecycleColumn[] = [
  {
    name: "startedByUserId",
    definition: "int NULL",
    after: "startedAt",
  },
  {
    name: "graduatedAt",
    definition: "timestamp NULL",
    after: "completedAt",
  },
  {
    name: "graduatedByUserId",
    definition: "int NULL",
    after: "graduatedAt",
  },
  {
    name: "terminatedAt",
    definition: "timestamp NULL",
    after: "graduatedByUserId",
  },
  {
    name: "terminatedByUserId",
    definition: "int NULL",
    after: "terminatedAt",
  },
  {
    name: "terminationReason",
    definition: "text NULL",
    after: "terminatedByUserId",
  },
  {
    name: "completionDurationMinutes",
    definition: "int NULL",
    after: "terminationReason",
  },
];

function enumValues(columnType: string): string[] {
  const match = /^enum\((.*)\)$/i.exec(columnType.trim());
  if (!match) {
    throw new Error(
      `Expected onboarding_instances.status to be an enum, found ${columnType}`
    );
  }
  return Array.from(match[1].matchAll(/'((?:[^']|'')*)'/g), part =>
    part[1].replace(/''/g, "'")
  );
}

function statusColumnDefinition(values: string[], info: ColumnInfo): string {
  const enumType = `enum(${values
    .map(value => `'${value.replace(/'/g, "''")}'`)
    .join(",")})`;
  const nullability = info.isNullable ? "NULL" : "NOT NULL";
  const defaultClause =
    info.columnDefault == null
      ? ""
      : ` DEFAULT '${info.columnDefault.replace(/'/g, "''")}'`;
  return `${enumType} ${nullability}${defaultClause}`;
}

/** Expands the legacy status enum without changing existing stored values. */
export function widenOnboardingStatusStatement(
  info: ColumnInfo
): string | null {
  const existing = enumValues(info.columnType);
  const widened = [...existing];
  for (const status of REQUIRED_STATUS_VALUES) {
    if (!widened.includes(status)) widened.push(status);
  }
  if (widened.length === existing.length) return null;
  return `ALTER TABLE \`onboarding_instances\` MODIFY COLUMN \`status\` ${statusColumnDefinition(widened, info)}`;
}

/** Removes the retired completed value after all legacy records are backfilled. */
export function normalizeOnboardingStatusStatement(
  info: ColumnInfo
): string | null {
  const existing = enumValues(info.columnType);
  if (!existing.includes("completed")) return null;
  const normalized = existing.filter(status => status !== "completed");
  return `ALTER TABLE \`onboarding_instances\` MODIFY COLUMN \`status\` ${statusColumnDefinition(normalized, info)}`;
}

async function columnInfo(
  connection: mysql.Connection,
  tableName: string,
  columnName: string
): Promise<ColumnInfo | null> {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT COLUMN_TYPE AS columnType,
            IS_NULLABLE AS isNullable,
            COLUMN_DEFAULT AS columnDefault
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?`,
    [tableName, columnName]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    columnType: String(row.columnType),
    isNullable: String(row.isNullable).toUpperCase() === "YES",
    columnDefault: row.columnDefault == null ? null : String(row.columnDefault),
  };
}

/** Exported for direct verification without production credentials. */
export async function migrateOnboardingLifecycleSchema(
  connection: mysql.Connection
) {
  const initialStatus = await columnInfo(
    connection,
    "onboarding_instances",
    "status"
  );
  if (!initialStatus) {
    throw new Error("onboarding_instances.status is missing");
  }

  const needsCompletedBackfill = enumValues(initialStatus.columnType).includes(
    "completed"
  );
  const widenStatus = widenOnboardingStatusStatement(initialStatus);
  if (widenStatus) await connection.query(widenStatus);

  for (const column of LIFECYCLE_COLUMNS) {
    if (!(await columnInfo(connection, "onboarding_instances", column.name))) {
      await connection.query(
        `ALTER TABLE \`onboarding_instances\` ADD COLUMN \`${column.name}\` ${column.definition} AFTER \`${column.after}\``
      );
    }
  }

  // Historical completions now become graduation history. Active records remain
  // in_progress and are never changed by this repair.
  if (needsCompletedBackfill) {
    await connection.query(`
      UPDATE \`onboarding_instances\`
         SET \`status\` = 'graduated',
             \`graduatedAt\` = COALESCE(\`graduatedAt\`, \`completedAt\`),
             \`completionDurationMinutes\` = CASE
               WHEN \`completionDurationMinutes\` IS NULL AND \`completedAt\` IS NOT NULL
                 THEN GREATEST(0, TIMESTAMPDIFF(MINUTE, \`startedAt\`, \`completedAt\`))
               ELSE \`completionDurationMinutes\`
             END
       WHERE \`status\` = 'completed'
    `);
  }

  const finalStatus = await columnInfo(
    connection,
    "onboarding_instances",
    "status"
  );
  if (!finalStatus) {
    throw new Error(
      "onboarding_instances.status is missing after lifecycle repair"
    );
  }
  const normalizeStatus = normalizeOnboardingStatusStatement(finalStatus);
  if (normalizeStatus) await connection.query(normalizeStatus);
}

async function applyOnboardingLifecycleSchema() {
  if (process.env.NODE_ENV !== "production") return;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return;

  const connection = await mysql.createConnection(databaseUrl);
  try {
    await migrateOnboardingLifecycleSchema(connection);
  } finally {
    await connection.end().catch(() => undefined);
  }
}

let readiness: Promise<void> | null = null;

export function ensureOnboardingLifecycleSchema() {
  readiness ??= applyOnboardingLifecycleSchema();
  return readiness;
}
