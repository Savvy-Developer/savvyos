# MLS Properties

MLS Properties is a standalone admin module for ingesting, normalizing, searching, and viewing listings from many MLS feeds. It will replace the current Properties section later. For now it is fully isolated: it does not read from or write to Properties, Listings, the public website, CRM contacts, pro formas, AI features, or the read-only MCP endpoint.

**Nothing ingests until a signed license is recorded for the feed.** Having a credential is not the same as having a license. See [MLS licensing and integration research](./mls-integration-research.md) for the 29-market rules matrix.

## What ships in this module

| Area | Location | Notes |
|---|---|---|
| Property search | `/mls-properties` | Active/For sale/Newest defaults; responsive List and Split cards; map with photo previews, radius/polygon drawing, source-aware filters and shared map/list area |
| Listing detail | `/mls-properties/listings/:id` | Gallery, facts, features, property history across transactions, other listings at the same property, open houses, seller opt-out notices, attribution and disclaimer, field lineage, raw payload (managers only) |
| Feeds and mappings | `/mls-properties/feeds` | Sources (29 MLSs seeded), feeds, sync runs, field mappings, worker health and provider usage |
| Permissions | `canViewMlsProperties`, `canManageMlsFeeds` | Both default off. Grant in Super Permissions. Manage depends on view: revoking view also revokes manage. Agents get access only through Agent Assignments (below). |
| Agent Assignments | **Agent Assignments** button on `/mls-properties` (MLS managers) | Pick which licensed MLSs each active agent can search. An agent with at least one MLS gets an **MLS Properties** tab in their sidebar. |
| Saved Views | **Saved Views** button on `/mls-properties` (agents only; hidden for admins) | Save the current filters, sort, view, map camera, map area and drawn shape under a name; pick one later; mark one as the default view. |
| Ingestion worker | `server/mlsIngestionWorker.ts` | Separate Railway process (`SAVVYOS_PROCESS=mlsIngestionWorker`) |

### Agent Assignments and Saved Views (Oct 9, 2026)

**Who sees what.** `server/mls/access.ts` resolves one rule used by every MLS read route and by the private photo route:

| User | Access |
|---|---|
| Admin with `canViewMlsProperties` | Every licensed MLS, as before |
| Active agent (`role = agent`, full user) with assignments | Only listings from the assigned MLSs, and only listings still in the feed |
| Agent with no assignment, ISA, agent support, inactive user | None. The tab is hidden and the routes return FORBIDDEN |

The server narrows every agent query itself (`scopeSearchFilters`): search, exact total, map pins, single-MLS facets, listing detail, its history and other listings at the same address, and stored cover photos. Asking for an unassigned MLS matches nothing; it never falls back to all MLSs. A listing from another MLS returns the same NOT_FOUND as a missing one. Feed health, raw payloads, photo health, mappings and Agent Assignments stay with MLS managers.

**Licensing.** Assign an MLS only to agents who are members of that MLS and covered by its agreement. Agents see that MLS's listings inside SavvyOS, including back office (BBO) fields. Nothing here makes MLS data public.

**Saved Views.** Saved Views are an agent feature. Only agents with at least one assigned MLS see the button, and every saved view route refuses admins on the server (`agentViewProcedure`), so admins get no saved views and no default view. An admin using Simulate As acts as that agent and sees that agent's views. Each agent's views are private. Names are unique per agent (up to 80 characters, 50 views per agent). Exactly one default view per agent is enforced by a unique generated column, not just app code. The default applies once when a browser tab first opens MLS Properties; after that the tab keeps whatever the user is looking at. Applying a view drops any MLS the user can no longer see. A view saved in a format that no longer validates comes back without a state and asks to be re-saved instead of breaking the list.

**Storage.** `agent_mls_assignments` and `user_mls_saved_views` are user records, so they live in the **app** database (nightly backups), not the re-importable MLS database. Both cascade-delete with the user. The web process creates them at startup (`ensureMlsAccessSchema`); a failure there is logged and does not stop the site. Same DDL: `drizzle/20261009_mls_agent_access.sql`.

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

