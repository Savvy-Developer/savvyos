# Rock 1, Milestone 2: email and lead pathway audit

Goal: every email and lead pathway on the current site (savvy-agents.com, repo `Savvy-Agent/savvy-web`, read at `origin/main` baa7c4b) works on the new site (home.savvy-agents.com/newsite, SavvyOS, read at `origin/main` aa01d3e plus this branch).

Audited 5 Oct 2026. Old-site paths are relative to the savvy-web repo; new-site paths are relative to this repo. Production facts come from read-only checks: Railway variable names (no values), read-only `SELECT`s against the SavvyOS MySQL database in a read-only transaction, and read-only `GET`s of the Resend domain and segment lists. Nothing was sent, submitted or written. I could not see Vercel's environment values, the old site's Supabase `webhooks` table, or Zapier, so anything that depends on those is marked as unknown.

## Summary

| # | Pathway | Old site | New site | Verdict |
|---|---|---|---|---|
| 1 | Sign-up to Resend list | On email confirmation, upserts the contact into the hard-coded "All Savvy-Agent Users" audience; only verified profiles | On sign-up, adds the contact to the segment chosen in Website Studio > Daily Email; skips unsubscribed or bounced contacts | **Gap (configuration).** Code works, but no list is chosen in production, so nobody is added today |
| 2 | Daily email | 5 PM ET (two Vercel crons + hour gate), reviewer-approved listings, Resend broadcast to `RESEND_DIGEST_AUDIENCE_IDS` from `Savvy <deals@deals.savvy-agents.com>`, internal copy to `DIGEST_EMAIL` | 5 PM ET by default (10 minute in-process scheduler), admin-approved listings, broadcast to chosen segments from `Savvy STR Agents <hello@savvy-agents.com>`, plus internal copy and personal emails | **Gap (off in production).** Built and scheduled, but switched off: `DAILY_PROPERTY_EMAIL_ENABLED` is not set on Railway, Studio "enabled" is off, no segments, no internal recipients. Sender, subject wording and layout differ. Postal address was missing (fixed in this PR) |
| 3 | Price-drop email | Vercel cron every 5 min; 1% minimum drop, 15 min settle; viewers in 90 days plus favourites; from the deals address | In-process check every 30 min, registered at startup; $1,000 minimum drop; viewers in 90 days plus saves; from `properties@savvy-agents.com` | **Gap (off in production).** Scheduled, but sends nothing: needs `DAILY_PROPERTY_EMAIL_ENABLED=true` and "Price drop alerts" on in the Studio. Neither is set. Postal address was missing (fixed in this PR) |
| 4a | Favourite creates agent connection | Logs `property_favorited` on the contact (creates the contact if needed); **no** agent connection | Same: logs `property_favorited`, creates the contact if needed, no agent connection | **Works (parity). Needs decision** if a favourite should now create a connection |
| 4b | Deeper evaluation creates agent connection | Lead row, then `lead.analysis_requested` webhook to SavvyOS, which creates the connection when the agent email matches, plus the handoff email | `submitLead` with `requestType: "analysis"` creates the connection to the listing's agent directly, sends the handoff email and the lead-assigned alert | **Works** (confirmed with one production request on 5 Oct that has a connection) |
| 5 | Seller inquiry email | `/api/contact`, source `seller`; "New Lead Received - Savvy" from `alerts@notify.savvy-agents.com` to `LEAD_NOTIFICATION_EMAIL` or tyler@savvy.realty | Contact created, tagged "Seller lead", Smart Plan started, but **no email to anyone** (no agent to route to) | **Gap, fixed in this PR**: new "Website Lead, No Agent" email to Tyler by default, editable in Email Notifications |
| 6 | Zaps and webhooks | See the table in section 6 | See section 6 | **Needs decision** per Zap |

Also fixed in this PR: new website contacts were not being sent to GoHighLevel, though every other contact create path does that and the old site's leads reached GHL through the inbound webhook.

## 1. New sign-ups reach the Resend audience

### Old site

