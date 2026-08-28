ALTER TABLE `webinar_attendees`
  ADD COLUMN `contactId` int NULL AFTER `webinarId`,
  ADD COLUMN `contactRegistrationNotedAt` timestamp NULL AFTER `contactId`,
  ADD CONSTRAINT `webinar_attendees_contactId_contacts_id_fk`
    FOREIGN KEY (`contactId`) REFERENCES `contacts` (`id`) ON DELETE SET NULL,
  ADD INDEX `webinar_attendees_contact_idx` (`contactId`);
