-- Roles & Responsibilities module
-- This migration is intentionally additive: it creates only new module tables
-- and the new admin permission column. It never alters or removes existing
-- business data, assessment tables, or unrelated schema objects.

CREATE TABLE IF NOT EXISTS `roles_responsibilities` (
  `id` int AUTO_INCREMENT NOT NULL,
  `title` varchar(255) NOT NULL,
  `ownerId` int NOT NULL,
  `description` text,
  `cadence` enum('ongoing','daily','weekly','biweekly','monthly','quarterly','annually','as_needed','custom') NOT NULL DEFAULT 'ongoing',
  `cadenceDetails` text,
  `status` enum('active','archived') NOT NULL DEFAULT 'active',
  `sortOrder` int NOT NULL DEFAULT 0,
  `createdById` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `roles_responsibilities_id_pk` PRIMARY KEY (`id`),
  CONSTRAINT `roles_responsibilities_owner_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE RESTRICT,
  CONSTRAINT `roles_responsibilities_creator_fk` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  KEY `rr_owner_status_idx` (`ownerId`,`status`,`sortOrder`),
  KEY `rr_title_idx` (`title`)
);

CREATE TABLE IF NOT EXISTS `rr_sops` (
  `id` int AUTO_INCREMENT NOT NULL,
  `responsibilityId` int NOT NULL,
  `title` varchar(255) NOT NULL,
  `overview` text,
  `sortOrder` int NOT NULL DEFAULT 0,
  `createdById` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `rr_sops_id_pk` PRIMARY KEY (`id`),
  CONSTRAINT `rr_sops_responsibility_fk` FOREIGN KEY (`responsibilityId`) REFERENCES `roles_responsibilities`(`id`) ON DELETE CASCADE,
  CONSTRAINT `rr_sops_creator_fk` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  KEY `rr_sops_responsibility_idx` (`responsibilityId`,`sortOrder`)
);

CREATE TABLE IF NOT EXISTS `rr_sop_steps` (
  `id` int AUTO_INCREMENT NOT NULL,
  `sopId` int NOT NULL,
  `instruction` text NOT NULL,
  `details` text,
  `showCheckbox` boolean NOT NULL DEFAULT TRUE,
  `resourceLabel` varchar(255),
  `resourceUrl` text,
  `sortOrder` int NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `rr_sop_steps_id_pk` PRIMARY KEY (`id`),
  CONSTRAINT `rr_sop_steps_sop_fk` FOREIGN KEY (`sopId`) REFERENCES `rr_sops`(`id`) ON DELETE CASCADE,
  KEY `rr_sop_steps_sop_idx` (`sopId`,`sortOrder`)
);

CREATE TABLE IF NOT EXISTS `rr_resources` (
  `id` int AUTO_INCREMENT NOT NULL,
  `responsibilityId` int,
  `sopId` int,
  `resourceType` enum('link','document','file','savvy_page','template','form','video') NOT NULL DEFAULT 'link',
  `label` varchar(255) NOT NULL,
  `url` text,
  `userDocumentId` int,
  `sortOrder` int NOT NULL DEFAULT 0,
  `createdById` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `rr_resources_id_pk` PRIMARY KEY (`id`),
  CONSTRAINT `rr_resources_responsibility_fk` FOREIGN KEY (`responsibilityId`) REFERENCES `roles_responsibilities`(`id`) ON DELETE CASCADE,
  CONSTRAINT `rr_resources_sop_fk` FOREIGN KEY (`sopId`) REFERENCES `rr_sops`(`id`) ON DELETE CASCADE,
  CONSTRAINT `rr_resources_user_document_fk` FOREIGN KEY (`userDocumentId`) REFERENCES `user_documents`(`id`) ON DELETE SET NULL,
  CONSTRAINT `rr_resources_creator_fk` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  KEY `rr_resources_responsibility_idx` (`responsibilityId`,`sortOrder`),
  KEY `rr_resources_sop_idx` (`sopId`,`sortOrder`)
);

CREATE TABLE IF NOT EXISTS `rr_task_links` (
  `id` int AUTO_INCREMENT NOT NULL,
  `responsibilityId` int NOT NULL,
  `taskId` int NOT NULL,
  `createdById` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `rr_task_links_id_pk` PRIMARY KEY (`id`),
  CONSTRAINT `rr_task_links_responsibility_fk` FOREIGN KEY (`responsibilityId`) REFERENCES `roles_responsibilities`(`id`) ON DELETE CASCADE,
  CONSTRAINT `rr_task_links_task_fk` FOREIGN KEY (`taskId`) REFERENCES `tasks`(`id`) ON DELETE CASCADE,
  CONSTRAINT `rr_task_links_creator_fk` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  CONSTRAINT `rr_task_links_task_unique` UNIQUE (`taskId`),
  KEY `rr_task_links_responsibility_idx` (`responsibilityId`)
);

CREATE TABLE IF NOT EXISTS `rr_scorecard_metrics` (
  `id` int AUTO_INCREMENT NOT NULL,
  `responsibilityId` int NOT NULL,
  `name` varchar(255) NOT NULL,
  `metricType` enum('manual','automatic') NOT NULL DEFAULT 'manual',
  `frequency` enum('weekly','monthly','quarterly','annually') NOT NULL DEFAULT 'monthly',
  `targetValue` decimal(16,4),
  `performanceDirection` enum('higher','lower') NOT NULL DEFAULT 'higher',
  `displayFormat` enum('number','percentage','currency','duration') NOT NULL DEFAULT 'number',
  `rollupMethod` enum('sum','average','count','percentage','latest') NOT NULL DEFAULT 'sum',
  `isCumulative` boolean NOT NULL DEFAULT FALSE,
  `cumulativeReset` enum('monthly','quarterly','annually','never'),
  `status` enum('active','inactive') NOT NULL DEFAULT 'active',
  `createdById` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `rr_scorecard_metrics_id_pk` PRIMARY KEY (`id`),
  CONSTRAINT `rr_metrics_responsibility_fk` FOREIGN KEY (`responsibilityId`) REFERENCES `roles_responsibilities`(`id`) ON DELETE CASCADE,
  CONSTRAINT `rr_metrics_creator_fk` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  KEY `rr_metrics_responsibility_idx` (`responsibilityId`,`status`),
  KEY `rr_metrics_name_idx` (`name`)
);

CREATE TABLE IF NOT EXISTS `rr_metric_values` (
  `id` int AUTO_INCREMENT NOT NULL,
  `metricId` int NOT NULL,
  `periodStart` date NOT NULL,
  `periodEnd` date NOT NULL,
  `actualValue` decimal(18,4) NOT NULL,
  `note` text,
  `valueSource` enum('manual','automatic') NOT NULL DEFAULT 'manual',
  `calculationMetadata` json,
  `enteredById` int,
  `enteredAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `rr_metric_values_id_pk` PRIMARY KEY (`id`),
  CONSTRAINT `rr_metric_values_metric_fk` FOREIGN KEY (`metricId`) REFERENCES `rr_scorecard_metrics`(`id`) ON DELETE CASCADE,
  CONSTRAINT `rr_metric_values_entered_by_fk` FOREIGN KEY (`enteredById`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  CONSTRAINT `rr_metric_period_unique` UNIQUE (`metricId`,`periodStart`,`periodEnd`),
  KEY `rr_metric_values_period_idx` (`metricId`,`periodEnd`)
);

CREATE TABLE IF NOT EXISTS `rr_metric_auto_configs` (
  `id` int AUTO_INCREMENT NOT NULL,
  `metricId` int NOT NULL,
  `dataSource` enum('tasks','transactions','agent_connections') NOT NULL,
  `dateField` varchar(64) NOT NULL,
  `calculation` enum('count','sum','average','percentage','latest') NOT NULL,
  `valueField` varchar(64),
  `filters` json,
  `numeratorFilters` json,
  `denominatorFilters` json,
  `lastRefreshedAt` timestamp NULL,
  `lastRecordCount` int,
  `lastError` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `rr_metric_auto_configs_id_pk` PRIMARY KEY (`id`),
  CONSTRAINT `rr_metric_auto_configs_metric_fk` FOREIGN KEY (`metricId`) REFERENCES `rr_scorecard_metrics`(`id`) ON DELETE CASCADE,
  CONSTRAINT `rr_metric_auto_configs_metric_unique` UNIQUE (`metricId`)
);

ALTER TABLE `admin_permissions`
  ADD COLUMN `canViewRolesResponsibilities` boolean NOT NULL DEFAULT TRUE;
