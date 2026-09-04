-- Canonical My EOS notification inbox support.
-- Work items remain the sole source of completion, comments, status, and routing history.

ALTER TABLE `pulse_work_items`
  ADD COLUMN IF NOT EXISTS `blockerPersonId` INT NULL,
  ADD CONSTRAINT `pulse_work_items_blocker_person_fk`
    FOREIGN KEY (`blockerPersonId`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  ADD INDEX `pulse_work_items_blocker_idx` (`blockerPersonId`, `status`, `deletedAt`);

ALTER TABLE `pulse_notifications`
  MODIFY COLUMN `notificationType` ENUM(
    'mention',
    'comment',
    'assignment',
    'cascade',
    'proposed_issue',
    'reminder',
    'overdue',
    'completion',
    'blocker'
  ) NOT NULL;
