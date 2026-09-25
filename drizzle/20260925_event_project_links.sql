-- Optional one-to-one Event ↔ Project association. The RESTRICT constraints
-- intentionally prevent deleting either domain record through the relationship.
CREATE TABLE `event_project_links` (
  `id` int NOT NULL AUTO_INCREMENT,
  `eventId` int NOT NULL,
  `projectId` int NOT NULL,
  `createdById` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `event_project_links_event_unique` (`eventId`),
  UNIQUE KEY `event_project_links_project_unique` (`projectId`),
  CONSTRAINT `event_project_links_eventId_event_portfolio_id_fk`
    FOREIGN KEY (`eventId`) REFERENCES `event_portfolio` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `event_project_links_projectId_pm_projects_id_fk`
    FOREIGN KEY (`projectId`) REFERENCES `pm_projects` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `event_project_links_createdById_users_id_fk`
    FOREIGN KEY (`createdById`) REFERENCES `users` (`id`) ON DELETE RESTRICT
);