- The audience is hard-coded, not an env var: `SAVVY_AGENT_USERS_AUDIENCE_ID = "21d6ce52-d41a-4fcd-823e-f8bf5ea5e26d"` ("All Savvy-Agent Users") at `packages/db/src/services/resendAudience.service.ts:36`. The comment at lines 28 to 31 says it was kept out of env on purpose.
- Called from two places, only for a user created in the last 10 minutes (5 for OAuth), in `after()`:
  - Email/password confirmation link: `src/app/auth/confirm/route.ts:91-117`.
  - OAuth callback: `src/app/auth/callback/route.ts:44-76` (this path also sends the welcome email).
- Request: legacy `POST /audiences/:id/contacts` with `email`, `first_name`, `last_name` (split from `full_name`), and `unsubscribed: false` (`resendAudience.service.ts:120-141`). Three attempts with backoff, no retry on 4xx.
- Consent gate (`resendAudience.service.ts:67-81, 116-118`): if a profile exists with this email it must be `verified = true`, otherwise the sync is skipped. This keeps lead-form users (who never saw the sign-up consent text) out of the marketing list.
- Env needed: `RESEND_API_KEY` only.
- Unsubscribes are handled by Resend itself (broadcasts carry `{{{RESEND_UNSUBSCRIBE_URL}}}`). Note that the upsert sends `unsubscribed: false`, which on a re-sync could resubscribe someone who had unsubscribed in Resend.
- This replaced the Zap "User Creation (Resend Sync)" (`resendAudience.service.ts:4-7`).

### New site

- `websiteAccount.signUp` (`server/routers/websiteAccount.ts:124-210`) calls `addSignupToResendAudience` without waiting (`:186`) right after the account row is written. There is no email verification step on the new site, so this runs at sign-up, not at confirmation.
- `server/websiteSignupAudience.ts:133-158`: reads the chosen segment from the one-row table `website_signup_audience`; skips if none is chosen; skips if any SavvyOS contact with this email has `emailStatus` `unsubscribed` or `bounced` (`:99-116`, fails closed).
- `server/_core/resendMarketingBroadcast.ts:223-256`: `POST /contacts/:email/segments/:segmentId`; if the contact does not exist, creates it with `first_name`, `last_name` and the segment. It never sends `unsubscribed: false`, so an existing Resend unsubscribe is kept. This is better than the old behaviour.
- The list is chosen in Website Studio > Daily Email (`server/routers/website.ts`, `signupAudience` procedures near the end of the file). No env var.
- The sign-up also creates a SavvyOS contact with a `user_registered` timeline entry (`websiteAccount.ts:192-205`, `server/websiteActivity.ts`).

### Production state (read-only checks)

- Resend: the SavvyOS `RESEND_API_KEY` is on the same Resend account as the old site. The old "All Savvy-Agent Users" audience (id `21d6ce52-...`) is listed as a segment, alongside "Platform Leads" and "Old Lofty Leads".
- `website_signup_audience` has **no row**, so no list is chosen and no new-site sign-up has been added to Resend. Two website accounts exist (latest 30 Sep).

### Verdict: Gap (configuration, not code)

Choose "All Savvy-Agent Users" in Website Studio > Daily Email > sign-up list. Then the new site matches the old one, with better unsubscribe handling.

Differences to be aware of:
- No verified-email step on the new site. The old site only added confirmed, verified people. See decisions.
- Old site added OAuth sign-ups too; the new site has email/password accounts only.
- The old OAuth path sent a welcome email; the new site sends none (minor).

## 2. Daily email

### Old site

- Schedule: `vercel.json` runs `/api/admin/digest` at 21:00 and 22:00 UTC; the handler only proceeds when the New York hour is 17 (`src/app/api/admin/digest/route.ts:36-62`). A reviewer email goes out at 4 PM ET from `/api/admin/digest-review` (20:00 and 21:00 UTC, `DIGEST_REVIEW_RECIPIENTS`, `src/app/api/admin/digest-review/route.ts`).
- What goes out: published listings with `approved_for_digest = true` and not yet sent (`digest/route.ts:89-95`), stamped as sent afterwards.
- Who receives it:
  - Internal copy to `DIGEST_EMAIL` (code default lindsey.gordon@savvy.realty) (`digest/route.ts:20, 140-153`).
  - Resend broadcast to every audience in `RESEND_DIGEST_AUDIENCE_IDS` (or the older `RESEND_DIGEST_AUDIENCE_ID`) (`packages/db/src/services/email.service.ts:741-830`). The values are in Vercel, which I could not read.
  - `digest.daily` webhook event (`digest/route.ts:222`).
