-- Applied at startup by server/databaseBackup.ts. Kept here for the record.
CREATE TABLE IF NOT EXISTS `database_backup_runs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `runTrigger` varchar(16) NOT NULL,
  `status` varchar(16) NOT NULL,
  `startedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `finishedAt` timestamp NULL DEFAULT NULL,
  `objectKey` varchar(512) NULL,
  `bytes` bigint NULL,
  `sha256` char(64) NULL,
  `tableCount` int NULL,
  `rowCount` bigint NULL,
  `host` varchar(128) NULL,
  `error` text NULL,
  PRIMARY KEY (`id`),
  KEY `database_backup_runs_started_idx` (`startedAt`)
);
