import mysql from "mysql2/promise";

/**
 * When each website listing was last switched to "Feature on the homepage".
 *
 * The homepage shows the most recently featured listings first, capped at
 * six (call with Tyler: no manual order; new features bump the oldest off).
 * Kept in its own small table rather than a new website_properties column:
 * every listing query selects that table's columns, so a missing column
 * there takes the whole site down (the September price-drop column did).
 * Here a missing table only costs the ordering, which falls back to the
 * publish date.
 *
 * Created before the new instance takes traffic. Additive and safe to repeat.
 * A failure is logged, not thrown.
 */
export const WEBSITE_FEATURED_LISTINGS_DDL = `
  CREATE TABLE IF NOT EXISTS \`website_featured_listings\` (
    \`websitePropertyId\` int NOT NULL,
    \`featuredAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (\`websitePropertyId\`),
    KEY \`website_featured_listings_featured_idx\` (\`featuredAt\`)
  )
`;

/**
 * Listings already featured before this table existed keep their place:
 * stamped with their publish date (else last update), once, only when they
 * have no row yet.
 */
export const WEBSITE_FEATURED_LISTINGS_BACKFILL = `
  INSERT IGNORE INTO \`website_featured_listings\` (\`websitePropertyId\`, \`featuredAt\`)
  SELECT \`id\`, COALESCE(\`publishedAt\`, \`updatedAt\`)
    FROM \`website_properties\`
   WHERE \`isFeatured\` = 1
`;

let readiness: Promise<void> | null = null;

async function applyWebsiteFeaturedSchema() {
  if (process.env.NODE_ENV !== "production") return;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return;
  let connection: Awaited<ReturnType<typeof mysql.createConnection>> | null = null;
  try {
    connection = await mysql.createConnection(databaseUrl);
    await connection.query(WEBSITE_FEATURED_LISTINGS_DDL);
    await connection.query(WEBSITE_FEATURED_LISTINGS_BACKFILL);
  } catch (error) {
    console.error("[websiteFeaturedSchema] could not create website_featured_listings", error);
  } finally {
    await connection?.end().catch(() => undefined);
  }
}

export function ensureWebsiteFeaturedSchema() {
  readiness ??= applyWebsiteFeaturedSchema();
  return readiness;
}
