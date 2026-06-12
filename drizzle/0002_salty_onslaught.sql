CREATE TABLE `lead_sources` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`parentId` int,
	`referralPartnerId` int,
	`campaignType` enum('buyer','seller','both'),
	`description` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `lead_sources_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `contacts` ADD `leadSourceId` int;--> statement-breakpoint
ALTER TABLE `referral_partners` ADD `partnerType` enum('individual','company','platform') DEFAULT 'individual';