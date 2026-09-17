-- Chat workspace restructure: permanent company groups and per-user My Chats archives.
ALTER TABLE `chat_channels`
  ADD COLUMN `isPermanent` tinyint(1) NOT NULL DEFAULT 1 AFTER `type`;

-- Existing direct messages are personal chats; existing groups remain permanent.
UPDATE `chat_channels` SET `isPermanent` = 0 WHERE `type` = 'direct';

CREATE TABLE `chat_channel_hides` (
  `id` int NOT NULL AUTO_INCREMENT,
  `channelId` int NOT NULL,
  `userId` int NOT NULL,
  `hiddenAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `chat_channel_hides_unique` (`channelId`, `userId`),
  KEY `chat_channel_hides_user_idx` (`userId`, `channelId`),
  CONSTRAINT `chat_channel_hides_channel_fk` FOREIGN KEY (`channelId`) REFERENCES `chat_channels` (`id`) ON DELETE CASCADE,
  CONSTRAINT `chat_channel_hides_user_fk` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE
);
