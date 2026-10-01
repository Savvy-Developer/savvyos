-- TR016: checklists on Pipeline connections (agent SOPs).
-- Applied at startup by server/pipelineChecklistSchema.ts, which checks
-- INFORMATION_SCHEMA before each step and only runs what is missing. Kept here
-- for the record. Statements are separate because the exact-target CHECK must
-- be dropped before the enum and column changes and added back after them.

ALTER TABLE `agent_checklist_applications` DROP CHECK `agent_checklist_applications_exact_target_chk`;

ALTER TABLE `agent_checklist_templates`
  MODIFY COLUMN `targetType` enum('transaction','listing','pipeline_connection') NOT NULL;

ALTER TABLE `agent_checklist_applications`
  MODIFY COLUMN `targetType` enum('transaction','listing','pipeline_connection') NOT NULL;

ALTER TABLE `agent_checklist_applications`
  MODIFY COLUMN `templateTargetTypeSnapshot` enum('transaction','listing','pipeline_connection') NOT NULL;

ALTER TABLE `agent_checklist_applications`
  ADD COLUMN `agentConnectionId` int NULL AFTER `listingId`;

CREATE INDEX `agent_checklist_applications_connection_idx`
  ON `agent_checklist_applications` (`agentConnectionId`, `removedAt`, `createdAt`);

ALTER TABLE `agent_checklist_applications`
  ADD CONSTRAINT `agent_checklist_applications_connection_fk`
  FOREIGN KEY (`agentConnectionId`) REFERENCES `agent_connections` (`id`) ON DELETE CASCADE;

ALTER TABLE `agent_checklist_applications`
  ADD CONSTRAINT `agent_checklist_applications_exact_target_chk` CHECK (
    (`transactionId` IS NOT NULL AND `listingId` IS NULL AND `agentConnectionId` IS NULL AND `targetType` = 'transaction')
    OR (`transactionId` IS NULL AND `listingId` IS NOT NULL AND `agentConnectionId` IS NULL AND `targetType` = 'listing')
    OR (`transactionId` IS NULL AND `listingId` IS NULL AND `agentConnectionId` IS NOT NULL AND `targetType` = 'pipeline_connection')
  );
