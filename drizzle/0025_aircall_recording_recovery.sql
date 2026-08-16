-- Track bounded late-recording recovery attempts for recent Aircall activities.
ALTER TABLE `aircall_calls`
  ADD COLUMN `recordingRecoveryAttempts` int NOT NULL DEFAULT 0,
  ADD COLUMN `recordingRecoveryLastAttemptAt` timestamp NULL,
  ADD COLUMN `recordingRecoveryLastError` varchar(512) NULL,
  ADD INDEX `aircall_calls_recording_recovery_idx` (`recordingRecoveryAttempts`, `recordingRecoveryLastAttemptAt`);
