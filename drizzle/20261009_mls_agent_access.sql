-- Applied at startup by server/mls/access.ts (ensureMlsAccessSchema). Kept here for the record.
-- App database, not MLS-MySQL: these are user records and are covered by the nightly backup.
CREATE TABLE IF NOT EXISTS `agent_mls_assignments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `sourceId` int NOT NULL,
  `assignedById` int NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `agent_mls_assignments_user_source_unique` (`userId`, `sourceId`),
  KEY `agent_mls_assignments_source_idx` (`sourceId`),
  CONSTRAINT `agent_mls_assignments_user_fk` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `agent_mls_assignments_assigned_by_fk` FOREIGN KEY (`assignedById`) REFERENCES `users` (`id`) ON DELETE SET NULL
);
-- defaultUserId is userId on the default row and NULL elsewhere; its unique key
-- allows at most one default view per user.
CREATE TABLE IF NOT EXISTS `user_mls_saved_views` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `name` varchar(80) NOT NULL,
  `state` json NOT NULL,
  `isDefault` tinyint(1) NOT NULL DEFAULT 0,
  `defaultUserId` int GENERATED ALWAYS AS (IF(`isDefault`, `userId`, NULL)) VIRTUAL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_mls_saved_views_user_name_unique` (`userId`, `name`),
  UNIQUE KEY `user_mls_saved_views_one_default` (`defaultUserId`),
  CONSTRAINT `user_mls_saved_views_user_fk` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE
);
