-- Contact Intelligence foundation
-- Deliberately scoped to the new evidence-linked enrichment tables only.
-- Existing Aircall transcript and CRM tables remain unchanged.

CREATE TABLE IF NOT EXISTS `contact_intelligence_profiles` (
  `id` int NOT NULL AUTO_INCREMENT,
  `contactId` int NOT NULL,
  `profile` json NOT NULL,
  `aiSummary` text,
  `intentTier` enum('priority','active','nurture','unknown') NOT NULL DEFAULT 'unknown',
  `intentScore` int NOT NULL DEFAULT 0,
  `confidence` enum('low','medium','high') NOT NULL DEFAULT 'low',
  `sourceCallCount` int NOT NULL DEFAULT 0,
  `latestSourceAt` timestamp NULL,
  `lastAnalyzedAt` timestamp NULL,
  `extractionVersion` varchar(64) NOT NULL DEFAULT 'contact-intelligence-v1',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `contact_intelligence_profiles_contact_unique` (`contactId`),
  KEY `contact_intelligence_profiles_tier_updated_idx` (`intentTier`, `updatedAt`),
  KEY `contact_intelligence_profiles_latest_source_idx` (`latestSourceAt`),
  CONSTRAINT `contact_intelligence_profiles_contact_fk`
    FOREIGN KEY (`contactId`) REFERENCES `contacts` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `contact_intelligence_jobs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `aircallCallId` bigint NOT NULL,
  `contactId` int NOT NULL,
  `communicationId` int NOT NULL,
  `sourceHash` varchar(64) NOT NULL,
  `extractionVersion` varchar(64) NOT NULL DEFAULT 'contact-intelligence-v1',
  `status` enum('pending','processing','retrying','completed','failed') NOT NULL DEFAULT 'pending',
  `attempts` int NOT NULL DEFAULT 0,
  `nextAttemptAt` timestamp NULL,
  `leaseExpiresAt` timestamp NULL,
  `lastAttemptAt` timestamp NULL,
  `processedAt` timestamp NULL,
  `lastError` varchar(512),
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `contact_intelligence_jobs_source_unique` (`aircallCallId`, `sourceHash`),
  KEY `contact_intelligence_jobs_status_next_idx` (`status`, `nextAttemptAt`),
  KEY `contact_intelligence_jobs_contact_created_idx` (`contactId`, `createdAt`),
  CONSTRAINT `contact_intelligence_jobs_contact_fk`
    FOREIGN KEY (`contactId`) REFERENCES `contacts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `contact_intelligence_jobs_communication_fk`
    FOREIGN KEY (`communicationId`) REFERENCES `communications` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `contact_intelligence_signals` (
  `id` int NOT NULL AUTO_INCREMENT,
  `contactId` int NOT NULL,
  `profileId` int,
  `aircallCallId` bigint NOT NULL,
  `communicationId` int NOT NULL,
  `sourceHash` varchar(64) NOT NULL,
  `signalKey` varchar(96) NOT NULL,
  `value` text NOT NULL,
  `confidence` enum('low','medium','high') NOT NULL DEFAULT 'low',
  `evidenceExcerpt` text,
  `evidenceTimestamp` varchar(32),
  `sourceOccurredAt` timestamp NULL,
  `extractionVersion` varchar(64) NOT NULL DEFAULT 'contact-intelligence-v1',
  `status` enum('active','dismissed','superseded') NOT NULL DEFAULT 'active',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `contact_intelligence_signals_source_key_unique` (`aircallCallId`, `sourceHash`, `signalKey`),
  KEY `contact_intelligence_signals_contact_key_created_idx` (`contactId`, `signalKey`, `createdAt`),
  KEY `contact_intelligence_signals_call_idx` (`aircallCallId`, `communicationId`),
  CONSTRAINT `contact_intelligence_signals_contact_fk`
    FOREIGN KEY (`contactId`) REFERENCES `contacts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `contact_intelligence_signals_profile_fk`
    FOREIGN KEY (`profileId`) REFERENCES `contact_intelligence_profiles` (`id`) ON DELETE SET NULL,
  CONSTRAINT `contact_intelligence_signals_communication_fk`
    FOREIGN KEY (`communicationId`) REFERENCES `communications` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `contact_intelligence_signal_reviews` (
  `id` int NOT NULL AUTO_INCREMENT,
  `signalId` int NOT NULL,
  `reviewerId` int,
  `disposition` enum('accepted','rejected','corrected') NOT NULL,
  `overrideValue` text,
  `note` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `contact_intelligence_signal_reviews_signal_unique` (`signalId`),
  KEY `contact_intelligence_signal_reviews_reviewer_created_idx` (`reviewerId`, `createdAt`),
  CONSTRAINT `contact_intelligence_signal_reviews_signal_fk`
    FOREIGN KEY (`signalId`) REFERENCES `contact_intelligence_signals` (`id`) ON DELETE CASCADE,
  CONSTRAINT `contact_intelligence_signal_reviews_reviewer_fk`
    FOREIGN KEY (`reviewerId`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
