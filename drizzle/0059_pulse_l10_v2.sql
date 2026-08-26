ALTER TABLE `pulse_meetings`
  ADD COLUMN `segueResetDay` enum('monday','tuesday','wednesday','thursday','friday','saturday','sunday') NULL,
  ADD COLUMN `headlinesResetDay` enum('monday','tuesday','wednesday','thursday','friday','saturday','sunday') NULL,
  ADD COLUMN `notificationConfig` json NULL;

ALTER TABLE `pulse_work_items`
  ADD COLUMN `definitionOfDone` text NULL,
  ADD COLUMN `assignmentGroupId` varchar(36) NULL;

ALTER TABLE `pulse_meeting_updates`
  ADD COLUMN `weekOf` date NULL,
  ADD COLUMN `tone` enum('green','amber','red') NULL;

CREATE TABLE `pulse_rock_raci_assignments` (
  `id` varchar(36) NOT NULL,
  `workItemId` varchar(36) NOT NULL,
  `personId` int NOT NULL,
  `role` enum('responsible','accountable','consulted','informed') NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deletedAt` timestamp NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `pulse_rock_raci_unique` (`workItemId`,`personId`,`role`),
  KEY `pulse_rock_raci_item_idx` (`workItemId`,`deletedAt`),
  KEY `pulse_rock_raci_person_idx` (`personId`,`deletedAt`),
  CONSTRAINT `pulse_rock_raci_item_fk` FOREIGN KEY (`workItemId`) REFERENCES `pulse_work_items`(`id`) ON DELETE CASCADE,
  CONSTRAINT `pulse_rock_raci_person_fk` FOREIGN KEY (`personId`) REFERENCES `users`(`id`) ON DELETE CASCADE
);

CREATE TABLE `pulse_meeting_todos` (
  `id` varchar(36) NOT NULL,
  `meetingId` varchar(36) NOT NULL,
  `workItemId` varchar(36) NOT NULL,
  `sortOrder` int NOT NULL DEFAULT 0,
  `addedById` int NOT NULL,
  `addedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `pulse_meeting_todo_unique` (`meetingId`,`workItemId`),
  KEY `pulse_meeting_todo_meeting_idx` (`meetingId`,`sortOrder`),
  CONSTRAINT `pulse_meeting_todo_meeting_fk` FOREIGN KEY (`meetingId`) REFERENCES `pulse_meetings`(`id`) ON DELETE CASCADE,
  CONSTRAINT `pulse_meeting_todo_item_fk` FOREIGN KEY (`workItemId`) REFERENCES `pulse_work_items`(`id`) ON DELETE CASCADE,
  CONSTRAINT `pulse_meeting_todo_added_by_fk` FOREIGN KEY (`addedById`) REFERENCES `users`(`id`) ON DELETE RESTRICT
);

CREATE TABLE `pulse_weekly_submissions` (
  `id` varchar(36) NOT NULL,
  `meetingId` varchar(36) NOT NULL,
  `personId` int NOT NULL,
  `weekOf` date NOT NULL,
  `submittedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `confirmationSummary` json NULL,
  `emailSentAt` timestamp NULL,
  `withdrawnAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `pulse_weekly_submission_unique` (`meetingId`,`personId`,`weekOf`),
  KEY `pulse_weekly_submission_person_idx` (`personId`,`weekOf`,`withdrawnAt`),
  CONSTRAINT `pulse_weekly_submission_meeting_fk` FOREIGN KEY (`meetingId`) REFERENCES `pulse_meetings`(`id`) ON DELETE CASCADE,
  CONSTRAINT `pulse_weekly_submission_person_fk` FOREIGN KEY (`personId`) REFERENCES `users`(`id`) ON DELETE CASCADE
);

CREATE TABLE `pulse_permissions` (
  `id` varchar(36) NOT NULL,
  `personId` int NOT NULL,
  `capability` varchar(64) NOT NULL,
  `allowed` boolean NOT NULL DEFAULT false,
  `grantedById` int NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `pulse_permission_unique` (`personId`,`capability`),
  KEY `pulse_permission_capability_idx` (`capability`,`allowed`),
  CONSTRAINT `pulse_permission_person_fk` FOREIGN KEY (`personId`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  CONSTRAINT `pulse_permission_granted_by_fk` FOREIGN KEY (`grantedById`) REFERENCES `users`(`id`) ON DELETE SET NULL
);

CREATE TABLE `pulse_meeting_runs` (
  `id` varchar(36) NOT NULL,
  `meetingId` varchar(36) NOT NULL,
  `status` enum('running','paused','concluded') NOT NULL DEFAULT 'running',
  `activeSection` varchar(64) NOT NULL,
  `startedById` int NOT NULL,
  `startedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `pausedAt` timestamp NULL,
  `elapsedSeconds` int NOT NULL DEFAULT 0,
  `notes` text NULL,
  `attendeeIds` json NOT NULL,
  `transcript` text NULL,
  `recapHtml` text NULL,
  `recapSentAt` timestamp NULL,
  `concludedAt` timestamp NULL,
  `rating` int NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `pulse_meeting_run_active_idx` (`meetingId`,`status`,`startedAt`),
  CONSTRAINT `pulse_meeting_run_meeting_fk` FOREIGN KEY (`meetingId`) REFERENCES `pulse_meetings`(`id`) ON DELETE CASCADE,
  CONSTRAINT `pulse_meeting_run_started_by_fk` FOREIGN KEY (`startedById`) REFERENCES `users`(`id`)
);
