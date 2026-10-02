# MLS Properties

MLS Properties is a standalone admin module for ingesting, normalizing, searching, and viewing listings from many MLS feeds. It will replace the current Properties section later. For now it is fully isolated: it does not read from or write to Properties, Listings, the public website, CRM contacts, pro formas, AI features, or the read-only MCP endpoint.

**Nothing ingests until a signed license is recorded for the feed.** Having a credential is not the same as having a license. See [MLS licensing and integration research](./mls-integration-research.md) for the 29-market rules matrix.

## What ships in this module

| Area | Location | Notes |
|---|---|---|
| Property search | `/mls-properties` | Active/For sale/Newest defaults; responsive List and Split cards; map with photo previews, radius/polygon drawing, source-aware filters and shared map/list area |
| Listing detail | `/mls-properties/listings/:id` | Gallery, facts, features, property history across transactions, other listings at the same property, open houses, seller opt-out notices, attribution and disclaimer, field lineage, raw payload (managers only) |
| Feeds and mappings | `/mls-properties/feeds` | Sources (29 MLSs seeded), feeds, sync runs, field mappings, worker health and provider usage |
| Permissions | `canViewMlsProperties`, `canManageMlsFeeds` | Both default off. Grant in Super Permissions. Manage depends on view: revoking view also revokes manage. |
| Ingestion worker | `server/mlsIngestionWorker.ts` | Separate Railway process (`SAVVYOS_PROCESS=mlsIngestionWorker`) |

### Admin search and map

List, Split, and Map use the same filters. **Search as I move the map** defaults on. Moving the map selects a viewport for the list, even after returning to List; the map retains its center and zoom instead of resetting to Asheville. An area chip clears the selected viewport without clearing the other filters. If auto-search is turned off, **Search this area** explicitly applies the current viewport. Drawing a radius or polygon replaces the prior shape, filters both list and map via indexed latitude/longitude bounds plus an exact MySQL spatial predicate, and remains available after switching views. Only one shape is active at a time. Polygon inputs reject self-crossing and excessive vertices. Map pin popups show the licensed listing's privately stored image and key facts; cluster bubbles are deliberately coarser than before so they do not blanket the tiles. The OSM basemap remains human-viewport-only with visible attribution, not a prefetching or public MLS display feature.

The default **Newest** sort uses original MLS entry date, not the last sync time. An additive online `mls_listings_status_entry_idx` is created under a MySQL advisory lock on existing databases; the same index is in the Drizzle schema and fresh-install DDL. The default Active/For sale search uses that ordered index so it does not sort millions of imported rows. Filters include for sale/rent, price, beds, baths, size, lot, year, garage, pool, waterfront, photos actually stored, new construction, listing recency and days on market. Selecting exactly one licensed MLS loads its actual Active property subtypes, native MLS statuses and counties, and clears source-specific choices when the selection changes. These facets are derived from licensed canonical listings, never raw payloads or restricted local fields.

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
| `MAPBOX_PUBLIC_TOKEN` | Web service only | Public Mapbox `pk.` browser token, served only to authorized MLS users at runtime. Restrict it to `os.savvy-agents.com` in Mapbox; never use an `sk.` token. |

Map/Split lazily loads the Mapbox GL Standard vector map and Terra Draw circle/polygon tools when that token is configured. List remains map-free. If the token is missing or the style fails to load, the existing Leaflet map remains available. Shapes still filter the licensed SavvyOS search and map APIs; MLS records and private photo URLs are not handed to Mapbox as a dataset.

The admin search keeps Filters inside an independently scrollable, viewport-height-limited panel. Numeric fields display currency/commas and reject nonnumeric, out-of-range values at both the browser and search API boundary. Mapbox shows "Updating count" during a pan or shape search rather than leaving a stale number on screen; edited shapes debounce before the licensed map count refresh. Pin popups are exclusive and duplicate viewport/count updates are suppressed. On listing detail, load the current private photo before lazy thumbnail requests, keep the active thumbnail centered, and offer a fullscreen gallery. Source/display rules and technical lineage appear after property facts and features; seller comment/valuation notices are no longer repeated as top-of-page warnings. MLS read authorization, photo access and compliance gating remain unchanged.

## Scale notes

Built for millions of listings on the existing MySQL: payloads are gzipped, unchanged records are skipped by hash, ingestion paging is keyset-based, search and map queries use composite indexes, and the map clusters server-side above 20 pins. Watch these as volume grows:

