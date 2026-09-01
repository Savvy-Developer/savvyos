ALTER TABLE `pulse_personal_inputs`
  ADD COLUMN `metadata` json,
  MODIFY COLUMN `numericValue` decimal(18,4);

ALTER TABLE `pulse_meeting_updates`
  MODIFY COLUMN `updateType` enum('segue','headline','brief') NOT NULL;
