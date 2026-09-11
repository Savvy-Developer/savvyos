ALTER TABLE `admin_permissions`
  ADD COLUMN `canViewRecruiting` boolean NOT NULL DEFAULT true AFTER `canViewAgentCelebrations`;

CREATE TABLE `recruiting_stages` (
  `id` int AUTO_INCREMENT NOT NULL,
  `slug` varchar(80) NOT NULL,
  `name` varchar(120) NOT NULL,
  `position` int NOT NULL DEFAULT 0,
  `isActive` boolean NOT NULL DEFAULT true,
  `isClosed` boolean NOT NULL DEFAULT false,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `recruiting_stages_id_pk` PRIMARY KEY (`id`),
  CONSTRAINT `recruiting_stages_slug_unique` UNIQUE (`slug`)
);
CREATE INDEX `recruiting_stages_position_idx` ON `recruiting_stages` (`position`);

CREATE TABLE `recruits` (
  `id` int AUTO_INCREMENT NOT NULL,
  `firstName` varchar(128) NOT NULL,
  `lastName` varchar(128) NOT NULL,
  `email` varchar(320),
  `phone` varchar(32),
  `currentBrokerage` varchar(255),
  `websiteUrl` varchar(1024),
  `socialLinks` json,
  `primaryMarketId` int,
  `primaryMarketText` varchar(255),
  `additionalMarkets` json,
  `state` varchar(64),
  `yearsInRealEstate` int,
  `shortTermRentalExperience` text,
  `transactionCount` int,
  `salesVolume` decimal(16,2),
  `productionPeriod` varchar(80),
  `ownerId` int NOT NULL,
  `source` varchar(255),
  `stageId` int NOT NULL,
  `lastContactAt` timestamp NULL,
  `nextAction` varchar(500),
  `nextFollowUpAt` timestamp NULL,
  `goals` text,
  `motivations` text,
  `objections` text,
  `context` text,
  `isArchived` boolean NOT NULL DEFAULT false,
  `createdById` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `recruits_id_pk` PRIMARY KEY (`id`),
  CONSTRAINT `recruits_primary_market_fk` FOREIGN KEY (`primaryMarketId`) REFERENCES `market_profiles` (`id`) ON DELETE SET NULL,
  CONSTRAINT `recruits_owner_fk` FOREIGN KEY (`ownerId`) REFERENCES `users` (`id`),
  CONSTRAINT `recruits_stage_fk` FOREIGN KEY (`stageId`) REFERENCES `recruiting_stages` (`id`),
  CONSTRAINT `recruits_created_by_fk` FOREIGN KEY (`createdById`) REFERENCES `users` (`id`) ON DELETE SET NULL
);
CREATE INDEX `recruits_email_idx` ON `recruits` (`email`);
CREATE INDEX `recruits_phone_idx` ON `recruits` (`phone`);
CREATE INDEX `recruits_owner_stage_idx` ON `recruits` (`ownerId`, `stageId`);
CREATE INDEX `recruits_follow_up_idx` ON `recruits` (`nextFollowUpAt`);
CREATE INDEX `recruits_market_idx` ON `recruits` (`primaryMarketId`);

CREATE TABLE `recruiting_activities` (
  `id` int AUTO_INCREMENT NOT NULL,
  `recruitId` int NOT NULL,
  `type` enum('note','call','email','text','meeting','booking','appointment_scheduled','appointment_rescheduled','appointment_canceled','appointment_completed','appointment_no_show','task_created','task_completed','stage_changed','ai_summary') NOT NULL,
  `body` text NOT NULL,
  `outcome` varchar(1000),
  `occurredAt` timestamp NOT NULL,
  `enteredById` int,
  `isPinned` boolean NOT NULL DEFAULT false,
  `pinnedAt` timestamp NULL,
  `metadata` json,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `recruiting_activities_id_pk` PRIMARY KEY (`id`),
  CONSTRAINT `recruiting_activities_recruit_fk` FOREIGN KEY (`recruitId`) REFERENCES `recruits` (`id`) ON DELETE CASCADE,
  CONSTRAINT `recruiting_activities_entered_by_fk` FOREIGN KEY (`enteredById`) REFERENCES `users` (`id`) ON DELETE SET NULL
);
CREATE INDEX `recruiting_activities_recruit_occurred_idx` ON `recruiting_activities` (`recruitId`, `occurredAt`);
CREATE INDEX `recruiting_activities_recruit_pinned_idx` ON `recruiting_activities` (`recruitId`, `isPinned`);

