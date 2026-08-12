-- Custom Email Notification Builder
-- This migration is additive only. It creates the persistent definitions used by
-- the Email Notifications builder without altering existing business data.

CREATE TABLE IF NOT EXISTS `custom_email_notifications` (
  `id` int AUTO_INCREMENT NOT NULL,
  `notificationKey` varchar(128) NOT NULL,
  `name` varchar(160) NOT NULL,
  `description` text,
  `trigger` varchar(255) NOT NULL,
  `triggerType` varchar(20) NOT NULL,
  `recipient` varchar(64) NOT NULL,
  `category` varchar(64) NOT NULL,
  `subject` varchar(512) NOT NULL,
  `bodyText` text NOT NULL,
  `isEnabled` boolean NOT NULL DEFAULT TRUE,
  `createdById` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `custom_email_notifications_id_pk` PRIMARY KEY (`id`),
  CONSTRAINT `custom_email_notifications_notification_key_unique` UNIQUE (`notificationKey`),
  CONSTRAINT `custom_email_notifications_created_by_user_fk`
    FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL
);
