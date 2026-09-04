CREATE TABLE IF NOT EXISTS `pm_task_comment_mentions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `commentId` int NOT NULL,
  `mentionedUserId` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  UNIQUE KEY `pm_task_comment_mentions_comment_user_unique` (`commentId`, `mentionedUserId`),
  KEY `pm_task_comment_mentions_user_idx` (`mentionedUserId`),
  CONSTRAINT `pm_task_comment_mentions_commentId_pm_task_comments_id_fk`
    FOREIGN KEY (`commentId`) REFERENCES `pm_task_comments` (`id`) ON DELETE CASCADE,
  CONSTRAINT `pm_task_comment_mentions_mentionedUserId_users_id_fk`
    FOREIGN KEY (`mentionedUserId`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
