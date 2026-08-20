-- Pulse V2 Prompt 1: unified work-item behavior.
-- Todos, issues, and rocks remain rows in pulse_work_items. Supporting tables
-- preserve related milestones, outcomes, comments, mentions, and future notifications.

ALTER TABLE `pulse_work_items`
  ADD COLUMN `completedById` INT NULL AFTER `completedAt`,
  ADD COLUMN `carriedOverCount` INT NOT NULL DEFAULT 0 AFTER `completedById`,
  ADD COLUMN `priority` INT NULL AFTER `carriedOverCount`,
  ADD COLUMN `solvedNote` LONGTEXT NULL AFTER `priority`,
  ADD COLUMN `quarter` VARCHAR(16) NULL AFTER `solvedNote`,
  ADD COLUMN `percentComplete` INT NOT NULL DEFAULT 0 AFTER `quarter`,
  ADD COLUMN `percentSource` ENUM('manual','from_milestones') NOT NULL DEFAULT 'manual' AFTER `percentComplete`,
  ADD CONSTRAINT `pulse_work_items_completed_by_fk` FOREIGN KEY (`completedById`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `pulse_work_items_percent_complete_range` CHECK (`percentComplete` >= 0 AND `percentComplete` <= 100),
  ADD CONSTRAINT `pulse_work_items_status_matches_type` CHECK (
    (`type` = 'todo' AND `status` IN ('open','done','dropped')) OR
    (`type` = 'issue' AND `status` IN ('open','discussing','solved','dropped')) OR
    (`type` = 'rock' AND `status` IN ('on_track','at_risk','off_track','done','dropped'))
  );

CREATE TABLE IF NOT EXISTS `pulse_rock_milestones` (
  `id` VARCHAR(36) NOT NULL,
  `workItemId` VARCHAR(36) NOT NULL,
  `title` VARCHAR(500) NOT NULL,
  `dueDate` DATE NOT NULL,
  `isComplete` BOOLEAN NOT NULL DEFAULT FALSE,
  `completedById` INT NULL,
  `completedAt` TIMESTAMP NULL,
  `sortOrder` INT NOT NULL DEFAULT 0,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deletedAt` TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  KEY `pulse_rock_milestones_item_idx` (`workItemId`,`deletedAt`,`sortOrder`),
  CONSTRAINT `pulse_rock_milestones_item_fk` FOREIGN KEY (`workItemId`) REFERENCES `pulse_work_items`(`id`) ON DELETE CASCADE,
  CONSTRAINT `pulse_rock_milestones_completed_by_fk` FOREIGN KEY (`completedById`) REFERENCES `users`(`id`) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS `pulse_issue_resulting_todos` (
  `id` VARCHAR(36) NOT NULL,
  `issueWorkItemId` VARCHAR(36) NOT NULL,
  `todoWorkItemId` VARCHAR(36) NOT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `pulse_issue_resulting_todos_unique` (`issueWorkItemId`,`todoWorkItemId`),
  KEY `pulse_issue_resulting_todos_issue_idx` (`issueWorkItemId`),
  CONSTRAINT `pulse_issue_resulting_todos_issue_fk` FOREIGN KEY (`issueWorkItemId`) REFERENCES `pulse_work_items`(`id`) ON DELETE CASCADE,
  CONSTRAINT `pulse_issue_resulting_todos_todo_fk` FOREIGN KEY (`todoWorkItemId`) REFERENCES `pulse_work_items`(`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `pulse_work_item_comments` (
  `id` VARCHAR(36) NOT NULL,
  `workItemId` VARCHAR(36) NOT NULL,
  `authorId` INT NOT NULL,
  `body` LONGTEXT NOT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deletedAt` TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  KEY `pulse_work_item_comments_item_idx` (`workItemId`,`deletedAt`,`createdAt`),
  CONSTRAINT `pulse_work_item_comments_item_fk` FOREIGN KEY (`workItemId`) REFERENCES `pulse_work_items`(`id`) ON DELETE CASCADE,
  CONSTRAINT `pulse_work_item_comments_author_fk` FOREIGN KEY (`authorId`) REFERENCES `users`(`id`)
);

CREATE TABLE IF NOT EXISTS `pulse_work_item_comment_mentions` (
  `id` VARCHAR(36) NOT NULL,
  `commentId` VARCHAR(36) NOT NULL,
  `mentionedPersonId` INT NOT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `pulse_comment_mention_unique` (`commentId`,`mentionedPersonId`),
  KEY `pulse_comment_mention_person_idx` (`mentionedPersonId`,`createdAt`),
  CONSTRAINT `pulse_comment_mention_comment_fk` FOREIGN KEY (`commentId`) REFERENCES `pulse_work_item_comments`(`id`) ON DELETE CASCADE,
  CONSTRAINT `pulse_comment_mention_person_fk` FOREIGN KEY (`mentionedPersonId`) REFERENCES `users`(`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `pulse_work_item_notifications` (
  `id` VARCHAR(36) NOT NULL,
  `recipientId` INT NOT NULL,
  `workItemId` VARCHAR(36) NOT NULL,
  `commentId` VARCHAR(36) NULL,
  `notificationType` ENUM('mention','rock_done','quarter_rollover') NOT NULL,
  `actionedAt` TIMESTAMP NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `deletedAt` TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  KEY `pulse_notification_recipient_action_idx` (`recipientId`,`actionedAt`,`createdAt`),
  KEY `pulse_notification_item_idx` (`workItemId`,`notificationType`),
  CONSTRAINT `pulse_notification_recipient_fk` FOREIGN KEY (`recipientId`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  CONSTRAINT `pulse_notification_item_fk` FOREIGN KEY (`workItemId`) REFERENCES `pulse_work_items`(`id`) ON DELETE CASCADE,
  CONSTRAINT `pulse_notification_comment_fk` FOREIGN KEY (`commentId`) REFERENCES `pulse_work_item_comments`(`id`) ON DELETE CASCADE
);
