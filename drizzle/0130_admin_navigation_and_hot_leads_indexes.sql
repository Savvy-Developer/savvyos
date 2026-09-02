-- Personal administrator navigation usage, favorites, and Hot Leads query indexes.
CREATE TABLE IF NOT EXISTS `admin_navigation_preferences` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `path` varchar(512) NOT NULL,
  `isFavorite` boolean NOT NULL DEFAULT false,
  `viewCount` int NOT NULL DEFAULT 0,
  `lastViewedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `admin_navigation_preferences_user_fk`
    FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  UNIQUE KEY `admin_navigation_preferences_user_path_unique` (`userId`, `path`),
  KEY `admin_navigation_preferences_user_favorite_idx` (`userId`, `isFavorite`),
  KEY `admin_navigation_preferences_user_usage_idx` (`userId`, `viewCount`, `lastViewedAt`)
);

-- Run by scripts/apply-admin-navigation-migration.ts, which checks index state first.
ALTER TABLE `activity_log`
  ADD INDEX `idx_activity_log_hot_leads_views` (`action`, `entityType`, `createdAt`, `entityId`);
ALTER TABLE `communications`
  ADD INDEX `communications_contact_communicated_idx` (`relatedContactId`, `communicatedAt`);
