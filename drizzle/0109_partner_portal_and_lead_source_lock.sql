-- Partner Portal configuration and passwordless access tokens.
ALTER TABLE `lead_sources`
  ADD COLUMN `allowPartnerPortal` boolean NOT NULL DEFAULT false AFTER `requireAgreementForSubSources`,
  ADD COLUMN `partnerPortalEmail` varchar(320) NULL AFTER `allowPartnerPortal`;
--> statement-breakpoint
CREATE TABLE `partner_portal_magic_links` (
  `id` int AUTO_INCREMENT NOT NULL,
  `email` varchar(320) NOT NULL,
  `tokenHash` varchar(64) NOT NULL,
  `expiresAt` timestamp NOT NULL,
  `usedAt` timestamp NULL,
  `requestedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `partner_portal_magic_links_id` PRIMARY KEY(`id`),
  CONSTRAINT `partner_portal_magic_links_token_hash_unique` UNIQUE(`tokenHash`),
  INDEX `partner_portal_magic_links_email_requested_idx` (`email`, `requestedAt`)
);
--> statement-breakpoint
-- A contact's original lead-source attribution is immutable after creation.
-- This database trigger is deliberately the final backstop for raw writes,
-- webhook retries, integrations, and any future application path.
DROP TRIGGER IF EXISTS `contacts_preserve_lead_source`;
--> statement-breakpoint
CREATE TRIGGER `contacts_preserve_lead_source`
BEFORE UPDATE ON `contacts`
FOR EACH ROW
  SET NEW.`leadSourceId` = OLD.`leadSourceId`;
