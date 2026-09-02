-- Hot Leads outreach guard and inbox completion state.
-- Applied manually to avoid drizzle-kit attempting unrelated legacy schema changes.

ALTER TABLE `contacts`
  ADD COLUMN `lastHotLeadTextAt` timestamp NULL,
  ADD COLUMN `lastHotLeadTextById` int NULL,
  ADD CONSTRAINT `contacts_last_hot_lead_text_by_fk`
    FOREIGN KEY (`lastHotLeadTextById`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE `resend_inbox_threads`
  ADD COLUMN `resolvedAt` timestamp NULL,
  ADD COLUMN `resolvedById` int NULL,
  ADD COLUMN `speedToLeadExcludedAt` timestamp NULL,
  ADD CONSTRAINT `resend_inbox_threads_resolved_by_fk`
    FOREIGN KEY (`resolvedById`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE `marketing_text_inbox_threads`
  ADD COLUMN `resolvedAt` timestamp NULL,
  ADD COLUMN `resolvedById` int NULL,
  ADD COLUMN `speedToLeadExcludedAt` timestamp NULL,
  ADD CONSTRAINT `marketing_text_inbox_threads_resolved_by_fk`
    FOREIGN KEY (`resolvedById`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE NO ACTION;

-- Existing archived conversations are historical resolution decisions and should
-- not continue to count as outstanding Speed to Lead messages.
UPDATE `resend_inbox_threads`
SET `resolvedAt` = COALESCE(`resolvedAt`, `archivedAt`),
    `speedToLeadExcludedAt` = COALESCE(`speedToLeadExcludedAt`, `archivedAt`)
WHERE `archivedAt` IS NOT NULL;

UPDATE `marketing_text_inbox_threads`
SET `resolvedAt` = COALESCE(`resolvedAt`, `archivedAt`),
    `speedToLeadExcludedAt` = COALESCE(`speedToLeadExcludedAt`, `archivedAt`)
WHERE `archivedAt` IS NOT NULL;
