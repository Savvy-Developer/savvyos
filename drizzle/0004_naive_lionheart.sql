CREATE TABLE `listings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`propertyId` int,
	`agentId` int NOT NULL,
	`listingStatus` enum('active','terminated','expired') NOT NULL DEFAULT 'active',
	`listPrice` decimal(12,2),
	`listDate` timestamp,
	`expirationDate` timestamp,
	`mlsNumber` varchar(64),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `listings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `smart_plan_enrollments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`planId` int NOT NULL,
	`contactId` int NOT NULL,
	`currentStepIndex` int NOT NULL DEFAULT 0,
	`enrolledAt` timestamp NOT NULL DEFAULT (now()),
	`nextStepAt` timestamp,
	`status` enum('active','paused','completed','cancelled') NOT NULL DEFAULT 'active',
	`completedAt` timestamp,
	CONSTRAINT `smart_plan_enrollments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `smart_plan_executions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`enrollmentId` int NOT NULL,
	`stepId` int NOT NULL,
	`channel` enum('email','sms') NOT NULL,
	`sentAt` timestamp NOT NULL DEFAULT (now()),
	`status` enum('sent','failed','skipped') NOT NULL DEFAULT 'sent',
	`errorMessage` text,
	CONSTRAINT `smart_plan_executions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `smart_plan_steps` (
	`id` int AUTO_INCREMENT NOT NULL,
	`planId` int NOT NULL,
	`stepOrder` int NOT NULL,
	`channel` enum('email','sms') NOT NULL,
	`delayDays` int NOT NULL DEFAULT 0,
	`delayHours` int NOT NULL DEFAULT 0,
	`subject` varchar(255),
	`body` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `smart_plan_steps_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `smart_plans` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`triggerLeadSourceId` int,
	`status` enum('active','paused') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `smart_plans_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `transaction_payout_items` MODIFY COLUMN `payeeType` enum('agent','savvy_str_agents','exp','group_leader','referral_partner','isa_bonus','other') NOT NULL;--> statement-breakpoint
ALTER TABLE `transactions` MODIFY COLUMN `transactionType` enum('buyer','seller') NOT NULL;--> statement-breakpoint
ALTER TABLE `transactions` MODIFY COLUMN `status` enum('active','under_contract','closed','terminated') NOT NULL DEFAULT 'active';--> statement-breakpoint
ALTER TABLE `transaction_payout_items` ADD `commissionType` enum('percentage','flat') DEFAULT 'percentage' NOT NULL;--> statement-breakpoint
ALTER TABLE `transactions` ADD `commissionType` enum('percentage','flat') DEFAULT 'percentage' NOT NULL;--> statement-breakpoint
ALTER TABLE `listings` ADD CONSTRAINT `listings_propertyId_properties_id_fk` FOREIGN KEY (`propertyId`) REFERENCES `properties`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `listings` ADD CONSTRAINT `listings_agentId_users_id_fk` FOREIGN KEY (`agentId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `smart_plan_enrollments` ADD CONSTRAINT `smart_plan_enrollments_planId_smart_plans_id_fk` FOREIGN KEY (`planId`) REFERENCES `smart_plans`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `smart_plan_enrollments` ADD CONSTRAINT `smart_plan_enrollments_contactId_contacts_id_fk` FOREIGN KEY (`contactId`) REFERENCES `contacts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `smart_plan_executions` ADD CONSTRAINT `smart_plan_executions_enrollmentId_smart_plan_enrollments_id_fk` FOREIGN KEY (`enrollmentId`) REFERENCES `smart_plan_enrollments`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `smart_plan_executions` ADD CONSTRAINT `smart_plan_executions_stepId_smart_plan_steps_id_fk` FOREIGN KEY (`stepId`) REFERENCES `smart_plan_steps`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `smart_plan_steps` ADD CONSTRAINT `smart_plan_steps_planId_smart_plans_id_fk` FOREIGN KEY (`planId`) REFERENCES `smart_plans`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `smart_plans` ADD CONSTRAINT `smart_plans_triggerLeadSourceId_lead_sources_id_fk` FOREIGN KEY (`triggerLeadSourceId`) REFERENCES `lead_sources`(`id`) ON DELETE no action ON UPDATE no action;