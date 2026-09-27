-- Meet the Team page: the people shown on /newsite/team, edited in
-- Website Studio > Team. The app creates this at startup
-- (server/websiteTeamSchema.ts), so running this by hand is not needed.
CREATE TABLE IF NOT EXISTS `website_team_members` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(160) NOT NULL,
  `title` varchar(160) NULL,
  `bio` text NULL,
  `imageUrl` text NULL,
  `email` varchar(320) NULL,
  `linkedinUrl` varchar(512) NULL,
  `status` enum('draft','published','archived') NOT NULL DEFAULT 'draft',
  `sortOrder` int NOT NULL DEFAULT 0,
  `updatedById` int NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `website_team_members_status_idx` (`status`, `sortOrder`)
);
