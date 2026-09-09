import mysql from "mysql2/promise";

const UNIT_DESIGNATOR = String.raw`(?:#\s*[A-Za-z0-9][A-Za-z0-9-]*|(?:apt(?:artment)?\.?|unit|suite|ste\.?|lot|bldg|building)(?:\s*#\s*|\s+)[A-Za-z0-9][A-Za-z0-9-]*)`;

type Evidence = {
  source: string;
  recordId: number;
  propertyId: number | null;
  candidateAddress: string;
  metadata: Record<string, unknown>;
};

type PropertyRow = {
  id: number;
  address: string;
  city: string | null;
  state: string | null;
  zip: string | null;
};

function collectJsonAddressEvidence(value: unknown, keyPath = ""): Array<{ path: string; address: string }> {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap((item, index) => collectJsonAddressEvidence(item, `${keyPath}[${index}]`));
  const result: Array<{ path: string; address: string }> = [];
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const path = keyPath ? `${keyPath}.${key}` : key;
    if (typeof item === "string" && /address|location|property/i.test(key) && new RegExp(UNIT_DESIGNATOR, "i").test(item)) {
      result.push({ path, address: item.trim().replace(/\s+/g, " ") });
    }
    result.push(...collectJsonAddressEvidence(item, path));
  }
  return result;
}

function parseJson(value: unknown) {
  if (!value) return null;
  if (typeof value === "object") return value;
  try { return JSON.parse(String(value)); } catch { return null; }
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    const [properties] = await connection.query<PropertyRow[]>("SELECT id, address, city, state, zip FROM properties ORDER BY id");
    const existingUnitAddresses = properties.filter(property => new RegExp(UNIT_DESIGNATOR, "i").test(property.address));
    const evidence: Evidence[] = [];

    const [activityRows] = await connection.query<Array<{ id: number; entityId: number | null; entityType: string | null; action: string; details: unknown }>>(
      "SELECT id, entityId, entityType, action, details FROM activity_log WHERE details IS NOT NULL",
    );
    for (const row of activityRows) {
      for (const entry of collectJsonAddressEvidence(parseJson(row.details))) {
        evidence.push({
          source: `activity_log:${row.action}:${entry.path}`,
          recordId: row.id,
          propertyId: row.entityType === "property" ? row.entityId : null,
          candidateAddress: entry.address,
          metadata: { entityType: row.entityType, entityId: row.entityId },
        });
      }
    }

    const [proformas] = await connection.query<Array<{ id: number; propertyId: number; formData: unknown; title: string | null }>>(
      "SELECT id, propertyId, formData, title FROM proformas",
    );
    for (const row of proformas) {
      for (const entry of collectJsonAddressEvidence(parseJson(row.formData))) {
        evidence.push({
          source: `proformas:${entry.path}`,
          recordId: row.id,
          propertyId: row.propertyId,
          candidateAddress: entry.address,
          metadata: { title: row.title },
        });
      }
    }

    const [contacts] = await connection.query<Array<{ id: number; address: string | null }>>(
      `SELECT id, address FROM contacts WHERE address REGEXP ?`,
      [UNIT_DESIGNATOR],
    );
    for (const row of contacts) {
      if (!row.address) continue;
      evidence.push({ source: "contacts.address", recordId: row.id, propertyId: null, candidateAddress: row.address, metadata: {} });
    }

    const uniqueEvidence = [...new Map(evidence.map(item => [`${item.source}|${item.recordId}|${item.propertyId}|${item.candidateAddress}`, item])).values()]
      .sort((a, b) => a.candidateAddress.localeCompare(b.candidateAddress) || a.source.localeCompare(b.source));

    console.log(JSON.stringify({
      generatedAt: new Date().toISOString(),
      summary: {
        propertyCount: properties.length,
        existingPropertiesWithUnitText: existingUnitAddresses.length,
        retainedUnitAddressEvidenceCount: uniqueEvidence.length,
        distinctRetainedUnitAddresses: new Set(uniqueEvidence.map(item => item.candidateAddress.toLocaleLowerCase())).size,
        evidenceMappedToProperty: uniqueEvidence.filter(item => item.propertyId !== null).length,
      },
      existingUnitProperties: existingUnitAddresses,
      evidence: uniqueEvidence,
    }, null, 2));
  } finally {
    await connection.end();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
