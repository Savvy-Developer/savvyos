CREATE TABLE `aircall_live_transcript_events` (
  `id` int AUTO_INCREMENT NOT NULL,
  `eventKey` varchar(160) NOT NULL,
  `aircallCallId` bigint NOT NULL,
  `payload` json NOT NULL,
  `receivedAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `aircall_live_transcript_events_id` PRIMARY KEY(`id`),
  CONSTRAINT `aircall_live_transcript_events_event_key_unique` UNIQUE(`eventKey`)
);

CREATE INDEX `aircall_live_transcript_events_call_received_idx`
  ON `aircall_live_transcript_events` (`aircallCallId`, `receivedAt`);
