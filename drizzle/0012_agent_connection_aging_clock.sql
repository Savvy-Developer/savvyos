ALTER TABLE `agent_connections` ADD COLUMN `agingUpdatedAt` timestamp NULL;
--> statement-breakpoint
UPDATE `agent_connections`
SET `agingUpdatedAt` = `updatedAt`
WHERE `agingUpdatedAt` IS NULL;