- Sender: `EMAIL_FROM_DEALS`, default `Savvy <deals@deals.savvy-agents.com>`, reply-to `EMAIL_REPLY_TO_DEALS`, default hello@savvy-agents.com (`email.service.ts:76, 94, 805-806`).
- Subject: written from the listings and rotated by day (`packages/db/src/services/digestSubject.ts:118-133`); static fallback "N STRs We'd Buy". Optional AI copy behind `DIGEST_AI_COPY` (shadow mode by default).
- Content blocks (`email.service.ts:503-692`): preheader; dark header with white logo; headline "Don't Sleep on These N New STR Deals" and sub-line; date; one card per listing with photo, title, city, price, ROI badge, beds/baths/sqft, projected revenue, "Why [agent] likes this property" with agent photo, "Show me more" button; "STR Success Starts with The Perfect Market Match" block with "Book a Call"; footer with the eXp line, **postal address (37 Haywood St., #300, Asheville, NC 28801)** and unsubscribe.

### New site

- Code: `server/websiteDailyEmail.ts`, `server/websiteDailyEmailLogic.ts`, `server/dailyPropertyEmail.ts`.
- Schedule: `scheduleWebsiteDailyEmail()` is registered at production startup (`server/_core/index.ts:575`), checks every 10 minutes, and sends once a day from the chosen hour Eastern, default 17 (`websiteDailyEmail.ts:514-570`). Idempotent per day.
- What goes out: listings approved in Website Studio > Daily Email (`websiteDailyEmail.ts:378`), stamped `dailyEmailSentAt`.
- Who receives it (`websiteDailyEmail.ts:409-475`):
  - One Resend broadcast per segment chosen in the Studio.
  - Internal copies to the Studio's internal recipients.
  - A personal, preference-matched email to each new-site account (`dailyPropertyEmail.ts`, from `properties@savvy-agents.com`).
- Two switches must both be on (`websiteDailyEmail.ts:56-62, 347-358`): `DAILY_PROPERTY_EMAIL_ENABLED=true` on the server, and "enabled" in the Studio.
- Sender: `Savvy STR Agents <hello@savvy-agents.com>`, no separate reply-to (`server/_core/resendMarketingBroadcast.ts:4-5, 290-310`).
- Subject: written from the listings and rotated by day, with different wording to the old site (`websiteDailyEmailLogic.ts:118-176`); custom template optional.
- Content (`websiteDailyEmailLogic.ts:297-395`): plain "Savvy STR Agents" text header; intro line; one card per listing with photo, title, city, price, beds, baths, the agent's "Why I like this property", "View the property" button; "Browse every property"; a sign-up nudge for revenue and returns; unsubscribe; disclaimer. **No ROI, revenue, sqft, "Book a Call" block, logo, preheader, or postal address.** Revenue and returns are deliberately behind the login on the new site.

### Production state

- Railway `savvyos` service has **no `DAILY_PROPERTY_EMAIL_ENABLED`** variable, so the master switch is off.
- `website_daily_email_settings`: enabled = off, send hour 17, segments = none, internal recipients = none, personal emails on, price drops off.
- `website_daily_email_runs`: one test send on 24 Sep. No real runs.
- All three sending domains (`savvy-agents.com`, `deals.savvy-agents.com`, `notify.savvy-agents.com`) are verified in Resend, so any of the senders will deliver.

### Verdict: Gap (switched off, and not identical)

The machinery is there and scheduled, but the new daily email does not run in production, and it is not the same email. Fixed in this PR: the postal address (a CAN-SPAM requirement the old footer met) is now in the broadcast, the personal email and the price drop email. Everything else is a decision (sender, layout, segments, internal recipients, cut-over day). Important: if both sites send on the same day, subscribers get two daily emails.

## 3. Price-drop email

### Old site

- `vercel.json`: `/api/admin/cron/price-drop-alerts` every 5 minutes (`CRON_SECRET`).
- `packages/db/src/services/priceDropAlert.service.ts:16-23`: at least a 1% drop, price unchanged for 15 minutes, recipients who viewed in the last 90 days plus anyone with the listing favourited (`packages/db/src/queries/priceDrops.ts:151`).
- Email: "Price drop: [title] is now $X" from the deals address, with postal address and unsubscribe (`email.service.ts:1017-1103`). Also fires `property.price_dropped` webhook (`priceDropAlert.service.ts:190`).

### New site

- `server/websitePriceDropAlerts.ts`; `schedulePriceDropAlerts()` registered at production startup (`server/_core/index.ts:578`), checks every 30 minutes (`websitePriceDropAlerts.ts:283-291`).
- Drop of at least $1,000 (`server/websitePriceDropLogic.ts:15`), recipients are new-site accounts that viewed in 90 days or saved it, minus unsubscribed or bounced contacts.
- Sends only when `DAILY_PROPERTY_EMAIL_ENABLED=true` **and** "Price drop alerts" is on in the Studio (`websitePriceDropAlerts.ts:263`). While off, prices are still tracked so there is no backlog when switched on.
- From `Savvy STR Agents <properties@savvy-agents.com>`, subject "Price drop: [name]", one-click unsubscribe headers.

### Production state

Env var not set, Studio toggle off, `website_price_drop_alerts` table empty. Wired and scheduled, not live.

### Verdict: Gap (switched off)

Turning it on is the same env var as the daily email plus the Studio toggle. Thresholds differ (1% vs $1,000, 15 minute settle vs none). Recipients are only new-site accounts; old-site users' views and favourites do not carry over unless accounts are migrated.

## 4. Favourite and deeper evaluation create the agent connection

### Old site

- **Favourite**: `trackActivityAction` (`src/app/(public)/account/activity-actions.ts:27, 107-131`) fires `activity.favorite` to the old site's webhook subscribers. In production that reaches SavvyOS at `/api/inbound/property-views` (432 `activity.favorite` events in the last 30 days, last on 4 Oct). SavvyOS maps it with `createsContact: true, createsAgentConnection: false` (`server/webhookHandlers.ts:563-565`). **A favourite never created an agent connection.** The payload carries no agent at all.
- **Deeper analysis**: `requestDeeperAnalysis` (`src/app/(public)/properties/[slug]/actions.ts:8-36`) writes a lead with source `deeper_analysis` and the listing's agent, then `notifyLeadCreated(..., 'lead.analysis_requested')` (`packages/db/src/services/notification.service.ts:21-55`), which does four things in parallel: Airtable upsert, the "New Lead Received" email to the agent, the webhooks (SavvyOS `property-views`), and the optional direct post to SavvyOS (`SAVVYOS_LEAD_INBOUND_URL`). SavvyOS creates the connection when the agent email matches an active user (`webhookHandlers.ts:588-591, 1001-1030`) and sends the client handoff email. Production log: "Analysis request logged for contact ... (agent connection created) (handoff email sent)".
- The same lead also reaches SavvyOS a second time through the Zap "Savvy Website Leads to SavvyOS" (section 6).

### New site

- **Favourite**: `websiteAccount.setSaved` (`server/routers/websiteAccount.ts:406-466`) saves the property and, for a new save only, calls `recordWebsiteAccountActivity(..., "property_favorited")` (`server/websiteActivity.ts:204-240`): creates the contact if there is none (lead source "Savvy-Agents.com > Account Sign-up", Smart Plans started) and logs `property_favorited`. No agent connection, same as the old site. Hot Leads "Property favorites" reads this (`server/routers/hotLeads.ts:1217`).
- **Deeper analysis**: the property page opens `LeadForm` with `requestType="analysis"`, the property id and the listing's agent (`client/src/pages/PublicWebsite.tsx:2064-2093`). `website.submitLead` (`server/routers/website.ts:2280-2490`) creates or finds the contact, then `resolveInquiryAgent` (`:178`) picks the agent, inserts `agentConnections` if missing (`:2413`), sends the handoff email with the client copied (`:2420`, same email type as the old site's SavvyOS handoff), sends the lead-assigned email and push (`:2430`), and logs `website_inquiry_submitted` plus `analysis_requested` (`:2476`).
- Unlike the old site, the visitor does not need to be signed in to request an analysis on the new site.

