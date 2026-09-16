-- R&R Scorecard Governance
-- Extends the existing scorecard without replacing its metric or result history.

ALTER TABLE `rr_scorecard_metrics`
  ADD COLUMN `definitionKey` varchar(64) NULL AFTER `name`,
  ADD COLUMN `definition` text NULL AFTER `definitionKey`,
  ADD COLUMN `ownerId` int NULL AFTER `responsibilityId`,
  ADD COLUMN `measurementPeriod` varchar(32) NOT NULL DEFAULT 'monthly' AFTER `frequency`,
  ADD COLUMN `rollingDays` int NULL AFTER `measurementPeriod`,
  ADD COLUMN `reviewFrequency` varchar(32) NOT NULL DEFAULT 'weekly' AFTER `rollingDays`,
  ADD COLUMN `reportingSchedule` text NULL AFTER `reviewFrequency`,
  ADD COLUMN `unit` varchar(32) NOT NULL DEFAULT 'count' AFTER `reportingSchedule`,
  ADD COLUMN `targetMinimum` decimal(16,4) NULL AFTER `targetValue`,
  ADD COLUMN `targetMaximum` decimal(16,4) NULL AFTER `targetMinimum`,
  ADD COLUMN `comparisonRule` varchar(32) NOT NULL DEFAULT 'at_least' AFTER `targetMaximum`,
  ADD COLUMN `warningThreshold` decimal(16,4) NULL AFTER `comparisonRule`,
  ADD COLUMN `calculationMethod` varchar(32) NOT NULL DEFAULT 'count' AFTER `rollupMethod`,
  ADD COLUMN `formulaExpression` text NULL AFTER `calculationMethod`,
  ADD COLUMN `manualInputDefinitions` json NULL AFTER `formulaExpression`,
  ADD COLUMN `zeroDenominatorLabel` varchar(255) NULL AFTER `manualInputDefinitions`,
  ADD COLUMN `archivedAt` timestamp NULL AFTER `status`;

ALTER TABLE `rr_scorecard_metrics`
  MODIFY COLUMN `metricType` enum('manual','automatic','hybrid') NOT NULL DEFAULT 'manual',
  MODIFY COLUMN `rollupMethod` enum('sum','average','count','unique_count','weighted_average','percentage','latest') NOT NULL DEFAULT 'sum';

ALTER TABLE `rr_metric_values`
  MODIFY COLUMN `actualValue` decimal(18,4) NULL,
  MODIFY COLUMN `valueSource` enum('manual','automatic','hybrid') NOT NULL DEFAULT 'manual',
  ADD COLUMN `resultState` varchar(32) NOT NULL DEFAULT 'reported' AFTER `actualValue`,
  ADD COLUMN `eventLabel` varchar(255) NULL AFTER `note`,
  ADD COLUMN `eventDate` date NULL AFTER `eventLabel`,
  ADD COLUMN `supportingInputs` json NULL AFTER `eventDate`;

ALTER TABLE `rr_metric_auto_configs`
  MODIFY COLUMN `calculation` enum('count','unique_count','sum','average','weighted_average','percentage','latest') NOT NULL,
  ADD COLUMN `weightField` varchar(64) NULL AFTER `valueField`,
  ADD COLUMN `outputKey` varchar(64) NULL AFTER `weightField`;

UPDATE `rr_scorecard_metrics` m
JOIN `roles_responsibilities` r ON r.`id` = m.`responsibilityId`
SET m.`ownerId` = r.`ownerId`
WHERE m.`ownerId` IS NULL;

ALTER TABLE `rr_scorecard_metrics`
  ADD CONSTRAINT `rr_metrics_owner_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  ADD KEY `rr_metrics_owner_status_idx` (`ownerId`, `status`);

-- Existing scorecards retain their original cadence and historic target. New
-- target records make all changes from this migration forward auditable.
UPDATE `rr_scorecard_metrics`
SET `measurementPeriod` = `frequency`,
    `comparisonRule` = CASE WHEN `performanceDirection` = 'lower' THEN 'at_most' ELSE 'at_least' END
WHERE `measurementPeriod` = 'monthly' AND `frequency` <> 'monthly';

CREATE TABLE IF NOT EXISTS `rr_metric_target_history` (
  `id` int NOT NULL AUTO_INCREMENT,
  `metricId` int NOT NULL,
  `effectiveDate` date NOT NULL,
  `targetValue` decimal(16,4) NULL,
  `targetMinimum` decimal(16,4) NULL,
  `targetMaximum` decimal(16,4) NULL,
  `comparisonRule` varchar(32) NOT NULL,
  `warningThreshold` decimal(16,4) NULL,
  `note` text NULL,
  `createdById` int NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `rr_metric_target_history_lookup_idx` (`metricId`, `effectiveDate`),
  CONSTRAINT `rr_metric_target_history_metric_fk` FOREIGN KEY (`metricId`) REFERENCES `rr_scorecard_metrics` (`id`) ON DELETE CASCADE,
  CONSTRAINT `rr_metric_target_history_creator_fk` FOREIGN KEY (`createdById`) REFERENCES `users` (`id`) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS `rr_metric_change_history` (
  `id` int NOT NULL AUTO_INCREMENT,
  `metricId` int NOT NULL,
  `changeType` varchar(64) NOT NULL,
  `details` json NULL,
  `createdById` int NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `rr_metric_change_history_metric_idx` (`metricId`, `createdAt`),
  CONSTRAINT `rr_metric_change_history_metric_fk` FOREIGN KEY (`metricId`) REFERENCES `rr_scorecard_metrics` (`id`) ON DELETE CASCADE,
  CONSTRAINT `rr_metric_change_history_creator_fk` FOREIGN KEY (`createdById`) REFERENCES `users` (`id`) ON DELETE SET NULL
);

INSERT INTO `rr_metric_target_history` (`metricId`, `effectiveDate`, `targetValue`, `targetMinimum`, `targetMaximum`, `comparisonRule`, `warningThreshold`, `createdById`)
SELECT m.`id`, DATE(m.`createdAt`), m.`targetValue`, m.`targetMinimum`, m.`targetMaximum`, m.`comparisonRule`, m.`warningThreshold`, m.`createdById`
FROM `rr_scorecard_metrics` m
LEFT JOIN `rr_metric_target_history` h ON h.`metricId` = m.`id`
WHERE h.`id` IS NULL;

INSERT INTO `rr_metric_change_history` (`metricId`, `changeType`, `details`, `createdById`)
SELECT m.`id`, 'metric_governance_initialized', JSON_OBJECT('source', '20260915_rr_scorecard_governance'), m.`createdById`
FROM `rr_scorecard_metrics` m
LEFT JOIN `rr_metric_change_history` h ON h.`metricId` = m.`id` AND h.`changeType` = 'metric_governance_initialized'
WHERE h.`id` IS NULL;
