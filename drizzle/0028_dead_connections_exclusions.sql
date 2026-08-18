ALTER TABLE `contacts`
  ADD COLUMN `deadConnectionsExclusionMode` enum('permanent','temporary') NULL,
  ADD COLUMN `deadConnectionsExcludedAt` timestamp NULL,
  ADD COLUMN `deadConnectionsExcludedUntil` timestamp NULL,
  ADD COLUMN `deadConnectionsExcludedByUserId` int NULL,
  ADD CONSTRAINT `contacts_dead_connections_excluded_by_user_fk`
    FOREIGN KEY (`deadConnectionsExcludedByUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL;

CREATE INDEX `contacts_dead_connections_exclusion_idx`
  ON `contacts` (`deadConnectionsExcludedAt`, `deadConnectionsExcludedUntil`);