### Production state

Last 14 days: 18 `analysis_requested` events via the old site and 1 via the new site (5 Oct); the new-site one has an agent connection. 167 favourites via the old site, 1 via the new site.

### Verdict

- 4a Favourite: **Works (parity).** If Tyler expects a favourite to put the investor in the agent's pipeline, that is new behaviour and a decision (see below). It would flood agents' pipelines: the old site sent 432 favourites in 30 days.
- 4b Deeper evaluation: **Works.**

## 5. Seller inquiry form

### Old site

- `src/components/SellerLeadForm.tsx:66` posts to `/api/contact` with `source: 'seller'` (`src/lib/seller-lead.ts:151-160`).
- `src/app/api/contact/route.ts:7-53` creates the lead (no agent) and calls `notifyLeadCreated` (`notification.service.ts:21-55`):
  - Email "New Lead Received - Savvy" (`packages/db/src/services/email.service.ts:303`), from `EMAIL_FROM_NOTIFY`, default `Savvy STR Agents <alerts@notify.savvy-agents.com>` (`email.service.ts:75`).
  - To: the agent if there is one, else `LEAD_NOTIFICATION_EMAIL`, else **tyler@savvy.realty** (`notification.service.ts:125`), CC `LEAD_NOTIFICATION_CC` if set. Skipped if `seller` is listed in `WEBSITE_LEAD_EMAIL_DISABLED_SOURCES` (`:117`). I cannot see the Vercel values.
  - Template: name, email, phone, message (address, timeline, bedrooms, listed, revenue), source.
  - Also: Airtable upsert, `lead.created` webhook (to SavvyOS `property-views`), and the Zap to `savvy-website-leads` (4 seller conversions in the last 30 days).

