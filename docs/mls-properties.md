# MLS Properties

MLS Properties is a standalone admin module for ingesting, normalizing, searching, and viewing listings from many MLS feeds. It will replace the current Properties section later. For now it is fully isolated: it does not read from or write to Properties, Listings, the public website, CRM contacts, pro formas, AI features, or the read-only MCP endpoint.

**Nothing ingests until a signed license is recorded for the feed.** Having a credential is not the same as having a license. See [MLS licensing and integration research](./mls-integration-research.md) for the 29-market rules matrix.

## What ships in this module

| Area | Location | Notes |
|---|---|---|
| Property search | `/mls-properties` | Filters, sort, results list, map with price pins and server-side clusters, split, list, and map views, "search as I move the map" |
| Listing detail | `/mls-properties/listings/:id` | Gallery, facts, features, property history across transactions, other listings at the same property, open houses, seller opt-out notices, attribution and disclaimer, field lineage, raw payload (managers only) |
| Feeds and mappings | `/mls-properties/feeds` | Sources (29 MLSs seeded), feeds, sync runs, field mappings, worker health and provider usage |
| Permissions | `canViewMlsProperties`, `canManageMlsFeeds` | Both default off. Grant in Super Permissions. Manage depends on view: revoking view also revokes manage. |
| Ingestion worker | `server/mlsIngestionWorker.ts` | Separate Railway process (`SAVVYOS_PROCESS=mlsIngestionWorker`) |

## Data model

Four layers, so raw provider data, cleaned listing data, the physical property, and our own STR context never overwrite each other.

| Layer | Tables | Purpose |
|---|---|---|
| Registry | `mls_sources`, `mls_feeds`, `mls_field_mappings`, `mls_metadata_snapshots` | One row per MLS organization. One row per connection (provider, feed type, credential reference, license, media and retention policy). Per-source field overrides. Weekly `$metadata` snapshots for local-field detection. |
| Raw | `mls_raw_records` | Exact provider payload, gzipped, with a content hash so unchanged records are skipped. Deleted with the listing when the license requires purge. |
| Canonical | `mls_listings`, `mls_listing_history`, `mls_media`, `mls_members`, `mls_offices`, `mls_open_houses` | RESO-aligned listing fields plus `localFields` JSON for MLS-specific fields and `fieldSources` provenance. History captures listed, relisted, price, status, pending, closed, withdrawn, expired, canceled, back on market, and removed events. |
| Property | `mls_properties`, `mls_property_insights` | One physical property linked to every listing over time and across MLSs (address key, then parcel key, then listing key fallback). Insights hold Savvy-owned fields (STR data, comps, pro forma links later) and survive feed churn. |
| Operations | `mls_sync_cursors`, `mls_sync_runs`, `mls_provider_usage`, `mls_worker_heartbeats` | Resumable replication cursors per feed and resource, run logs, request and byte accounting per credential, worker liveness. |

Tables are created by the idempotent startup guard in `server/mls/schema.ts` (production, or `MLS_SCHEMA_ENSURE=on`). The same DDL is in `drizzle/20260929_mls_properties.sql`. If `drizzle/mlsSchema.ts` changes, regenerate both.

## Ingestion flow

Each feed runs as a cycle inside the worker:

1. Take a lease on the feed row so only one worker processes it.
2. Refuse to run if `licenseError(feed)` returns a reason (no signed reference, internal use not approved, expired, or history retention not approved).
3. For each resource (Property, Member, Office, OpenHouse), replicate from the saved cursor. First pass is a full initial load, then incremental by `ModificationTimestamp`. Pages are processed and checkpointed one at a time, so a restart resumes where it stopped.
4. Normalize each record: code defaults (RESO Data Dictionary to canonical), then per-source overrides from `mls_field_mappings`, then local fields detected from metadata. Every field records where it came from.
5. Store raw, upsert the listing, link or create the physical property, write history events, and diff media against policy.
6. Handle deletions: MLS Grid `MlgCanView=false`, RESO `Deleted` resources where offered, and scheduled key reconciliation for providers without delete signals. Reconciliation aborts if it would remove more than max(1,000, 20%) of a feed, unless forced.
7. Refresh metadata weekly, write the run log, and release the lease.

Photos download in a separate media loop, by priority (primary photo first, then active listings, then everything else), under each provider's media limits. They are stored in a dedicated private bucket (a Railway Storage Bucket in production) and served only through `/api/mls/media`, which checks the session, the MLS permission, and the feed license, then redirects to a 60-second signed URL. Nothing is hotlinked.

## Provider adapters

