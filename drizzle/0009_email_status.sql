ALTER TABLE `contacts` ADD COLUMN `emailStatus` enum('valid','bounced','unsubscribed') NOT NULL DEFAULT 'valid';
ALTER TABLE `contacts` ADD COLUMN `emailBouncedAt` timestamp;
ALTER TABLE `contacts` ADD COLUMN `emailUnsubscribedAt` timestamp;
