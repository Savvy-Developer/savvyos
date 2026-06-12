CREATE TABLE `activity_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`action` varchar(255) NOT NULL,
	`entityType` varchar(64),
	`entityId` int,
	`details` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `activity_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `agent_connections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`agentId` int NOT NULL,
	`contactId` int NOT NULL,
	`pipelineStatus` enum('new_lead','attempted_contact','nurture','active_client','under_contract','closed','dead') NOT NULL DEFAULT 'new_lead',
	`followUpDate` timestamp,
	`agentNotes` text,
	`propertyType` varchar(128),
	`minPrice` decimal(12,2),
	`maxPrice` decimal(12,2),
	`minBeds` int,
	`maxBeds` int,
	`minBaths` decimal(4,1),
	`minSqft` int,
	`maxSqft` int,
	`targetCities` json,
	`targetZips` json,
	`strRequirements` text,
	`investmentNotes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `agent_connections_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `automations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`triggerType` enum('record_created','field_updated','scheduled','transaction_closed','transaction_status_changed','follow_up_date','payout_integrity_fail','agent_connection_created','isa_assigned_agent') NOT NULL,
	`triggerConfig` json,
	`actionType` enum('create_task','send_notification','send_email','update_record','flag_record','notify_owner') NOT NULL,
	`actionConfig` json,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `automations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `communications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` enum('note','call','email','sms','meeting','voice_note') NOT NULL,
	`subject` varchar(512),
	`body` text,
	`direction` enum('inbound','outbound','internal') DEFAULT 'internal',
	`authorId` int,
	`relatedContactId` int,
	`relatedTransactionId` int,
	`relatedPropertyId` int,
	`relatedAgentConnectionId` int,
	`audioFileUrl` text,
	`transcription` text,
	`communicatedAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `communications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`firstName` varchar(128) NOT NULL,
	`lastName` varchar(128) NOT NULL,
	`email` varchar(320),
	`phone` varchar(32),
	`secondaryEmail` varchar(320),
	`secondaryPhone` varchar(32),
	`address` text,
	`city` varchar(128),
	`state` varchar(64),
	`zip` varchar(16),
	`spouseFirstName` varchar(128),
	`spouseLastName` varchar(128),
	`spouseEmail` varchar(320),
	`spousePhone` varchar(32),
	`leadSourceType` enum('referral','paid_lead','paid_partnership','organic','sphere'),
	`referralPartnerId` int,
	`campaignSource` varchar(255),
	`partnershipName` varchar(255),
	`assignedIsaId` int,
	`notes` text,
	`tags` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contacts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(512) NOT NULL,
	`fileKey` varchar(1024) NOT NULL,
	`fileUrl` text NOT NULL,
	`mimeType` varchar(128),
	`fileSize` bigint,
	`uploadedById` int,
	`relatedContactId` int,
	`relatedTransactionId` int,
	`relatedPropertyId` int,
	`relatedAgentId` int,
	`documentType` enum('contract','disclosure','addendum','inspection','title','closing','voice_note','other') NOT NULL DEFAULT 'other',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `group_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`groupId` int NOT NULL,
	`userId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `group_members_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `groups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`leaderId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `groups_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `properties` (
	`id` int AUTO_INCREMENT NOT NULL,
	`address` varchar(512) NOT NULL,
	`city` varchar(128),
	`state` varchar(64),
	`zip` varchar(16),
	`beds` decimal(4,1),
	`baths` decimal(4,1),
	`sqft` int,
	`propertyType` enum('single_family','multi_family','condo','townhouse','cabin','vacation_rental','commercial','land','other'),
	`yearBuilt` int,
	`listPrice` decimal(12,2),
	`strZoning` varchar(255),
	`strNotes` text,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `properties_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `property_ownership` (
	`id` int AUTO_INCREMENT NOT NULL,
	`propertyId` int NOT NULL,
	`ownerContactId` int NOT NULL,
	`ownershipStartDate` timestamp,
	`ownershipEndDate` timestamp,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `property_ownership_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `referral_partners` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`email` varchar(320),
	`phone` varchar(32),
	`company` varchar(255),
	`agreementNotes` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `referral_partners_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(512) NOT NULL,
	`description` text,
	`assignedToId` int,
	`createdById` int,
	`relatedContactId` int,
	`relatedTransactionId` int,
	`relatedPropertyId` int,
	`relatedAgentConnectionId` int,
	`priority` enum('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
	`status` enum('pending','in_progress','completed','cancelled') NOT NULL DEFAULT 'pending',
	`dueDate` timestamp,
	`completedAt` timestamp,
	`taskType` enum('follow_up','outreach','document','call','email','meeting','review','payout','other') NOT NULL DEFAULT 'other',
	`isAutomated` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tasks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `transaction_payout_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`transactionId` int NOT NULL,
	`payeeType` enum('agent','brokerage','group_leader','referral_partner','isa_bonus','other') NOT NULL,
	`payeeUserId` int,
	`payeeReferralPartnerId` int,
	`payeeName` varchar(255),
	`percentage` decimal(5,2) NOT NULL,
	`amount` decimal(12,2),
	`isPaid` boolean NOT NULL DEFAULT false,
	`paidDate` timestamp,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `transaction_payout_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`transactionNumber` varchar(64),
	`agentId` int NOT NULL,
	`primaryContactId` int NOT NULL,
	`propertyId` int,
	`transactionType` enum('buyer','seller','dual','referral','lease') NOT NULL,
	`status` enum('active','pending','under_contract','closed','cancelled','fallen_through') NOT NULL DEFAULT 'active',
	`purchasePrice` decimal(12,2),
	`contractDate` timestamp,
	`closingDate` timestamp,
	`grossCommissionIncome` decimal(12,2),
	`commissionRate` decimal(5,4),
	`payoutIntegrityFlag` boolean NOT NULL DEFAULT false,
	`payoutIntegrityNote` text,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `transactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('admin','agent','isa') NOT NULL DEFAULT 'agent';--> statement-breakpoint
ALTER TABLE `users` ADD `phone` varchar(32);--> statement-breakpoint
ALTER TABLE `users` ADD `isActive` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `activity_log` ADD CONSTRAINT `activity_log_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agent_connections` ADD CONSTRAINT `agent_connections_agentId_users_id_fk` FOREIGN KEY (`agentId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agent_connections` ADD CONSTRAINT `agent_connections_contactId_contacts_id_fk` FOREIGN KEY (`contactId`) REFERENCES `contacts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `communications` ADD CONSTRAINT `communications_authorId_users_id_fk` FOREIGN KEY (`authorId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `communications` ADD CONSTRAINT `communications_relatedContactId_contacts_id_fk` FOREIGN KEY (`relatedContactId`) REFERENCES `contacts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `communications` ADD CONSTRAINT `communications_relatedTransactionId_transactions_id_fk` FOREIGN KEY (`relatedTransactionId`) REFERENCES `transactions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `communications` ADD CONSTRAINT `communications_relatedPropertyId_properties_id_fk` FOREIGN KEY (`relatedPropertyId`) REFERENCES `properties`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `communications` ADD CONSTRAINT `communications_relatedAgentConnectionId_agent_connections_id_fk` FOREIGN KEY (`relatedAgentConnectionId`) REFERENCES `agent_connections`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contacts` ADD CONSTRAINT `contacts_referralPartnerId_referral_partners_id_fk` FOREIGN KEY (`referralPartnerId`) REFERENCES `referral_partners`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contacts` ADD CONSTRAINT `contacts_assignedIsaId_users_id_fk` FOREIGN KEY (`assignedIsaId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `documents` ADD CONSTRAINT `documents_uploadedById_users_id_fk` FOREIGN KEY (`uploadedById`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `documents` ADD CONSTRAINT `documents_relatedContactId_contacts_id_fk` FOREIGN KEY (`relatedContactId`) REFERENCES `contacts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `documents` ADD CONSTRAINT `documents_relatedTransactionId_transactions_id_fk` FOREIGN KEY (`relatedTransactionId`) REFERENCES `transactions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `documents` ADD CONSTRAINT `documents_relatedPropertyId_properties_id_fk` FOREIGN KEY (`relatedPropertyId`) REFERENCES `properties`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `documents` ADD CONSTRAINT `documents_relatedAgentId_users_id_fk` FOREIGN KEY (`relatedAgentId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `group_members` ADD CONSTRAINT `group_members_groupId_groups_id_fk` FOREIGN KEY (`groupId`) REFERENCES `groups`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `group_members` ADD CONSTRAINT `group_members_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `groups` ADD CONSTRAINT `groups_leaderId_users_id_fk` FOREIGN KEY (`leaderId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `property_ownership` ADD CONSTRAINT `property_ownership_propertyId_properties_id_fk` FOREIGN KEY (`propertyId`) REFERENCES `properties`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `property_ownership` ADD CONSTRAINT `property_ownership_ownerContactId_contacts_id_fk` FOREIGN KEY (`ownerContactId`) REFERENCES `contacts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_assignedToId_users_id_fk` FOREIGN KEY (`assignedToId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_createdById_users_id_fk` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_relatedContactId_contacts_id_fk` FOREIGN KEY (`relatedContactId`) REFERENCES `contacts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_relatedTransactionId_transactions_id_fk` FOREIGN KEY (`relatedTransactionId`) REFERENCES `transactions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_relatedPropertyId_properties_id_fk` FOREIGN KEY (`relatedPropertyId`) REFERENCES `properties`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_relatedAgentConnectionId_agent_connections_id_fk` FOREIGN KEY (`relatedAgentConnectionId`) REFERENCES `agent_connections`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transaction_payout_items` ADD CONSTRAINT `transaction_payout_items_transactionId_transactions_id_fk` FOREIGN KEY (`transactionId`) REFERENCES `transactions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transaction_payout_items` ADD CONSTRAINT `transaction_payout_items_payeeUserId_users_id_fk` FOREIGN KEY (`payeeUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transaction_payout_items` ADD CONSTRAINT `tx_payout_items_payee_ref_partner_fk` FOREIGN KEY (`payeeReferralPartnerId`) REFERENCES `referral_partners`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_agentId_users_id_fk` FOREIGN KEY (`agentId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_primaryContactId_contacts_id_fk` FOREIGN KEY (`primaryContactId`) REFERENCES `contacts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_propertyId_properties_id_fk` FOREIGN KEY (`propertyId`) REFERENCES `properties`(`id`) ON DELETE no action ON UPDATE no action;