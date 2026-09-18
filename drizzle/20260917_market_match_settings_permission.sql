-- Market Match configuration is separately delegated from quiz administration.
ALTER TABLE `admin_permissions`
  ADD COLUMN `canViewMarketMatchSettings` boolean NOT NULL DEFAULT false AFTER `canViewMarketMatchQuiz`;
