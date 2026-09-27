import mysql from "mysql2/promise";

/**
 * Applies drizzle/20260925_website_price_drop_alerts.sql at startup, the same
 * way rrMeasurableSchema and the other guards here apply theirs.
 *
 * That file was merged with PR #56 but never run on production, so every read
 * of website_properties failed with "Unknown column priceAlertBaseline": the
 * property Website tab showed "no access", the Daily Email tab failed, and the
 * price drop check errored every 30 minutes. The public site was unaffected
 * because it reads named columns.
 *
 * Additive only, and every step checks first, so it is safe to repeat:
 *   1. website_properties.priceAlertBaseline, seeded from today's list price
 *      only when the column is first created (so the first check sends
 *      nothing for price changes from before alerts existed).
 *   2. website_daily_email_settings.priceDropAlertsEnabled, default off.
 *   3. website_price_drop_alerts and its index.
 * Nothing here turns alerts on. Sending still needs the Studio switch and
 * DAILY_PROPERTY_EMAIL_ENABLED.
 *
 * A failure is logged, not thrown, so it can never stop the app starting.
 */
type Connection = Awaited<ReturnType<typeof mysql.createConnection>>;

async function count(connection: Connection, sql: string, params: string[]) {
  const [rows] = await connection.query(sql, params);
  return Number((rows as Array<{ count?: number }>)[0]?.count ?? 0);
}

const columnExists = (connection: Connection, table: string, column: string) =>
  count(
    connection,
    `SELECT COUNT(*) AS count FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  ).then(n => n > 0);

const indexExists = (connection: Connection, table: string, index: string) =>
  count(
    connection,
    `SELECT COUNT(*) AS count FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [table, index]
  ).then(n => n > 0);

export const PRICE_DROP_ALERTS_DDL = `
  CREATE TABLE IF NOT EXISTS \`website_price_drop_alerts\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`idempotencyKey\` varchar(96) NOT NULL,
    \`propertyId\` int NOT NULL,
    \`oldPrice\` decimal(12,2) NOT NULL,
    \`newPrice\` decimal(12,2) NOT NULL,
    \`status\` enum('sending','sent','partial','failed','no_recipients','skipped') NOT NULL,
    \`recipients\` int NOT NULL DEFAULT 0,
    \`sent\` int NOT NULL DEFAULT 0,
    \`failed\` int NOT NULL DEFAULT 0,
    \`note\` text NULL,
    \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    \`completedAt\` timestamp NULL,
    CONSTRAINT \`website_price_drop_alerts_id\` PRIMARY KEY (\`id\`),
    CONSTRAINT \`website_price_drop_alerts_idempotencyKey_unique\` UNIQUE (\`idempotencyKey\`)
  )
`;

let readiness: Promise<void> | null = null;

async function applyWebsitePriceDropSchema() {
  if (process.env.NODE_ENV !== "production") return;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return;
  let connection: Connection | null = null;
  try {
    connection = await mysql.createConnection(databaseUrl);

    if (!(await columnExists(connection, "website_properties", "priceAlertBaseline"))) {
      await connection.query(
        "ALTER TABLE `website_properties` ADD COLUMN `priceAlertBaseline` decimal(12,2) NULL"
      );
      await connection.query(
        `UPDATE \`website_properties\` wp
           JOIN \`properties\` p ON p.id = wp.propertyId
            SET wp.priceAlertBaseline = p.listPrice
          WHERE wp.priceAlertBaseline IS NULL AND p.listPrice > 0`
      );
      console.log("[websitePriceDropSchema] added website_properties.priceAlertBaseline");
    }

    if (!(await columnExists(connection, "website_daily_email_settings", "priceDropAlertsEnabled"))) {
      await connection.query(
        "ALTER TABLE `website_daily_email_settings` ADD COLUMN `priceDropAlertsEnabled` boolean NOT NULL DEFAULT false"
      );
      console.log("[websitePriceDropSchema] added website_daily_email_settings.priceDropAlertsEnabled");
    }

    await connection.query(PRICE_DROP_ALERTS_DDL);
    if (!(await indexExists(connection, "website_price_drop_alerts", "website_price_drop_alerts_created_idx"))) {
      await connection.query(
        "CREATE INDEX `website_price_drop_alerts_created_idx` ON `website_price_drop_alerts` (`createdAt`)"
      );
    }
  } catch (error) {
    console.error("[websitePriceDropSchema] could not apply the price drop columns", error);
  } finally {
    await connection?.end().catch(() => undefined);
  }
}

export function ensureWebsitePriceDropSchema() {
  readiness ??= applyWebsitePriceDropSchema();
  return readiness;
}
