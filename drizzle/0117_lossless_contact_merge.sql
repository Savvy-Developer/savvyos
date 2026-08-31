-- Lossless duplicate-contact merge support. All changes are additive.

ALTER TABLE `contacts`
  ADD COLUMN `thirdEmail` varchar(320) NULL AFTER `secondaryPhone`,
  ADD COLUMN `thirdPhone` varchar(32) NULL AFTER `thirdEmail`;

ALTER TABLE `agent_connections`
  ADD COLUMN `archivedAt` timestamp NULL AFTER `appointmentSetByUserId`,
  ADD COLUMN `mergeArchivedAt` timestamp NULL AFTER `archivedAt`,
  ADD COLUMN `mergeArchivedById` int NULL AFTER `mergeArchivedAt`,
  ADD COLUMN `mergedIntoConnectionId` int NULL AFTER `mergeArchivedById`,
  ADD CONSTRAINT `agent_connections_merge_archived_by_user_fk`
    FOREIGN KEY (`mergeArchivedById`) REFERENCES `users` (`id`) ON DELETE SET NULL;

ALTER TABLE `connection_requests`
  ADD COLUMN `archivedAt` timestamp NULL AFTER `notes`,
  ADD COLUMN `mergedIntoRequestId` int NULL AFTER `archivedAt`;

ALTER TABLE `smart_plan_enrollments`
  ADD COLUMN `archivedAt` timestamp NULL AFTER `completedAt`,
  ADD COLUMN `mergedIntoEnrollmentId` int NULL AFTER `archivedAt`;

ALTER TABLE `marketing_text_inbox_threads`
  ADD COLUMN `mergedIntoThreadId` int NULL AFTER `archivedById`;

ALTER TABLE `contact_relationships`
  ADD COLUMN `archivedAt` timestamp NULL AFTER `createdByUserId`,
  ADD COLUMN `mergedIntoRelationshipId` int NULL AFTER `archivedAt`;

CREATE TABLE `contact_merge_archives` (
  `id` int NOT NULL AUTO_INCREMENT,
  `mergePairId` int NOT NULL,
  `winnerContactId` int NOT NULL,
  `loserContactId` int NOT NULL,
  `kind` varchar(64) NOT NULL,
  `sourceContactId` int NULL,
  `sourceTable` varchar(128) NULL,
  `sourceRecordId` int NULL,
  `fieldName` varchar(128) NULL,
  `archivedValue` json NULL,
  `keptValue` json NULL,
  `mergedIntoId` int NULL,
  `archivedById` int NULL,
  `archivedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `restoredAt` timestamp NULL,
  `restoredById` int NULL,
  PRIMARY KEY (`id`),
  KEY `contact_merge_archives_pair_idx` (`mergePairId`, `archivedAt`),
  KEY `contact_merge_archives_loser_idx` (`loserContactId`, `archivedAt`),
  CONSTRAINT `contact_merge_archives_pair_fk`
    FOREIGN KEY (`mergePairId`) REFERENCES `duplicate_contact_pairs` (`id`) ON DELETE CASCADE,
  CONSTRAINT `contact_merge_archives_winner_fk`
    FOREIGN KEY (`winnerContactId`) REFERENCES `contacts` (`id`),
  CONSTRAINT `contact_merge_archives_loser_fk`
    FOREIGN KEY (`loserContactId`) REFERENCES `contacts` (`id`),
  CONSTRAINT `contact_merge_archives_source_contact_fk`
    FOREIGN KEY (`sourceContactId`) REFERENCES `contacts` (`id`) ON DELETE SET NULL,
  CONSTRAINT `contact_merge_archives_archived_by_user_fk`
    FOREIGN KEY (`archivedById`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `contact_merge_archives_restored_by_user_fk`
    FOREIGN KEY (`restoredById`) REFERENCES `users` (`id`) ON DELETE SET NULL
);
