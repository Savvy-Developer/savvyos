-- SavvyOS Mobile Devices for push notifications and device session tracking
CREATE TABLE IF NOT EXISTS `mobile_devices` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `deviceToken` varchar(255) NOT NULL,
  `platform` enum('ios','android') NOT NULL,
  `appVersion` varchar(32),
  `deviceModel` varchar(128),
  `osVersion` varchar(32),
  `isActive` boolean NOT NULL DEFAULT true,
  `lastSeenAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `mobile_devices_id` PRIMARY KEY(`id`),
  CONSTRAINT `mobile_devices_token_unique` UNIQUE(`deviceToken`),
  CONSTRAINT `mobile_devices_user_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE
);

CREATE INDEX `mobile_devices_user_active_idx` ON `mobile_devices` (`userId`, `isActive`);
