-- Structured Market Match fit profiles are generated from the living Market AI
-- profile. They keep public recommendation scoring evidence-backed and avoid
-- using unstructured narrative text as a ranking rubric.
CREATE TABLE IF NOT EXISTS `market_match_fit_profiles` (
  `id` int NOT NULL AUTO_INCREMENT,
  `marketProfileId` int NOT NULL,
  `profileJson` json NULL,
  `sourceIntelligenceHash` varchar(64) NULL,
  `status` enum('ready','refreshing','failed') NOT NULL DEFAULT 'refreshing',
  `model` varchar(128) NULL,
  `generatedAt` timestamp NULL,
  `errorMessage` text NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `market_match_fit_profile_market_unique` (`marketProfileId`),
  KEY `market_match_fit_profile_status_updated_idx` (`status`,`updatedAt`),
  CONSTRAINT `market_match_fit_profile_market_fk`
    FOREIGN KEY (`marketProfileId`) REFERENCES `market_profiles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;
