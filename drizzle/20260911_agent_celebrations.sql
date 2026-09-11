ALTER TABLE `admin_permissions`
  ADD COLUMN `canViewAgentCelebrations` boolean NOT NULL DEFAULT true AFTER `canViewAgentMarkets`,
  ADD COLUMN `canViewMarketMatchQuiz` boolean NOT NULL DEFAULT true AFTER `canViewVendorLists`;

CREATE TABLE `agent_celebration_events` (
  `id` int AUTO_INCREMENT NOT NULL,
  `eventKey` varchar(255) NOT NULL,
  `agentId` int NOT NULL,
  `celebrationType` varchar(64) NOT NULL,
  `eventOccurredAt` timestamp NOT NULL,
  `celebratedById` int NOT NULL,
  `celebratedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `eventSnapshot` json NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `agent_celebration_events_id_pk` PRIMARY KEY (`id`),
  CONSTRAINT `agent_celebration_events_event_key_unique` UNIQUE (`eventKey`),
  CONSTRAINT `agent_celebration_events_agent_fk` FOREIGN KEY (`agentId`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `agent_celebration_events_celebrated_by_fk` FOREIGN KEY (`celebratedById`) REFERENCES `users` (`id`)
);

CREATE INDEX `agent_celebration_events_agent_date_idx`
  ON `agent_celebration_events` (`agentId`, `eventOccurredAt`);

CREATE INDEX `agent_celebration_events_celebrated_at_idx`
  ON `agent_celebration_events` (`celebratedAt`);
