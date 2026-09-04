CREATE TABLE IF NOT EXISTS `market_match_settings` (
  `id` int NOT NULL DEFAULT 1,
  `enabled` boolean NOT NULL DEFAULT true,
  `maxRecommendedMarkets` int NOT NULL DEFAULT 5,
  `updatedById` int NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `market_match_settings_updated_by_fk`
    FOREIGN KEY (`updatedById`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `market_match_settings_singleton_ck` CHECK (`id` = 1),
  CONSTRAINT `market_match_settings_max_recommendations_ck`
    CHECK (`maxRecommendedMarkets` BETWEEN 3 AND 5)
) ENGINE=InnoDB;

INSERT INTO `market_match_settings` (`id`, `enabled`, `maxRecommendedMarkets`)
VALUES (1, true, 5)
ON DUPLICATE KEY UPDATE `id` = `id`;