- Active/Newest searches load ordered IDs first, then hydrate only the selected 12 cards. For a broad map viewport, a drawn area or a single selected MLS with no other selective filter, a chronological-index probe has an 800-ms SQL deadline. Sparse/empty geographic areas fall back to the geographic index; a sparse source without geography falls back to its normal source access path. Map view preloads the first list page after the viewport settles. Resizing between Map and Split preserves the selected search area; only an actual pan/zoom or explicit area action changes the List query.
- Card, exact-total, map and listing-detail API requests use independent HTTP links so a slow source-facet lookup cannot hold their responses in a shared tRPC batch. Source-native filter choices load only when Filters opens for one selected MLS; the list does not query all native facets on cold page load. The facet lookup itself can still take seconds on a large feed, so keep its loading indicator visible inside Filters.
- Exact totals and page counts run through a separate licensed query **after** the first cards load. The shared search predicate checks listing feed IDs against a small licensed feed set instead of evaluating the same JSON license criteria row by row; photo serving retains its own per-image read gate. When no shape is drawn, the map's exact count for the same viewport can be reused immediately. Until an uncached count finishes, show "calculating total" rather than blocking cards or inventing a number. Counts are browser-cached for 30 seconds and may change as new listings arrive. Avoid expecting arbitrary MySQL radius/polygon counts over millions of rows to be instant.
- MARIS IDX/BBO preference resolves the two feed IDs through uncorrelated subqueries, and a CASE limits indexed listing-number checks to MARIS IDX rows. The BBO feed ID is eligible only while its recorded internal-use license passes the same approval/expiry/retention gate as all other MLS reads; no BBO record suppresses IDX after removal or license revocation.
- A newly preferred BBO listing can have no photos even while its older, separately licensed IDX copy already has a complete gallery. For only the selected page's 12 cards and a photo-less BBO detail, SavvyOS looks up an IDX sibling with the **same source, canonical property ID, MLS number and status** using existing property/media indexes. Both feeds must be enabled with valid internal-use licenses; the IDX media rows remain owned by the IDX listing, and each private photo request independently rechecks that listing and feed license. The detail page labels the IDX photo source and reports BBO import progress separately. Once BBO photos arrive, they take precedence. Never copy IDX media rows into BBO or expose a provider media URL directly.
- When exactly one MLS is selected, an unambiguous MLS number seeks the existing `(sourceId, listingNumber)` index for first-page cards, exact totals and map pins **even with a saved map area or drawn shape**. ZIP searches are intentionally excluded because their predicate also matches address text. **Full street-address prefix search still needs its own index or search service**; a rare broad address query can be slow until that separate rollout is complete. Do not run a blocking address-index migration during web startup.
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
| MARIS IDX (MLS Grid), `maris2` | `MLS_CRED_MLSGRID_TOKEN` | Existing IDX subscription; retained as a separate licensed feed and an admin-search fallback while BBO fills. |
| MARIS BBO (MLS Grid), `maris2` | `MLS_CRED_MLSGRID_BBO_TOKEN` | Two active MARIS (NEW) Savvy OS licenses were confirmed on the existing BBO subscription Oct 2, 2026. Shares the Canopy BBO credential's rate and byte budget, not a new token lane. |

There is deliberately no Canopy IDX feed. It would duplicate every Canopy listing. When the public site is built, show only listings whose `permittedUses` includes `IDX`.

MARIS is different: it has separately licensed IDX and BBO feeds. Canonical rows, raw records, photos and license flags remain distinct. Admin cards, map pins and exact totals **prefer a BBO row only once a matching, licensed, non-removed BBO listing is present**, using `(sourceId, listingNumber)`; until then IDX remains visible. Revoking or removing BBO makes the matching IDX row visible again. This read preference does not authorize public use of BBO data or media; the eventual public site must apply its own feed- and listing-level IDX rights checks. Do not disable the MARIS IDX feed just to hide duplicates.

Until a token variable is set, that feed shows "Credentials not configured" and the worker skips it.

## MLS Grid usage budget

