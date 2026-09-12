ALTER TABLE `transactions`
  ADD COLUMN `transactionLeadSourceId` int NULL AFTER `primaryContactId`,
  ADD CONSTRAINT `transactions_transactionLeadSourceId_lead_sources_id_fk`
    FOREIGN KEY (`transactionLeadSourceId`) REFERENCES `lead_sources` (`id`) ON DELETE SET NULL;

-- Establish a one-time historical baseline before all new transactions begin
-- retaining their source at the instant the transaction is created.
UPDATE `transactions` t
LEFT JOIN `contacts` c ON c.`id` = t.`primaryContactId`
SET t.`transactionLeadSourceId` = c.`leadSourceId`
WHERE t.`transactionLeadSourceId` IS NULL;
