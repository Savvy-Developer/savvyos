-- SavvyOS Webinar feature: durable webinar, marketing-template, attendee, and Zoom event storage.
-- This migration is intentionally additive and does not alter existing application tables.

CREATE TABLE IF NOT EXISTS `webinar_marketing_templates` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `description` text NULL,
  `isActive` boolean NOT NULL DEFAULT true,
  `createdById` int NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `webinar_marketing_templates_created_by_fk` FOREIGN KEY (`createdById`) REFERENCES `users` (`id`) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS `webinar_marketing_template_tasks` (
  `id` int NOT NULL AUTO_INCREMENT,
  `templateId` int NOT NULL,
  `title` varchar(512) NOT NULL,
  `description` text NULL,
  `assignedToId` int NULL,
  `dueDaysOffset` int NOT NULL DEFAULT 0,
  `priority` enum('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
  `taskType` enum('follow_up','outreach','document','call','email','meeting','review','payout','other') NOT NULL DEFAULT 'other',
  `sortOrder` int NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `webinar_marketing_template_tasks_template_idx` (`templateId`,`sortOrder`),
  CONSTRAINT `webinar_marketing_template_tasks_template_fk` FOREIGN KEY (`templateId`) REFERENCES `webinar_marketing_templates` (`id`) ON DELETE CASCADE,
  CONSTRAINT `webinar_marketing_template_tasks_assignee_fk` FOREIGN KEY (`assignedToId`) REFERENCES `users` (`id`) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS `webinars` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(255) NOT NULL,
  `description` text NULL,
  `startTime` timestamp NOT NULL,
  `durationMinutes` int NOT NULL DEFAULT 60,
  `timezone` varchar(64) NOT NULL DEFAULT 'America/New_York',
  `status` enum('scheduled','live','ended','cancelled') NOT NULL DEFAULT 'scheduled',
  `registrationEnabled` boolean NOT NULL DEFAULT true,
  `registrationApproval` enum('automatically','manually','no_registration') NOT NULL DEFAULT 'automatically',
  `marketingTemplateId` int NULL,
  `hostUserId` int NULL,
  `createdById` int NULL,
  `zoomWebinarId` varchar(64) NULL,
  `zoomWebinarUuid` varchar(255) NULL,
  `zoomJoinUrl` text NULL,
  `zoomRegistrationUrl` text NULL,
  `zoomStartUrl` text NULL,
  `zoomCreatedAt` timestamp NULL,
  `lastZoomSyncAt` timestamp NULL,
  `lastZoomSyncError` text NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `webinars_zoom_webinar_id_unique` (`zoomWebinarId`),
  KEY `webinars_upcoming_idx` (`status`,`startTime`),
  KEY `webinars_template_idx` (`marketingTemplateId`),
  CONSTRAINT `webinars_marketing_template_fk` FOREIGN KEY (`marketingTemplateId`) REFERENCES `webinar_marketing_templates` (`id`) ON DELETE SET NULL,
  CONSTRAINT `webinars_host_user_fk` FOREIGN KEY (`hostUserId`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `webinars_created_by_fk` FOREIGN KEY (`createdById`) REFERENCES `users` (`id`) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS `webinar_task_links` (
  `id` int NOT NULL AUTO_INCREMENT,
  `webinarId` int NOT NULL,
  `taskId` int NOT NULL,
  `templateTaskId` int NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `webinar_task_links_task_id_unique` (`taskId`),
  KEY `webinar_task_links_webinar_idx` (`webinarId`),
  CONSTRAINT `webinar_task_links_webinar_fk` FOREIGN KEY (`webinarId`) REFERENCES `webinars` (`id`) ON DELETE CASCADE,
  CONSTRAINT `webinar_task_links_task_fk` FOREIGN KEY (`taskId`) REFERENCES `tasks` (`id`) ON DELETE CASCADE,
  CONSTRAINT `webinar_task_links_template_task_fk` FOREIGN KEY (`templateTaskId`) REFERENCES `webinar_marketing_template_tasks` (`id`) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS `webinar_attendees` (
  `id` int NOT NULL AUTO_INCREMENT,
  `webinarId` int NOT NULL,
  `zoomRegistrantId` varchar(128) NULL,
  `zoomParticipantId` varchar(128) NULL,
  `email` varchar(320) NULL,
  `firstName` varchar(255) NULL,
  `lastName` varchar(255) NULL,
  `status` enum('registered','approved','cancelled','denied','attended','no_show') NOT NULL DEFAULT 'registered',
  `registeredAt` timestamp NULL,
  `joinedAt` timestamp NULL,
  `leftAt` timestamp NULL,
  `attendanceMinutes` int NULL,
  `providerData` json NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `webinar_attendees_registrant_unique` (`webinarId`,`zoomRegistrantId`),
  KEY `webinar_attendees_webinar_status_idx` (`webinarId`,`status`),
  KEY `webinar_attendees_webinar_email_idx` (`webinarId`,`email`),
  CONSTRAINT `webinar_attendees_webinar_fk` FOREIGN KEY (`webinarId`) REFERENCES `webinars` (`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `zoom_webhook_events` (
  `id` int NOT NULL AUTO_INCREMENT,
  `eventKey` varchar(128) NOT NULL,
  `webinarId` int NULL,
  `eventType` varchar(128) NOT NULL,
  `eventTimestamp` timestamp NULL,
  `payload` json NOT NULL,
  `receivedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `zoom_webhook_events_event_key_unique` (`eventKey`),
  KEY `zoom_webhook_events_webinar_idx` (`webinarId`,`receivedAt`),
  CONSTRAINT `zoom_webhook_events_webinar_fk` FOREIGN KEY (`webinarId`) REFERENCES `webinars` (`id`) ON DELETE SET NULL
);
