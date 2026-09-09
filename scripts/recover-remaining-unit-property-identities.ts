import mysql from "mysql2/promise";
import { buildNormalizedKey } from "../server/addressNormalization";

type AddressCorrection = {
  id: number;
  address: string;
  city?: string;
  state?: string;
  zip?: string;
  evidence: string;
};

type RestoredProperty = {
  id: number;
  address: string;
  city: string;
  state: string;
  zip: string;
  addedByUserId: number | null;
  createdAt: string;
  evidence: string;
  copyScalarFieldsFromId?: number;
};

type PropertyRow = {
  id: number;
  address: string;
  city: string | null;
  state: string | null;
  zip: string | null;
};

const CORRECTIONS: AddressCorrection[] = [
  { id: 399, address: "309 Paridiso Place Unit B", evidence: "Listing #35 audit history records 309 Paridiso Place #B." },
  { id: 756, address: "200 Sandestin Boulevard North Unit 6170", evidence: "Listing #170 audit history records 200 N Sandestin Boulevard #6170." },
  { id: 767, address: "1201 Southport Drive Unit D", evidence: "Listing #175 audit history records 1201 Southport Drive #D." },
  { id: 832, address: "2691 Jessie Road Unit 6", evidence: "Listing #201 audit history records 2691 Jessie Road #UNIT 6." },
  { id: 837, address: "700 Cinnamon Beach Way Unit 634", evidence: "Transaction #645 audit history records 700 Cinnamon Beach Way #634." },
  { id: 864, address: "1027 West Beach Boulevard Unit 108", evidence: "Listing #202 audit history records 1027 W Beach Boulevard #108." },
  { id: 928, address: "24132 Perdido Beach Boulevard Unit 1123", evidence: "Transaction #711 audit history records 24132 Perdido Beach Boulevard Unit 1123." },
  { id: 1029, address: "145 West Pine Lands Loop Unit C", evidence: "Transaction #711 audit history records 145 W Pine Lands Loop #UNITC." },
  { id: 1067, address: "3208 White Falcon Way Unit 814", evidence: "Transaction #732 audit history records 3208 White Falcon Way #814." },
  { id: 1205, address: "3799 East County Highway 30A Unit H-13", evidence: "Transaction #806 audit history records 3799 E County Highway 30A #H-13." },
];

// The first duplicate consolidation retained a generic/base record in each
// group. These source IDs, timestamps, and creator IDs are retained in its
// immutable audit payload; their linked records identify the exact unit.
const RESTORED_PROPERTIES: RestoredProperty[] = [
  {
    id: 772,
    address: "2401 Manor Road Unit 132A",
    city: "Austin",
    state: "TX",
    zip: "78722",
    addedByUserId: 510766,
    createdAt: "2026-07-17 20:43:25",
    evidence: "Source property #772 was merged into #840; Listing #179 and Transaction #615 both retain Unit #132A.",
  },
  {
    id: 807,
    address: "375 Plantation Road Unit 5106",
    city: "Gulf Shores",
    state: "AL",
    zip: "36542",
    addedByUserId: 504542,
    createdAt: "2026-07-24 12:51:44",
    evidence: "Source property #807 was merged into #633; Listing #190 retains Unit 5106.",
  },
  {
    id: 998,
    address: "5801 Thomas Drive Unit 907",
    city: "Panama City Beach",
    state: "FL",
    zip: "32408",
    addedByUserId: 504517,
    createdAt: "2026-08-21 16:33:05",
    evidence: "Source property #998 was merged into #1087; Listing #218 and Transaction #699 retain Unit 907.",
  },
  {
    id: 1153,
    address: "5801 Thomas Drive Unit 712",
    city: "Panama City Beach",
    state: "FL",
    zip: "32408",
    addedByUserId: 503892,
    createdAt: "2026-09-01 19:15:35",
    evidence: "Source property #1153 was merged into #1087; Transaction #779 retains Unit 712.",
  },
  {
    id: 1202,
    address: "5801 Thomas Drive Unit 313",
    city: "Panama City Beach",
    state: "FL",
    zip: "32408",
    addedByUserId: 503892,
    createdAt: "2026-09-07 18:06:30",
    evidence: "Source property #1202 was merged into #1087; Transaction #804 retains Unit 313.",
  },
  {
    id: 1247,
    address: "375 Plantation Road Unit 5103",
    city: "Gulf Shores",
    state: "AL",
    zip: "36542",
    addedByUserId: 504542,
    createdAt: "2026-09-09 12:49:33",
    evidence: "Pro-forma #310 imports Zillow ZPID 196058927, whose provider response identifies 375 Plantation Road #5103.",
    copyScalarFieldsFromId: 633,
  },
];

