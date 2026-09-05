CREATE TABLE IF NOT EXISTS `agent_profile_reminder_campaigns` (
  `id` int AUTO_INCREMENT NOT NULL,
  `kind` enum('initial_active_agents','quarterly_incomplete') NOT NULL,
  `audience` enum('active_snapshot','incomplete_at_send') NOT NULL,
  `scheduledFor` timestamp NOT NULL,
  `status` enum('scheduled','processing','completed') NOT NULL DEFAULT 'scheduled',
  `startedAt` timestamp NULL,
  `completedAt` timestamp NULL,
  `sentCount` int NOT NULL DEFAULT 0,
  `skippedCount` int NOT NULL DEFAULT 0,
  `failedCount` int NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `agent_profile_reminder_campaigns_id` PRIMARY KEY (`id`),
  CONSTRAINT `agent_profile_reminder_campaign_kind_scheduled_uidx` UNIQUE(`kind`,`scheduledFor`),
  KEY `agent_profile_reminder_campaign_due_idx` (`status`,`scheduledFor`)
);

CREATE TABLE IF NOT EXISTS `agent_profile_reminder_campaign_recipients` (
  `id` int AUTO_INCREMENT NOT NULL,
  `campaignId` int NOT NULL,
  `agentUserId` int NOT NULL,
  `agentName` varchar(255),
  `agentEmail` varchar(320),
  `status` enum('queued','sent','skipped','failed') NOT NULL DEFAULT 'queued',
  `attemptedAt` timestamp NULL,
  `sentAt` timestamp NULL,
  `failureReason` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `agent_profile_reminder_campaign_recipients_id` PRIMARY KEY (`id`),
  CONSTRAINT `agent_profile_reminder_campaign_agent_uidx` UNIQUE(`campaignId`,`agentUserId`),
  KEY `agent_profile_reminder_recipient_campaign_status_idx` (`campaignId`,`status`),
  CONSTRAINT `agent_profile_reminder_campaign_recipients_campaign_fk` FOREIGN KEY (`campaignId`) REFERENCES `agent_profile_reminder_campaigns`(`id`) ON DELETE CASCADE,
  CONSTRAINT `agent_profile_reminder_campaign_recipients_agent_fk` FOREIGN KEY (`agentUserId`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
