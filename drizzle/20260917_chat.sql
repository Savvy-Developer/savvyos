-- Native SavvyOS Chat. This is deliberately independent from commission groups:
-- one user can join many chat groups without affecting commission leadership.

ALTER TABLE `admin_permissions`
  ADD COLUMN `canViewChat` boolean NOT NULL DEFAULT false AFTER `canViewDashboard`,
  ADD COLUMN `canManageChat` boolean NOT NULL DEFAULT false AFTER `canViewChat`;

CREATE TABLE `chat_sections` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `description` varchar(500) NULL,
  `sortOrder` int NOT NULL DEFAULT 0,
  `isArchived` boolean NOT NULL DEFAULT false,
  `createdById` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `chat_sections_active_sort_idx` (`isArchived`, `sortOrder`, `name`),
  CONSTRAINT `chat_sections_created_by_fk`
    FOREIGN KEY (`createdById`) REFERENCES `users` (`id`) ON DELETE RESTRICT
);

CREATE TABLE `chat_channels` (
  `id` int NOT NULL AUTO_INCREMENT,
  `sectionId` int NULL,
  `name` varchar(100) NOT NULL,
  `description` varchar(500) NULL,
  `isArchived` boolean NOT NULL DEFAULT false,
  `createdById` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `chat_channels_active_section_idx` (`isArchived`, `sectionId`, `name`),
  CONSTRAINT `chat_channels_section_fk`
    FOREIGN KEY (`sectionId`) REFERENCES `chat_sections` (`id`) ON DELETE SET NULL,
  CONSTRAINT `chat_channels_created_by_fk`
    FOREIGN KEY (`createdById`) REFERENCES `users` (`id`) ON DELETE RESTRICT
);

CREATE TABLE `chat_channel_members` (
  `id` int NOT NULL AUTO_INCREMENT,
  `channelId` int NOT NULL,
  `userId` int NOT NULL,
  `addedById` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `chat_channel_members_unique` (`channelId`, `userId`),
  KEY `chat_channel_members_user_idx` (`userId`, `channelId`),
  CONSTRAINT `chat_channel_members_channel_fk`
    FOREIGN KEY (`channelId`) REFERENCES `chat_channels` (`id`) ON DELETE CASCADE,
  CONSTRAINT `chat_channel_members_user_fk`
    FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `chat_channel_members_added_by_fk`
    FOREIGN KEY (`addedById`) REFERENCES `users` (`id`) ON DELETE RESTRICT
);

CREATE TABLE `chat_messages` (
  `id` int NOT NULL AUTO_INCREMENT,
  `channelId` int NOT NULL,
  `senderId` int NOT NULL,
  `body` mediumtext NOT NULL,
  `editedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `chat_messages_channel_created_idx` (`channelId`, `createdAt`, `id`),
  KEY `chat_messages_sender_created_idx` (`senderId`, `createdAt`),
  CONSTRAINT `chat_messages_channel_fk`
    FOREIGN KEY (`channelId`) REFERENCES `chat_channels` (`id`) ON DELETE CASCADE,
  CONSTRAINT `chat_messages_sender_fk`
    FOREIGN KEY (`senderId`) REFERENCES `users` (`id`) ON DELETE RESTRICT
);
