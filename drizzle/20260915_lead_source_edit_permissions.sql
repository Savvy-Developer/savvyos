ALTER TABLE `admin_permissions`
  ADD COLUMN `canEditContactLeadSource` boolean NOT NULL DEFAULT false AFTER `canViewContacts`,
  ADD COLUMN `canEditTransactionLeadSource` boolean NOT NULL DEFAULT false AFTER `canAdministerTransactions`;
