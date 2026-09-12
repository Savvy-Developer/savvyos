import { writeFile } from "node:fs/promises";
import mysql from "mysql2/promise";

const liveUrl = process.env.DATABASE_URL;
const baselineUrl = process.env.BASELINE_DATABASE_URL;
const outputPath = process.env.OUTPUT_PATH ?? "/tmp/incident-property-recovery-plan.json";
const incidentStartedAt = "2026-09-09 02:47:00";

if (!liveUrl) throw new Error("DATABASE_URL is required.");
if (!baselineUrl) throw new Error("BASELINE_DATABASE_URL is required.");

type Row = Record<string, unknown>;
type RelationSpec = { table: string; primaryKey: string; column: string; where?: string };

const relations: RelationSpec[] = [
  { table: "communications", primaryKey: "id", column: "relatedPropertyId" },
  { table: "documents", primaryKey: "id", column: "relatedPropertyId" },
  { table: "listings", primaryKey: "id", column: "propertyId" },
  { table: "proformas", primaryKey: "id", column: "propertyId" },
  { table: "property_ownership", primaryKey: "id", column: "propertyId" },
  { table: "referrals", primaryKey: "id", column: "propertyId" },
  { table: "tasks", primaryKey: "id", column: "relatedPropertyId" },
  { table: "transactions", primaryKey: "id", column: "propertyId" },
  { table: "activity_log", primaryKey: "id", column: "entityId", where: "entityType = 'property'" },
  { table: "contact_properties", primaryKey: "id", column: "propertyId" },
];

const propertyIdentityFields = ["address", "city", "state", "zip", "normalizedAddress"];
const propertyFieldsToRestore = [
  "address", "city", "state", "zip", "normalizedAddress", "beds", "baths", "sqft", "propertyType",
  "yearBuilt", "listPrice", "strZoning", "strNotes", "notes", "addedByUserId", "createdAt", "updatedAt",
];

