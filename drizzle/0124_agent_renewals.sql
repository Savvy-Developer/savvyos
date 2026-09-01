CREATE TABLE `agent_renewals` (
  `id` int AUTO_INCREMENT NOT NULL,
  `agentId` int NOT NULL,
  `renewalDate` date NOT NULL,
  `status` enum('scheduled','completed') NOT NULL DEFAULT 'scheduled',
  `meetingDate` date,
  `completedAt` timestamp,
  `completedById` int,
  `attendees` text,
  `discussionSummary` text,
  `productionReview` text,
  `goalsAndCommitments` text,
  `followUpItems` text,
  `splitNotes` text,
  `agreementUrl` text,
  `agreementKey` varchar(500),
  `agreementName` varchar(255),
  `agreementMimeType` varchar(255),
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `agent_renewals_id` PRIMARY KEY(`id`),
  CONSTRAINT `agent_renewals_agentId_users_id_fk` FOREIGN KEY (`agentId`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  CONSTRAINT `agent_renewals_completedById_users_id_fk` FOREIGN KEY (`completedById`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  KEY `agent_renewals_agent_status_date_idx` (`agentId`,`status`,`renewalDate`),
  KEY `agent_renewals_status_completed_idx` (`status`,`completedAt`)
);

ALTER TABLE `admin_permissions` ADD COLUMN `canViewAgentRenewals` boolean NOT NULL DEFAULT true;
