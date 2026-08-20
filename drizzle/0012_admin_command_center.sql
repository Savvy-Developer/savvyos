CREATE TABLE IF NOT EXISTS `dashboard_settings` (
  `id` int AUTO_INCREMENT NOT NULL,
  `goalYear` int NOT NULL,
  `companyGciGoal` decimal(15,2),
  `companyVolumeGoal` decimal(15,2),
  `companyUnitsGoal` int,
  `newLeadSlaHours` int NOT NULL DEFAULT 24,
  `pipelineStaleDays` int NOT NULL DEFAULT 14,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `dashboard_settings_id` PRIMARY KEY(`id`),
  CONSTRAINT `dashboard_settings_goal_year_unq` UNIQUE(`goalYear`)
);

CREATE TABLE IF NOT EXISTS `dashboard_alert_reviews` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `alertKey` varchar(255) NOT NULL,
  `status` enum('reviewed','snoozed') NOT NULL,
  `snoozedUntil` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `dashboard_alert_reviews_id` PRIMARY KEY(`id`),
  CONSTRAINT `dashboard_alert_reviews_user_alert_unq` UNIQUE(`userId`,`alertKey`),
  CONSTRAINT `dashboard_alert_reviews_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE
);

CREATE INDEX `dashboard_alert_reviews_user_status_idx` ON `dashboard_alert_reviews` (`userId`,`status`,`snoozedUntil`);
