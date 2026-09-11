-- Exclusive ZIP-code territories for Agent Markets.
-- The unique ZIP index is deliberately global, preventing one five-digit USPS
-- ZIP from being assigned to more than one Savvy market under any workflow.
CREATE TABLE IF NOT EXISTS `market_zip_codes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `marketProfileId` int NOT NULL,
  `zipCode` varchar(5) NOT NULL,
  `createdById` int NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `market_zip_codes_zip_unique` (`zipCode`),
  KEY `market_zip_codes_market_idx` (`marketProfileId`),
  CONSTRAINT `market_zip_codes_market_fk` FOREIGN KEY (`marketProfileId`) REFERENCES `market_profiles` (`id`) ON DELETE CASCADE,
  CONSTRAINT `market_zip_codes_created_by_fk` FOREIGN KEY (`createdById`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
