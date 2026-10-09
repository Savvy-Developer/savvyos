-- This capability is deliberately default-off: only Super Permissions managers
-- may grant an administrator the right to fill a legacy missing termination reason.
-- The runtime schema guard can run before migration tooling, so keep this idempotent.
SET @termination_reason_backfill_permission_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'admin_permissions'
    AND COLUMN_NAME = 'canAddMissingTerminationReason'
);
SET @termination_reason_backfill_permission_ddl := IF(
  @termination_reason_backfill_permission_exists = 0,
  'ALTER TABLE `admin_permissions` ADD COLUMN `canAddMissingTerminationReason` boolean NOT NULL DEFAULT false AFTER `canEditTransactionLeadSource`',
  'SELECT 1'
);
PREPARE termination_reason_backfill_permission_statement FROM @termination_reason_backfill_permission_ddl;
EXECUTE termination_reason_backfill_permission_statement;
DEALLOCATE PREPARE termination_reason_backfill_permission_statement;
