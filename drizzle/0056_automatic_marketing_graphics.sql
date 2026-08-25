CREATE TABLE IF NOT EXISTS `automatic_marketing_graphics` (
  `id` int AUTO_INCREMENT NOT NULL,
  `agentId` int NOT NULL,
  `graphicType` enum('under_contract','just_closed','just_listed') NOT NULL,
  `propertyAddress` varchar(160) NOT NULL,
  `price` varchar(64),
  `imageUrl` text NOT NULL,
  `imageKey` varchar(512) NOT NULL,
  `fileName` varchar(255) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `automatic_marketing_graphics_id_pk` PRIMARY KEY(`id`),
  CONSTRAINT `automatic_marketing_graphics_agent_fk` FOREIGN KEY (`agentId`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  INDEX `automatic_marketing_graphics_agent_created_idx` (`agentId`, `createdAt`)
);
