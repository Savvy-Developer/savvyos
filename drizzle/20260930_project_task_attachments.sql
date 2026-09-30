-- Project To-Do rich details remain in pm_tasks.notes. This table tracks
-- Project-only document metadata; file bytes remain in the existing S3 bucket.
CREATE TABLE `pm_task_attachments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `projectId` int NOT NULL,
  `taskId` int NULL,
  `fileName` varchar(500) NOT NULL,
  `fileKey` varchar(1024) NOT NULL,
  `mimeType` varchar(128) NULL,
  `fileSize` bigint NULL,
  `uploadedById` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `deletedAt` timestamp NULL,
  PRIMARY KEY (`id`),
  KEY `pm_task_attachments_task_idx` (`taskId`, `deletedAt`),
  KEY `pm_task_attachments_project_stage_idx` (`projectId`, `taskId`, `deletedAt`),
  KEY `pm_task_attachments_uploader_idx` (`uploadedById`, `createdAt`),
  CONSTRAINT `pm_task_attachments_project_fk` FOREIGN KEY (`projectId`) REFERENCES `pm_projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `pm_task_attachments_task_fk` FOREIGN KEY (`taskId`) REFERENCES `pm_tasks` (`id`) ON DELETE CASCADE,
  CONSTRAINT `pm_task_attachments_uploader_fk` FOREIGN KEY (`uploadedById`) REFERENCES `users` (`id`)
) ENGINE=InnoDB;
