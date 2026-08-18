-- Outbound Referrals: non-destructive production migration.
-- Kept separate from the legacy inbound referral-payout feature.

ALTER TABLE `admin_permissions`
  ADD COLUMN `canViewReferrals` tinyint(1) NOT NULL DEFAULT 1,
  ADD COLUMN `canCreateReferrals` tinyint(1) NOT NULL DEFAULT 1,
  ADD COLUMN `canEditReferrals` tinyint(1) NOT NULL DEFAULT 1,
  ADD COLUMN `canManageReferralAgents` tinyint(1) NOT NULL DEFAULT 1,
  ADD COLUMN `canEditReferralSplits` tinyint(1) NOT NULL DEFAULT 1,
  ADD COLUMN `canViewReferralFinancials` tinyint(1) NOT NULL DEFAULT 1,
  ADD COLUMN `canUpdateReferralPayments` tinyint(1) NOT NULL DEFAULT 1,
  ADD COLUMN `canManageReferralAgreements` tinyint(1) NOT NULL DEFAULT 1,
  ADD COLUMN `canEditHistoricalReferrals` tinyint(1) NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS `referral_status_options` (
  `id` int NOT NULL AUTO_INCREMENT,
  `key` varchar(96) NOT NULL,
  `name` varchar(128) NOT NULL,
  `category` enum('active','closed','lost','on_hold') NOT NULL DEFAULT 'active',
  `sortOrder` int NOT NULL DEFAULT 0,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `isSystem` tinyint(1) NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `referral_status_options_key_unique` (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO `referral_status_options` (`key`, `name`, `category`, `sortOrder`, `isSystem`) VALUES
  ('referral_sent', 'Referral Sent', 'active', 10, 1),
  ('agent_accepted', 'Agent Accepted', 'active', 20, 1),
  ('agent_contacted_client', 'Agent Contacted Client', 'active', 30, 1),
  ('consultation_scheduled', 'Consultation Scheduled', 'active', 40, 1),
  ('consultation_completed', 'Consultation Completed', 'active', 50, 1),
  ('actively_working', 'Actively Working', 'active', 60, 1),
  ('listing_opportunity', 'Listing Opportunity', 'active', 70, 1),
  ('listing_signed', 'Listing Signed', 'active', 80, 1),
  ('buyer_searching', 'Buyer Searching', 'active', 90, 1),
  ('under_contract', 'Under Contract', 'active', 100, 1),
  ('closed', 'Closed', 'closed', 110, 1),
  ('lost', 'Lost', 'lost', 120, 1),
  ('on_hold', 'On Hold', 'on_hold', 130, 1);

CREATE TABLE IF NOT EXISTS `referral_agents` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `brokerage` varchar(255) NULL,
  `email` varchar(320) NULL,
  `phone` varchar(64) NULL,
  `primaryMarket` varchar(255) NULL,
  `defaultSavvyReferralPct` decimal(5,2) NULL DEFAULT 25.00,
  `licenseNumber` varchar(128) NULL,
  `licenseState` varchar(64) NULL,
  `relationshipOwnerId` int NULL,
  `notes` text NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `addedById` int NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `referral_agents_active_idx` (`isActive`, `name`),
  KEY `referral_agents_brokerage_idx` (`brokerage`),
  KEY `referral_agents_owner_idx` (`relationshipOwnerId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `referral_agent_coverage` (
  `id` int NOT NULL AUTO_INCREMENT,
  `referralAgentId` int NOT NULL,
  `state` varchar(64) NULL,
  `market` varchar(255) NULL,
  `metro` varchar(255) NULL,
  `areasServed` text NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `referral_agent_coverage_agent_idx` (`referralAgentId`),
  KEY `referral_agent_coverage_market_idx` (`state`, `market`),
  CONSTRAINT `referral_agent_coverage_agent_fk` FOREIGN KEY (`referralAgentId`) REFERENCES `referral_agents` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `referral_agreements` (
  `id` int NOT NULL AUTO_INCREMENT,
  `referralAgentId` int NOT NULL,
  `referralId` int NULL,
  `title` varchar(255) NOT NULL,
  `status` enum('not_created','sent','awaiting_signature','executed','expired','superseded') NOT NULL DEFAULT 'not_created',
  `savvyReferralPct` decimal(5,2) NULL,
  `appliesTo` enum('single_transaction','multiple_transactions','all_future') NOT NULL DEFAULT 'single_transaction',
  `sentAt` timestamp NULL,
  `executedAt` timestamp NULL,
  `effectiveAt` timestamp NULL,
  `expiresAt` timestamp NULL,
  `signedBy` varchar(255) NULL,
  `notes` text NULL,
  `createdById` int NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `referral_agreements_agent_idx` (`referralAgentId`, `status`),
  KEY `referral_agreements_referral_idx` (`referralId`),
  CONSTRAINT `referral_agreements_agent_fk` FOREIGN KEY (`referralAgentId`) REFERENCES `referral_agents` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `referrals` (
  `id` int NOT NULL AUTO_INCREMENT,
  `contactId` int NOT NULL,
  `referralAgentId` int NOT NULL,
  `relationshipOwnerId` int NULL,
  `propertyId` int NULL,
  `agreementId` int NULL,
  `parentReferralId` int NULL,
  `referralType` enum('buyer','seller','buyer_seller','other') NOT NULL,
  `statusKey` varchar(96) NOT NULL DEFAULT 'referral_sent',
  `statusCategory` enum('active','closed','lost','on_hold') NOT NULL DEFAULT 'active',
  `market` varchar(255) NULL,
  `metro` varchar(255) NULL,
  `state` varchar(64) NULL,
  `areasServed` text NULL,
  `savvyReferralPct` decimal(5,2) NOT NULL,
  `referralSentAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `agentAcceptedAt` timestamp NULL,
  `clientContactedAt` timestamp NULL,
  `consultationAt` timestamp NULL,
  `underContractAt` timestamp NULL,
  `closedAt` timestamp NULL,
  `lostAt` timestamp NULL,
  `lostReason` text NULL,
  `reassignmentReason` text NULL,
  `lastUpdateReceivedAt` timestamp NULL,
  `lastReferralAgentContactAt` timestamp NULL,
  `nextFollowUpAt` timestamp NULL,
  `notes` text NULL,
  `createdById` int NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `referrals_contact_idx` (`contactId`, `createdAt`),
  KEY `referrals_agent_idx` (`referralAgentId`, `statusCategory`),
  KEY `referrals_status_idx` (`statusKey`, `statusCategory`),
  KEY `referrals_followup_idx` (`nextFollowUpAt`),
  KEY `referrals_market_idx` (`state`, `market`),
  CONSTRAINT `referrals_agent_fk` FOREIGN KEY (`referralAgentId`) REFERENCES `referral_agents` (`id`),
  CONSTRAINT `referrals_agreement_fk` FOREIGN KEY (`agreementId`) REFERENCES `referral_agreements` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `referral_events` (
  `id` int NOT NULL AUTO_INCREMENT,
  `referralId` int NOT NULL,
  `eventType` enum('created','status_change','note','referral_agent_update','call','email','follow_up','important_date','document','reassignment','payment') NOT NULL,
  `title` varchar(255) NOT NULL,
  `body` text NULL,
  `previousStatusKey` varchar(96) NULL,
  `newStatusKey` varchar(96) NULL,
  `occurredAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `enteredById` int NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `referral_events_referral_date_idx` (`referralId`, `occurredAt`),
  CONSTRAINT `referral_events_referral_fk` FOREIGN KEY (`referralId`) REFERENCES `referrals` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `referral_transaction_links` (
  `id` int NOT NULL AUTO_INCREMENT,
  `referralId` int NOT NULL,
  `transactionId` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `referral_transaction_link_unique` (`referralId`, `transactionId`),
  KEY `referral_transaction_tx_idx` (`transactionId`),
  CONSTRAINT `referral_transaction_referral_fk` FOREIGN KEY (`referralId`) REFERENCES `referrals` (`id`) ON DELETE CASCADE,
  CONSTRAINT `referral_transaction_tx_fk` FOREIGN KEY (`transactionId`) REFERENCES `transactions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `referral_listing_links` (
  `id` int NOT NULL AUTO_INCREMENT,
  `referralId` int NOT NULL,
  `listingId` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `referral_listing_link_unique` (`referralId`, `listingId`),
  KEY `referral_listing_listing_idx` (`listingId`),
  CONSTRAINT `referral_listing_referral_fk` FOREIGN KEY (`referralId`) REFERENCES `referrals` (`id`) ON DELETE CASCADE,
  CONSTRAINT `referral_listing_listing_fk` FOREIGN KEY (`listingId`) REFERENCES `listings` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `referral_payments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `referralId` int NOT NULL,
  `transactionId` int NULL,
  `salesPrice` decimal(12,2) NULL,
  `grossCommissionIncome` decimal(12,2) NULL,
  `savvyReferralPct` decimal(5,2) NOT NULL,
  `referralFeeOwed` decimal(12,2) NOT NULL DEFAULT 0.00,
  `outsideAgentPortion` decimal(12,2) NULL,
  `paymentStatus` enum('not_yet_due','due','invoiced','processing','paid','disputed','written_off') NOT NULL DEFAULT 'not_yet_due',
  `dueAt` timestamp NULL,
  `invoicedAt` timestamp NULL,
  `paidAt` timestamp NULL,
  `paymentMethod` varchar(128) NULL,
  `paymentReference` varchar(255) NULL,
  `notes` text NULL,
  `markedPaidById` int NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `referral_payments_referral_idx` (`referralId`, `paymentStatus`),
  KEY `referral_payments_transaction_idx` (`transactionId`),
  KEY `referral_payments_status_due_idx` (`paymentStatus`, `dueAt`),
  CONSTRAINT `referral_payments_referral_fk` FOREIGN KEY (`referralId`) REFERENCES `referrals` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `referral_documents` (
  `id` int NOT NULL AUTO_INCREMENT,
  `referralAgentId` int NULL,
  `referralId` int NULL,
  `agreementId` int NULL,
  `transactionId` int NULL,
  `listingId` int NULL,
  `paymentId` int NULL,
  `name` varchar(512) NOT NULL,
  `fileKey` varchar(1024) NOT NULL,
  `fileUrl` text NOT NULL,
  `mimeType` varchar(128) NULL,
  `fileSize` bigint NULL,
  `documentType` enum('agreement','payment_proof','closing_statement','communication','other') NOT NULL DEFAULT 'other',
  `notes` text NULL,
  `uploadedById` int NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `referral_documents_referral_idx` (`referralId`),
  KEY `referral_documents_agent_idx` (`referralAgentId`),
  KEY `referral_documents_agreement_idx` (`agreementId`),
  KEY `referral_documents_payment_idx` (`paymentId`),
  CONSTRAINT `referral_documents_agent_fk` FOREIGN KEY (`referralAgentId`) REFERENCES `referral_agents` (`id`) ON DELETE CASCADE,
  CONSTRAINT `referral_documents_referral_fk` FOREIGN KEY (`referralId`) REFERENCES `referrals` (`id`) ON DELETE CASCADE,
  CONSTRAINT `referral_documents_payment_fk` FOREIGN KEY (`paymentId`) REFERENCES `referral_payments` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `referral_reassignments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `priorReferralId` int NOT NULL,
  `newReferralId` int NOT NULL,
  `previousReferralAgentId` int NOT NULL,
  `newReferralAgentId` int NOT NULL,
  `reason` text NOT NULL,
  `reassignedById` int NULL,
  `reassignedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `referral_reassignments_prior_idx` (`priorReferralId`),
  KEY `referral_reassignments_new_idx` (`newReferralId`),
  CONSTRAINT `referral_reassignments_prior_fk` FOREIGN KEY (`priorReferralId`) REFERENCES `referrals` (`id`) ON DELETE CASCADE,
  CONSTRAINT `referral_reassignments_new_fk` FOREIGN KEY (`newReferralId`) REFERENCES `referrals` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE `transactions`
  ADD COLUMN `referralId` int NULL,
  ADD COLUMN `referralAgentId` int NULL,
  ADD COLUMN `isOutsideReferral` tinyint(1) NOT NULL DEFAULT 0,
  ADD COLUMN `savvyReferralPct` decimal(5,2) NULL,
  ADD COLUMN `referralMarket` varchar(255) NULL,
  ADD KEY `transactions_referral_idx` (`referralId`),
  ADD KEY `transactions_referral_agent_idx` (`referralAgentId`);

ALTER TABLE `listings`
  ADD COLUMN `referralId` int NULL,
  ADD COLUMN `referralAgentId` int NULL,
  ADD COLUMN `isOutsideReferral` tinyint(1) NOT NULL DEFAULT 0,
  ADD COLUMN `savvyReferralPct` decimal(5,2) NULL,
  ADD COLUMN `referralMarket` varchar(255) NULL,
  ADD KEY `listings_referral_idx` (`referralId`),
  ADD KEY `listings_referral_agent_idx` (`referralAgentId`);
