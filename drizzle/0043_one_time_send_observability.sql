ALTER TABLE `one_time_sends`
  ADD COLUMN `deliveredCount` int NOT NULL DEFAULT 0 AFTER `failedCount`,
  ADD COLUMN `openedCount` int NOT NULL DEFAULT 0 AFTER `deliveredCount`,
  ADD COLUMN `clickedCount` int NOT NULL DEFAULT 0 AFTER `openedCount`,
  ADD COLUMN `bouncedCount` int NOT NULL DEFAULT 0 AFTER `clickedCount`,
  ADD COLUMN `complainedCount` int NOT NULL DEFAULT 0 AFTER `bouncedCount`,
  ADD COLUMN `suppressedCount` int NOT NULL DEFAULT 0 AFTER `complainedCount`,
  ADD COLUMN `repliedCount` int NOT NULL DEFAULT 0 AFTER `suppressedCount`;

ALTER TABLE `one_time_send_recipients`
  ADD COLUMN `replyToken` varchar(64) NULL AFTER `providerMessageId`,
  ADD COLUMN `deliveredAt` timestamp NULL AFTER `sentAt`,
  ADD COLUMN `openedAt` timestamp NULL AFTER `deliveredAt`,
  ADD COLUMN `clickedAt` timestamp NULL AFTER `openedAt`,
  ADD COLUMN `bouncedAt` timestamp NULL AFTER `clickedAt`,
  ADD COLUMN `complainedAt` timestamp NULL AFTER `bouncedAt`,
  ADD COLUMN `suppressedAt` timestamp NULL AFTER `complainedAt`,
  ADD COLUMN `repliedAt` timestamp NULL AFTER `suppressedAt`,
  ADD COLUMN `providerStatusCheckedAt` timestamp NULL AFTER `repliedAt`,
  ADD COLUMN `providerLastEvent` varchar(64) NULL AFTER `providerStatusCheckedAt`,
  ADD UNIQUE KEY `one_time_send_recipients_reply_token_unique` (`replyToken`),
  ADD KEY `one_time_send_recipients_provider_message_idx` (`providerMessageId`);

CREATE TABLE IF NOT EXISTS `one_time_send_message_events` (
  `id` int NOT NULL AUTO_INCREMENT,
  `recipientId` int NOT NULL,
  `provider` varchar(64) NOT NULL,
  `providerEventId` varchar(255) NULL,
  `eventType` varchar(64) NOT NULL,
  `occurredAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `metadata` json NULL,
  `receivedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `one_time_send_message_events_provider_event_unique` (`providerEventId`),
  KEY `one_time_send_message_events_recipient_type_idx` (`recipientId`, `eventType`),
  CONSTRAINT `one_time_send_message_events_recipient_fk` FOREIGN KEY (`recipientId`) REFERENCES `one_time_send_recipients` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
