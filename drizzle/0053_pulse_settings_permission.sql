-- Prompt 11: preserve all existing Super Permissions values and add only the
-- default-off Pulse Settings capability. The purpose field is Pulse-local and
-- backs the required meeting-creation flow. Both columns may already exist in
-- production because the prior reverted release applied its schema migration.
SET @pulse_settings_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'admin_permissions'
    AND COLUMN_NAME = 'canViewPulseSettings'
);
SET @pulse_settings_ddl := IF(
  @pulse_settings_exists = 0,
  'ALTER TABLE admin_permissions ADD COLUMN canViewPulseSettings BOOLEAN NOT NULL DEFAULT FALSE',
  'SELECT 1'
);
PREPARE pulse_settings_statement FROM @pulse_settings_ddl;
EXECUTE pulse_settings_statement;
DEALLOCATE PREPARE pulse_settings_statement;

SET @pulse_purpose_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'pulse_meetings'
    AND COLUMN_NAME = 'purpose'
);
SET @pulse_purpose_ddl := IF(
  @pulse_purpose_exists = 0,
  'ALTER TABLE pulse_meetings ADD COLUMN purpose VARCHAR(500) NULL',
  'SELECT 1'
);
PREPARE pulse_purpose_statement FROM @pulse_purpose_ddl;
EXECUTE pulse_purpose_statement;
DEALLOCATE PREPARE pulse_purpose_statement;
