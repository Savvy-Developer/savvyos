-- Pulse communication domain: cascades, announcements, frozen ledgers, intents, deliveries, and acknowledgments.

ALTER TABLE `pulse_domain_events`
  MODIFY COLUMN `eventType` ENUM(
    'scope_created','scope_archived','scope_reactivated','membership_granted','membership_revoked',
    'calendar_configured','reporting_period_created','holiday_created',
    'meeting_created','meeting_deactivated','meeting_reactivated',
    'session_started','session_step_entered','session_ids_snapshot','session_item_captured','session_vote_cast','session_completed','session_auto_closed','session_report_created',
    'measurable_created','measurable_placed','measurable_entry_recorded','measurable_alert_raised',
    'strategy_node_created','strategy_node_status_changed','strategy_scope_placed','strategy_raci_updated',
    'communication_created','communication_published','notification_intent_created','notification_delivered','notification_suppressed','communication_acknowledged',
    'work_item_created','work_item_moved','work_item_status_changed','work_item_assigned','work_item_comment_added','work_item_mention_added'
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
  (eventType = 'communication_created' AND JSON_CONTAINS_PATH(payload, 'all', '$.communicationId', '$.communicationType', '$.sourceScopeId')) OR
  (eventType = 'communication_published' AND JSON_CONTAINS_PATH(payload, 'all', '$.communicationId', '$.recipientCount')) OR
  (eventType = 'notification_intent_created' AND JSON_CONTAINS_PATH(payload, 'all', '$.communicationId', '$.recipientPersonId', '$.intentId')) OR
  (eventType = 'notification_delivered' AND JSON_CONTAINS_PATH(payload, 'all', '$.communicationId', '$.recipientPersonId', '$.channel')) OR
  (eventType = 'notification_suppressed' AND JSON_CONTAINS_PATH(payload, 'all', '$.communicationId', '$.recipientPersonId', '$.reason')) OR
  (eventType = 'communication_acknowledged' AND JSON_CONTAINS_PATH(payload, 'all', '$.communicationId', '$.recipientPersonId')) OR
  (eventType = 'work_item_created' AND JSON_CONTAINS_PATH(payload, 'all', '$.itemId', '$.itemType', '$.primaryScopeId')) OR
  (eventType = 'work_item_moved' AND JSON_CONTAINS_PATH(payload, 'all', '$.itemId', '$.fromScopeId', '$.toScopeId')) OR
  (eventType = 'work_item_status_changed' AND JSON_CONTAINS_PATH(payload, 'all', '$.itemId', '$.fromStatus', '$.toStatus')) OR
  (eventType = 'work_item_assigned' AND JSON_CONTAINS_PATH(payload, 'all', '$.itemId', '$.assigneePersonId')) OR
  (eventType = 'work_item_comment_added' AND JSON_CONTAINS_PATH(payload, 'all', '$.itemId', '$.commentId')) OR
  (eventType = 'work_item_mention_added' AND JSON_CONTAINS_PATH(payload, 'all', '$.itemId', '$.mentionedPersonId'))
);

CREATE TABLE `pulse_communications` (
  `id` int AUTO_INCREMENT NOT NULL,
  `communicationType` ENUM('cascade','announcement') NOT NULL,
  `sourceScopeId` int NOT NULL,
  `title` varchar(512) NOT NULL,
  `body` text NOT NULL,
  `status` ENUM('draft','published','cancelled') NOT NULL DEFAULT 'draft',
  `createdByPersonId` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `publishedAt` timestamp NULL,
  `cancelledAt` timestamp NULL,
  CONSTRAINT `pulse_communications_pk` PRIMARY KEY (`id`),
  CONSTRAINT `pulse_communications_source_fk` FOREIGN KEY (`sourceScopeId`) REFERENCES `pulse_scopes`(`id`) ON DELETE RESTRICT,
  CONSTRAINT `pulse_communications_created_by_fk` FOREIGN KEY (`createdByPersonId`) REFERENCES `pulse_people`(`id`) ON DELETE RESTRICT,
  INDEX `pulse_communications_source_status_time_idx` (`sourceScopeId`,`status`,`publishedAt`)
);

CREATE TABLE `pulse_communication_targets` (
  `id` int AUTO_INCREMENT NOT NULL,
  `communicationId` int NOT NULL,
  `targetScopeId` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `pulse_communication_targets_pk` PRIMARY KEY (`id`),
  CONSTRAINT `pulse_communication_targets_communication_scope_unique` UNIQUE (`communicationId`,`targetScopeId`),
  CONSTRAINT `pulse_communication_targets_communication_fk` FOREIGN KEY (`communicationId`) REFERENCES `pulse_communications`(`id`) ON DELETE CASCADE,
  CONSTRAINT `pulse_communication_targets_scope_fk` FOREIGN KEY (`targetScopeId`) REFERENCES `pulse_scopes`(`id`) ON DELETE RESTRICT,
  INDEX `pulse_communication_targets_scope_idx` (`targetScopeId`,`communicationId`)
);

