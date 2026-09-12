import { writeFile } from "node:fs/promises";
import mysql from "mysql2/promise";
import {
  buildNormalizedKey,
  buildUnitAwareStreetAddress,
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

type ProposedAddress = {
  address: string;
  city: string;
  state: string;
  zip: string;
  normalizedAddress: string;
};

// This utility is intentionally review-only. It cannot write to properties.
// Address changes must be an explicit, audited user action through the application.
const REQUEST_INTERVAL_MS = 300;
const sleep = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));
let nextRequestAt = 0;

async function reserveGoogleRequest(): Promise<void> {
  const now = Date.now();
  const scheduledAt = Math.max(now, nextRequestAt);
  nextRequestAt = scheduledAt + REQUEST_INTERVAL_MS;
  if (scheduledAt > now) await sleep(scheduledAt - now);
}

async function proposeAddress(property: Property): Promise<ProposedAddress | null> {
  await reserveGoogleRequest();
  const geocoded = await geocodeAddress(property.address, property.city, property.state, property.zip);
  if (!geocoded?.success || !geocoded.streetNumber || !geocoded.route || !geocoded.city || !geocoded.state || !geocoded.zip || !geocoded.normalizedKey) {
    return null;
  }
  return {
    address: capitalizeAddress(buildUnitAwareStreetAddress(`${geocoded.streetNumber} ${geocoded.route}`, property.address, geocoded.subpremise)),
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
    const proposals: Array<{ propertyId: number; current: Omit<Property, "id">; proposed: ProposedAddress | null; changed: boolean }> = [];

    for (const property of properties) {
      let proposed: ProposedAddress | null = null;
      try {
        proposed = await proposeAddress(property);
      } catch (error) {
        console.warn(`Google review failed for property ${property.id}:`, error instanceof Error ? error.message : error);
      }
      proposals.push({
        propertyId: property.id,
        current: {
          address: property.address,
          city: property.city,
          state: property.state,
          zip: property.zip,
          normalizedAddress: property.normalizedAddress,
        },
        proposed,
        changed: Boolean(proposed) && buildNormalizedKey(property.address, property.city, property.state, property.zip) !== proposed.normalizedAddress,
      });
    }

    const report = {
      generatedAt: new Date().toISOString(),
      mode: "review_only",
      totalProperties: properties.length,
      unresolved: proposals.filter(proposal => !proposal.proposed).length,
      proposedChanges: proposals.filter(proposal => proposal.changed).length,
      proposals,
    };
    const outputPath = process.env.OUTPUT_PATH ?? "/tmp/property-normalization-review.json";
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify({ ...report, proposals: undefined, outputPath }, null, 2));
  } finally {
    await connection.end();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
