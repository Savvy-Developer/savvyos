-- Two new audiences for a One Time Send: a tag, and a hand-picked list of
-- contacts.
--
-- Every audience until now was a Smart Plan trigger reused for a broadcast,
-- which is why the column is the Smart Plan trigger enum. These two are not
-- Smart Plan triggers and must not become them: a Smart Plan is an ongoing
-- workflow that enrols contacts as they arrive, and "these eleven people"
-- cannot arrive. The enum is widened here, on this table only. smart_plans
-- keeps its own narrower enum.
--
-- MUST BE APPLIED BEFORE THE CODE MERGES. Railway does not run these files.
-- The send composer writes triggerType on every queue, so shipping the code
-- against the old enum makes MySQL reject a 'tag' send with a truncation
-- error, and the two new columns would silently read back as NULL.

ALTER TABLE `one_time_sends`
  MODIFY COLUMN `triggerType` ENUM(
    'lead_source',
    'all_lead_sources',
    'buyer_under_contract',
    'seller_under_contract',
    'new_listing',
    'buyer_closed',
    'seller_closed',
    'appointment_scheduled',
    'appointment_confirmed',
    'appointment_rescheduled',
    'appointment_canceled',
    'tag',
    'manual_contacts'
  ) NOT NULL;

-- json, matching contacts.tags, and nullable because every send made before
-- today has neither. An audience of "no tags" is not a thing: the composer
-- requires at least one, so NULL here means "this send used a different kind
-- of audience", never "a tag audience that matched nobody".
ALTER TABLE `one_time_sends`
  ADD COLUMN `triggerTags` json NULL,
  ADD COLUMN `triggerContactIds` json NULL;
