-- Preserve elapsed reply time for every inbound inbox message. Thread-level
-- state cannot retain a historical stop when a later message reopens a thread.
ALTER TABLE `resend_inbox_messages`
  ADD COLUMN `speedToLeadStoppedAt` timestamp NULL AFTER `receivedAt`;

ALTER TABLE `aircall_messages`
  ADD COLUMN `speedToLeadStoppedAt` timestamp NULL AFTER `readAt`;

-- Existing finished/archived threads retain time through the historical close
-- moment instead of disappearing from Speed to Lead after this release.
UPDATE `resend_inbox_messages` message
INNER JOIN `resend_inbox_threads` thread ON thread.`id` = message.`threadId`
SET message.`speedToLeadStoppedAt` = COALESCE(thread.`resolvedAt`, thread.`archivedAt`)
WHERE message.`direction` = 'inbound'
  AND message.`speedToLeadStoppedAt` IS NULL
  AND COALESCE(thread.`resolvedAt`, thread.`archivedAt`) IS NOT NULL;

UPDATE `aircall_messages` message
INNER JOIN `marketing_text_inbox_threads` thread ON thread.`contactId` = message.`contactId`
SET message.`speedToLeadStoppedAt` = COALESCE(thread.`resolvedAt`, thread.`archivedAt`)
WHERE message.`direction` = 'inbound'
  AND message.`speedToLeadStoppedAt` IS NULL
  AND COALESCE(thread.`resolvedAt`, thread.`archivedAt`) IS NOT NULL;
