CREATE TABLE `aircall_webhook_events` (
  `id` int AUTO_INCREMENT NOT NULL,
  `eventKey` varchar(160) NOT NULL,
  `aircallCallId` bigint NOT NULL,
  `eventType` varchar(96) NOT NULL,
  `payload` json NOT NULL,
  `status` enum('pending','processing','retrying','completed') NOT NULL DEFAULT 'pending',
  `attempts` int NOT NULL DEFAULT 0,
  `nextAttemptAt` timestamp NULL,
  `leaseExpiresAt` timestamp NULL,
  `lastAttemptAt` timestamp NULL,
  `processedAt` timestamp NULL,
  `lastError` varchar(512) NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `aircall_webhook_events_id` PRIMARY KEY(`id`),
  CONSTRAINT `aircall_webhook_events_event_key_unique` UNIQUE(`eventKey`)
);

CREATE INDEX `aircall_webhook_events_status_next_attempt_idx`
  ON `aircall_webhook_events` (`status`, `nextAttemptAt`);
CREATE INDEX `aircall_webhook_events_call_event_idx`
  ON `aircall_webhook_events` (`aircallCallId`, `eventType`);

CREATE TABLE `aircall_integration_state` (
  `id` int NOT NULL,
  `webhookId` varchar(128) NULL,
  `webhookToken` varchar(255) NULL,
  `lastVerifiedAt` timestamp NULL,
  `lastWebhookRepairAt` timestamp NULL,
  `lastAlertAt` timestamp NULL,
  `lastError` varchar(512) NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `aircall_integration_state_id` PRIMARY KEY(`id`)
);
