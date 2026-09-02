ALTER TABLE `transaction_payout_items`
  ADD COLUMN `expMemoNumber` varchar(64) NULL;

CREATE INDEX `transaction_payout_items_exp_memo_number_idx`
  ON `transaction_payout_items` (`expMemoNumber`);
