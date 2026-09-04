ALTER TABLE `one_time_sends`
  ADD COLUMN `emailDeliveryMethod` varchar(64) NULL AFTER `dateAddedTo`,
  ADD COLUMN `resendSegmentId` varchar(255) NULL AFTER `emailDeliveryMethod`,
  ADD COLUMN `resendContactImportId` varchar(255) NULL AFTER `resendSegmentId`,
  ADD COLUMN `resendBroadcastId` varchar(255) NULL AFTER `resendContactImportId`,
  ADD COLUMN `resendBroadcastStatus` varchar(64) NULL AFTER `resendBroadcastId`,
  ADD COLUMN `resendBroadcastError` text NULL AFTER `resendBroadcastStatus`,
  ADD KEY `one_time_sends_resend_broadcast_idx` (`resendBroadcastId`);
