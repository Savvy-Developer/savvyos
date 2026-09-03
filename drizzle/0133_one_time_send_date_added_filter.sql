ALTER TABLE `one_time_sends`
  ADD COLUMN `dateAddedFrom` date NULL AFTER `triggerLeadSourceIds`,
  ADD COLUMN `dateAddedTo` date NULL AFTER `dateAddedFrom`;
