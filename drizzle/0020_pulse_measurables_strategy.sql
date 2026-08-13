-- Pulse measurable, scorecard, alert, and one-strategy-hierarchy foundation.

ALTER TABLE `pulse_domain_events`
  MODIFY COLUMN `eventType` ENUM(
    'scope_created','scope_archived','scope_reactivated','membership_granted','membership_revoked',
    'calendar_configured','reporting_period_created','holiday_created',
    'meeting_created','meeting_deactivated','meeting_reactivated',
    'session_started','session_step_entered','session_ids_snapshot','session_item_captured','session_vote_cast',
    'session_completed','session_auto_closed','session_report_created',
    'measurable_created','measurable_placed','measurable_entry_recorded','measurable_alert_raised',
    'strategy_node_created','strategy_node_status_changed','strategy_scope_placed','strategy_raci_updated',
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
  (eventType = 'measurable_created' AND JSON_CONTAINS_PATH(payload, 'all', '$.measurableId', '$.name')) OR
  (eventType = 'measurable_placed' AND JSON_CONTAINS_PATH(payload, 'all', '$.measurableId', '$.scopeId')) OR
  (eventType = 'measurable_entry_recorded' AND JSON_CONTAINS_PATH(payload, 'all', '$.measurableId', '$.entryId', '$.periodKey')) OR
  (eventType = 'measurable_alert_raised' AND JSON_CONTAINS_PATH(payload, 'all', '$.measurableId', '$.entryId', '$.alertState')) OR
  (eventType = 'strategy_node_created' AND JSON_CONTAINS_PATH(payload, 'all', '$.nodeId', '$.nodeType')) OR
  (eventType = 'strategy_node_status_changed' AND JSON_CONTAINS_PATH(payload, 'all', '$.nodeId', '$.status')) OR
  (eventType = 'strategy_scope_placed' AND JSON_CONTAINS_PATH(payload, 'all', '$.nodeId', '$.scopeId')) OR
  (eventType = 'strategy_raci_updated' AND JSON_CONTAINS_PATH(payload, 'all', '$.nodeId', '$.accountablePersonId')) OR
  (eventType = 'work_item_created' AND JSON_CONTAINS_PATH(payload, 'all', '$.itemId', '$.itemType', '$.primaryScopeId')) OR
  (eventType = 'work_item_moved' AND JSON_CONTAINS_PATH(payload, 'all', '$.itemId', '$.fromScopeId', '$.toScopeId')) OR
  (eventType = 'work_item_status_changed' AND JSON_CONTAINS_PATH(payload, 'all', '$.itemId', '$.fromStatus', '$.toStatus')) OR
  (eventType = 'work_item_assigned' AND JSON_CONTAINS_PATH(payload, 'all', '$.itemId', '$.assigneePersonId')) OR
  (eventType = 'work_item_comment_added' AND JSON_CONTAINS_PATH(payload, 'all', '$.itemId', '$.commentId')) OR
  (eventType = 'work_item_mention_added' AND JSON_CONTAINS_PATH(payload, 'all', '$.itemId', '$.mentionedPersonId'))
);

CREATE TABLE `pulse_measurables` (
  `id` int AUTO_INCREMENT NOT NULL,
  `name` varchar(255) NOT NULL,
  `definition` text,
  `unit` varchar(64) NOT NULL DEFAULT 'count',
  `cadence` ENUM('weekly','monthly','quarterly') NOT NULL DEFAULT 'weekly',
  `aggregation` ENUM('last','sum','average') NOT NULL DEFAULT 'last',
  `direction` ENUM('higher_is_better','lower_is_better') NOT NULL DEFAULT 'higher_is_better',
  `targetValue` decimal(18,4),
  `warningValue` decimal(18,4),
  `criticalValue` decimal(18,4),
  `ownerPersonId` int NULL,
  `alertEnabled` boolean NOT NULL DEFAULT TRUE,
  `isActive` boolean NOT NULL DEFAULT TRUE,
  `createdByPersonId` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `pulse_measurables_pk` PRIMARY KEY (`id`),
  CONSTRAINT `pulse_measurables_owner_fk` FOREIGN KEY (`ownerPersonId`) REFERENCES `pulse_people`(`id`) ON DELETE SET NULL,
  CONSTRAINT `pulse_measurables_created_by_fk` FOREIGN KEY (`createdByPersonId`) REFERENCES `pulse_people`(`id`) ON DELETE RESTRICT,
  INDEX `pulse_measurables_active_owner_idx` (`isActive`, `ownerPersonId`, `name`)
);

