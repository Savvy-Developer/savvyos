-- Explicit user-recipient overrides for system email notifications.
ALTER TABLE `email_notification_settings`
  ADD COLUMN `recipientUserIds` json;

-- Webhook retries and parallel intake events must never create a second entry
-- for the same contact in the same Smart Plan.
ALTER TABLE `smart_plan_enrollments`
  ADD CONSTRAINT `smart_plan_enrollments_plan_contact_unique` UNIQUE (`planId`, `contactId`);
