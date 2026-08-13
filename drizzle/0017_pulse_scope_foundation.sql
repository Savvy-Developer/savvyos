-- Pulse Scope Foundation
-- The superseding blueprint replaces the empty pre-foundation registry tables with canonical
-- person/account, Scope, membership, calendar, and append-only domain-event contracts.

DROP TABLE IF EXISTS `pulse_one_on_one_access`;
DROP TABLE IF EXISTS `pulse_one_on_ones`;
DROP TABLE IF EXISTS `pulse_team_members`;
DROP TABLE IF EXISTS `pulse_teams`;
DROP TABLE IF EXISTS `pulse_meeting_access`;
DROP TABLE IF EXISTS `pulse_meetings`;

CREATE TABLE `pulse_people` (
  `id` int AUTO_INCREMENT NOT NULL,
  `displayName` varchar(255) NOT NULL,
  `primaryEmail` varchar(320),
  `timezone` varchar(64),
  `isActive` boolean NOT NULL DEFAULT TRUE,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `pulse_people_id_pk` PRIMARY KEY (`id`),
  INDEX `pulse_people_active_name_idx` (`isActive`, `displayName`)
);

CREATE TABLE `pulse_person_accounts` (
  `id` int AUTO_INCREMENT NOT NULL,
  `personId` int NOT NULL,
  `userId` int NOT NULL,
  `isPrimary` boolean NOT NULL DEFAULT TRUE,
  `linkedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `unlinkedAt` timestamp NULL,
  CONSTRAINT `pulse_person_accounts_id_pk` PRIMARY KEY (`id`),
  CONSTRAINT `pulse_person_accounts_user_unique` UNIQUE (`userId`),
  CONSTRAINT `pulse_person_accounts_person_fk` FOREIGN KEY (`personId`) REFERENCES `pulse_people`(`id`) ON DELETE CASCADE,
  CONSTRAINT `pulse_person_accounts_user_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  INDEX `pulse_person_accounts_person_active_idx` (`personId`, `unlinkedAt`)
);

CREATE TABLE `pulse_scopes` (
  `id` int AUTO_INCREMENT NOT NULL,
  `scopeType` ENUM('company','l10','team','one_on_one','private') NOT NULL,
  `name` varchar(255) NOT NULL,
  `description` text,
  `membershipPolicy` ENUM('explicit','active_accounts','owner_only') NOT NULL DEFAULT 'explicit',
  `accessPolicy` ENUM('members','explicit_members','owner_only') NOT NULL DEFAULT 'members',
  `ownerPersonId` int,
  `isActive` boolean NOT NULL DEFAULT TRUE,
  `archivedAt` timestamp NULL,
  `archivedByPersonId` int,
  `archiveReason` text,
  `createdByPersonId` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `pulse_scopes_id_pk` PRIMARY KEY (`id`),
  CONSTRAINT `pulse_scopes_owner_person_fk` FOREIGN KEY (`ownerPersonId`) REFERENCES `pulse_people`(`id`) ON DELETE SET NULL,
  CONSTRAINT `pulse_scopes_archived_by_person_fk` FOREIGN KEY (`archivedByPersonId`) REFERENCES `pulse_people`(`id`) ON DELETE SET NULL,
  CONSTRAINT `pulse_scopes_created_by_person_fk` FOREIGN KEY (`createdByPersonId`) REFERENCES `pulse_people`(`id`) ON DELETE RESTRICT,
  INDEX `pulse_scopes_active_type_name_idx` (`isActive`, `scopeType`, `name`),
  INDEX `pulse_scopes_owner_active_idx` (`ownerPersonId`, `isActive`)
);

