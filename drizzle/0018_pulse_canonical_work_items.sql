-- Pulse canonical work-item foundation.
-- Pulse work is Scope-aware and intentionally distinct from existing CRM/work-project task systems.

ALTER TABLE `pulse_domain_events`
  MODIFY COLUMN `eventType` ENUM(
    'scope_created','scope_archived','scope_reactivated','membership_granted','membership_revoked',
    'calendar_configured','reporting_period_created','holiday_created',
    'work_item_created','work_item_moved','work_item_status_changed','work_item_assigned',
    'work_item_comment_added','work_item_mention_added'
  ) NOT NULL;
ALTER TABLE `pulse_domain_events` DROP CHECK `pulse_domain_events_payload_type_ck`;
ALTER TABLE `pulse_domain_events` ADD CONSTRAINT `pulse_domain_events_payload_type_ck` CHECK (
  (eventType = 'scope_created' AND JSON_CONTAINS_PATH(payload, 'all', '$.scopeType', '$.name')) OR
  (eventType IN ('scope_archived','scope_reactivated') AND JSON_CONTAINS_PATH(payload, 'all', '$.scopeId')) OR
  (eventType IN ('membership_granted','membership_revoked') AND JSON_CONTAINS_PATH(payload, 'all', '$.scopeId', '$.personId')) OR
  (eventType = 'calendar_configured' AND JSON_CONTAINS_PATH(payload, 'all', '$.timezone', '$.fiscalYearStartMonth')) OR
  (eventType = 'reporting_period_created' AND JSON_CONTAINS_PATH(payload, 'all', '$.periodType', '$.startsOn', '$.endsOn')) OR
  (eventType = 'holiday_created' AND JSON_CONTAINS_PATH(payload, 'all', '$.holidayDate', '$.name')) OR
  (eventType = 'work_item_created' AND JSON_CONTAINS_PATH(payload, 'all', '$.itemId', '$.itemType', '$.primaryScopeId')) OR
  (eventType = 'work_item_moved' AND JSON_CONTAINS_PATH(payload, 'all', '$.itemId', '$.fromScopeId', '$.toScopeId')) OR
  (eventType = 'work_item_status_changed' AND JSON_CONTAINS_PATH(payload, 'all', '$.itemId', '$.fromStatus', '$.toStatus')) OR
  (eventType = 'work_item_assigned' AND JSON_CONTAINS_PATH(payload, 'all', '$.itemId', '$.assigneePersonId')) OR
  (eventType = 'work_item_comment_added' AND JSON_CONTAINS_PATH(payload, 'all', '$.itemId', '$.commentId')) OR
  (eventType = 'work_item_mention_added' AND JSON_CONTAINS_PATH(payload, 'all', '$.itemId', '$.mentionedPersonId'))
);

CREATE TABLE `pulse_work_item_types` (
  `key` varchar(64) NOT NULL,
  `displayName` varchar(128) NOT NULL,
  `isActive` boolean NOT NULL DEFAULT TRUE,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `pulse_work_item_types_pk` PRIMARY KEY (`key`)
);
INSERT INTO `pulse_work_item_types` (`key`, `displayName`, `isActive`) VALUES
  ('todo', 'Todo', TRUE),
  ('issue', 'Issue', TRUE);

