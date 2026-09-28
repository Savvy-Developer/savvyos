-- Sold sweep log: the sales that took a website listing down, so a relisted
-- property is not taken down again for the same sale. The app creates this at
-- startup (server/websiteSoldSweepSchema.ts), so running this by hand is not
-- needed.
CREATE TABLE IF NOT EXISTS `website_sold_sweeps` (
  `id` int NOT NULL AUTO_INCREMENT,
  `saleKey` varchar(64) NOT NULL,
  `propertyId` int NULL,
  `websitePropertyId` int NULL,
  `action` enum('baseline','unpublished') NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `website_sold_sweeps_saleKey_uq` (`saleKey`)
);
