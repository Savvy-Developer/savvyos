-- Pulse runner foundation: configuration, execution sessions, and immutable conclusion reports are distinct.

ALTER TABLE `pulse_domain_events`
  MODIFY COLUMN `eventType` ENUM(
    'scope_created','scope_archived','scope_reactivated','membership_granted','membership_revoked',
    'calendar_configured','reporting_period_created','holiday_created',
    'meeting_created','meeting_deactivated','meeting_reactivated',
    'session_started','session_step_entered','session_ids_snapshot','session_item_captured','session_vote_cast',
    'session_completed','session_auto_closed','session_report_created',
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
  (eventType = 'meeting_created' AND JSON_CONTAINS_PATH(payload, 'all', '$.registryId', '$.scopeId', '$.meetingKind')) OR
  (eventType IN ('meeting_deactivated','meeting_reactivated') AND JSON_CONTAINS_PATH(payload, 'all', '$.registryId', '$.scopeId')) OR
  (eventType = 'session_started' AND JSON_CONTAINS_PATH(payload, 'all', '$.sessionId', '$.registryId', '$.scopeId')) OR
  (eventType = 'session_step_entered' AND JSON_CONTAINS_PATH(payload, 'all', '$.sessionId', '$.stepKey')) OR
  (eventType = 'session_ids_snapshot' AND JSON_CONTAINS_PATH(payload, 'all', '$.sessionId', '$.issueCount')) OR
  (eventType = 'session_item_captured' AND JSON_CONTAINS_PATH(payload, 'all', '$.sessionId', '$.itemId', '$.destinationScopeId')) OR
  (eventType = 'session_vote_cast' AND JSON_CONTAINS_PATH(payload, 'all', '$.sessionId', '$.issueItemId', '$.voterPersonId', '$.voteKind')) OR
  (eventType IN ('session_completed','session_auto_closed') AND JSON_CONTAINS_PATH(payload, 'all', '$.sessionId', '$.classification')) OR
  (eventType = 'session_report_created' AND JSON_CONTAINS_PATH(payload, 'all', '$.sessionId', '$.reportId')) OR
  (eventType = 'work_item_created' AND JSON_CONTAINS_PATH(payload, 'all', '$.itemId', '$.itemType', '$.primaryScopeId')) OR
  (eventType = 'work_item_moved' AND JSON_CONTAINS_PATH(payload, 'all', '$.itemId', '$.fromScopeId', '$.toScopeId')) OR
  (eventType = 'work_item_status_changed' AND JSON_CONTAINS_PATH(payload, 'all', '$.itemId', '$.fromStatus', '$.toStatus')) OR
  (eventType = 'work_item_assigned' AND JSON_CONTAINS_PATH(payload, 'all', '$.itemId', '$.assigneePersonId')) OR
  (eventType = 'work_item_comment_added' AND JSON_CONTAINS_PATH(payload, 'all', '$.itemId', '$.commentId')) OR
  (eventType = 'work_item_mention_added' AND JSON_CONTAINS_PATH(payload, 'all', '$.itemId', '$.mentionedPersonId'))
);

CREATE TABLE `pulse_meeting_registry` (
  `id` int AUTO_INCREMENT NOT NULL,
  `scopeId` int NOT NULL,
  `meetingKind` ENUM('l10','one_on_one') NOT NULL,
  `displayName` varchar(255) NOT NULL,
  `scheduleDay` ENUM('monday','tuesday','wednesday','thursday','friday','saturday','sunday'),
  `scheduleTime` varchar(5),
  `timezone` varchar(64) NOT NULL DEFAULT 'America/New_York',
  `expectedDurationMinutes` int NOT NULL DEFAULT 90,
  `minimumValidDurationMinutes` int NOT NULL DEFAULT 15,
  `sectionVisibility` json NOT NULL,
  `isActive` boolean NOT NULL DEFAULT TRUE,
  `deactivatedAt` timestamp NULL,
  `deactivatedByPersonId` int NULL,
  `deactivationReason` text,
  `createdByPersonId` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `pulse_meeting_registry_pk` PRIMARY KEY (`id`),
  CONSTRAINT `pulse_meeting_registry_scope_unique` UNIQUE (`scopeId`),
  CONSTRAINT `pulse_meeting_registry_scope_fk` FOREIGN KEY (`scopeId`) REFERENCES `pulse_scopes`(`id`) ON DELETE RESTRICT,
  CONSTRAINT `pulse_meeting_registry_deactivated_by_fk` FOREIGN KEY (`deactivatedByPersonId`) REFERENCES `pulse_people`(`id`) ON DELETE SET NULL,
  CONSTRAINT `pulse_meeting_registry_created_by_fk` FOREIGN KEY (`createdByPersonId`) REFERENCES `pulse_people`(`id`) ON DELETE RESTRICT,
  INDEX `pulse_meeting_registry_active_kind_idx` (`isActive`, `meetingKind`, `displayName`)
);

