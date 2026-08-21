-- Resend Inbox: durable threads, messages, per-admin read state, and access control.
-- Applied manually because drizzle-kit push attempted unrelated destructive changes
-- against legacy tables with foreign-key dependencies.

ALTER TABLE `admin_permissions`
  ADD COLUMN `canViewResendInbox` boolean NOT NULL DEFAULT false;

CREATE TABLE `resend_inbox_threads` (
  `id` int AUTO_INCREMENT NOT NULL,
  `subject` varchar(1024) NOT NULL,
  `normalizedSubject` varchar(1024) NOT NULL,
  `receivedAddress` varchar(320) NOT NULL,
  `participantEmail` varchar(320) NOT NULL,
  `lastMessageAt` timestamp NOT NULL,
  `lastIncomingAt` timestamp NOT NULL,
  `archivedAt` timestamp NULL,
  `archivedById` int NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `resend_inbox_threads_id` PRIMARY KEY(`id`),
  CONSTRAINT `resend_inbox_threads_archived_by_fk` FOREIGN KEY (`archivedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION
);

CREATE INDEX `resend_inbox_threads_active_idx` ON `resend_inbox_threads` (`archivedAt`, `lastIncomingAt`);
CREATE INDEX `resend_inbox_threads_participant_idx` ON `resend_inbox_threads` (`participantEmail`, `lastIncomingAt`);

CREATE TABLE `resend_inbox_messages` (
  `id` int AUTO_INCREMENT NOT NULL,
  `threadId` int NOT NULL,
  `direction` enum('inbound','outbound') NOT NULL,
  `providerEmailId` varchar(255) NULL,
  `internetMessageId` varchar(768) NULL,
  `inReplyToMessageId` varchar(1024) NULL,
  `fromEmail` varchar(320) NOT NULL,
  `fromName` varchar(320) NULL,
  `toRecipients` json NOT NULL,
  `ccRecipients` json NULL,
  `replyToRecipients` json NULL,
  `subject` varchar(1024) NOT NULL,
  `bodyHtml` mediumtext NULL,
  `bodyText` mediumtext NULL,
  `headers` json NULL,
  `attachments` json NULL,
  `sentById` int NULL,
  `receivedAt` timestamp NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `resend_inbox_messages_id` PRIMARY KEY(`id`),
  CONSTRAINT `resend_inbox_messages_provider_email_id_unq` UNIQUE(`providerEmailId`),
  CONSTRAINT `resend_inbox_messages_thread_fk` FOREIGN KEY (`threadId`) REFERENCES `resend_inbox_threads`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT `resend_inbox_messages_sent_by_fk` FOREIGN KEY (`sentById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION
);

CREATE INDEX `resend_inbox_messages_thread_idx` ON `resend_inbox_messages` (`threadId`, `receivedAt`);
CREATE INDEX `resend_inbox_messages_internet_id_idx` ON `resend_inbox_messages` (`internetMessageId`);

CREATE TABLE `resend_inbox_thread_reads` (
  `id` int AUTO_INCREMENT NOT NULL,
  `threadId` int NOT NULL,
  `userId` int NOT NULL,
  `lastReadAt` timestamp NULL,
  `markedUnread` boolean NOT NULL DEFAULT false,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `resend_inbox_thread_reads_id` PRIMARY KEY(`id`),
  CONSTRAINT `resend_inbox_thread_reads_user_thread_unq` UNIQUE(`threadId`, `userId`),
  CONSTRAINT `resend_inbox_thread_reads_thread_fk` FOREIGN KEY (`threadId`) REFERENCES `resend_inbox_threads`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT `resend_inbox_thread_reads_user_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE INDEX `resend_inbox_thread_reads_user_idx` ON `resend_inbox_thread_reads` (`userId`, `markedUnread`);
