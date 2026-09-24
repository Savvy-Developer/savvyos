-- Keep lead-source attribution immutable for raw writes while allowing the
-- permission-checked contact correction path to opt in for its transaction.
DROP TRIGGER IF EXISTS `contacts_preserve_lead_source`;
--> statement-breakpoint
CREATE TRIGGER `contacts_preserve_lead_source`
BEFORE UPDATE ON `contacts`
FOR EACH ROW
  SET NEW.`leadSourceId` = IF(
    COALESCE(@savvyos_allow_contact_lead_source_update, 0) = 1,
    NEW.`leadSourceId`,
    OLD.`leadSourceId`
  );
