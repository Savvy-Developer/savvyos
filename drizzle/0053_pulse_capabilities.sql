-- Prompt 10 Amendment A: static Pulse administration capabilities.
-- These flags govern capability only; meeting visibility remains pulse_meeting_members.
-- All defaults are OFF so no existing person receives a new capability on migration.
ALTER TABLE `admin_permissions`
  ADD COLUMN `canViewPulseSettings` boolean NOT NULL DEFAULT false,
  ADD COLUMN `canViewPulseEffectiveness` boolean NOT NULL DEFAULT false,
  ADD COLUMN `canViewPulseHistory` boolean NOT NULL DEFAULT false,
  ADD COLUMN `canViewAllQuarterlyRocks` boolean NOT NULL DEFAULT false,
  ADD COLUMN `canViewPulsePermissioning` boolean NOT NULL DEFAULT false;

ALTER TABLE `pulse_meetings`
  ADD COLUMN `purpose` text NULL;
