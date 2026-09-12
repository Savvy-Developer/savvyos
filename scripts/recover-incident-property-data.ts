import { writeFile } from "node:fs/promises";
import mysql from "mysql2/promise";

const liveUrl = process.env.DATABASE_URL;
const baselineUrl = process.env.BASELINE_DATABASE_URL;
const planPath = process.env.PLAN_PATH ?? "/tmp/incident-property-recovery-plan.json";
const resultPath = process.env.RESULT_PATH ?? "/tmp/incident-property-recovery-result.json";
const execute = process.argv.includes("--execute");

if (!liveUrl) throw new Error("DATABASE_URL is required.");
if (!baselineUrl) throw new Error("BASELINE_DATABASE_URL is required.");
if (!execute) throw new Error("Refusing to mutate data without --execute.");

type Row = Record<string, unknown>;
type RelationSpec = { table: string; primaryKey: string; column: string; where?: string; restoreMissing?: boolean };

const relations: RelationSpec[] = [
  { table: "communications", primaryKey: "id", column: "relatedPropertyId" },
  { table: "documents", primaryKey: "id", column: "relatedPropertyId" },
  { table: "listings", primaryKey: "id", column: "propertyId" },
  { table: "proformas", primaryKey: "id", column: "propertyId" },
  { table: "property_ownership", primaryKey: "id", column: "propertyId" },
  { table: "referrals", primaryKey: "id", column: "propertyId" },
  { table: "tasks", primaryKey: "id", column: "relatedPropertyId" },
  // Transactions are never re-created by this recovery. The duplicate merge only rewrote the property link.
  { table: "transactions", primaryKey: "id", column: "propertyId" },
  { table: "activity_log", primaryKey: "id", column: "entityId", where: "entityType = 'property'" },
  // Duplicate consolidation deleted collided links. Restore the original baseline rows exactly.
  { table: "contact_properties", primaryKey: "id", column: "propertyId", restoreMissing: true },
];

const propertyColumns = [
  "id", "address", "city", "state", "zip", "normalizedAddress", "beds", "baths", "sqft", "propertyType",
  "yearBuilt", "listPrice", "strZoning", "strNotes", "notes", "addedByUserId", "createdAt", "updatedAt",
];

function comparable(value: unknown): string {
  if (value === null || value === undefined) return "<null>";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function placeholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(", ");
}

async function readRows(connection: mysql.Connection, table: string, where = ""): Promise<Row[]> {
  const [rows] = await connection.query<Row[]>(`SELECT * FROM \`${table}\`${where ? ` WHERE ${where}` : ""}`);
  return rows;
}

async function tableColumns(connection: mysql.Connection, table: string): Promise<string[]> {
  const [rows] = await connection.query<Array<{ COLUMN_NAME: string }>>(
    "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION",
    [table],
  );
  return rows.map(row => row.COLUMN_NAME);
}

async function dropUnsafeUniqueIndex(connection: mysql.Connection): Promise<boolean> {
  const [indexes] = await connection.query<Array<{ Key_name: string }>>(
    "SHOW INDEX FROM properties WHERE Key_name = 'properties_normalizedAddress_unique'",
  );
  if (!indexes.length) return false;
  await connection.query("ALTER TABLE properties DROP INDEX properties_normalizedAddress_unique");
  return true;
}

