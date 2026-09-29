-- Forwarding for links to home.savvy-agents.com/newsite once the site moves.
-- One row; no row means off. The app creates this at startup
-- (server/websiteLinkForwardingSchema.ts), so running this by hand is not
-- needed.
CREATE TABLE IF NOT EXISTS `website_link_forwarding` (
  `id` int NOT NULL AUTO_INCREMENT,
  `singletonKey` varchar(64) NOT NULL DEFAULT 'primary',
  `enabled` tinyint(1) NOT NULL DEFAULT 0,
  `targetOrigin` varchar(255) NULL,
  `keepBasePath` tinyint(1) NOT NULL DEFAULT 0,
  `updatedById` int NULL,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `website_link_forwarding_singletonKey_unique` (`singletonKey`)
);
