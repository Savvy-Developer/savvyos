-- Coach feedback: identity-separated invitations and anonymous aggregate responses.
-- This migration is intentionally forward-only and does not alter historic coaching sessions.

ALTER TABLE `admin_permissions`
  ADD COLUMN `canViewCoachFeedback` boolean NOT NULL DEFAULT false;

CREATE TABLE `coaching_feedback_invitations` (
  `id` int AUTO_INCREMENT NOT NULL,
  `sessionId` int NOT NULL,
  `agentId` int NOT NULL,
  `coachId` int NOT NULL,
  `recipientEmail` varchar(320) NOT NULL,
  `tokenHash` varchar(128) NOT NULL,
  `expiresAt` timestamp NOT NULL,
  `sentAt` timestamp NULL,
  `submittedAt` timestamp NULL,
  `isTest` boolean NOT NULL DEFAULT false,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `coaching_feedback_invitations_id` PRIMARY KEY(`id`),
  CONSTRAINT `coaching_feedback_invitations_sessionId_unique` UNIQUE(`sessionId`),
  CONSTRAINT `coaching_feedback_invitations_tokenHash_unique` UNIQUE(`tokenHash`),
  CONSTRAINT `coaching_feedback_invitations_sessionId_coaching_sessions_id_fk` FOREIGN KEY (`sessionId`) REFERENCES `coaching_sessions`(`id`) ON DELETE cascade,
  CONSTRAINT `coaching_feedback_invitations_agentId_users_id_fk` FOREIGN KEY (`agentId`) REFERENCES `users`(`id`) ON DELETE cascade,
  CONSTRAINT `coaching_feedback_invitations_coachId_users_id_fk` FOREIGN KEY (`coachId`) REFERENCES `users`(`id`) ON DELETE cascade
);
CREATE INDEX `coaching_feedback_invitation_due_idx` ON `coaching_feedback_invitations` (`sentAt`,`submittedAt`);

CREATE TABLE `coaching_feedback_responses` (
  `id` int AUTO_INCREMENT NOT NULL,
  `coachId` int NOT NULL,
  `sessionWeekStart` date NOT NULL,
  `overallRating` int NOT NULL,
  `prioritiesRating` int NOT NULL,
  `clarityRating` int NOT NULL,
  `supportRating` int NOT NULL,
  `helpfulComment` text,
  `improvementComment` text,
  `additionalComment` text,
  `isTest` boolean NOT NULL DEFAULT false,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `coaching_feedback_responses_id` PRIMARY KEY(`id`),
  CONSTRAINT `coaching_feedback_responses_coachId_users_id_fk` FOREIGN KEY (`coachId`) REFERENCES `users`(`id`) ON DELETE cascade
);
CREATE INDEX `coaching_feedback_response_coach_week_idx` ON `coaching_feedback_responses` (`coachId`,`sessionWeekStart`);
CREATE INDEX `coaching_feedback_response_test_idx` ON `coaching_feedback_responses` (`isTest`);

CREATE TABLE `coaching_feedback_settings` (
  `id` int AUTO_INCREMENT NOT NULL,
  `automationStartedAt` timestamp NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `coaching_feedback_settings_id` PRIMARY KEY(`id`)
);
