-- Project To-Do dependencies model a simple finish-to-start relationship:
-- taskId is blocked by predecessorTaskId. The router enforces same-project
-- membership and rejects cycles before writing these rows.
CREATE TABLE `pm_task_dependencies` (
  `id` int NOT NULL AUTO_INCREMENT,
  `taskId` int NOT NULL,
  `predecessorTaskId` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `pm_task_dependencies_task_predecessor_unique` (`taskId`, `predecessorTaskId`),
  KEY `pm_task_dependencies_predecessor_idx` (`predecessorTaskId`, `taskId`),
  CONSTRAINT `pm_task_dependencies_task_fk`
    FOREIGN KEY (`taskId`) REFERENCES `pm_tasks` (`id`) ON DELETE CASCADE,
  CONSTRAINT `pm_task_dependencies_predecessor_fk`
    FOREIGN KEY (`predecessorTaskId`) REFERENCES `pm_tasks` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
