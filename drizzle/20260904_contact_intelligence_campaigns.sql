-- Contact Intelligence v2 campaign controls and extraction provenance.
-- This migration is intentionally scoped to the Contact Intelligence tables.

CREATE TABLE IF NOT EXISTS `contact_intelligence_backfill_runs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `status` enum('running','paused','completed','cancelled') NOT NULL DEFAULT 'running',
  `extractionVersion` varchar(64) NOT NULL DEFAULT 'contact-intelligence-v2',
  `dateFrom` timestamp NULL,
  `dateTo` timestamp NULL,
  `minimumDurationSeconds` int NOT NULL DEFAULT 0,
  `actionableOnly` tinyint(1) NOT NULL DEFAULT 0,
  `targetContacts` int NOT NULL DEFAULT 0,
  `queuedContacts` int NOT NULL DEFAULT 0,
  `completedContacts` int NOT NULL DEFAULT 0,
  `structuredContacts` int NOT NULL DEFAULT 0,
  `nativeSummaryOnlyContacts` int NOT NULL DEFAULT 0,
  `lastQueuedAt` timestamp NULL,
  `completedAt` timestamp NULL,
  `lastError` varchar(512),
  `createdById` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `contact_intelligence_backfill_runs_status_idx` (`status`, `updatedAt`),
  CONSTRAINT `contact_intelligence_backfill_runs_created_by_fk`
    FOREIGN KEY (`createdById`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE `contact_intelligence_jobs`
  ADD COLUMN `backfillRunId` int NULL AFTER `communicationId`,
  ADD COLUMN `extractionMode` enum('structured','native_summary_only') NULL AFTER `extractionVersion`,
  ADD COLUMN `modelUsed` varchar(128) NULL AFTER `extractionMode`,
  MODIFY COLUMN `extractionVersion` varchar(64) NOT NULL DEFAULT 'contact-intelligence-v2',
  DROP INDEX `contact_intelligence_jobs_source_unique`,
  ADD UNIQUE KEY `contact_intelligence_jobs_source_unique` (`aircallCallId`, `sourceHash`, `extractionVersion`),
  ADD KEY `contact_intelligence_jobs_backfill_status_idx` (`backfillRunId`, `status`),
  ADD CONSTRAINT `contact_intelligence_jobs_backfill_run_fk`
    FOREIGN KEY (`backfillRunId`) REFERENCES `contact_intelligence_backfill_runs` (`id`) ON DELETE SET NULL;

ALTER TABLE `contact_intelligence_profiles`
  ADD COLUMN `extractionMode` enum('structured','native_summary_only') NOT NULL DEFAULT 'native_summary_only' AFTER `extractionVersion`,
  ADD COLUMN `modelUsed` varchar(128) NULL AFTER `extractionMode`,
  MODIFY COLUMN `extractionVersion` varchar(64) NOT NULL DEFAULT 'contact-intelligence-v2';

ALTER TABLE `contact_intelligence_signals`
  MODIFY COLUMN `extractionVersion` varchar(64) NOT NULL DEFAULT 'contact-intelligence-v2';

-- Preserve the pilot's actual provenance. A legacy profile with retained
-- evidence signals was structurally extracted; a profile without signals was
-- intentionally stored as native-summary-only.
UPDATE `contact_intelligence_profiles` profile
SET `extractionMode` = 'structured', `modelUsed` = COALESCE(`modelUsed`, 'gpt-5-mini')
WHERE EXISTS (
  SELECT 1 FROM `contact_intelligence_signals` cis
  WHERE cis.`contactId` = profile.`contactId`
    AND cis.`status` = 'active'
);

UPDATE `contact_intelligence_jobs` job
SET `extractionMode` = 'structured', `modelUsed` = COALESCE(`modelUsed`, 'gpt-5-mini')
WHERE job.`status` = 'completed'
  AND EXISTS (
    SELECT 1 FROM `contact_intelligence_signals` cis
    WHERE cis.`aircallCallId` = job.`aircallCallId`
      AND cis.`sourceHash` = job.`sourceHash`
      AND cis.`status` = 'active'
  );

UPDATE `contact_intelligence_jobs`
SET `extractionMode` = 'native_summary_only'
WHERE `status` = 'completed' AND `extractionMode` IS NULL;
