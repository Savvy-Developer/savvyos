import mysql from "mysql2/promise";
import { buildNormalizedKey } from "../server/addressNormalization";

type Property = {
  id: number;
  address: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  normalizedAddress: string | null;
};

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");

const connection = await mysql.createConnection(databaseUrl);
try {
  const [properties] = await connection.query<Property[]>(
    "SELECT id, address, city, state, zip, normalizedAddress FROM properties ORDER BY id",
  );
  const groups = new Map<string, Property[]>();
  for (const property of properties) {
    const key = buildNormalizedKey(property.address, property.city, property.state, property.zip);
    if (!key) continue;
    const group = groups.get(key) ?? [];
    group.push(property);
    groups.set(key, group);
  }
  const duplicates = [...groups.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([normalizedAddress, group]) => ({
      normalizedAddress,
      properties: group.map(property => ({
        id: property.id,
        address: [property.address, property.city, property.state, property.zip].filter(Boolean).join(", "),
        storedNormalizedAddress: property.normalizedAddress,
      })),
    }));

  console.log(JSON.stringify({
    propertyCount: properties.length,
    duplicateGroupCount: duplicates.length,
    duplicatePropertyCount: duplicates.reduce((count, group) => count + group.properties.length, 0),
    duplicates,
  }, null, 2));
} finally {
  await connection.end();
}
