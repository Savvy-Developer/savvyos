-- Investor accounts for the public website.
--
-- Deliberately separate from `users`, which holds agents, admins and ISAs. The
-- people in this table are strangers on the open internet, and a mistake in the
-- public site's permission logic must not be able to reach a staff account, a
-- commission figure, or anything else in the CRM. The partner portal already
-- establishes this pattern in SavvyOS; this follows it.
--
-- Every statement is guarded so the file can be applied more than once safely.

SET @create_accounts := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_name = 'website_accounts'
    ),
    'SELECT 1',
    'CREATE TABLE `website_accounts` (
      `id` INT NOT NULL AUTO_INCREMENT,
      `email` VARCHAR(320) NOT NULL,
      `passwordHash` VARCHAR(255) NOT NULL,
      `firstName` VARCHAR(128) NULL,
      `lastName` VARCHAR(128) NULL,
      `phone` VARCHAR(32) NULL,
      -- The SavvyOS contact this investor became. Set when an enquiry creates
      -- or matches a contact, so the agent sees one person rather than two.
      `contactId` INT NULL,
      `status` ENUM(\'active\',\'suspended\') NOT NULL DEFAULT \'active\',
      `emailVerifiedAt` TIMESTAMP NULL,
      `lastSignInAt` TIMESTAMP NULL,
      `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (`id`),
      UNIQUE KEY `website_accounts_email_unique` (`email`),
      KEY `website_accounts_contact_idx` (`contactId`)
    )'
  )
);
PREPARE s FROM @create_accounts; EXECUTE s; DEALLOCATE PREPARE s;

-- Password reset and email verification tokens. Stored hashed, single use, and
-- short lived, so a leaked database row cannot be replayed into a session.
SET @create_tokens := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_name = 'website_account_tokens'
    ),
    'SELECT 1',
    'CREATE TABLE `website_account_tokens` (
      `id` INT NOT NULL AUTO_INCREMENT,
      `accountId` INT NOT NULL,
      `purpose` ENUM(\'password_reset\',\'email_verification\') NOT NULL,
      `tokenHash` VARCHAR(64) NOT NULL,
      `expiresAt` TIMESTAMP NOT NULL,
      `usedAt` TIMESTAMP NULL,
      `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (`id`),
      UNIQUE KEY `website_account_tokens_hash_unique` (`tokenHash`),
      KEY `website_account_tokens_account_idx` (`accountId`, `purpose`),
      CONSTRAINT `website_account_tokens_account_fk`
        FOREIGN KEY (`accountId`) REFERENCES `website_accounts` (`id`) ON DELETE CASCADE
    )'
  )
);
PREPARE s FROM @create_tokens; EXECUTE s; DEALLOCATE PREPARE s;

-- Saved properties. Points at the SavvyOS property, not the website row, so a
-- listing that is unpublished and republished keeps its saves.
SET @create_saved := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_name = 'website_account_saved_properties'
    ),
    'SELECT 1',
    'CREATE TABLE `website_account_saved_properties` (
      `id` INT NOT NULL AUTO_INCREMENT,
      `accountId` INT NOT NULL,
      `propertyId` INT NOT NULL,
      `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (`id`),
      UNIQUE KEY `website_saved_account_property_unique` (`accountId`, `propertyId`),
      KEY `website_saved_property_idx` (`propertyId`),
      CONSTRAINT `website_saved_account_fk`
        FOREIGN KEY (`accountId`) REFERENCES `website_accounts` (`id`) ON DELETE CASCADE
    )'
  )
);
PREPARE s FROM @create_saved; EXECUTE s; DEALLOCATE PREPARE s;

-- What an investor wants to be emailed about. This is the control panel for the
-- daily property email, so the email feature reads from here rather than
-- inventing its own criteria.
SET @create_prefs := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_name = 'website_account_preferences'
    ),
    'SELECT 1',
    'CREATE TABLE `website_account_preferences` (
      `id` INT NOT NULL AUTO_INCREMENT,
      `accountId` INT NOT NULL,
      `notificationsEnabled` BOOLEAN NOT NULL DEFAULT TRUE,
      `emailFrequency` ENUM(\'daily\',\'weekly\',\'never\') NOT NULL DEFAULT \'daily\',
      `budgetMin` DECIMAL(12,2) NULL,
      `budgetMax` DECIMAL(12,2) NULL,
      `minBedrooms` INT NULL,
      `investmentTimeline` VARCHAR(64) NULL,
      -- Market profile ids the investor subscribed to, as a JSON array.
      `marketProfileIds` JSON NOT NULL,
      `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (`id`),
      UNIQUE KEY `website_preferences_account_unique` (`accountId`),
      CONSTRAINT `website_preferences_account_fk`
        FOREIGN KEY (`accountId`) REFERENCES `website_accounts` (`id`) ON DELETE CASCADE
    )'
  )
);
PREPARE s FROM @create_prefs; EXECUTE s; DEALLOCATE PREPARE s;

-- Recently viewed properties. One row per account and property, with the time
-- updated on a repeat view, so the table cannot grow without bound from a
-- single investor refreshing one listing.
SET @create_history := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_name = 'website_account_property_views'
    ),
    'SELECT 1',
    'CREATE TABLE `website_account_property_views` (
      `id` INT NOT NULL AUTO_INCREMENT,
      `accountId` INT NOT NULL,
      `propertyId` INT NOT NULL,
      `viewCount` INT NOT NULL DEFAULT 1,
      `lastViewedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (`id`),
      UNIQUE KEY `website_views_account_property_unique` (`accountId`, `propertyId`),
      KEY `website_views_recent_idx` (`accountId`, `lastViewedAt`),
      CONSTRAINT `website_views_account_fk`
        FOREIGN KEY (`accountId`) REFERENCES `website_accounts` (`id`) ON DELETE CASCADE
    )'
  )
);
PREPARE s FROM @create_history; EXECUTE s; DEALLOCATE PREPARE s;
