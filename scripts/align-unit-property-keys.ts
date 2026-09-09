import mysql from "mysql2/promise";
import { buildNormalizedKey, extractAddressUnit } from "../server/addressNormalization";

type Property = {
  id: number;
  address: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  normalizedAddress: string | null;
};

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  let transactionStarted = false;
  try {
    await connection.beginTransaction();
    transactionStarted = true;
    const [properties] = await connection.query<Property[]>(
      "SELECT id, address, city, state, zip, normalizedAddress FROM properties ORDER BY id FOR UPDATE",
    );
    const candidates = properties
      .filter(property => extractAddressUnit(property.address))
      .map(property => ({
        ...property,
        expectedNormalizedAddress: buildNormalizedKey(property.address, property.city, property.state, property.zip),
      }))
      .filter(property => property.expectedNormalizedAddress && property.expectedNormalizedAddress !== property.normalizedAddress);

    const allExpectedKeys = new Map<string, number>();
    for (const property of properties) {
      const key = buildNormalizedKey(property.address, property.city, property.state, property.zip);
      const existingId = allExpectedKeys.get(key);
      if (existingId && existingId !== property.id) {
        throw new Error(`Cannot align unit keys because properties ${existingId} and ${property.id} resolve to ${key}.`);
      }
      allExpectedKeys.set(key, property.id);
    }

    for (const property of candidates) {
      await connection.execute(
        "UPDATE properties SET normalizedAddress = ?, updatedAt = NOW() WHERE id = ?",
        [property.expectedNormalizedAddress, property.id],
      );
    }
    await connection.commit();
    transactionStarted = false;
    console.log(JSON.stringify({
      unitPropertiesReviewed: properties.filter(property => extractAddressUnit(property.address)).length,
      normalizedKeysUpdated: candidates.map(property => ({
        id: property.id,
        address: property.address,
        from: property.normalizedAddress,
        to: property.expectedNormalizedAddress,
      })),
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