CREATE TABLE `recruiting_tasks` (
  `id` int AUTO_INCREMENT NOT NULL,
  `recruitId` int NOT NULL,
  `title` varchar(500) NOT NULL,
  `notes` text,
  `assignedToId` int NOT NULL,
  `dueDate` date NOT NULL,
  `completedAt` timestamp NULL,
  `completedById` int,
  `createdById` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `recruiting_tasks_id_pk` PRIMARY KEY (`id`),
  CONSTRAINT `recruiting_tasks_recruit_fk` FOREIGN KEY (`recruitId`) REFERENCES `recruits` (`id`) ON DELETE CASCADE,
  CONSTRAINT `recruiting_tasks_assignee_fk` FOREIGN KEY (`assignedToId`) REFERENCES `users` (`id`),
  CONSTRAINT `recruiting_tasks_completed_by_fk` FOREIGN KEY (`completedById`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `recruiting_tasks_created_by_fk` FOREIGN KEY (`createdById`) REFERENCES `users` (`id`) ON DELETE SET NULL
);
CREATE INDEX `recruiting_tasks_assignee_due_idx` ON `recruiting_tasks` (`assignedToId`, `dueDate`);
CREATE INDEX `recruiting_tasks_recruit_due_idx` ON `recruiting_tasks` (`recruitId`, `dueDate`);

CREATE TABLE `recruiting_appointments` (
  `id` int AUTO_INCREMENT NOT NULL,
  `recruitId` int NOT NULL,
  `hostUserId` int NOT NULL,
  `scheduledByUserId` int,
  `source` enum('public_trish','admin') NOT NULL,
  `status` enum('pending','scheduled','canceled','completed','no_show') NOT NULL DEFAULT 'pending',
  `title` varchar(255) NOT NULL,
  `startAt` timestamp NOT NULL,
  `endAt` timestamp NOT NULL,
  `timezone` varchar(64) NOT NULL DEFAULT 'America/New_York',
  `visitorTimezone` varchar(64),
  `location` varchar(512),
  `visitorMessage` text,
  `externalCalendarEventId` varchar(512),
  `externalCalendarEventUrl` text,
  `invitationDeliveryStatus` enum('not_needed','sent','failed') NOT NULL DEFAULT 'not_needed',
  `invitationDeliveryError` text,
  `canceledAt` timestamp NULL,
  `cancellationReason` varchar(1000),
  `completedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `recruiting_appointments_id_pk` PRIMARY KEY (`id`),
  CONSTRAINT `recruiting_appointments_recruit_fk` FOREIGN KEY (`recruitId`) REFERENCES `recruits` (`id`) ON DELETE CASCADE,
  CONSTRAINT `recruiting_appointments_host_fk` FOREIGN KEY (`hostUserId`) REFERENCES `users` (`id`),
  CONSTRAINT `recruiting_appointments_scheduled_by_fk` FOREIGN KEY (`scheduledByUserId`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `recruiting_appointments_host_start_unique` UNIQUE (`hostUserId`, `startAt`)
);
CREATE INDEX `recruiting_appointments_recruit_start_idx` ON `recruiting_appointments` (`recruitId`, `startAt`);
CREATE INDEX `recruiting_appointments_host_status_start_idx` ON `recruiting_appointments` (`hostUserId`, `status`, `startAt`);

CREATE TABLE `recruiting_calendar_settings` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `meetingDurationMinutes` int NOT NULL DEFAULT 30,
  `timezone` varchar(64) NOT NULL DEFAULT 'America/New_York',
  `workingHours` json,
  `bufferBeforeMinutes` int NOT NULL DEFAULT 15,
  `bufferAfterMinutes` int NOT NULL DEFAULT 15,
  `minimumNoticeHours` int NOT NULL DEFAULT 24,
  `conflictCalendarIds` json,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `recruiting_calendar_settings_id_pk` PRIMARY KEY (`id`),
  CONSTRAINT `recruiting_calendar_settings_user_unique` UNIQUE (`userId`),
  CONSTRAINT `recruiting_calendar_settings_user_fk` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE
);

INSERT INTO `recruiting_stages` (`slug`, `name`, `position`, `isActive`, `isClosed`) VALUES
  ('new', 'New', 10, true, false),
  ('contacted', 'Contacted', 20, true, false),
  ('meeting-scheduled', 'Meeting Scheduled', 30, true, false),
  ('in-conversation', 'In Conversation', 40, true, false),
  ('nurture', 'Nurture', 50, true, false),
  ('joining', 'Joining', 60, true, false),
  ('joined', 'Joined', 70, true, true),
  ('not-a-fit-closed', 'Not a Fit / Closed', 80, true, true);
