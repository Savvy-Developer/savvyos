ALTER TABLE `tech_requests`
  ADD COLUMN `trackingNumber` varchar(32) NULL AFTER `id`,
  ADD COLUMN `dueDate` date NULL AFTER `status`;
-- statement-breakpoint
UPDATE `tech_requests`
SET `trackingNumber` = CONCAT('TR', LPAD(`id`, 3, '0'))
WHERE `trackingNumber` IS NULL;
-- statement-breakpoint
ALTER TABLE `tech_requests`
  MODIFY COLUMN `trackingNumber` varchar(32) NOT NULL,
  ADD CONSTRAINT `tech_requests_tracking_number_unique` UNIQUE (`trackingNumber`),
  ADD INDEX `tech_requests_due_date_idx` (`dueDate`);