### New site (before this PR)

- `SellerLeadForm` in `client/src/pages/PublicWebsite.tsx:5486-5550` calls `website.submitLead` with `intent: "sell"`, no property, no agent.
- `submitLead` creates the contact (tag "Seller lead", lead source for the Sell page, Smart Plan enrollment) and logs `website_inquiry_submitted`. With no agent, the `if (contactId && agentId)` branch is skipped, so **no email or push went to anyone**. The same was true of the contact page and general buy enquiries.

### Fix in this PR

- New email type `website_inquiry_unassigned` ("Website Lead, No Agent"), template in `server/_core/resendEmail.ts` (subject "New website lead: [name] ([form])"; name, email, phone, form, property, message; "Open the contact" button), sent from the standard SavvyOS notifications sender.
- `alertOfficeOfUnassignedInquiry` in `server/routers/website.ts` sends it, fire and forget, whenever `submitLead` finds no agent. Recipients come from Email Notifications > "Website Lead, No Agent" > Recipients; until a list is saved it goes to tyler@savvy.realty, the old site's default. It can be switched off on the same page.

### Verdict: Gap, fixed in this PR

## 6. Zaps and webhooks that touch the website

I cannot see Zapier itself, the old site's `webhooks` table (Supabase), or Vercel's env values. The list below comes from code comments, the old site's env var names, and SavvyOS's inbound webhook logs.

