-- Accountability Chart gets an independent HR Super Permission. Preserve each
-- existing administrator's prior access by copying the R&R permission only when
-- the new column is first created.
SET @accountability_chart_permission_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'admin_permissions'
    AND COLUMN_NAME = 'canViewAccountabilityChart'
);

SET @accountability_chart_permission_ddl := IF(
  @accountability_chart_permission_exists = 0,
  'ALTER TABLE `admin_permissions` ADD COLUMN `canViewAccountabilityChart` boolean NOT NULL DEFAULT true AFTER `canViewOrgChart`',
  'SELECT 1'
);
PREPARE accountability_chart_permission_ddl_statement FROM @accountability_chart_permission_ddl;
EXECUTE accountability_chart_permission_ddl_statement;
DEALLOCATE PREPARE accountability_chart_permission_ddl_statement;

SET @accountability_chart_permission_copy := IF(
  @accountability_chart_permission_exists = 0,
  'UPDATE `admin_permissions` SET `canViewAccountabilityChart` = `canViewRolesResponsibilities`',
  'SELECT 1'
);
PREPARE accountability_chart_permission_copy_statement FROM @accountability_chart_permission_copy;
EXECUTE accountability_chart_permission_copy_statement;
DEALLOCATE PREPARE accountability_chart_permission_copy_statement;
