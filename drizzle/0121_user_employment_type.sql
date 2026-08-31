ALTER TABLE `users`
  ADD COLUMN `employmentType` enum('w2', '1099') NULL;
--> statement-breakpoint
UPDATE `users`
  SET `ptoDepartmentId` = NULL
  WHERE `employmentType` IS NULL OR `employmentType` = '1099';
