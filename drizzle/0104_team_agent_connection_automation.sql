-- Consolidate legacy duplicate agent/contact connections before enforcing a
-- one-connection-per-agent/client rule. References keep pointing to the
-- canonical (oldest) connection so historical tasks and communications remain intact.
CREATE TEMPORARY TABLE agent_connection_dedupe AS
SELECT agentId, contactId, MIN(id) AS canonical_id
FROM agent_connections
GROUP BY agentId, contactId
HAVING COUNT(*) > 1;
--> statement-breakpoint
START TRANSACTION;
--> statement-breakpoint
UPDATE tasks t
INNER JOIN agent_connections duplicate_connection
  ON duplicate_connection.id = t.relatedAgentConnectionId
INNER JOIN agent_connection_dedupe canonical
  ON canonical.agentId = duplicate_connection.agentId
  AND canonical.contactId = duplicate_connection.contactId
SET t.relatedAgentConnectionId = canonical.canonical_id
WHERE duplicate_connection.id <> canonical.canonical_id;
--> statement-breakpoint
UPDATE communications c
INNER JOIN agent_connections duplicate_connection
  ON duplicate_connection.id = c.relatedAgentConnectionId
INNER JOIN agent_connection_dedupe canonical
  ON canonical.agentId = duplicate_connection.agentId
  AND canonical.contactId = duplicate_connection.contactId
SET c.relatedAgentConnectionId = canonical.canonical_id
WHERE duplicate_connection.id <> canonical.canonical_id;
--> statement-breakpoint
UPDATE isa_outcome_attributions i
INNER JOIN agent_connections duplicate_connection
  ON duplicate_connection.id = i.appointmentConnectionId
INNER JOIN agent_connection_dedupe canonical
  ON canonical.agentId = duplicate_connection.agentId
  AND canonical.contactId = duplicate_connection.contactId
SET i.appointmentConnectionId = canonical.canonical_id
WHERE duplicate_connection.id <> canonical.canonical_id;
--> statement-breakpoint
UPDATE pipeline_email_sends p
INNER JOIN agent_connections duplicate_connection
  ON duplicate_connection.id = p.agentConnectionId
INNER JOIN agent_connection_dedupe canonical
  ON canonical.agentId = duplicate_connection.agentId
  AND canonical.contactId = duplicate_connection.contactId
SET p.agentConnectionId = canonical.canonical_id
WHERE duplicate_connection.id <> canonical.canonical_id;
--> statement-breakpoint
DELETE duplicate_connection
FROM agent_connections duplicate_connection
INNER JOIN agent_connection_dedupe canonical
  ON canonical.agentId = duplicate_connection.agentId
  AND canonical.contactId = duplicate_connection.contactId
WHERE duplicate_connection.id <> canonical.canonical_id;
--> statement-breakpoint
COMMIT;
--> statement-breakpoint
DROP TEMPORARY TABLE agent_connection_dedupe;
--> statement-breakpoint
ALTER TABLE agent_connections
  ADD CONSTRAINT agent_connections_agent_contact_uidx UNIQUE (agentId, contactId);
--> statement-breakpoint
-- Backfill pipeline access for active Savvy agents' existing deals and listings.
-- Existing agent-managed connections are not modified.
INSERT INTO agent_connections (agentId, contactId, pipelineStatus, agingUpdatedAt)
SELECT source.agentId,
       source.contactId,
       CASE MAX(source.pipeline_priority)
         WHEN 3 THEN 'under_contract'
         WHEN 2 THEN 'active_client'
         ELSE 'closed'
       END AS pipelineStatus,
       NOW()
FROM (
  SELECT l.agentId,
         l.contactId,
         CASE
           WHEN l.listingStatus = 'under_contract' THEN 3
           WHEN l.listingStatus = 'closed' THEN 1
           ELSE 2
         END AS pipeline_priority
  FROM listings l
  WHERE l.agentId IS NOT NULL AND l.contactId IS NOT NULL

  UNION ALL

  SELECT t.agentId,
         t.primaryContactId AS contactId,
         CASE
           WHEN t.status = 'under_contract' THEN 3
           WHEN t.status = 'closed' THEN 1
           ELSE 2
         END AS pipeline_priority
  FROM transactions t

  UNION ALL

  SELECT t.agentId,
         t.seller_contact_id AS contactId,
         CASE
           WHEN t.status = 'under_contract' THEN 3
           WHEN t.status = 'closed' THEN 1
           ELSE 2
         END AS pipeline_priority
  FROM transactions t
  WHERE t.seller_contact_id IS NOT NULL

  UNION ALL

  SELECT t.agentId,
         t.buyer_contact_id AS contactId,
         CASE
           WHEN t.status = 'under_contract' THEN 3
           WHEN t.status = 'closed' THEN 1
           ELSE 2
         END AS pipeline_priority
  FROM transactions t
  WHERE t.buyer_contact_id IS NOT NULL
) source
INNER JOIN users u
  ON u.id = source.agentId
  AND u.role = 'agent'
  AND u.isActive = 1
LEFT JOIN agent_connections existing_connection
  ON existing_connection.agentId = source.agentId
  AND existing_connection.contactId = source.contactId
WHERE existing_connection.id IS NULL
GROUP BY source.agentId, source.contactId;
