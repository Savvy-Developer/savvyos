ALTER TABLE `agent_connections`
  ADD COLUMN `appointmentSetByUserId` int NULL AFTER `appointmentSetAt`,
  ADD CONSTRAINT `agent_connections_appointment_set_by_user_fk`
    FOREIGN KEY (`appointmentSetByUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL;

CREATE TABLE `isa_outcome_attributions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `transactionId` int NOT NULL,
  `isaId` int NOT NULL,
  `contactId` int NOT NULL,
  `appointmentConnectionId` int NULL,
  `attributionBasis` enum('appointment_setter','assigned_isa','manual') NOT NULL,
  `status` enum('under_contract','closed','terminated') NOT NULL,
  `underContractAt` timestamp NULL,
  `closedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `isa_outcome_attributions_pk` PRIMARY KEY (`id`),
  CONSTRAINT `isa_outcome_transaction_uidx` UNIQUE (`transactionId`),
  CONSTRAINT `isa_outcome_transaction_fk` FOREIGN KEY (`transactionId`) REFERENCES `transactions`(`id`) ON DELETE CASCADE,
  CONSTRAINT `isa_outcome_isa_fk` FOREIGN KEY (`isaId`) REFERENCES `users`(`id`),
  CONSTRAINT `isa_outcome_contact_fk` FOREIGN KEY (`contactId`) REFERENCES `contacts`(`id`),
  CONSTRAINT `isa_outcome_appointment_fk` FOREIGN KEY (`appointmentConnectionId`) REFERENCES `agent_connections`(`id`) ON DELETE SET NULL,
  INDEX `isa_outcome_isa_status_idx` (`isaId`, `status`),
  INDEX `isa_outcome_contact_idx` (`contactId`),
  INDEX `isa_outcome_appointment_idx` (`appointmentConnectionId`)
);

-- Recover the acting ISA from the immutable connection-creation activity log.
UPDATE `agent_connections` ac
JOIN `activity_log` al
  ON al.`entityType` = 'agent_connection'
 AND al.`entityId` = ac.`id`
 AND al.`action` = 'agent_connection_created'
JOIN `users` actor
  ON actor.`id` = al.`userId`
 AND actor.`role` = 'isa'
SET ac.`appointmentSetByUserId` = actor.`id`
WHERE ac.`appointmentSet` = 1
  AND ac.`appointmentSetByUserId` IS NULL;

-- Backfill transaction outcomes. Prefer the ISA who recorded the appointment
-- for the transaction's agent; otherwise snapshot the contact's assigned ISA.
INSERT INTO `isa_outcome_attributions` (
  `transactionId`,
  `isaId`,
  `contactId`,
  `appointmentConnectionId`,
  `attributionBasis`,
  `status`,
  `underContractAt`,
  `closedAt`
)
SELECT
  t.`id`,
  COALESCE(appointment_isa.`id`, assigned_isa.`id`) AS `isaId`,
  t.`primaryContactId`,
  CASE WHEN appointment_isa.`id` IS NOT NULL THEN ac.`id` ELSE NULL END AS `appointmentConnectionId`,
  CASE WHEN appointment_isa.`id` IS NOT NULL THEN 'appointment_setter' ELSE 'assigned_isa' END AS `attributionBasis`,
  t.`status`,
  COALESCE(t.`contractDate`, t.`createdAt`) AS `underContractAt`,
  CASE WHEN t.`status` = 'closed' THEN COALESCE(t.`closingDate`, t.`updatedAt`) ELSE NULL END AS `closedAt`
FROM `transactions` t
JOIN `contacts` c ON c.`id` = t.`primaryContactId`
LEFT JOIN `agent_connections` ac
  ON ac.`contactId` = t.`primaryContactId`
 AND ac.`agentId` = t.`agentId`
 AND ac.`appointmentSet` = 1
LEFT JOIN `users` appointment_isa
  ON appointment_isa.`id` = ac.`appointmentSetByUserId`
 AND appointment_isa.`role` = 'isa'
LEFT JOIN `users` assigned_isa
  ON assigned_isa.`id` = c.`assignedIsaId`
 AND assigned_isa.`role` = 'isa'
WHERE COALESCE(appointment_isa.`id`, assigned_isa.`id`) IS NOT NULL;
