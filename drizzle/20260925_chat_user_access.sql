-- Explicit Chat entitlement. Channel membership remains the source of truth
-- for which conversations a person can see; this table only controls whether
-- they can enter Chat and start a new personal conversation.
CREATE TABLE IF NOT EXISTS `chat_user_access` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `isEnabled` tinyint(1) NOT NULL DEFAULT 1,
  `updatedById` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `chat_user_access_user_unique` (`userId`),
  KEY `chat_user_access_enabled_user_idx` (`isEnabled`, `userId`),
  CONSTRAINT `chat_user_access_user_fk`
    FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `chat_user_access_updated_by_fk`
    FOREIGN KEY (`updatedById`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
