-- Savvy Events Console: one durable portfolio record per event, with related
-- obligations, headcount components, sponsor asks, exclusivity, and audit-safe
-- Swoogo webhook verification state.
ALTER TABLE `admin_permissions`
  ADD COLUMN `canViewEvents` boolean NOT NULL DEFAULT true;

CREATE TABLE `event_portfolio` (
  `id` int AUTO_INCREMENT NOT NULL,
  `seedKey` varchar(64) NULL,
  `name` varchar(255) NOT NULL,
  `tier` int NOT NULL DEFAULT 2,
  `status` varchar(64) NOT NULL DEFAULT 'Idea',
  `startDate` date NULL,
  `endDate` date NULL,
  `timezone` varchar(64) NOT NULL DEFAULT 'America/New_York',
  `city` varchar(255) NULL,
  `venue` varchar(255) NULL,
  `ownerName` varchar(255) NULL,
  `counterpart` varchar(255) NULL,
  `registrationPlatform` varchar(255) NULL,
  `swoogoEventId` varchar(128) NULL,
  `revenueTarget` decimal(15,2) NULL,
  `revenueBooked` decimal(15,2) NOT NULL DEFAULT 0,
  `savvyRevenueShare` decimal(5,2) NULL,
  `shareStatus` enum('written','verbal','not_agreed') NULL,
  `committedCost` decimal(15,2) NULL,
  `headcountGuarantee` int NULL,
  `headcountGuaranteeVendor` varchar(255) NULL,
  `workingHeadcount` int NULL,
  `notes` text NULL,
  `version` int NOT NULL DEFAULT 1,
  `createdById` int NULL,
  `updatedById` int NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `event_portfolio_seed_key_unique` (`seedKey`),
  UNIQUE KEY `event_portfolio_swoogo_event_id_unique` (`swoogoEventId`),
  KEY `event_portfolio_tier_start_idx` (`tier`,`startDate`),
  CONSTRAINT `event_portfolio_created_by_fk` FOREIGN KEY (`createdById`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `event_portfolio_updated_by_fk` FOREIGN KEY (`updatedById`) REFERENCES `users` (`id`) ON DELETE SET NULL
);

CREATE TABLE `event_headcount_components` (
  `id` int AUTO_INCREMENT NOT NULL,
  `eventId` int NOT NULL,
  `label` varchar(255) NOT NULL,
  `count` int NULL,
  `sourceType` varchar(255) NOT NULL DEFAULT 'Manual',
  `lastSyncedAt` timestamp NULL,
  `version` int NOT NULL DEFAULT 1,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `event_headcount_components_event_idx` (`eventId`),
  CONSTRAINT `event_headcount_components_event_fk` FOREIGN KEY (`eventId`) REFERENCES `event_portfolio` (`id`) ON DELETE CASCADE
);

CREATE TABLE `event_obligations` (
  `id` int AUTO_INCREMENT NOT NULL,
  `seedKey` varchar(64) NULL,
  `eventId` int NOT NULL,
  `dueDate` date NULL,
  `title` varchar(255) NOT NULL,
  `amountAtRisk` decimal(15,2) NULL,
  `amountNote` varchar(255) NULL,
  `isPayable` boolean NOT NULL DEFAULT true,
  `ownerName` varchar(255) NULL,
  `status` varchar(64) NOT NULL DEFAULT 'Open',
  `consequence` text NULL,
  `version` int NOT NULL DEFAULT 1,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `event_obligations_seed_key_unique` (`seedKey`),
  KEY `event_obligations_event_due_idx` (`eventId`,`dueDate`),
  KEY `event_obligations_due_idx` (`dueDate`),
  CONSTRAINT `event_obligations_event_fk` FOREIGN KEY (`eventId`) REFERENCES `event_portfolio` (`id`) ON DELETE CASCADE
);

CREATE TABLE `event_sponsors` (
  `id` int AUTO_INCREMENT NOT NULL,
  `seedKey` varchar(64) NULL,
  `companyName` varchar(255) NOT NULL,
  `category` varchar(255) NULL,
  `contactName` varchar(255) NULL,
  `notes` text NULL,
  `version` int NOT NULL DEFAULT 1,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `event_sponsors_seed_key_unique` (`seedKey`),
  KEY `event_sponsors_category_idx` (`category`)
);

CREATE TABLE `event_sponsor_asks` (
  `id` int AUTO_INCREMENT NOT NULL,
  `sponsorId` int NOT NULL,
  `eventId` int NOT NULL,
  `amount` decimal(15,2) NULL,
  `stage` enum('signed','invoiced','verbal','proposed','target','partner','speaker') NOT NULL,
  `version` int NOT NULL DEFAULT 1,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `event_sponsor_asks_sponsor_event_unique` (`sponsorId`,`eventId`),
  KEY `event_sponsor_asks_event_idx` (`eventId`),
  CONSTRAINT `event_sponsor_asks_sponsor_fk` FOREIGN KEY (`sponsorId`) REFERENCES `event_sponsors` (`id`) ON DELETE CASCADE,
  CONSTRAINT `event_sponsor_asks_event_fk` FOREIGN KEY (`eventId`) REFERENCES `event_portfolio` (`id`) ON DELETE CASCADE
);

CREATE TABLE `event_exclusivity_claims` (
  `id` int AUTO_INCREMENT NOT NULL,
  `seedKey` varchar(64) NULL,
  `eventId` int NOT NULL,
  `category` varchar(255) NOT NULL,
  `sponsorId` int NULL,
  `holderName` varchar(255) NULL,
  `isWritten` boolean NOT NULL DEFAULT false,
  `notes` text NULL,
  `version` int NOT NULL DEFAULT 1,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `event_exclusivity_claims_seed_key_unique` (`seedKey`),
  UNIQUE KEY `event_exclusivity_claims_event_category_unique` (`eventId`,`category`),
  CONSTRAINT `event_exclusivity_claims_event_fk` FOREIGN KEY (`eventId`) REFERENCES `event_portfolio` (`id`) ON DELETE CASCADE,
  CONSTRAINT `event_exclusivity_claims_sponsor_fk` FOREIGN KEY (`sponsorId`) REFERENCES `event_sponsors` (`id`) ON DELETE SET NULL
);

CREATE TABLE `event_unaffiliated_contacts` (
  `id` int AUTO_INCREMENT NOT NULL,
  `seedKey` varchar(64) NULL,
  `companyName` varchar(255) NOT NULL,
  `category` varchar(255) NULL,
  `contactName` varchar(255) NULL,
  `notes` text NULL,
  `version` int NOT NULL DEFAULT 1,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `event_unaffiliated_contacts_seed_key_unique` (`seedKey`)
);

CREATE TABLE `event_alerts` (
  `id` int AUTO_INCREMENT NOT NULL,
  `seedKey` varchar(64) NULL,
  `eventId` int NULL,
  `level` enum('blocking','warning') NOT NULL DEFAULT 'warning',
  `title` varchar(255) NOT NULL,
  `body` text NULL,
  `secondaryBody` text NULL,
  `source` varchar(500) NULL,
  `isOpen` boolean NOT NULL DEFAULT true,
  `version` int NOT NULL DEFAULT 1,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `event_alerts_seed_key_unique` (`seedKey`),
  KEY `event_alerts_open_level_idx` (`isOpen`,`level`),
  CONSTRAINT `event_alerts_event_fk` FOREIGN KEY (`eventId`) REFERENCES `event_portfolio` (`id`) ON DELETE SET NULL
);

CREATE TABLE `event_swoogo_sync_activity` (
  `id` int AUTO_INCREMENT NOT NULL,
  `eventId` int NULL,
  `providerEventId` varchar(128) NOT NULL,
  `eventType` varchar(64) NOT NULL,
  `status` enum('awaiting_source_confirmation','processed','failed') NOT NULL DEFAULT 'awaiting_source_confirmation',
  `payload` json NULL,
  `receivedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `processedAt` timestamp NULL,
  `errorMessage` text NULL,
  PRIMARY KEY (`id`),
  KEY `event_swoogo_sync_activity_provider_received_idx` (`providerEventId`,`receivedAt`),
  KEY `event_swoogo_sync_activity_event_received_idx` (`eventId`,`receivedAt`),
  CONSTRAINT `event_swoogo_sync_activity_event_fk` FOREIGN KEY (`eventId`) REFERENCES `event_portfolio` (`id`) ON DELETE SET NULL
);
