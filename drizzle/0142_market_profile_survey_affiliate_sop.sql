ALTER TABLE `lead_sources`
  ADD COLUMN `sopContent` mediumtext NULL AFTER `partnerCheatSheet`,
  ADD COLUMN `sopVisibleToAgents` boolean NOT NULL DEFAULT false AFTER `sopContent`;

ALTER TABLE `admin_permissions`
  ADD COLUMN `canViewAffiliateLinks` boolean NOT NULL DEFAULT true AFTER `canViewUsers`;

CREATE TABLE `affiliate_links` (
  `id` int AUTO_INCREMENT NOT NULL,
  `companyName` varchar(255) NOT NULL,
  `contactName` varchar(255),
  `contactEmail` varchar(320),
  `contactPhone` varchar(64),
  `websiteUrl` varchar(1024),
  `affiliateUrl` text NOT NULL,
  `commissionTerms` text,
  `estimatedEarnings` varchar(255),
  `notes` text,
  `isActive` boolean NOT NULL DEFAULT true,
  `createdById` int,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `affiliate_links_id` PRIMARY KEY(`id`),
  CONSTRAINT `affiliate_links_createdById_users_id_fk` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION,
  KEY `affiliate_links_active_company_idx` (`isActive`, `companyName`)
);

CREATE TABLE `market_profile_survey_invitations` (
  `id` int AUTO_INCREMENT NOT NULL,
  `agentId` int NOT NULL,
  `marketProfileId` int,
  `surveyTokenHash` varchar(64) NOT NULL,
  `status` enum('pending','in_progress','completed') NOT NULL DEFAULT 'pending',
  `initialSentAt` timestamp,
  `lastSentAt` timestamp,
  `nextReminderAt` timestamp,
  `reminderCount` int NOT NULL DEFAULT 0,
  `currentPage` int NOT NULL DEFAULT 1,
  `completedAt` timestamp,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `market_profile_survey_invitations_id` PRIMARY KEY(`id`),
  CONSTRAINT `market_profile_survey_invitations_agent_unique` UNIQUE(`agentId`),
  CONSTRAINT `market_profile_survey_invitations_token_unique` UNIQUE(`surveyTokenHash`),
  CONSTRAINT `mpsi_agent_fk` FOREIGN KEY (`agentId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT `mpsi_market_fk` FOREIGN KEY (`marketProfileId`) REFERENCES `market_profiles`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION,
  KEY `market_profile_survey_invitation_due_idx` (`status`, `nextReminderAt`),
  KEY `market_profile_survey_invitation_market_idx` (`marketProfileId`, `status`)
);

CREATE TABLE `market_profile_survey_responses` (
  `id` int AUTO_INCREMENT NOT NULL,
  `invitationId` int NOT NULL,
  `marketProfileId` int NOT NULL,
  `agentId` int NOT NULL,
  `answers` json NOT NULL,
  `sourceId` int,
  `submittedAt` timestamp,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `market_profile_survey_responses_id` PRIMARY KEY(`id`),
  CONSTRAINT `market_profile_survey_response_invitation_unique` UNIQUE(`invitationId`),
  CONSTRAINT `mpsr_invitation_fk` FOREIGN KEY (`invitationId`) REFERENCES `market_profile_survey_invitations`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT `mpsr_market_fk` FOREIGN KEY (`marketProfileId`) REFERENCES `market_profiles`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT `mpsr_agent_fk` FOREIGN KEY (`agentId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT `mpsr_source_fk` FOREIGN KEY (`sourceId`) REFERENCES `market_profile_sources`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION,
  KEY `market_profile_survey_response_market_idx` (`marketProfileId`, `updatedAt`),
  KEY `market_profile_survey_response_agent_idx` (`agentId`)
);
