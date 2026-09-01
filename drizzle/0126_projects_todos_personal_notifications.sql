ALTER TABLE `pm_tasks`
  ADD COLUMN `parentTaskId` int NULL AFTER `projectId`,
  ADD CONSTRAINT `pm_tasks_parentTaskId_pm_tasks_id_fk`
    FOREIGN KEY (`parentTaskId`) REFERENCES `pm_tasks`(`id`) ON DELETE SET NULL,
  ADD KEY `pm_tasks_parent_idx` (`parentTaskId`);

CREATE TABLE IF NOT EXISTS `pm_personal_todos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `title` text NOT NULL,
  `notes` text,
  `dueDate` timestamp NULL DEFAULT NULL,
  `recurrence` varchar(16) NOT NULL DEFAULT 'none',
  `completed` tinyint(1) NOT NULL DEFAULT '0',
  `completedAt` timestamp NULL DEFAULT NULL,
  `sortOrder` int NOT NULL DEFAULT '0',
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `pm_personal_todos_user_status_idx` (`userId`, `completed`, `dueDate`),
  CONSTRAINT `pm_personal_todos_userId_users_id_fk`
    FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE `pm_note_mentions`
  ADD COLUMN `shouldNotify` tinyint(1) NOT NULL DEFAULT '1' AFTER `mentionedUserId`;

ALTER TABLE `pm_note_reads`
  ADD COLUMN `dismissedAt` timestamp NULL DEFAULT NULL AFTER `markedUnread`;

ALTER TABLE `pm_task_comment_reads`
  ADD COLUMN `dismissedAt` timestamp NULL DEFAULT NULL AFTER `markedUnread`;
