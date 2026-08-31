-- Smart Plans inherit one configurable plan-wide delivery schedule. Existing
-- plans begin with Sunday–Saturday, 8 AM–8 PM Eastern and no step override.
ALTER TABLE `smart_plans`
  ADD COLUMN `defaultSendWindowEnabled` boolean NOT NULL DEFAULT true,
  ADD COLUMN `defaultSendDays` json NULL,
  ADD COLUMN `defaultSendStartHour` int NOT NULL DEFAULT 8,
  ADD COLUMN `defaultSendEndHour` int NOT NULL DEFAULT 20,
  ADD COLUMN `defaultSendTimezone` varchar(64) NOT NULL DEFAULT 'America/New_York';
--> statement-breakpoint
UPDATE `smart_plans`
SET `defaultSendWindowEnabled` = true,
    `defaultSendDays` = JSON_ARRAY(0, 1, 2, 3, 4, 5, 6),
    `defaultSendStartHour` = 8,
    `defaultSendEndHour` = 20,
    `defaultSendTimezone` = 'America/New_York';
--> statement-breakpoint
ALTER TABLE `smart_plans`
  MODIFY COLUMN `defaultSendDays` json NOT NULL;
--> statement-breakpoint
ALTER TABLE `smart_plan_steps`
  ADD COLUMN `sendWindowOverride` boolean NOT NULL DEFAULT false;
--> statement-breakpoint
-- Retire existing per-step schedules in favor of the new default without
-- discarding the historic field values. Administrators can set new overrides
-- explicitly, and newly created plans will inherit this default automatically.
UPDATE `smart_plan_steps`
SET `sendWindowOverride` = false;
--> statement-breakpoint
-- Reorder every existing plan by its configured wait time. Preserve the exact
-- next step for active or paused enrollments by remapping their positional
-- currentStepIndex before changing the visible stepOrder values.
CREATE TEMPORARY TABLE `smart_plan_step_timing_map` AS
SELECT
  `id`,
  `planId`,
  `stepOrder` AS `oldStepOrder`,
  ROW_NUMBER() OVER (
    PARTITION BY `planId`
    ORDER BY `delayDays`, `delayHours`, `stepOrder`, `id`
  ) - 1 AS `newStepOrder`
FROM `smart_plan_steps`;
--> statement-breakpoint
CREATE TEMPORARY TABLE `smart_plan_step_next_index_map` AS
SELECT `id`, `planId`, `newStepOrder`
FROM `smart_plan_step_timing_map`;
--> statement-breakpoint
UPDATE `smart_plan_enrollments` AS `enrollment`
JOIN `smart_plan_step_timing_map` AS `oldStep`
  ON `oldStep`.`planId` = `enrollment`.`planId`
 AND `oldStep`.`oldStepOrder` = `enrollment`.`currentStepIndex`
JOIN `smart_plan_step_next_index_map` AS `newStep`
  ON `newStep`.`id` = `oldStep`.`id`
SET `enrollment`.`currentStepIndex` = `newStep`.`newStepOrder`
WHERE `enrollment`.`status` IN ('active', 'paused')
  AND `enrollment`.`archivedAt` IS NULL;
--> statement-breakpoint
UPDATE `smart_plan_steps` AS `step`
JOIN `smart_plan_step_timing_map` AS `timing`
  ON `timing`.`id` = `step`.`id`
SET `step`.`stepOrder` = `timing`.`newStepOrder`;
--> statement-breakpoint
DROP TEMPORARY TABLE `smart_plan_step_timing_map`;
--> statement-breakpoint
DROP TEMPORARY TABLE `smart_plan_step_next_index_map`;
--> statement-breakpoint
-- Existing password shares remain view-only. New grants can independently
-- allow recipients to create or edit entries without list-management access.
ALTER TABLE `password_list_shares`
  ADD COLUMN `canView` boolean NOT NULL DEFAULT true,
  ADD COLUMN `canCreate` boolean NOT NULL DEFAULT false,
  ADD COLUMN `canEdit` boolean NOT NULL DEFAULT false;
