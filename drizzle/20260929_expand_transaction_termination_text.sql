-- Preserve detailed transaction termination records without MySQL TEXT's 64 KB ceiling.
-- Termination reasons are stored both on the transaction and in transaction_notes.
ALTER TABLE `transactions` MODIFY COLUMN `terminationReason` mediumtext NULL;
ALTER TABLE `transaction_notes` MODIFY COLUMN `content` mediumtext NOT NULL;
