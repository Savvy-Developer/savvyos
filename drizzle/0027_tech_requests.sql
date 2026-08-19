CREATE TABLE `tech_requests` (
  `id` int AUTO_INCREMENT NOT NULL,
  `requesterId` int NOT NULL,
  `assigneeId` int,
  `title` varchar(255) NOT NULL,
  `description` text,
  `priority` enum('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
  `status` enum('new','in_progress','completed','cancelled') NOT NULL DEFAULT 'new',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `tech_requests_id_pk` PRIMARY KEY(`id`),
  CONSTRAINT `tech_requests_requester_fk` FOREIGN KEY (`requesterId`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  CONSTRAINT `tech_requests_assignee_fk` FOREIGN KEY (`assigneeId`) REFERENCES `users`(`id`) ON DELETE SET NULL
);
-- statement-breakpoint
CREATE INDEX `tech_requests_status_idx` ON `tech_requests` (`status`);
-- statement-breakpoint
CREATE INDEX `tech_requests_requester_idx` ON `tech_requests` (`requesterId`);
-- statement-breakpoint
CREATE INDEX `tech_requests_assignee_idx` ON `tech_requests` (`assigneeId`);
-- statement-breakpoint
ALTER TABLE `admin_permissions` ADD `canViewTechRequests` boolean NOT NULL DEFAULT true;
