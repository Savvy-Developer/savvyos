-- Tyler approved showing exact submission times within the permission-gated Coach feedback admin area.
ALTER TABLE `coaching_feedback_responses`
  ADD COLUMN `submittedAt` timestamp NOT NULL DEFAULT (now());
CREATE INDEX `coaching_feedback_response_submitted_idx`
  ON `coaching_feedback_responses` (`submittedAt`);

-- Existing test-only responses are backfilled for Tyler's preview. Live responses are
-- intentionally not joined to invitation records.
UPDATE `coaching_feedback_responses` r
JOIN `coaching_feedback_invitations` i
  ON i.`coachId` = r.`coachId`
 AND i.`isTest` = true
 AND r.`isTest` = true
SET r.`submittedAt` = i.`submittedAt`
WHERE i.`submittedAt` IS NOT NULL;
