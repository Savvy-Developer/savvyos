-- Public Market Match Quiz: dedicated intake, result, handoff, lender, and experimentation records.
-- Existing CRM, Agent Markets, and Smart Plan data remain untouched.

CREATE TABLE IF NOT EXISTS `market_match_quiz_settings` (
  `id` int NOT NULL DEFAULT 1,
  `enabled` boolean NOT NULL DEFAULT true,
  `publicTitle` varchar(255) NOT NULL,
  `publicSubtitle` text NULL,
  `publicCta` varchar(120) NOT NULL,
  `leadSourceId` int NULL,
  `finishPlanId` int NULL,
  `maxRecommendedMarkets` int NOT NULL DEFAULT 3,
  `maxAgentConnections` int NOT NULL DEFAULT 2,
  `dailyPropertyAudienceId` varchar(255) NULL,
  `questionConfig` json NULL,
  `aiGuidance` text NULL,
  `autoTestingEnabled` boolean NOT NULL DEFAULT false,
  `autoPromoteMinCompletions` int NOT NULL DEFAULT 100,
  `updatedById` int NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `market_match_quiz_settings_source_fk` FOREIGN KEY (`leadSourceId`) REFERENCES `lead_sources` (`id`) ON DELETE SET NULL,
  CONSTRAINT `market_match_quiz_settings_plan_fk` FOREIGN KEY (`finishPlanId`) REFERENCES `smart_plans` (`id`) ON DELETE SET NULL,
  CONSTRAINT `market_match_quiz_settings_user_fk` FOREIGN KEY (`updatedById`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `market_match_quiz_settings_singleton_ck` CHECK (`id` = 1),
  CONSTRAINT `market_match_quiz_settings_market_limit_ck` CHECK (`maxRecommendedMarkets` BETWEEN 1 AND 5),
  CONSTRAINT `market_match_quiz_settings_agent_limit_ck` CHECK (`maxAgentConnections` BETWEEN 1 AND 3)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `market_match_quiz_variants` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(160) NOT NULL,
  `description` text NULL,
  `hypothesis` text NULL,
  `status` enum('draft','published','paused','archived') NOT NULL DEFAULT 'draft',
  `trafficAllocation` int NOT NULL DEFAULT 0,
  `isControl` boolean NOT NULL DEFAULT false,
  `questionConfig` json NULL,
  `createdById` int NULL,
  `publishedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `market_match_quiz_variants_user_fk` FOREIGN KEY (`createdById`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  INDEX `market_match_quiz_variants_status_idx` (`status`,`updatedAt`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `market_match_quiz_sessions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `browserTokenHash` varchar(64) NOT NULL,
  `resumeNonce` varchar(64) NOT NULL,
  `contactId` int NOT NULL,
  `variantId` int NULL,
  `status` enum('in_progress','completed','abandoned') NOT NULL DEFAULT 'in_progress',
  `currentStep` varchar(100) NOT NULL DEFAULT 'email',
  `answers` json NOT NULL,
  `firstTouch` json NULL,
  `lastTouch` json NULL,
  `deviceCategory` varchar(24) NULL,
  `emailReminderConsent` boolean NOT NULL DEFAULT false,
  `marketingEmailConsent` boolean NOT NULL DEFAULT false,
  `marketingSmsConsent` boolean NOT NULL DEFAULT false,
  `isNewContact` boolean NOT NULL DEFAULT false,
  `isTest` boolean NOT NULL DEFAULT false,
  `lastActiveAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `completedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `market_match_quiz_sessions_token_unique` (`browserTokenHash`),
  CONSTRAINT `market_match_quiz_sessions_contact_fk` FOREIGN KEY (`contactId`) REFERENCES `contacts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `market_match_quiz_sessions_variant_fk` FOREIGN KEY (`variantId`) REFERENCES `market_match_quiz_variants` (`id`) ON DELETE SET NULL,
  INDEX `market_match_quiz_sessions_contact_idx` (`contactId`,`createdAt`),
  INDEX `market_match_quiz_sessions_status_active_idx` (`status`,`lastActiveAt`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `market_match_quiz_answer_revisions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `sessionId` int NOT NULL,
  `questionId` varchar(100) NOT NULL,
  `answer` json NULL,
  `answerSource` enum('explicit','inference') NOT NULL DEFAULT 'explicit',
  `aiInterpretation` json NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `market_match_answer_revisions_session_fk` FOREIGN KEY (`sessionId`) REFERENCES `market_match_quiz_sessions` (`id`) ON DELETE CASCADE,
  INDEX `market_match_answer_revisions_session_idx` (`sessionId`,`createdAt`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `market_match_quiz_market_settings` (
  `id` int NOT NULL AUTO_INCREMENT,
  `marketProfileId` int NOT NULL,
  `isEnabled` boolean NOT NULL DEFAULT true,
  `priorityWeight` int NOT NULL DEFAULT 0,
  `connectionCap` int NULL,
  `updatedById` int NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `market_match_quiz_market_unique` (`marketProfileId`),
  CONSTRAINT `market_match_quiz_market_settings_market_fk` FOREIGN KEY (`marketProfileId`) REFERENCES `market_profiles` (`id`) ON DELETE CASCADE,
  CONSTRAINT `market_match_quiz_market_settings_user_fk` FOREIGN KEY (`updatedById`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `market_match_quiz_agent_settings` (
  `id` int NOT NULL AUTO_INCREMENT,
  `marketProfileId` int NOT NULL,
  `agentId` int NOT NULL,
  `isEnabled` boolean NOT NULL DEFAULT true,
  `connectionCap` int NULL,
  `updatedById` int NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `market_match_quiz_agent_unique` (`marketProfileId`,`agentId`),
  CONSTRAINT `market_match_quiz_agent_settings_market_fk` FOREIGN KEY (`marketProfileId`) REFERENCES `market_profiles` (`id`) ON DELETE CASCADE,
  CONSTRAINT `market_match_quiz_agent_settings_agent_fk` FOREIGN KEY (`agentId`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `market_match_quiz_agent_settings_user_fk` FOREIGN KEY (`updatedById`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `market_match_quiz_result_snapshots` (
  `id` int NOT NULL AUTO_INCREMENT,
  `sessionId` int NOT NULL,
  `buyBox` json NOT NULL,
  `matches` json NOT NULL,
  `noFitReason` text NULL,
  `eligibilityContext` json NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `market_match_quiz_result_snapshots_session_fk` FOREIGN KEY (`sessionId`) REFERENCES `market_match_quiz_sessions` (`id`) ON DELETE CASCADE,
  INDEX `market_match_result_snapshots_session_idx` (`sessionId`,`createdAt`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `market_match_quiz_connection_requests` (
  `id` int NOT NULL AUTO_INCREMENT,
  `sessionId` int NOT NULL,
  `contactId` int NOT NULL,
  `marketProfileId` int NOT NULL,
  `agentId` int NOT NULL,
  `agentConnectionId` int NULL,
  `requestedPath` enum('introduction','schedule') NOT NULL,
  `introDeliveryStatus` enum('pending','sent','failed','skipped') NOT NULL DEFAULT 'pending',
  `introDeliveryError` text NULL,
  `introSentAt` timestamp NULL,
  `scheduleOpenedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `market_match_connection_request_unique` (`sessionId`,`marketProfileId`),
  CONSTRAINT `market_match_connection_request_session_fk` FOREIGN KEY (`sessionId`) REFERENCES `market_match_quiz_sessions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `market_match_connection_request_contact_fk` FOREIGN KEY (`contactId`) REFERENCES `contacts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `market_match_connection_request_market_fk` FOREIGN KEY (`marketProfileId`) REFERENCES `market_profiles` (`id`) ON DELETE CASCADE,
  CONSTRAINT `market_match_connection_request_agent_fk` FOREIGN KEY (`agentId`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `market_match_connection_request_connection_fk` FOREIGN KEY (`agentConnectionId`) REFERENCES `agent_connections` (`id`) ON DELETE SET NULL,
  INDEX `market_match_connection_agent_idx` (`marketProfileId`,`agentId`,`createdAt`),
  INDEX `market_match_connection_contact_idx` (`contactId`,`createdAt`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `market_match_quiz_lenders` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `email` varchar(320) NOT NULL,
  `coverage` text NULL,
  `availabilityNote` text NULL,
  `bookingLink` varchar(1024) NULL,
  `isEnabled` boolean NOT NULL DEFAULT true,
  `createdById` int NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `market_match_quiz_lenders_user_fk` FOREIGN KEY (`createdById`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `market_match_quiz_lender_requests` (
  `id` int NOT NULL AUTO_INCREMENT,
  `sessionId` int NOT NULL,
  `contactId` int NOT NULL,
  `lenderId` int NOT NULL,
  `requestedPath` enum('introduction','schedule') NOT NULL,
  `introDeliveryStatus` enum('pending','sent','failed','skipped') NOT NULL DEFAULT 'pending',
  `introDeliveryError` text NULL,
  `introSentAt` timestamp NULL,
  `scheduleOpenedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `market_match_lender_request_unique` (`sessionId`,`lenderId`),
  CONSTRAINT `market_match_lender_request_session_fk` FOREIGN KEY (`sessionId`) REFERENCES `market_match_quiz_sessions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `market_match_lender_request_contact_fk` FOREIGN KEY (`contactId`) REFERENCES `contacts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `market_match_lender_request_lender_fk` FOREIGN KEY (`lenderId`) REFERENCES `market_match_quiz_lenders` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `market_match_quiz_bookings` (
  `id` int NOT NULL AUTO_INCREMENT,
  `connectionRequestId` int NULL,
  `lenderRequestId` int NULL,
  `sessionId` int NOT NULL,
  `contactId` int NOT NULL,
  `agentId` int NULL,
  `calendlyEventUri` varchar(500) NULL,
  `calendlyInviteeUri` varchar(500) NULL,
  `status` enum('confirmed','canceled','rescheduled') NOT NULL DEFAULT 'confirmed',
  `attributionLabel` varchar(64) NOT NULL DEFAULT 'MarketMatchSurvey',
  `occurredAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `canceledAt` timestamp NULL,
  `rawPayload` json NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `market_match_booking_event_unique` (`calendlyEventUri`),
  CONSTRAINT `market_match_booking_connection_fk` FOREIGN KEY (`connectionRequestId`) REFERENCES `market_match_quiz_connection_requests` (`id`) ON DELETE SET NULL,
  CONSTRAINT `market_match_booking_lender_fk` FOREIGN KEY (`lenderRequestId`) REFERENCES `market_match_quiz_lender_requests` (`id`) ON DELETE SET NULL,
  CONSTRAINT `market_match_booking_session_fk` FOREIGN KEY (`sessionId`) REFERENCES `market_match_quiz_sessions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `market_match_booking_contact_fk` FOREIGN KEY (`contactId`) REFERENCES `contacts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `market_match_booking_agent_fk` FOREIGN KEY (`agentId`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  INDEX `market_match_booking_session_idx` (`sessionId`,`createdAt`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `market_match_quiz_events` (
  `id` int NOT NULL AUTO_INCREMENT,
  `sessionId` int NULL,
  `contactId` int NULL,
  `eventType` varchar(80) NOT NULL,
  `metadata` json NULL,
  `occurredAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `market_match_quiz_events_session_fk` FOREIGN KEY (`sessionId`) REFERENCES `market_match_quiz_sessions` (`id`) ON DELETE SET NULL,
  CONSTRAINT `market_match_quiz_events_contact_fk` FOREIGN KEY (`contactId`) REFERENCES `contacts` (`id`) ON DELETE SET NULL,
  INDEX `market_match_events_type_time_idx` (`eventType`,`occurredAt`),
  INDEX `market_match_events_session_idx` (`sessionId`,`occurredAt`)
) ENGINE=InnoDB;

-- A public control version is required even before an administrator creates a test.
INSERT INTO `market_match_quiz_variants` (`name`, `description`, `hypothesis`, `status`, `trafficAllocation`, `isControl`)
SELECT 'Control', 'Default concise market-match flow.', 'Baseline questionnaire for comparison.', 'published', 100, true
WHERE NOT EXISTS (SELECT 1 FROM `market_match_quiz_variants` WHERE `isControl` = true);

INSERT INTO `market_match_quiz_settings` (`id`, `enabled`, `publicTitle`, `publicSubtitle`, `publicCta`, `maxRecommendedMarkets`, `maxAgentConnections`, `autoTestingEnabled`, `autoPromoteMinCompletions`)
VALUES (1, true, 'Find Your STR Market Match', 'Tell us a little about your investment goals. We will show you markets aligned to your stated preferences and connect you with the appropriate Savvy STR professional when you ask us to.', 'Get my market matches', 3, 2, false, 100)
ON DUPLICATE KEY UPDATE `id` = `id`;