| What | Direction | Evidence | What it does | New site does it natively? | Suggestion |
|---|---|---|---|---|---|
| Zap "User Creation (Resend Sync)" | old site to Zapier to Resend | `resendAudience.service.ts:4-7`, `auth/confirm/route.ts:93-96` | Added registrants to the Resend audience | Yes, `addSignupToResendAudience` (once a list is chosen) | Already replaced in old-site code. If it is still on in Zapier, it is redundant: retire |
| Zap "Savvy Website Leads to SavvyOS" (Zapier id 373267955) | old site webhook to Zapier to `os.savvy-agents.com/api/inbound/savvy-website-leads` | `notification.service.ts:195-250`, `.env.example` (`SAVVYOS_LEAD_INBOUND_URL`); SavvyOS logs: 134 posts in 30 days, last 4 Oct | Every old-site lead (deeper analysis, financing, seller, contact) posted as form fields `name, email, phone, lead_source=Website, agent_email, notes` | Yes, `website.submitLead` creates the contact, connection and emails | Retire when the old site stops taking leads. Until then, note that each old-site lead also arrives through the direct webhook below, so SavvyOS gets it twice |
| Old site webhook subscriber to SavvyOS `/api/inbound/property-views` | old site to SavvyOS (direct, `{event, data}` envelope; not visibly Zapier) | SavvyOS logs, 30 days: `property.viewed` 6,955, `activity.search` 1,929, `activity.favorite` 432, `activity.share` 136, `lead.created` 97, `lead.analysis_requested` 37 | Timeline events, contact creation, agent connection and handoff email for requests | Yes for views, favourites, sign-ups and requests (`server/websiteActivity.ts`). No equivalent for `activity.search` and `activity.share` | Stops on its own when the old site is off. Decide whether search and share events are needed |
| Other old-site webhook events (`user.registered`, `lead.assigned`, `property.created`, `property.status_changed`, `property.price_dropped`, `digest.daily`, blog and case study events) | old site to whatever is in its `webhooks` table | `triggerWebhooks(` calls listed in section "Old-site webhook calls" below | Unknown subscribers | Not applicable; the new site has no outbound webhook system | Someone with Supabase access should list the `webhooks` table (name, events, host only) before switch-off |
| Calendly bookings to Zapier to SavvyOS (`calendly-zapier-no-hmac`, plus native Calendly endpoints) | Calendly to Zapier to SavvyOS | `shared/adAttribution.ts:1-8`, SavvyOS `webhook_endpoints` | Booking intake with UTM attribution from the website's Calendly embeds | Not a website pathway; the new site links to the same Calendly | Keep |
| "Market Match -> Zapier -> SavvyOS", "Zapier - Partner Lead Imports" | Zapier to SavvyOS | SavvyOS `webhook_endpoints` | Quiz and partner lead intake | Not website pathways | Keep |
| Financing partner feed | old site to `launch.mystrhomeloan.com` and to a raw IP endpoint (`104.196.52.154:3000/api/leads/inbound`) | `src/app/(public)/properties/[slug]/actions.ts:75-136` | Sends financing requests to the lender and a second lead system | **No.** The new site's financing request goes to the agent only | Decision. Note: both API keys are hard-coded in the old site's source and should be rotated |
| Airtable contact sync | old site to Airtable | `notification.service.ts:65-87`, env `AIRTABLE_*` | Upserts every lead into an Airtable contacts table | No | Decision: is anyone still using that table? |
| Google Sheet webhook (sold sweep) | old site to `GSHEET_WEBHOOK_URL` | `src/lib/sold-sweep.ts:7-19` | Logs sold listings to a sheet | No (new site has its own sold sweep, no sheet) | Decision, low stakes |

Old-site webhook calls: `src/app/auth/confirm/route.ts:126`, `src/app/auth/callback/route.ts:81`, `src/app/actions/onboarding.ts:109`, `src/app/(public)/account/activity-actions.ts:83, 117`, `src/app/admin/properties/actions.ts:169, 285, 951`, `src/app/admin/blogs/actions.ts:83, 236`, `src/app/admin/case-studies/actions.ts:61, 153`, `src/app/api/admin/digest/route.ts:222`, `packages/db/src/services/notification.service.ts:183, 301`, `packages/db/src/services/priceDropAlert.service.ts:190`, `packages/db/src/services/property.service.ts:958, 1291`.

Zapier references in SavvyOS are all inbound intake (Calendly, partner leads, Market Match, generic lead forms). SavvyOS has no `hooks.zapier.com` URL in code; Zapier-related env names on Railway: none.

## Changes in this PR

