CREATE TABLE IF NOT EXISTS `daily_coaching_briefings` (
  `id` int AUTO_INCREMENT NOT NULL,
  `reportDate` varchar(10) NOT NULL,
  `snapshot` json NOT NULL,
  `rotation` json NOT NULL,
  `content` json NOT NULL,
  `aiModel` varchar(128),
  `generatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `sentAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `daily_coaching_briefings_id` PRIMARY KEY(`id`),
  CONSTRAINT `daily_coaching_briefings_date_unique` UNIQUE(`reportDate`)
);
--> statement-breakpoint
CREATE INDEX `daily_coaching_briefings_generated_idx` ON `daily_coaching_briefings` (`generatedAt`);
