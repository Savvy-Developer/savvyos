-- Reset the retired Pulse implementation. All objects below are isolated to Pulse.
DROP TABLE IF EXISTS `pulse_communication_acknowledgments`;
DROP TABLE IF EXISTS `pulse_notification_deliveries`;
DROP TABLE IF EXISTS `pulse_notification_intents`;
DROP TABLE IF EXISTS `pulse_communication_recipient_ledger`;
DROP TABLE IF EXISTS `pulse_communication_targets`;
DROP TABLE IF EXISTS `pulse_communications`;
DROP TABLE IF EXISTS `pulse_team_scope_links`;
DROP TABLE IF EXISTS `pulse_session_votes`;
DROP TABLE IF EXISTS `pulse_session_item_captures`;
DROP TABLE IF EXISTS `pulse_session_step_snapshots`;
DROP TABLE IF EXISTS `pulse_session_reports`;
DROP TABLE IF EXISTS `pulse_meeting_sessions`;
DROP TABLE IF EXISTS `pulse_meeting_registry`;
DROP TABLE IF EXISTS `pulse_issue_votes`;
DROP TABLE IF EXISTS `pulse_issues`;
DROP TABLE IF EXISTS `pulse_todos`;
DROP TABLE IF EXISTS `pulse_work_item_mentions`;
DROP TABLE IF EXISTS `pulse_work_item_comments`;
DROP TABLE IF EXISTS `pulse_work_item_notification_intents`;
DROP TABLE IF EXISTS `pulse_work_item_placements`;
DROP TABLE IF EXISTS `pulse_work_item_activity`;
DROP TABLE IF EXISTS `pulse_work_item_recurrences`;
DROP TABLE IF EXISTS `pulse_work_items`;
DROP TABLE IF EXISTS `pulse_work_item_types`;
DROP TABLE IF EXISTS `pulse_measurable_alerts`;
DROP TABLE IF EXISTS `pulse_measurable_entries`;
DROP TABLE IF EXISTS `pulse_measurable_placements`;
DROP TABLE IF EXISTS `pulse_measurables`;
DROP TABLE IF EXISTS `pulse_strategy_scope_placements`;
DROP TABLE IF EXISTS `pulse_strategy_raci`;
DROP TABLE IF EXISTS `pulse_strategy_nodes`;
DROP TABLE IF EXISTS `pulse_reporting_periods`;
DROP TABLE IF EXISTS `pulse_holidays`;
DROP TABLE IF EXISTS `pulse_l10_settings`;
DROP TABLE IF EXISTS `pulse_scope_memberships`;
DROP TABLE IF EXISTS `pulse_domain_events`;
DROP TABLE IF EXISTS `pulse_calendar_config`;
DROP TABLE IF EXISTS `pulse_person_accounts`;
DROP TABLE IF EXISTS `pulse_scopes`;
DROP TABLE IF EXISTS `pulse_people`;

SET @pulse_permission_cleanup = (
  SELECT IF(
    COUNT(*) > 0,
    'ALTER TABLE `admin_permissions` DROP COLUMN `canViewPulse`',
    'SELECT 1'
  )
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'admin_permissions'
    AND column_name = 'canViewPulse'
);
PREPARE pulse_permission_cleanup_statement FROM @pulse_permission_cleanup;
EXECUTE pulse_permission_cleanup_statement;
DEALLOCATE PREPARE pulse_permission_cleanup_statement;
