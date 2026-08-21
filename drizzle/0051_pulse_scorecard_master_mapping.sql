-- Prompt 7: Pulse is a display-only consumer of the SavvyOS R&R scorecard.
-- Retire the old Pulse-owned metric and value stores; active legacy rows were
-- already absent, and no metric/value data may persist in Pulse after this migration.
DROP TABLE IF EXISTS `pulse_scorecard_entries`;
DROP TABLE IF EXISTS `pulse_scorecard_metrics`;

CREATE TABLE IF NOT EXISTS `meeting_scorecard_metrics` (
  `id` varchar(36) NOT NULL,
  `meetingId` varchar(36) NOT NULL,
  `savvyosMetricId` int NULL,
  `sortOrder` int NOT NULL DEFAULT 0,
  `addedById` int NOT NULL,
  `addedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `meeting_scorecard_metrics_id_pk` PRIMARY KEY (`id`),
  CONSTRAINT `meeting_scorecard_metrics_meeting_fk` FOREIGN KEY (`meetingId`) REFERENCES `pulse_meetings`(`id`) ON DELETE CASCADE,
  CONSTRAINT `meeting_scorecard_metrics_metric_fk` FOREIGN KEY (`savvyosMetricId`) REFERENCES `rr_scorecard_metrics`(`id`) ON DELETE SET NULL,
  CONSTRAINT `meeting_scorecard_metrics_added_by_fk` FOREIGN KEY (`addedById`) REFERENCES `users`(`id`) ON DELETE RESTRICT,
  UNIQUE KEY `meeting_scorecard_metric_unique` (`meetingId`, `savvyosMetricId`),
  KEY `meeting_scorecard_metric_meeting_idx` (`meetingId`, `sortOrder`)
);
