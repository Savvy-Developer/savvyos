-- Track whether an inbound reply on the dedicated marketing line has been opened.
ALTER TABLE `aircall_messages`
  ADD COLUMN `readAt` timestamp NULL;

CREATE INDEX `aircall_messages_number_inbound_read_idx`
  ON `aircall_messages` (`aircallNumberId`, `direction`, `readAt`);
