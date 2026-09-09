-- The duplicate consolidation must complete before applying this constraint.
-- The guard keeps this migration safe when production was consolidated manually.
SET @create_unique_index := (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.statistics
      WHERE table_schema = DATABASE()
        AND table_name = 'properties'
        AND index_name = 'properties_normalizedAddress_unique'
    ),
    'SELECT 1',
    'CREATE UNIQUE INDEX `properties_normalizedAddress_unique` ON `properties` (`normalizedAddress`)'
  )
);
PREPARE create_unique_index_statement FROM @create_unique_index;
EXECUTE create_unique_index_statement;
DEALLOCATE PREPARE create_unique_index_statement;

SET @drop_redundant_index := (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.statistics
      WHERE table_schema = DATABASE()
        AND table_name = 'properties'
        AND index_name = 'idx_properties_normalizedAddress'
    ),
    'DROP INDEX `idx_properties_normalizedAddress` ON `properties`',
    'SELECT 1'
  )
);
PREPARE drop_redundant_index_statement FROM @drop_redundant_index;
EXECUTE drop_redundant_index_statement;
DEALLOCATE PREPARE drop_redundant_index_statement;
