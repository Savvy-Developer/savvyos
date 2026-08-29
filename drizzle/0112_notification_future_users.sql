-- Allow a notification audience to include users created after the option is enabled.
ALTER TABLE `email_notification_settings`
  ADD COLUMN `includeFutureUsers` boolean NOT NULL DEFAULT false,
  ADD COLUMN `futureUsersAfter` timestamp NULL;
