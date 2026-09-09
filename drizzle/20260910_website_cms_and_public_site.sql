-- Savvy public website CMS. The existing properties table remains the canonical
-- property record shared by transactions, listings, pro-formas, contacts, and the
-- staged public website. All CMS permissions default OFF for administrators;
-- Tyler's protected synthetic permission set remains all-true.
ALTER TABLE `admin_permissions`
  ADD COLUMN `canViewWebsite` boolean NOT NULL DEFAULT false,
  ADD COLUMN `canManageWebsiteProperties` boolean NOT NULL DEFAULT false,
  ADD COLUMN `canManageWebsiteAgents` boolean NOT NULL DEFAULT false,
  ADD COLUMN `canManageWebsiteCaseStudies` boolean NOT NULL DEFAULT false,
  ADD COLUMN `canManageWebsiteBlog` boolean NOT NULL DEFAULT false,
  ADD COLUMN `canManageWebsiteSettings` boolean NOT NULL DEFAULT false,
  ADD COLUMN `canViewWebsiteLeads` boolean NOT NULL DEFAULT false;

CREATE TABLE `website_properties` (
  `id` int AUTO_INCREMENT NOT NULL,
  `propertyId` int NOT NULL,
  `slug` varchar(255) NOT NULL,
  `status` enum('draft','published','archived') NOT NULL DEFAULT 'draft',
  `sourceUrl` text NULL,
  `sourceProformaId` int NULL,
  `assignedAgentId` int NULL,
  `headline` varchar(512) NULL,
  `summary` text NULL,
  `heroImageUrl` text NULL,
  `galleryImageUrls` json NOT NULL,
  `featureTags` json NOT NULL,
  `investmentHighlights` json NOT NULL,
  `projectedRevenue` decimal(12,2) NULL,
  `cashOnCash` decimal(8,4) NULL,
  `capRate` decimal(8,4) NULL,
  `occupancyRate` decimal(8,4) NULL,
  `averageDailyRate` decimal(10,2) NULL,
  `regulationSummary` text NULL,
  `callToActionText` varchar(255) NOT NULL DEFAULT 'Request the full investment analysis',
  `metaTitle` varchar(255) NULL,
  `metaDescription` text NULL,
  `importedData` json NULL,
  `isFeatured` boolean NOT NULL DEFAULT false,
  `sortOrder` int NOT NULL DEFAULT 0,
  `publishedAt` timestamp NULL,
  `createdById` int NULL,
  `updatedById` int NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `website_properties_property_unique` (`propertyId`),
  UNIQUE KEY `website_properties_slug_unique` (`slug`),
  KEY `website_properties_status_featured_idx` (`status`,`isFeatured`,`sortOrder`),
  KEY `website_properties_agent_idx` (`assignedAgentId`),
  CONSTRAINT `website_properties_property_fk` FOREIGN KEY (`propertyId`) REFERENCES `properties` (`id`) ON DELETE CASCADE,
  CONSTRAINT `website_properties_proforma_fk` FOREIGN KEY (`sourceProformaId`) REFERENCES `proformas` (`id`) ON DELETE SET NULL,
  CONSTRAINT `website_properties_agent_fk` FOREIGN KEY (`assignedAgentId`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `website_properties_created_by_fk` FOREIGN KEY (`createdById`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `website_properties_updated_by_fk` FOREIGN KEY (`updatedById`) REFERENCES `users` (`id`) ON DELETE SET NULL
);

CREATE TABLE `website_case_studies` (
  `id` int AUTO_INCREMENT NOT NULL,
  `slug` varchar(255) NOT NULL,
  `title` varchar(512) NOT NULL,
  `eyebrow` varchar(255) NULL,
  `excerpt` text NULL,
  `body` mediumtext NULL,
  `heroImageUrl` text NULL,
  `propertyId` int NULL,
  `agentUserId` int NULL,
  `primaryMetricLabel` varchar(128) NULL,
  `primaryMetricValue` varchar(128) NULL,
  `secondaryMetricLabel` varchar(128) NULL,
  `secondaryMetricValue` varchar(128) NULL,
  `status` enum('draft','published','archived') NOT NULL DEFAULT 'draft',
  `isFeatured` boolean NOT NULL DEFAULT false,
  `sortOrder` int NOT NULL DEFAULT 0,
  `publishedAt` timestamp NULL,
  `createdById` int NULL,
  `updatedById` int NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `website_case_studies_slug_unique` (`slug`),
  KEY `website_case_studies_status_featured_idx` (`status`,`isFeatured`,`sortOrder`),
  CONSTRAINT `website_case_studies_property_fk` FOREIGN KEY (`propertyId`) REFERENCES `properties` (`id`) ON DELETE SET NULL,
  CONSTRAINT `website_case_studies_agent_fk` FOREIGN KEY (`agentUserId`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `website_case_studies_created_by_fk` FOREIGN KEY (`createdById`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `website_case_studies_updated_by_fk` FOREIGN KEY (`updatedById`) REFERENCES `users` (`id`) ON DELETE SET NULL
);

CREATE TABLE `website_blog_posts` (
  `id` int AUTO_INCREMENT NOT NULL,
  `slug` varchar(255) NOT NULL,
  `title` varchar(512) NOT NULL,
  `excerpt` text NULL,
  `body` mediumtext NULL,
  `coverImageUrl` text NULL,
  `category` varchar(128) NULL DEFAULT 'STR Investing',
  `authorUserId` int NULL,
  `status` enum('draft','published','archived') NOT NULL DEFAULT 'draft',
  `isFeatured` boolean NOT NULL DEFAULT false,
  `sortOrder` int NOT NULL DEFAULT 0,
  `publishedAt` timestamp NULL,
  `metaTitle` varchar(255) NULL,
  `metaDescription` text NULL,
  `createdById` int NULL,
  `updatedById` int NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `website_blog_posts_slug_unique` (`slug`),
  KEY `website_blog_posts_status_published_idx` (`status`,`publishedAt`),
  CONSTRAINT `website_blog_posts_author_fk` FOREIGN KEY (`authorUserId`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `website_blog_posts_created_by_fk` FOREIGN KEY (`createdById`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `website_blog_posts_updated_by_fk` FOREIGN KEY (`updatedById`) REFERENCES `users` (`id`) ON DELETE SET NULL
);

CREATE TABLE `website_agent_profiles` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `slug` varchar(255) NOT NULL,
  `headline` varchar(512) NULL,
  `shortBio` text NULL,
  `markets` json NOT NULL,
  `specialties` json NOT NULL,
  `imageUrl` text NULL,
  `publicEmail` varchar(320) NULL,
  `publicPhone` varchar(64) NULL,
  `bookingUrl` text NULL,
  `status` enum('draft','published','archived') NOT NULL DEFAULT 'draft',
  `isFeatured` boolean NOT NULL DEFAULT false,
  `sortOrder` int NOT NULL DEFAULT 0,
  `publishedAt` timestamp NULL,
  `createdById` int NULL,
  `updatedById` int NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `website_agent_profiles_user_unique` (`userId`),
  UNIQUE KEY `website_agent_profiles_slug_unique` (`slug`),
  KEY `website_agent_profiles_status_featured_idx` (`status`,`isFeatured`,`sortOrder`),
  CONSTRAINT `website_agent_profiles_user_fk` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `website_agent_profiles_created_by_fk` FOREIGN KEY (`createdById`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `website_agent_profiles_updated_by_fk` FOREIGN KEY (`updatedById`) REFERENCES `users` (`id`) ON DELETE SET NULL
);

CREATE TABLE `website_site_settings` (
  `id` int AUTO_INCREMENT NOT NULL,
  `singletonKey` varchar(64) NOT NULL DEFAULT 'primary',
  `siteName` varchar(255) NOT NULL DEFAULT 'Savvy STR Agents',
  `announcementText` varchar(512) NULL,
  `heroEyebrow` varchar(255) NULL,
  `heroTitle` varchar(512) NOT NULL,
  `heroBody` text NULL,
  `heroImageUrl` text NULL,
  `stats` json NOT NULL,
  `testimonials` json NOT NULL,
  `contactEmail` varchar(320) NULL,
  `contactPhone` varchar(64) NULL,
  `footerText` text NULL,
  `updatedById` int NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `website_site_settings_singleton_unique` (`singletonKey`),
  CONSTRAINT `website_site_settings_updated_by_fk` FOREIGN KEY (`updatedById`) REFERENCES `users` (`id`) ON DELETE SET NULL
);

CREATE TABLE `website_leads` (
  `id` int AUTO_INCREMENT NOT NULL,
  `contactId` int NULL,
  `propertyId` int NULL,
  `agentUserId` int NULL,
  `firstName` varchar(128) NOT NULL,
  `lastName` varchar(128) NOT NULL,
  `email` varchar(320) NOT NULL,
  `phone` varchar(64) NULL,
  `intent` enum('buy','sell','property','agent','general') NOT NULL DEFAULT 'general',
  `message` text NULL,
  `sourcePath` varchar(512) NULL,
  `attribution` json NULL,
  `status` enum('new','contacted','qualified','closed') NOT NULL DEFAULT 'new',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `website_leads_status_created_idx` (`status`,`createdAt`),
  KEY `website_leads_property_idx` (`propertyId`),
  KEY `website_leads_agent_idx` (`agentUserId`),
  CONSTRAINT `website_leads_contact_fk` FOREIGN KEY (`contactId`) REFERENCES `contacts` (`id`) ON DELETE SET NULL,
  CONSTRAINT `website_leads_property_fk` FOREIGN KEY (`propertyId`) REFERENCES `properties` (`id`) ON DELETE SET NULL,
  CONSTRAINT `website_leads_agent_fk` FOREIGN KEY (`agentUserId`) REFERENCES `users` (`id`) ON DELETE SET NULL
);

CREATE TABLE `website_lead_attempts` (
  `id` int AUTO_INCREMENT NOT NULL,
  `ipHash` varchar(64) NOT NULL,
  `emailHash` varchar(64) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `website_lead_attempts_ip_created_idx` (`ipHash`,`createdAt`),
  KEY `website_lead_attempts_email_created_idx` (`emailHash`,`createdAt`),
  KEY `website_lead_attempts_created_idx` (`createdAt`)
);

-- Seed the current public site's featured inventory into the shared property
-- graph only when an equivalent canonical property does not already exist.
INSERT INTO `properties` (`address`,`normalizedAddress`,`city`,`state`,`beds`,`baths`,`sqft`,`propertyType`,`listPrice`,`strNotes`,`addedByUserId`)
SELECT '608 Touchstone Circle','608 touchstone circle port orange fl','Port Orange','FL',3,2,1486,'vacation_rental',371500,'Current Savvy public website featured property.',1
WHERE NOT EXISTS (SELECT 1 FROM `properties` WHERE LOWER(`address`)='608 touchstone circle' AND LOWER(`city`)='port orange');
INSERT INTO `properties` (`address`,`normalizedAddress`,`city`,`state`,`beds`,`baths`,`sqft`,`propertyType`,`listPrice`,`strNotes`,`addedByUserId`)
SELECT '3 Old Marina Drive','3 old marina drive ocean isle beach nc','Ocean Isle Beach','NC',5,5,1989,'vacation_rental',1450000,'Current Savvy public website featured property.',1
WHERE NOT EXISTS (SELECT 1 FROM `properties` WHERE LOWER(`address`)='3 old marina drive' AND LOWER(`city`)='ocean isle beach');
INSERT INTO `properties` (`address`,`normalizedAddress`,`city`,`state`,`beds`,`baths`,`sqft`,`propertyType`,`listPrice`,`strNotes`,`addedByUserId`)
SELECT '337 NE 41st Street','337 northeast 41st street oak island nc','Oak Island','NC',3,2,1853,'vacation_rental',730000,'Current Savvy public website featured property.',1
WHERE NOT EXISTS (SELECT 1 FROM `properties` WHERE LOWER(`address`) IN ('337 ne 41st street','337 ne 41st st') AND LOWER(`city`)='oak island');
INSERT INTO `properties` (`address`,`normalizedAddress`,`city`,`state`,`beds`,`baths`,`sqft`,`propertyType`,`listPrice`,`strNotes`,`addedByUserId`)
SELECT '200 Park Charles Boulevard S','200 park charles boulevard south saint peters mo','Saint Peters','MO',5,4,3438,'vacation_rental',439000,'Current Savvy public website featured property.',1
WHERE NOT EXISTS (SELECT 1 FROM `properties` WHERE LOWER(`address`) IN ('200 park charles boulevard s','200 park charles blvd s') AND LOWER(`city`)='saint peters');
INSERT INTO `properties` (`address`,`normalizedAddress`,`city`,`state`,`beds`,`baths`,`sqft`,`propertyType`,`listPrice`,`strNotes`,`addedByUserId`)
SELECT '22 Saint Mark Drive','22 saint mark drive saint peters mo','Saint Peters','MO',3,3,2160,'vacation_rental',300000,'Current Savvy public website featured property.',1
WHERE NOT EXISTS (SELECT 1 FROM `properties` WHERE LOWER(`address`) IN ('22 saint mark drive','22 saint mark dr') AND LOWER(`city`)='saint peters');
INSERT INTO `properties` (`address`,`normalizedAddress`,`city`,`state`,`beds`,`baths`,`sqft`,`propertyType`,`listPrice`,`strNotes`,`addedByUserId`)
SELECT '581 10th Street','581 10th street key colony beach fl','Key Colony Beach','FL',6,4,3248,'vacation_rental',2499000,'Current Savvy public website featured property.',1
WHERE NOT EXISTS (SELECT 1 FROM `properties` WHERE LOWER(`address`) IN ('581 10th street','581 10th st') AND LOWER(`city`)='key colony beach');

INSERT IGNORE INTO `website_site_settings` (`singletonKey`,`siteName`,`announcementText`,`heroEyebrow`,`heroTitle`,`heroBody`,`heroImageUrl`,`stats`,`testimonials`,`contactEmail`,`contactPhone`,`footerText`,`updatedById`)
VALUES (
  'primary',
  'Savvy STR Agents',
  'Purpose-built representation for short-term rental investors',
  'The STR investment brokerage',
  'Short-Term Rental Properties for Sale — Built for STR Investors',
  'Browse investment properties with a real operator’s lens. Savvy agents combine local market knowledge, property-level analysis, and specialized representation from search through closing.',
  'https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=2200&q=86',
  JSON_ARRAY(JSON_OBJECT('value','1,000+','label','Investment Properties'),JSON_OBJECT('value','25%','label','Avg. Cash-on-Cash'),JSON_OBJECT('value','57','label','Expert Agents'),JSON_OBJECT('value','57','label','Active Markets')),
  JSON_ARRAY(
    JSON_OBJECT('quote','Savvy brought the market knowledge, underwriting discipline, and steady guidance we needed to buy with confidence.','name','Savvy STR Investor','role','Portfolio buyer'),
    JSON_OBJECT('quote','The team stayed involved long after closing and connected us with the right local operators and vendors.','name','Savvy STR Client','role','First-time STR owner'),
    JSON_OBJECT('quote','We could see the difference between a general real estate agent and a true short-term-rental specialist.','name','Savvy STR Investor','role','Repeat client')
  ),
  'hello@savvy.realty',
  '(828) 407-1705',
  'Specialized real estate representation for short-term rental investors.',
  1
)
ON DUPLICATE KEY UPDATE `siteName`=VALUES(`siteName`);

INSERT IGNORE INTO `website_properties` (`propertyId`,`slug`,`status`,`assignedAgentId`,`headline`,`summary`,`heroImageUrl`,`galleryImageUrls`,`featureTags`,`investmentHighlights`,`regulationSummary`,`isFeatured`,`sortOrder`,`publishedAt`,`createdById`,`updatedById`)
SELECT p.id,'608-touchstone-circle-port-orange','published',u.id,'Turnkey Florida STR with resort-style amenities','A polished Port Orange opportunity with the space and amenities vacation-rental guests search for.','https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1600&q=82',JSON_ARRAY('https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1600&q=82'),JSON_ARRAY('Luxury','Hot Tub','Pool','Game Room'),JSON_ARRAY('Strong amenity package','Drive-to Florida demand','Savvy investment analysis available'),'Verify property-specific rules, permits, and operating requirements during diligence.',true,10,NOW(),1,1 FROM properties p LEFT JOIN users u ON TRIM(u.name)='Ana Estevez' WHERE LOWER(p.address)='608 touchstone circle' LIMIT 1;
INSERT IGNORE INTO `website_properties` (`propertyId`,`slug`,`status`,`assignedAgentId`,`headline`,`summary`,`heroImageUrl`,`galleryImageUrls`,`featureTags`,`investmentHighlights`,`regulationSummary`,`isFeatured`,`sortOrder`,`publishedAt`,`createdById`,`updatedById`)
SELECT p.id,'3-old-marina-drive-ocean-isle-beach','published',u.id,'Coastal luxury near the water in Ocean Isle Beach','A five-bedroom coastal property positioned for families and groups seeking a premium beach stay.','https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1600&q=82',JSON_ARRAY('https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1600&q=82'),JSON_ARRAY('Luxury','Pool','Water View'),JSON_ARRAY('Five-bedroom guest capacity','Coastal leisure market','Savvy investment analysis available'),'Verify Brunswick County and municipal STR rules for the property before purchase.',true,20,NOW(),1,1 FROM properties p LEFT JOIN users u ON TRIM(u.name)='Dawn Wagner' WHERE LOWER(p.address)='3 old marina drive' LIMIT 1;
INSERT IGNORE INTO `website_properties` (`propertyId`,`slug`,`status`,`assignedAgentId`,`headline`,`summary`,`heroImageUrl`,`galleryImageUrls`,`featureTags`,`investmentHighlights`,`regulationSummary`,`isFeatured`,`sortOrder`,`publishedAt`,`createdById`,`updatedById`)
SELECT p.id,'337-ne-41st-street-oak-island','published',u.id,'Family-friendly Oak Island beach investment','A well-sized coastal home with water views and a layout designed for memorable group stays.','https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=1600&q=82',JSON_ARRAY('https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=1600&q=82'),JSON_ARRAY('Family-friendly','Water View','Beach Market'),JSON_ARRAY('Established vacation market','Flexible three-bedroom layout','Local STR-specialist representation'),'Confirm current Oak Island zoning, parking, occupancy, and permit requirements during diligence.',true,30,NOW(),1,1 FROM properties p LEFT JOIN users u ON TRIM(u.name)='Dawn Wagner' WHERE LOWER(p.address) IN ('337 ne 41st street','337 ne 41st st') LIMIT 1;
INSERT IGNORE INTO `website_properties` (`propertyId`,`slug`,`status`,`assignedAgentId`,`headline`,`summary`,`heroImageUrl`,`galleryImageUrls`,`featureTags`,`investmentHighlights`,`regulationSummary`,`isFeatured`,`sortOrder`,`publishedAt`,`createdById`,`updatedById`)
SELECT p.id,'200-park-charles-boulevard-saint-peters','published',u.id,'High-capacity Missouri STR with experience-forward amenities','Five bedrooms, four baths, and an amenity mix designed to help larger groups choose this home.','https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1600&q=82',JSON_ARRAY('https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1600&q=82'),JSON_ARRAY('Family-friendly','Fire Pit','Sauna','Game Room'),JSON_ARRAY('Large-group configuration','Year-round amenity mix','Market-specific guidance available'),'Verify city and county rules, HOA terms, and all required approvals before operating.',true,40,NOW(),1,1 FROM properties p LEFT JOIN users u ON TRIM(u.name)='Cole Lema' WHERE LOWER(p.address) IN ('200 park charles boulevard s','200 park charles blvd s') LIMIT 1;
INSERT IGNORE INTO `website_properties` (`propertyId`,`slug`,`status`,`assignedAgentId`,`headline`,`summary`,`heroImageUrl`,`galleryImageUrls`,`featureTags`,`investmentHighlights`,`regulationSummary`,`isFeatured`,`sortOrder`,`publishedAt`,`createdById`,`updatedById`)
SELECT p.id,'22-saint-mark-drive-saint-peters','published',u.id,'Accessible entry point with a standout amenity plan','A three-bedroom opportunity where the right design, game room, sauna, and outdoor experience can create differentiation.','https://images.unsplash.com/photo-1600585152915-d208bec867a1?auto=format&fit=crop&w=1600&q=82',JSON_ARRAY('https://images.unsplash.com/photo-1600585152915-d208bec867a1?auto=format&fit=crop&w=1600&q=82'),JSON_ARRAY('Family-friendly','Fire Pit','Sauna','Game Room'),JSON_ARRAY('Approachable acquisition price','Amenity-driven positioning','Detailed diligence support'),'Confirm city and county rules, HOA terms, and all required approvals before operating.',true,50,NOW(),1,1 FROM properties p LEFT JOIN users u ON TRIM(u.name)='Cole Lema' WHERE LOWER(p.address) IN ('22 saint mark drive','22 saint mark dr') LIMIT 1;
INSERT IGNORE INTO `website_properties` (`propertyId`,`slug`,`status`,`assignedAgentId`,`headline`,`summary`,`heroImageUrl`,`galleryImageUrls`,`featureTags`,`investmentHighlights`,`regulationSummary`,`isFeatured`,`sortOrder`,`publishedAt`,`createdById`,`updatedById`)
SELECT p.id,'581-10th-street-key-colony-beach','published',u.id,'A six-bedroom Florida Keys waterfront investment','A premium waterfront home with the scale, pool, hot tub, and boat access expected in the Florida Keys.','https://images.unsplash.com/photo-1494526585095-c41746248156?auto=format&fit=crop&w=1600&q=82',JSON_ARRAY('https://images.unsplash.com/photo-1494526585095-c41746248156?auto=format&fit=crop&w=1600&q=82'),JSON_ARRAY('Waterfront','Pool','Hot Tub','Boat Dock'),JSON_ARRAY('Premium waterfront positioning','Six-bedroom guest capacity','Florida Keys specialist support'),'Verify municipal licensing, occupancy, dock, insurance, and flood requirements during diligence.',true,60,NOW(),1,1 FROM properties p LEFT JOIN users u ON TRIM(u.name)='Mollie Dawson' WHERE LOWER(p.address) IN ('581 10th street','581 10th st') LIMIT 1;

INSERT IGNORE INTO `website_agent_profiles` (`userId`,`slug`,`headline`,`shortBio`,`markets`,`specialties`,`imageUrl`,`publicEmail`,`publicPhone`,`bookingUrl`,`status`,`isFeatured`,`sortOrder`,`publishedAt`,`createdById`,`updatedById`)
SELECT u.id,'ana-estevez','Florida STR acquisitions with an investor-first lens',COALESCE(NULLIF(TRIM(BOTH '\"' FROM ap.bio),''),'Florida-based Realtor specializing in strategic short-term rental acquisitions.'),JSON_ARRAY('Northeast Florida','Central Florida','Port Orange'),JSON_ARRAY('STR acquisitions','Luxury residential','Value-add strategy'),up.profilePhotoUrl,u.email,up.primaryPhone,u.callBookingLink,'published',true,10,NOW(),1,1 FROM users u LEFT JOIN user_profiles up ON up.userId=u.id LEFT JOIN agent_profiles ap ON ap.userId=u.id WHERE TRIM(u.name)='Ana Estevez' LIMIT 1;
INSERT IGNORE INTO `website_agent_profiles` (`userId`,`slug`,`headline`,`shortBio`,`markets`,`specialties`,`imageUrl`,`publicEmail`,`publicPhone`,`bookingUrl`,`status`,`isFeatured`,`sortOrder`,`publishedAt`,`createdById`,`updatedById`)
SELECT u.id,'dawn-wagner','Hospitality-first STR guidance for the Carolina coast',COALESCE(NULLIF(TRIM(BOTH '\"' FROM ap.bio),''),'Brunswick County STR specialist with deep hospitality and business ownership experience.'),JSON_ARRAY('Oak Island','Ocean Isle Beach','Brunswick County'),JSON_ARRAY('Coastal STRs','Hospitality operations','Investor community'),up.profilePhotoUrl,u.email,up.primaryPhone,u.callBookingLink,'published',true,20,NOW(),1,1 FROM users u LEFT JOIN user_profiles up ON up.userId=u.id LEFT JOIN agent_profiles ap ON ap.userId=u.id WHERE TRIM(u.name)='Dawn Wagner' LIMIT 1;
INSERT IGNORE INTO `website_agent_profiles` (`userId`,`slug`,`headline`,`shortBio`,`markets`,`specialties`,`imageUrl`,`publicEmail`,`publicPhone`,`bookingUrl`,`status`,`isFeatured`,`sortOrder`,`publishedAt`,`createdById`,`updatedById`)
SELECT u.id,'jeremy-levine','Cape Cod investment analysis backed by development experience',COALESCE(NULLIF(TRIM(BOTH '\"' FROM ap.bio),''),'Cape Cod STR specialist combining development experience, finance, and hospitality operations.'),JSON_ARRAY('Cape Cod','Massachusetts'),JSON_ARRAY('Value-add opportunities','Investment analysis','Vacation rentals'),up.profilePhotoUrl,u.email,up.primaryPhone,u.callBookingLink,'published',true,30,NOW(),1,1 FROM users u LEFT JOIN user_profiles up ON up.userId=u.id LEFT JOIN agent_profiles ap ON ap.userId=u.id WHERE TRIM(u.name)='Jeremy Levine' LIMIT 1;
INSERT IGNORE INTO `website_agent_profiles` (`userId`,`slug`,`headline`,`shortBio`,`markets`,`specialties`,`imageUrl`,`publicEmail`,`publicPhone`,`bookingUrl`,`status`,`isFeatured`,`sortOrder`,`publishedAt`,`createdById`,`updatedById`)
SELECT u.id,'mollie-dawson','Florida Keys real estate guidance for STR investors',COALESCE(NULLIF(TRIM(BOTH '\"' FROM ap.bio),''),'Helping buyers evaluate and acquire vacation-rental opportunities in the Florida Keys.'),JSON_ARRAY('Florida Keys','Key Colony Beach'),JSON_ARRAY('Waterfront homes','Luxury STRs','Investor representation'),up.profilePhotoUrl,u.email,up.primaryPhone,u.callBookingLink,'published',true,40,NOW(),1,1 FROM users u LEFT JOIN user_profiles up ON up.userId=u.id LEFT JOIN agent_profiles ap ON ap.userId=u.id WHERE TRIM(u.name)='Mollie Dawson' LIMIT 1;

INSERT IGNORE INTO `website_case_studies` (`slug`,`title`,`eyebrow`,`excerpt`,`body`,`heroImageUrl`,`agentUserId`,`primaryMetricLabel`,`primaryMetricValue`,`secondaryMetricLabel`,`secondaryMetricValue`,`status`,`isFeatured`,`sortOrder`,`publishedAt`,`createdById`,`updatedById`)
SELECT 'first-str-with-a-specialist','From first-time buyer to confident STR owner','Investor story','A new investor found the right Florida property with local guidance, honest underwriting, and support that continued after closing.','The challenge\n\nBuying a first vacation rental can feel like learning a new business while making one of life’s largest purchases. The investor needed a property that worked for both the market and their personal goals.\n\nThe Savvy approach\n\nA local Savvy STR Agent helped narrow the market, pressure-test the property, coordinate a remote-friendly search, and connect the investor with trusted local resources.\n\nThe outcome\n\nThe client reached closing with a clearer plan for launch and an ongoing relationship with an agent who remained available after the transaction.','https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1600&q=82',u.id,'Investor stage','First STR','Support','Through launch','published',true,10,NOW(),1,1 FROM users u WHERE TRIM(u.name)='Ana Estevez' LIMIT 1;
INSERT IGNORE INTO `website_case_studies` (`slug`,`title`,`eyebrow`,`excerpt`,`body`,`heroImageUrl`,`agentUserId`,`primaryMetricLabel`,`primaryMetricValue`,`secondaryMetricLabel`,`secondaryMetricValue`,`status`,`isFeatured`,`sortOrder`,`publishedAt`,`createdById`,`updatedById`)
SELECT 'building-an-asheville-portfolio','A specialist relationship that grew into an Asheville portfolio','Portfolio story','What began with one acquisition became a repeat relationship built on trust, market fluency, and consistent execution.','The challenge\n\nRepeat investors need more than access to listings. They need an advisor who remembers the strategy, recognizes what has changed, and can move decisively when the right opportunity appears.\n\nThe Savvy approach\n\nThe same Savvy relationship supported multiple Asheville-area purchases, with each search informed by the investor’s operating history and evolving goals.\n\nThe outcome\n\nThree completed purchases and a long-term advisory relationship show the value of continuity in an STR portfolio.','https://images.unsplash.com/photo-1523217582562-09d0def993a6?auto=format&fit=crop&w=1600&q=82',u.id,'Properties purchased','3','Relationship','Repeat client','published',true,20,NOW(),1,1 FROM users u WHERE u.id=1 LIMIT 1;
INSERT IGNORE INTO `website_case_studies` (`slug`,`title`,`eyebrow`,`excerpt`,`body`,`heroImageUrl`,`agentUserId`,`primaryMetricLabel`,`primaryMetricValue`,`secondaryMetricLabel`,`secondaryMetricValue`,`status`,`isFeatured`,`sortOrder`,`publishedAt`,`createdById`,`updatedById`)
SELECT 'remote-purchase-hot-market','Winning a remote purchase in a competitive market','Execution story','Fast video, clear communication, and local relationships helped an out-of-market investor act with confidence.','The challenge\n\nThe investor could not tour every candidate in person, but the local market demanded quick decisions.\n\nThe Savvy approach\n\nThe agent provided detailed property video, responsive guidance, and a coordinated process that let the buyer evaluate risk without being physically present.\n\nThe outcome\n\nThe investor secured a property in a competitive situation while maintaining a clear, evidence-led decision process.','https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1600&q=82',u.id,'Purchase mode','Remote','Market','Competitive','published',true,30,NOW(),1,1 FROM users u WHERE TRIM(u.name)='Eric Edwards' LIMIT 1;

INSERT IGNORE INTO `website_blog_posts` (`slug`,`title`,`excerpt`,`body`,`coverImageUrl`,`category`,`authorUserId`,`status`,`isFeatured`,`sortOrder`,`publishedAt`,`createdById`,`updatedById`)
SELECT 'check-str-rules-before-you-fall-in-love','Check the STR Rules Before You Fall in Love With the House','The property can look perfect and still fail as an investment. Start with jurisdiction, zoning, permits, and operating constraints.','A beautiful house is not automatically a viable short-term rental. Before you model revenue or plan design, confirm the exact jurisdiction that governs the address. City, county, HOA, and deed restrictions can all affect whether and how the property may operate.\n\nAsk for the current ordinance, permit process, occupancy and parking limits, renewal requirements, and any transferability rules. Then validate those requirements against the specific parcel rather than relying on a map or an old listing description.\n\nSavvy agents help investors place this work at the beginning of diligence. That keeps emotion from outrunning the facts and gives the underwriting a realistic operating foundation.','https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=1600&q=82','Regulations',u.id,'published',true,10,NOW(),1,1 FROM users u WHERE TRIM(u.name)='Jeremy Levine' LIMIT 1;
INSERT IGNORE INTO `website_blog_posts` (`slug`,`title`,`excerpt`,`body`,`coverImageUrl`,`category`,`authorUserId`,`status`,`isFeatured`,`sortOrder`,`publishedAt`,`createdById`,`updatedById`)
SELECT 'fall-timeline-for-a-jersey-shore-rental','Working Backward From December 31: A Fall Timeline for a Jersey Shore Rental','A practical way to coordinate search, diligence, closing, setup, and launch before the next peak season.','An STR acquisition timeline should work backward from the date the property needs to be guest-ready—not merely the closing date. For a year-end target, reserve time for financing, inspections, appraisal, local licensing, design, furnishings, photography, and channel setup.\n\nThe highest-leverage work happens before the offer: clarify the buy box, financing constraints, local rules, and renovation tolerance. During diligence, convert each open question into an owner, deadline, and decision.\n\nA specialist agent can help sequence the local pieces, identify realistic vendor lead times, and keep a late-season purchase from becoming a rushed launch.','https://images.unsplash.com/photo-1494526585095-c41746248156?auto=format&fit=crop&w=1600&q=82','Buying Strategy',u.id,'published',true,20,NOW(),1,1 FROM users u WHERE TRIM(u.name)='Cody Zucker' LIMIT 1;
INSERT IGNORE INTO `website_blog_posts` (`slug`,`title`,`excerpt`,`body`,`coverImageUrl`,`category`,`authorUserId`,`status`,`isFeatured`,`sortOrder`,`publishedAt`,`createdById`,`updatedById`)
SELECT 'year-one-vs-year-two-str-performance','Year One vs. Year Two: What Two Years of Real STR Performance Data Shows','Why stabilization, reviews, pricing discipline, and operating history can materially change a property’s second-year story.','Year-one performance often includes launch friction: limited reviews, incomplete pricing history, setup costs, and an operator still learning guest demand. Year two can provide a more useful view of the property’s stabilized potential.\n\nCompare the same months across years, separate revenue growth from one-time setup costs, and examine occupancy, average daily rate, length of stay, and channel mix together. Revenue alone rarely explains why performance changed.\n\nA strong acquisition pro-forma should remain a living benchmark after closing. Updating the model with actual operating data creates better decisions for pricing, upgrades, refinancing, and the next purchase.','https://images.unsplash.com/photo-1560185008-b033106af5c3?auto=format&fit=crop&w=1600&q=82','Performance',u.id,'published',true,30,NOW(),1,1 FROM users u WHERE TRIM(u.name)='Rachel Kirkham' LIMIT 1;

-- Copy the current-site listing hero images into Savvy-owned S3 so the public
-- site is not dependent on Zillow hotlinking behavior.
UPDATE `website_properties` SET `heroImageUrl`='https://savvyos.s3.us-east-2.amazonaws.com/website/seed/properties/608-touchstone-circle-port-orange.jpg', `galleryImageUrls`=JSON_ARRAY('https://savvyos.s3.us-east-2.amazonaws.com/website/seed/properties/608-touchstone-circle-port-orange.jpg') WHERE `slug`='608-touchstone-circle-port-orange';
UPDATE `website_properties` SET `heroImageUrl`='https://savvyos.s3.us-east-2.amazonaws.com/website/seed/properties/3-old-marina-drive-ocean-isle-beach.jpg', `galleryImageUrls`=JSON_ARRAY('https://savvyos.s3.us-east-2.amazonaws.com/website/seed/properties/3-old-marina-drive-ocean-isle-beach.jpg') WHERE `slug`='3-old-marina-drive-ocean-isle-beach';
UPDATE `website_properties` SET `heroImageUrl`='https://savvyos.s3.us-east-2.amazonaws.com/website/seed/properties/337-ne-41st-street-oak-island.jpg', `galleryImageUrls`=JSON_ARRAY('https://savvyos.s3.us-east-2.amazonaws.com/website/seed/properties/337-ne-41st-street-oak-island.jpg') WHERE `slug`='337-ne-41st-street-oak-island';
UPDATE `website_properties` SET `heroImageUrl`='https://savvyos.s3.us-east-2.amazonaws.com/website/seed/properties/200-park-charles-boulevard-saint-peters.jpg', `galleryImageUrls`=JSON_ARRAY('https://savvyos.s3.us-east-2.amazonaws.com/website/seed/properties/200-park-charles-boulevard-saint-peters.jpg') WHERE `slug`='200-park-charles-boulevard-saint-peters';
UPDATE `website_properties` SET `heroImageUrl`='https://savvyos.s3.us-east-2.amazonaws.com/website/seed/properties/22-saint-mark-drive-saint-peters.jpg', `galleryImageUrls`=JSON_ARRAY('https://savvyos.s3.us-east-2.amazonaws.com/website/seed/properties/22-saint-mark-drive-saint-peters.jpg') WHERE `slug`='22-saint-mark-drive-saint-peters';
UPDATE `website_properties` SET `heroImageUrl`='https://savvyos.s3.us-east-2.amazonaws.com/website/seed/properties/581-10th-street-key-colony-beach.jpg', `galleryImageUrls`=JSON_ARRAY('https://savvyos.s3.us-east-2.amazonaws.com/website/seed/properties/581-10th-street-key-colony-beach.jpg') WHERE `slug`='581-10th-street-key-colony-beach';
