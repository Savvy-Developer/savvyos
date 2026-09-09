import mysql from "mysql2/promise";
import { buildNormalizedKey } from "../server/addressNormalization";

type PropertyRow = {
  id: number;
  address: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  normalizedAddress: string | null;
};

type Correction = {
  id: number;
  address: string;
  city?: string;
  state?: string;
  zip?: string;
  evidence: string;
};

const BASE_PROPERTY_ID = 145;
const UNIT_PROPERTY_ID = 1000;
const RESTORED_BASE_PROPERTY = {
  address: "2350 West County Highway 30A",
  city: "Santa Rosa Beach",
  state: "FL",
  zip: "32459",
  addedByUserId: 504639,
  createdAt: "2026-06-20 18:25:40",
};
const CORRECTIONS: Correction[] = [
  {
    id: UNIT_PROPERTY_ID,
    address: "2350 West County Highway 30A Unit 2",
    city: "Santa Rosa Beach",
    state: "FL",
    zip: "32459",
    evidence: "Pro-forma audit history retained the original unit address.",
  },
  {
    id: 1002,
    address: "2303 Surfrider Circle Unit C",
    evidence: "Pro-forma audit history retained 2303 Surfrider Circle #C.",
  },
  {
    id: 1057,
    address: "105 York Lane Unit B",
    evidence: "Pro-forma audit history retained 105 York Ln Unit B.",
  },
  {
    id: 1058,
    address: "37 York Lane Unit C",
    evidence: "Pro-forma audit history retained 37 York Ln Unit C.",
  },
  {
    id: 1101,
    address: "2727 Ocean Isle West Boulevard Unit DD",
    city: "Ocean Isle Beach",
    state: "NC",
    zip: "28469",
    evidence: "Pro-forma audit history retained 2727 Ocean Isle West Boulevard #DD.",
  },
  {
    id: 1128,
    address: "330 South Middleton Drive Northwest Unit 1508",
    evidence: "Pro-forma audit history retained 330 S Middleton Dr NW, Unit 1508.",
  },
  {
    id: 1222,
    address: "70 Marthas Lane Unit 1-103",
    evidence: "Pro-forma audit history retained 70 Marthas Ln #1-103.",
  },
];

