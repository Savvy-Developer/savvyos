import mysql from "mysql2/promise";
import { buildNormalizedKey, extractAddressUnit } from "../server/addressNormalization";

// "Lot" is intentionally excluded: it identifies a parcel, not a distinct
// apartment-style subpremise. A hash or formal unit/apartment/suite designator
// is the evidence required for this recovery audit.
const FORMATTED_UNIT_PATTERN = /(?:#\s*[A-Za-z0-9][A-Za-z0-9-]*|(?:apt(?:artment)?\.?|unit|suite|ste\.?|bldg|building)(?:\s*#\s*|\s+)[A-Za-z0-9][A-Za-z0-9-]*)\b/i;

type Property = {
  id: number;
  address: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  normalizedAddress: string | null;
};

type Activity = {
  id: number;
  entityType: string | null;
  entityId: number | null;
  action: string;
  createdAt: string;
  details: string | null;
};

type Evidence = {
  activityId: number;
  entityType: string | null;
  entityId: number | null;
  action: string;
  createdAt: string;
  linkedPropertyId: number | null;
  recordedPropertyId: number | null;
  address: string;
};

function parseDetails(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try { return JSON.parse(value) as Record<string, unknown>; } catch { return null; }
}

function getString(details: Record<string, unknown> | null, key: string): string | null {
  const value = details?.[key];
  return typeof value === "string" && value.trim() ? value.trim().replace(/\s+/g, " ") : null;
}

function getNumeric(details: Record<string, unknown> | null, key: string): number | null {
  const value = details?.[key];
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    const [properties] = await connection.query<Property[]>("SELECT id, address, city, state, zip, normalizedAddress FROM properties ORDER BY id");
    const propertyIds = new Set(properties.map(property => property.id));
    const propertyById = new Map(properties.map(property => [property.id, property]));

    const [activities] = await connection.query<Activity[]>(`
      SELECT id, entityType, entityId, action, createdAt, CAST(details AS CHAR) AS details
      FROM activity_log
      WHERE details IS NOT NULL
        AND JSON_UNQUOTE(JSON_EXTRACT(details, '$.propertyAddress')) IS NOT NULL
      ORDER BY id
    `);
    const [transactionRows] = await connection.query<Array<{ id: number; propertyId: number | null }>>("SELECT id, propertyId FROM transactions");
    const [listingRows] = await connection.query<Array<{ id: number; propertyId: number | null }>>("SELECT id, propertyId FROM listings");
    const transactions = new Map(transactionRows.map(row => [row.id, row.propertyId]));
    const listings = new Map(listingRows.map(row => [row.id, row.propertyId]));

    const evidence: Evidence[] = [];
    for (const activity of activities) {
      const details = parseDetails(activity.details);
      const address = getString(details, "propertyAddress");
      if (!address || !FORMATTED_UNIT_PATTERN.test(address)) continue;
      const recordedPropertyId = getNumeric(details, "propertyId");
      let linkedPropertyId: number | null = null;
      if (activity.entityType === "property" && activity.entityId && propertyIds.has(activity.entityId)) linkedPropertyId = activity.entityId;
      if (activity.entityType === "transaction" && activity.entityId) linkedPropertyId = transactions.get(activity.entityId) ?? null;
      if (activity.entityType === "listing" && activity.entityId) linkedPropertyId = listings.get(activity.entityId) ?? null;
      if (!linkedPropertyId && recordedPropertyId && propertyIds.has(recordedPropertyId)) linkedPropertyId = recordedPropertyId;
      evidence.push({
        activityId: activity.id,
        entityType: activity.entityType,
        entityId: activity.entityId,
        action: activity.action,
        createdAt: activity.createdAt,
        linkedPropertyId,
        recordedPropertyId,
        address,
      });
    }

    const groups = new Map<number, { property: Property; evidence: Evidence[] }>();
    const unmapped: Evidence[] = [];
    for (const item of evidence) {
      if (!item.linkedPropertyId) { unmapped.push(item); continue; }
      const property = propertyById.get(item.linkedPropertyId);
      if (!property) { unmapped.push(item); continue; }
      const group = groups.get(property.id) ?? { property, evidence: [] };
      group.evidence.push(item);
      groups.set(property.id, group);
    }

    const mapped = [...groups.values()].map(group => {
      const expectedKeys = [...new Set(group.evidence.map(item => {
        const fragment = item.address.split(",");
        const address = fragment[0] ?? item.address;
        const city = fragment[1]?.trim() ?? group.property.city;
        const stateZip = fragment.slice(2).join(" ").trim().match(/([A-Z]{2})\s*(\d{5}(?:-\d{4})?)/i);
        return buildNormalizedKey(address, city, stateZip?.[1] ?? group.property.state, stateZip?.[2] ?? group.property.zip);
      }))];
      const currentHasUnit = Boolean(extractAddressUnit(group.property.address));
      return {
        property: group.property,
        currentHasUnit,
        currentKey: buildNormalizedKey(group.property.address, group.property.city, group.property.state, group.property.zip),
        recordedUnitAddresses: [...new Set(group.evidence.map(item => item.address))],
        expectedKeys,
        evidence: group.evidence,
        needsAddressCorrection: !currentHasUnit,
      };
    }).sort((a, b) => a.property.id - b.property.id);

    console.log(JSON.stringify({
      generatedAt: new Date().toISOString(),
      summary: {
        unitAddressActivityEvents: evidence.length,
        mappedPropertyCount: mapped.length,
        mappedPropertiesMissingUnit: mapped.filter(group => group.needsAddressCorrection).length,
        unmappedEvents: unmapped.length,
      },
      mapped,
      unmapped,
    }, null, 2));
  } finally {
    await connection.end();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
