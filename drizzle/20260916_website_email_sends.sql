-- A log of daily property emails sent to investor accounts.
--
-- Separate from the preferences row on purpose. "When were they last emailed"
-- and "what do they want" are different facts, and keeping the send time on
-- the preferences row would mean editing your budget looks like having been
-- emailed, which would silently skip someone's next email.

CREATE TABLE IF NOT EXISTS `website_account_email_sends` (
  `id` int NOT NULL AUTO_INCREMENT,
  `accountId` int NOT NULL,
  `listingCount` int NOT NULL DEFAULT 0,
  `sentAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `website_account_email_sends_account_idx` (`accountId`, `sentAt`),
  CONSTRAINT `website_account_email_sends_account_fk`
    FOREIGN KEY (`accountId`) REFERENCES `website_accounts` (`id`) ON DELETE CASCADE
);