MLS Grid meters each access token as a whole: API pages, single-listing photo-link refreshes, and photo downloads from media.mlsgrid.com all count toward the same request and byte caps. `server/mls/adapters/mlsGrid.ts` (`MLS_GRID_LIMITS`) records the published limits and the warning and suspension thresholds from MLS Grid's Sept 30, 2026 notice. **Tyler confirmed that MLS Grid waived its limits through Friday, Oct 2, 2026 at 4 p.m. ET (20:00 UTC).** Since both 8 and 4 RPS still produced provider 429s, SavvyOS currently uses a conservative **1.8 RPS, 6,500 requests/hour and 35,000 requests/rolling day per token**, with at most **85%** of the request budget available to photos. See the observed throttling and Active-gallery details below. This is intentionally not unlimited. The in-process limiters return to the normal caps at the deadline without needing a restart. After the waiver the adapter caps each token at `rateSafety` (default 0.8, never above 0.9) of the lower of published and warning:

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

Only main photos are initially queued during ingestion, keeping live listing changes fast. A separate `ActiveGallery` cursor scans each licensed MLS Grid feed in small ID-ordered batches. It queues the **complete available gallery** for Active listings whose stored-photo count is below the provider's `PhotosCount`, without a table-wide COUNT or mass UPDATE. Discovery runs on every worker tick independently of the photo-download lane, so an MLS Grid 429 pause cannot freeze the scan cursor. At most 240 priority-zero rows per feed can be outstanding; the worker refreshes up to 20 listings' expiring media links in one `ListingId in (...)` request and stores every permitted photo privately. Repeated scans are idempotent; a listing newly becoming Active is queued immediately on its status change, even if the scan has passed its ID. The admin detail view shows stored/expected counts and a real queued state. Non-Active galleries remain on demand. The web process never contacts MLS Grid or hotlinks provider MediaURLs. MLS-specific restrictions, including primary-only closed photos, still apply. MLS Feeds → Health reports each scan's progress. Tests cover two simultaneous galleries and full photo storage with MySQL and a mock MLS Grid server.

Private photo requests formerly selected by `mls_media.s3Key` alone, which is unindexed across millions of rows and could take over a minute per card. Search, detail, and newly stored photo URLs now carry the listing ID. The route requires that hint and uses `mls_media_listing_idx`, then still verifies the exact stored key, stored status, unremoved listing, active admin permission, and feed license before issuing a 60-second signed private-storage redirect. Older stored URLs are upgraded in API responses; old standalone image links without a listing ID fail closed until the page is refreshed. No production table rebuild or public bucket is needed.

For MLS Grid's stated waiver ending **October 2, 2026 at 4 p.m. ET**, both **8 and 4 RPS** trials still caused provider 429s and 15-minute media-lane pauses. The waiver's scope or activation on media/CDN endpoints and both tokens requires MLS Grid confirmation. Until then, the per-token shared limiter runs at **1.8 RPS, 6,500 requests/hour and 35,000/rolling day**, below the published warning thresholds, with up to eight concurrent photo transfers. Once the Active-first listing prefill completed on both feeds, the temporary media allocation rose from 75% to **85%** of that unchanged shared budget: at most **29,750 photo requests per rolling day per token**, leaving at least **5,250 slots for non-photo API requests**, including listing updates, gallery metadata, and history. This releases 3,500 more photo requests per token after the original media share is exhausted, without increasing the provider request rate or daily total. It does not guarantee full galleries before the waiver ends. This is a safety response to observed production failures, not a claim that the waiver has been withdrawn. Normal rate and byte limits, including the original 75% media share, resume automatically at the cutoff without a restart. **Active covers go first, then other Active gallery photos, then other market statuses and requested galleries.** Existing queued rows obey the current listing status; no bulk media priority UPDATE is required. The worker uses indexed existence checks rather than counting the large expired queue every batch. Database throughput, storage I/O, expiring provider URLs, and gallery discovery can still slow the backfill. MLS Feeds → Health reports photo rows, private-storage configuration, per-token used/allowed requests, and Active gallery scan progress. Never hotlink provider MediaURLs, which are one-time and short-lived.

Do not promise an under-hour market import, under-day history import, or a six-minute status latency until the real worker and its run logs confirm them. A worker stuck on a long market-prefill page, a full token budget, or a provider delay makes those estimates unreliable.

The public `/healthz/mls/worker` endpoint returns the latest worker heartbeat's commit prefix, age in seconds, and an `alive` boolean (90-second freshness threshold). It exposes no worker ID, listing, MLS, or credentials and caches the read for 30 seconds. A live heartbeat on the current commit proves the worker deployed and is running; it does **not** prove the feeds are importing. Check Runs and Health in the admin module for rows received, cursor progress, credentials, and errors.
