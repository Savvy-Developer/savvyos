-- Inside Sales Manager Dashboard: add a granular, default-off admin capability.
ALTER TABLE `admin_permissions`
  ADD COLUMN `canViewIsmDashboard` boolean NOT NULL DEFAULT false AFTER `canViewReporting`;
