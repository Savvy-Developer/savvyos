-- The signed/onboarded date in user_profiles is the source of truth for annual agent renewal anniversaries.
-- Seed one scheduled renewal for every active agent with an onboarding date that has no current scheduled renewal.
INSERT INTO `agent_renewals` (`agentId`, `renewalDate`, `status`)
SELECT
  `u`.`id`,
  DATE_ADD(DATE(`up`.`onboardedDate`), INTERVAL 1 YEAR),
  'scheduled'
FROM `users` AS `u`
INNER JOIN `user_profiles` AS `up` ON `up`.`userId` = `u`.`id`
LEFT JOIN `agent_renewals` AS `ar`
  ON `ar`.`agentId` = `u`.`id`
  AND `ar`.`status` = 'scheduled'
WHERE `u`.`role` = 'agent'
  AND `u`.`isActive` = true
  AND `up`.`onboardedDate` IS NOT NULL
  AND `ar`.`id` IS NULL;
