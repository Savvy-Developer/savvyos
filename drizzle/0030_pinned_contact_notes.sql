ALTER TABLE `communications`
  ADD COLUMN `isPinned` boolean NOT NULL DEFAULT false;

CREATE INDEX `communications_contact_pinned_idx`
  ON `communications` (`relatedContactId`, `isPinned`);
