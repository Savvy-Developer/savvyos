# Switch-day runbook: savvy-agents.com moves to the new site

Everything new ships **off**. On switch day, work through these steps in order. Each step has a check and a rollback. Railway variables live on the **savvyos** service (project zestful-flow, production). Setting a variable redeploys the service, which takes about 5 minutes; wait for SUCCESS before checking.

**Owner for each step:** Dhruv unless noted. **Allow:** about 2 hours, plus the domain switch.

## 0. The day before

1. Merge the `rock1-m2-parity` PR and wait for the Railway deploy (everything stays off).
2. **Rotate the keys** that were hard-coded in the old site's code: the mystrhomeloan API key and the 104.196.52.154 inbound token. Put the new values in Railway (`FINANCING_PARTNER_MSTR_API_KEY`, `FINANCING_PARTNER_INBOUND_TOKEN`) and in the old site's Vercel env, since it still sends until step 6.
3. **Decide the open questions** in the PR description: the ROI definition in the digest, whether ROI and revenue go to non-account leads, the internal digest recipient, and which list wins for sign-ups.
4. **Agree a quiet hour.** Avoid 4–5 PM ET (the old reviewer email and digest) and avoid sending two digests on the same day.

## 1. Re-import and publish the old listings

1. Website Studio → Listings → Old-site listings: run **Check**. Read the report, including any "Possible duplicate of #id" lines (once PR #170 is merged). Then run **Import**.
2. Publish the ready imported listings with "Publish ready imported listings", then publish anything else that's still for sale by hand. `docs/redirect-map.csv` lists the 843 old listing addresses that aren't public yet.
3. **Check:** `https://home.savvy-agents.com/sitemap.xml` shows the expected property count, and a few old listing slugs open on `/newsite/properties/<slug>` with status 200.
4. **Rollback:** set the wrongly published listings back to "Draft, not public". Imported records stay; no deletes needed.

## 2. Sign-up confirmation and sign-up list

1. Railway: `WEBSITE_SIGNUP_CONFIRMATION_ENABLED=true`. Optionally set `WEBSITE_SIGNUP_RESEND_AUDIENCE_ID`; without it, the Studio choice is used, and then the old site's "All Savvy-Agent Users".
2. Email Notifications: check that "Website account email confirmation" is on.
3. **Check:** sign up on `/newsite` with a test address, confirm via the link, and see the address appear in the Resend list once.
4. **Rollback:** set `WEBSITE_SIGNUP_CONFIRMATION_ENABLED` to `false`. Sign-up keeps working as before; people who already confirmed stay on the list.

## 3. Search and share on the contact timeline

1. Railway: `WEBSITE_TIMELINE_SEARCH_SHARE_ENABLED=true`.
2. **Check:** signed in as a test website account, search on Properties and press Share on a listing; both show on that contact's timeline.
3. **Rollback:** set it to `false` (nothing else depends on it).

## 4. Financing partner feed

1. Railway: `FINANCING_PARTNER_FEED_ENABLED=on`. The URLs and keys are already set: `FINANCING_PARTNER_MSTR_URL`, `FINANCING_PARTNER_MSTR_API_KEY`, `FINANCING_PARTNER_INBOUND_URL`, `FINANCING_PARTNER_INBOUND_TOKEN` (rotated in step 0).
2. Do this **at the same moment** as step 6.2, so the lender gets each lead from exactly one site.
3. **Check:** the next real financing request shows "Sent to Lender Partners" on its contact timeline with "ok" for both partners. Do not submit a test financing request: it would reach the lender.
4. **Rollback:** set `FINANCING_PARTNER_FEED_ENABLED=off` and turn the old site's financing sends back on in the same step.

## 5. Daily property email and price-drop alerts

1. Website Studio → Daily Email:
   - **Lists:** the old site's three, "All Savvy-Agent Users", "Old Lofty Leads" and "Platform Leads". They are the defaults if never saved; check what's shown.
   - **Internal recipients:** default lindsey.gordon@savvy.realty. Confirm.
   - **Send hour:** 17:00 ET.
   - **Sender:** deals@deals.savvy-agents.com (verified in Resend).
2. Railway: `DAILY_PROPERTY_EMAIL_ENABLED=true`. This one variable also lets price drops run.
3. Website Studio: turn on the **daily email** toggle and the **price-drop** toggle. The threshold is 1% by default; `PRICE_DROP_MIN_PERCENT` changes it.
4. Use the Studio "Send test" to send a test to yourself first.
5. **Same day:** stop the old digest and price-drop jobs (step 6.1). Otherwise investors get two emails.
6. **Check:**
   - At 5 PM ET the next day, one broadcast per list shows in Resend.
   - The internal copy arrives.
   - A real 1%+ price cut produces an alert within about 30 minutes.
7. **Rollback:** turn the Studio toggles off; that stops sends at once. Also set `DAILY_PROPERTY_EMAIL_ENABLED=false` (redeploys). Then turn the old crons back on (step 6.1 rollback).

## 6. Stop the old site's sends (Vercel project for savvy-agents.com)

1. **Digest and cron:**
   - In the savvy-web Vercel project, remove or disable the crons in `vercel.json`: the daily digest route, which fires at 21:00 and 22:00 UTC and sends only when New York time is 17:00; the 4 PM ET reviewer email; and the price-drop check, every 5 minutes.
   - Either deploy savvy-web with those cron entries removed, or turn off Cron Jobs in Vercel → Project → Settings → Cron Jobs.
   - **Rollback:** re-enable the crons, or redeploy the previous savvy-web build.
2. **Financing sends:** at the same moment as step 4, stop the old site posting financing leads. Either deploy savvy-web with the partner calls disabled, or set the old site's partner key env to empty if that's how its code is gated.
   - **Rollback:** restore the old values and redeploy.
3. **Zaps:**
   - **Now (any day):** turn off "User Creation (Resend Sync)". The old site's code already adds users to the list directly, so it's redundant.
   - **At switch-off of old lead capture:** turn off "Savvy Website Leads to SavvyOS". Until then each old-site lead arrives twice (direct post plus Zap).
   - **Rollback:** turn the Zap back on in Zapier.
4. **Old site's own webhooks:** someone with Supabase access runs the read-only query in `docs/old-site-webhooks.md` and disables any subscriber that's no longer needed (Airtable, Make, GHL).
   - **Rollback:** re-enable that row.

## 7. Redirects and the domain

1. **Path redirects:** already live (PR #172). Add any further retired addresses to `shared/websitePathRedirects.ts`. The redirect list is keyed on `/newsite/...` paths, so update it if the site moves off `/newsite`.
2. **Old-domain redirects:**
   - `server/legacySiteRedirects.ts` maps savvy-agents.com addresses to the new site, and runs only on the public host (`PUBLIC_LANDING_PAGE_HOST`, default home.savvy-agents.com).
   - If savvy-agents.com itself will serve the new site, set `PUBLIC_LANDING_PAGE_HOST=savvy-agents.com` (and check the `www.` variant).
   - Also update the tag-injection host rule in `server/websiteTracking.ts`, or GTM and Clarity won't load on the new domain.
3. **Link forwarding:** Website Studio → link forwarding. Turn it on with the new site address so old `home.savvy-agents.com/newsite/...` links (reels, emails) 301 to the new address, keeping their UTMs.
4. **DNS:** point savvy-agents.com (and www) at the Railway savvyos service. Add the custom domain in Railway first and wait for the certificate.
5. **Check:**
   - `https://savvy-agents.com/` loads the new site.
   - An old listing URL 301s to its new page.
   - A made-up path returns 404.
   - `/sitemap.xml` returns 200 with the new host.
   - GA4 Realtime shows hits.
6. **Rollback:**
   - Point DNS back at Vercel. Keep the old Vercel project deployed and untouched until a week after the switch.
   - Turn link forwarding off.
   - Reset `PUBLIC_LANDING_PAGE_HOST`.

## 8. After the switch (within a week)

- Watch the daily email and price-drop sends in Resend, financing timeline entries, the sign-up list growth, and 404s in the server logs.
- Confirm no lead arrives twice (old Zap off) and that the lender gets financing leads from one source only.
- Remove the old Vercel crons and env keys for good once the week passes.
- Airtable and the old Google Sheet sold-log were deliberately **not** ported (no longer used).
