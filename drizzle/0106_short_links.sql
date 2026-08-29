CREATE TABLE `short_links` (
  `id` int AUTO_INCREMENT NOT NULL,
  `name` varchar(255) NOT NULL,
  `slug` varchar(120) NOT NULL,
  `destinationUrl` text NOT NULL,
  `status` enum('active','disabled','archived') NOT NULL DEFAULT 'active',
  `preserveQueryParams` boolean NOT NULL DEFAULT true,
  `clickCount` int NOT NULL DEFAULT 0,
  `lastClickedAt` timestamp NULL,
  `createdById` int,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `short_links_id` PRIMARY KEY(`id`),
  CONSTRAINT `short_links_slug_unique` UNIQUE(`slug`),
  CONSTRAINT `short_links_createdById_users_id_fk` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action,
  INDEX `short_links_status_updated_idx` (`status`, `updatedAt`),
  INDEX `short_links_created_by_idx` (`createdById`, `updatedAt`)
);

CREATE TABLE `short_link_clicks` (
  `id` int AUTO_INCREMENT NOT NULL,
  `shortLinkId` int NOT NULL,
  `referrerUrl` text,
  `deviceCategory` varchar(24),
  `clickedAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `short_link_clicks_id` PRIMARY KEY(`id`),
  CONSTRAINT `short_link_clicks_shortLinkId_short_links_id_fk` FOREIGN KEY (`shortLinkId`) REFERENCES `short_links`(`id`) ON DELETE cascade ON UPDATE no action,
  INDEX `short_link_clicks_link_clicked_idx` (`shortLinkId`, `clickedAt`)
);
