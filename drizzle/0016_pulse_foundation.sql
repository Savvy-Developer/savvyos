-- Pulse foundation: person type, centralized tab entitlement, meeting registry, and normalized meeting access.
-- This migration is additive and intentionally does not touch unrelated webhook or legacy feature tables.

ALTER TABLE `users`
  ADD COLUMN `personType` ENUM('full_user', 'teammate') NOT NULL DEFAULT 'full_user' AFTER `loginMethod`;

ALTER TABLE `admin_permissions`
  ADD COLUMN `canViewPulse` boolean NOT NULL DEFAULT FALSE AFTER `canViewPasswords`;

CREATE TABLE `pulse_meetings` (
  `id` int AUTO_INCREMENT NOT NULL,
  `meetingKey` varchar(120) NOT NULL,
  `name` varchar(255) NOT NULL,
  `scheduleDay` ENUM('monday','tuesday','wednesday','thursday','friday','saturday','sunday') NOT NULL,
  `scheduleTime` varchar(5) NOT NULL,
  `timezone` varchar(64) NOT NULL DEFAULT 'America/New_York',
  `facilitatorUserId` int,
  `durationMinutes` int NOT NULL DEFAULT 90,
  `sectionVisibility` json NOT NULL,
  `isActive` boolean NOT NULL DEFAULT TRUE,
  `archivedAt` timestamp NULL,
  `archivedById` int,
  `archiveNote` text,
  `createdById` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `pulse_meetings_id_pk` PRIMARY KEY(`id`),
  CONSTRAINT `pulse_meetings_meeting_key_unique` UNIQUE(`meetingKey`),
  CONSTRAINT `pulse_meetings_facilitator_user_fk` FOREIGN KEY (`facilitatorUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  CONSTRAINT `pulse_meetings_archived_by_user_fk` FOREIGN KEY (`archivedById`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  CONSTRAINT `pulse_meetings_created_by_user_fk` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE RESTRICT,
  INDEX `pulse_meetings_active_schedule_idx` (`isActive`, `scheduleDay`, `scheduleTime`),
  INDEX `pulse_meetings_facilitator_idx` (`facilitatorUserId`, `isActive`)
);

CREATE TABLE `pulse_meeting_access` (
  `id` int AUTO_INCREMENT NOT NULL,
  `meetingId` int NOT NULL,
  `userId` int NOT NULL,
  `accessLevel` ENUM('member','facilitator') NOT NULL DEFAULT 'member',
  `grantedById` int NOT NULL,
  `grantedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `revokedAt` timestamp NULL,
  `revokedById` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `pulse_meeting_access_id_pk` PRIMARY KEY(`id`),
  CONSTRAINT `pulse_meeting_access_meeting_user_unique` UNIQUE(`meetingId`, `userId`),
  CONSTRAINT `pulse_meeting_access_meeting_fk` FOREIGN KEY (`meetingId`) REFERENCES `pulse_meetings`(`id`) ON DELETE CASCADE,
  CONSTRAINT `pulse_meeting_access_user_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  CONSTRAINT `pulse_meeting_access_granted_by_fk` FOREIGN KEY (`grantedById`) REFERENCES `users`(`id`) ON DELETE RESTRICT,
  CONSTRAINT `pulse_meeting_access_revoked_by_fk` FOREIGN KEY (`revokedById`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  INDEX `pulse_meeting_access_user_active_idx` (`userId`, `revokedAt`, `meetingId`),
  INDEX `pulse_meeting_access_meeting_active_idx` (`meetingId`, `revokedAt`)
);


CREATE TABLE `pulse_teams` (
  `id` int AUTO_INCREMENT NOT NULL,
  `teamKey` varchar(120) NOT NULL,
  `name` varchar(255) NOT NULL,
  `purpose` text,
  `color` varchar(32),
  `linkedMeetingId` int,
  `isActive` boolean NOT NULL DEFAULT TRUE,
  `createdById` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `pulse_teams_id_pk` PRIMARY KEY(`id`),
  CONSTRAINT `pulse_teams_team_key_unique` UNIQUE(`teamKey`),
  CONSTRAINT `pulse_teams_linked_meeting_fk` FOREIGN KEY (`linkedMeetingId`) REFERENCES `pulse_meetings`(`id`) ON DELETE SET NULL,
  CONSTRAINT `pulse_teams_created_by_user_fk` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE RESTRICT,
  INDEX `pulse_teams_active_name_idx` (`isActive`, `name`),
  INDEX `pulse_teams_linked_meeting_idx` (`linkedMeetingId`, `isActive`)
);

CREATE TABLE `pulse_team_members` (
  `id` int AUTO_INCREMENT NOT NULL,
  `teamId` int NOT NULL,
  `userId` int NOT NULL,
  `role` ENUM('member','lead') NOT NULL DEFAULT 'member',
  `joinedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `removedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `pulse_team_members_id_pk` PRIMARY KEY(`id`),
  CONSTRAINT `pulse_team_members_team_user_unique` UNIQUE(`teamId`, `userId`),
  CONSTRAINT `pulse_team_members_team_fk` FOREIGN KEY (`teamId`) REFERENCES `pulse_teams`(`id`) ON DELETE CASCADE,
  CONSTRAINT `pulse_team_members_user_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  INDEX `pulse_team_members_user_active_idx` (`userId`, `removedAt`, `teamId`),
  INDEX `pulse_team_members_team_active_idx` (`teamId`, `removedAt`)
);

CREATE TABLE `pulse_one_on_ones` (
  `id` int AUTO_INCREMENT NOT NULL,
  `name` varchar(255) NOT NULL,
  `primaryUserId` int NOT NULL,
  `secondaryUserId` int NOT NULL,
  `sectionVisibility` json NOT NULL,
  `isActive` boolean NOT NULL DEFAULT TRUE,
  `createdById` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `pulse_one_on_ones_id_pk` PRIMARY KEY(`id`),
  CONSTRAINT `pulse_one_on_ones_primary_user_fk` FOREIGN KEY (`primaryUserId`) REFERENCES `users`(`id`) ON DELETE RESTRICT,
  CONSTRAINT `pulse_one_on_ones_secondary_user_fk` FOREIGN KEY (`secondaryUserId`) REFERENCES `users`(`id`) ON DELETE RESTRICT,
  CONSTRAINT `pulse_one_on_ones_created_by_user_fk` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE RESTRICT,
  INDEX `pulse_one_on_ones_primary_active_idx` (`primaryUserId`, `isActive`),
  INDEX `pulse_one_on_ones_secondary_active_idx` (`secondaryUserId`, `isActive`)
);

CREATE TABLE `pulse_one_on_one_access` (
  `id` int AUTO_INCREMENT NOT NULL,
  `oneOnOneId` int NOT NULL,
  `userId` int NOT NULL,
  `accessLevel` ENUM('viewer') NOT NULL DEFAULT 'viewer',
  `grantedById` int NOT NULL,
  `grantedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `revokedAt` timestamp NULL,
  `revokedById` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `pulse_one_on_one_access_id_pk` PRIMARY KEY(`id`),
  CONSTRAINT `pulse_one_on_one_access_user_unique` UNIQUE(`oneOnOneId`, `userId`),
  CONSTRAINT `pulse_one_on_one_access_one_on_one_fk` FOREIGN KEY (`oneOnOneId`) REFERENCES `pulse_one_on_ones`(`id`) ON DELETE CASCADE,
  CONSTRAINT `pulse_one_on_one_access_user_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  CONSTRAINT `pulse_one_on_one_access_granted_by_fk` FOREIGN KEY (`grantedById`) REFERENCES `users`(`id`) ON DELETE RESTRICT,
  CONSTRAINT `pulse_one_on_one_access_revoked_by_fk` FOREIGN KEY (`revokedById`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  INDEX `pulse_one_on_one_access_user_active_idx` (`userId`, `revokedAt`, `oneOnOneId`)
);
