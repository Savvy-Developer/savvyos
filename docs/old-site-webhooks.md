# Old-site outbound webhooks

The old site (savvy-agents.com, repo `savvy-web`) sends events to whatever is listed in its Supabase `webhooks` table (`packages/db/src/schema/webhooks.ts`: `name`, `url`, `events[]`, `secret`, `is_active`). Delivery is `triggerWebhooks()` in `packages/db/src/services/webhook.service.ts`: a JSON `{ event, timestamp, data }` POST with an HMAC signature to every active row whose `events` includes the event.

Checked 5 Oct 2026, savvy-web read at `origin/main`.

## The table itself: not read

I could not list the `webhooks` table. No credentials for the old site's Supabase exist on this machine: the savvy-web checkout has only `.env.example` and `packages/db/.env.example`, both with placeholder values, and there is no `.env.local`, `.vercel` folder or worktree env file. Nothing was connected to and nothing was written.

To finish this, someone with the Supabase connection string runs this in a read-only transaction and fills in the table below with the host only:

```sql
BEGIN READ ONLY;
SELECT name,
       events,
       is_active,
       substring(url from '^[a-z]+://([^/:?#]+)') AS host
FROM webhooks
ORDER BY is_active DESC, name;
ROLLBACK;
```

Never copy the full URL (Zapier, Make and Airtable hook URLs are bearer secrets) or the `secret` column.

## What is known without the table

From the old site's code and SavvyOS's own inbound webhook logs (read-only checks in the Rock 1 M2 email audit, `docs/rock1-m2-email-audit.md` section 6).

| Subscriber (inferred) | Host | Events | Evidence | New site needs it? |
|---|---|---|---|---|
| SavvyOS timeline feed | `os.savvy-agents.com` (`/api/inbound/property-views`) | At least `property.viewed`, `activity.search`, `activity.favorite`, `activity.share`, `lead.created`, `lead.analysis_requested` (all seen arriving). SavvyOS also accepts `activity.contact`, `user.registered`, `lead.showing_requested` | SavvyOS inbound logs, last 30 days: `property.viewed` 6,955, `activity.search` 1,929, `activity.favorite` 432, `activity.share` 136, `lead.created` 97, `lead.analysis_requested` 37. Handler: `SAVVY_WEB_EVENTS` in `server/webhookHandlers.ts` | **No.** The new site writes the same timeline actions natively (`server/websiteActivity.ts`): views, favourites, sign-ups and requests already; searches and shares as of this branch, behind `WEBSITE_TIMELINE_SEARCH_SHARE_ENABLED` |
| Zap "Savvy Website Leads to SavvyOS" (if it is a `webhooks` row rather than the direct post) | `hooks.zapier.com` (then `os.savvy-agents.com/api/inbound/savvy-website-leads`) | `lead.created` and the request events | `notification.service.ts:195-250` comment (Zapier id 373267955); SavvyOS logs 134 posts in 30 days | **No.** `website.submitLead` creates the contact, agent connection and emails natively. Retire with the old site |
| Airtable automation | `hooks.airtable.com` (expected) | Unknown; the admin Integrations page and `docs/integrations.md` were built for it, typically `lead.created`, `property.status_changed`, `digest.daily` | `src/app/admin/integrations/IntegrationsClient.tsx`, `docs/integrations.md`. Separate from the direct Airtable API sync in `notification.service.ts:65-87` | **No.** Airtable is no longer used |
| Make.com scenario | `hook.us1.make.com` or similar (expected) | Unknown | Integrations page has a Make.com setup guide; only the dev seed (`packages/db/supabase/seed.sql`) has a row, with an example URL | **No**, unless the table shows a live row nobody can account for; then ask before switch-off |
| GoHighLevel | `services.leadconnectorhq.com` (if present) | Unknown | No GHL webhook in code; `docs/leads-to-users.md` says the only GHL presence is a LeadConnector iframe | **No.** GHL is no longer used |

Not webhook-table subscribers, listed so they are not mistaken for one:

- Financing partners (`launch.mystrhomeloan.com` and a raw-IP lead endpoint) are called directly from `src/app/(public)/properties/[slug]/actions.ts`, not through `webhooks`. Being ported separately.
- The sold-listing Google Sheet log is a direct call to `GSHEET_WEBHOOK_URL` (`src/lib/sold-sweep.ts`). Not ported.
- The direct lead post to SavvyOS (`SAVVYOS_LEAD_INBOUND_URL`) is an env var, not a table row.

## Events with no known subscriber

The old site also fires these, and only the table can say whether anything listens: `lead.assigned`, `property.created`, `property.status_changed`, `property.price_dropped`, `digest.daily`, `blog.published`, `case_study.published`. The new site has no outbound webhook system, so any live subscriber to these stops at switch-off. If the table shows one that is not Airtable, Make or Zapier-to-SavvyOS, that row needs a decision before switch day.
