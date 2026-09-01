-- Marketing Text Inbox agent introductions, durable SMS follow-ups, and reconciled admin navigation permissions.
ALTER TABLE `admin_permissions`
  ADD COLUMN `canViewMarketingTextInbox` boolean NOT NULL DEFAULT true,
  ADD COLUMN `canViewAgentDirectory` boolean NOT NULL DEFAULT true,
  ADD COLUMN `canViewVendorLists` boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS `agent_introduction_follow_ups` (
  `id` int AUTO_INCREMENT NOT NULL,
  `contactId` int NOT NULL,
  `agentId` int NOT NULL,
  `connectionId` int NOT NULL,
  `createdById` int NULL,
  `body` text NOT NULL,
  `dueAt` timestamp NOT NULL,
  `status` enum('queued','processing','sent','skipped','failed') NOT NULL DEFAULT 'queued',
  `sentAt` timestamp NULL,
  `aircallMessageId` varchar(128) NULL,
  `errorMessage` text NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `agent_intro_follow_ups_id` PRIMARY KEY(`id`),
  CONSTRAINT `agent_intro_follow_ups_contact_fk` FOREIGN KEY (`contactId`) REFERENCES `contacts`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT `agent_intro_follow_ups_agent_fk` FOREIGN KEY (`agentId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT `agent_intro_follow_ups_connection_fk` FOREIGN KEY (`connectionId`) REFERENCES `agent_connections`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT `agent_intro_follow_ups_created_by_fk` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION
);
CREATE INDEX `agent_intro_follow_ups_status_due_idx` ON `agent_introduction_follow_ups` (`status`,`dueAt`);
CREATE INDEX `agent_intro_follow_ups_contact_idx` ON `agent_introduction_follow_ups` (`contactId`,`createdAt`);
CREATE INDEX `agent_intro_follow_ups_connection_idx` ON `agent_introduction_follow_ups` (`connectionId`,`createdAt`);