CREATE TABLE `pulse_work_items` (
  `id` int AUTO_INCREMENT NOT NULL,
  `itemType` varchar(64) NOT NULL,
  `title` varchar(512) NOT NULL,
  `description` text,
  `primaryScopeId` int NOT NULL,
  `assigneePersonId` int,
  `status` ENUM('not_started','in_progress','blocked','complete','skipped') NOT NULL DEFAULT 'not_started',
  `lastTransitionNote` text,
  `lastTransitionMode` ENUM('standard','runner_bulk_completion') NOT NULL DEFAULT 'standard',
  `blockerType` ENUM('person','dependency','waiting','external','decision','other'),
  `blockerPersonId` int,
  `createdByPersonId` int NOT NULL,
  `createdInSessionId` varchar(128),
  `createdInScopeId` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `pulse_work_items_pk` PRIMARY KEY (`id`),
  CONSTRAINT `pulse_work_items_type_fk` FOREIGN KEY (`itemType`) REFERENCES `pulse_work_item_types`(`key`) ON DELETE RESTRICT,
  CONSTRAINT `pulse_work_items_primary_scope_fk` FOREIGN KEY (`primaryScopeId`) REFERENCES `pulse_scopes`(`id`) ON DELETE RESTRICT,
  CONSTRAINT `pulse_work_items_assignee_person_fk` FOREIGN KEY (`assigneePersonId`) REFERENCES `pulse_people`(`id`) ON DELETE SET NULL,
  CONSTRAINT `pulse_work_items_blocker_person_fk` FOREIGN KEY (`blockerPersonId`) REFERENCES `pulse_people`(`id`) ON DELETE SET NULL,
  CONSTRAINT `pulse_work_items_created_by_person_fk` FOREIGN KEY (`createdByPersonId`) REFERENCES `pulse_people`(`id`) ON DELETE RESTRICT,
  CONSTRAINT `pulse_work_items_created_scope_fk` FOREIGN KEY (`createdInScopeId`) REFERENCES `pulse_scopes`(`id`) ON DELETE RESTRICT,
  INDEX `pulse_work_items_scope_status_idx` (`primaryScopeId`, `status`, `updatedAt`),
  INDEX `pulse_work_items_assignee_status_idx` (`assigneePersonId`, `status`, `updatedAt`),
  INDEX `pulse_work_items_created_scope_idx` (`createdInScopeId`, `createdAt`)
);

CREATE TABLE `pulse_work_item_placements` (
  `id` int AUTO_INCREMENT NOT NULL,
  `itemId` int NOT NULL,
  `scopeId` int NOT NULL,
  `placementKind` ENUM('secondary','reference','notification_context') NOT NULL DEFAULT 'secondary',
  `isActive` boolean NOT NULL DEFAULT TRUE,
  `addedByPersonId` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `pulse_work_item_placements_pk` PRIMARY KEY (`id`),
  CONSTRAINT `pulse_work_item_placements_item_scope_unique` UNIQUE (`itemId`, `scopeId`),
  CONSTRAINT `pulse_work_item_placements_item_fk` FOREIGN KEY (`itemId`) REFERENCES `pulse_work_items`(`id`) ON DELETE CASCADE,
  CONSTRAINT `pulse_work_item_placements_scope_fk` FOREIGN KEY (`scopeId`) REFERENCES `pulse_scopes`(`id`) ON DELETE CASCADE,
  CONSTRAINT `pulse_work_item_placements_added_by_fk` FOREIGN KEY (`addedByPersonId`) REFERENCES `pulse_people`(`id`) ON DELETE RESTRICT,
  INDEX `pulse_work_item_placements_scope_active_idx` (`scopeId`, `isActive`, `itemId`)
);

CREATE TABLE `pulse_work_item_recurrences` (
  `id` int AUTO_INCREMENT NOT NULL,
  `frequency` ENUM('weekly','monthly','quarterly','custom') NOT NULL,
  `intervalCount` int NOT NULL DEFAULT 1,
  `rule` json NOT NULL,
  `isActive` boolean NOT NULL DEFAULT TRUE,
  `createdByPersonId` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `pulse_work_item_recurrences_pk` PRIMARY KEY (`id`),
  CONSTRAINT `pulse_work_item_recurrences_created_by_fk` FOREIGN KEY (`createdByPersonId`) REFERENCES `pulse_people`(`id`) ON DELETE RESTRICT
);

