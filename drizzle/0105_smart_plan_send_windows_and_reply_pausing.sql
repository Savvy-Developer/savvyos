-- Configurable delivery windows and reply-sensitive Smart Plan pausing.
ALTER TABLE `smart_plans`
  ADD COLUMN `pauseOnReply` boolean NOT NULL DEFAULT false,
  ADD COLUMN `propertyAddressFromNotes` boolean NOT NULL DEFAULT false,
  ADD COLUMN `propertyAddressFallbackText` text NULL;
--> statement-breakpoint
ALTER TABLE `smart_plan_steps`
  ADD COLUMN `sendWindowEnabled` boolean NOT NULL DEFAULT false,
  ADD COLUMN `sendDays` json,
  ADD COLUMN `sendStartHour` int NOT NULL DEFAULT 9,
  ADD COLUMN `sendEndHour` int NOT NULL DEFAULT 18;
--> statement-breakpoint
-- Preserve every existing "Business hours only" setting as its equivalent
-- explicit window: Monday through Friday, 9:00 AM through 6:00 PM Eastern.
UPDATE `smart_plan_steps`
SET `sendWindowEnabled` = true,
    `sendDays` = JSON_ARRAY(1, 2, 3, 4, 5),
    `sendStartHour` = 9,
    `sendEndHour` = 18
WHERE `businessHoursOnly` = true;
--> statement-breakpoint
-- Scope the property-aware text handling to the one configured Offer Sheet
-- referral plan. It may safely remain a draft until an administrator publishes it.
UPDATE `smart_plans`
SET `propertyAddressFromNotes` = true,
    `propertyAddressFallbackText` = 'Hey {{firstname}}... thanks for checking out the short term rental property for sale on The Offer Sheet. Should I connect you w the Agent on it? -Savvy'
WHERE `id` = 11
  AND `name` = 'Offer Sheet Referral New Lead (Texts)';
