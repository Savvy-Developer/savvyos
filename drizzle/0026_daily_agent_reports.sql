CREATE TABLE IF NOT EXISTS `daily_agent_reports` (
  `id` int AUTO_INCREMENT NOT NULL,
  `agentId` int NOT NULL,
  `reportDate` varchar(10) NOT NULL,
  `snapshot` json NOT NULL,
  `aiSuggestions` json NOT NULL,
  `aiModel` varchar(128),
  `generatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `daily_agent_reports_id_pk` PRIMARY KEY(`id`),
  CONSTRAINT `daily_agent_reports_agent_fk` FOREIGN KEY (`agentId`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  CONSTRAINT `daily_agent_reports_agent_date_unique` UNIQUE(`agentId`, `reportDate`)
);
-- statement-breakpoint
CREATE INDEX `daily_agent_reports_date_idx` ON `daily_agent_reports` (`reportDate`);
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS `savvyos_feature_updates` (
  `id` int AUTO_INCREMENT NOT NULL,
  `title` varchar(255) NOT NULL,
  `summary` text NOT NULL,
  `details` text,
  `actionUrl` varchar(512),
  `isAgentFacing` boolean NOT NULL DEFAULT true,
  `isPublished` boolean NOT NULL DEFAULT false,
  `publishedAt` timestamp,
  `createdById` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `savvyos_feature_updates_id_pk` PRIMARY KEY(`id`),
  CONSTRAINT `savvyos_feature_updates_created_by_fk` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL
);
-- statement-breakpoint
CREATE INDEX `savvyos_feature_updates_published_idx` ON `savvyos_feature_updates` (`isPublished`, `isAgentFacing`, `publishedAt`);
