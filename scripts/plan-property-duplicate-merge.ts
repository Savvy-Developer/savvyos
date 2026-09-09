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

const scalarFields = [
  "beds", "baths", "sqft", "propertyType", "yearBuilt", "listPrice", "strZoning", "strNotes", "notes", "addedByUserId",
] as const;

function isPresent(value: unknown): boolean {
  return value !== null && value !== undefined && value !== "";
}

function toRecordCounts(rows: Array<{ propertyId: number; recordCount: number }>): Map<number, number> {
  return new Map(rows.map(row => [Number(row.propertyId), Number(row.recordCount)]));
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");
  const connection = await mysql.createConnection(databaseUrl);
  try {
    const [properties] = await connection.query<Property[]>(
      `SELECT id, address, city, state, zip, normalizedAddress, beds, baths, sqft, propertyType, yearBuilt, listPrice, strZoning, strNotes, notes, addedByUserId, createdAt, updatedAt
       FROM properties WHERE normalizedAddress IS NOT NULL AND normalizedAddress <> '' ORDER BY createdAt, id`,
    );
    const groups = new Map<string, Property[]>();
    for (const property of properties) {
      const group = groups.get(property.normalizedAddress!) ?? [];
      group.push(property);
      groups.set(property.normalizedAddress!, group);
    }
    const duplicateGroups = [...groups.entries()].filter(([, group]) => group.length > 1);
    const duplicateIds = duplicateGroups.flatMap(([, group]) => group.map(property => property.id));
    const placeholders = duplicateIds.map(() => "?").join(", ");

    const referenceCountsByTable = new Map<string, Map<number, number>>();
    for (const reference of referenceTables) {
      const where = `${reference.column} IN (${placeholders})${reference.where ? ` AND ${reference.where}` : ""}`;
      const [rows] = await connection.query<Array<{ propertyId: number; recordCount: number }>>(
        `SELECT ${reference.column} AS propertyId, COUNT(*) AS recordCount FROM ${reference.table} WHERE ${where} GROUP BY ${reference.column}`,
        duplicateIds,
      );
      referenceCountsByTable.set(reference.table, toRecordCounts(rows));
    }

    const [contactLinks] = await connection.query<Array<{ id: number; propertyId: number; contactId: number; label: string | null; createdAt: string }>>(
      `SELECT id, propertyId, contactId, label, createdAt FROM contact_properties WHERE propertyId IN (${placeholders}) ORDER BY createdAt, id`,
      duplicateIds,
    );
    const contactLinkCounts = toRecordCounts(contactLinks.reduce<Array<{ propertyId: number; recordCount: number }>>((rows, row) => {
      const existing = rows.find(item => item.propertyId === row.propertyId);
      if (existing) existing.recordCount += 1;
      else rows.push({ propertyId: row.propertyId, recordCount: 1 });
      return rows;
    }, []));
    referenceCountsByTable.set("contact_properties", contactLinkCounts);

    const mergeGroups = duplicateGroups.map(([normalizedAddress, group]) => {
      const recordsWithScores = group.map(property => {
        const references = Object.fromEntries(referenceTables.map(reference => [
          reference.label,
          referenceCountsByTable.get(reference.table)?.get(property.id) ?? 0,
        ]));
        const linkedContacts = contactLinkCounts.get(property.id) ?? 0;
        const score = linkedContacts + Object.values(references).reduce((sum, count) => sum + Number(count), 0);
        return { property, score, references, linkedContacts };
      }).sort((a, b) => b.score - a.score || new Date(a.property.createdAt).getTime() - new Date(b.property.createdAt).getTime() || a.property.id - b.property.id);
      const canonical = recordsWithScores[0];
      const duplicates = recordsWithScores.slice(1);
      const ids = group.map(property => property.id);
      const linksByContact = new Map<number, typeof contactLinks>();
      for (const link of contactLinks.filter(link => ids.includes(link.propertyId))) {
        const contactRows = linksByContact.get(link.contactId) ?? [];
        contactRows.push(link);
        linksByContact.set(link.contactId, contactRows);
      }
      const contactLinkCollisions = [...linksByContact.entries()]
        .filter(([, links]) => links.length > 1)
        .map(([contactId, links]) => {
          const linksByLabel = new Map<string, typeof links>();
          for (const link of links) {
            const labelKey = (link.label || "Primary home").trim().toLowerCase() || "primary home";
            const labelLinks = linksByLabel.get(labelKey) ?? [];
            labelLinks.push(link);
            linksByLabel.set(labelKey, labelLinks);
          }
          const exactDuplicates = [...linksByLabel.values()]
            .filter(labelLinks => labelLinks.length > 1)
            .map(labelLinks => ({
              linkIds: labelLinks.map(link => link.id),
              label: labelLinks[0].label || "Primary home",
              duplicateLinksToRemove: labelLinks.length - 1,
            }));
          return {
            contactId,
            linkIds: links.map(link => link.id),
            labels: [...new Set(links.map(link => link.label || "Primary home"))],
            preservesDistinctRoles: linksByLabel.size > 1,
            exactDuplicates,
          };
        });
      const scalarConflicts = scalarFields.flatMap(field => {
        const values = [...new Set(group.map(property => property[field]).filter(isPresent).map(String))];
        return values.length > 1 ? [{ field, values }] : [];
      });
      const transferCounts = Object.fromEntries(referenceTables.map(reference => [
        reference.label,
        duplicates.reduce((sum, record) => sum + (referenceCountsByTable.get(reference.table)?.get(record.property.id) ?? 0), 0),
      ]));
      transferCounts["contact links"] = duplicates.reduce((sum, record) => sum + (contactLinkCounts.get(record.property.id) ?? 0), 0);
      return {
        normalizedAddress,
        canonical: {
          id: canonical.property.id,
          address: [canonical.property.address, canonical.property.city, canonical.property.state, canonical.property.zip].filter(Boolean).join(", "),
          relationshipScore: canonical.score,
          referenceCounts: { ...canonical.references, "contact links": canonical.linkedContacts },
        },
        duplicatePropertyIds: duplicates.map(record => record.property.id),
        transferCounts,
        contactLinkCollisions,
        scalarConflicts,
      };
    });

    const totals = Object.fromEntries([
      ...referenceTables.map(reference => [
        reference.label,
        mergeGroups.reduce((sum, group) => sum + Number(group.transferCounts[reference.label]), 0),
      ]),
      ["contact links", mergeGroups.reduce((sum, group) => sum + Number(group.transferCounts["contact links"]), 0)],
    ]);
    const contactLinkCollisions = mergeGroups.flatMap(group => group.contactLinkCollisions.map(collision => ({
      canonicalPropertyId: group.canonical.id,
      ...collision,
    })));
    const fieldConflicts = mergeGroups.flatMap(group => group.scalarConflicts.map(conflict => ({
      canonicalPropertyId: group.canonical.id,
      canonicalAddress: group.canonical.address,
      ...conflict,
    })));

    console.log(JSON.stringify({
      generatedAt: new Date().toISOString(),
      summary: {
        duplicateGroupCount: mergeGroups.length,
        canonicalPropertiesRetained: mergeGroups.length,
        duplicatePropertiesToArchiveAndDelete: mergeGroups.reduce((sum, group) => sum + group.duplicatePropertyIds.length, 0),
        referenceTransfers: totals,
        contactPropertyLinksToConsolidate: contactLinkCollisions.reduce((sum, collision) => sum + collision.exactDuplicates.reduce((duplicateTotal, duplicate) => duplicateTotal + duplicate.duplicateLinksToRemove, 0), 0),
        contactPropertyRolesToPreserve: contactLinkCollisions.filter(collision => collision.preservesDistinctRoles).length,
        propertyFieldConflictCount: fieldConflicts.length,
      },
      mergeGroups,
      contactLinkCollisions,
      fieldConflicts,
    }, null, 2));
  } finally {
    await connection.end();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
