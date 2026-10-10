-- Accountability Chart: a seat-based HR structure kept separate from the existing Org Chart.
CREATE TABLE IF NOT EXISTS `accountability_seats` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(255) NOT NULL,
  `description` text NULL,
  `parentSeatId` int NULL,
  `sortOrder` int NOT NULL DEFAULT 0,
  `createdById` int NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `accountability_seats_parent_sort_idx` (`parentSeatId`, `sortOrder`),
  KEY `accountability_seats_title_idx` (`title`),
  CONSTRAINT `accountability_seats_parent_fk` FOREIGN KEY (`parentSeatId`) REFERENCES `accountability_seats` (`id`) ON DELETE SET NULL,
  CONSTRAINT `accountability_seats_creator_fk` FOREIGN KEY (`createdById`) REFERENCES `users` (`id`) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS `accountability_seat_holders` (
  `id` int NOT NULL AUTO_INCREMENT,
  `seatId` int NOT NULL,
  `userId` int NOT NULL,
  `sortOrder` int NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `accountability_seat_holders_seat_user_unique` (`seatId`, `userId`),
  KEY `accountability_seat_holders_user_idx` (`userId`),
  CONSTRAINT `accountability_seat_holders_seat_fk` FOREIGN KEY (`seatId`) REFERENCES `accountability_seats` (`id`) ON DELETE CASCADE,
  CONSTRAINT `accountability_seat_holders_user_fk` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE
);

-- An R&R continues to be owned by its existing person. This optional link only
-- identifies the seat ultimately accountable for that responsibility.
ALTER TABLE `roles_responsibilities`
  ADD COLUMN `seatId` int NULL AFTER `ownerId`,
  ADD KEY `rr_seat_status_idx` (`seatId`, `status`),
  ADD CONSTRAINT `rr_seat_fk` FOREIGN KEY (`seatId`) REFERENCES `accountability_seats` (`id`) ON DELETE SET NULL;
