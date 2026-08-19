ALTER TABLE `admin_permissions`
  ADD COLUMN `canViewCustomReports` boolean NOT NULL DEFAULT true AFTER `canViewReporting`;

CREATE TABLE IF NOT EXISTS `custom_reports` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `prompt` text NOT NULL,
  `definition` json NOT NULL,
  `createdById` int NOT NULL,
  `lastRunAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `custom_reports_created_by_idx` (`createdById`),
  CONSTRAINT `custom_reports_created_by_fk` FOREIGN KEY (`createdById`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
