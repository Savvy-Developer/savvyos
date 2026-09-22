-- Project to-dos use the same actionable workflow vocabulary as Pulse.
-- Existing completion state is preserved when the new status column is added.
ALTER TABLE `pm_tasks`
  ADD COLUMN `status` varchar(16) NOT NULL DEFAULT 'not_started' AFTER `priority`,
  ADD COLUMN `recurrence` varchar(16) NOT NULL DEFAULT 'none' AFTER `dueDate`,
  ADD KEY `pm_tasks_project_status_idx` (`projectId`, `status`, `dueDate`);

UPDATE `pm_tasks`
SET `status` = CASE WHEN `completed` = 1 THEN 'completed' ELSE 'not_started' END;
