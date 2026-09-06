-- SavvyOS MCP now uses OAuth 2.1 exclusively. Removing this table revokes all
-- legacy static bearer keys and prevents them from being restored by a future migration.
DROP TABLE IF EXISTS `mcp_access_keys`;
