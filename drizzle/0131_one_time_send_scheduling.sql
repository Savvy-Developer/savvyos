ALTER TABLE `one_time_sends`
  ADD COLUMN `scheduledAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER `confirmedAt`,
  ADD COLUMN `staggerEnabled` boolean NOT NULL DEFAULT false AFTER `scheduledAt`,
  ADD COLUMN `staggerPerHour` int NULL AFTER `staggerEnabled`,
  ADD KEY `one_time_sends_status_scheduled_idx` (`status`, `scheduledAt`, `createdAt`);

ALTER TABLE `one_time_send_recipients`
  ADD COLUMN `scheduledAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER `status`,
  ADD KEY `one_time_send_recipients_send_status_scheduled_idx` (`sendId`, `status`, `scheduledAt`);
