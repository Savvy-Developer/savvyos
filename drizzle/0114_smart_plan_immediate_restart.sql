-- Permit one administrator-approved Smart Plan restart to deliver step one immediately.
-- All subsequent steps continue to honor the plan's configured send window.
ALTER TABLE `smart_plan_enrollments`
  ADD COLUMN `bypassInitialSendWindow` boolean NOT NULL DEFAULT FALSE;
