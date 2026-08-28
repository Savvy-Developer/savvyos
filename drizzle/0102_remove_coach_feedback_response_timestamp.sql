-- Privacy hardening: anonymous feedback responses must not retain submission timing.
ALTER TABLE `coaching_feedback_responses`
  DROP COLUMN `createdAt`;