CREATE TABLE `pulse_measurable_placements` (
  `id` int AUTO_INCREMENT NOT NULL,
  `measurableId` int NOT NULL,
  `scopeId` int NOT NULL,
  `displayOrder` int NOT NULL DEFAULT 0,
  `isActive` boolean NOT NULL DEFAULT TRUE,
  `addedByPersonId` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `pulse_measurable_placements_pk` PRIMARY KEY (`id`),
  CONSTRAINT `pulse_measurable_placements_measurable_scope_unique` UNIQUE (`measurableId`, `scopeId`),
  CONSTRAINT `pulse_measurable_placements_measurable_fk` FOREIGN KEY (`measurableId`) REFERENCES `pulse_measurables`(`id`) ON DELETE CASCADE,
  CONSTRAINT `pulse_measurable_placements_scope_fk` FOREIGN KEY (`scopeId`) REFERENCES `pulse_scopes`(`id`) ON DELETE CASCADE,
  CONSTRAINT `pulse_measurable_placements_added_by_fk` FOREIGN KEY (`addedByPersonId`) REFERENCES `pulse_people`(`id`) ON DELETE RESTRICT,
  INDEX `pulse_measurable_placements_scope_active_order_idx` (`scopeId`, `isActive`, `displayOrder`)
);

CREATE TABLE `pulse_measurable_entries` (
  `id` int AUTO_INCREMENT NOT NULL,
  `measurableId` int NOT NULL,
  `periodKey` varchar(96) NOT NULL,
  `periodStart` date NOT NULL,
  `periodEnd` date NOT NULL,
  `value` decimal(18,4) NOT NULL,
  `note` text,
  `submittedByPersonId` int NOT NULL,
  `submittedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `pulse_measurable_entries_pk` PRIMARY KEY (`id`),
  CONSTRAINT `pulse_measurable_entries_measurable_period_unique` UNIQUE (`measurableId`, `periodKey`),
  CONSTRAINT `pulse_measurable_entries_measurable_fk` FOREIGN KEY (`measurableId`) REFERENCES `pulse_measurables`(`id`) ON DELETE CASCADE,
  CONSTRAINT `pulse_measurable_entries_submitted_by_fk` FOREIGN KEY (`submittedByPersonId`) REFERENCES `pulse_people`(`id`) ON DELETE RESTRICT,
  INDEX `pulse_measurable_entries_period_idx` (`periodStart`, `periodEnd`)
);

CREATE TABLE `pulse_measurable_alerts` (
  `id` int AUTO_INCREMENT NOT NULL,
  `measurableId` int NOT NULL,
  `entryId` int NOT NULL,
  `scopeId` int NOT NULL,
  `alertState` ENUM('warning','critical') NOT NULL,
  `observedValue` decimal(18,4) NOT NULL,
  `periodKey` varchar(96) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `pulse_measurable_alerts_pk` PRIMARY KEY (`id`),
  CONSTRAINT `pulse_measurable_alerts_entry_scope_unique` UNIQUE (`entryId`, `scopeId`),
  CONSTRAINT `pulse_measurable_alerts_measurable_fk` FOREIGN KEY (`measurableId`) REFERENCES `pulse_measurables`(`id`) ON DELETE CASCADE,
  CONSTRAINT `pulse_measurable_alerts_entry_fk` FOREIGN KEY (`entryId`) REFERENCES `pulse_measurable_entries`(`id`) ON DELETE CASCADE,
  CONSTRAINT `pulse_measurable_alerts_scope_fk` FOREIGN KEY (`scopeId`) REFERENCES `pulse_scopes`(`id`) ON DELETE CASCADE,
  INDEX `pulse_measurable_alerts_scope_state_time_idx` (`scopeId`, `alertState`, `createdAt`)
);

CREATE TABLE `pulse_strategy_nodes` (
  `id` int AUTO_INCREMENT NOT NULL,
  `nodeType` ENUM('vision','annual_goal','quarterly_rock','milestone') NOT NULL,
  `parentId` int NULL,
  `title` varchar(512) NOT NULL,
  `description` text,
  `status` ENUM('not_started','on_track','at_risk','complete','skipped') NOT NULL DEFAULT 'not_started',
  `startsOn` date NULL,
  `dueOn` date NULL,
  `sortOrder` int NOT NULL DEFAULT 0,
  `accountablePersonId` int NOT NULL,
  `responsiblePersonId` int NULL,
  `createdByPersonId` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `pulse_strategy_nodes_pk` PRIMARY KEY (`id`),
  CONSTRAINT `pulse_strategy_nodes_parent_fk` FOREIGN KEY (`parentId`) REFERENCES `pulse_strategy_nodes`(`id`) ON DELETE CASCADE,
  CONSTRAINT `pulse_strategy_nodes_accountable_fk` FOREIGN KEY (`accountablePersonId`) REFERENCES `pulse_people`(`id`) ON DELETE RESTRICT,
  CONSTRAINT `pulse_strategy_nodes_responsible_fk` FOREIGN KEY (`responsiblePersonId`) REFERENCES `pulse_people`(`id`) ON DELETE SET NULL,
  CONSTRAINT `pulse_strategy_nodes_created_by_fk` FOREIGN KEY (`createdByPersonId`) REFERENCES `pulse_people`(`id`) ON DELETE RESTRICT,
  INDEX `pulse_strategy_nodes_parent_order_idx` (`parentId`, `sortOrder`),
  INDEX `pulse_strategy_nodes_type_status_idx` (`nodeType`, `status`, `dueOn`)
);

CREATE TABLE `pulse_strategy_raci` (
  `id` int AUTO_INCREMENT NOT NULL,
  `nodeId` int NOT NULL,
  `personId` int NOT NULL,
  `role` ENUM('responsible','accountable','consulted','informed') NOT NULL,
  `isActive` boolean NOT NULL DEFAULT TRUE,
  `assignedByPersonId` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `pulse_strategy_raci_pk` PRIMARY KEY (`id`),
  CONSTRAINT `pulse_strategy_raci_node_person_role_unique` UNIQUE (`nodeId`, `personId`, `role`),
  CONSTRAINT `pulse_strategy_raci_node_fk` FOREIGN KEY (`nodeId`) REFERENCES `pulse_strategy_nodes`(`id`) ON DELETE CASCADE,
  CONSTRAINT `pulse_strategy_raci_person_fk` FOREIGN KEY (`personId`) REFERENCES `pulse_people`(`id`) ON DELETE CASCADE,
  CONSTRAINT `pulse_strategy_raci_assigned_by_fk` FOREIGN KEY (`assignedByPersonId`) REFERENCES `pulse_people`(`id`) ON DELETE RESTRICT,
  INDEX `pulse_strategy_raci_node_role_active_idx` (`nodeId`, `role`, `isActive`)
);

CREATE TABLE `pulse_strategy_scope_placements` (
  `id` int AUTO_INCREMENT NOT NULL,
  `nodeId` int NOT NULL,
  `scopeId` int NOT NULL,
  `isVisible` boolean NOT NULL DEFAULT TRUE,
  `presentationStatus` ENUM('not_started','on_track','at_risk','complete','skipped') NULL,
  `addedByPersonId` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `pulse_strategy_scope_placements_pk` PRIMARY KEY (`id`),
  CONSTRAINT `pulse_strategy_scope_placements_node_scope_unique` UNIQUE (`nodeId`, `scopeId`),
  CONSTRAINT `pulse_strategy_scope_placements_node_fk` FOREIGN KEY (`nodeId`) REFERENCES `pulse_strategy_nodes`(`id`) ON DELETE CASCADE,
  CONSTRAINT `pulse_strategy_scope_placements_scope_fk` FOREIGN KEY (`scopeId`) REFERENCES `pulse_scopes`(`id`) ON DELETE CASCADE,
  CONSTRAINT `pulse_strategy_scope_placements_added_by_fk` FOREIGN KEY (`addedByPersonId`) REFERENCES `pulse_people`(`id`) ON DELETE RESTRICT,
  INDEX `pulse_strategy_scope_placements_scope_visible_idx` (`scopeId`, `isVisible`, `nodeId`)
);

DELIMITER //
CREATE TRIGGER `pulse_strategy_raci_one_accountable_insert`
BEFORE INSERT ON `pulse_strategy_raci`
FOR EACH ROW
BEGIN
  IF NEW.`role` = 'accountable' AND NEW.`isActive` = TRUE AND EXISTS (SELECT 1 FROM `pulse_strategy_raci` WHERE `nodeId` = NEW.`nodeId` AND `role` = 'accountable' AND `isActive` = TRUE) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A strategy node may have exactly one active Accountable';
  END IF;
END//
CREATE TRIGGER `pulse_strategy_raci_one_accountable_update`
BEFORE UPDATE ON `pulse_strategy_raci`
FOR EACH ROW
BEGIN
  IF NEW.`role` = 'accountable' AND NEW.`isActive` = TRUE AND EXISTS (SELECT 1 FROM `pulse_strategy_raci` WHERE `nodeId` = NEW.`nodeId` AND `role` = 'accountable' AND `isActive` = TRUE AND `id` <> OLD.`id`) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A strategy node may have exactly one active Accountable';
  END IF;
END//
CREATE TRIGGER `pulse_strategy_raci_no_accountable_delete`
BEFORE DELETE ON `pulse_strategy_raci`
FOR EACH ROW
BEGIN
  IF OLD.`role` = 'accountable' AND OLD.`isActive` = TRUE THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Accountable must be reassigned, not removed';
  END IF;
END//
DELIMITER ;