function keyFor(address: string, city: string, state: string, zip: string) {
  return buildNormalizedKey(address, city, state, zip);
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  let transactionStarted = false;

  try {
    await connection.beginTransaction();
    transactionStarted = true;

    const [adminRows] = await connection.query<Array<{ id: number }>>(
      "SELECT id FROM users WHERE email = ? LIMIT 1",
      ["tyler@savvy.realty"],
    );
    const auditUserId = adminRows[0]?.id ?? null;

    const [baseRows] = await connection.query<PropertyRow[]>(
      "SELECT id, address, city, state, zip, normalizedAddress FROM properties WHERE id = ? FOR UPDATE",
      [BASE_PROPERTY_ID],
    );
    if (baseRows.length) throw new Error(`Property ${BASE_PROPERTY_ID} already exists; recovery was already applied or state changed.`);

    const correctionIds = CORRECTIONS.map(correction => correction.id);
    const [properties] = await connection.query<PropertyRow[]>(
      `SELECT id, address, city, state, zip, normalizedAddress FROM properties WHERE id IN (${correctionIds.map(() => "?").join(", ")}) FOR UPDATE`,
      correctionIds,
    );
    if (properties.length !== CORRECTIONS.length) {
      throw new Error(`Expected ${CORRECTIONS.length} current properties for correction; found ${properties.length}.`);
    }
    const currentById = new Map(properties.map(property => [property.id, property]));

    const resolvedCorrections = CORRECTIONS.map(correction => {
      const current = currentById.get(correction.id);
      if (!current?.city || !current.state || !current.zip) {
        throw new Error(`Property ${correction.id} is missing current city, state, or ZIP.`);
      }
      const city = correction.city ?? current.city;
      const state = correction.state ?? current.state;
      const zip = correction.zip ?? current.zip;
      return { ...correction, city, state, zip, normalizedAddress: keyFor(correction.address, city, state, zip) };
    });

    const requestedKeys = [
      keyFor(
        RESTORED_BASE_PROPERTY.address,
        RESTORED_BASE_PROPERTY.city,
        RESTORED_BASE_PROPERTY.state,
        RESTORED_BASE_PROPERTY.zip,
      ),
      ...resolvedCorrections.map(correction => correction.normalizedAddress),
    ];
    if (new Set(requestedKeys).size !== requestedKeys.length) {
      throw new Error("The recovery plan has duplicate unit-aware address keys.");
    }

    const [conflicts] = await connection.query<Array<{ id: number; normalizedAddress: string }>>(
      `SELECT id, normalizedAddress FROM properties WHERE normalizedAddress IN (${requestedKeys.map(() => "?").join(", ")}) AND id NOT IN (${correctionIds.map(() => "?").join(", ")}) FOR UPDATE`,
      [...requestedKeys, ...correctionIds],
    );
    if (conflicts.length) {
      throw new Error(`Recovery would conflict with existing unit-aware properties: ${JSON.stringify(conflicts)}`);
    }

    const [transactionRows] = await connection.query<Array<{ id: number; propertyId: number | null }>>(
      "SELECT id, propertyId FROM transactions WHERE id = ? FOR UPDATE",
      [148],
    );
    const [contactLinkRows] = await connection.query<Array<{ id: number; propertyId: number }>>(
      "SELECT id, propertyId FROM contact_properties WHERE id = ? FOR UPDATE",
      [138],
    );
    if (transactionRows.length !== 1 || transactionRows[0].propertyId !== UNIT_PROPERTY_ID) {
      throw new Error("Transaction 148 is no longer attached to the expected merged unit property.");
    }
    if (contactLinkRows.length !== 1 || contactLinkRows[0].propertyId !== UNIT_PROPERTY_ID) {
      throw new Error("Contact-property link 138 is no longer attached to the expected merged unit property.");
    }

    // First free the base-address key currently held by the unit property, then
    // restore the historical base-address property under its original ID.
    for (const correction of resolvedCorrections) {
      await connection.execute(
        "UPDATE properties SET address = ?, city = ?, state = ?, zip = ?, normalizedAddress = ?, updatedAt = NOW() WHERE id = ?",
        [correction.address, correction.city, correction.state, correction.zip, correction.normalizedAddress, correction.id],
      );
    }

    const baseKey = requestedKeys[0];
    await connection.execute(
      `INSERT INTO properties (
        id, address, normalizedAddress, city, state, zip,
        beds, baths, sqft, propertyType, yearBuilt, listPrice, strZoning, strNotes, notes,
        addedByUserId, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?, NOW())`,
      [
        BASE_PROPERTY_ID,
        RESTORED_BASE_PROPERTY.address,
        baseKey,
        RESTORED_BASE_PROPERTY.city,
        RESTORED_BASE_PROPERTY.state,
        RESTORED_BASE_PROPERTY.zip,
        RESTORED_BASE_PROPERTY.addedByUserId,
        RESTORED_BASE_PROPERTY.createdAt,
      ],
    );

    await connection.execute("UPDATE transactions SET propertyId = ?, updatedAt = NOW() WHERE id = ?", [BASE_PROPERTY_ID, 148]);
    await connection.execute("UPDATE contact_properties SET propertyId = ? WHERE id = ?", [BASE_PROPERTY_ID, 138]);

    const auditDetails = {
      reason: "Restored unit-aware property identity after an earlier Google normalization discarded subpremise data.",
      restoredProperty: {
        id: BASE_PROPERTY_ID,
        address: [RESTORED_BASE_PROPERTY.address, RESTORED_BASE_PROPERTY.city, RESTORED_BASE_PROPERTY.state, RESTORED_BASE_PROPERTY.zip].join(", "),
        normalizedAddress: baseKey,
        restoredFromMergeAuditId: 78008,
      },
      reassignedReferences: {
        transactions: [148],
        contactPropertyLinks: [138],
        listings: [],
        proformas: [],
        communications: [],
        documents: [],
        ownershipRecords: [],
        referrals: [],
        tasks: [],
        websiteReferences: [],
      },
      correctedProperties: resolvedCorrections.map(correction => ({
        id: correction.id,
        address: [correction.address, correction.city, correction.state, correction.zip].join(", "),
        normalizedAddress: correction.normalizedAddress,
        evidence: correction.evidence,
      })),
    };
    await connection.execute(
      "INSERT INTO activity_log (userId, action, entityType, entityId, details, createdAt) VALUES (?, ?, ?, ?, ?, NOW())",
      [auditUserId, "property_unit_addresses_recovered", "property", BASE_PROPERTY_ID, JSON.stringify(auditDetails)],
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