| Provider | Markets on the seed list | Auth | Replication and deletes | Limits applied (with safety factor) |
|---|---|---|---|---|
| MLS Grid | Canopy, MIBOR, Stellar, MARIS, Unlock/ACTRIS, Spartanburg, MLSOK, Realtracs | Bearer token | `ModificationTimestamp` filter by `OriginatingSystemName`, `MlgCanView=false` removal, full reload if paused longer than 7 days | 2 req/s, 7,200/hour, 40,000/day, 4 GB media/hour, sequential. Media downloads send the token as `User-Agent`. |
| Trestle (Cotality) | Doorify, Hive, Western Upstate, CPAR, HAR, MIAMI, Montana Regional, ArkansasONE, Bright | OAuth client credentials, cached token | Keyset paging on `ModificationTimestamp` and `ListingKey`, key reconciliation | 180/min, 7,200/hour, 18,000 media/hour |
| Spark (FBS) | PMAR, MOREMLS, ECAR, Space Coast, realMLS, MichRIC, CCIMLS, ARMLS (direct license) | Bearer token | Replication endpoint, two-sided timestamp window, key reconciliation | 1,500 per 5 min (IDX) or 4,000 (VOW, back office) |
| Direct RESO Web API | UtahRealEstate.com, others as they come | Bearer or client credentials | Keyset paging, optional `Deleted` resource, reconciliation | Configurable per feed |
| Custom | Outer Banks, Baldwin (Perchwell), CCORMLS until the route is confirmed | None yet | Registered but refuses to sync | None |

Provider notes and source links are in `server/mls/adapters/*.ts` headers and the research report.

## Compliance controls in code

- **License gate** on every sync and every read: search, map, detail, history, other listings, raw payload, and photo delivery.
- **Retention policy** per feed: `purge` (default) deletes listing content when it leaves the feed. `retain_history` requires `options.license.retainHistory=true`.
- **Confidential fields** listed in the source compliance profile are stripped from the detail view.
- **Seller opt-outs** (internet display, address, AVM, comments) are stored and surfaced on the listing.
- **Attribution and disclaimer** templates per source, filled with the listing office and last sync time.
- **Freshness** warnings when a feed is older than its `maxStalenessHours`.
- **Photo policy** per feed (all, active all else primary, primary only, none). Closed listings follow the stricter rule where the MLS limits sold photos.
- **AI and MCP isolation**: `mls_*` tables are excluded from the read-only MCP endpoint. Do not add embeddings, AI summaries, or model training on MLS data without written approval from that MLS.
- **Secrets** stay in Railway variables. The database stores only a credential reference.

## Go-live checklist for one MLS

1. Signed agreement with the MLS, the sponsoring broker, and the provider that covers internal back-office use, the fields you need, photo storage, and history retention if wanted. Record the exact limits.
2. Create a Railway Storage Bucket for MLS media (private by default). On both the web and worker services, set `MLS_MEDIA_BUCKET`, `MLS_MEDIA_ENDPOINT`, `MLS_MEDIA_REGION`, `MLS_MEDIA_ACCESS_KEY_ID`, and `MLS_MEDIA_SECRET_ACCESS_KEY` as variable references to the bucket's `BUCKET`, `ENDPOINT`, `REGION`, `ACCESS_KEY_ID`, and `SECRET_ACCESS_KEY`. It must never be the public `savvyos` bucket.
3. Add the credential in Railway: `MLS_CRED_<REF>_TOKEN`, or `MLS_CRED_<REF>_CLIENT_ID` and `MLS_CRED_<REF>_CLIENT_SECRET` for OAuth.
4. Add a Railway service from this repo with `SAVVYOS_PROCESS=mlsIngestionWorker`, plus the same `DATABASE_URL`, AWS, and `MLS_*` variables as the web service.
5. In **Feeds and mappings**, update the source with the signed terms (confidential fields, attribution, disclaimer, refresh rule), then create the feed: provider, feed type, credential reference, `OriginatingSystemName` and key prefix where required, media and retention policy.
6. In the feed's advanced options, record the license:
   ```json
   { "license": { "approved": true, "internalUse": true, "reference": "Canopy BO agreement signed 2026-10-15", "expiresAt": "2027-10-15" } }
   ```
7. Use **Test connection**, then enable the feed. Watch Runs and Health through the first full load.
8. Review unmapped local fields in the Mappings tab and add overrides where needed.

## Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `SAVVYOS_PROCESS=mlsIngestionWorker` | Worker service | Starts the ingestion worker instead of the web server |
| `MLS_MEDIA_BUCKET` | Web and worker | Dedicated private bucket for MLS photos. Media work waits until it is set. |
| `MLS_MEDIA_ENDPOINT`, `MLS_MEDIA_REGION`, `MLS_MEDIA_ACCESS_KEY_ID`, `MLS_MEDIA_SECRET_ACCESS_KEY` | Web and worker | Railway bucket connection, as variable references. Leave the endpoint empty to use a private AWS bucket with the default AWS credentials. |
| `MLS_MEDIA_FORCE_PATH_STYLE=true` | Web and worker | Only for older buckets that require path-style URLs |
| `MLS_CRED_<REF>_TOKEN`, `_CLIENT_ID`, `_CLIENT_SECRET` | Worker, and web for Test connection | Provider credentials by reference |
| `MLS_INGESTION=off` | Worker | Keep the worker idle |
| `MLS_INGESTION_IN_WEB=on` | Web | Run ingestion inside the web process (small deployments only) |
| `MLS_WORKER_TICK_MS` | Worker | Scheduler tick, default 15,000 |
| `MLS_MEDIA_REQUESTS_PER_SECOND` | Worker | Global media request ceiling, default 10 |
| `MLS_SCHEMA_ENSURE=on` | Non-production | Run the schema guard outside production |

## Scale notes

Built for millions of listings on the existing MySQL: payloads are gzipped, unchanged records are skipped by hash, paging is keyset-based, search and map queries use composite indexes, and the map clusters server-side above 500 pins. Watch these as volume grows:

- Past roughly 5 to 10 million listings, move free-text and geo search to a dedicated index (OpenSearch or similar) fed from `mls_listings`.
- Raw records are the largest table. Consider a separate database or object storage for `mls_raw_records` once it passes a few hundred GB.
- Run one worker per provider credential lane before adding more. Limits are per credential, so extra workers on the same credential do not go faster.

## Not built yet (intentional)

Pro formas, publishing to the public website, STR data and comps, seller and buyer tracking across transactions in the UI, home value estimates, and any AI use. The `mls_property_insights` table and the property identity layer are where those will attach.

## Tests

```bash
pnpm vitest run server/mls                      # unit tests
MLS_E2E_DATABASE_URL=mysql://root@127.0.0.1:3307/savvyos_mls_e2e \
  pnpm vitest run server/mls/mls.e2e.test.ts    # end to end with local MySQL and a mock MLS Grid server
```

## Licensed feeds declared in code

`server/mls/feedBootstrap.ts` lists the feeds Savvy has licensed. On startup (web and worker), SavvyOS creates any that are missing under a MySQL named lock. It also applies the fast-import settings **once** to existing declared MLS Grid feeds. Admin changes after that migration always win. Set `MLS_DECLARED_FEEDS=off` to skip this.

| Feed | Token variable | Why |
|---|---|---|
| Canopy BBO (MLS Grid), `carolina` | `MLS_CRED_MLSGRID_BBO_TOKEN` | Back office superset: 2.6M records back to 2007, including canceled and expired. Each record keeps MLS Grid's `MlgCanUse` flags in `mls_listings.permittedUses`. |
| MARIS IDX (MLS Grid), `maris2` | `MLS_CRED_MLSGRID_TOKEN` | MARIS is open on the IDX subscription only. |

There is deliberately no Canopy IDX feed. It would duplicate every Canopy listing. When the public site is built, show only listings whose `permittedUses` includes `IDX`.

Until a token variable is set, that feed shows "Credentials not configured" and the worker skips it.

## MLS Grid usage budget

MLS Grid meters each access token as a whole: API pages, single-listing photo-link refreshes, and photo downloads from media.mlsgrid.com all count toward the same request and byte caps. `server/mls/adapters/mlsGrid.ts` (`MLS_GRID_LIMITS`) records the published limits and the warning and suspension thresholds from MLS Grid's Sept 30, 2026 notice. **Tyler confirmed that MLS Grid waived its limits through Friday, Oct 2, 2026 at 4 p.m. ET (20:00 UTC).** Until that instant, SavvyOS uses a controlled 4 RPS, 20,000 requests/hour, 250,000 requests/day and 12 GB/hour, with photos held to a 10% share so listing changes win. This is intentionally not unlimited. The in-process limiters return to the normal caps at the deadline without needing a restart. After the waiver the adapter caps each token at `rateSafety` (default 0.8, never above 0.9) of the lower of published and warning:

| Per token | Cap at 0.8 |
|---|---|
| Requests per second | 1.6 |
| Requests per hour | 5,760 |
| Requests per 24 hours | 32,000 |
| Bytes per hour | 2.458 GB |
| Bytes per 24 hours | 32 GB |

`server/mls/http.ts` enforces this with one limiter per token. The media limiter is chained onto it, so photos draw from the same budget, and photos alone may use at most `mediaShare` (default 0.75, max 0.9) so replication keeps room. Bytes are counted from `Content-Length` when sent (compressed size), otherwise the decoded size. On start, each lane reloads the last 25 hours from `mls_provider_usage`, so a restart or deploy cannot reset the rolling windows. Tests: `MLS Grid token budget` in `mls.test.ts` and the restart test in `mls.e2e.test.ts`.

