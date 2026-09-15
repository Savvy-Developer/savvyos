-- Property page parity: the agent's own note on a listing, and a label saying
-- which of the three calls to action produced a lead.
--
-- Both are additive and nullable. No existing row changes meaning: a listing
-- with no blurb has none, and a lead created before today has no requestType
-- because nothing on the page could have set one.

ALTER TABLE `website_properties`
  ADD COLUMN `agentBlurb` text NULL AFTER `summary`;

-- Deliberately a varchar rather than another value on the `intent` enum.
-- Widening an enum rewrites the column definition on a live table that
-- receives public form posts; adding a nullable column does not. It also keeps
-- two separate questions apart: `intent` is what the person wants, this is
-- which button they pressed to ask for it.
ALTER TABLE `website_leads`
  ADD COLUMN `requestType` varchar(40) NULL AFTER `intent`;

CREATE INDEX `website_leads_request_type_idx` ON `website_leads` (`requestType`, `createdAt`);
