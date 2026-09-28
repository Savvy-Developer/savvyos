-- Weekly Project Update Hub: reportable Projects, one weekly record, review state,
-- automatic-work snapshots, and one optional decision/help ask per update.
ALTER TABLE `pm_projects`
  ADD COLUMN `weeklyUpdatesEnabled` tinyint(1) NOT NULL DEFAULT 0 AFTER `rockStatus`,
  ADD COLUMN `weeklyReportingOwnerId` int NULL AFTER `weeklyUpdatesEnabled`;

ALTER TABLE `pm_weekly_updates`
  ADD COLUMN `weekOf` date NULL AFTER `projectId`,
  ADD COLUMN `reportStatus` varchar(16) NOT NULL DEFAULT 'submitted' AFTER `updateStatus`,
  ADD COLUMN `currentState` text NULL AFTER `progressPct`,
  ADD COLUMN `timelineOnTrack` tinyint(1) NULL AFTER `currentState`,
  ADD COLUMN `revisedTargetDate` timestamp NULL AFTER `timelineOnTrack`,
  ADD COLUMN `topObstacle` text NULL AFTER `nextSteps`,
  ADD COLUMN `proposedFix` text NULL AFTER `topObstacle`,
  ADD COLUMN `nextWeekPriority` text NULL AFTER `proposedFix`,
  ADD COLUMN `askNeededFromId` int NULL AFTER `nextWeekPriority`,
  ADD COLUMN `askNeededBy` timestamp NULL AFTER `askNeededFromId`,
  ADD COLUMN `askSummary` text NULL AFTER `askNeededBy`,
  ADD COLUMN `askProposedSolution` text NULL AFTER `askSummary`,
  ADD COLUMN `snapshotTaskTotal` int NOT NULL DEFAULT 0 AFTER `askProposedSolution`,
  ADD COLUMN `snapshotTaskCompleted` int NOT NULL DEFAULT 0 AFTER `snapshotTaskTotal`,
  ADD COLUMN `snapshotMilestoneTotal` int NOT NULL DEFAULT 0 AFTER `snapshotTaskCompleted`,
  ADD COLUMN `snapshotMilestoneCompleted` int NOT NULL DEFAULT 0 AFTER `snapshotMilestoneTotal`,
  ADD COLUMN `snapshotOverdueTaskCount` int NOT NULL DEFAULT 0 AFTER `snapshotMilestoneCompleted`,
  ADD COLUMN `snapshotTargetDate` timestamp NULL AFTER `snapshotOverdueTaskCount`,
  ADD COLUMN `snapshotNextMilestoneTitle` varchar(128) NULL AFTER `snapshotTargetDate`,
  ADD COLUMN `snapshotNextMilestoneDueDate` timestamp NULL AFTER `snapshotNextMilestoneTitle`,
  ADD COLUMN `reviewedAt` timestamp NULL AFTER `snapshotNextMilestoneDueDate`,
  ADD COLUMN `reviewedById` int NULL AFTER `reviewedAt`,
  ADD COLUMN `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER `createdAt`,
  ADD UNIQUE KEY `pm_weekly_updates_project_week_unique` (`projectId`, `weekOf`),
  ADD KEY `pm_weekly_updates_week_status_idx` (`weekOf`, `reportStatus`);
