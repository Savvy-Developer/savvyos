-- Applied at startup by server/websiteFeaturedSchema.ts. Kept here for the record.
CREATE TABLE IF NOT EXISTS `website_featured_listings` (
  `websitePropertyId` int NOT NULL,
  `featuredAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`websitePropertyId`),
  KEY `website_featured_listings_featured_idx` (`featuredAt`)
);
INSERT IGNORE INTO `website_featured_listings` (`websitePropertyId`, `featuredAt`)
SELECT `id`, COALESCE(`publishedAt`, `updatedAt`) FROM `website_properties` WHERE `isFeatured` = 1;
