-- Smart Plan analytics migration
-- Isolated from unrelated application schema drift; preserves all existing data.

ALTER TABLE smart_plan_executions
  ADD COLUMN provider varchar(64) NULL AFTER channel,
  ADD COLUMN providerMessageId varchar(255) NULL AFTER provider,
  ADD COLUMN replyToken varchar(64) NULL AFTER providerMessageId,
  MODIFY COLUMN status enum('queued','sent','failed','skipped') NOT NULL DEFAULT 'queued',
  ADD COLUMN deliveredAt timestamp NULL AFTER errorMessage,
  ADD COLUMN openedAt timestamp NULL AFTER deliveredAt,
  ADD COLUMN clickedAt timestamp NULL AFTER openedAt,
  ADD COLUMN bouncedAt timestamp NULL AFTER clickedAt,
  ADD COLUMN complainedAt timestamp NULL AFTER bouncedAt,
  ADD COLUMN suppressedAt timestamp NULL AFTER complainedAt,
  ADD COLUMN repliedAt timestamp NULL AFTER suppressedAt,
  ADD KEY smart_plan_executions_step_sent_idx (stepId, sentAt),
  ADD KEY smart_plan_executions_provider_message_idx (providerMessageId),
  ADD UNIQUE KEY smart_plan_executions_reply_token_unique (replyToken);

ALTER TABLE smart_plan_message_events
  ADD KEY smart_plan_message_events_execution_type_idx (executionId, eventType),
  ADD CONSTRAINT smart_plan_message_events_execution_fk
    FOREIGN KEY (executionId) REFERENCES smart_plan_executions (id)
    ON DELETE CASCADE;
