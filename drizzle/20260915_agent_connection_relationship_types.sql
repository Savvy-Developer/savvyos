-- Relationship classification belongs to an agent-contact connection, not the
-- shared contact. Existing connections and historical requests are intentionally
-- backfilled as Both so no existing lead is excluded from the new filter.
SET @add_connection_relationship_type := (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'agent_connections'
        AND column_name = 'relationshipType'
    ),
    'SELECT 1',
    'ALTER TABLE `agent_connections` ADD COLUMN `relationshipType` ENUM(\'buyer\', \'seller\', \'both\') NOT NULL DEFAULT \'both\' AFTER `pipelineStatus`'
  )
);
PREPARE add_connection_relationship_type FROM @add_connection_relationship_type;
EXECUTE add_connection_relationship_type;
DEALLOCATE PREPARE add_connection_relationship_type;

SET @add_request_relationship_type := (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'connection_requests'
        AND column_name = 'requestedRelationshipType'
    ),
    'SELECT 1',
    'ALTER TABLE `connection_requests` ADD COLUMN `requestedRelationshipType` ENUM(\'buyer\', \'seller\', \'both\') NOT NULL DEFAULT \'both\' AFTER `requestedPipelineStatus`'
  )
);
PREPARE add_request_relationship_type FROM @add_request_relationship_type;
EXECUTE add_request_relationship_type;
DEALLOCATE PREPARE add_request_relationship_type;

UPDATE `agent_connections`
SET `relationshipType` = 'both'
WHERE `relationshipType` IS NULL;

UPDATE `connection_requests`
SET `requestedRelationshipType` = 'both'
WHERE `requestedRelationshipType` IS NULL;
