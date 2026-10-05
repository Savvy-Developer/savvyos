# Rock 1 Milestone 2: end-to-end test results (5–6 Oct 2026)

Live test of every lead path on the new site, home.savvy-agents.com/newsite, using production SavvyOS.

**Safety rules for the run:**
- Visitors were plus-addresses of dhruvchougle.dc@gmail.com, with no phone except the seller test.
- Every staff recipient was pointed at dhruvchougle.dc@gmail.com first.
- `FINANCING_PARTNER_FEED_ENABLED` stayed **off** throughout.
- Nothing was deleted.
- Every setting changed was recorded and restored.
- GTM's dataLayer push was disabled in the page before each submit, so test leads didn't count as ad conversions.

**Result:** every email sent during the run went only to dhruvchougle.dc@gmail.com or its plus-addresses. Each one was checked in `email_notification_deliveries`; nothing went to Tyler, a real agent or the lender.

## Results per entry point

| # | Entry point | Visitor | Contact | Lead source (`shared/websiteLeadSources.ts`) | Agent connection | Timeline | Smart Plan | Emails (recipient) | Result |
|---|---|---|---|---|---|---|---|---|---|
| t1 | Property page, Message (608 Touchstone) | +t1 | 54569 | Property Inquiry ✓ | Test Agent ✓ | `website_inquiry_submitted`, `property_contact_requested` | none | Lead assigned → agent (you) | **PASS** |
| t2 | Property page, Book a Showing (3 Old Marina) | +t2 | 54570 | Book a Showing ✓ | ✓ | `…submitted`, `showing_requested` | none | Lead assigned → agent; showing handoff → agent, CC visitor (+t2) | **PASS** |
| t3 | Property page, Request Deeper Analysis (608) | +t3 | 54571 | Deeper Analysis Request ✓ | ✓ | `…submitted`, `analysis_requested` | none | Lead assigned; analysis handoff → agent, CC +t3 | **PASS** |
| t4 | Property page, Financing (608) | +t4 | 54572 | Financing Request ✓ | ✓ | `…submitted`, `financing_requested` | none | Lead assigned; financing handoff → agent, CC +t4. Nothing to the lender. | **PASS**, with a gap: no "not sent, feed disabled" log at the time (fixed in #176, see below) |
| t5 | Case study, Message | +t5 | 54573 | Case Study Inquiry ✓ | ✓ | `…submitted` | none | Lead assigned (case studies send no handoff, by design) | **PASS** |
| t6 | Case study, Request Deeper Analysis | +t6 | 54574 | Deeper Analysis Request ✓ (request type wins over the case-study source) | ✓ | `…submitted`, `analysis_requested` | none | Lead assigned | **PASS** |
| t7 | Case study, Financing | +t7 | 54575 | Financing Request ✓ | ✓ | `…submitted`, `financing_requested` | none | Lead assigned. Nothing to the lender. | **PASS** (same log gap as t4, fixed in #176) |
| t8 | Agent profile, Send message (temporary test-agent profile) | +t8 | 54576 | Agent Message ✓ | ✓ | `…submitted` | none | Lead assigned | **PASS** |
| t9 | Blog post author card, Message | +t9 | 54577 | Agent Message ✓ | ✓ | `…submitted` | none | Lead assigned | **PASS** |
| t10 | CMS page general form | n/a | | | | | | | **N/A**: no published CMS page contains `[[contact-form]]` (only privacy and legal) |
| t11 | Sell page seller form (phone (202) 555-0100) | +t11 | 54578 | Seller Enquiry ✓ | none (no agent, by design) | `…submitted` | none | "Website Lead, No Agent" → office (redirected to you) | **PASS**. Marked Do Not Contact about 2 min after submit. |
| t12 | Contact page | n/a | | | | | | | **N/A**: the page has no lead form, only the Market Match Calendly embed (not used) |
| t13 | Property with no agent (337 NE 41st, agent removed for the test) | +t13 | **none** | | | | | none | **FAIL**: the form sent `agentUserId: null` and the visitor saw a raw validation error ("Invalid input: expected number, received null"). Every agent-card button on any listing without an agent failed this way. |
| t13b | Retest after PR #176 was merged and deployed | +t13b | 54585 | Property Inquiry ✓ | none (no agent) | `…submitted`, `property_contact_requested` | none | "Website Lead, No Agent" → dhruvchougle.dc@gmail.com only | **PASS** |
| t20 | Account sign-up, confirmation **off** | +t20 | **not found** | | | | | | **NOT VERIFIED**: no website account, contact or delivery exists for +t20 in production |
| t20 | Favourite 608 Touchstone | | | | | | | | **NOT VERIFIED**: no saved-property row on any account since 5 Oct 16:00 UTC |
| t20 | View 3 Old Marina three times (expected view count 1, 30-minute rule) | | | | | | | | **NOT VERIFIED**: no view row on any account since 5 Oct 16:00 UTC |
| t21 | Account sign-up, confirmation **on**, then the confirm link | +t21 | 54579 | Account Sign-up ✓ | none | `contact_created`, `user_registered` | none | Confirmation email → +t21 only (opened) | **PASS**. Confirming set `emailVerifiedAt` and added the address to Resend list "All Savvy-Agent Users". The test address was then removed from that list (the Resend contact record isn't deleted). |

**Second check, 6 Oct 20:06 UTC:** after a report that round 2 was done (incognito sign-up as +t20, favourite on 608 Touchstone, 3 Old Marina opened 3 times). Production SavvyOS still had:
- no website account for +t20, and no account created after t21's (id 3);
- no saved-property row newer than 5 Oct 07:10 UTC, and no view row newer than 5 Oct 07:02 UTC (both on another account);
- no contact, agent connection or email for +t20;
- no sign-up, favourite or view activity in the server logs.

So the agent connection from the favourite, and an Account Sign-up contact for +t20, could not be checked. There is no t20 contact to tag.

The t20 steps never reached SavvyOS. The newest website account is t21's (id 3), and there are no favourites or views on any account after the t21 test. They may have been done on the old site (www.savvy-agents.com), or the sign-up may not have completed. **To do:** repeat at https://home.savvy-agents.com/newsite/sign-up with dhruvchougle.dc+t20@gmail.com.

## Fixes made

**PR #176 (merged, deploy `d4e85a56`):**
1. `submitLead` accepts `null` for `agentUserId` and `propertyId`, and the property page no longer sends `null`. **t13b passes.**
2. While the financing feed is off, a financing request now writes a "Not Sent to Lender Partners: the financing partner feed is turned off" entry on the contact timeline, plus a server log line.
   - This only applies to requests made after #176. t4 and t7 were sent before it, so they don't have the entry.

## Settings changed during the test, and restored

| Change | Original | Restored? |
|---|---|---|
| User 4519472 "Test Agent (Dhruv)" email | dhruvvvdev@gmail.com | ✓ |
| Email Notifications "Website Lead, No Agent" recipients | no row (default tyler@savvy.realty) | ✓ as `[]`, which falls back to Tyler in code (`UNASSIGNED_INQUIRY_DEFAULT_RECIPIENTS`) |
| Test-agent agent profile `test-agent-dhruv` | none | Set to **draft** (not public). The row remains, since nothing may be deleted. |
| 608 Touchstone agent | Ana Estevez | ✓ |
| 3 Old Marina agent | Dawn Wagner | ✓ |
| 337 NE 41st agent (unassigned twice: t13 and t13b) | Dawn Wagner | ✓ |
| Case study `first-str-with-a-specialist` agent | Ana Estevez | ✓ |
| Blog post `year-one-vs-year-two-str-performance` author | Rachel Kirkham | ✓. Its `tags` went from `null` to `[]` (no tags either way). |
| Railway `WEBSITE_SIGNUP_CONFIRMATION_ENABLED` | unset | ✓ unset |
| Railway `FINANCING_PARTNER_FEED_ENABLED` | off | never changed |

- **Re-check against the recorded originals:** users, all published listing assignments, case studies, blog posts and CMS pages **match**.
- **Railway note:** deleting a variable with the CLI does **not** redeploy. A manual `railway redeploy` was needed before the running build saw the change. The same applies on switch day.

## Test contacts (tagged "TEST 2026-10-05", not deleted)

| Contact | Visitor |
|---|---|
| 54569 | +t1 |
| 54570 | +t2 |
| 54571 | +t3 |
| 54572 | +t4 |
| 54573 | +t5 |
| 54574 | +t6 |
| 54575 | +t7 |
| 54576 | +t8 |
| 54577 | +t9 |
| 54578 | +t11 (Do Not Contact) |
| 54579 | +t21 |
| 54585 | +t13b |

Also left in place:
- **Website account 3** (+t21): confirmed.
- **Agent connections:** test contacts are connected to Test Agent (Dhruv) for t1–t9.

## Still open
1. **t20, favourite and 3 views:** not verified after two checks (5 Oct and 6 Oct 20:06 UTC). Nothing reached SavvyOS. Repeat on **home.savvy-agents.com/newsite** (not www.savvy-agents.com, whose accounts live in the old site's Supabase).
2. **No Smart Plan for new-site leads.**
   - The only website plan, "New Website Leads Text" (plan 6), fires on the old site's source (360015).
   - No active plan is triggered by any new-site source (360051–360059), so new-site leads get no follow-up texts or emails.
   - **Decision:** add the new sources to plan 6 or create a new plan.
3. **The seller form requires a phone,** and Smart Plans text any phone on a new contact. That's fine today (no plan matches), but it matters once a plan is attached.
4. **The sign-up account has no `contactId` link.** The t21 website account's `contactId` column is null, although sign-up created contact 54579 (matched by email). Worth checking it's intended.
5. **Contact page and CMS forms:** there's no form to test. If the Contact page should take written enquiries (not just Calendly), that's a product decision.
6. **Password reset emails are not sent** on the new site (found on 5 Oct, outside this test).
7. **Every agent-routed lead sends the agent a phone push with no off switch.** Testing with real agents needs a test agent with no other people's devices.
