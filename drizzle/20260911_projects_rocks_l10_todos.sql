-- Projects are the shared work surface. A Rock is a governed Project subtype.
ALTER TABLE `pm_projects`
  ADD COLUMN `isRock` boolean NOT NULL DEFAULT false AFTER `status`,
  ADD COLUMN `rockQuarter` varchar(16) AFTER `isRock`,
  ADD COLUMN `definitionOfDone` text AFTER `rockQuarter`,
  ADD COLUMN `rockStatus` enum('on_track','at_risk','off_track','done','dropped') NOT NULL DEFAULT 'on_track' AFTER `definitionOfDone`;

-- Project-resolved L10 To-Dos stay visible in their originating L10 until a
-- meeting participant acknowledges the documented resolution.
ALTER TABLE `pulse_work_items`
  ADD COLUMN `requiresL10Acknowledgement` boolean NOT NULL DEFAULT false AFTER `percentSource`;

CREATE TABLE `pulse_todo_acknowledgements` (
  `id` varchar(36) NOT NULL,
  `workItemId` varchar(36) NOT NULL,
  `acknowledgedById` int NOT NULL,
  `acknowledgedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `pulse_todo_acknowledgements_item_unique` UNIQUE (`workItemId`),
  CONSTRAINT `pulse_todo_acknowledgements_item_fk` FOREIGN KEY (`workItemId`) REFERENCES `pulse_work_items` (`id`) ON DELETE CASCADE,
  CONSTRAINT `pulse_todo_acknowledgements_person_fk` FOREIGN KEY (`acknowledgedById`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  KEY `pulse_todo_acknowledgements_person_idx` (`acknowledgedById`, `acknowledgedAt`)
);