1. **Seller and other no-agent inquiries email the office again.** New `website_inquiry_unassigned` email type and template (`server/_core/resendEmail.ts`), sender in `server/routers/website.ts` (`alertOfficeOfUnassignedInquiry`, `websiteInquiryLabel`), listed with an editable recipient list in `client/src/pages/EmailNotificationsPage.tsx`.
2. **Postal address in marketing emails.** `MARKETING_POSTAL_ADDRESS` and `postalAddressHtml()` in `server/websiteDailyEmailLogic.ts`, used in the daily broadcast (HTML and text), the personal daily email and the price drop email (HTML and text). Same address as the old footers.
3. **New website contacts sync to GoHighLevel.** `triggerGhlContactSync` after the contact insert in `submitLead` and in `createContactForAccount` (`server/websiteActivity.ts`), as every other create path does (`server/db.ts:434`, `server/webhookHandlers.ts:385, 894`).

Tests: `server/routers/website.unassignedInquiry.test.ts` (new), plus additions to `server/_core/resendEmail.test.ts`, `server/websiteDailyEmailLogic.test.ts`, `server/websitePriceDropLogic.test.ts`, `server/dailyPropertyEmailRender.test.ts`, `server/websiteActivity.test.ts`.

## Decisions for Tyler/Dhruv

1. **Sign-up list:** pick "All Savvy-Agent Users" as the sign-up list in Website Studio > Daily Email. Without it, no new-site sign-up reaches Resend. Also decide whether the new site needs email verification before adding people to the marketing list (the old site required a confirmed, verified account).
2. **Daily email cut-over:** pick the day the new site takes over. On that day, in this order: set `DAILY_PROPERTY_EMAIL_ENABLED=true` on Railway, choose the segments (to match the old `RESEND_DIGEST_AUDIENCE_IDS`, which only Vercel shows), add internal recipients (the old copy went to `DIGEST_EMAIL`, default Lindsey), switch "enabled" on, and turn off the old site's `/api/admin/digest` cron (or clear `RESEND_DIGEST_AUDIENCE_IDS`). Otherwise investors get two emails a day.
3. **Daily email look and sender:** the new one comes from hello@savvy-agents.com and has no logo, ROI, revenue, "Book a Call" block or preheader; the old one came from deals@deals.savvy-agents.com. Keep the new design, or match the old one?
4. **Daily email reviewer email:** the old site emailed reviewers at 4 PM ET with the day's new listings to approve. The new site has the review queue in the Studio but no reminder email. Needed?
5. **Price drops:** switch on ("Price drop alerts" in the Studio, plus the env var in decision 2), and confirm the $1,000 minimum is right (the old rule was 1% with a 15 minute settle).
6. **Favourites:** should a favourite create an agent connection? Neither site does today. If yes, decide which agent (the listing's) and whether to throttle it; the old site sent 432 favourites in 30 days.
7. **"Website Lead, No Agent" recipients:** it goes to tyler@savvy.realty until a list is saved in Email Notifications. Confirm or change (the old site may have used `LEAD_NOTIFICATION_EMAIL` and `LEAD_NOTIFICATION_CC` in Vercel, which I could not read).
8. **Zap "Savvy Website Leads to SavvyOS":** retire on the day the old site stops taking leads. Until then, each old-site lead reaches SavvyOS twice (the Zap and the direct webhook).
9. **Zap "User Creation (Resend Sync)":** if still on in Zapier, retire it now; the old site's own code replaced it.
10. **Old-site webhook subscribers:** someone with Supabase access lists the `webhooks` table (names, events, host only) so nothing unknown is lost at switch-off.
11. **Financing partners:** the new site does not send financing requests to mystrhomeloan.com or the second lead system the old site posted to. Keep those feeds? Either way, rotate the two API keys hard-coded in the old site's source.
12. **Airtable and Google Sheet feeds:** still used by anyone? If not, let them end with the old site.
13. **GoHighLevel:** this PR sends new website contacts to GHL like every other intake. If GHL is being retired, say so and it can be dropped.
14. **Search and share events:** the old site logged market searches and shares on the contact timeline. The new site does not. Needed for Hot Leads or reports?