1. Take a lease on the feed row so only one worker processes it. A lease held by a worker with no heartbeat for 3 minutes is taken over at once (Railway deploys kill the old container without releasing leases), and any run that worker left as `running` is closed as `aborted`.
2. Refuse to run if `licenseError(feed)` returns a reason (no signed reference, internal use not approved, expired, or history retention not approved).
3. For each resource (Property, Member, Office, OpenHouse), replicate from the saved cursor. First pass is a full initial load, then incremental by `ModificationTimestamp`. Pages are processed and checkpointed one at a time, so a restart resumes where it stopped.
4. Normalize each record: code defaults (RESO Data Dictionary to canonical), then per-source overrides from `mls_field_mappings`, then local fields detected from metadata. Every field records where it came from.
5. Store raw, upsert the listing, link or create the physical property, write history events, and diff media against policy.
6. Handle deletions: MLS Grid `MlgCanView=false`, RESO `Deleted` resources where offered, and scheduled key reconciliation for providers without delete signals. Reconciliation aborts if it would remove more than max(1,000, 20%) of a feed, unless forced.
7. Refresh metadata weekly, write the run log, and release the lease.

**Retry after a failed cycle.** A provider, credential, or configuration failure marks the feed `error` and backs off to double its interval (at least 30 minutes) so a broken feed does not spend API calls. A transient failure in our own write path (deadlock victim, lock timeout, dropped database or network connection) keeps the page checkpoint, is recorded as `Transient: ...` in `lastError`, and retries at the feed's normal interval. One deadlock therefore cannot pause a feed's live sync or its import bursts for half an hour.

**Lane scheduling.** Feeds that share a provider token form one lane, and a lane makes one API call at a time. Each scheduling round on a lane is: a **live pass** for every feed whose sync interval is due (live listing changes, members, offices, open houses, deletions; no import work), then **one import burst** for the feed with import backlog that has waited longest (round robin). A burst runs the on-market prefill until it finishes, then the full history, and stops after `MLS_IMPORT_BURST_MS` (default 2 minutes, at a page boundary, at least one page in) or 20 history pages. It resumes from the saved cursor next round. Live latency for every feed is therefore about its sync interval plus one burst, however many MLSs share the token, and the next burst starts at once when nothing else is due. Only timestamp-ordered passes are time-boxed: they can resume from the saved boundary even if a stored next link has expired. Unordered passes (Trestle replication links expire in 5 minutes) run to their page budget as before.

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

### Adding another MLS Grid MLS (the MIBOR path, Oct 9, 2026)

No new service, database, token or deploy setting is needed when MLS Grid adds an MLS to an existing subscription.

1. Confirm access with one small read-only request per token: `Property?$filter=OriginatingSystemName eq '<name>' and MlgCanView eq true&$top=1&$count=true`. A 403 "OriginatingSystemName forbidden" means that license is not on that token yet.
2. Check the source seed in `server/mls/sources.ts`: `originatingSystemName`, `keyPrefix` and `mapCenter` (where the map opens when only that MLS is selected). A unit test fails if any declared feed's source lacks them.
3. Add the feed(s) to `DECLARED_MLS_FEEDS` with the license record (who it is licensed to, approval date, finalization date). IDX uses `MLSGRID`, BBO uses `MLSGRID_BBO`. Licensing both is fine; search shows the BBO row and hides its IDX twin automatically.
4. Size the disk: about 24.5 KB per stored record across all MLS tables (Oct 9, 2026 measurement). Keep the MLS volume under its 200 GB alert after the full import.
5. Merge. On deploy, the worker creates the feeds, imports on-market listings first, then history, sharing the token's 1 request/s pace with the feeds already on that token.
6. Verify: `/healthz/mls` stays ok, the new feeds show runs in **Feeds and mappings**, and listings appear when the MLS is selected in search.

## Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `SAVVYOS_PROCESS=mlsIngestionWorker` | Worker service | Starts the ingestion worker instead of the web server |
| `MLS_DATABASE_URL` | Web and worker | MySQL that holds every `mls_*` table, as a variable reference to the dedicated MLS database service. App tables, including the two `admin_permissions` MLS columns, always stay on `DATABASE_URL`. Set it on both services together. Outside production, unset (or equal to `DATABASE_URL`) keeps the MLS tables in the app database. **In production, unset means MLS Properties is offline** (`/healthz/mls` fails and the worker idles) rather than silently rebuilding MLS tables in the app database. |
| `MLS_ALLOW_APP_DATABASE=on` | Web and worker | Only for a deliberate single-database production setup. Allows MLS tables in the app database when `MLS_DATABASE_URL` is unset. |
| `MLS_DB_POOL_SIZE` | Web and worker | Connections per process to the separate MLS database, default 15 |
| `MLS_MEDIA_BUCKET` | Web and worker | Dedicated private bucket for MLS photos. Media work waits until it is set. |
| `MLS_MEDIA_ENDPOINT`, `MLS_MEDIA_REGION`, `MLS_MEDIA_ACCESS_KEY_ID`, `MLS_MEDIA_SECRET_ACCESS_KEY` | Web and worker | Railway bucket connection, as variable references. Leave the endpoint empty to use a private AWS bucket with the default AWS credentials. |
| `MLS_MEDIA_FORCE_PATH_STYLE=true` | Web and worker | Only for older buckets that require path-style URLs |
| `MLS_CRED_<REF>_TOKEN`, `_CLIENT_ID`, `_CLIENT_SECRET` | Worker, and web for Test connection | Provider credentials by reference |
| `MLS_INGESTION=off` | Worker | Keep the worker idle |
| `MLS_INGESTION_IN_WEB=on` | Web | Run ingestion inside the web process (small deployments only) |
| `MLS_WORKER_TICK_MS` | Worker | Scheduler tick, default 15,000 |
| `MLS_IMPORT_BURST_MS` | Worker | Longest one import burst may hold a provider lane, default 120,000 (minimum 10,000). Lower keeps live syncs on a shared token tighter; higher trims per-burst overhead |
| `MLS_MEDIA_REQUESTS_PER_SECOND` | Worker | Photo request ceiling for non-MLS Grid providers, default 10 |
| `MLS_CDN_REQUESTS_PER_SECOND` | Worker | Optional MLS Grid CDN photo pace per token. Unset by default: MLS Grid publishes no CDN rate limit, so CDN photos are bounded only by transfer concurrency. CDN downloads are outside the API quotas; a CDN 429 pauses only this limiter. |
| `MLS_GRID_MEDIA_CONCURRENCY` | Worker | MLS Grid cover-photo transfers in flight per token (overrides the feed `mediaConcurrency` option), default 64, max 128. Batch size follows it (about six per slot). |
| `MLS_MEDIA_EMPTY_REFRESH_TTL_MS` | Worker | Providers with expiring links only (never MLS Grid). After a photo-link refresh stage finds nothing, skip it for this long (default 120,000) instead of rescanning the whole expired backlog every batch. `0` disables. |
| `MLS_SCHEMA_ENSURE=on` | Non-production | Run the schema guard outside production |
| `MAPBOX_PUBLIC_TOKEN` | Web service only | Public Mapbox `pk.` browser token, served only to authorized MLS users at runtime. Restrict it to `os.savvy-agents.com` in Mapbox; never use an `sk.` token. |

Map/Split lazily loads the Mapbox GL Standard vector map and Terra Draw circle/polygon tools when that token is configured. List remains map-free. If the token is missing or the style fails to load, the existing Leaflet map remains available. Shapes still filter the licensed SavvyOS search and map APIs; MLS records and private photo URLs are not handed to Mapbox as a dataset.

The admin search keeps Filters inside an independently scrollable, viewport-height-limited panel. Numeric fields display currency/commas and reject nonnumeric, out-of-range values at both the browser and search API boundary. Mapbox shows "Updating count" during a pan or shape search rather than leaving a stale number on screen; edited shapes debounce before the licensed map count refresh. Pin popups are exclusive and duplicate viewport/count updates are suppressed. On listing detail, load the current private photo before lazy thumbnail requests, keep the active thumbnail centered, and offer a fullscreen gallery. Source/display rules and technical lineage appear after property facts and features; seller comment/valuation notices are no longer repeated as top-of-page warnings. MLS read authorization, photo access and compliance gating remain unchanged.

## Scale notes

Built for millions of listings on the existing MySQL: payloads are gzipped, unchanged records are skipped by hash, ingestion paging is keyset-based, search and map queries use composite indexes, and the map clusters server-side above 20 pins. Watch these as volume grows:

