CREATE TABLE `pulse_personal_inputs` (
  `id` varchar(36) NOT NULL,
  `personId` int NOT NULL,
  `meetingId` varchar(36) NULL,
  `inputKey` varchar(64) NOT NULL,
  `weekOf` date NOT NULL,
  `numericValue` int NULL,
  `textValue` text NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deletedAt` timestamp NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `pulse_personal_inputs_person_fk` FOREIGN KEY (`personId`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  CONSTRAINT `pulse_personal_inputs_meeting_fk` FOREIGN KEY (`meetingId`) REFERENCES `pulse_meetings`(`id`) ON DELETE CASCADE,
  UNIQUE KEY `pulse_personal_input_week_unique` (`personId`,`meetingId`,`inputKey`,`weekOf`),
  KEY `pulse_personal_input_person_idx` (`personId`,`weekOf`,`deletedAt`)
);
