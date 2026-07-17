CREATE TABLE IF NOT EXISTS `pipeline_email_templates` (
  `id` int AUTO_INCREMENT NOT NULL,
  `name` varchar(255) NOT NULL,
  `subject` varchar(512) NOT NULL,
  `bodyHtml` text NOT NULL,
  `createdById` int NOT NULL,
  `isPersonal` boolean NOT NULL DEFAULT true,
  `visibleToAdmins` boolean NOT NULL DEFAULT false,
  `visibleToAgents` boolean NOT NULL DEFAULT false,
  `visibleToIsas` boolean NOT NULL DEFAULT false,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `pipeline_email_templates_id` PRIMARY KEY (`id`),
  CONSTRAINT `pipeline_email_templates_createdById_users_id_fk`
    FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE INDEX `pipeline_email_templates_createdBy_idx`
  ON `pipeline_email_templates` (`createdById`);
CREATE INDEX `pipeline_email_templates_visibility_idx`
  ON `pipeline_email_templates` (`isPersonal`, `visibleToAdmins`, `visibleToAgents`, `visibleToIsas`);

CREATE TABLE IF NOT EXISTS `pipeline_email_daily_usage` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `usageDate` date NOT NULL,
  `reservedCount` int NOT NULL DEFAULT 0,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `pipeline_email_daily_usage_id` PRIMARY KEY (`id`),
  CONSTRAINT `pipeline_email_daily_usage_userId_users_id_fk`
    FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT `pipeline_email_daily_usage_user_date_uq` UNIQUE (`userId`, `usageDate`)
);

CREATE TABLE IF NOT EXISTS `pipeline_email_deliveries` (
  `id` int AUTO_INCREMENT NOT NULL,
  `batchId` varchar(64) NOT NULL,
  `senderUserId` int NOT NULL,
  `agentConnectionId` int NOT NULL,
  `contactId` int NOT NULL,
  `recipientEmail` varchar(320) NOT NULL,
  `subject` varchar(512) NOT NULL,
  `status` enum('reserved','accepted','failed') NOT NULL DEFAULT 'reserved',
  `resendEmailId` varchar(255),
  `errorMessage` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `pipeline_email_deliveries_id` PRIMARY KEY (`id`),
  CONSTRAINT `pipeline_email_deliveries_senderUserId_users_id_fk`
    FOREIGN KEY (`senderUserId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT `pipeline_email_deliveries_connectionId_agent_connections_id_fk`
    FOREIGN KEY (`agentConnectionId`) REFERENCES `agent_connections`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT `pipeline_email_deliveries_contactId_contacts_id_fk`
    FOREIGN KEY (`contactId`) REFERENCES `contacts`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE INDEX `pipeline_email_deliveries_batch_idx`
  ON `pipeline_email_deliveries` (`batchId`);
CREATE INDEX `pipeline_email_deliveries_sender_created_idx`
  ON `pipeline_email_deliveries` (`senderUserId`, `createdAt`);
CREATE INDEX `pipeline_email_deliveries_connection_idx`
  ON `pipeline_email_deliveries` (`agentConnectionId`);
