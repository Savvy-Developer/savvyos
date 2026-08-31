CREATE TABLE IF NOT EXISTS `pto_policies` (
  `id` int AUTO_INCREMENT NOT NULL,
  `ptoType` enum('vacation','sick','personal','bereavement','other') NOT NULL,
  `annualAccrualDays` decimal(7,2) NOT NULL,
  `carryoverCapDays` decimal(7,2) NOT NULL DEFAULT '0',
  `waitingPeriodDays` int NOT NULL DEFAULT 0,
  `effectiveDate` date NOT NULL,
  `isActive` boolean NOT NULL DEFAULT true,
  `updatedById` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `pto_policies_id` PRIMARY KEY(`id`),
  CONSTRAINT `pto_policies_type_effective_date_uq` UNIQUE(`ptoType`,`effectiveDate`),
  CONSTRAINT `pto_policies_updatedById_users_id_fk` FOREIGN KEY (`updatedById`) REFERENCES `users`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
);
--> statement-breakpoint
CREATE INDEX `pto_policies_type_effective_date_idx` ON `pto_policies` (`ptoType`,`effectiveDate`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `pto_settings` (
  `id` int AUTO_INCREMENT NOT NULL,
  `negativeBalanceAllowed` boolean NOT NULL DEFAULT false,
  `payoutAllowed` boolean NOT NULL DEFAULT false,
  `reportingLineSource` varchar(128) NOT NULL DEFAULT 'users.reportsToId',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `pto_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `pto_requests` (
  `id` int AUTO_INCREMENT NOT NULL,
  `employeeId` int NOT NULL,
  `managerId` int NOT NULL,
  `ptoType` enum('vacation','sick','personal','bereavement','other') NOT NULL,
  `startDate` date NOT NULL,
  `endDate` date NOT NULL,
  `requestedDays` decimal(7,2) NOT NULL,
  `coverageNotes` mediumtext,
  `status` enum('pending','approved','declined','withdrawn') NOT NULL DEFAULT 'pending',
  `decisionById` int,
  `decisionReason` mediumtext,
  `decidedAt` timestamp,
  `withdrawnAt` timestamp,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `pto_requests_id` PRIMARY KEY(`id`),
  CONSTRAINT `pto_requests_employeeId_users_id_fk` FOREIGN KEY (`employeeId`) REFERENCES `users`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `pto_requests_managerId_users_id_fk` FOREIGN KEY (`managerId`) REFERENCES `users`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `pto_requests_decisionById_users_id_fk` FOREIGN KEY (`decisionById`) REFERENCES `users`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
);
--> statement-breakpoint
CREATE INDEX `pto_requests_employee_status_idx` ON `pto_requests` (`employeeId`,`status`);
--> statement-breakpoint
CREATE INDEX `pto_requests_manager_status_created_idx` ON `pto_requests` (`managerId`,`status`,`createdAt`);
--> statement-breakpoint
CREATE INDEX `pto_requests_dates_status_idx` ON `pto_requests` (`startDate`,`endDate`,`status`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `pto_balance_adjustments` (
  `id` int AUTO_INCREMENT NOT NULL,
  `employeeId` int NOT NULL,
  `ptoType` enum('vacation','sick','personal','bereavement','other') NOT NULL,
  `amountDays` decimal(7,2) NOT NULL,
  `sourceType` enum('approved_request','admin_adjustment') NOT NULL,
  `ptoRequestId` int,
  `reason` mediumtext NOT NULL,
  `recordedById` int NOT NULL,
  `effectiveDate` date NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `pto_balance_adjustments_id` PRIMARY KEY(`id`),
  CONSTRAINT `pto_balance_adjustments_request_uq` UNIQUE(`ptoRequestId`),
  CONSTRAINT `pto_balance_adjustments_employeeId_users_id_fk` FOREIGN KEY (`employeeId`) REFERENCES `users`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `pto_balance_adjustments_ptoRequestId_pto_requests_id_fk` FOREIGN KEY (`ptoRequestId`) REFERENCES `pto_requests`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `pto_balance_adjustments_recordedById_users_id_fk` FOREIGN KEY (`recordedById`) REFERENCES `users`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
);
--> statement-breakpoint
CREATE INDEX `pto_balance_adjustments_employee_type_date_idx` ON `pto_balance_adjustments` (`employeeId`,`ptoType`,`effectiveDate`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `pto_request_events` (
  `id` int AUTO_INCREMENT NOT NULL,
  `ptoRequestId` int NOT NULL,
  `actorId` int NOT NULL,
  `eventType` enum('submitted','approved','declined','withdrawn') NOT NULL,
  `reason` mediumtext,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `pto_request_events_id` PRIMARY KEY(`id`),
  CONSTRAINT `pto_request_events_ptoRequestId_pto_requests_id_fk` FOREIGN KEY (`ptoRequestId`) REFERENCES `pto_requests`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT `pto_request_events_actorId_users_id_fk` FOREIGN KEY (`actorId`) REFERENCES `users`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
);
--> statement-breakpoint
CREATE INDEX `pto_request_events_request_created_idx` ON `pto_request_events` (`ptoRequestId`,`createdAt`);
