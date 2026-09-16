-- Daily read counts for blog posts and case studies.
--
-- One row per article per day per reader. Readers are a salted hash that
-- includes the date, so the same person is a different hash tomorrow: the
-- table can say how many people read something today and can never be turned
-- into anybody's reading history. No address is stored.
--
-- Two numbers come out of one table. Views is the sum of viewCount. Readers is
-- the number of rows, which is unique per day rather than all time, and the
-- column is named readers rather than unique visitors so nobody reads it as
-- stricter than it is.

CREATE TABLE IF NOT EXISTS `website_content_views` (
  `id` int NOT NULL AUTO_INCREMENT,
  `contentKind` enum('post','case_study') NOT NULL,
  `contentId` int NOT NULL,
  `dateKey` varchar(10) NOT NULL,
  `visitorHash` varchar(64) NULL,
  `viewCount` int NOT NULL DEFAULT 1,
  `firstViewedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `lastViewedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `website_content_views_unique`
    (`contentKind`, `contentId`, `dateKey`, `visitorHash`),
  KEY `website_content_views_content_idx` (`contentKind`, `contentId`, `dateKey`)
);