- Active/Newest searches load ordered IDs first, then hydrate only the selected 12 cards. For a broad map viewport, a drawn area or a single selected MLS with no other selective filter, a chronological-index probe has an 800-ms SQL deadline. Sparse/empty geographic areas fall back to the geographic index; a sparse source without geography falls back to its normal source access path. Map view preloads the first list page after the viewport settles. Resizing between Map and Split preserves the selected search area; only an actual pan/zoom or explicit area action changes the List query.
- Card, exact-total, map and listing-detail API requests use independent HTTP links so a slow source-facet lookup cannot hold their responses in a shared tRPC batch. Source-native filter choices load only when Filters opens for one selected MLS; the list does not query all native facets on cold page load. The facet lookup itself can still take seconds on a large feed, so keep its loading indicator visible inside Filters.
- Exact totals and page counts run through a separate licensed query **after** the first cards load. The shared search predicate checks listing feed IDs against a small licensed feed set instead of evaluating the same JSON license criteria row by row; photo serving retains its own per-image read gate. When no shape is drawn, the map's exact count for the same viewport can be reused immediately. Until an uncached count finishes, show "calculating total" rather than blocking cards or inventing a number. Counts are browser-cached for 30 seconds and may change as new listings arrive. Avoid expecting arbitrary MySQL radius/polygon counts over millions of rows to be instant.
- IDX/BBO preference (MARIS and MIBOR, and any later MLS with both licenses) resolves the MLS Grid IDX and BBO feed sets through uncorrelated subqueries, and a CASE limits indexed listing-number checks to IDX rows. The candidate BBO row must share the listing's `sourceId`, so one MLS never hides another's listing. A BBO feed is eligible only while its recorded internal-use license passes the same approval/expiry/retention gate as all other MLS reads; no BBO record suppresses IDX after removal or license revocation.
- A newly preferred BBO listing can have no photos even while its older, separately licensed IDX copy already has a complete gallery. For only the selected page's 12 cards and a photo-less BBO detail, SavvyOS looks up an IDX sibling with the **same source, canonical property ID, MLS number and status** using existing property/media indexes. Both feeds must be enabled with valid internal-use licenses; the IDX media rows remain owned by the IDX listing, and each private photo request independently rechecks that listing and feed license. The detail page labels the IDX photo source and reports BBO import progress separately. Once BBO photos arrive, they take precedence. Never copy IDX media rows into BBO or expose a provider media URL directly.
- When exactly one MLS is selected, an unambiguous MLS number seeks the existing `(sourceId, listingNumber)` index for first-page cards, exact totals and map pins **even with a saved map area or drawn shape**. ZIP searches are intentionally excluded because their predicate also matches address text. **Full street-address prefix search still needs its own index or search service**; a rare broad address query can be slow until that separate rollout is complete. Do not run a blocking address-index migration during web startup.
- Past roughly 5 to 10 million listings, move free-text and geo search to a dedicated index (OpenSearch or similar) fed from `mls_listings`.
- MLS data lives in its own MySQL service (`MLS_DATABASE_URL`, since Oct 3, 2026) so imports never compete with the rest of SavvyOS for memory, disk or locks. The pre-split copies of the 18 `mls_*` tables (67 GB) were dropped from the app database on Oct 9, 2026, taking it from 71.5 GB to 4.4 GB. Raw records are the largest table after listings; consider object storage for `mls_raw_records` once it passes a few hundred GB.
- Moving MLS tables to a new, empty database: stop the worker, copy all `mls_*` tables (MySQL Shell `util.copyTables`), verify row counts, then set `MLS_DATABASE_URL` on web and worker. The schema guard refuses to create tables in an empty MLS database while the app database still holds MLS feeds, so a missed copy fails closed instead of starting a full re-import.
- Run one worker per provider credential lane before adding more. Limits are per credential, so extra workers on the same credential do not go faster.

**MLS-MySQL settings (verified Oct 3, 2026).** MySQL 9.7.2 on its own Railway service and 250 GB volume, with a 200 GB disk alert. Buffer pool 9 GB, redo capacity 4 GB, REPEATABLE READ, 151 max connections. The app database is a separate service and keeps default durability.

