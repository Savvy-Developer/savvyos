-- Persist native Aircall group-conversation identity so group replies remain
-- visible in the originating Marketing Text Inbox conversation.
ALTER TABLE `aircall_messages`
  ADD COLUMN `groupConversationId` varchar(128) NULL,
  ADD COLUMN `groupParticipants` json NULL,
  ADD KEY `aircall_messages_group_conversation_idx` (`groupConversationId`);

-- Preserve group conversations already received before these explicit fields
-- existed. Aircall webhook envelopes store the values under data; immediate
-- native sends store them at the payload root.
UPDATE `aircall_messages`
SET
  `groupConversationId` = COALESCE(
    JSON_UNQUOTE(JSON_EXTRACT(`rawPayload`, '$.data.group_conversation_id')),
    JSON_UNQUOTE(JSON_EXTRACT(`rawPayload`, '$.group_conversation_id'))
  ),
  `groupParticipants` = COALESCE(
    JSON_EXTRACT(`rawPayload`, '$.data.participants'),
    JSON_EXTRACT(`rawPayload`, '$.participants')
  )
WHERE `rawPayload` IS NOT NULL
  AND (
    JSON_EXTRACT(`rawPayload`, '$.data.group_conversation_id') IS NOT NULL
    OR JSON_EXTRACT(`rawPayload`, '$.group_conversation_id') IS NOT NULL
  );
