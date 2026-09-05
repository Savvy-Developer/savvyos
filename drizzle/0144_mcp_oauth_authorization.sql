-- OAuth 2.1 state for ChatGPT, Claude, and other standards-compliant remote MCP clients.
-- Secrets are represented only by SHA-256 digests; raw authorization codes and
-- access/refresh tokens are generated once and never persisted in plaintext.
CREATE TABLE IF NOT EXISTS `mcp_oauth_clients` (
  `clientId` varchar(255) NOT NULL,
  `metadata` json NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`clientId`),
  KEY `mcp_oauth_clients_created_idx` (`createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `mcp_oauth_authorization_requests` (
  `id` int NOT NULL AUTO_INCREMENT,
  `requestHash` varchar(128) NOT NULL,
  `clientId` varchar(255) NOT NULL,
  `redirectUri` text NOT NULL,
  `state` text NULL,
  `codeChallenge` varchar(255) NOT NULL,
  `scopes` json NOT NULL,
  `resource` varchar(512) NOT NULL,
  `expiresAt` timestamp NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `mcp_oauth_authorization_requests_requestHash_unique` (`requestHash`),
  KEY `mcp_oauth_authorization_requests_expiry_idx` (`expiresAt`),
  KEY `mcp_oauth_authorization_requests_client_idx` (`clientId`),
  CONSTRAINT `mcp_oauth_authorization_requests_client_fk`
    FOREIGN KEY (`clientId`) REFERENCES `mcp_oauth_clients` (`clientId`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `mcp_oauth_authorization_codes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `codeHash` varchar(128) NOT NULL,
  `clientId` varchar(255) NOT NULL,
  `userId` int NOT NULL,
  `redirectUri` text NOT NULL,
  `codeChallenge` varchar(255) NOT NULL,
  `scopes` json NOT NULL,
  `resource` varchar(512) NOT NULL,
  `expiresAt` timestamp NOT NULL,
  `consumedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `mcp_oauth_authorization_codes_codeHash_unique` (`codeHash`),
  KEY `mcp_oauth_authorization_codes_expiry_idx` (`expiresAt`),
  KEY `mcp_oauth_authorization_codes_client_idx` (`clientId`),
  CONSTRAINT `mcp_oauth_authorization_codes_client_fk`
    FOREIGN KEY (`clientId`) REFERENCES `mcp_oauth_clients` (`clientId`) ON DELETE CASCADE,
  CONSTRAINT `mcp_oauth_authorization_codes_user_fk`
    FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `mcp_oauth_access_tokens` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tokenHash` varchar(128) NOT NULL,
  `clientId` varchar(255) NOT NULL,
  `userId` int NOT NULL,
  `scopes` json NOT NULL,
  `resource` varchar(512) NOT NULL,
  `expiresAt` timestamp NOT NULL,
  `revokedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `mcp_oauth_access_tokens_tokenHash_unique` (`tokenHash`),
  KEY `mcp_oauth_access_tokens_expiry_idx` (`expiresAt`),
  KEY `mcp_oauth_access_tokens_user_idx` (`userId`, `expiresAt`),
  CONSTRAINT `mcp_oauth_access_tokens_client_fk`
    FOREIGN KEY (`clientId`) REFERENCES `mcp_oauth_clients` (`clientId`) ON DELETE CASCADE,
  CONSTRAINT `mcp_oauth_access_tokens_user_fk`
    FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `mcp_oauth_refresh_tokens` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tokenHash` varchar(128) NOT NULL,
  `familyId` varchar(128) NOT NULL,
  `clientId` varchar(255) NOT NULL,
  `userId` int NOT NULL,
  `scopes` json NOT NULL,
  `resource` varchar(512) NOT NULL,
  `expiresAt` timestamp NOT NULL,
  `revokedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `mcp_oauth_refresh_tokens_tokenHash_unique` (`tokenHash`),
  KEY `mcp_oauth_refresh_tokens_family_idx` (`familyId`),
  KEY `mcp_oauth_refresh_tokens_expiry_idx` (`expiresAt`),
  KEY `mcp_oauth_refresh_tokens_user_idx` (`userId`, `expiresAt`),
  CONSTRAINT `mcp_oauth_refresh_tokens_client_fk`
    FOREIGN KEY (`clientId`) REFERENCES `mcp_oauth_clients` (`clientId`) ON DELETE CASCADE,
  CONSTRAINT `mcp_oauth_refresh_tokens_user_fk`
    FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
