-- Relative schedule offsets keep sponsor deliverable deadlines attached to
-- their Event start date. The application startup guard applies this
-- idempotently during a Railway rollout; this migration is the durable record.
ALTER TABLE `event_sponsor_deliverables`
  ADD COLUMN `dueOffsetDays` int NULL AFTER `dueDate`,
  ADD KEY `event_sponsor_deliverables_due_status_idx` (`dueDate`, `status`);