async function main() {
  const plan = JSON.parse(await (await import("node:fs/promises")).readFile(planPath, "utf8"));
  const live = await mysql.createConnection(liveUrl!);
  const baseline = await mysql.createConnection(baselineUrl!);
  const result: Record<string, unknown> = {
    startedAt: new Date().toISOString(),
    planPath,
    baselinePropertyCount: plan.baseline?.propertyCount,
    livePropertyCountBefore: plan.live?.propertyCount,
    propertiesInserted: 0,
    propertiesRestored: 0,
    references: {},
    skippedMissingTransactionRows: [],
  };
  let transactionOpen = false;

  try {
    // The September 8 source contains valid historical duplicate identities. A unique index created by
    // the faulty duplicate job would prevent an exact restoration, so it is removed before the transaction.
    result.droppedUnsafeNormalizedAddressUniqueIndex = await dropUnsafeUniqueIndex(live);

    const baselineProperties = await readRows(baseline, "properties");
    const liveProperties = await readRows(live, "properties");
    const currentProperties = new Map(liveProperties.map(row => [Number(row.id), row]));

    await live.beginTransaction();
    transactionOpen = true;

    for (const baselineProperty of baselineProperties) {
      const id = Number(baselineProperty.id);
      const current = currentProperties.get(id);
      if (!current) {
        await live.execute(
          `INSERT INTO properties (${propertyColumns.map(column => `\`${column}\``).join(", ")}) VALUES (${placeholders(propertyColumns.length)})`,
          propertyColumns.map(column => baselineProperty[column] ?? null),
        );
        result.propertiesInserted = Number(result.propertiesInserted) + 1;
        continue;
      }
      const changed = propertyColumns.slice(1).some(column => comparable(current[column]) !== comparable(baselineProperty[column]));
      if (!changed) continue;
      const updateColumns = propertyColumns.slice(1);
      await live.execute(
        `UPDATE properties SET ${updateColumns.map(column => `\`${column}\` = ?`).join(", ")} WHERE id = ?`,
        [...updateColumns.map(column => baselineProperty[column] ?? null), id],
      );
      result.propertiesRestored = Number(result.propertiesRestored) + 1;
    }

    for (const relation of relations) {
      const baselineRows = await readRows(baseline, relation.table, relation.where);
      const liveRows = await readRows(live, relation.table, relation.where);
      const liveById = new Map(liveRows.map(row => [Number(row[relation.primaryKey]), row]));
      const columns = relation.restoreMissing ? await tableColumns(baseline, relation.table) : [];
      let referencesRestored = 0;
      let rowsInserted = 0;
      const skippedMissingRows: number[] = [];

      for (const baselineRow of baselineRows) {
        const id = Number(baselineRow[relation.primaryKey]);
        const current = liveById.get(id);
        if (!current) {
          if (relation.restoreMissing) {
            await live.execute(
              `INSERT INTO \`${relation.table}\` (${columns.map(column => `\`${column}\``).join(", ")}) VALUES (${placeholders(columns.length)})`,
              columns.map(column => baselineRow[column] ?? null),
            );
            rowsInserted += 1;
          } else if (relation.table === "transactions") {
            skippedMissingRows.push(id);
          }
          continue;
        }
        if (comparable(current[relation.column]) === comparable(baselineRow[relation.column])) continue;
        await live.execute(
          `UPDATE \`${relation.table}\` SET \`${relation.column}\` = ? WHERE \`${relation.primaryKey}\` = ?`,
          [baselineRow[relation.column] ?? null, id],
        );
        referencesRestored += 1;
      }
      (result.references as Record<string, unknown>)[relation.table] = { referencesRestored, rowsInserted, skippedMissingRows };
      if (relation.table === "transactions") result.skippedMissingTransactionRows = skippedMissingRows;
    }

    // Verify every pre-incident property, relationship, and recoverable contact-property row matches baseline.
    const currentPropertiesAfter = new Map((await readRows(live, "properties")).map(row => [Number(row.id), row]));
    const mismatchedProperties: number[] = [];
    for (const baselineProperty of baselineProperties) {
      const current = currentPropertiesAfter.get(Number(baselineProperty.id));
      if (!current || propertyColumns.some(column => comparable(current[column]) !== comparable(baselineProperty[column]))) {
        mismatchedProperties.push(Number(baselineProperty.id));
      }
    }
    if (mismatchedProperties.length) throw new Error(`Property verification failed for ${mismatchedProperties.length} baseline records: ${mismatchedProperties.slice(0, 20).join(", ")}`);

    for (const relation of relations) {
      const baselineRows = await readRows(baseline, relation.table, relation.where);
      const currentRows = await readRows(live, relation.table, relation.where);
      const currentById = new Map(currentRows.map(row => [Number(row[relation.primaryKey]), row]));
      const mismatched = baselineRows.filter(row => {
        const current = currentById.get(Number(row[relation.primaryKey]));
        if (!current) return relation.restoreMissing;
        return comparable(current[relation.column]) !== comparable(row[relation.column]);
      });
      if (mismatched.length) throw new Error(`${relation.table} verification failed for ${mismatched.length} baseline rows.`);
    }

    const [baselinePropertyCountRows] = await baseline.query<Array<{ count: number }>>("SELECT COUNT(*) AS count FROM properties");
    const [livePropertyCountRows] = await live.query<Array<{ count: number }>>("SELECT COUNT(*) AS count FROM properties");
    result.livePropertyCountAfter = Number(livePropertyCountRows[0]?.count ?? 0);
    result.baselinePropertyCountVerified = Number(baselinePropertyCountRows[0]?.count ?? 0);
    result.completedAt = new Date().toISOString();

    await live.commit();
    transactionOpen = false;
    await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    if (transactionOpen) await live.rollback();
    throw error;
  } finally {
    await Promise.all([live.end(), baseline.end()]);
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
