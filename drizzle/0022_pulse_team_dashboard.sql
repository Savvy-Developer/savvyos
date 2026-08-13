-- Pulse Team dashboard foundation: explicit named Team-to-L10 links only.
CREATE TABLE `pulse_team_scope_links` (
  `id` int AUTO_INCREMENT NOT NULL,
  `teamScopeId` int NOT NULL,
  `l10ScopeId` int NOT NULL,
  `relationshipType` ENUM('reports_to','receives_cascades_from','work_rollup_from') NOT NULL,
  `isActive` boolean NOT NULL DEFAULT true,
  `createdByPersonId` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `pulse_team_scope_links_pk` PRIMARY KEY (`id`),
  CONSTRAINT `pulse_team_scope_links_team_l10_relation_uq` UNIQUE (`teamScopeId`,`l10ScopeId`,`relationshipType`),
  CONSTRAINT `pulse_team_scope_links_team_fk` FOREIGN KEY (`teamScopeId`) REFERENCES `pulse_scopes`(`id`) ON DELETE CASCADE,
  CONSTRAINT `pulse_team_scope_links_l10_fk` FOREIGN KEY (`l10ScopeId`) REFERENCES `pulse_scopes`(`id`) ON DELETE CASCADE,
  CONSTRAINT `pulse_team_scope_links_created_by_fk` FOREIGN KEY (`createdByPersonId`) REFERENCES `pulse_people`(`id`) ON DELETE RESTRICT,
  INDEX `pulse_team_scope_links_team_relation_idx` (`teamScopeId`,`relationshipType`,`isActive`),
  INDEX `pulse_team_scope_links_l10_relation_idx` (`l10ScopeId`,`relationshipType`,`isActive`)
);

DELIMITER //
CREATE TRIGGER `pulse_team_scope_links_validate_insert`
BEFORE INSERT ON `pulse_team_scope_links`
FOR EACH ROW
BEGIN
  IF (SELECT `scopeType` FROM `pulse_scopes` WHERE `id` = NEW.`teamScopeId`) <> 'team' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Team relationship requires a team Scope';
  END IF;
  IF (SELECT `scopeType` FROM `pulse_scopes` WHERE `id` = NEW.`l10ScopeId`) <> 'l10' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Team relationship requires an L10 Scope';
  END IF;
END//
CREATE TRIGGER `pulse_team_scope_links_validate_update`
BEFORE UPDATE ON `pulse_team_scope_links`
FOR EACH ROW
BEGIN
  IF (SELECT `scopeType` FROM `pulse_scopes` WHERE `id` = NEW.`teamScopeId`) <> 'team' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Team relationship requires a team Scope';
  END IF;
  IF (SELECT `scopeType` FROM `pulse_scopes` WHERE `id` = NEW.`l10ScopeId`) <> 'l10' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Team relationship requires an L10 Scope';
  END IF;
END//
DELIMITER ;
