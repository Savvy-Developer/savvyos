import { writeFile } from "node:fs/promises";
import mysql from "mysql2/promise";

type ReviewRow = {
  propertyId: number;
  address: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  normalizedAddress: string | null;
  createdAt: Date | string;
  addedBy: string | null;
  transactions: number;
  listings: number;
  contacts: number;
  proformas: number;
};

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");

  const connection = await mysql.createConnection(databaseUrl);
  try {
    const [rows] = await connection.query<ReviewRow[]>(`
      SELECT
        p.id AS propertyId,
        p.address,
        p.city,
        p.state,
        p.zip,
        p.normalizedAddress,
        p.createdAt,
        u.name AS addedBy,
        (SELECT COUNT(*) FROM transactions t WHERE t.propertyId = p.id) AS transactions,
        (SELECT COUNT(*) FROM listings l WHERE l.propertyId = p.id) AS listings,
        (SELECT COUNT(*) FROM contact_properties cp WHERE cp.propertyId = p.id) AS contacts,
        (SELECT COUNT(*) FROM proformas pf WHERE pf.propertyId = p.id) AS proformas
      FROM properties p
      LEFT JOIN users u ON u.id = p.addedByUserId
      WHERE p.createdAt >= '2026-09-09 18:53:59'
        AND p.createdAt < '2026-09-15 16:00:00'
      ORDER BY
        ((SELECT COUNT(*) FROM transactions t WHERE t.propertyId = p.id) +
         (SELECT COUNT(*) FROM listings l WHERE l.propertyId = p.id) +
         (SELECT COUNT(*) FROM contact_properties cp WHERE cp.propertyId = p.id) +
         (SELECT COUNT(*) FROM proformas pf WHERE pf.propertyId = p.id)) DESC,
        p.createdAt DESC
    `);

    const outputPath = process.env.OUTPUT_PATH ?? "/home/ubuntu/address-integrity-2026-09-15/unsafe-resolver-property-review.csv";
    const header = [
      "Priority", "Property ID", "Current Address", "City", "State", "ZIP", "Created At", "Added By",
      "Transactions", "Listings", "Contacts", "Proformas", "Normalized Address", "Required Review",
    ];
    const csvRows = rows.map(row => {
      const linkedRecordCount = Number(row.transactions) + Number(row.listings) + Number(row.contacts) + Number(row.proformas);
      const priority = linkedRecordCount > 0 ? "High" : "Standard";
      return [
        priority,
        row.propertyId,
        row.address,
        row.city,
        row.state,
        row.zip,
        new Date(row.createdAt).toISOString(),
        row.addedBy,
        row.transactions,
        row.listings,
        row.contacts,
        row.proformas,
        row.normalizedAddress,
        "Confirm the originally entered address with the creator before any correction",
      ].map(csvCell).join(",");
    });
    await writeFile(outputPath, `${header.map(csvCell).join(",")}\n${csvRows.join("\n")}\n`);

    const highPriority = rows.filter(row => Number(row.transactions) + Number(row.listings) + Number(row.contacts) + Number(row.proformas) > 0);
    console.log(JSON.stringify({
      reviewWindow: { start: "2026-09-09T18:53:59Z", end: "2026-09-15T16:00:00Z" },
      propertyCount: rows.length,
      highPriorityCount: highPriority.length,
      linkedRecords: {
        transactions: rows.reduce((sum, row) => sum + Number(row.transactions), 0),
        listings: rows.reduce((sum, row) => sum + Number(row.listings), 0),
        contacts: rows.reduce((sum, row) => sum + Number(row.contacts), 0),
        proformas: rows.reduce((sum, row) => sum + Number(row.proformas), 0),
      },
      outputPath,
    }, null, 2));
  } finally {
    await connection.end();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
