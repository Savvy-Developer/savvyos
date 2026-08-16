-- Agent-specific Do Not Contact is a terminal pipeline stage and is distinct
-- from the shared contacts.doNotContact compliance flag.
ALTER TABLE `agent_connections`
  MODIFY COLUMN `pipelineStatus` enum(
    'new_lead',
    'attempted_contact',
    'nurture',
    'active_client',
    'under_contract',
    'closed',
    'dead',
    'do_not_contact'
  ) NOT NULL DEFAULT 'new_lead';
