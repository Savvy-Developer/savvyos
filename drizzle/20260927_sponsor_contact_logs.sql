-- Sponsor account relationship history. Contact entries are intentionally
-- append-only so Last contact and communications history remain auditable.
CREATE TABLE `event_sponsor_contact_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `sponsorId` int NOT NULL,
  `contactType` enum('call','email','text','meeting','note') NOT NULL,
  `body` text NOT NULL,
  `occurredAt` timestamp NOT NULL,
  `createdById` int NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `event_sponsor_contact_logs_sponsor_occurred_idx` (`sponsorId`,`occurredAt`),
  CONSTRAINT `event_sponsor_contact_logs_sponsor_fk`
    FOREIGN KEY (`sponsorId`) REFERENCES `event_sponsors` (`id`) ON DELETE CASCADE,
  CONSTRAINT `event_sponsor_contact_logs_created_by_fk`
    FOREIGN KEY (`createdById`) REFERENCES `users` (`id`) ON DELETE SET NULL
);
