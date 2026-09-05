-- Human resolution state for the Conversation Intelligence priority action queue.
-- A unique contact row is refreshed on each review and is considered current only
-- while it matches the latest Contact Intelligence profile version.
CREATE TABLE IF NOT EXISTS `contact_intelligence_action_reviews` (
  `id` int NOT NULL AUTO_INCREMENT,
  `contactId` int NOT NULL,
  `profileId` int NOT NULL,
  `reviewedProfileUpdatedAt` timestamp NOT NULL,
  `disposition` enum('reviewed_no_task','deferred') NOT NULL DEFAULT 'reviewed_no_task',
  `note` text,
  `reviewedById` int,
  `reviewedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `contact_intelligence_action_reviews_contact_unique` (`contactId`),
  KEY `contact_intelligence_action_reviews_profile_idx` (`profileId`, `reviewedAt`),
  KEY `contact_intelligence_action_reviews_reviewer_idx` (`reviewedById`, `reviewedAt`),
  CONSTRAINT `contact_intelligence_action_reviews_contact_fk`
    FOREIGN KEY (`contactId`) REFERENCES `contacts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `contact_intelligence_action_reviews_profile_fk`
    FOREIGN KEY (`profileId`) REFERENCES `contact_intelligence_profiles` (`id`) ON DELETE CASCADE,
  CONSTRAINT `contact_intelligence_action_reviews_reviewer_fk`
    FOREIGN KEY (`reviewedById`) REFERENCES `users` (`id`) ON DELETE SET NULL
);
