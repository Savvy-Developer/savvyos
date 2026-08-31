-- Pulse V2: recurring L10 workspaces, dated sessions, durable reports, and publish-on-close cascades.
-- This migration is intentionally scoped to Pulse so it can be reviewed independently of the legacy schema journal.

ALTER TABLE `pulse_meetings`
  ADD COLUMN `facilitatorId` int NULL,
  ADD COLUMN `scorecardHistoryWeeks` int NOT NULL DEFAULT 8,
  ADD COLUMN `scorecardDeadlineDay` enum('monday','tuesday','wednesday','thursday','friday','saturday','sunday') NULL,
  ADD COLUMN `scorecardDeadlineTime` varchar(8) NULL,
  ADD COLUMN `archivedAt` timestamp NULL,
  ADD CONSTRAINT `pulse_meetings_facilitator_fk` FOREIGN KEY (`facilitatorId`) REFERENCES `users`(`id`) ON DELETE SET NULL;

UPDATE `pulse_meetings`
SET `facilitatorId` = `ownerId`
WHERE `facilitatorId` IS NULL;

CREATE TABLE `pulse_meeting_sessions` (
  `id` varchar(36) NOT NULL,
  `meetingId` varchar(36) NOT NULL,
  `scheduledFor` timestamp NOT NULL,
  `status` enum('running','paused','closed') NOT NULL DEFAULT 'running',
  `activeStep` varchar(64) NOT NULL DEFAULT 'segue',
  `startedById` int NOT NULL,
  `startedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `pausedAt` timestamp NULL,
  `closedAt` timestamp NULL,
  `elapsedSeconds` int NOT NULL DEFAULT 0,
  `attendeeIds` json NOT NULL,
  `notes` text NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `pulse_session_meeting_status_idx` (`meetingId`,`status`,`startedAt`),
  KEY `pulse_session_meeting_date_idx` (`meetingId`,`scheduledFor`),
  CONSTRAINT `pulse_session_meeting_fk` FOREIGN KEY (`meetingId`) REFERENCES `pulse_meetings`(`id`) ON DELETE CASCADE,
  CONSTRAINT `pulse_session_started_by_fk` FOREIGN KEY (`startedById`) REFERENCES `users`(`id`)
);

CREATE TABLE `pulse_session_ratings` (
  `id` varchar(36) NOT NULL,
  `sessionId` varchar(36) NOT NULL,
  `personId` int NOT NULL,
  `rating` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `pulse_session_rating_unique` (`sessionId`,`personId`),
  CONSTRAINT `pulse_session_rating_range` CHECK (`rating` >= 1 AND `rating` <= 10),
  CONSTRAINT `pulse_session_rating_session_fk` FOREIGN KEY (`sessionId`) REFERENCES `pulse_meeting_sessions`(`id`) ON DELETE CASCADE,
  CONSTRAINT `pulse_session_rating_person_fk` FOREIGN KEY (`personId`) REFERENCES `users`(`id`) ON DELETE CASCADE
);

CREATE TABLE `pulse_session_reports` (
  `id` varchar(36) NOT NULL,
  `sessionId` varchar(36) NOT NULL,
  `meetingId` varchar(36) NOT NULL,
  `ratingAverage` varchar(16) NULL,
  `ratingCount` int NOT NULL DEFAULT 0,
  `scorecardSnapshot` json NULL,
  `rocksSnapshot` json NULL,
  `commitmentsSnapshot` json NULL,
  `resolvedIssuesSnapshot` json NULL,
  `cascadesSnapshot` json NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `pulse_session_report_unique` (`sessionId`),
  KEY `pulse_session_report_meeting_idx` (`meetingId`,`createdAt`),
  CONSTRAINT `pulse_session_report_session_fk` FOREIGN KEY (`sessionId`) REFERENCES `pulse_meeting_sessions`(`id`) ON DELETE CASCADE,
  CONSTRAINT `pulse_session_report_meeting_fk` FOREIGN KEY (`meetingId`) REFERENCES `pulse_meetings`(`id`) ON DELETE CASCADE
);

ALTER TABLE `pulse_work_items`
  ADD COLUMN `sourceSessionId` varchar(36) NULL,
  ADD COLUMN `resolvedInSessionId` varchar(36) NULL,
  ADD KEY `pulse_work_items_source_session_idx` (`sourceSessionId`,`deletedAt`),
  ADD KEY `pulse_work_items_resolved_session_idx` (`resolvedInSessionId`,`deletedAt`),
  ADD CONSTRAINT `pulse_work_items_source_session_fk` FOREIGN KEY (`sourceSessionId`) REFERENCES `pulse_meeting_sessions`(`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `pulse_work_items_resolved_session_fk` FOREIGN KEY (`resolvedInSessionId`) REFERENCES `pulse_meeting_sessions`(`id`) ON DELETE SET NULL;

ALTER TABLE `pulse_meeting_updates`
  ADD COLUMN `sessionId` varchar(36) NULL,
  ADD KEY `pulse_meeting_updates_session_idx` (`sessionId`,`deletedAt`),
  ADD CONSTRAINT `pulse_meeting_updates_session_fk` FOREIGN KEY (`sessionId`) REFERENCES `pulse_meeting_sessions`(`id`) ON DELETE SET NULL;

ALTER TABLE `pulse_cascading_messages`
  ADD COLUMN `sessionId` varchar(36) NULL,
  ADD COLUMN `deliveryStatus` enum('draft','published') NOT NULL DEFAULT 'published',
  ADD COLUMN `publishedAt` timestamp NULL,
  ADD KEY `pulse_cascading_session_status_idx` (`sessionId`,`deliveryStatus`,`createdAt`),
  ADD CONSTRAINT `pulse_cascading_session_fk` FOREIGN KEY (`sessionId`) REFERENCES `pulse_meeting_sessions`(`id`) ON DELETE SET NULL;

-- Pulse access is self-governing. The initial matrix administrator may grant and revoke every other Pulse capability.
INSERT INTO `pulse_permissions` (`id`,`personId`,`capability`,`allowed`,`grantedById`)
SELECT UUID(), u.`id`, 'manage_permission_matrix', true, u.`id`
FROM `users` u
WHERE LOWER(u.`email`) = 'tyler@savvy.realty'
ON DUPLICATE KEY UPDATE `allowed` = VALUES(`allowed`), `grantedById` = VALUES(`grantedById`);

INSERT INTO `pulse_permissions` (`id`,`personId`,`capability`,`allowed`,`grantedById`)
SELECT UUID(), u.`id`, 'manage_l10s', true, u.`id`
FROM `users` u
WHERE LOWER(u.`email`) = 'tyler@savvy.realty'
ON DUPLICATE KEY UPDATE `allowed` = VALUES(`allowed`), `grantedById` = VALUES(`grantedById`);

INSERT INTO `pulse_permissions` (`id`,`personId`,`capability`,`allowed`,`grantedById`)
SELECT UUID(), u.`id`, 'run_l10s', true, u.`id`
FROM `users` u
WHERE LOWER(u.`email`) = 'tyler@savvy.realty'
ON DUPLICATE KEY UPDATE `allowed` = VALUES(`allowed`), `grantedById` = VALUES(`grantedById`);

INSERT INTO `pulse_permissions` (`id`,`personId`,`capability`,`allowed`,`grantedById`)
SELECT UUID(), u.`id`, 'view_all_l10_health', true, u.`id`
FROM `users` u
WHERE LOWER(u.`email`) = 'tyler@savvy.realty'
ON DUPLICATE KEY UPDATE `allowed` = VALUES(`allowed`), `grantedById` = VALUES(`grantedById`);
