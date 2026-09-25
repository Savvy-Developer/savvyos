-- Coaching workflow reliability: integration audit fields and evidence-bound commitments.
-- Existing sessions remain valid as SavvyOS-created records; historically imported
-- sessions may be explicitly marked External later without affecting their notes.
ALTER TABLE `coaching_sessions`
  ADD COLUMN `schedulingSource` enum('SavvyOS','External') NOT NULL DEFAULT 'SavvyOS' AFTER `sessionType`,
  ADD COLUMN `zoomMeetingId` varchar(64) NULL AFTER `meetingLink`,
  ADD COLUMN `zoomHostUserId` varchar(255) NULL AFTER `zoomMeetingId`,
  ADD COLUMN `calendarProvider` enum('google','none') NOT NULL DEFAULT 'none' AFTER `zoomHostUserId`,
  ADD COLUMN `calendarEventId` varchar(512) NULL AFTER `calendarProvider`,
  ADD COLUMN `calendarEventUrl` text NULL AFTER `calendarEventId`,
  ADD COLUMN `calendarSyncStatus` enum('Not Requested','Synced','Needs Attention','External') NOT NULL DEFAULT 'Not Requested' AFTER `calendarEventUrl`,
  ADD COLUMN `calendarSyncError` text NULL AFTER `calendarSyncStatus`,
  ADD COLUMN `agentRecapSentAt` timestamp NULL AFTER `noNextSessionReason`;

ALTER TABLE `coaching_commitments`
  ADD COLUMN `agreementEvidence` text NULL AFTER `expectedResult`;

ALTER TABLE `operations_escalations`
  MODIFY COLUMN `sessionId` int NULL;