CREATE TABLE `pulse_scope_memberships` (
  `id` int AUTO_INCREMENT NOT NULL,
  `scopeId` int NOT NULL,
  `personId` int NOT NULL,
  `membershipRole` ENUM('owner','manager','member','viewer') NOT NULL DEFAULT 'member',
  `isActive` boolean NOT NULL DEFAULT TRUE,
  `grantedByPersonId` int,
  `grantedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `revokedAt` timestamp NULL,
  `revokedByPersonId` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `pulse_scope_memberships_id_pk` PRIMARY KEY (`id`),
  CONSTRAINT `pulse_scope_memberships_scope_person_unique` UNIQUE (`scopeId`, `personId`),
  CONSTRAINT `pulse_scope_memberships_scope_fk` FOREIGN KEY (`scopeId`) REFERENCES `pulse_scopes`(`id`) ON DELETE CASCADE,
  CONSTRAINT `pulse_scope_memberships_person_fk` FOREIGN KEY (`personId`) REFERENCES `pulse_people`(`id`) ON DELETE CASCADE,
  CONSTRAINT `pulse_scope_memberships_granted_by_person_fk` FOREIGN KEY (`grantedByPersonId`) REFERENCES `pulse_people`(`id`) ON DELETE SET NULL,
  CONSTRAINT `pulse_scope_memberships_revoked_by_person_fk` FOREIGN KEY (`revokedByPersonId`) REFERENCES `pulse_people`(`id`) ON DELETE SET NULL,
  INDEX `pulse_scope_memberships_person_active_idx` (`personId`, `isActive`, `scopeId`),
  INDEX `pulse_scope_memberships_scope_active_idx` (`scopeId`, `isActive`)
);

CREATE TABLE `pulse_l10_settings` (
  `id` int AUTO_INCREMENT NOT NULL,
  `scopeId` int NOT NULL,
  `scheduleDay` ENUM('monday','tuesday','wednesday','thursday','friday','saturday','sunday') NOT NULL,
  `scheduleTime` varchar(5) NOT NULL,
  `timezone` varchar(64) NOT NULL DEFAULT 'America/New_York',
  `durationMinutes` int NOT NULL DEFAULT 90,
  `sectionVisibility` json NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `pulse_l10_settings_id_pk` PRIMARY KEY (`id`),
  CONSTRAINT `pulse_l10_settings_scope_unique` UNIQUE (`scopeId`),
  CONSTRAINT `pulse_l10_settings_scope_fk` FOREIGN KEY (`scopeId`) REFERENCES `pulse_scopes`(`id`) ON DELETE CASCADE
);

CREATE TABLE `pulse_calendar_config` (
  `id` int AUTO_INCREMENT NOT NULL,
  `timezone` varchar(64) NOT NULL DEFAULT 'America/New_York',
  `fiscalYearStartMonth` int NOT NULL DEFAULT 1,
  `operatingWeekStartsOn` int NOT NULL DEFAULT 1,
  `dueWindowDays` int NOT NULL DEFAULT 7,
  `isActive` boolean NOT NULL DEFAULT TRUE,
  `updatedByPersonId` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `pulse_calendar_config_id_pk` PRIMARY KEY (`id`),
  CONSTRAINT `pulse_calendar_config_updated_by_person_fk` FOREIGN KEY (`updatedByPersonId`) REFERENCES `pulse_people`(`id`) ON DELETE SET NULL
);

CREATE TABLE `pulse_reporting_periods` (
  `id` int AUTO_INCREMENT NOT NULL,
  `calendarConfigId` int NOT NULL,
  `periodType` ENUM('month','quarter','year','custom') NOT NULL,
  `name` varchar(128) NOT NULL,
  `startsOn` date NOT NULL,
  `endsOn` date NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `pulse_reporting_periods_id_pk` PRIMARY KEY (`id`),
  CONSTRAINT `pulse_reporting_periods_calendar_fk` FOREIGN KEY (`calendarConfigId`) REFERENCES `pulse_calendar_config`(`id`) ON DELETE CASCADE,
  INDEX `pulse_reporting_periods_calendar_dates_idx` (`calendarConfigId`, `startsOn`, `endsOn`)
);

CREATE TABLE `pulse_holidays` (
  `id` int AUTO_INCREMENT NOT NULL,
  `calendarConfigId` int NOT NULL,
  `name` varchar(255) NOT NULL,
  `holidayDate` date NOT NULL,
  `isBusinessDay` boolean NOT NULL DEFAULT FALSE,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `pulse_holidays_id_pk` PRIMARY KEY (`id`),
  CONSTRAINT `pulse_holidays_calendar_date_unique` UNIQUE (`calendarConfigId`, `holidayDate`),
  CONSTRAINT `pulse_holidays_calendar_fk` FOREIGN KEY (`calendarConfigId`) REFERENCES `pulse_calendar_config`(`id`) ON DELETE CASCADE
);

CREATE TABLE `pulse_domain_events` (
  `id` bigint AUTO_INCREMENT NOT NULL,
  `eventType` ENUM('scope_created','scope_archived','scope_reactivated','membership_granted','membership_revoked','calendar_configured','reporting_period_created','holiday_created') NOT NULL,
  `scopeId` int,
  `actorPersonId` int,
  `payload` json NOT NULL,
  `occurredAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `pulse_domain_events_id_pk` PRIMARY KEY (`id`),
  CONSTRAINT `pulse_domain_events_scope_fk` FOREIGN KEY (`scopeId`) REFERENCES `pulse_scopes`(`id`) ON DELETE SET NULL,
  CONSTRAINT `pulse_domain_events_actor_person_fk` FOREIGN KEY (`actorPersonId`) REFERENCES `pulse_people`(`id`) ON DELETE SET NULL,
  CONSTRAINT `pulse_domain_events_payload_type_ck` CHECK (
    (eventType = 'scope_created' AND JSON_CONTAINS_PATH(payload, 'all', '$.scopeType', '$.name')) OR
    (eventType IN ('scope_archived','scope_reactivated') AND JSON_CONTAINS_PATH(payload, 'all', '$.scopeId')) OR
    (eventType IN ('membership_granted','membership_revoked') AND JSON_CONTAINS_PATH(payload, 'all', '$.scopeId', '$.personId')) OR
    (eventType = 'calendar_configured' AND JSON_CONTAINS_PATH(payload, 'all', '$.timezone', '$.fiscalYearStartMonth')) OR
    (eventType = 'reporting_period_created' AND JSON_CONTAINS_PATH(payload, 'all', '$.periodType', '$.startsOn', '$.endsOn')) OR
    (eventType = 'holiday_created' AND JSON_CONTAINS_PATH(payload, 'all', '$.holidayDate', '$.name'))
  ),
  INDEX `pulse_domain_events_scope_time_idx` (`scopeId`, `occurredAt`),
  INDEX `pulse_domain_events_type_time_idx` (`eventType`, `occurredAt`)
);

DELIMITER //
CREATE TRIGGER `pulse_domain_events_no_update`
BEFORE UPDATE ON `pulse_domain_events`
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Pulse domain events are append-only';
END//
CREATE TRIGGER `pulse_domain_events_no_delete`
BEFORE DELETE ON `pulse_domain_events`
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Pulse domain events are append-only';
END//
DELIMITER ;
