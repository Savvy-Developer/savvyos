-- Applied at startup by server/vendorListsMultiSchema.ts. Kept here for the record.
-- An agent may keep one Vendor List per market (TR013). The plain index on
-- agentId is created before the UNIQUE one is dropped so the agentId foreign
-- key always has an index.
ALTER TABLE `vendor_lists` ADD COLUMN `label` varchar(120) NULL AFTER `agentId`;
CREATE INDEX `vendor_lists_agent_idx` ON `vendor_lists` (`agentId`);
ALTER TABLE `vendor_lists` DROP INDEX `vendor_lists_agentId_unique`;