function comparable(value: unknown): string {
  if (value === null || value === undefined) return "<null>";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function differs(a: Row, b: Row, fields: string[]) {
  return fields.filter(field => comparable(a[field]) !== comparable(b[field]));
}

async function columns(connection: mysql.Connection, table: string): Promise<string[]> {
  const [rows] = await connection.query<Array<{ COLUMN_NAME: string }>>(
    "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION",
    [table],
  );
  return rows.map(row => row.COLUMN_NAME);
}

async function main() {
  const [live, baseline] = await Promise.all([mysql.createConnection(liveUrl!), mysql.createConnection(baselineUrl!)]);
  try {
    const [baselineProperties] = await baseline.query<Row[]>("SELECT * FROM properties ORDER BY id");
    const [liveProperties] = await live.query<Row[]>("SELECT * FROM properties ORDER BY id");
    const baselineById = new Map(baselineProperties.map(row => [Number(row.id), row]));
    const liveById = new Map(liveProperties.map(row => [Number(row.id), row]));

    const missingBaselineProperties: Row[] = [];
    const changedBaselineProperties: Row[] = [];
    for (const [id, baselineProperty] of baselineById) {
      const liveProperty = liveById.get(id);
      if (!liveProperty) {
        missingBaselineProperties.push({ id, address: baselineProperty.address, city: baselineProperty.city, state: baselineProperty.state, zip: baselineProperty.zip, normalizedAddress: baselineProperty.normalizedAddress });
        continue;
      }
      const identityChanged = differs(baselineProperty, liveProperty, propertyIdentityFields);
      const allChanged = differs(baselineProperty, liveProperty, propertyFieldsToRestore);
      if (allChanged.length) {
        changedBaselineProperties.push({
          id,
          baselineAddress: [baselineProperty.address, baselineProperty.city, baselineProperty.state, baselineProperty.zip].filter(Boolean).join(", "),
          liveAddress: [liveProperty.address, liveProperty.city, liveProperty.state, liveProperty.zip].filter(Boolean).join(", "),
          identityChanged,
          allChanged,
          liveUpdatedAt: liveProperty.updatedAt,
        });
      }
    }

    const relationPlans: Record<string, { restoreCount: number; insertCount: number; changedRows: Row[] }> = {};
    for (const relation of relations) {
      const where = relation.where ? ` WHERE ${relation.where}` : "";
      const [baselineRows] = await baseline.query<Row[]>(`SELECT * FROM \`${relation.table}\`${where}`);
      const [liveRows] = await live.query<Row[]>(`SELECT * FROM \`${relation.table}\`${where}`);
      const liveByPrimaryKey = new Map(liveRows.map(row => [Number(row[relation.primaryKey]), row]));
      const changedRows: Row[] = [];
      let restoreCount = 0;
      let insertCount = 0;
      for (const baselineRow of baselineRows) {
        const id = Number(baselineRow[relation.primaryKey]);
        const liveRow = liveByPrimaryKey.get(id);
        if (!liveRow) {
          insertCount += 1;
          changedRows.push({ id, action: "insert", originalPropertyId: baselineRow[relation.column] });
        } else if (comparable(liveRow[relation.column]) !== comparable(baselineRow[relation.column])) {
          restoreCount += 1;
          changedRows.push({ id, action: "restore_reference", originalPropertyId: baselineRow[relation.column], livePropertyId: liveRow[relation.column] });
        }
      }
      relationPlans[relation.table] = { restoreCount, insertCount, changedRows };
    }

    const [mergeAudits] = await live.query<Array<{ entityId: number; details: string | null }>>(
      "SELECT entityId, details FROM activity_log WHERE action = 'property_duplicates_merged'",
    );
    const missingMergeSourceIds = new Set<number>();
    for (const audit of mergeAudits) {
      try {
        const details = JSON.parse(audit.details ?? "{}");
        for (const id of details.mergedPropertyIds ?? []) {
          const numericId = Number(id);
          if (!baselineById.has(numericId)) missingMergeSourceIds.add(numericId);
        }
      } catch {
        // Retain plan completeness even if one legacy audit row has invalid JSON.
      }
    }

    const [baselineDuplicateRows] = await baseline.query<Array<{ normalizedAddress: string; recordCount: number }>>(
      "SELECT normalizedAddress, COUNT(*) AS recordCount FROM properties WHERE normalizedAddress IS NOT NULL AND normalizedAddress <> '' GROUP BY normalizedAddress HAVING COUNT(*) > 1 ORDER BY recordCount DESC, normalizedAddress",
    );
    const [postIncidentUserUpdates] = await live.query<Array<{ id: number; entityId: number; userId: number | null; createdAt: string }>>(
      "SELECT id, entityId, userId, createdAt FROM activity_log WHERE action = 'property_updated' AND createdAt >= ? ORDER BY createdAt",
      [incidentStartedAt],
    );

    const plan = {
      generatedAt: new Date().toISOString(),
      incidentStartedAt,
      propertyRestoreColumns: propertyFieldsToRestore,
      baseline: {
        propertyCount: baselineProperties.length,
        transactionCount: Number((await baseline.query<Array<{ count: number }>>("SELECT COUNT(*) AS count FROM transactions"))[0][0]?.count ?? 0),
      },
      live: {
        propertyCount: liveProperties.length,
        transactionCount: Number((await live.query<Array<{ count: number }>>("SELECT COUNT(*) AS count FROM transactions"))[0][0]?.count ?? 0),
      },
      properties: {
        missingBaselinePropertyCount: missingBaselineProperties.length,
        changedBaselinePropertyCount: changedBaselineProperties.length,
        identityChangedBaselinePropertyCount: changedBaselineProperties.filter(row => (row.identityChanged as unknown[]).length).length,
        missingBaselineProperties,
        changedBaselineProperties,
      },
      references: relationPlans,
      baselineDuplicateGroups: baselineDuplicateRows,
      postIncidentPropertyUpdates: postIncidentUserUpdates,
      mergeSourcePropertiesMissingFromBaseline: [...missingMergeSourceIds].sort((a, b) => a - b),
      mergeSourcePropertiesMissingFromBaselineCount: missingMergeSourceIds.size,
      sourceTableColumns: Object.fromEntries(await Promise.all([
        "properties",
        ...relations.map(relation => relation.table),
      ].map(async table => [table, await columns(baseline, table)]))),
    };

    await writeFile(outputPath, `${JSON.stringify(plan, null, 2)}\n`);
    console.log(JSON.stringify({
      outputPath,
      baselineProperties: plan.baseline.propertyCount,
      liveProperties: plan.live.propertyCount,
      missingBaselineProperties: plan.properties.missingBaselinePropertyCount,
      changedBaselineProperties: plan.properties.changedBaselinePropertyCount,
      propertyReferenceChanges: Object.fromEntries(Object.entries(relationPlans).map(([table, value]) => [table, { restore: value.restoreCount, insert: value.insertCount }])),
      mergeSourcePropertiesMissingFromBaseline: plan.mergeSourcePropertiesMissingFromBaselineCount,
      baselineDuplicateGroups: baselineDuplicateRows.length,
    }, null, 2));
  } finally {
    await Promise.all([live.end(), baseline.end()]);
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
