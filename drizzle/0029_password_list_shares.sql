CREATE TABLE IF NOT EXISTS `password_list_shares` (
  `id` int NOT NULL AUTO_INCREMENT,
  `listId` int NOT NULL,
  `userId` int NOT NULL,
  `sharedByUserId` int NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `password_list_shares_list_idx` (`listId`),
  KEY `password_list_shares_user_idx` (`userId`),
  UNIQUE KEY `password_list_shares_list_user_unique` (`listId`, `userId`),
  CONSTRAINT `password_list_shares_list_fk`
    FOREIGN KEY (`listId`) REFERENCES `password_lists` (`id`) ON DELETE CASCADE,
  CONSTRAINT `password_list_shares_user_fk`
    FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `password_list_shares_shared_by_fk`
    FOREIGN KEY (`sharedByUserId`) REFERENCES `users` (`id`) ON DELETE SET NULL
);
