-- Replace the legacy binary paid state with a payee-level workflow while preserving
-- the legacy fields for reporting compatibility. Existing paid rows become Paid;
-- all remaining rows become Unreviewed.
ALTER TABLE `transaction_payout_items`
  ADD COLUMN `status` enum('unreviewed','reviewed','paid','settled') NOT NULL DEFAULT 'unreviewed' AFTER `amount`;

UPDATE `transaction_payout_items`
SET `status` = CASE WHEN `isPaid` = 1 THEN 'paid' ELSE 'unreviewed' END;

CREATE INDEX `transaction_payout_items_status_idx` ON `transaction_payout_items` (`status`);

-- Transactions Admin is intentionally opt-in. Tyler retains access through the
-- protected-admin permission behavior in the application.
ALTER TABLE `admin_permissions`
  ADD COLUMN `canAdministerTransactions` boolean NOT NULL DEFAULT false AFTER `canViewTransactions`;
