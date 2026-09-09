import mysql from "mysql2/promise";
import {
  buildNormalizedKey,
  capitalizeAddress,
  capitalizeCity,
  geocodeAddress,
  normalizeState,
} from "../server/addressNormalization";

type Property = {
  id: number;
  address: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  normalizedAddress: string | null;
};

type NormalizedAddress = {
  address: string;
  city: string;
  state: string;
  zip: string;
  normalizedAddress: string;
};

const CONCURRENCY = 4;
const sleep = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));

function groupKey(property: Property): string {
  return buildNormalizedKey(property.address, property.city, property.state, property.zip) || `property:${property.id}`;
}

async function normalizePropertyAddress(property: Property): Promise<NormalizedAddress | null> {
  const geocoded = await geocodeAddress(property.address, property.city, property.state, property.zip);
  if (!geocoded?.success || !geocoded.streetNumber || !geocoded.route || !geocoded.city || !geocoded.state || !geocoded.zip || !geocoded.normalizedKey) {
    return null;
  }
  return {
    address: capitalizeAddress(`${geocoded.streetNumber} ${geocoded.route}`),
    city: capitalizeCity(geocoded.city),
    state: normalizeState(geocoded.state),
    zip: geocoded.zip,
    normalizedAddress: geocoded.normalizedKey,
  };
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");
  if (!process.env.GOOGLE_MAPS_API_KEY) throw new Error("GOOGLE_MAPS_API_KEY is required.");

  const connection = await mysql.createConnection(databaseUrl);
  try {
    const [properties] = await connection.query<Property[]>(
      "SELECT id, address, city, state, zip, normalizedAddress FROM properties ORDER BY id",
    );
    const groups = new Map<string, Property[]>();
    for (const property of properties) {
      const key = groupKey(property);
      const group = groups.get(key) ?? [];
      group.push(property);
      groups.set(key, group);
    }

    const entries = [...groups.entries()];
    const results = new Map<string, NormalizedAddress | null>();
    const failures: Array<{ ids: number[]; address: string }> = [];
    let cursor = 0;
    let completed = 0;
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, entries.length) }, async () => {
      while (cursor < entries.length) {
        const [key, group] = entries[cursor++];
        let result: NormalizedAddress | null = null;
        for (let attempt = 1; attempt <= 3 && !result; attempt += 1) {
          try {
            result = await normalizePropertyAddress(group[0]);
          } catch (error) {
            if (attempt === 3) {
              console.warn(`Google normalization failed for property ${group[0].id}:`, error instanceof Error ? error.message : error);
            } else {
              await sleep(attempt * 750);
            }
          }
        }
        if (!result) failures.push({
          ids: group.map(property => property.id),
          address: [group[0].address, group[0].city, group[0].state, group[0].zip].filter(Boolean).join(", "),
        });
        results.set(key, result);
        completed += 1;
        if (completed % 50 === 0 || completed === entries.length) {
          console.log(`Normalized ${completed}/${entries.length} distinct address groups`);
        }
      }
    }));

    let updatedProperties = 0;
    let unchangedProperties = 0;
    for (const [key, group] of entries) {
      const normalized = results.get(key);
      if (!normalized) continue;
      for (const property of group) {
        const isUnchanged = property.address === normalized.address
          && property.city === normalized.city
          && property.state === normalized.state
          && property.zip === normalized.zip
          && property.normalizedAddress === normalized.normalizedAddress;
        if (isUnchanged) {
          unchangedProperties += 1;
          continue;
        }
        await connection.execute(
          "UPDATE properties SET address = ?, city = ?, state = ?, zip = ?, normalizedAddress = ?, updatedAt = NOW() WHERE id = ?",
          [normalized.address, normalized.city, normalized.state, normalized.zip, normalized.normalizedAddress, property.id],
        );
        updatedProperties += 1;
      }
    }

    console.log(JSON.stringify({
      totalProperties: properties.length,
      distinctAddressGroups: entries.length,
      googleNormalizedGroups: entries.length - failures.length,
      googleUnresolvedGroups: failures.length,
      updatedProperties,
      unchangedProperties,
      unresolvedSample: failures.slice(0, 20),
    }, null, 2));
  } finally {
    await connection.end();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
