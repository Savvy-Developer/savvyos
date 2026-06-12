CREATE TABLE `approval_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` enum('delete_agent_connection') NOT NULL,
	`requestedById` int NOT NULL,
	`targetId` int NOT NULL,
	`reason` text NOT NULL,
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`reviewedById` int,
	`reviewNote` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `approval_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contact_properties` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contactId` int NOT NULL,
	`propertyId` int NOT NULL,
	`label` varchar(128) DEFAULT 'Primary home',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `contact_properties_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `approval_requests` ADD CONSTRAINT `approval_requests_requestedById_users_id_fk` FOREIGN KEY (`requestedById`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `approval_requests` ADD CONSTRAINT `approval_requests_reviewedById_users_id_fk` FOREIGN KEY (`reviewedById`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contact_properties` ADD CONSTRAINT `contact_properties_contactId_contacts_id_fk` FOREIGN KEY (`contactId`) REFERENCES `contacts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contact_properties` ADD CONSTRAINT `contact_properties_propertyId_properties_id_fk` FOREIGN KEY (`propertyId`) REFERENCES `properties`(`id`) ON DELETE no action ON UPDATE no action;