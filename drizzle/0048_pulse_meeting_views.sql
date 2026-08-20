CREATE TABLE `pulse_scorecard_metrics` (
  `id` varchar(36) NOT NULL,
  `meetingId` varchar(36) NOT NULL,
  `title` varchar(255) NOT NULL,
  `targetValue` int,
  `ownerId` int,
  `sortOrder` int NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deletedAt` timestamp NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `pulse_scorecard_metrics_meeting_fk` FOREIGN KEY (`meetingId`) REFERENCES `pulse_meetings`(`id`) ON DELETE CASCADE,
  CONSTRAINT `pulse_scorecard_metrics_owner_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  KEY `pulse_scorecard_metric_meeting_idx` (`meetingId`,`deletedAt`,`sortOrder`)
);

CREATE TABLE `pulse_scorecard_entries` (
  `id` varchar(36) NOT NULL,
  `metricId` varchar(36) NOT NULL,
  `personId` int NOT NULL,
  `periodStart` date NOT NULL,
  `value` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deletedAt` timestamp NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `pulse_scorecard_entries_metric_fk` FOREIGN KEY (`metricId`) REFERENCES `pulse_scorecard_metrics`(`id`) ON DELETE CASCADE,
  CONSTRAINT `pulse_scorecard_entries_person_fk` FOREIGN KEY (`personId`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  UNIQUE KEY `pulse_scorecard_entry_period_unique` (`metricId`,`personId`,`periodStart`),
  KEY `pulse_scorecard_entry_metric_idx` (`metricId`,`periodStart`,`deletedAt`)
);

CREATE TABLE `pulse_meeting_updates` (
  `id` varchar(36) NOT NULL,
  `meetingId` varchar(36) NOT NULL,
  `authorId` int NOT NULL,
  `updateType` enum('segue','headline') NOT NULL,
  `body` text NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deletedAt` timestamp NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `pulse_meeting_updates_meeting_fk` FOREIGN KEY (`meetingId`) REFERENCES `pulse_meetings`(`id`) ON DELETE CASCADE,
  CONSTRAINT `pulse_meeting_updates_author_fk` FOREIGN KEY (`authorId`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  KEY `pulse_meeting_updates_meeting_idx` (`meetingId`,`updateType`,`deletedAt`,`createdAt`)
);

CREATE TABLE `pulse_cascading_messages` (
  `id` varchar(36) NOT NULL,
  `fromMeetingId` varchar(36) NOT NULL,
  `toMeetingId` varchar(36) NOT NULL,
  `body` text NOT NULL,
  `createdById` int NOT NULL,
  `acknowledgedAt` timestamp NULL,
  `acknowledgedById` int NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deletedAt` timestamp NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `pulse_cascading_from_fk` FOREIGN KEY (`fromMeetingId`) REFERENCES `pulse_meetings`(`id`),
  CONSTRAINT `pulse_cascading_to_fk` FOREIGN KEY (`toMeetingId`) REFERENCES `pulse_meetings`(`id`),
  CONSTRAINT `pulse_cascading_creator_fk` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`),
  CONSTRAINT `pulse_cascading_acknowledger_fk` FOREIGN KEY (`acknowledgedById`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  KEY `pulse_cascading_destination_idx` (`toMeetingId`,`deletedAt`,`createdAt`)
);
