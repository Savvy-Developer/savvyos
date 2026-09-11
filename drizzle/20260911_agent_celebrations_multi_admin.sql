ALTER TABLE `agent_celebration_events`
  DROP INDEX `agent_celebration_events_event_key_unique`,
  ADD UNIQUE INDEX `agent_celebration_events_event_admin_unique` (`eventKey`, `celebratedById`);
