ALTER TABLE `pm_todo_sections`
  ADD COLUMN `description` text NULL AFTER `title`;

CREATE TABLE `pm_milestone_dependencies` (
  `id` int NOT NULL AUTO_INCREMENT,
  `milestoneId` int NOT NULL,
  `predecessorMilestoneId` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `pm_milestone_dependencies_unique` (`milestoneId`,`predecessorMilestoneId`),
  KEY `pm_milestone_dependencies_predecessor_idx` (`predecessorMilestoneId`,`milestoneId`),
  CONSTRAINT `pm_milestone_dependencies_milestone_fk`
    FOREIGN KEY (`milestoneId`) REFERENCES `pm_todo_sections` (`id`) ON DELETE CASCADE,
  CONSTRAINT `pm_milestone_dependencies_predecessor_fk`
    FOREIGN KEY (`predecessorMilestoneId`) REFERENCES `pm_todo_sections` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
