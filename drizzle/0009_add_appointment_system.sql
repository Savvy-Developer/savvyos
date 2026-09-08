-- SavvyOS appointment system: additive production migration.
-- This is intentionally separate from a full schema push because production
-- contains legacy schema drift unrelated to appointments.

CREATE TABLE IF NOT EXISTS `calendar_connections` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `provider` enum('google') NOT NULL,
  `calendarId` varchar(512) NOT NULL DEFAULT 'primary',
  `connectedEmail` varchar(320) DEFAULT NULL,
  `refreshTokenEncrypted` text,
  `accessTokenEncrypted` text,
  `tokenExpiresAt` timestamp NULL DEFAULT NULL,
  `grantedScopes` text,
  `status` enum('connected','disconnected','error') NOT NULL DEFAULT 'disconnected',
  `lastError` text,
  `lastSyncedAt` timestamp NULL DEFAULT NULL,
  `disconnectedAt` timestamp NULL DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `calendar_connections_user_provider_unique` (`userId`,`provider`),
  CONSTRAINT `calendar_connections_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `appointments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `agentConnectionId` int NOT NULL,
  `contactId` int NOT NULL,
  `hostUserId` int NOT NULL,
  `scheduledByUserId` int DEFAULT NULL,
  `source` enum('savvyos','calendly') NOT NULL DEFAULT 'savvyos',
  `status` enum('scheduled','confirmed','canceled','completed','no_show') NOT NULL DEFAULT 'scheduled',
  `title` varchar(255) NOT NULL,
  `startAt` timestamp NOT NULL,
  `endAt` timestamp NOT NULL,
  `timezone` varchar(64) NOT NULL DEFAULT 'America/New_York',
  `location` varchar(512) DEFAULT NULL,
  `notes` text,
  `calendarProvider` enum('google','calendly','none') NOT NULL DEFAULT 'none',
  `externalCalendarEventId` varchar(512) DEFAULT NULL,
  `externalCalendarEventUrl` text,
  `calendlyEventUri` varchar(500) DEFAULT NULL,
  `calendlyInviteeUri` varchar(500) DEFAULT NULL,
  `calendlyCancelUrl` text,
  `calendlyRescheduleUrl` text,
  `invitationDeliveryStatus` enum('not_needed','sent','failed','managed_by_calendly') NOT NULL DEFAULT 'not_needed',
  `invitationDeliveryError` text,
  `confirmedAt` timestamp NULL DEFAULT NULL,
  `canceledAt` timestamp NULL DEFAULT NULL,
  `rescheduledAt` timestamp NULL DEFAULT NULL,
  `completedAt` timestamp NULL DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `appointments_calendly_invitee_unique` (`calendlyInviteeUri`),
  KEY `appointments_connection_start_idx` (`agentConnectionId`,`startAt`),
  KEY `appointments_contact_start_idx` (`contactId`,`startAt`),
  KEY `appointments_host_start_idx` (`hostUserId`,`startAt`),
  CONSTRAINT `appointments_agentConnectionId_agent_connections_id_fk` FOREIGN KEY (`agentConnectionId`) REFERENCES `agent_connections` (`id`) ON DELETE CASCADE,
  CONSTRAINT `appointments_contactId_contacts_id_fk` FOREIGN KEY (`contactId`) REFERENCES `contacts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `appointments_hostUserId_users_id_fk` FOREIGN KEY (`hostUserId`) REFERENCES `users` (`id`),
  CONSTRAINT `appointments_scheduledByUserId_users_id_fk` FOREIGN KEY (`scheduledByUserId`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `appointment_events` (
  `id` int NOT NULL AUTO_INCREMENT,
  `appointmentId` int NOT NULL,
  `actorUserId` int DEFAULT NULL,
  `eventType` enum('scheduled','confirmed','rescheduled','canceled','completed','no_show','imported') NOT NULL,
  `details` json DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `appointment_events_appointment_created_idx` (`appointmentId`,`createdAt`),
  CONSTRAINT `appointment_events_appointmentId_appointments_id_fk` FOREIGN KEY (`appointmentId`) REFERENCES `appointments` (`id`) ON DELETE CASCADE,
  CONSTRAINT `appointment_events_actorUserId_users_id_fk` FOREIGN KEY (`actorUserId`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE `smart_plan_enrollments`
  ADD COLUMN `appointmentId` int DEFAULT NULL AFTER `contactId`,
  ADD KEY `smart_plan_enrollments_appointmentId_appointments_id_fk` (`appointmentId`),
  ADD CONSTRAINT `smart_plan_enrollments_appointmentId_appointments_id_fk` FOREIGN KEY (`appointmentId`) REFERENCES `appointments` (`id`) ON DELETE CASCADE;
ALTER TABLE `smart_plan_enrollments`
  DROP INDEX `smart_plan_enrollments_plan_contact_unique`,
  ADD UNIQUE KEY `smart_plan_enrollments_plan_contact_appointment_unique` (`planId`,`contactId`,`appointmentId`);

ALTER TABLE `smart_plans`
  MODIFY COLUMN `triggerType` enum('lead_source','all_lead_sources','buyer_under_contract','seller_under_contract','new_listing','buyer_closed','seller_closed','appointment_scheduled','appointment_confirmed','appointment_rescheduled','appointment_canceled') NOT NULL DEFAULT 'lead_source';
ALTER TABLE `one_time_sends`
  MODIFY COLUMN `triggerType` enum('lead_source','all_lead_sources','buyer_under_contract','seller_under_contract','new_listing','buyer_closed','seller_closed','appointment_scheduled','appointment_confirmed','appointment_rescheduled','appointment_canceled') NOT NULL;
