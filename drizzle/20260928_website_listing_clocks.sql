-- 90-day website listing expiry: when each listing last went live. The app
-- creates this at startup (server/websiteListingExpirySchema.ts), so running
-- this by hand is not needed.
CREATE TABLE IF NOT EXISTS `website_listing_clocks` (
  `websitePropertyId` int NOT NULL,
  `liveSince` timestamp NOT NULL,
  `wasLive` boolean NOT NULL DEFAULT true,
  `expiredAt` timestamp NULL,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`websitePropertyId`)
);
