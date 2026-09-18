-- Operations Escalations: coaching-session operational blockers with an auditable resolution.
CREATE TABLE `operations_escalations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `sessionId` int NOT NULL,
  `agentId` int NOT NULL,
  `submittedById` int NOT NULL,
  `description` text NOT NULL,
  `status` enum('Open','Resolved') NOT NULL DEFAULT 'Open',
  `resolution` text,
  `resolvedById` int,
  `resolvedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `operations_escalations_session_idx` (`sessionId`, `createdAt`),
  KEY `operations_escalations_agent_idx` (`agentId`, `status`),
  KEY `operations_escalations_status_created_idx` (`status`, `createdAt`),
  CONSTRAINT `operations_escalations_session_fk` FOREIGN KEY (`sessionId`) REFERENCES `coaching_sessions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `operations_escalations_agent_fk` FOREIGN KEY (`agentId`) REFERENCES `users` (`id`),
  CONSTRAINT `operations_escalations_submitter_fk` FOREIGN KEY (`submittedById`) REFERENCES `users` (`id`),
  CONSTRAINT `operations_escalations_resolver_fk` FOREIGN KEY (`resolvedById`) REFERENCES `users` (`id`)
);

ALTER TABLE `admin_permissions`
  ADD COLUMN `canViewOperationsEscalations` boolean NOT NULL DEFAULT false AFTER `canViewCoachingHub`;
