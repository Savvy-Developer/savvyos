ALTER TABLE `admin_permissions`
  ADD COLUMN `canViewWebinars` boolean NOT NULL DEFAULT true AFTER `canViewMarketingAdmin`;
