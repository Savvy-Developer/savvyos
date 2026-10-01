-- MLS Properties: preserve malformed provider rows for bounded replay instead of pinning the full feed.
-- server/mls/schema.ts applies the same CREATE TABLE IF NOT EXISTS at startup.
CREATE TABLE IF NOT EXISTS `mls_import_exceptions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `feedId` int NOT NULL,
  `resource` varchar(32) NOT NULL,
  `providerKey` varchar(160) NOT NULL,
  `payloadGzip` mediumblob NOT NULL,
  `sourceModifiedAt` datetime(3) DEFAULT NULL,
  `errorCode` varchar(64) NOT NULL,
  `errorColumn` varchar(64) DEFAULT NULL,
  `attempts` int NOT NULL DEFAULT '1',
  `firstSeenAt` datetime NOT NULL,
  `lastSeenAt` datetime NOT NULL,
  `nextRetryAt` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `mls_import_exceptions_feed_resource_key_uq` (`feedId`,`resource`,`providerKey`),
  KEY `mls_import_exceptions_retry_idx` (`feedId`,`nextRetryAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
