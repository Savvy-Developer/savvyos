ALTER TABLE `one_on_one_meetings`
  ADD COLUMN `zoomMeetingId` varchar(64) NULL AFTER `calendarSyncError`,
  ADD COLUMN `zoomMeetingUuid` varchar(255) NULL AFTER `zoomMeetingId`,
  ADD COLUMN `zoomJoinUrl` text NULL AFTER `zoomMeetingUuid`,
  ADD COLUMN `zoomStartUrl` text NULL AFTER `zoomJoinUrl`,
  ADD COLUMN `zoomSyncStatus` enum('Not Requested','Synced','Needs Attention') NOT NULL DEFAULT 'Not Requested' AFTER `zoomStartUrl`,
  ADD COLUMN `zoomSyncError` text NULL AFTER `zoomSyncStatus`,
  ADD COLUMN `zoomTranscriptStatus` enum('Not Requested','Pending','Imported','Needs Attention') NOT NULL DEFAULT 'Not Requested' AFTER `zoomSyncError`,
  ADD COLUMN `zoomTranscriptError` text NULL AFTER `zoomTranscriptStatus`,
  ADD COLUMN `zoomTranscriptFileId` varchar(128) NULL AFTER `zoomTranscriptError`,
  ADD COLUMN `zoomTranscriptImportedAt` timestamp NULL AFTER `zoomTranscriptFileId`,
  MODIFY COLUMN `transcript` mediumtext NULL,
  ADD COLUMN `transcriptSource` enum('Manual','Zoom') NULL AFTER `transcript`;
--> statement-breakpoint
CREATE INDEX `one_on_one_meeting_zoom_id_idx` ON `one_on_one_meetings` (`zoomMeetingId`);