CREATE TABLE `pulse_todos` (
  `itemId` int NOT NULL,
  `dueDate` date,
  `priority` ENUM('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
  `isFlagged` boolean NOT NULL DEFAULT FALSE,
  `recurrenceId` int,
  `completionNote` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `pulse_todos_pk` PRIMARY KEY (`itemId`),
  CONSTRAINT `pulse_todos_item_fk` FOREIGN KEY (`itemId`) REFERENCES `pulse_work_items`(`id`) ON DELETE CASCADE,
  CONSTRAINT `pulse_todos_recurrence_fk` FOREIGN KEY (`recurrenceId`) REFERENCES `pulse_work_item_recurrences`(`id`) ON DELETE SET NULL,
  INDEX `pulse_todos_due_priority_idx` (`dueDate`, `priority`)
);

CREATE TABLE `pulse_issues` (
  `itemId` int NOT NULL,
  `priority` ENUM('low','medium','high','critical') NOT NULL DEFAULT 'medium',
  `timeframe` ENUM('this_week','this_quarter','this_year','someday','unscheduled') NOT NULL DEFAULT 'unscheduled',
  `resolution` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `pulse_issues_pk` PRIMARY KEY (`itemId`),
  CONSTRAINT `pulse_issues_item_fk` FOREIGN KEY (`itemId`) REFERENCES `pulse_work_items`(`id`) ON DELETE CASCADE
);

CREATE TABLE `pulse_issue_votes` (
  `id` int AUTO_INCREMENT NOT NULL,
  `issueItemId` int NOT NULL,
  `voterPersonId` int NOT NULL,
  `sessionId` varchar(128),
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `pulse_issue_votes_pk` PRIMARY KEY (`id`),
  CONSTRAINT `pulse_issue_votes_issue_fk` FOREIGN KEY (`issueItemId`) REFERENCES `pulse_issues`(`itemId`) ON DELETE CASCADE,
  CONSTRAINT `pulse_issue_votes_voter_fk` FOREIGN KEY (`voterPersonId`) REFERENCES `pulse_people`(`id`) ON DELETE CASCADE,
  CONSTRAINT `pulse_issue_votes_issue_voter_session_unique` UNIQUE (`issueItemId`, `voterPersonId`, `sessionId`)
);

CREATE TABLE `pulse_work_item_activity` (
  `id` bigint AUTO_INCREMENT NOT NULL,
  `itemId` int NOT NULL,
  `activityType` ENUM('created','moved','status_changed','assigned','comment_added','mention_added','placement_added','placement_removed') NOT NULL,
  `actorPersonId` int,
  `note` text,
  `payload` json NOT NULL,
  `occurredAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `pulse_work_item_activity_pk` PRIMARY KEY (`id`),
  CONSTRAINT `pulse_work_item_activity_item_fk` FOREIGN KEY (`itemId`) REFERENCES `pulse_work_items`(`id`) ON DELETE CASCADE,
  CONSTRAINT `pulse_work_item_activity_actor_fk` FOREIGN KEY (`actorPersonId`) REFERENCES `pulse_people`(`id`) ON DELETE SET NULL,
  INDEX `pulse_work_item_activity_item_time_idx` (`itemId`, `occurredAt`),
  INDEX `pulse_work_item_activity_type_time_idx` (`activityType`, `occurredAt`)
);

CREATE TABLE `pulse_work_item_comments` (
  `id` int AUTO_INCREMENT NOT NULL,
  `itemId` int NOT NULL,
  `authorPersonId` int NOT NULL,
  `body` text NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `pulse_work_item_comments_pk` PRIMARY KEY (`id`),
  CONSTRAINT `pulse_work_item_comments_item_fk` FOREIGN KEY (`itemId`) REFERENCES `pulse_work_items`(`id`) ON DELETE CASCADE,
  CONSTRAINT `pulse_work_item_comments_author_fk` FOREIGN KEY (`authorPersonId`) REFERENCES `pulse_people`(`id`) ON DELETE RESTRICT,
  INDEX `pulse_work_item_comments_item_time_idx` (`itemId`, `createdAt`)
);

CREATE TABLE `pulse_work_item_mentions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `commentId` int,
  `itemId` int NOT NULL,
  `mentionedPersonId` int NOT NULL,
  `createdByPersonId` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `pulse_work_item_mentions_pk` PRIMARY KEY (`id`),
  CONSTRAINT `pulse_work_item_mentions_comment_fk` FOREIGN KEY (`commentId`) REFERENCES `pulse_work_item_comments`(`id`) ON DELETE CASCADE,
  CONSTRAINT `pulse_work_item_mentions_item_fk` FOREIGN KEY (`itemId`) REFERENCES `pulse_work_items`(`id`) ON DELETE CASCADE,
  CONSTRAINT `pulse_work_item_mentions_person_fk` FOREIGN KEY (`mentionedPersonId`) REFERENCES `pulse_people`(`id`) ON DELETE CASCADE,
  CONSTRAINT `pulse_work_item_mentions_created_by_fk` FOREIGN KEY (`createdByPersonId`) REFERENCES `pulse_people`(`id`) ON DELETE RESTRICT,
  INDEX `pulse_work_item_mentions_person_time_idx` (`mentionedPersonId`, `createdAt`)
);

CREATE TABLE `pulse_work_item_notification_intents` (
  `id` int AUTO_INCREMENT NOT NULL,
  `itemId` int NOT NULL,
  `recipientPersonId` int NOT NULL,
  `intentType` ENUM('assignment','mention','status_change','comment') NOT NULL,
  `status` ENUM('pending','suppressed','delivered','cancelled') NOT NULL DEFAULT 'pending',
  `payload` json NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `deliveredAt` timestamp NULL,
  CONSTRAINT `pulse_work_item_notification_intents_pk` PRIMARY KEY (`id`),
  CONSTRAINT `pulse_work_item_notification_intents_item_fk` FOREIGN KEY (`itemId`) REFERENCES `pulse_work_items`(`id`) ON DELETE CASCADE,
  CONSTRAINT `pulse_work_item_notification_intents_recipient_fk` FOREIGN KEY (`recipientPersonId`) REFERENCES `pulse_people`(`id`) ON DELETE CASCADE,
  INDEX `pulse_work_item_notification_intents_recipient_status_idx` (`recipientPersonId`, `status`, `createdAt`)
);

DELIMITER //
CREATE TRIGGER `pulse_work_items_validate_status_transition`
BEFORE UPDATE ON `pulse_work_items`
FOR EACH ROW
BEGIN
  IF NOT (OLD.`createdByPersonId` <=> NEW.`createdByPersonId`) OR NOT (OLD.`createdAt` <=> NEW.`createdAt`) OR NOT (OLD.`createdInSessionId` <=> NEW.`createdInSessionId`) OR NOT (OLD.`createdInScopeId` <=> NEW.`createdInScopeId`) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Pulse work-item creation provenance is immutable';
  END IF;
  IF OLD.`status` <> NEW.`status` THEN
    IF NEW.`lastTransitionMode` = 'runner_bulk_completion' AND NEW.`status` <> 'complete' THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Runner bulk completion is valid only for complete status';
    END IF;
    IF NEW.`lastTransitionMode` <> 'runner_bulk_completion' AND (NEW.`lastTransitionNote` IS NULL OR CHAR_LENGTH(TRIM(NEW.`lastTransitionNote`)) < 3) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A substantive transition note is required';
    END IF;
    IF NEW.`status` = 'blocked' AND NEW.`blockerType` IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Blocked status requires a blocker type';
    END IF;
    IF NEW.`status` = 'blocked' AND NEW.`blockerType` = 'person' AND NEW.`blockerPersonId` IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Person blocker requires blocker person';
    END IF;
  END IF;
END//
DELIMITER ;
