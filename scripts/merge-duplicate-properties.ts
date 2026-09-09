import mysql from "mysql2/promise";

type Property = {
  id: number;
  address: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  normalizedAddress: string | null;
  beds: string | null;
  baths: string | null;
  sqft: number | null;
  propertyType: string | null;
  yearBuilt: number | null;
  listPrice: string | null;
  strZoning: string | null;
  strNotes: string | null;
  notes: string | null;
  addedByUserId: number | null;
  createdAt: string;
  updatedAt: string;
};

type ReferenceTable = {
  table: string;
  column: string;
  label: string;
  where?: string;
};

type ContactProperty = {
  id: number;
  propertyId: number;
  contactId: number;
  label: string | null;
  createdAt: string;
};

const expectedDuplicateGroups = Number(process.env.EXPECTED_DUPLICATE_GROUPS ?? 136);
const expectedDuplicateProperties = Number(process.env.EXPECTED_DUPLICATE_PROPERTIES ?? 193);
const expectedTransfers: Record<string, number> = {
  communications: 0,
  documents: 0,
  listings: 17,
  proformas: 2,
  "ownership records": 0,
  referrals: 0,
  tasks: 0,
  transactions: 96,
  "activity log entries": 94,
  "contact links": 114,
};

const referenceTables: ReferenceTable[] = [
  { table: "communications", column: "relatedPropertyId", label: "communications" },
  { table: "documents", column: "relatedPropertyId", label: "documents" },
  { table: "listings", column: "propertyId", label: "listings" },
  { table: "proformas", column: "propertyId", label: "proformas" },
  { table: "property_ownership", column: "propertyId", label: "ownership records" },
  { table: "referrals", column: "propertyId", label: "referrals" },
  { table: "tasks", column: "relatedPropertyId", label: "tasks" },
  { table: "transactions", column: "propertyId", label: "transactions" },
  { table: "activity_log", column: "entityId", label: "activity log entries", where: "entityType = 'property'" },
];

const scalarFields = ["beds", "baths", "sqft", "yearBuilt", "listPrice", "strZoning"] as const;

type ScalarField = (typeof scalarFields)[number];

function isPresent(value: unknown): boolean {
  return value !== null && value !== undefined && value !== "";
}

function placeholders(values: readonly unknown[]): string {
  if (!values.length) throw new Error("Expected at least one value for SQL placeholder list.");
  return values.map(() => "?").join(", ");
}

function recordCountMap(rows: Array<{ propertyId: number; recordCount: number }>): Map<number, number> {
  return new Map(rows.map(row => [Number(row.propertyId), Number(row.recordCount)]));
}

function modeValue<T>(properties: Property[], field: keyof Property): T | null {
  const values = properties.map(property => property[field]).filter(isPresent) as T[];
  if (!values.length) return null;
  const counts = new Map<string, { value: T; count: number }>();
  for (const value of values) {
    const key = String(value);
    const current = counts.get(key);
    counts.set(key, current ? { value, count: current.count + 1 } : { value, count: 1 });
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || String(a.value).localeCompare(String(b.value)))[0].value;
}

function preferredPropertyType(properties: Property[]): string | null {
  const specificTypes = properties.filter(property => property.propertyType && property.propertyType !== "other");
  return modeValue<string>(specificTypes.length ? specificTypes : properties, "propertyType");
}

