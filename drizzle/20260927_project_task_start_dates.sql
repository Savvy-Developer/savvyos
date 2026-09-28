-- Project To-Dos can now be scheduled across a start-to-due-date span in Gantt View.
-- Existing work remains valid and can be scheduled gradually.
ALTER TABLE `pm_tasks`
  ADD COLUMN `startDate` timestamp NULL AFTER `ownerId`;
