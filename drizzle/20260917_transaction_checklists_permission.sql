ALTER TABLE `admin_permissions`
  ADD COLUMN `canViewTransactionChecklists` boolean NOT NULL DEFAULT true AFTER `canViewTasks`;
