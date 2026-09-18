-- Ad attribution on the contact, carried from the ad click through Calendly.
--
-- Separate from leadSourceId on purpose. Lead source is first touch and locked
-- at creation, so it answers "how did this person first find us" and cannot
-- record a later campaign. These are last touch: which ad brought them in this
-- time. A lead who arrived from a referral in May and booked from a Meta ad in
-- September is both, and today only the first is recorded.
--
-- varchar, not a numeric type: Meta campaign, ad set and ad ids are 18 digits,
-- which loses precision past 2^53 as a number.
--
-- All nullable. Organic bookings legitimately have none, and an empty value
-- means "no information", never "there was no ad".

ALTER TABLE `contacts`
  ADD COLUMN `utmSource` varchar(255) NULL,
  ADD COLUMN `utmMedium` varchar(255) NULL,
  ADD COLUMN `utmCampaign` varchar(255) NULL,
  ADD COLUMN `utmTerm` varchar(255) NULL,
  ADD COLUMN `utmContent` varchar(255) NULL;

-- Reporting groups paid leads by campaign, so that is the one worth an index.
CREATE INDEX `contacts_utm_campaign_idx` ON `contacts` (`utmCampaign`);
