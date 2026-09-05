-- Read-only external MCP bearer keys. The plaintext secret is never stored.
CREATE TABLE IF NOT EXISTS `mcp_access_keys` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `keyPrefix` varchar(32) NOT NULL,
  `secretHash` varchar(128) NOT NULL,
  `createdById` int NULL,
  `revokedAt` timestamp NULL,
  `revokedById` int NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `mcp_access_keys_secretHash_unique` (`secretHash`),
  KEY `mcp_access_keys_active_idx` (`revokedAt`, `createdAt`),
  KEY `mcp_access_keys_created_by_idx` (`createdById`),
  CONSTRAINT `mcp_access_keys_created_by_fk`
    FOREIGN KEY (`createdById`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `mcp_access_keys_revoked_by_fk`
    FOREIGN KEY (`revokedById`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