CREATE TABLE `pulse_meeting_sessions` (
  `id` varchar(64) NOT NULL,
  `registryId` int NOT NULL,
  `scopeId` int NOT NULL,
  `status` ENUM('in_progress','completed','auto_closed') NOT NULL DEFAULT 'in_progress',
  `classification` ENUM('in_progress','valid','auto_closed','too_short','stuck') NOT NULL DEFAULT 'in_progress',
  `activeStepKey` varchar(64),
  `agendaState` json NOT NULL,
  `registrySnapshot` json NOT NULL,
  `attendeeSnapshot` json NOT NULL,
  `idsIssueCountSnapshot` int NULL,
  `ratings` json NULL,
  `completionData` json NULL,
  `startedByPersonId` int NOT NULL,
  `completedByPersonId` int NULL,
  `startedAt` timestamp NOT NULL,
  `endedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `pulse_meeting_sessions_pk` PRIMARY KEY (`id`),
  CONSTRAINT `pulse_meeting_sessions_registry_fk` FOREIGN KEY (`registryId`) REFERENCES `pulse_meeting_registry`(`id`) ON DELETE RESTRICT,
  CONSTRAINT `pulse_meeting_sessions_scope_fk` FOREIGN KEY (`scopeId`) REFERENCES `pulse_scopes`(`id`) ON DELETE RESTRICT,
  CONSTRAINT `pulse_meeting_sessions_started_by_fk` FOREIGN KEY (`startedByPersonId`) REFERENCES `pulse_people`(`id`) ON DELETE RESTRICT,
  CONSTRAINT `pulse_meeting_sessions_completed_by_fk` FOREIGN KEY (`completedByPersonId`) REFERENCES `pulse_people`(`id`) ON DELETE SET NULL,
  INDEX `pulse_meeting_sessions_registry_status_idx` (`registryId`, `status`, `startedAt`),
  INDEX `pulse_meeting_sessions_scope_started_idx` (`scopeId`, `startedAt`)
);

CREATE TABLE `pulse_session_step_snapshots` (
  `id` int AUTO_INCREMENT NOT NULL,
  `sessionId` varchar(64) NOT NULL,
  `stepKey` varchar(64) NOT NULL,
  `ordinal` int NOT NULL,
  `isVisible` boolean NOT NULL,
  `state` ENUM('pending','active','completed','skipped') NOT NULL DEFAULT 'pending',
  `startedAt` timestamp NULL,
  `endedAt` timestamp NULL,
  `durationSeconds` int NOT NULL DEFAULT 0,
  `snapshot` json NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `pulse_session_step_snapshots_pk` PRIMARY KEY (`id`),
  CONSTRAINT `pulse_session_step_snapshots_session_step_unique` UNIQUE (`sessionId`, `stepKey`),
  CONSTRAINT `pulse_session_step_snapshots_session_fk` FOREIGN KEY (`sessionId`) REFERENCES `pulse_meeting_sessions`(`id`) ON DELETE CASCADE,
  INDEX `pulse_session_step_snapshots_session_ordinal_idx` (`sessionId`, `ordinal`)
);

CREATE TABLE `pulse_session_votes` (
  `id` int AUTO_INCREMENT NOT NULL,
  `sessionId` varchar(64) NOT NULL,
  `issueItemId` int NOT NULL,
  `voterPersonId` int NOT NULL,
  `voteKind` ENUM('priority','rocket') NOT NULL DEFAULT 'priority',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `pulse_session_votes_pk` PRIMARY KEY (`id`),
  CONSTRAINT `pulse_session_votes_session_issue_voter_kind_unique` UNIQUE (`sessionId`, `issueItemId`, `voterPersonId`, `voteKind`),
  CONSTRAINT `pulse_session_votes_session_fk` FOREIGN KEY (`sessionId`) REFERENCES `pulse_meeting_sessions`(`id`) ON DELETE CASCADE,
  CONSTRAINT `pulse_session_votes_issue_fk` FOREIGN KEY (`issueItemId`) REFERENCES `pulse_issues`(`itemId`) ON DELETE CASCADE,
  CONSTRAINT `pulse_session_votes_voter_fk` FOREIGN KEY (`voterPersonId`) REFERENCES `pulse_people`(`id`) ON DELETE CASCADE
);

CREATE TABLE `pulse_session_item_captures` (
  `id` int AUTO_INCREMENT NOT NULL,
  `sessionId` varchar(64) NOT NULL,
  `itemId` int NOT NULL,
  `destinationScopeId` int NOT NULL,
  `captureKind` ENUM('todo','issue') NOT NULL,
  `capturedByPersonId` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `pulse_session_item_captures_pk` PRIMARY KEY (`id`),
  CONSTRAINT `pulse_session_item_captures_session_fk` FOREIGN KEY (`sessionId`) REFERENCES `pulse_meeting_sessions`(`id`) ON DELETE CASCADE,
  CONSTRAINT `pulse_session_item_captures_item_fk` FOREIGN KEY (`itemId`) REFERENCES `pulse_work_items`(`id`) ON DELETE RESTRICT,
  CONSTRAINT `pulse_session_item_captures_destination_scope_fk` FOREIGN KEY (`destinationScopeId`) REFERENCES `pulse_scopes`(`id`) ON DELETE RESTRICT,
  CONSTRAINT `pulse_session_item_captures_captured_by_fk` FOREIGN KEY (`capturedByPersonId`) REFERENCES `pulse_people`(`id`) ON DELETE RESTRICT,
  INDEX `pulse_session_item_captures_session_time_idx` (`sessionId`, `createdAt`)
);

CREATE TABLE `pulse_session_reports` (
  `id` int AUTO_INCREMENT NOT NULL,
  `sessionId` varchar(64) NOT NULL,
  `registryId` int NOT NULL,
  `scopeId` int NOT NULL,
  `classification` ENUM('valid','auto_closed','too_short','stuck') NOT NULL,
  `reportPayload` json NOT NULL,
  `concludedAt` timestamp NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `pulse_session_reports_pk` PRIMARY KEY (`id`),
  CONSTRAINT `pulse_session_reports_session_unique` UNIQUE (`sessionId`),
  CONSTRAINT `pulse_session_reports_session_fk` FOREIGN KEY (`sessionId`) REFERENCES `pulse_meeting_sessions`(`id`) ON DELETE RESTRICT,
  CONSTRAINT `pulse_session_reports_registry_fk` FOREIGN KEY (`registryId`) REFERENCES `pulse_meeting_registry`(`id`) ON DELETE RESTRICT,
  CONSTRAINT `pulse_session_reports_scope_fk` FOREIGN KEY (`scopeId`) REFERENCES `pulse_scopes`(`id`) ON DELETE RESTRICT,
  INDEX `pulse_session_reports_scope_concluded_idx` (`scopeId`, `concludedAt`)
);

DELIMITER //
CREATE TRIGGER `pulse_session_reports_no_update`
BEFORE UPDATE ON `pulse_session_reports`
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Pulse session reports are immutable';
END//
CREATE TRIGGER `pulse_session_reports_no_delete`
BEFORE DELETE ON `pulse_session_reports`
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Pulse session reports are immutable';
END//
DELIMITER ;