- `innodb_flush_log_at_trx_commit = 2`, set with `SET PERSIST` on MLS-MySQL only. Why: imports were commit-bound on the network volume. The change cut redo fsyncs to about 1.5 per second and raised import writes about 1.8x (178 to 320 rows/s). Risk: an OS or host crash (not a MySQL crash) can lose up to about one second of commits. Cursors and listings live in the same database, so recovery lands on a consistent earlier point and the worker re-pulls those pages from its saved cursor; record writes are idempotent. Never apply this to the app database. Revert with `SET PERSIST innodb_flush_log_at_trx_commit = 1`.
- Photo rows are written without upserts (#161): unchanged rows are skipped, changed rows are updated by ID, and new rows are batch-inserted. Per-photo `INSERT ... ON DUPLICATE KEY UPDATE` on unchanged rows burned auto-increment IDs and caused a lock convoy on the end of the `mls_media` primary key, about one deadlock per second. After the fix: 588 rows/s sustained, no deadlocks in 26 minutes, row-lock wait time down about 12x. Do not reintroduce per-row upserts on hot MLS tables.
- Measured import rate after these changes: about 17.5 records/s per credential lane (one 1,000-record page about every 57 s). Locks and commit flushes are no longer the limit. Before more tuning, split per-page time between the MLS Grid fetch, worker processing and database round trips, and fix whichever dominates.

## Not built yet (intentional)

Pro formas, publishing to the public website, STR data and comps, seller and buyer tracking across transactions in the UI, home value estimates, and any AI use. The `mls_property_insights` table and the property identity layer are where those will attach.

## Tests

```bash
pnpm vitest run server/mls                      # unit tests
MLS_E2E_DATABASE_URL=mysql://root@127.0.0.1:3307/savvyos_mls_e2e \
  pnpm vitest run server/mls/mls.e2e.test.ts    # end to end with local MySQL and a mock MLS Grid server
MLS_E2E_DATABASE_URL=mysql://root@127.0.0.1:3307/savvyos_mls_e2e \
  pnpm vitest run server/mls/mls.access.e2e.test.ts  # agent MLS scoping and saved views through the real router
```

## Licensed feeds declared in code

`server/mls/feedBootstrap.ts` lists the feeds Savvy has licensed. On startup (web and worker), SavvyOS creates any that are missing under a MySQL named lock. It also applies the fast-import settings **once** to existing declared MLS Grid feeds. Admin changes after that migration always win. Set `MLS_DECLARED_FEEDS=off` to skip this.

| Feed | Token variable | Why |
|---|---|---|
| Canopy BBO (MLS Grid), `carolina` | `MLS_CRED_MLSGRID_BBO_TOKEN` | Back office superset: 2.6M records back to 2007, including canceled and expired. Each record keeps MLS Grid's `MlgCanUse` flags in `mls_listings.permittedUses`. |
| MARIS IDX (MLS Grid), `maris2` | `MLS_CRED_MLSGRID_TOKEN` | Existing IDX subscription; retained as a separate licensed feed and an admin-search fallback while BBO fills. |
| MARIS BBO (MLS Grid), `maris2` | `MLS_CRED_MLSGRID_BBO_TOKEN` | Two active MARIS (NEW) Savvy OS licenses were confirmed on the existing BBO subscription Oct 2, 2026. Shares the Canopy BBO credential's rate and byte budget, not a new token lane. |
| MIBOR IDX (MLS Grid), `mibor` | `MLS_CRED_MLSGRID_TOKEN` | Approved by MIBOR Broker Listing Cooperative Oct 8, 2026 (licensed to Jason Royer for Savvy OS), finalized Oct 9. 858,202 records, 12,584 active at approval. Shares the MARIS IDX token's lane. |
| MIBOR BBO (MLS Grid), `mibor` | `MLS_CRED_MLSGRID_BBO_TOKEN` | Approved and finalized with MIBOR IDX. 1,703,495 records. Shares the Canopy and MARIS BBO token's lane. |

There is deliberately no Canopy IDX feed. It would duplicate every Canopy listing. When the public site is built, show only listings whose `permittedUses` includes `IDX`.

MARIS and MIBOR are different: each has separately licensed IDX and BBO feeds. Canonical rows, raw records, photos and license flags remain distinct. Admin cards, map pins and exact totals **prefer a BBO row only once a matching, licensed, non-removed BBO listing is present**, using `(sourceId, listingNumber)`; until then IDX remains visible. Revoking or removing BBO makes the matching IDX row visible again. The rule names no MLS, so any future MLS with both licenses gets it automatically. This read preference does not authorize public use of BBO data or media; the eventual public site must apply its own feed- and listing-level IDX rights checks. Do not disable an IDX feed just to hide duplicates.

Until a token variable is set, that feed shows "Credentials not configured" and the worker skips it.

## MLS Grid usage budget

Requests to `api.mlsgrid.com` (Property records, including the CDN link backfill below) consume the per-token API limits. Photos come only from MLS Grid's CDN, which is outside those limits (MLS Grid, Oct 2, 2026). MLS Grid never replaces an image in place: a changed image gets a new MediaKey, so an unchanged key is never downloaded again. See the [MLS Grid Media documentation](https://docs.mlsgrid.com/api-documentation/api-version-2.0).

`server/mls/adapters/mlsGrid.ts` (`MLS_GRID_LIMITS`) records the published, warning and suspension thresholds from MLS Grid's Sept 30 notice. The Oct 2 grace window has ended and its code was removed. The BBO token is shared by Canopy and MARIS BBO; the IDX token serves MARIS IDX. On a worker restart, API windows seed from API usage only. The adapter caps **API** requests per token at `rateSafety` (default 0.8, never above 0.9) of the lower of published and warning, except requests per second, which is capped at half the published limit (`MLS_GRID_RPS_SAFETY`):

| Per token, all processes combined | Cap |
|---|---|
| Requests per second | 1.0 (one request start per 1,000 ms) |
| Requests per hour | 5,760 |
| Requests per 24 hours | 32,000 |
| Bytes per hour | 2.458 GB |
| Bytes per 24 hours | 32 GB |

**Cross-process pace (since Oct 3, 2026).** MLS Grid limits are per access token, and it measures requests per second at its edge "at all times". On Oct 3 it warned that one token reached 4.0 requests per second between 13:00 and 14:00 EDT, while our logged usage for that hour was 1,795 requests across both tokens (0.5 per second). Cause: each Railway deploy starts the new worker before the old one stops, and each process paced only itself (1.6 per second, so up to 2 starts in one second each). Worker heartbeats showed overlaps at 12:31, 12:57 and 13:32 EDT. Fix (`server/mls/apiGate.ts`): before every API request (and photo requests on providers that meter photos against the token), the process takes a MySQL named lock per token on the MLS database (`GET_LOCK('savvyos:mls-api:<provider>:<credentialRef>')`) and holds it for the token's spacing. Any other process (the overlapping worker, the web process running a feed test, future extra workers) waits, so request starts on one token are at least 1,000 ms apart in total. A process that dies frees its locks when its connection closes. If the lock cannot be taken, the request is not sent (fail closed) and retries with backoff. MLS Grid CDN photos skip the gate. The worker heartbeat shows `pace` per lane (`spacingMs`, `takes`, `waitedMs`, `errors`). Tests: `mls.apigate.e2e.test.ts` (two pools as two processes; crash frees the lock) and `MLS Grid token budget` in `mls.test.ts`.

Manual checks with production MLS Grid tokens bypass the gate and add to the same per-second count. Do not run them while the worker is live; use `/healthz/mls`, the worker heartbeat, and `mls_provider_usage` instead. The hourly and daily windows are still counted per process (seeded from `mls_provider_usage` at start); a deploy overlap of a few seconds cannot move them meaningfully.

**Deploy handoff.** A new worker answers its health check at once (so Railway stops the old one on schedule) but makes no provider calls until every older worker has stopped beating. The old worker deletes its heartbeat on SIGTERM; a worker that dies without doing so goes stale after 45 seconds. The wait is capped at 2 minutes so a stuck row cannot stall ingestion. This also protects the first deploy of the pace gate, when the old worker does not take the lock yet. Rule: `mustWaitForOlderWorker` in `server/mls/worker.ts`.

`server/mls/http.ts` separates MLS Grid's API and CDN photo limiters. API bytes are counted from `Content-Length` when sent (otherwise decoded size); media bytes and requests are still recorded for diagnostics. On start, each lane reloads API usage from the last 25 hours of `mls_provider_usage`, so a restart cannot reset the rolling API budget. Other providers with a shared token budget retain the chained limiter. Tests: `MLS Grid token budget` in `mls.test.ts` and the restart test in `mls.e2e.test.ts`.

## MLS Grid CDN photos (production since Oct 2, 2026)

MLS Grid enabled its CDN on both production tokens on Oct 2. CDN links (`cdn-<org>.mlsgrid.com`, today `cdn-savvystr.mlsgrid.com`; `MLS_GRID_CDN_HOSTS` adds hosts) do not expire, are not single-use, are outside the `api.mlsgrid.com` quotas, and MLS Grid permits displaying them directly. The first 1 TB/month is free across the organization, then paid overage per MLS Grid's offer.

| Photo | Source | Stored copy |
|---|---|---|
| Cover (list cards, map) | Downloaded once from the CDN into private storage | Yes, served by the authenticated photo route |
| Gallery (listing detail) | CDN link shown directly in the browser | No. An older stored copy, if one exists, is the fallback when a CDN link fails to load |

Only CDN links are stored or used. Any non-CDN MLS Grid link is ignored: never downloaded, refreshed or shown. A failed CDN cover download keeps its link and retries after a backoff; a CDN 403/404/410 marks that photo failed until the listing's next update brings a new link; a CDN 429 backs off CDN downloads only, never the 15-minute token pause. `MLS_CDN_REQUESTS_PER_SECOND` is unset by default.

**Cover size (Oct 9, 2026):** stored covers are scaled to a 1024 px long edge, JPEG quality 80, before they are saved (`server/mls/coverImage.ts`, sharp). Scaling is proportional only: no crop, overlay or edit, so watermarks and branding in the photo stay intact. A cover at or under 1024 px and 350 KB, an animated image, or anything sharp cannot decode is stored exactly as received, and so is any image that would not get smaller. Gallery photos are never scaled. Why: MIBOR originals average about 1.95 MB per cover, against 165 KB on MARIS and 530 KB on Canopy, so a 12-card MIBOR page pulled more than 20 MB of images. Covers stored before this change are rewritten by a worker pass (`shrinkStoredCovers`), newest first so current listings and the newest MLS go first. Each step reads 500 stored cover ids from `mls_media_queue_idx` alone (covers sit at priority 1-40; index-only, no row reads), then just those rows by primary key. Small and already-scaled covers are skipped. Up to two minutes per tick, eight covers in flight (storage round trips take about 0.5 s each), decoding capped at four. It writes each oversized cover to a new `-c1024.jpg` key, swaps the row only while it is still the same stored copy, repoints the listing's cover URL, then deletes the old object. A row that a re-download or removal changes mid-pass keeps its object, and the new copy is deleted. The pass makes no provider calls, keeps its cursor in memory (a restart rescans quickly, skipping small covers), and reports `coverShrink` in the worker heartbeat.

Licensing still gates every photo. The listing detail returns CDN links only after the feed license and display checks pass, and closed listings still follow MLS-specific primary-only photo rules. Feeds with `mediaPolicy=none` keep no links; `primary_only` limits downloads, not display.

**CDN link backfill:** listings synced before the switch hold old links or none. The worker walks each MLS Grid feed newest ID first (1,000 per pass) in three scopes, one cursor each: on-market (`CdnLinksNewest`), then sold (`CdnLinksClosed`), then withdrawn/expired/canceled/hold (`CdnLinksOffMarket`). It re-reads only listings with fewer CDN links than `PhotosCount`, 100 per `ListingId in (...)` API call, under the feed's normal photo rules. It stops at 75% of the token's rolling-day API limit (`CDN_LINK_DAY_SHARE`) and resumes as usage ages out, so live replication always keeps the rest. Past-listing covers queue at priority 40, behind every on-market cover. New and changed listings get CDN links through normal replication. On first start the worker also retires the old gallery-download queue in bounded chunks on the queue index: it deletes `__gallery_request__` markers, marks queued gallery downloads skipped, and drops the `ActiveGallery` cursor. MLS Feeds → Health shows backfill progress per feed and scope. The Active-gallery scanner, the gallery request button, MLS Grid one-hour link refreshes and the 65-minute duplicate-image cooldown were removed.

**Relink scan cost (Oct 9, 2026):** each pass reads one feed's rows only, one status at a time, through `mls_listings_feed_status_idx (feedId, standardStatus, removedFromFeedAt)` plus InnoDB's implicit id. Each status is a single backward index range; the pass merges them and keeps the newest 1,000, so the cursor and newest-first order are unchanged. The earlier scan forced the primary key and filtered on `feedId`: whenever a scope had fewer than 1,000 matches left, it walked every other feed's rows down to id 1. That was a full table scan per feed per scope, measured at about 35 minutes each on MIBOR with 5.7M+ listings in the table, and every added MLS made it worse. The index builds online with the search covering indexes (`ALGORITHM=INPLACE, LOCK=NONE`, under the build lock); until MySQL lists it, the backfill reports `index_pending` in the worker heartbeat and waits, since forcing a missing index is an error. A scan from a replaced worker keeps running on MySQL after its container stops; if one holds `mls_listings` for minutes, the index build waits behind it (it skips windows with statements running 8 s or longer), and `KILL QUERY <id>` on that orphaned SELECT is safe.

## Fast first load (Oct 1, 2026)

The two declared MLS Grid feeds get `options.fastImportV1=true`, `syncIntervalMinutes=5`, and `mediaPolicy=primary_only` once. Other providers are unchanged.

**Every new feed (Oct 3, 2026):** the staged import below is no longer MLS Grid-only. Any adapter with `capabilities.stagedImport` (MLS Grid, Trestle, Spark) runs it, and new feeds get `fastImportV1=true` when created, from code (`feedBootstrap`) or from the admin form. Each adapter builds its own on-market filter: MLS Grid uses `StandardStatus in (...)`, Trestle uses Data Dictionary values without spaces (`ActiveUnderContract`) over keyset paging (its replication endpoint is used only for the full pass), Spark lists both spellings. If a server spells statuses differently, set `options.priorityFilter` to the OData clause to use instead (for example `StandardStatus eq Odata.Models.StandardStatus'Active'`). If the server rejects the filter outright on the first page (a 400-class error other than 401/403/429), the worker marks the on-market stage done, logs a warning, and imports everything in the full pass, so a new feed never stalls on it. Existing feeds keep whatever `fastImportV1` they already have.

Canopy and MARIS now use three Property cursors per feed: `Priority:Property` imports active, coming soon, under-contract, and pending listings first with Media expanded for main-photo metadata; `Live:Property` is seeded before that pass and catches all changes since it started, including lost display rights; `Property` resumes the full historical pass without Media expansion. Rooms and UnitTypes remain expanded. Prefill and history run in time-boxed import bursts (see Lane scheduling above); history also stops at 20 pages per burst, and history waits until the prefill is complete. A live check runs between historical pages if a burst runs over four minutes. Other resources are capped at 20 pages per cycle until caught up. A transient database failure or failure to save an invalid record holds the checkpoint. A deterministic bad row is advanced **only after** its full provider payload has been saved in the private `mls_import_exceptions` table; at most 20 exceptions are retried per feed cycle. The manager-only Runs tab shows the count, listing key, safe SQL error code, and attempt count. Deletions remove matching quarantined payloads. When history finishes, the live high-water mark is copied to the regular Property cursor. Market prefill is time-boxed like history, so a large prefill no longer delays live syncs for other feeds on the token. The admin search becomes populated as pages arrive, not only after the full history finishes.

Historical pages without Media cannot delete photos already held. A provider record older than our stored `ModificationTimestamp` cannot roll a newer status or price back; the seen timestamp still updates for the final sweep. MLS Grid returned gzip without Content-Length on a live sample. `wireBytes` counts the decoded size in that case, conservatively. It does **not** infer a smaller compressed size or weaken the byte limit to speed up import.

MLS Grid feeds download only cover photos; galleries display from CDN links (see above). Other providers keep their existing behavior: wanted photos download into private storage and the worker refreshes expiring links. The web process never contacts a provider API. MLS-specific restrictions, including primary-only closed photos, still apply.

Private photo requests formerly selected by `mls_media.s3Key` alone, which is unindexed across millions of rows and could take over a minute per card. Search, detail, and newly stored photo URLs now carry the listing ID. The route requires that hint and uses `mls_media_listing_idx`, then still verifies the exact stored key, stored status, unremoved listing, active admin permission, and feed license before issuing a 60-second signed private-storage redirect. Older stored URLs are upgraded in API responses; old standalone image links without a listing ID fail closed until the page is refreshed. No production table rebuild or public bucket is needed.

Photo download order: Active covers first, then other market covers. Existing queued rows obey the current listing status; no bulk media priority UPDATE is required. MLS Feeds → Health reports photo rows by status, private-storage configuration, per-token API usage, each lane's last batch and the CDN link backfill.

Do not promise an under-hour market import, under-day history import, or a six-minute status latency until the real worker and its run logs confirm them. A worker stuck on a long market-prefill page, a full token budget, or a provider delay makes those estimates unreliable.

The public `/healthz/mls/worker` endpoint returns the latest worker heartbeat's commit prefix, age in seconds, and an `alive` boolean (90-second freshness threshold). It exposes no worker ID, listing, MLS, or credentials and caches the read for 30 seconds. A live heartbeat on the current commit proves the worker deployed and is running; it does **not** prove the feeds are importing. Check Runs and Health in the admin module for rows received, cursor progress, credentials, and errors.
