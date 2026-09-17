-- SavvyOS Chat V2: direct messages, attachments, mentions, replies, reactions,
-- and per-user read cursors. Production application is performed by the
-- idempotent scripts/apply-chat-v2-migration.ts runner to avoid interactive
-- rename prompts from drizzle-kit push.

ALTER TABLE `chat_channels`
  ADD COLUMN `type` ENUM('group', 'direct') NOT NULL DEFAULT 'group' AFTER `sectionId`,
  ADD COLUMN `directKey` varchar(64) NULL AFTER `type`,
  ADD UNIQUE INDEX `chat_channels_direct_key_unique` (`directKey`);

ALTER TABLE `chat_messages`
  ADD COLUMN `parentMessageId` int NULL AFTER `senderId`,
  ADD KEY `chat_messages_parent_created_idx` (`parentMessageId`, `createdAt`, `id`),
  ADD CONSTRAINT `chat_messages_parent_fk`
    FOREIGN KEY (`parentMessageId`) REFERENCES `chat_messages` (`id`) ON DELETE SET NULL;

CREATE TABLE `chat_message_attachments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `channelId` int NOT NULL,
  `messageId` int NULL,
  `uploadedById` int NOT NULL,
  `fileName` varchar(255) NOT NULL,
  `fileUrl` text NOT NULL,
  `fileKey` varchar(500) NOT NULL,
  `mimeType` varchar(255) NOT NULL,
  `fileSize` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `chat_attachments_message_idx` (`messageId`, `id`),
  KEY `chat_attachments_channel_user_idx` (`channelId`, `uploadedById`, `messageId`),
  CONSTRAINT `chat_attachments_channel_fk` FOREIGN KEY (`channelId`) REFERENCES `chat_channels` (`id`) ON DELETE CASCADE,
  CONSTRAINT `chat_attachments_message_fk` FOREIGN KEY (`messageId`) REFERENCES `chat_messages` (`id`) ON DELETE CASCADE,
  CONSTRAINT `chat_attachments_uploaded_by_fk` FOREIGN KEY (`uploadedById`) REFERENCES `users` (`id`) ON DELETE RESTRICT
);

CREATE TABLE `chat_message_mentions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `messageId` int NOT NULL,
  `mentionedUserId` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `chat_mentions_message_user_unique` (`messageId`, `mentionedUserId`),
  KEY `chat_mentions_user_idx` (`mentionedUserId`, `messageId`),
  CONSTRAINT `chat_mentions_message_fk` FOREIGN KEY (`messageId`) REFERENCES `chat_messages` (`id`) ON DELETE CASCADE,
  CONSTRAINT `chat_mentions_user_fk` FOREIGN KEY (`mentionedUserId`) REFERENCES `users` (`id`) ON DELETE CASCADE
);

CREATE TABLE `chat_message_reactions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `messageId` int NOT NULL,
  `userId` int NOT NULL,
  `emoji` varchar(32) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `chat_reactions_message_user_emoji_unique` (`messageId`, `userId`, `emoji`),
  KEY `chat_reactions_message_idx` (`messageId`, `emoji`),
  CONSTRAINT `chat_reactions_message_fk` FOREIGN KEY (`messageId`) REFERENCES `chat_messages` (`id`) ON DELETE CASCADE,
  CONSTRAINT `chat_reactions_user_fk` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE
);

CREATE TABLE `chat_channel_reads` (
  `id` int NOT NULL AUTO_INCREMENT,
  `channelId` int NOT NULL,
  `userId` int NOT NULL,
  `lastReadMessageId` int NULL,
  `lastReadAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `chat_reads_channel_user_unique` (`channelId`, `userId`),
  KEY `chat_reads_user_channel_idx` (`userId`, `channelId`),
  CONSTRAINT `chat_reads_channel_fk` FOREIGN KEY (`channelId`) REFERENCES `chat_channels` (`id`) ON DELETE CASCADE,
  CONSTRAINT `chat_reads_user_fk` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `chat_reads_message_fk` FOREIGN KEY (`lastReadMessageId`) REFERENCES `chat_messages` (`id`) ON DELETE SET NULL
);