function mergeText(properties: Property[], field: "strNotes" | "notes"): string | null {
  const values = new Map<string, number[]>();
  for (const property of properties) {
    const value = property[field]?.trim();
    if (!value) continue;
    const sourceIds = values.get(value) ?? [];
    sourceIds.push(property.id);
    values.set(value, sourceIds);
  }
  if (!values.size) return null;
  if (values.size === 1) return [...values.keys()][0];
  return [...values.entries()]
    .map(([value, sourceIds]) => `[Merged from property ${sourceIds.map(id => `#${id}`).join(", ")}]\n${value}`)
    .join("\n\n");
}

function chooseCanonical(group: Property, candidates: Property[], scores: Map<number, number>): Property {
  return [group, ...candidates].sort((a, b) => {
    const scoreDifference = (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0);
    if (scoreDifference) return scoreDifference;
    const createdDifference = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    return createdDifference || a.id - b.id;
  })[0];
}

function labelKey(label: string | null): string {
  return (label || "Primary home").trim().toLowerCase() || "primary home";
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");
  const connection = await mysql.createConnection(databaseUrl);
  let transactionStarted = false;

  try {
    await connection.beginTransaction();
    transactionStarted = true;

    const [properties] = await connection.query<Property[]>(
      `SELECT id, address, city, state, zip, normalizedAddress, beds, baths, sqft, propertyType, yearBuilt, listPrice, strZoning, strNotes, notes, addedByUserId, createdAt, updatedAt
       FROM properties WHERE normalizedAddress IS NOT NULL AND normalizedAddress <> '' ORDER BY createdAt, id FOR UPDATE`,
    );
    const groupedProperties = new Map<string, Property[]>();
    for (const property of properties) {
      const group = groupedProperties.get(property.normalizedAddress!) ?? [];
      group.push(property);
      groupedProperties.set(property.normalizedAddress!, group);
    }
    const duplicateGroups = [...groupedProperties.entries()].filter(([, group]) => group.length > 1);
    const duplicatePropertyIds = duplicateGroups.flatMap(([, group]) => group.map(property => property.id));
    const duplicatePropertiesToDelete = duplicateGroups.reduce((total, [, group]) => total + group.length - 1, 0);

    if (duplicateGroups.length !== expectedDuplicateGroups || duplicatePropertiesToDelete !== expectedDuplicateProperties) {
      throw new Error(`Live duplicate plan changed. Expected ${expectedDuplicateGroups} groups / ${expectedDuplicateProperties} duplicate records, found ${duplicateGroups.length} groups / ${duplicatePropertiesToDelete} duplicate records.`);
    }

    const idsClause = placeholders(duplicatePropertyIds);
    const referenceCounts = new Map<string, Map<number, number>>();
    const actualTransfers: Record<string, number> = {};
    for (const reference of referenceTables) {
      const where = `${reference.column} IN (${idsClause})${reference.where ? ` AND ${reference.where}` : ""}`;
      const [rows] = await connection.query<Array<{ propertyId: number; recordCount: number }>>(
        `SELECT ${reference.column} AS propertyId, COUNT(*) AS recordCount FROM ${reference.table} WHERE ${where} GROUP BY ${reference.column}`,
        duplicatePropertyIds,
      );
      const counts = recordCountMap(rows);
      referenceCounts.set(reference.table, counts);
      actualTransfers[reference.label] = [...counts.values()].reduce((total, count) => total + count, 0);
    }

    const [contactPropertyRows] = await connection.query<ContactProperty[]>(
      `SELECT id, propertyId, contactId, label, createdAt FROM contact_properties WHERE propertyId IN (${idsClause}) ORDER BY createdAt, id FOR UPDATE`,
      duplicatePropertyIds,
    );
    const contactCounts = new Map<number, number>();
    for (const row of contactPropertyRows) contactCounts.set(row.propertyId, (contactCounts.get(row.propertyId) ?? 0) + 1);
    const plannedGroups = duplicateGroups.map(([normalizedAddress, group]) => {
      const scores = new Map<number, number>();
      for (const property of group) {
        const total = (contactCounts.get(property.id) ?? 0) + referenceTables.reduce(
          (sum, reference) => sum + (referenceCounts.get(reference.table)?.get(property.id) ?? 0),
          0,
        );
        scores.set(property.id, total);
      }
      const canonical = chooseCanonical(group[0], group.slice(1), scores);
      const sourceProperties = group.filter(property => property.id !== canonical.id);
      return { normalizedAddress, group, canonical, sourceProperties };
    });

    for (const reference of referenceTables) {
      actualTransfers[reference.label] = plannedGroups.reduce(
        (total, plan) => total + plan.sourceProperties.reduce(
          (sourceTotal, property) => sourceTotal + (referenceCounts.get(reference.table)?.get(property.id) ?? 0),
          0,
        ),
        0,
      );
    }
    actualTransfers["contact links"] = plannedGroups.reduce(
      (total, plan) => total + plan.sourceProperties.reduce(
        (sourceTotal, property) => sourceTotal + (contactCounts.get(property.id) ?? 0),
        0,
      ),
      0,
    );

    for (const [label, expected] of Object.entries(expectedTransfers)) {
      if ((actualTransfers[label] ?? 0) !== expected) {
        throw new Error(`Live dependency scope changed for ${label}. Expected ${expected}, found ${actualTransfers[label] ?? 0}.`);
      }
    }

    const [adminRows] = await connection.query<Array<{ id: number }>>(
      "SELECT id FROM users WHERE email = ? LIMIT 1",
      ["tyler@savvy.realty"],
    );
    const auditUserId = adminRows[0]?.id ?? null;
    const auditEntries: Array<{ canonicalId: number; details: Record<string, unknown> }> = [];
    let removedContactLinks = 0;
    let transferredContactLinks = 0;
    let transferredProperties = 0;

    for (const { normalizedAddress, group, canonical, sourceProperties } of plannedGroups) {
      const sourceIds = sourceProperties.map(property => property.id);

      const propertyUpdates: Partial<Record<ScalarField | "propertyType" | "strNotes" | "notes", unknown>> = {};
      for (const field of scalarFields) {
        if (!isPresent(canonical[field])) {
          const value = modeValue(group, field);
          if (isPresent(value)) propertyUpdates[field] = value;
        }
      }
      if (!isPresent(canonical.propertyType)) {
        const propertyType = preferredPropertyType(group);
        if (propertyType) propertyUpdates.propertyType = propertyType;
      }
      for (const field of ["strNotes", "notes"] as const) {
        const merged = mergeText(group, field);
        if (merged !== canonical[field]) propertyUpdates[field] = merged;
      }
      if (Object.keys(propertyUpdates).length) {
        const fields = Object.keys(propertyUpdates) as Array<keyof typeof propertyUpdates>;
        await connection.execute(
          `UPDATE properties SET ${fields.map(field => `${field} = ?`).join(", ")}, updatedAt = NOW() WHERE id = ?`,
          [...fields.map(field => propertyUpdates[field] ?? null), canonical.id],
        );
      }

      const linksInGroup = contactPropertyRows.filter(row => group.some(property => property.id === row.propertyId));
      const linksByContactAndRole = new Map<string, ContactProperty[]>();
      for (const link of linksInGroup) {
        const key = `${link.contactId}:${labelKey(link.label)}`;
        const links = linksByContactAndRole.get(key) ?? [];
        links.push(link);
        linksByContactAndRole.set(key, links);
      }
      const contactLinkIdsToDelete: number[] = [];
      const contactLinkIdsToTransfer: number[] = [];
      for (const links of linksByContactAndRole.values()) {
        const sorted = [...links].sort((a, b) => {
          const canonicalDifference = Number(b.propertyId === canonical.id) - Number(a.propertyId === canonical.id);
          if (canonicalDifference) return canonicalDifference;
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || a.id - b.id;
        });
        const [keptLink, ...duplicates] = sorted;
        if (keptLink.propertyId !== canonical.id) contactLinkIdsToTransfer.push(keptLink.id);
        contactLinkIdsToDelete.push(...duplicates.map(link => link.id));
      }
      if (contactLinkIdsToDelete.length) {
        await connection.execute(`DELETE FROM contact_properties WHERE id IN (${placeholders(contactLinkIdsToDelete)})`, contactLinkIdsToDelete);
        removedContactLinks += contactLinkIdsToDelete.length;
      }
      if (contactLinkIdsToTransfer.length) {
        await connection.execute(
          `UPDATE contact_properties SET propertyId = ? WHERE id IN (${placeholders(contactLinkIdsToTransfer)})`,
          [canonical.id, ...contactLinkIdsToTransfer],
        );
        transferredContactLinks += contactLinkIdsToTransfer.length;
      }

      const transferredReferences: Record<string, number> = { "contact links": contactLinkIdsToTransfer.length };
      for (const reference of referenceTables) {
        const count = sourceProperties.reduce((total, property) => total + (referenceCounts.get(reference.table)?.get(property.id) ?? 0), 0);
        transferredReferences[reference.label] = count;
        if (!count) continue;
        const where = `${reference.column} IN (${placeholders(sourceIds)})${reference.where ? ` AND ${reference.where}` : ""}`;
        await connection.execute(
          `UPDATE ${reference.table} SET ${reference.column} = ? WHERE ${where}`,
          [canonical.id, ...sourceIds],
        );
      }

      auditEntries.push({
        canonicalId: canonical.id,
        details: {
          normalizedAddress,
          mergedPropertyIds: sourceIds,
          canonicalPropertyId: canonical.id,
          sourceCreators: sourceProperties.map(property => ({ propertyId: property.id, addedByUserId: property.addedByUserId })),
          canonicalCreator: canonical.addedByUserId,
          transferredReferences,
          removedRedundantContactLinkIds: contactLinkIdsToDelete,
          propertyFieldsUpdated: propertyUpdates,
        },
      });
      transferredProperties += sourceIds.length;
    }

    const allSourceIds = auditEntries.flatMap(entry => entry.details.mergedPropertyIds as number[]);
    for (const audit of auditEntries) {
      await connection.execute(
        "INSERT INTO activity_log (userId, action, entityType, entityId, details, createdAt) VALUES (?, ?, ?, ?, ?, NOW())",
        [auditUserId, "property_duplicates_merged", "property", audit.canonicalId, JSON.stringify(audit.details)],
      );
    }

    const remainingReferences: Array<{ label: string; count: number }> = [];
    for (const reference of referenceTables) {
      const where = `${reference.column} IN (${placeholders(allSourceIds)})${reference.where ? ` AND ${reference.where}` : ""}`;
      const [rows] = await connection.query<Array<{ recordCount: number }>>(
        `SELECT COUNT(*) AS recordCount FROM ${reference.table} WHERE ${where}`,
        allSourceIds,
      );
      remainingReferences.push({ label: reference.label, count: Number(rows[0]?.recordCount ?? 0) });
    }
    const [remainingContactLinks] = await connection.query<Array<{ recordCount: number }>>(
      `SELECT COUNT(*) AS recordCount FROM contact_properties WHERE propertyId IN (${placeholders(allSourceIds)})`,
      allSourceIds,
    );
    remainingReferences.push({ label: "contact links", count: Number(remainingContactLinks[0]?.recordCount ?? 0) });
    const residualReferences = remainingReferences.filter(reference => reference.count > 0);
    if (residualReferences.length) {
      throw new Error(`Cannot delete duplicate properties because references remain: ${JSON.stringify(residualReferences)}`);
    }

    const [deleteResult] = await connection.execute(
      `DELETE FROM properties WHERE id IN (${placeholders(allSourceIds)})`,
      allSourceIds,
    );
    if ((deleteResult as mysql.ResultSetHeader).affectedRows !== expectedDuplicateProperties) {
      throw new Error(`Expected to delete ${expectedDuplicateProperties} duplicate properties, deleted ${(deleteResult as mysql.ResultSetHeader).affectedRows}.`);
    }

    const [remainingDuplicateGroups] = await connection.query<Array<{ recordCount: number }>>(
      "SELECT COUNT(*) AS recordCount FROM (SELECT normalizedAddress FROM properties WHERE normalizedAddress IS NOT NULL AND normalizedAddress <> '' GROUP BY normalizedAddress HAVING COUNT(*) > 1) AS duplicate_groups",
    );
    if (Number(remainingDuplicateGroups[0]?.recordCount ?? 0) !== 0) {
      throw new Error("Duplicate normalized addresses remain after consolidation.");
    }

    await connection.commit();
    transactionStarted = false;

    const [uniqueIndexRows] = await connection.query<Array<{ Key_name: string }>>(
      "SHOW INDEX FROM properties WHERE Key_name = 'properties_normalizedAddress_unique'",
    );
    if (!uniqueIndexRows.length) {
      await connection.execute("ALTER TABLE properties ADD UNIQUE INDEX properties_normalizedAddress_unique (normalizedAddress)");
    }

    console.log(JSON.stringify({
      duplicateGroupsMerged: duplicateGroups.length,
      canonicalPropertiesRetained: duplicateGroups.length,
      duplicatePropertiesDeleted: transferredProperties,
      contactLinksTransferred: transferredContactLinks,
      redundantContactLinksDeleted: removedContactLinks,
      referenceTransfers: actualTransfers,
      activityAuditEntriesAdded: auditEntries.length,
      uniqueNormalizedAddressIndexCreated: !uniqueIndexRows.length,
    }, null, 2));
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    throw error;
  } finally {
    await connection.end();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