Photo backfill is bound by the daily request cap after the waiver (one request per photo). For future faster backfills, ask MLS Grid about CDN media access with non-expiring links or a separate approved limit increase.

## Fast first load (Oct 1, 2026)

The two declared MLS Grid feeds get `options.fastImportV1=true`, `syncIntervalMinutes=5`, and `mediaPolicy=primary_only` once. Other providers are unchanged.

Canopy and MARIS now use three Property cursors per feed: `Priority:Property` imports active, coming soon, under-contract, and pending listings first with Media expanded for main-photo metadata; `Live:Property` is seeded before that pass and catches all changes since it started, including lost display rights; `Property` resumes the full historical pass without Media expansion. Rooms and UnitTypes remain expanded. Historical work is limited to 100 pages per worker cycle until the waiver ends, then 20 pages; a live check runs again between historical pages if they take over four minutes. Other resources are capped at 20 pages per cycle until caught up. A transient database failure or failure to save an invalid record holds the checkpoint. A deterministic bad row is advanced **only after** its full provider payload has been saved in the private `mls_import_exceptions` table; at most 20 exceptions are retried per feed cycle. The manager-only Runs tab shows the count, listing key, safe SQL error code, and attempt count. Deletions remove matching quarantined payloads. When history finishes, the live high-water mark is copied to the regular Property cursor. Market prefill itself is not interrupted by live checks; a large prefill can delay the first live check. The admin search becomes populated as pages arrive, not only after the full history finishes.

Historical pages without Media cannot delete photos already held. A provider record older than our stored `ModificationTimestamp` cannot roll a newer status or price back; the seen timestamp still updates for the final sweep. MLS Grid returned gzip without Content-Length on a live sample. `wireBytes` counts the decoded size in that case, conservatively. It does **not** infer a smaller compressed size or weaken the byte limit to speed up import.

Only main photos are initially queued during ingestion, keeping live listing changes fast. A separate `ActiveGallery` cursor scans each licensed MLS Grid feed in small ID-ordered batches. It queues the **complete available gallery** for Active listings whose stored-photo count is below the provider's `PhotosCount`, without a table-wide COUNT or mass UPDATE. The worker bounds the outstanding queue, refreshes up to 20 listings' expiring media links in one `ListingId in (...)` request, and stores every permitted photo privately. Repeated scans are idempotent; a listing newly becoming Active is queued immediately on its status change, even if the scan has passed its ID. The admin detail view shows stored/expected counts and a real queued state. Non-Active galleries remain on demand. The web process never contacts MLS Grid or hotlinks provider MediaURLs. MLS-specific restrictions, including primary-only closed photos, still apply. MLS Feeds → Health reports each scan's progress. Tests cover two simultaneous galleries and full photo storage with MySQL and a mock MLS Grid server.

For MLS Grid's approved waiver ending **October 2, 2026 at 4 p.m. ET**, the worker keeps larger aggregate request/byte ceilings (40,000/hour and 500,000/rolling day per token); 75% may be spent on media, with up to eight concurrent downloads. The first 8-RPS trial provoked MLS Grid 429s and a 15-minute pause, so the shared token-wide pace was returned to **4 RPS** on October 1 rather than repeatedly stalling the feeds. Media still shares that same limiter as listing data. Both normal rate/byte windows resume automatically at the cutoff without a restart. **Active covers go first, then other Active gallery photos, then other market statuses and requested galleries.** Existing queued rows obey the current listing status; no bulk media priority UPDATE is required. The worker uses indexed existence checks rather than counting the large expired queue every batch. Database throughput, storage I/O, expiring provider URLs, and gallery discovery can still slow the backfill even when MLS Grid waives limits. MLS Feeds → Health reports photo rows, private-storage configuration, per-token used/allowed requests, and Active gallery scan progress. Never hotlink provider MediaURLs, which are one-time and short-lived.

Do not promise an under-hour market import, under-day history import, or a six-minute status latency until the real worker and its run logs confirm them. A worker stuck on a long market-prefill page, a full token budget, or a provider delay makes those estimates unreliable.

The public `/healthz/mls/worker` endpoint returns the latest worker heartbeat's commit prefix, age in seconds, and an `alive` boolean (90-second freshness threshold). It exposes no worker ID, listing, MLS, or credentials and caches the read for 30 seconds. A live heartbeat on the current commit proves the worker deployed and is running; it does **not** prove the feeds are importing. Check Runs and Health in the admin module for rows received, cursor progress, credentials, and errors.
