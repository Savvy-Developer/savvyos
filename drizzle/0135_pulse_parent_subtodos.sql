-- Pulse-only parent/sub-To-Do hierarchy.
-- Project To-Dos already use pm_tasks.parentTaskId; this migration intentionally does not touch pm_tasks or any Tasks feature.
ALTER TABLE `pulse_work_items`
  ADD COLUMN `parentWorkItemId` varchar(36) NULL AFTER `meetingId`;

ALTER TABLE `pulse_work_items`
  ADD CONSTRAINT `pulse_work_items_parent_work_item_fk`
  FOREIGN KEY (`parentWorkItemId`) REFERENCES `pulse_work_items`(`id`)
  ON DELETE SET NULL;

CREATE INDEX `pulse_work_items_parent_idx`
  ON `pulse_work_items` (`parentWorkItemId`, `deletedAt`, `sortOrder`);

-- Existing issue-resulting To-Dos become visible as native child To-Dos as well.
-- The historical issue-result link remains unchanged for auditability.
UPDATE `pulse_work_items` child
INNER JOIN `pulse_issue_resulting_todos` relation
  ON relation.`todoWorkItemId` = child.`id`
INNER JOIN `pulse_work_items` parent
  ON parent.`id` = relation.`issueWorkItemId`
SET child.`parentWorkItemId` = parent.`id`
WHERE child.`parentWorkItemId` IS NULL
  AND child.`type` = 'todo'
  AND parent.`deletedAt` IS NULL
  AND child.`deletedAt` IS NULL
  AND ((child.`meetingId` IS NULL AND parent.`meetingId` IS NULL) OR child.`meetingId` = parent.`meetingId`);