const REASSIGNMENTS = {
  listings: [
    { id: 179, propertyId: 772 },
    { id: 190, propertyId: 807 },
    { id: 218, propertyId: 998 },
  ],
  transactions: [
    { id: 615, propertyId: 772 },
    { id: 699, propertyId: 998 },
    { id: 779, propertyId: 1153 },
    { id: 804, propertyId: 1202 },
  ],
  contactProperties: [
    { id: 620, propertyId: 772 },
    { id: 621, propertyId: 772 },
    { id: 1158, propertyId: 807 },
    { id: 1329, propertyId: 998 },
    { id: 1402, propertyId: 1153 },
    { id: 1426, propertyId: 1202 },
  ],
  proformas: [
    { id: 310, propertyId: 1247 },
  ],
};

function normalizedAddress(address: string, city: string, state: string, zip: string) {
  return buildNormalizedKey(address, city, state, zip);
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  let transactionStarted = false;
  try {
    await connection.beginTransaction();
    transactionStarted = true;

    const correctionIds = CORRECTIONS.map(item => item.id);
    const restoredIds = RESTORED_PROPERTIES.map(item => item.id);
    const [currentProperties] = await connection.query<PropertyRow[]>(
      `SELECT id, address, city, state, zip FROM properties WHERE id IN (${correctionIds.map(() => "?").join(", ")}) FOR UPDATE`,
      correctionIds,
    );
    if (currentProperties.length !== correctionIds.length) {
      throw new Error(`Expected ${correctionIds.length} current properties, found ${currentProperties.length}.`);
    }
    const currentById = new Map(currentProperties.map(row => [row.id, row]));

    const scalarSourceIds = RESTORED_PROPERTIES
      .map(property => property.copyScalarFieldsFromId)
      .filter((id): id is number => typeof id === "number");
    const scalarSources = new Map<number, Record<string, unknown>>();
    for (const id of scalarSourceIds) {
      const [rows] = await connection.query<Array<Record<string, unknown>>>(
        "SELECT beds, baths, sqft, propertyType, yearBuilt, listPrice, strZoning, strNotes, notes FROM properties WHERE id = ? FOR UPDATE",
        [id],
      );
      if (rows.length !== 1) throw new Error(`Property ${id} is unavailable for scalar-field transfer.`);
      scalarSources.set(id, rows[0]);
    }

    const [existingRestoredIds] = await connection.query<Array<{ id: number }>>(
      `SELECT id FROM properties WHERE id IN (${restoredIds.map(() => "?").join(", ")}) FOR UPDATE`,
      restoredIds,
    );
    if (existingRestoredIds.length) {
      throw new Error(`One or more recovery property IDs already exist: ${existingRestoredIds.map(row => row.id).join(", ")}.`);
    }

    const resolvedCorrections = CORRECTIONS.map(correction => {
      const current = currentById.get(correction.id);
      if (!current?.city || !current.state || !current.zip) {
        throw new Error(`Property ${correction.id} is missing city, state, or ZIP.`);
      }
      const city = correction.city ?? current.city;
      const state = correction.state ?? current.state;
      const zip = correction.zip ?? current.zip;
      return { ...correction, city, state, zip, normalizedAddress: normalizedAddress(correction.address, city, state, zip) };
    });
    const restored = RESTORED_PROPERTIES.map(property => ({
      ...property,
      normalizedAddress: normalizedAddress(property.address, property.city, property.state, property.zip),
    }));
    const desiredKeys = [...resolvedCorrections.map(item => item.normalizedAddress), ...restored.map(item => item.normalizedAddress)];
    if (new Set(desiredKeys).size !== desiredKeys.length) {
      throw new Error("The recovery contains duplicate unit-aware address keys.");
    }

    const [keyConflicts] = await connection.query<Array<{ id: number; normalizedAddress: string }>>(
      `SELECT id, normalizedAddress FROM properties WHERE normalizedAddress IN (${desiredKeys.map(() => "?").join(", ")}) AND id NOT IN (${correctionIds.map(() => "?").join(", ")}) FOR UPDATE`,
      [...desiredKeys, ...correctionIds],
    );
    if (keyConflicts.length) {
      throw new Error(`A planned unit-aware key conflicts with an existing property: ${JSON.stringify(keyConflicts)}`);
    }

    const expectedReferences = [
      ["listings", REASSIGNMENTS.listings],
      ["transactions", REASSIGNMENTS.transactions],
      ["contact_properties", REASSIGNMENTS.contactProperties],
      ["proformas", REASSIGNMENTS.proformas],
    ] as const;
    for (const [table, references] of expectedReferences) {
      const ids = references.map(reference => reference.id);
      const [rows] = await connection.query<Array<{ id: number }>>(
        `SELECT id FROM ${table} WHERE id IN (${ids.map(() => "?").join(", ")}) FOR UPDATE`,
        ids,
      );
      if (rows.length !== ids.length) throw new Error(`Expected ${ids.length} ${table} records, found ${rows.length}.`);
    }

    // Correct existing property labels first. This frees no keys used by a
    // restored record, but makes every update subject to the live unique index.
    for (const correction of resolvedCorrections) {
      await connection.execute(
        "UPDATE properties SET address = ?, city = ?, state = ?, zip = ?, normalizedAddress = ?, updatedAt = NOW() WHERE id = ?",
        [correction.address, correction.city, correction.state, correction.zip, correction.normalizedAddress, correction.id],
      );
    }

    for (const property of restored) {
      const scalarFields = property.copyScalarFieldsFromId ? scalarSources.get(property.copyScalarFieldsFromId) : null;
      await connection.execute(
        `INSERT INTO properties (
          id, address, normalizedAddress, city, state, zip,
          beds, baths, sqft, propertyType, yearBuilt, listPrice, strZoning, strNotes, notes,
          addedByUserId, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          property.id, property.address, property.normalizedAddress, property.city, property.state, property.zip,
          scalarFields?.beds ?? null, scalarFields?.baths ?? null, scalarFields?.sqft ?? null,
          scalarFields?.propertyType ?? null, scalarFields?.yearBuilt ?? null, scalarFields?.listPrice ?? null,
          scalarFields?.strZoning ?? null, scalarFields?.strNotes ?? null, scalarFields?.notes ?? null,
          property.addedByUserId, property.createdAt,
        ],
      );
    }

    for (const id of scalarSourceIds) {
      await connection.execute(
        `UPDATE properties
         SET beds = NULL, baths = NULL, sqft = NULL, propertyType = NULL, yearBuilt = NULL,
             listPrice = NULL, strZoning = NULL, strNotes = NULL, notes = NULL, updatedAt = NOW()
         WHERE id = ?`,
        [id],
      );
    }

    for (const reference of REASSIGNMENTS.listings) {
      await connection.execute("UPDATE listings SET propertyId = ?, updatedAt = NOW() WHERE id = ?", [reference.propertyId, reference.id]);
    }
    for (const reference of REASSIGNMENTS.transactions) {
      await connection.execute("UPDATE transactions SET propertyId = ?, updatedAt = NOW() WHERE id = ?", [reference.propertyId, reference.id]);
    }
    for (const reference of REASSIGNMENTS.contactProperties) {
      await connection.execute("UPDATE contact_properties SET propertyId = ? WHERE id = ?", [reference.propertyId, reference.id]);
    }
    for (const reference of REASSIGNMENTS.proformas) {
      await connection.execute("UPDATE proformas SET propertyId = ?, updatedAt = NOW() WHERE id = ?", [reference.propertyId, reference.id]);
    }

    const [adminRows] = await connection.query<Array<{ id: number }>>("SELECT id FROM users WHERE email = ? LIMIT 1", ["tyler@savvy.realty"]);
    const auditDetails = {
      reason: "Restored distinct unit identities from immutable merge and creation history after Google normalization discarded unit/subpremise data.",
      correctedInPlace: resolvedCorrections.map(item => ({ id: item.id, address: [item.address, item.city, item.state, item.zip].join(", "), evidence: item.evidence })),
      restoredProperties: restored.map(item => ({ id: item.id, address: [item.address, item.city, item.state, item.zip].join(", "), evidence: item.evidence })),
      scalarFieldsTransferred: scalarSourceIds.map(id => ({
        fromPropertyId: id,
        toPropertyId: restored.find(item => item.copyScalarFieldsFromId === id)?.id,
      })),
      reassignedReferences: REASSIGNMENTS,
      excludedAsParcelNames: [
        "Lot 7R Lone Ridge Drive, Sevierville, TN 37876",
        "339 Lot 339 Ridgefield Drive, Sevierville, TN 37876",
        "Lot 34 Pioneer Drive, Seymour, TN 37865",
        "Lot 9B-2 Geisz Way, Sevierville, TN 37862",
      ],
    };
    await connection.execute(
      "INSERT INTO activity_log (userId, action, entityType, entityId, details, createdAt) VALUES (?, ?, ?, ?, ?, NOW())",
      [adminRows[0]?.id ?? null, "property_unit_identity_recovery_completed", "property", 633, JSON.stringify(auditDetails)],
    );

    await connection.commit();
    transactionStarted = false;
    console.log(JSON.stringify({ success: true, ...auditDetails }, null, 2));
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
