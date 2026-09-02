CREATE TABLE IF NOT EXISTS `onboarding_template_stages` (
  `id` int NOT NULL AUTO_INCREMENT,
  `templateId` int NOT NULL,
  `name` varchar(120) NOT NULL,
  `sortOrder` int NOT NULL DEFAULT '0',
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `onboarding_template_stages_templateId_onboarding_templates_id_fk`
    FOREIGN KEY (`templateId`) REFERENCES `onboarding_templates`(`id`) ON DELETE CASCADE,
  CONSTRAINT `onboarding_template_stages_template_name_uq` UNIQUE (`templateId`, `name`),
  KEY `onboarding_template_stages_template_sort_idx` (`templateId`, `sortOrder`)
);
--> statement-breakpoint
ALTER TABLE `onboarding_template_tasks`
  ADD COLUMN `stageId` int NULL,
  ADD CONSTRAINT `ott_stage_fk`
    FOREIGN KEY (`stageId`) REFERENCES `onboarding_template_stages`(`id`) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE `onboarding_instance_tasks`
  ADD COLUMN `stageName` varchar(120) NULL;
--> statement-breakpoint
ALTER TABLE `onboarding_instance_tasks`
  DROP FOREIGN KEY `oit_template_task_fk`;
--> statement-breakpoint
ALTER TABLE `onboarding_instance_tasks`
  ADD CONSTRAINT `oit_template_task_fk`
    FOREIGN KEY (`templateTaskId`) REFERENCES `onboarding_template_tasks`(`id`) ON DELETE SET NULL;
