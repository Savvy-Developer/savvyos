-- Pulse Meeting Runner source-to-Issue links retain the source context and
-- prevent duplicate flags for the same headline, measurable, or Rock during
-- one active L10 session.
CREATE TABLE `pulse_runner_issue_sources` (
  `id` varchar(36) NOT NULL,
  `issueWorkItemId` varchar(36) NOT NULL,
  `meetingId` varchar(36) NOT NULL,
  `sessionId` varchar(36) NOT NULL,
  `sourceType` enum('headline','scorecard','rock') NOT NULL,
  `sourceId` varchar(64) NOT NULL,
  `sourceSnapshot` json NOT NULL,
  `createdById` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `pulse_runner_issue_sources_session_source_unique` (`sessionId`, `sourceType`, `sourceId`),
  KEY `pulse_runner_issue_sources_meeting_idx` (`meetingId`, `sessionId`),
  KEY `pulse_runner_issue_sources_issue_idx` (`issueWorkItemId`),
  CONSTRAINT `pulse_runner_issue_sources_issue_fk` FOREIGN KEY (`issueWorkItemId`) REFERENCES `pulse_work_items` (`id`) ON DELETE CASCADE,
  CONSTRAINT `pulse_runner_issue_sources_meeting_fk` FOREIGN KEY (`meetingId`) REFERENCES `pulse_meetings` (`id`) ON DELETE CASCADE,
  CONSTRAINT `pulse_runner_issue_sources_session_fk` FOREIGN KEY (`sessionId`) REFERENCES `pulse_meeting_sessions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `pulse_runner_issue_sources_creator_fk` FOREIGN KEY (`createdById`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB;
