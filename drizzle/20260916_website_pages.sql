-- Editable content pages for the public website.
--
-- The designed pages (About, Contact and so on) stay in code: they are layouts
-- with icons, stat bands and grids, not text in a box, and pretending a
-- textarea can edit them would be a worse lie than leaving them alone. This
-- table is for pages that genuinely are words on a page, starting with the
-- ones that do not exist yet.
--
-- A page only appears publicly when status is 'published', which is the same
-- rule the rest of the site already uses.

CREATE TABLE IF NOT EXISTS `website_pages` (
  `id` int NOT NULL AUTO_INCREMENT,
  `slug` varchar(255) NOT NULL,
  `name` varchar(160) NOT NULL,
  `status` enum('draft','published','archived') NOT NULL DEFAULT 'draft',
  `heroEyebrow` varchar(160) NULL,
  `heroTitle` varchar(255) NULL,
  `heroSubtitle` text NULL,
  `bodyMarkdown` mediumtext NULL,
  `ctaText` varchar(160) NULL,
  `ctaHref` varchar(512) NULL,
  `metaTitle` varchar(255) NULL,
  `metaDescription` text NULL,
  `sortOrder` int NOT NULL DEFAULT 0,
  `publishedAt` timestamp NULL,
  `createdById` int NULL,
  `updatedById` int NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `website_pages_slug_unique` (`slug`),
  KEY `website_pages_status_idx` (`status`, `sortOrder`)
);
