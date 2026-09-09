CREATE TABLE IF NOT EXISTS `pm_todo_sections` (
  `id` int NOT NULL AUTO_INCREMENT,
  `projectId` int NOT NULL,
  `title` varchar(128) NOT NULL,
  `sortOrder` int NOT NULL DEFAULT '0',
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `pm_todo_sections_project_order_idx` (`projectId`, `sortOrder`),
  CONSTRAINT `pm_todo_sections_projectId_pm_projects_id_fk`
    FOREIGN KEY (`projectId`) REFERENCES `pm_projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE `pm_tasks`
  ADD COLUMN `sectionId` int NULL AFTER `parentTaskId`,
  ADD CONSTRAINT `pm_tasks_sectionId_pm_todo_sections_id_fk`
    FOREIGN KEY (`sectionId`) REFERENCES `pm_todo_sections` (`id`) ON DELETE SET NULL,
  ADD KEY `pm_tasks_section_order_idx` (`sectionId`, `sortOrder`, `createdAt`);
