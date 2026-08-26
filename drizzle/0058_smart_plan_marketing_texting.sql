ALTER TABLE `contacts`
  ADD COLUMN `smsMarketingConsentAt` timestamp NULL,
  ADD COLUMN `smsMarketingConsentSource` varchar(255) NULL,
  ADD COLUMN `smsMarketingOptedOutAt` timestamp NULL,
  ADD COLUMN `smsMarketingOptOutReason` varchar(255) NULL;

ALTER TABLE `aircall_integration_state`
  ADD COLUMN `marketingNumberId` int NULL,
  ADD COLUMN `marketingNumberName` varchar(255) NULL,
  ADD COLUMN `marketingNumberDigits` varchar(32) NULL,
  ADD COLUMN `marketingNumberConfiguredAt` timestamp NULL;
