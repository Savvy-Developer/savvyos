-- Prompt 8: unambiguous SavvyOS company goals, display-only Pulse mappings,
-- and observation records that never create work without a human action.
CREATE TABLE IF NOT EXISTS `company_goals` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(255) NOT NULL,
  `description` text NULL,
  `ownerId` int NULL,
  `year` int NOT NULL,
  `targetValue` decimal(15,2) NULL,
  `currentValue` decimal(15,2) NULL,
  `unit` varchar(64) NOT NULL DEFAULT 'number',
  `status` enum('active','inactive','completed') NOT NULL DEFAULT 'active',
  `createdById` int NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `company_goals_year_status_idx` (`year`, `status`),
  KEY `company_goals_owner_idx` (`ownerId`, `status`),
  CONSTRAINT `company_goals_owner_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  CONSTRAINT `company_goals_creator_fk` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS `meeting_goals` (
  `id` varchar(36) NOT NULL,
  `meetingId` varchar(36) NOT NULL,
  `savvyosGoalId` int NULL,
  `sortOrder` int NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `meeting_goal_unique` (`meetingId`, `savvyosGoalId`),
  KEY `meeting_goal_meeting_idx` (`meetingId`, `sortOrder`),
  CONSTRAINT `meeting_goal_meeting_fk` FOREIGN KEY (`meetingId`) REFERENCES `pulse_meetings`(`id`) ON DELETE CASCADE,
  CONSTRAINT `meeting_goal_source_fk` FOREIGN KEY (`savvyosGoalId`) REFERENCES `company_goals`(`id`) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS `meeting_rocks` (
  `id` varchar(36) NOT NULL,
  `meetingId` varchar(36) NOT NULL,
  `workItemId` varchar(36) NOT NULL,
  `sortOrder` int NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `meeting_rock_unique` (`meetingId`, `workItemId`),
  KEY `meeting_rock_meeting_idx` (`meetingId`, `sortOrder`),
  CONSTRAINT `meeting_rock_meeting_fk` FOREIGN KEY (`meetingId`) REFERENCES `pulse_meetings`(`id`) ON DELETE CASCADE,
  CONSTRAINT `meeting_rock_item_fk` FOREIGN KEY (`workItemId`) REFERENCES `pulse_work_items`(`id`) ON DELETE CASCADE
);

-- Existing rock homes remain visible in their home meeting after the mapping
-- becomes the display authority. A duplicate-safe LEFT JOIN supports reruns.
INSERT INTO `meeting_rocks` (`id`, `meetingId`, `workItemId`, `sortOrder`)
SELECT UUID(), w.`meetingId`, w.`id`, w.`sortOrder`
FROM `pulse_work_items` w
LEFT JOIN `meeting_rocks` mr ON mr.`meetingId` = w.`meetingId` AND mr.`workItemId` = w.`id`
WHERE w.`type` = 'rock' AND w.`meetingId` IS NOT NULL AND w.`deletedAt` IS NULL AND mr.`id` IS NULL;

ALTER TABLE `pulse_work_items` MODIFY COLUMN `assigneeId` int NULL;
ALTER TABLE `pulse_work_items` ADD COLUMN `savvyosMetricId` int NULL AFTER `isProposed`;
ALTER TABLE `pulse_work_items` ADD CONSTRAINT `pulse_work_item_metric_fk` FOREIGN KEY (`savvyosMetricId`) REFERENCES `rr_scorecard_metrics`(`id`) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS `ai_observations` (
  `id` varchar(36) NOT NULL,
  `savvyosMetricId` int NOT NULL,
  `observation` text NOT NULL,
  `triggerRule` varchar(128) NOT NULL,
  `generatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `raisedAsIssueId` varchar(36) NULL,
  `dismissedById` int NULL,
  `dismissedAt` timestamp NULL,
  `dismissReason` text NULL,
  PRIMARY KEY (`id`),
  KEY `ai_observation_metric_generated_idx` (`savvyosMetricId`, `generatedAt`),
  KEY `ai_observation_open_idx` (`raisedAsIssueId`, `dismissedAt`),
  CONSTRAINT `ai_observation_metric_fk` FOREIGN KEY (`savvyosMetricId`) REFERENCES `rr_scorecard_metrics`(`id`) ON DELETE CASCADE,
  CONSTRAINT `ai_observation_issue_fk` FOREIGN KEY (`raisedAsIssueId`) REFERENCES `pulse_work_items`(`id`) ON DELETE SET NULL,
  CONSTRAINT `ai_observation_dismisser_fk` FOREIGN KEY (`dismissedById`) REFERENCES `users`(`id`) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS `ai_observation_rules` (
  `id` varchar(36) NOT NULL,
  `ruleKey` varchar(128) NOT NULL,
  `label` varchar(255) NOT NULL,
  `isEnabled` boolean NOT NULL DEFAULT true,
  `config` json NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ai_observation_rules_key_unique` (`ruleKey`)
);

INSERT INTO `ai_observation_rules` (`id`, `ruleKey`, `label`, `isEnabled`, `config`) VALUES
  (UUID(), 'consecutive_decline', 'Three or more consecutive periods declining', true, JSON_OBJECT('minimumPeriods', 3)),
  (UUID(), 'below_target', 'Twenty percent or more below target for two or more periods', true, JSON_OBJECT('minimumPeriods', 2, 'thresholdPercent', 20)),
  (UUID(), 'missing_data', 'Missing data for two or more periods', true, JSON_OBJECT('minimumPeriods', 2)),
  (UUID(), 'inverse_correlation', 'Metric moves opposite to a correlated metric', true, JSON_OBJECT('minimumPeriods', 3))
ON DUPLICATE KEY UPDATE `label` = VALUES(`label`), `config` = VALUES(`config`);
