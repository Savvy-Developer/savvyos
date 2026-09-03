-- Agent Markets keeps the existing market_profiles identity and assignment
-- relationships used by reporting while replacing static profiles with
-- source-backed, generated market intelligence.
CREATE TABLE IF NOT EXISTS `market_profile_sources` (
  `id` int NOT NULL AUTO_INCREMENT,
  `marketProfileId` int NOT NULL,
  `sourceType` enum('file','note') NOT NULL,
  `title` varchar(512) NOT NULL,
  `content` mediumtext NULL,
  `fileUrl` text NULL,
  `fileKey` varchar(1024) NULL,
  `fileName` varchar(512) NULL,
  `mimeType` varchar(128) NULL,
  `fileSize` bigint NULL,
  `extractionStatus` enum('ready','pending','failed') NOT NULL DEFAULT 'ready',
  `createdById` int NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `market_profile_sources_market_created_idx` (`marketProfileId`, `createdAt`),
  CONSTRAINT `market_profile_sources_market_fk` FOREIGN KEY (`marketProfileId`) REFERENCES `market_profiles` (`id`) ON DELETE CASCADE,
  CONSTRAINT `market_profile_sources_user_fk` FOREIGN KEY (`createdById`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `market_intelligence_profiles` (
  `id` int NOT NULL AUTO_INCREMENT,
  `marketProfileId` int NOT NULL,
  `profileJson` json NULL,
  `evidenceSnapshot` mediumtext NULL,
  `sourceSnapshot` json NULL,
  `status` enum('ready','refreshing','failed') NOT NULL DEFAULT 'refreshing',
  `model` varchar(128) NULL,
  `refreshReason` enum('manual','source_added','scheduled') NULL,
  `generatedAt` timestamp NULL,
  `errorMessage` text NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `market_intelligence_profile_market_unique` (`marketProfileId`),
  KEY `market_intelligence_profile_status_updated_idx` (`status`, `updatedAt`),
  CONSTRAINT `market_intelligence_profile_market_fk` FOREIGN KEY (`marketProfileId`) REFERENCES `market_profiles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Existing primary market selections predate the assignment table in some
-- records. Materialize them as primary Agent Markets assignments so reporting
-- and market stewardship remain intact.
INSERT INTO `market_agent_assignments`
  (`marketProfileId`, `agentId`, `isPrimary`, `isAvailable`, `maxLeadCapacity`, `currentLeadCount`)
SELECT u.`marketProfileId`, u.`id`, 1, 1, 20, 0
FROM `users` u
WHERE u.`role` = 'agent'
  AND u.`marketProfileId` IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM `market_agent_assignments` maa
    WHERE maa.`marketProfileId` = u.`marketProfileId`
      AND maa.`agentId` = u.`id`
  );

UPDATE `market_agent_assignments` maa
INNER JOIN `users` u ON u.`id` = maa.`agentId`
SET maa.`isPrimary` = (maa.`marketProfileId` = u.`marketProfileId`)
WHERE u.`role` = 'agent';

DELETE duplicate_assignment
FROM `market_agent_assignments` duplicate_assignment
INNER JOIN `market_agent_assignments` retained_assignment
  ON retained_assignment.`marketProfileId` = duplicate_assignment.`marketProfileId`
 AND retained_assignment.`agentId` = duplicate_assignment.`agentId`
 AND retained_assignment.`id` < duplicate_assignment.`id`;

ALTER TABLE `market_agent_assignments`
  ADD UNIQUE KEY `market_agent_assignment_market_agent_unique` (`marketProfileId`, `agentId`);

-- Agent Markets is an administrator-only Agent Success Team capability.
ALTER TABLE `admin_permissions`
  ADD COLUMN `canViewAgentMarkets` boolean NOT NULL DEFAULT true AFTER `canViewAdminApprovals`;

ALTER TABLE `admin_permissions`
  DROP COLUMN `canViewMarketMatch`;
