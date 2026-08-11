ALTER TABLE `tasks` ADD COLUMN `onboardingInstanceTaskId` int NULL;
--> statement-breakpoint
ALTER TABLE `onboarding_template_tasks`
  ADD COLUMN `adminUserId` int NULL,
  ADD CONSTRAINT `onboarding_template_tasks_adminUserId_users_id_fk`
    FOREIGN KEY (`adminUserId`) REFERENCES `users`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE `onboarding_instance_tasks`
  ADD COLUMN `adminUserId` int NULL,
  ADD COLUMN `linkedTaskId` int NULL,
  ADD CONSTRAINT `onboarding_instance_tasks_adminUserId_users_id_fk`
    FOREIGN KEY (`adminUserId`) REFERENCES `users`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  ADD CONSTRAINT `onboarding_instance_tasks_linkedTaskId_tasks_id_fk`
    FOREIGN KEY (`linkedTaskId`) REFERENCES `tasks`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
