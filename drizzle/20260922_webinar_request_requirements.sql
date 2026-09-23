-- Webinar marketing requests retain their required guest information and headshots.
ALTER TABLE `webinars`
  ADD COLUMN `partnerGuestInfo` text NULL AFTER `description`,
  ADD COLUMN `guestBios` text NULL AFTER `partnerGuestInfo`;

CREATE TABLE `webinar_guest_headshots` (
  `id` int NOT NULL AUTO_INCREMENT,
  `webinarId` int NOT NULL,
  `fileUrl` text NOT NULL,
  `fileKey` varchar(512) NOT NULL,
  `fileName` varchar(255) NOT NULL,
  `mimeType` varchar(128) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `webinar_guest_headshots_webinar_idx` (`webinarId`),
  CONSTRAINT `webinar_guest_headshots_webinar_fk` FOREIGN KEY (`webinarId`) REFERENCES `webinars` (`id`) ON DELETE CASCADE
);
