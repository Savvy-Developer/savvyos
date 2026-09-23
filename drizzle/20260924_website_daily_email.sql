-- Daily property email, rebuilt in SavvyOS (Website Studio > Daily Email).
--
-- MUST BE APPLIED BEFORE THE CODE MERGES. Railway does not run these files.
-- The Website Studio and the public site read website_properties whole, so
-- code that names the three new columns fails against a table without them.
--
-- Safe order: run this, check the counts at the bottom, then merge.

-- 1. The review queue lives on the listing itself.
ALTER TABLE `website_properties`
  ADD COLUMN `dailyEmailApprovedAt` timestamp NULL AFTER `publishedAt`,
  ADD COLUMN `dailyEmailApprovedById` int NULL AFTER `dailyEmailApprovedAt`,
  ADD COLUMN `dailyEmailSentAt` timestamp NULL AFTER `dailyEmailApprovedById`;

-- Listings already live today are treated as already sent, so the first
-- email carries only listings published from now on rather than every
-- property on the site. An admin can still send any of them on purpose.
UPDATE `website_properties`
  SET `dailyEmailSentAt` = NOW()
  WHERE `status` = 'published' AND `dailyEmailSentAt` IS NULL;

-- 2. Settings, one row. Off until someone switches it on in the Studio, and
--    the server's DAILY_PROPERTY_EMAIL_ENABLED stays the master switch.
CREATE TABLE IF NOT EXISTS `website_daily_email_settings` (
  `id` int AUTO_INCREMENT NOT NULL,
  `singletonKey` varchar(32) NOT NULL DEFAULT 'primary',
  `enabled` boolean NOT NULL DEFAULT false,
  `sendHourEt` int NOT NULL DEFAULT 17,
  `segmentIds` json NULL,
  `internalRecipients` json NULL,
  `personalEmailsEnabled` boolean NOT NULL DEFAULT true,
  `subjectTemplate` varchar(200) NULL,
  `introText` text NULL,
  `updatedById` int NULL,
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `website_daily_email_settings_id` PRIMARY KEY (`id`),
  CONSTRAINT `website_daily_email_settings_singletonKey_unique` UNIQUE (`singletonKey`)
);

INSERT IGNORE INTO `website_daily_email_settings` (`singletonKey`) VALUES ('primary');

-- 3. One row per send, test or skip.
CREATE TABLE IF NOT EXISTS `website_daily_email_runs` (
  `id` int AUTO_INCREMENT NOT NULL,
  `idempotencyKey` varchar(64) NULL,
  `runDate` varchar(10) NOT NULL,
  `trigger` enum('scheduled','manual','test') NOT NULL,
  `status` enum('sending','sent','partial','failed','skipped') NOT NULL,
  `subject` varchar(255) NULL,
  `propertyIds` json NULL,
  `propertyCount` int NOT NULL DEFAULT 0,
  `broadcastIds` json NULL,
  `broadcastError` text NULL,
  `personalSent` int NOT NULL DEFAULT 0,
  `personalFailed` int NOT NULL DEFAULT 0,
  `internalSent` int NOT NULL DEFAULT 0,
  `note` text NULL,
  `sentById` int NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `completedAt` timestamp NULL,
  CONSTRAINT `website_daily_email_runs_id` PRIMARY KEY (`id`),
  CONSTRAINT `website_daily_email_runs_idempotencyKey_unique` UNIQUE (`idempotencyKey`)
);
CREATE INDEX `website_daily_email_runs_date_idx` ON `website_daily_email_runs` (`runDate`);

-- 4. Opens and clicks. A row only when an email is opened or clicked.
CREATE TABLE IF NOT EXISTS `website_daily_email_engagement` (
  `id` int AUTO_INCREMENT NOT NULL,
  `runId` int NOT NULL,
  `emailId` varchar(128) NOT NULL,
  `openedAt` timestamp NULL,
  `clickedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `website_daily_email_engagement_id` PRIMARY KEY (`id`),
  CONSTRAINT `website_daily_email_engagement_run_email` UNIQUE (`runId`, `emailId`)
);

CREATE TABLE IF NOT EXISTS `website_daily_email_clicks` (
  `id` int AUTO_INCREMENT NOT NULL,
  `runId` int NOT NULL,
  `emailId` varchar(128) NOT NULL,
  `linkKey` varchar(191) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `website_daily_email_clicks_id` PRIMARY KEY (`id`),
  CONSTRAINT `website_daily_email_clicks_run_email_link` UNIQUE (`runId`, `emailId`, `linkKey`)
);
CREATE INDEX `website_daily_email_clicks_run_link` ON `website_daily_email_clicks` (`runId`, `linkKey`);

-- Check: expect 3 new website_properties columns, 4 new tables, 1 settings row.
SELECT COUNT(*) AS new_columns FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'website_properties'
    AND COLUMN_NAME IN ('dailyEmailApprovedAt', 'dailyEmailApprovedById', 'dailyEmailSentAt');
SELECT COUNT(*) AS new_tables FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME IN ('website_daily_email_settings', 'website_daily_email_runs', 'website_daily_email_engagement', 'website_daily_email_clicks');
SELECT COUNT(*) AS settings_rows FROM `website_daily_email_settings`;
