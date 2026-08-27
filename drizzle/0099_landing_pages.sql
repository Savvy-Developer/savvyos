-- SavvyOS Landing Pages: module documents, public sessions/conversions, consent audit trail,
-- and granular Super Permissions. Applied to production with the companion guarded script.

ALTER TABLE `admin_permissions`
  ADD COLUMN `canViewLandingPages` boolean NOT NULL DEFAULT false,
  ADD COLUMN `canCreateLandingPages` boolean NOT NULL DEFAULT false,
  ADD COLUMN `canEditLandingPages` boolean NOT NULL DEFAULT false,
  ADD COLUMN `canPublishLandingPages` boolean NOT NULL DEFAULT false,
  ADD COLUMN `canArchiveLandingPages` boolean NOT NULL DEFAULT false;

CREATE TABLE `landing_pages` (
  `id` int AUTO_INCREMENT NOT NULL,
  `internalName` varchar(255) NOT NULL,
  `slug` varchar(120) NOT NULL,
  `status` enum('draft','published','unpublished','archived') NOT NULL DEFAULT 'draft',
  `primaryConversionType` enum('form','calendly') NOT NULL DEFAULT 'form',
  `leadSourceId` int NOT NULL,
  `smartPlanId` int,
  `pageTitle` varchar(255) NOT NULL,
  `metaDescription` varchar(500),
  `socialImageUrl` text,
  `noindex` boolean NOT NULL DEFAULT false,
  `postSubmitType` enum('inline','landing_page','external') NOT NULL DEFAULT 'inline',
  `postSubmitMessage` text,
  `postSubmitUrl` text,
  `pageSettings` json,
  `blocks` json NOT NULL,
  `createdById` int,
  `lastEditedById` int,
  `publishedAt` timestamp NULL,
  `archivedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `landing_pages_id_pk` PRIMARY KEY (`id`),
  CONSTRAINT `landing_pages_slug_unique` UNIQUE (`slug`),
  CONSTRAINT `landing_pages_lead_source_fk` FOREIGN KEY (`leadSourceId`) REFERENCES `lead_sources`(`id`),
  CONSTRAINT `landing_pages_smart_plan_fk` FOREIGN KEY (`smartPlanId`) REFERENCES `smart_plans`(`id`),
  CONSTRAINT `landing_pages_created_by_fk` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`),
  CONSTRAINT `landing_pages_last_edited_by_fk` FOREIGN KEY (`lastEditedById`) REFERENCES `users`(`id`),
  INDEX `landing_pages_status_updated_idx` (`status`,`updatedAt`),
  INDEX `landing_pages_lead_source_idx` (`leadSourceId`)
);

CREATE TABLE `landing_page_sessions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `landingPageId` int NOT NULL,
  `sessionId` varchar(96) NOT NULL,
  `landingUrl` text NOT NULL,
  `referrerUrl` text,
  `firstTouch` json,
  `lastTouch` json,
  `deviceCategory` varchar(24),
  `firstViewedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `lastSeenAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `landing_page_sessions_id_pk` PRIMARY KEY (`id`),
  CONSTRAINT `landing_page_session_unique` UNIQUE (`landingPageId`,`sessionId`),
  CONSTRAINT `landing_page_sessions_page_fk` FOREIGN KEY (`landingPageId`) REFERENCES `landing_pages`(`id`) ON DELETE CASCADE,
  INDEX `landing_page_sessions_page_first_viewed_idx` (`landingPageId`,`firstViewedAt`)
);

CREATE TABLE `landing_page_submissions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `landingPageId` int NOT NULL,
  `sessionId` varchar(96) NOT NULL,
  `contactId` int,
  `conversionType` enum('form','calendly') NOT NULL,
  `appliedLeadSourceId` int,
  `formAnswers` json,
  `rawPayload` json,
  `attribution` json,
  `calendlyEventUri` text,
  `calendlyInviteeUri` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `landing_page_submissions_id_pk` PRIMARY KEY (`id`),
  CONSTRAINT `landing_page_submissions_page_fk` FOREIGN KEY (`landingPageId`) REFERENCES `landing_pages`(`id`) ON DELETE CASCADE,
  CONSTRAINT `landing_page_submissions_contact_fk` FOREIGN KEY (`contactId`) REFERENCES `contacts`(`id`),
  CONSTRAINT `landing_page_submissions_source_fk` FOREIGN KEY (`appliedLeadSourceId`) REFERENCES `lead_sources`(`id`),
  INDEX `landing_page_submissions_page_created_idx` (`landingPageId`,`createdAt`),
  INDEX `landing_page_submissions_contact_idx` (`contactId`,`createdAt`),
  INDEX `landing_page_submissions_session_idx` (`sessionId`,`createdAt`)
);

CREATE TABLE `landing_page_events` (
  `id` int AUTO_INCREMENT NOT NULL,
  `landingPageId` int NOT NULL,
  `sessionId` varchar(96),
  `submissionId` int,
  `contactId` int,
  `eventType` enum('page_viewed','form_submitted','calendly_booking_created') NOT NULL,
  `metadata` json,
  `occurredAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `landing_page_events_id_pk` PRIMARY KEY (`id`),
  CONSTRAINT `landing_page_events_page_fk` FOREIGN KEY (`landingPageId`) REFERENCES `landing_pages`(`id`) ON DELETE CASCADE,
  CONSTRAINT `landing_page_events_submission_fk` FOREIGN KEY (`submissionId`) REFERENCES `landing_page_submissions`(`id`) ON DELETE SET NULL,
  CONSTRAINT `landing_page_events_contact_fk` FOREIGN KEY (`contactId`) REFERENCES `contacts`(`id`) ON DELETE SET NULL,
  INDEX `landing_page_events_page_type_occurred_idx` (`landingPageId`,`eventType`,`occurredAt`)
);

CREATE TABLE `landing_page_sms_consents` (
  `id` int AUTO_INCREMENT NOT NULL,
  `landingPageId` int NOT NULL,
  `submissionId` int NOT NULL,
  `contactId` int NOT NULL,
  `consented` boolean NOT NULL,
  `consentLanguage` text NOT NULL,
  `landingUrl` text NOT NULL,
  `consentedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `landing_page_sms_consents_id_pk` PRIMARY KEY (`id`),
  CONSTRAINT `landing_page_sms_consents_page_fk` FOREIGN KEY (`landingPageId`) REFERENCES `landing_pages`(`id`) ON DELETE CASCADE,
  CONSTRAINT `landing_page_sms_consents_submission_fk` FOREIGN KEY (`submissionId`) REFERENCES `landing_page_submissions`(`id`) ON DELETE CASCADE,
  CONSTRAINT `landing_page_sms_consents_contact_fk` FOREIGN KEY (`contactId`) REFERENCES `contacts`(`id`),
  INDEX `landing_page_sms_consents_contact_idx` (`contactId`,`consentedAt`)
);