CREATE TABLE `pulse_communication_recipient_ledger` (
  `id` int AUTO_INCREMENT NOT NULL,
  `communicationId` int NOT NULL,
  `recipientPersonId` int NOT NULL,
  `targetScopeIds` json NOT NULL,
  `frozenAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `pulse_communication_recipient_ledger_pk` PRIMARY KEY (`id`),
  CONSTRAINT `pulse_comm_recipient_ledger_comm_person_uq` UNIQUE (`communicationId`,`recipientPersonId`),
  CONSTRAINT `pulse_communication_recipient_ledger_communication_fk` FOREIGN KEY (`communicationId`) REFERENCES `pulse_communications`(`id`) ON DELETE CASCADE,
  CONSTRAINT `pulse_communication_recipient_ledger_person_fk` FOREIGN KEY (`recipientPersonId`) REFERENCES `pulse_people`(`id`) ON DELETE RESTRICT,
  INDEX `pulse_communication_recipient_ledger_recipient_idx` (`recipientPersonId`,`communicationId`)
);

CREATE TABLE `pulse_notification_intents` (
  `id` int AUTO_INCREMENT NOT NULL,
  `communicationId` int NOT NULL,
  `recipientLedgerId` int NOT NULL,
  `recipientPersonId` int NOT NULL,
  `requestedChannels` json NOT NULL,
  `scheduledFor` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `status` ENUM('pending','evaluated','delivered','suppressed','cancelled') NOT NULL DEFAULT 'pending',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `evaluatedAt` timestamp NULL,
  CONSTRAINT `pulse_notification_intents_pk` PRIMARY KEY (`id`),
  CONSTRAINT `pulse_notification_intents_communication_recipient_unique` UNIQUE (`communicationId`,`recipientPersonId`),
  CONSTRAINT `pulse_notification_intents_communication_fk` FOREIGN KEY (`communicationId`) REFERENCES `pulse_communications`(`id`) ON DELETE CASCADE,
  CONSTRAINT `pulse_notification_intents_ledger_fk` FOREIGN KEY (`recipientLedgerId`) REFERENCES `pulse_communication_recipient_ledger`(`id`) ON DELETE CASCADE,
  CONSTRAINT `pulse_notification_intents_person_fk` FOREIGN KEY (`recipientPersonId`) REFERENCES `pulse_people`(`id`) ON DELETE RESTRICT,
  INDEX `pulse_notification_intents_status_schedule_idx` (`status`,`scheduledFor`)
);

CREATE TABLE `pulse_notification_deliveries` (
  `id` int AUTO_INCREMENT NOT NULL,
  `intentId` int NOT NULL,
  `communicationId` int NOT NULL,
  `recipientPersonId` int NOT NULL,
  `channel` ENUM('in_app','email','slack') NOT NULL,
  `outcome` ENUM('queued','delivered','suppressed','skipped','failed') NOT NULL,
  `deduplicationKey` varchar(255) NOT NULL,
  `reason` text NULL,
  `providerMessageId` varchar(255) NULL,
  `attemptedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `completedAt` timestamp NULL,
  CONSTRAINT `pulse_notification_deliveries_pk` PRIMARY KEY (`id`),
  CONSTRAINT `pulse_notification_deliveries_dedup_unique` UNIQUE (`deduplicationKey`),
  CONSTRAINT `pulse_notification_deliveries_intent_fk` FOREIGN KEY (`intentId`) REFERENCES `pulse_notification_intents`(`id`) ON DELETE CASCADE,
  CONSTRAINT `pulse_notification_deliveries_communication_fk` FOREIGN KEY (`communicationId`) REFERENCES `pulse_communications`(`id`) ON DELETE CASCADE,
  CONSTRAINT `pulse_notification_deliveries_person_fk` FOREIGN KEY (`recipientPersonId`) REFERENCES `pulse_people`(`id`) ON DELETE RESTRICT,
  INDEX `pulse_notification_deliveries_communication_recipient_idx` (`communicationId`,`recipientPersonId`)
);

CREATE TABLE `pulse_communication_acknowledgments` (
  `id` int AUTO_INCREMENT NOT NULL,
  `communicationId` int NOT NULL,
  `recipientPersonId` int NOT NULL,
  `acknowledgedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `pulse_communication_acknowledgments_pk` PRIMARY KEY (`id`),
  CONSTRAINT `pulse_comm_ack_comm_person_uq` UNIQUE (`communicationId`,`recipientPersonId`),
  CONSTRAINT `pulse_communication_acknowledgments_communication_fk` FOREIGN KEY (`communicationId`) REFERENCES `pulse_communications`(`id`) ON DELETE CASCADE,
  CONSTRAINT `pulse_communication_acknowledgments_person_fk` FOREIGN KEY (`recipientPersonId`) REFERENCES `pulse_people`(`id`) ON DELETE RESTRICT
);

DELIMITER //
CREATE TRIGGER `pulse_communication_recipient_ledger_immutable_update`
BEFORE UPDATE ON `pulse_communication_recipient_ledger`
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Pulse communication recipient ledger is frozen at publish';
END//
CREATE TRIGGER `pulse_communication_recipient_ledger_immutable_delete`
BEFORE DELETE ON `pulse_communication_recipient_ledger`
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Pulse communication recipient ledger is frozen at publish';
END//
DELIMITER ;
