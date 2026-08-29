-- Paid-media measurement, recoverable page revisions, and GoHighLevel-path migrations.
ALTER TABLE `landing_pages`
  ADD COLUMN `trackingSettings` json NULL AFTER `socialImageUrl`;
--> statement-breakpoint

CREATE TABLE `landing_page_revisions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `landingPageId` int NOT NULL,
  `revisionNumber` int NOT NULL,
  `changeType` varchar(32) NOT NULL,
  `snapshot` json NOT NULL,
  `createdById` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `landing_page_revisions_id_pk` PRIMARY KEY (`id`),
  CONSTRAINT `landing_page_revisions_page_fk` FOREIGN KEY (`landingPageId`) REFERENCES `landing_pages`(`id`) ON DELETE CASCADE,
  CONSTRAINT `landing_page_revisions_created_by_fk` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  CONSTRAINT `landing_page_revisions_page_revision_unique` UNIQUE (`landingPageId`, `revisionNumber`),
  INDEX `landing_page_revisions_page_created_idx` (`landingPageId`, `createdAt`)
);
--> statement-breakpoint

CREATE TABLE `landing_page_redirects` (
  `id` int AUTO_INCREMENT NOT NULL,
  `sourcePath` varchar(500) NOT NULL,
  `destinationUrl` text NOT NULL,
  `status` enum('active','disabled','archived') NOT NULL DEFAULT 'active',
  `redirectType` enum('permanent','temporary') NOT NULL DEFAULT 'permanent',
  `preserveQueryParams` boolean NOT NULL DEFAULT true,
  `clickCount` int NOT NULL DEFAULT 0,
  `lastRedirectedAt` timestamp NULL,
  `createdById` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `landing_page_redirects_id_pk` PRIMARY KEY (`id`),
  CONSTRAINT `landing_page_redirects_source_path_unique` UNIQUE (`sourcePath`),
  CONSTRAINT `landing_page_redirects_created_by_fk` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  INDEX `landing_page_redirects_status_updated_idx` (`status`, `updatedAt`)
);
