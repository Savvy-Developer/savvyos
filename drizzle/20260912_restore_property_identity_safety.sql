-- Historical property records may have valid duplicate normalizedAddress values.
-- Duplicate prevention is handled by the unit-aware application guard rather than a destructive unique index.
SET @drop_unsafe_unique_index := (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.statistics
      WHERE table_schema = DATABASE()
        AND table_name = 'properties'
        AND index_name = 'properties_normalizedAddress_unique'
    ),
    'DROP INDEX `properties_normalizedAddress_unique` ON `properties`',
    'SELECT 1'
  )
);
PREPARE drop_unsafe_unique_index_statement FROM @drop_unsafe_unique_index;
EXECUTE drop_unsafe_unique_index_statement;
DEALLOCATE PREPARE drop_unsafe_unique_index_statement;

SET @create_lookup_index := (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.statistics
      WHERE table_schema = DATABASE()
        AND table_name = 'properties'
        AND index_name = 'idx_properties_normalizedAddress'
    ),
    'SELECT 1',
    'CREATE INDEX `idx_properties_normalizedAddress` ON `properties` (`normalizedAddress`)'
  )
);
PREPARE create_lookup_index_statement FROM @create_lookup_index;
EXECUTE create_lookup_index_statement;
DEALLOCATE PREPARE create_lookup_index_statement;

SET @add_transaction_snapshot := (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'transactions'
        AND column_name = 'propertyAddressSnapshot'
    ),
    'SELECT 1',
    'ALTER TABLE `transactions` ADD COLUMN `propertyAddressSnapshot` VARCHAR(768) NULL AFTER `propertyId`'
  )
);
PREPARE add_transaction_snapshot_statement FROM @add_transaction_snapshot;
EXECUTE add_transaction_snapshot_statement;
DEALLOCATE PREPARE add_transaction_snapshot_statement;

-- The property identity reconciliation must run before this backfill, so every
-- historical transaction receives the repaired address identity it had when created.
UPDATE `transactions` t
LEFT JOIN `properties` p ON p.`id` = t.`propertyId`
SET t.`propertyAddressSnapshot` = CASE
  WHEN p.`id` IS NULL THEN NULL
  ELSE TRIM(CONCAT_WS(' ', p.`address`, NULLIF(CONCAT_WS(', ', p.`city`, p.`state`), ''), p.`zip`))
END
WHERE t.`propertyAddressSnapshot` IS NULL;
