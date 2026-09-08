-- Preserve existing session health records as self-ratings, then support
-- designated meeting leaders rating individual participants with low-score context.
ALTER TABLE `pulse_session_ratings`
  ADD COLUMN `ratedById` int NULL AFTER `personId`,
  ADD COLUMN `reason` text NULL AFTER `rating`;

UPDATE `pulse_session_ratings`
SET `ratedById` = `personId`
WHERE `ratedById` IS NULL;

ALTER TABLE `pulse_session_ratings`
  MODIFY COLUMN `ratedById` int NOT NULL,
  DROP INDEX `pulse_session_rating_unique`,
  ADD UNIQUE KEY `pulse_session_rating_reviewer_participant_unique` (`sessionId`,`ratedById`,`personId`),
  ADD KEY `pulse_session_rating_reviewer_idx` (`ratedById`),
  ADD CONSTRAINT `pulse_session_rating_reviewer_fk`
    FOREIGN KEY (`ratedById`) REFERENCES `users`(`id`) ON DELETE CASCADE;
