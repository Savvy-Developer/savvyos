CREATE TABLE IF NOT EXISTS `pto_departments` (
  `id` int AUTO_INCREMENT NOT NULL,
  `name` varchar(128) NOT NULL,
  `isActive` boolean NOT NULL DEFAULT true,
  `createdById` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `pto_departments_id` PRIMARY KEY(`id`),
  CONSTRAINT `pto_departments_name_uq` UNIQUE(`name`),
  CONSTRAINT `pto_departments_createdById_users_id_fk` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
);
--> statement-breakpoint
ALTER TABLE `users`
  ADD COLUMN `ptoDepartmentId` int;
--> statement-breakpoint
ALTER TABLE `users`
  ADD CONSTRAINT `users_ptoDepartmentId_pto_departments_id_fk` FOREIGN KEY (`ptoDepartmentId`) REFERENCES `pto_departments`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
--> statement-breakpoint
CREATE INDEX `users_pto_department_idx` ON `users` (`ptoDepartmentId`);
--> statement-breakpoint
ALTER TABLE `pto_requests`
  ADD COLUMN `approverCoveragePlan` mediumtext,
  ADD COLUMN `coveragePlanById` int,
  ADD COLUMN `coveragePlanAt` timestamp;
--> statement-breakpoint
ALTER TABLE `pto_requests`
  ADD CONSTRAINT `pto_requests_coveragePlanById_users_id_fk` FOREIGN KEY (`coveragePlanById`) REFERENCES `users`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
