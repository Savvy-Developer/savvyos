-- Price drop alerts (Website Studio > Daily Email > Price drop alerts).
--
-- MUST BE APPLIED BEFORE THE CODE MERGES. Railway does not run these files.
-- The Studio and the public site read website_properties whole, so code that
-- names the new column fails against a table without it.
--
-- Safe order: run this, check the counts at the bottom, then merge.

-- 1. The price investors were last told about, per listing.
ALTER TABLE `website_properties`
  ADD COLUMN `priceAlertBaseline` decimal(12,2) NULL AFTER `dailyEmailSentAt`;

-- Start every listing from today's price, so the first check sends nothing
-- for price changes that happened before alerts existed.
UPDATE `website_properties` wp
  JOIN `properties` p ON p.id = wp.propertyId
  SET wp.priceAlertBaseline = p.listPrice
  WHERE wp.priceAlertBaseline IS NULL AND p.listPrice > 0;

-- 2. The on/off switch, next to the daily email settings. Off by default.
ALTER TABLE `website_daily_email_settings`
  ADD COLUMN `priceDropAlertsEnabled` boolean NOT NULL DEFAULT false AFTER `introText`;

-- 3. One row per price drop alerted.
CREATE TABLE IF NOT EXISTS `website_price_drop_alerts` (
  `id` int AUTO_INCREMENT NOT NULL,
  `idempotencyKey` varchar(96) NOT NULL,
  `propertyId` int NOT NULL,
  `oldPrice` decimal(12,2) NOT NULL,
  `newPrice` decimal(12,2) NOT NULL,
  `status` enum('sending','sent','partial','failed','no_recipients','skipped') NOT NULL,
  `recipients` int NOT NULL DEFAULT 0,
  `sent` int NOT NULL DEFAULT 0,
  `failed` int NOT NULL DEFAULT 0,
  `note` text NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `completedAt` timestamp NULL,
  CONSTRAINT `website_price_drop_alerts_id` PRIMARY KEY (`id`),
  CONSTRAINT `website_price_drop_alerts_idempotencyKey_unique` UNIQUE (`idempotencyKey`)
);
CREATE INDEX `website_price_drop_alerts_created_idx` ON `website_price_drop_alerts` (`createdAt`);

-- Check: expect 1, 1, 1.
SELECT COUNT(*) AS baseline_column FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'website_properties' AND COLUMN_NAME = 'priceAlertBaseline';
SELECT COUNT(*) AS switch_column FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'website_daily_email_settings' AND COLUMN_NAME = 'priceDropAlertsEnabled';
SELECT COUNT(*) AS alerts_table FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'website_price_drop_alerts';
