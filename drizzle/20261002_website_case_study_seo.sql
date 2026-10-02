-- Applied at startup by server/websiteCaseStudySeo.ts. Kept here for the record.
CREATE TABLE IF NOT EXISTS `website_case_study_seo` (
  `caseStudyId` int NOT NULL,
  `metaTitle` varchar(255) NULL,
  `metaDescription` text NULL,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`caseStudyId`)
);
