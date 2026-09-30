CREATE TABLE `one_on_one_relationships` (
  `id` int AUTO_INCREMENT NOT NULL,
  `employeeId` int NOT NULL,
  `leaderId` int NOT NULL,
  `frequencyDays` int NOT NULL DEFAULT 30,
  `lastCompletedAt` timestamp NULL,
  `nextScheduledAt` timestamp NULL,
  `isActive` boolean NOT NULL DEFAULT true,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `one_on_one_relationships_id` PRIMARY KEY(`id`),
  CONSTRAINT `one_on_one_relationships_employee_fk` FOREIGN KEY (`employeeId`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  CONSTRAINT `one_on_one_relationships_leader_fk` FOREIGN KEY (`leaderId`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  CONSTRAINT `one_on_one_relationship_employee_leader_unique` UNIQUE(`employeeId`, `leaderId`)
);
--> statement-breakpoint
CREATE INDEX `one_on_one_relationship_leader_next_idx` ON `one_on_one_relationships` (`leaderId`, `nextScheduledAt`);
--> statement-breakpoint
CREATE INDEX `one_on_one_relationship_employee_next_idx` ON `one_on_one_relationships` (`employeeId`, `nextScheduledAt`);
--> statement-breakpoint
CREATE TABLE `one_on_one_meetings` (
  `id` int AUTO_INCREMENT NOT NULL,
  `relationshipId` int NOT NULL,
  `employeeId` int NOT NULL,
  `leaderId` int NOT NULL,
  `scheduledAt` timestamp NULL,
  `heldAt` timestamp NULL,
  `startedAt` timestamp NULL,
  `durationMinutes` int NOT NULL DEFAULT 45,
  `status` enum('Scheduled','In Progress','Review','Completed','Canceled') NOT NULL DEFAULT 'Scheduled',
  `calendarEventId` varchar(512) NULL,
  `calendarEventUrl` text NULL,
  `calendarSyncStatus` enum('Not Requested','Synced','Needs Attention') NOT NULL DEFAULT 'Not Requested',
  `calendarSyncError` text NULL,
  `transcript` text NULL,
  `transcriptSavedAt` timestamp NULL,
  `aiProcessingStatus` enum('None','Processing','Ready','Failed') NOT NULL DEFAULT 'None',
  `aiDraftJson` text NULL,
  `aiQuestionSuggestions` text NULL,
  `meetingSummary` text NULL,
  `employeeFeedback` text NULL,
  `supportRequests` text NULL,
  `processIdeas` text NULL,
  `professionalDevelopment` text NULL,
  `followUps` text NULL,
  `leadershipAttention` text NULL,
  `finalizedById` int NULL,
  `finalizedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `one_on_one_meetings_id` PRIMARY KEY(`id`),
  CONSTRAINT `one_on_one_meetings_relationship_fk` FOREIGN KEY (`relationshipId`) REFERENCES `one_on_one_relationships`(`id`) ON DELETE CASCADE,
  CONSTRAINT `one_on_one_meetings_employee_fk` FOREIGN KEY (`employeeId`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  CONSTRAINT `one_on_one_meetings_leader_fk` FOREIGN KEY (`leaderId`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  CONSTRAINT `one_on_one_meetings_finalized_by_fk` FOREIGN KEY (`finalizedById`) REFERENCES `users`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE INDEX `one_on_one_meeting_relationship_status_idx` ON `one_on_one_meetings` (`relationshipId`, `status`, `scheduledAt`);
--> statement-breakpoint
CREATE INDEX `one_on_one_meeting_employee_status_idx` ON `one_on_one_meetings` (`employeeId`, `status`, `heldAt`);
--> statement-breakpoint
CREATE TABLE `one_on_one_commitments` (
  `id` int AUTO_INCREMENT NOT NULL,
  `meetingId` int NOT NULL,
  `employeeId` int NOT NULL,
  `description` text NOT NULL,
  `ownerId` int NULL,
  `dueDate` timestamp NULL,
  `status` enum('Open','In Progress','Completed','Dismissed') NOT NULL DEFAULT 'Open',
  `isAiSuggested` boolean NOT NULL DEFAULT false,
  `createdById` int NULL,
  `completedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `one_on_one_commitments_id` PRIMARY KEY(`id`),
  CONSTRAINT `one_on_one_commitments_meeting_fk` FOREIGN KEY (`meetingId`) REFERENCES `one_on_one_meetings`(`id`) ON DELETE CASCADE,
  CONSTRAINT `one_on_one_commitments_employee_fk` FOREIGN KEY (`employeeId`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  CONSTRAINT `one_on_one_commitments_owner_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  CONSTRAINT `one_on_one_commitments_created_by_fk` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE INDEX `one_on_one_commitment_employee_status_idx` ON `one_on_one_commitments` (`employeeId`, `status`, `dueDate`);
--> statement-breakpoint
CREATE INDEX `one_on_one_commitment_meeting_idx` ON `one_on_one_commitments` (`meetingId`);
--> statement-breakpoint
CREATE TABLE `one_on_one_issues` (
  `id` int AUTO_INCREMENT NOT NULL,
  `meetingId` int NOT NULL,
  `employeeId` int NOT NULL,
  `title` varchar(500) NOT NULL,
  `details` text NULL,
  `requiresHrAttention` boolean NOT NULL DEFAULT false,
  `status` enum('Open','Resolved','Dismissed') NOT NULL DEFAULT 'Open',
  `createdById` int NULL,
  `resolvedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `one_on_one_issues_id` PRIMARY KEY(`id`),
  CONSTRAINT `one_on_one_issues_meeting_fk` FOREIGN KEY (`meetingId`) REFERENCES `one_on_one_meetings`(`id`) ON DELETE CASCADE,
  CONSTRAINT `one_on_one_issues_employee_fk` FOREIGN KEY (`employeeId`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  CONSTRAINT `one_on_one_issues_created_by_fk` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE INDEX `one_on_one_issue_employee_status_idx` ON `one_on_one_issues` (`employeeId`, `status`, `createdAt`);
--> statement-breakpoint
CREATE INDEX `one_on_one_issue_meeting_idx` ON `one_on_one_issues` (`meetingId`);
--> statement-breakpoint
ALTER TABLE `admin_permissions`
  ADD COLUMN `canViewOneOnOneMeetings` boolean NOT NULL DEFAULT true AFTER `canViewAgentRenewals`;
