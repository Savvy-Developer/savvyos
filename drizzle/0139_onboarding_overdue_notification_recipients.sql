CREATE TABLE IF NOT EXISTS `onboarding_overdue_notification_recipients` (
  `id` int NOT NULL AUTO_INCREMENT,
  `recipientUserIds` json NULL,
  `includeAffectedAgent` boolean NOT NULL DEFAULT false,
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  `updatedBy` int NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `onboarding_overdue_notification_recipients_updatedBy_users_id_fk`
    FOREIGN KEY (`updatedBy`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
