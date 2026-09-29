ALTER TABLE `onboarding_instances`
  MODIFY COLUMN `status` enum('in_progress', 'completed', 'graduated', 'terminated') NOT NULL DEFAULT 'in_progress',
  ADD COLUMN `startedByUserId` int NULL AFTER `startedAt`,
  ADD COLUMN `graduatedAt` timestamp NULL AFTER `completedAt`,
  ADD COLUMN `graduatedByUserId` int NULL AFTER `graduatedAt`,
  ADD COLUMN `terminatedAt` timestamp NULL AFTER `graduatedByUserId`,
  ADD COLUMN `terminatedByUserId` int NULL AFTER `terminatedAt`,
  ADD COLUMN `terminationReason` text NULL AFTER `terminatedByUserId`,
  ADD COLUMN `completionDurationMinutes` int NULL AFTER `terminationReason`,
  ADD CONSTRAINT `onboarding_instances_startedByUserId_users_id_fk`
    FOREIGN KEY (`startedByUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `onboarding_instances_graduatedByUserId_users_id_fk`
    FOREIGN KEY (`graduatedByUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `onboarding_instances_terminatedByUserId_users_id_fk`
    FOREIGN KEY (`terminatedByUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL;
--> statement-breakpoint
UPDATE `onboarding_instances`
SET
  `status` = 'graduated',
  `graduatedAt` = COALESCE(`completedAt`, `graduatedAt`),
  `completionDurationMinutes` = CASE
    WHEN `completedAt` IS NOT NULL THEN GREATEST(0, TIMESTAMPDIFF(MINUTE, `startedAt`, `completedAt`))
    ELSE NULL
  END
WHERE `status` = 'completed';
--> statement-breakpoint
ALTER TABLE `onboarding_instances`
  MODIFY COLUMN `status` enum('in_progress', 'graduated', 'terminated') NOT NULL DEFAULT 'in_progress';
