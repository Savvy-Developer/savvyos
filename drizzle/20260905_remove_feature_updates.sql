-- Remove the retired Feature Updates system and its agent-facing release-note data.
-- Existing Daily Report snapshots no longer retain the embedded update list.
UPDATE `daily_agent_reports`
SET `snapshot` = JSON_REMOVE(`snapshot`, '$.featureUpdates')
WHERE JSON_CONTAINS_PATH(`snapshot`, 'one', '$.featureUpdates');

DROP TABLE IF EXISTS `savvyos_feature_updates`;

ALTER TABLE `admin_permissions`
  DROP COLUMN IF EXISTS `canViewFeatureUpdates`;
