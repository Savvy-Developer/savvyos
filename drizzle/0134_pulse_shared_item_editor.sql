ALTER TABLE `pulse_work_items`
  ADD COLUMN `priorityLevel` ENUM('low', 'medium', 'high', 'urgent') NOT NULL DEFAULT 'medium' AFTER `priority`,
  ADD COLUMN `issueTimeframe` ENUM('short_term', 'long_term') NULL AFTER `priorityLevel`;

CREATE TABLE `pulse_work_item_attachments` (
  `id` varchar(36) NOT NULL,
  `workItemId` varchar(36) NOT NULL,
  `fileName` varchar(500) NOT NULL,
  `fileKey` varchar(1024) NOT NULL,
  `url` varchar(2048) NOT NULL,
  `mimeType` varchar(128) NULL,
  `fileSize` bigint NULL,
  `uploadedById` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `deletedAt` timestamp NULL,
  PRIMARY KEY (`id`),
  KEY `pulse_work_item_attachments_item_idx` (`workItemId`, `deletedAt`),
  KEY `pulse_work_item_attachments_uploader_idx` (`uploadedById`, `createdAt`),
  CONSTRAINT `pulse_work_item_attachments_work_item_fk` FOREIGN KEY (`workItemId`) REFERENCES `pulse_work_items` (`id`) ON DELETE CASCADE,
  CONSTRAINT `pulse_work_item_attachments_uploader_fk` FOREIGN KEY (`uploadedById`) REFERENCES `users` (`id`)
) ENGINE=InnoDB;
