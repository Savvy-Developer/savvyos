ALTER TABLE `duplicate_contact_pairs`
  MODIFY COLUMN `matchType` enum('email','phone','name_address','fuzzy_name','manual') NOT NULL;
