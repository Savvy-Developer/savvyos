CREATE TABLE IF NOT EXISTS `transaction_exports` (
  `id` int AUTO_INCREMENT NOT NULL,
  `exportedById` int NOT NULL,
  `format` varchar(16) NOT NULL DEFAULT 'csv',
  `fileName` varchar(255) NOT NULL,
  `rowCount` int NOT NULL,
  `filters` json NOT NULL,
  `filterSummary` text NOT NULL,
  `columns` json NOT NULL,
  `transactionIds` json NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `transaction_exports_id` PRIMARY KEY (`id`),
  CONSTRAINT `transaction_exports_exportedById_users_id_fk`
    FOREIGN KEY (`exportedById`) REFERENCES `users`(`id`)
    ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE INDEX `transaction_exports_exportedBy_idx`
  ON `transaction_exports` (`exportedById`);

CREATE INDEX `transaction_exports_createdAt_idx`
  ON `transaction_exports` (`createdAt`);
