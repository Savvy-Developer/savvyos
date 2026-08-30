CREATE TABLE IF NOT EXISTS `marketing_text_inbox_threads` (
  `id` int AUTO_INCREMENT NOT NULL,
  `contactId` int NOT NULL,
  `archivedAt` timestamp NULL,
  `archivedById` int NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `marketing_text_inbox_threads_id` PRIMARY KEY(`id`),
  CONSTRAINT `marketing_text_inbox_threads_contact_unq` UNIQUE(`contactId`),
  CONSTRAINT `marketing_text_inbox_threads_contact_fk` FOREIGN KEY (`contactId`) REFERENCES `contacts`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT `marketing_text_inbox_threads_archived_by_fk` FOREIGN KEY (`archivedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION
);
CREATE INDEX `marketing_text_inbox_threads_archived_idx`
  ON `marketing_text_inbox_threads` (`archivedAt`);
