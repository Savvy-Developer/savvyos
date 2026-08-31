ALTER TABLE `admin_permissions`
  ADD COLUMN `canApprovePto` boolean NOT NULL DEFAULT false,
  ADD COLUMN `canAdministerPto` boolean NOT NULL DEFAULT false;
