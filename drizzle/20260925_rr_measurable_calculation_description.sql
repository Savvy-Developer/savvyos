-- Store a plain-language calculation description for manual measurables.
-- Automatic descriptions remain generated from the existing setup.

SET @has_calculation_description := (
  SELECT COUNT(*)
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'rr_scorecard_metrics'
     AND COLUMN_NAME = 'calculationDescription'
);

SET @add_calculation_description := IF(
  @has_calculation_description = 0,
  'ALTER TABLE `rr_scorecard_metrics` ADD COLUMN `calculationDescription` text NULL AFTER `zeroDenominatorLabel`',
  'SELECT 1'
);

PREPARE stmt FROM @add_calculation_description;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
