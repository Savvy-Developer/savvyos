CREATE TABLE `aircall_isa_assignments` (
  `id` int AUTO_INCREMENT NOT NULL,
  `savvyUserId` int NOT NULL,
  `aircallUserId` int NOT NULL,
  `aircallNumberId` int NOT NULL,
  `aircallNumberName` varchar(255) NULL,
  `aircallNumberDigits` varchar(32) NULL,
  `verifiedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `aircall_isa_assignments_id` PRIMARY KEY(`id`),
  CONSTRAINT `aircall_isa_assignments_savvy_user_unique` UNIQUE(`savvyUserId`),
  CONSTRAINT `aircall_isa_assignments_aircall_user_unique` UNIQUE(`aircallUserId`),
  CONSTRAINT `aircall_isa_assignments_aircall_number_unique` UNIQUE(`aircallNumberId`),
  CONSTRAINT `aircall_isa_assignments_savvy_user_fk` FOREIGN KEY (`savvyUserId`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
