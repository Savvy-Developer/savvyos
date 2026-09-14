CREATE TABLE IF NOT EXISTS `pm_project_rock_meetings` (
  `id` varchar(36) NOT NULL,
  `projectId` int NOT NULL,
  `meetingId` varchar(36) NOT NULL,
  `sortOrder` int NOT NULL DEFAULT 0,
  `createdById` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `pm_project_rock_meeting_unique` (`projectId`, `meetingId`),
  KEY `pm_project_rock_meeting_project_idx` (`projectId`, `sortOrder`),
  KEY `pm_project_rock_meeting_meeting_idx` (`meetingId`, `sortOrder`),
  CONSTRAINT `pm_project_rock_meetings_project_fk` FOREIGN KEY (`projectId`) REFERENCES `pm_projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `pm_project_rock_meetings_meeting_fk` FOREIGN KEY (`meetingId`) REFERENCES `pulse_meetings` (`id`) ON DELETE CASCADE,
  CONSTRAINT `pm_project_rock_meetings_creator_fk` FOREIGN KEY (`createdById`) REFERENCES `users` (`id`) ON DELETE RESTRICT
);
