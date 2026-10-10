-- Multi-role membership is additive: every existing user's current primary role
-- is copied once, and no additional role is inferred or assigned by this migration.
CREATE TABLE IF NOT EXISTS `user_roles` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `role` enum('admin','agent','isa','agent_support') NOT NULL,
  `assignedById` int NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_roles_user_role_unique` (`userId`, `role`),
  KEY `user_roles_role_active_lookup_idx` (`role`, `userId`),
  CONSTRAINT `user_roles_user_fk` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `user_roles_assigned_by_fk` FOREIGN KEY (`assignedById`) REFERENCES `users` (`id`) ON DELETE SET NULL
);

INSERT IGNORE INTO `user_roles` (`userId`, `role`)
SELECT `id`, `role`
FROM `users`;
