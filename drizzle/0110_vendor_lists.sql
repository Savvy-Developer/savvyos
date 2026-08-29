-- Agent-owned, client-facing vendor directories.
CREATE TABLE `vendor_lists` (
  `id` int AUTO_INCREMENT NOT NULL,
  `agentId` int NOT NULL,
  `displayName` varchar(160) NOT NULL,
  `headline` varchar(255) NULL,
  `intro` text NULL,
  `publicSlug` varchar(120) NOT NULL,
  `isPublished` boolean NOT NULL DEFAULT false,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `vendor_lists_id` PRIMARY KEY(`id`),
  CONSTRAINT `vendor_lists_agentId_unique` UNIQUE(`agentId`),
  CONSTRAINT `vendor_lists_publicSlug_unique` UNIQUE(`publicSlug`),
  CONSTRAINT `vendor_lists_agentId_users_id_fk` FOREIGN KEY (`agentId`) REFERENCES `users`(`id`) ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `vendor_lists_published_updated_idx` ON `vendor_lists` (`isPublished`, `updatedAt`);
--> statement-breakpoint
CREATE TABLE `vendor_categories` (
  `id` int AUTO_INCREMENT NOT NULL,
  `vendorListId` int NOT NULL,
  `name` varchar(120) NOT NULL,
  `description` text NULL,
  `isVisible` boolean NOT NULL DEFAULT true,
  `sortOrder` int NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `vendor_categories_id` PRIMARY KEY(`id`),
  CONSTRAINT `vendor_categories_vendorListId_vendor_lists_id_fk` FOREIGN KEY (`vendorListId`) REFERENCES `vendor_lists`(`id`) ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `vendor_categories_list_sort_idx` ON `vendor_categories` (`vendorListId`, `sortOrder`);
--> statement-breakpoint
CREATE TABLE `vendors` (
  `id` int AUTO_INCREMENT NOT NULL,
  `vendorCategoryId` int NOT NULL,
  `businessName` varchar(255) NOT NULL,
  `contactName` varchar(160) NULL,
  `phone` varchar(64) NULL,
  `email` varchar(320) NULL,
  `website` varchar(512) NULL,
  `address` text NULL,
  `serviceArea` varchar(255) NULL,
  `description` text NULL,
  `isFeatured` boolean NOT NULL DEFAULT false,
  `isVisible` boolean NOT NULL DEFAULT true,
  `sortOrder` int NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `vendors_id` PRIMARY KEY(`id`),
  CONSTRAINT `vendors_vendorCategoryId_vendor_categories_id_fk` FOREIGN KEY (`vendorCategoryId`) REFERENCES `vendor_categories`(`id`) ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `vendors_category_sort_idx` ON `vendors` (`vendorCategoryId`, `sortOrder`);
