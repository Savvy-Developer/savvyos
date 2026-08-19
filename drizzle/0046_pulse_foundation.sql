-- Pulse V2 foundation. Pulse has no teams or team-scoped work.
-- Meeting membership is the sole access boundary for every meeting-scoped record.

CREATE TABLE IF NOT EXISTS `pulse_profiles` (
  `userId` INT NOT NULL,
  `platformRole` ENUM('super_admin','admin','member') NOT NULL DEFAULT 'member',
  `timezone` VARCHAR(64) NOT NULL DEFAULT 'America/New_York',
  `notificationPrefs` JSON NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deletedAt` TIMESTAMP NULL,
  PRIMARY KEY (`userId`),
  CONSTRAINT `pulse_profiles_user_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `pulse_meetings` (
  `id` VARCHAR(36) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `label` ENUM('level_10','one_on_one','other') NOT NULL,
  `ownerId` INT NOT NULL,
  `administratorId` INT NOT NULL,
  `dayOfWeek` ENUM('monday','tuesday','wednesday','thursday','friday','saturday','sunday') NULL,
  `startTime` VARCHAR(8) NULL,
  `durationMinutes` INT NOT NULL DEFAULT 90,
  `cadence` ENUM('weekly','biweekly','monthly','daily','ad_hoc') NOT NULL DEFAULT 'weekly',
  `timezone` VARCHAR(64) NOT NULL DEFAULT 'America/New_York',
  `reminderDay` ENUM('monday','tuesday','wednesday','thursday','friday','saturday','sunday') NULL,
  `reminderTime` VARCHAR(8) NULL,
  `sectionsEnabled` JSON NOT NULL,
  `sectionOrder` JSON NOT NULL,
  `sectionDurations` JSON NOT NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deletedAt` TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  KEY `pulse_meetings_active_idx` (`isActive`,`deletedAt`),
  KEY `pulse_meetings_owner_idx` (`ownerId`,`deletedAt`),
  CONSTRAINT `pulse_meetings_owner_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`),
  CONSTRAINT `pulse_meetings_administrator_fk` FOREIGN KEY (`administratorId`) REFERENCES `users`(`id`)
);

CREATE TABLE IF NOT EXISTS `pulse_meeting_members` (
  `id` VARCHAR(36) NOT NULL,
  `meetingId` VARCHAR(36) NOT NULL,
  `personId` INT NOT NULL,
  `meetingRole` ENUM('owner','administrator','member') NOT NULL DEFAULT 'member',
  `addedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `addedById` INT NOT NULL,
  `removedAt` TIMESTAMP NULL,
  `deletedAt` TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `pulse_meeting_member_unique` (`meetingId`,`personId`),
  KEY `pulse_membership_person_visible_idx` (`personId`,`removedAt`,`deletedAt`),
  KEY `pulse_membership_meeting_visible_idx` (`meetingId`,`removedAt`,`deletedAt`),
  CONSTRAINT `pulse_membership_meeting_fk` FOREIGN KEY (`meetingId`) REFERENCES `pulse_meetings`(`id`) ON DELETE CASCADE,
  CONSTRAINT `pulse_membership_person_fk` FOREIGN KEY (`personId`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  CONSTRAINT `pulse_membership_added_by_fk` FOREIGN KEY (`addedById`) REFERENCES `users`(`id`)
);

CREATE TABLE IF NOT EXISTS `pulse_work_items` (
  `id` VARCHAR(36) NOT NULL,
  `type` ENUM('todo','issue','rock') NOT NULL,
  `title` VARCHAR(500) NOT NULL,
  `description` LONGTEXT NULL,
  `meetingId` VARCHAR(36) NULL,
  `ownerPersonId` INT NULL,
  `isPersonal` BOOLEAN GENERATED ALWAYS AS (CASE WHEN `meetingId` IS NULL THEN TRUE ELSE FALSE END) VIRTUAL,
  `assigneeId` INT NOT NULL,
  `createdById` INT NOT NULL,
  `status` VARCHAR(64) NOT NULL,
  `dueDate` DATE NULL,
  `completedAt` TIMESTAMP NULL,
  `origin` ENUM('manual','cascaded','ai_proposed','carried_over') NOT NULL DEFAULT 'manual',
  `isProposed` BOOLEAN NOT NULL DEFAULT FALSE,
  `sortOrder` INT NOT NULL DEFAULT 0,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deletedAt` TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `pulse_work_items_exactly_one_owner` CHECK ((`meetingId` IS NULL) <> (`ownerPersonId` IS NULL)),
  KEY `pulse_work_items_meeting_idx` (`meetingId`,`deletedAt`,`sortOrder`),
  KEY `pulse_work_items_owner_idx` (`ownerPersonId`,`deletedAt`,`sortOrder`),
  KEY `pulse_work_items_assignee_idx` (`assigneeId`,`status`,`deletedAt`),
  CONSTRAINT `pulse_work_items_meeting_fk` FOREIGN KEY (`meetingId`) REFERENCES `pulse_meetings`(`id`),
  CONSTRAINT `pulse_work_items_owner_person_fk` FOREIGN KEY (`ownerPersonId`) REFERENCES `users`(`id`),
  CONSTRAINT `pulse_work_items_assignee_fk` FOREIGN KEY (`assigneeId`) REFERENCES `users`(`id`),
  CONSTRAINT `pulse_work_items_created_by_fk` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`)
);

CREATE TABLE IF NOT EXISTS `pulse_work_item_moves` (
  `id` VARCHAR(36) NOT NULL,
  `workItemId` VARCHAR(36) NOT NULL,
  `fromMeetingId` VARCHAR(36) NULL,
  `toMeetingId` VARCHAR(36) NULL,
  `movedById` INT NOT NULL,
  `reason` LONGTEXT NULL,
  `movedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `deletedAt` TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  KEY `pulse_work_item_moves_item_idx` (`workItemId`,`movedAt`),
  CONSTRAINT `pulse_work_item_moves_item_fk` FOREIGN KEY (`workItemId`) REFERENCES `pulse_work_items`(`id`) ON DELETE CASCADE,
  CONSTRAINT `pulse_work_item_moves_from_meeting_fk` FOREIGN KEY (`fromMeetingId`) REFERENCES `pulse_meetings`(`id`),
  CONSTRAINT `pulse_work_item_moves_to_meeting_fk` FOREIGN KEY (`toMeetingId`) REFERENCES `pulse_meetings`(`id`),
  CONSTRAINT `pulse_work_item_moves_moved_by_fk` FOREIGN KEY (`movedById`) REFERENCES `users`(`id`)
);

CREATE TABLE IF NOT EXISTS `pulse_work_item_status_notes` (
  `id` VARCHAR(36) NOT NULL,
  `workItemId` VARCHAR(36) NOT NULL,
  `fromStatus` VARCHAR(64) NULL,
  `toStatus` VARCHAR(64) NOT NULL,
  `note` LONGTEXT NULL,
  `personId` INT NOT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `deletedAt` TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  KEY `pulse_work_item_status_notes_item_idx` (`workItemId`,`createdAt`),
  CONSTRAINT `pulse_work_item_status_notes_item_fk` FOREIGN KEY (`workItemId`) REFERENCES `pulse_work_items`(`id`) ON DELETE CASCADE,
  CONSTRAINT `pulse_work_item_status_notes_person_fk` FOREIGN KEY (`personId`) REFERENCES `users`(`id`)
);

CREATE TABLE IF NOT EXISTS `pulse_activity_log` (
  `id` VARCHAR(36) NOT NULL,
  `entityType` VARCHAR(64) NOT NULL,
  `entityId` VARCHAR(36) NOT NULL,
  `personId` INT NOT NULL,
  `action` VARCHAR(128) NOT NULL,
  `fieldChanged` VARCHAR(128) NULL,
  `oldValue` JSON NULL,
  `newValue` JSON NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `pulse_activity_entity_idx` (`entityType`,`entityId`,`createdAt`),
  KEY `pulse_activity_person_idx` (`personId`,`createdAt`),
  CONSTRAINT `pulse_activity_person_fk` FOREIGN KEY (`personId`) REFERENCES `users`(`id`)
);

CREATE TABLE IF NOT EXISTS `pulse_glossary` (
  `id` VARCHAR(36) NOT NULL,
  `term` VARCHAR(128) NOT NULL,
  `plainGloss` VARCHAR(255) NOT NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deletedAt` TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `pulse_glossary_term_unique` (`term`)
);

CREATE TABLE IF NOT EXISTS `pulse_meetings_archive` (
  `id` VARCHAR(36) NOT NULL,
  `meetingId` VARCHAR(36) NOT NULL,
  `occurredAt` TIMESTAMP NOT NULL,
  `durationActualMinutes` INT NULL,
  `attendeeIds` JSON NOT NULL,
  `todosCreated` INT NOT NULL DEFAULT 0,
  `todosCompleted` INT NOT NULL DEFAULT 0,
  `issuesCreated` INT NOT NULL DEFAULT 0,
  `issuesResolved` INT NOT NULL DEFAULT 0,
  `rating` INT NULL,
  `notes` LONGTEXT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deletedAt` TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  KEY `pulse_archive_meeting_idx` (`meetingId`,`occurredAt`),
  CONSTRAINT `pulse_archive_meeting_fk` FOREIGN KEY (`meetingId`) REFERENCES `pulse_meetings`(`id`)
);

INSERT INTO `pulse_glossary` (`id`, `term`, `plainGloss`, `isActive`)
VALUES
  (UUID(), 'Rocks', 'your big goals this quarter', TRUE),
  (UUID(), 'Level 10', 'your weekly team meeting', TRUE),
  (UUID(), 'Segue', 'a personal or professional win to share', TRUE)
ON DUPLICATE KEY UPDATE
  `plainGloss` = VALUES(`plainGloss`),
  `isActive` = TRUE,
  `deletedAt` = NULL;
