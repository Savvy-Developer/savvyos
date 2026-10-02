-- Which Resend list (segment) a new website account joins on sign-up.
-- One row, chosen in Website Studio > Daily Email. No row or NULL = off.
-- Applied automatically at startup by server/websiteSignupAudience.ts
-- (ensureWebsiteSignupAudienceSchema); this file is the record of it.
CREATE TABLE IF NOT EXISTS `website_signup_audience` (
  `singletonKey` varchar(32) NOT NULL DEFAULT 'primary',
  `segmentId` varchar(255) NULL,
  `updatedById` int NULL,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`singletonKey`)
);
