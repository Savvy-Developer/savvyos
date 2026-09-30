# SavvyOS MLS Licensing and Integration Research

**Research date:** September 29, 2026  
**Decision status:** Planning only. **SavvyOS is not represented as licensed, approved, credentialed, connected, or production-deployed for any MLS below.** No provider live calls were tested. This report is a licensing and integration diligence brief, not legal advice or an implementation authorization.

## Executive recommendation

1. **Run a narrow Canopy MLS pilot first**, only after Canopy, the sponsoring Participant/Broker, MLS Grid, and SavvyOS have approved the specific agreement, users, fields, territory, and use cases in writing. The working route is MLS Grid to Canopy, potentially including Asheville/Western North Carolina, but that geography and entitlement remain unverified.
2. **License each use separately.** Public IDX, VOW, Broker/Back Office, CRM, CMA/AVM, agent-production analytics, market analytics, Participant listings, and vendor products are different permission lanes. A credential or agreement for one lane does not authorize another.
3. **Keep the current build an isolated, admin-only foundation.** Do not activate MLS content until approval. Do not launch public IDX/VOW pages, consumer search, lead capture, seller-facing features, seller CRM synchronization, public market reports, or STR integrations. Internal access should be limited to named approved brokerage users and the exact approved Back Office or equivalent scope.
4. **Do not use MLS content for AI training, embeddings, vector search, knowledge graphs, fine-tuning, persistent AI caches, cross-transaction identity graphs, reusable valuation datasets, or STR enrichment** unless a written MLS-specific approval expressly authorizes the exact workflow, data elements, retention period, and downstream recipients. MLS Grid's AI Addendum makes this restriction explicit for its feeds.
5. **Make activation gate-driven, not adapter-driven.** SavvyOS may maintain unconnected code adapters for MLS Grid, Trestle, Spark, direct RESO Web API, and a custom route placeholder. A completed adapter is not an authorization to request, ingest, retain, display, or combine data.

> **Practical pilot boundary:** Canopy BO or another written Canopy-approved non-public lane, named broker sponsor, named SavvyOS vendor, least-privilege fields, no public output, no customer/seller CRM sharing, no third-party enrichment, no AI, and a documented purge and audit process. If Canopy will not grant that scope, do not ingest its data.

## Scope and design assumptions

SavvyOS is being evaluated as an **isolated admin-only real estate operating foundation**. The intended technical shape is a small set of provider adapters:

| Provider family | Planned adapter | Research-supported technical context | Licensing implication |
|---|---|---|---|
| MLS Grid | MLS Grid RESO/OData adapter | MLS Grid API v2 supports property and related resources, replication signals such as `ModificationTimestamp`, `MlgCanView`, `MlgCanUse`, photo timestamps, and origin-specific feeds. [API v2](https://docs.mlsgrid.com/api-documentation/api-version-2.0) | Each MLS and use class must be enabled. `MlgCanUse` is a record-level permission signal, not a blanket downstream license. |
| Trestle / Cotality | Trestle OData adapter | Trestle has separate Back Office, Broker Data, IDX, IDX Plus, VOW, Statistics, and custom feed patterns. Its configuration, fields, media, and contracts are MLS-specific. [Trestle release guide](https://trestle.corelogic.com/Content/Trestle%20for%20Multiple%20Listing%20Managers%20Release%20v2.pdf) | A Trestle credential or product category does not prove that an MLO approved SavvyOS or any use beyond the selected product. |
| Spark / FBS | Spark / Datamart RESO adapter | Spark has MLS-controlled roles for Private, IDX, VOW, and other plans. Datamart controls plans, licensing, pricing, approvals, and usage tracking. [Spark overview](https://sparkplatform.com/docs/overview/api) | Private/Back Office capability in provider documentation is not a local MLS grant. |
| Direct RESO | Direct RESO Web API adapter | UtahRealEstate and some other MLSs expose or may expose direct API routes; RESO provides technical standards, not data rights. [RESO Web API](https://www.reso.org/reso-web-api/) | The MLS product description, vendor agreement, broker authorization, and field entitlement control. |
| Custom | Unconnected custom-route placeholder | Needed for markets where aggregation route, API, or approved vendor path is not verified, including OBAR, Baldwin, and CCORMLS. | No ingestion, test credentials, scraping, or production activation until the route and license are confirmed. |

### Public IDX is not internal-use permission

**IDX** is generally limited to authorized electronic display or delivery of listings to the public on behalf of a Participant. It commonly carries refresh, attribution, disclaimer, source, opt-out, field, anti-scraping, and display restrictions. It does **not** automatically permit internal admin search, CRM synchronization, retention of historical data, valuations, analytics, property identity resolution, photo warehousing, STR joins, public statistics, AI, or derived-data storage.

**VOW** generally serves identified, registered consumers in a brokerage relationship under additional privacy, terms, security, and audit requirements. It is not a substitute for Back Office rights.

**Back Office / BBO / Private** is generally a non-public brokerage, agent, client, or vendor lane. The actual contract must still identify allowed users, fields, storage, outputs, recipients, media, refresh, audit rights, and termination treatment. Do not treat the words “CRM,” “analytics,” “CMA,” or “market analysis” in a provider's generic documentation as permission for SavvyOS.

## 29-market route, rules, and unknowns matrix

**Legend:** “Working plan” means a planning assumption, not a verified feed. “Approval gate” lists the material unresolved items before any activation. Links are to the principal rules and delivery sources; the full linked source register appears below.

| # | MLS / target market | Planned delivery route | Confirmed public rules or useful constraints | Approval gate and material unknowns |
|---:|---|---|---|---|
| 1 | **Canopy MLS** / Asheville, Western NC | MLS Grid, working plan | Canopy differentiates Participant, Subscriber, and vendor feeds through MLS Grid; IDX, VOW, and BO are separate lanes. IDX and Grid downloads refresh at least every 12 hours. BO is described for internal uses such as analytics, CMA, and market analytics. Closed sales and price reporting are due within five business days. [Data licensing](https://go.canopymls.com/data/) | Verify SavvyOS eligibility, broker/Participant sponsorship, Canopy approval, exact Asheville/Western NC mapping, BO field package, local media rights, purge SLA, sold-history/photo rights, attribution, and all AI, identity, and STR rights. **Recommended first pilot only after written approval.** |
| 2 | **MIBOR / BLC** / Indianapolis | MLS Grid, working plan | MLS Grid distinguishes IDX, VOW, and BO. MIBOR VOW refresh is at least every 12 hours. `MlgCanView=false` data must be removed and leaves the Grid feed after seven days. Media URLs are signed, single-use, and expire after one hour. [MIBOR rules](https://www.mibor.com/wp-content/uploads/2026/01/BLC_Rules_and_Regulations_01302026.pdf) | Confirm BLC approval, BO subscription and fields, refresh/purge rules, media storage/copyright terms, sold data, private fields, public attribution, and AI/derived-data restrictions. |
| 3 | **Stellar MLS** / Sarasota, Bradenton, St. Petersburg, Clearwater | MLS Grid, working plan | Stellar distinguishes IDX from Custom Development Non-IDX, including Firm Internal Use, Broker Back Office, VOW, Broker Data Release, and Vendor Product. Projects require a Broker, Vendor or developer, and Stellar agreement. MLS Grid termination provisions require immediate stop, destruction of data within 10 days, and confidential-information destruction within five business days. [Stellar data delivery](https://www.stellarmls.com/data-delivery) | Secure a Stellar-approved lane, selected Grid use options, territory, data package, media terms, ordinary listing retention and status purge rules, and written approval for CRM, valuation, property identity, STR, and AI. |
| 4 | **MARIS MLS** / St. Louis, St. Charles | MLS Grid, working plan | MARIS requires separate written IDX/VOW agreements and its ordinary Participant Agreement is not an IDX/VOW authorization. Grid BO permissions may cover agent-production analytics, CMA, market analytics, and Participant listings use. MARIS has listing and status reporting deadlines and requires rights to uploaded media. [MARIS rules](https://marismls.com/userfiles/kcfinder/files/2023_RulesPacket_FINAL_011923.pdf) | Verify current MARIS BO agreement, vendor and broker structure, current controlling rules, media storage, retention and purge, attribution, sold-data rights, and all derived-data or AI uses. |
| 5 | **Unlock MLS / ACTRIS** / Austin | MLS Grid, working plan | Grid separates IDX, VOW, BO, and PT. `MlgCanView=false` requires local removal; `MediaURL` is for one-time local download and must not be hotlinked. On Grid termination, data use stops immediately and data must be erased within 10 days. Unlock IDX closed-listing rules limit photos and disallow sale-price display. [MLS Grid AI Addendum](https://www.mlsgrid.com/s/MLS-Grid-AI-Use-Addendum.pdf) | Confirm ACTRIS fields and roles, local/internal display rules, opt-outs and confidential fields, and branding. The AI Addendum expressly blocks persistent AI caching, training, embeddings, vector indexes, knowledge graphs, and persistent representations without prior express authorization. |
| 6 | **Spartanburg MLS** / Spartanburg | MLS Grid, working plan | MLS Grid BO can cover agent-production analytics, CMA, market analytics, and Participant listings use, but BO-only records are not for IDX/VOW. `MlgCanView=false` local removal is required; the Grid agreement provides five-business-day confidential-information and 10-day MLS-data termination destruction requirements. [Spartanburg membership](https://www.spartanburgrealtors.com/mls-membership/) | Confirm that Spartanburg participates in Grid, SavvyOS qualification, executed local documents, route, field permissions, refresh, media, sold-data, address/confidential-field, AI, and backup-purge requirements. |
| 7 | **MLSOK** / Broken Bow, McCurtain County | MLS Grid only if participation and coverage are confirmed | Grid master agreement lists IDX, VOW, agent-production analytics, CMA/AVM, CRM, market analytics, and Participant listings use as separate categories. IDX must refresh at least every 12 hours and carries attribution/disclaimer rules. [MLS Grid FAQ](https://www.mlsgrid.com/faq) | **Coverage is unverified:** MLSOK Grid participation and Broken Bow coverage are not established. Also verify broker rights, BO/CRM scope, media, retention, MLSOK sold rules, fields, and AI/derived-data rights. |
| 8 | **Realtracs** / Nashville, possible GSMAR Smokies | MLS Grid, working plan | Realtracs publishes separate IDX/VOW, Back Office, and Participant Data Feed paths. Grid BO is distinct from IDX and VOW. Realtracs delegates IDX/VOW administration to Grid; valuation support may be allowed for a particular client subject to data restrictions. [Realtracs data delivery](https://www.realtracs.com/info/data-delivery/) | Confirm executed Realtracs/Grid scope, feed fields, retention, media, sold data, AI/derived uses, and **whether GSMAR Smokies listings are actually live in the feed and covered for the sponsoring broker.** |
| 9 | **Doorify MLS** / Raleigh, Triangle | Trestle, working plan | Doorify describes IDX for other Participants' authorized listings and publishes direct feed, vendor, and SmartFrame paths. Its IDX content may include specified closed listings from 2012, subject to opt-outs. MLS information, comparable, sold, and statistical information are confidential and professionally restricted. [Doorify rules](https://support.doorifymls.com/hc/en-us/articles/32402136977427-Rules-Regulations) | Confirm Trestle product and whether SavvyOS is a permitted internal vendor, BO user, IDX, VOW, or analytics consumer. No rights are established for CRM, valuation, identity, STR, AI, derived data, photo storage, or retention. |
| 10 | **Hive MLS** / Wilmington, Oak Island, Brunswick | Trestle, working plan | Hive distinguishes IDX public display, VOW business/clientele data, and FIU/back-office for office use only. Hive says feeds update as listings come on and off market. Trestle indicates real-time/replication access and general freshness targets, while ordinary IDX does not provide sold listings and IDX Plus may provide some. [Hive IDX/data feed](https://www.ncrmls.com/idx) | Verify FIU/BO, IDX, VOW or IDX Plus entitlement, territory, data and media treatment, sold restrictions, refresh/purge terms, branding, and written permission for CRM, analytics, valuation, identity, STR, AI, and derived data. |
| 11 | **Western Upstate MLS** / Upstate SC | Trestle, working plan | Current rules define IDX as display-only and require 12-hour IDX refresh; VOW refresh is at least every three days. A seller may withhold listing/address from Internet display. Owner photo-removal requests after closing must be honored, while one historical photo remains. [Western Upstate rules](https://www.westernupstatemls.com/wp-content/uploads/2025/10/Western-Upstate-MLS-Rules-and-Regulations-May-2025.pdf) | Confirm Trestle BO availability, broker authorization, fields, media, retention, private/admin rights, valuation/analytics/AI approval, and whether the old full-feed contract is current. IDX rights do not authorize internal uses. |
| 12 | **Central Panhandle Association of REALTORS MLS (CPAR)** / Panama City Beach, Bay County | Trestle, working plan | CPAR publicly offers IDX/API feeds for personal or brokerage websites and back-end office systems. It identifies IDX, IDX Plus with post-2012 sold data, and VOW with sold history. Trestle's model agreement limits rights to expressed authorizations and bars unapproved resale/redistribution. [CPAR data feeds](https://www.cpar.us/mls/data-feeds-idx-api/) | Confirm exact Trestle product, broker/provider authorization, internal scope, retention, media, attribution, opt-outs, sold price/photos, external joins, AI, analytics, valuation, and STR. NAR model rules are only reference material, not CPAR adoption evidence. |
| 13 | **Houston Realtors Information Service / HAR** / Houston, Galveston | Trestle, planned | HRIS's public three-way agreement distinguishes Active IDX from Active plus Off Market VOW, with 60 prior months of expired, terminated, and sold data in the latter, subject to restrictions. It requires broker-controlled display, clear identification, broker-only branding, and exact HAR notice on every display. On termination, data use stops and all copies must be deleted/destroyed. [HRIS agreement](https://www.harconnect.com/wp-content/uploads/2024/10/3-Way-Third-Party-Services-Agreement-2022c-1.pdf) | Confirm active agreement version, Trestle authorization, broker opt-in, fields, internal use, refresh, media, exact current HAR Rules display controls, sold treatment, and approval for all CRM, analytics, valuation, AI, identity, and STR workflows. |
| 14 | **MIAMI Association of REALTORS MLS / SEFMLS** / Miami, not assumed Florida Keys | Trestle, planned | MIAMI limits public IDX access to MLS participants and describes Bridge, Trestle, and approved-vendor paths. IDX refresh is at least every 12 hours; public “OK TO ADVERTISE” updates are due within two business days. Public sold information may be available from 2012, subject to public-record sale-price limits. [MIAMI rules](https://www.miamirealtors.com/wp-content/uploads/bsk-pdf-manager/2020/04/mls-rules-and-regulations.pdf) | Confirm vendor/designee status, Trestle entitlement, exact territory, current IDX/VOW/BBO display terms, media and retention rules, and written approval for internal CRM, analytics, valuation, property identity, AI, and STR. **Florida Keys coverage is not assumed.** |
| 15 | **Montana Regional MLS** / Whitefish | Trestle, planned | MRMLS distinguishes IDX, VOW, and third-party vendor/feed access. Third-party use needs a written agreement and brokerage opt-in. IDX refresh is at least every 12 hours and cannot show expired, withdrawn, or sold listings; VOW refresh is at least every three days. [MRMLS rules](https://www.406mls.com/wp-content/uploads/2026/03/MRMLS-Rules-Regulations.pdf) | Secure MRMLS/Trestle/broker approval. Resolve media, retention, sold and historical rules, current VOW policy conflict, exact branding/fields, and all internal CRM, analytics, valuation, identity, AI, and STR rights. |
| 16 | **ArkansasONE MLS** / Northwest Arkansas | Trestle, planned | ArkansasONE publishes membership paths and third-party-feed claims. Trestle documents separate Back Office, Broker Data, IDX, IDX Plus, Statistics, and VOW product categories, with MLS-specific contracts, fields, statuses, and media. [ArkansasONE](https://www.arkansasonemls.org/) | Verify sponsorship, direct or provider route, BO/Broker Data availability, market coverage, retention, media, public display rules, sold price/photos, and every proposed use beyond authorized display. No ArkansasONE-specific AI/derived-data permission was found. |
| 17 | **Bright MLS** / Shenandoah only if Bright membership | Trestle, planned | Bright separates IDX/VOW from back-office, statistical, and premium feeds. Direct data access requires separate approval. IDX/VOW refresh is at least every 12 hours. Licenses end immediately on termination. Bright generally retains sold/expired/canceled listings and limits photo removal, including a 14-day post-Closed window. [Bright data access](https://brightmls.com/directdataaccess) | Confirm Bright membership, Shenandoah entitlement, feed product, photo/local-cache terms, exact purge terms, field matrix, and permission for admin search, CRM, analytics, identity, AI, STR, and valuation beyond permitted immediate listing display. |
| 18 | **Pocono Mountains Association of REALTORS (PMAR)** / Poconos | Spark/FBS, planning only | PMAR's Subscriber Agreement limits use to selling, listing, leasing, and appraising and requires separate written IDX/VOW/feed agreements. On termination, subscriber software and database copies must be promptly purged. Spark treats Private as back-office and leaves roles, fields, plans, prices, and approval to the MLS. [PMAR agreement](https://poconorealtors.com/wp-content/uploads/2024/05/PMAR-Subscriber-Agreement-2024.pdf) | Confirm the current agreement, Spark Datamart availability, plan, fields, all refresh/purge/media terms, display controls, sold data, and no-rights areas: analytics, AI, valuation, identity, external joins, and STR. |
| 19 | **Monmouth Ocean Regional MLS / MOREMLS** / Jersey Shore | Spark/FBS, working plan | MOREMLS distinguishes IDX from VOW. IDX is display-only, requires at least 12-hour refresh, limits fields to MLS-designated content, prohibits expired/withdrawn/canceled listings and confidential/seller contact fields, and recognizes address/listing opt-outs. [MOREMLS rules](https://monmouthoceanrealtors.com/wp-content/uploads/2026/04/RulesApr2026.pdf) | Obtain and review the current 2026 IDX/VOW Data Access Agreement and Spark plan. Confirm private/member rights, sold fields, retention, media, public branding, and specific approval for analytics, AI, AVM, identity, and STR. |
| 20 | **Emerald Coast Association of REALTORS / ECAR** / Destin, 30A | Spark/FBS, working plan | ECAR permits qualifying professional acquisition of certain non-current comparable, sold, and statistical information but restricts exclusive use and unauthorized transmission. It prohibits selling, recompiling, derivative products, or analyses of formatted MLS data without express consent, except stated appraisal/CMA or purchaser-marketing scenarios. [ECAR rules](https://www.emeraldcoastrealtors.com/wp-content/uploads/2024/09/MLS-rules-draft-8-9-2024-redline-removed-1.pdf) | Confirm Spark role/feed, all time, field, media, display, retention, and sold restrictions. Treat analytics, AI, derived data, identity, CRM joins, valuation, and STR as prohibited unless expressly approved. |
| 21 | **Space Coast MLS** / Cocoa Beach | Spark/FBS, working plan | Current rules limit IDX to display/delivery and require 12-hour refresh. VOW needs a license agreement and requires unchanged MLS content except clearly sourced augmentation. MLS photos are copyrighted, and other participants need written owner permission to reuse them. Spark's Private role can technically support confidential fields, CRM, CMA, and market analysis, subject to MLS control. [Space Coast rules](https://www.spacecoastmls.com/home/mlsrules) | Confirm SavvyOS approval and Spark plan, authorized internal users and fields, media/storage, purge/termination, sold rules, logo/disclaimer requirements, and all analytics, valuation, AI, identity, and STR rights. |
| 22 | **realMLS** / Jacksonville, Northeast Florida | Spark Datamart, working plan | realMLS separates IDX, VOW, Back Office, and Broker's Own Data. Back Office is internal and not public. The cited IDX rule is 12-hour refresh and VOW is three days. Its Back Office agreement limits use to the licensed product, preserves MLS ownership, and bars unauthorized distribution, alteration, and derivative works. [realMLS data products](https://www.realmls.com/data-products/) | Confirm current Datamart plan, fields, fees, territory, current agreement status, refresh/purge/media rules, sold treatment, and whether any analytics, AVM, CRM enrichment, identity, AI, aggregation, or STR workflow is allowed. |
| 23 | **MichRIC** / Ann Arbor only if entitled | Spark API or direct RESO Web API, working plan | MichRIC says data access moved from RETS to RESO Web API or Spark API and mentions possible additional Realcomp and Ann Arbor Area Board data. Spark roles distinguish private/member, IDX, and VOW but are MLS-controlled. [MichRIC API](https://mlshelp.com/api) | **Ann Arbor entitlement and territory are unverified.** Confirm product, participant, dataset, fields, refresh, media, retention, display, sold data, and all requested internal/derived uses. RESO standards do not grant data rights. |
| 24 | **Cape Cod & Islands MLS / CCIMLS** / Cape Cod | Spark API, plan only | CCIMLS's Participant Data License defines separate IDX, VOW, Broker Back Office, Valuation, and Participant Data Return uses. BBO guidance includes brokerage management, CRM/transaction tools for authorized brokerage users and bona fide clients, productivity tools, and permitted marketplace statistics. VOW refresh is at least 12 hours. [CCIMLS PDL](https://cciaor.com/uploads/FINAL_CCIMLS-Participant-Data-License-Modified-clean.pdf) | Confirm Spark/API authorization, BBO/Valuation scope, fields, media, retention, sold rights, citation policy, and especially AI, embeddings, data resale, identity graph, and STR limitations. |
| 25 | **ARMLS** / Arizona | Direct ARMLS application/license using Spark/RESO technology, not Spark Datamart | ARMLS requires an executed Content License Agreement for exported content and distinguishes Participant IDX/VOW/BBO/AVM, own data, and vendor access. Intended use, payload, fees, and changes require approval. IDX is 12-hour refresh and has specified field, attribution, disclaimer, opt-out, and privacy restrictions. AI use must be disclosed in the application and expressly authorized in the CLA. [ARMLS content policy](https://armls.com/docs/content-access-policy.pdf) | Apply for the appropriate CLA and disclose every intended workflow. Confirm data plan, purge/backup rules, sold treatment, media cache license, and no generic right to analytics, persistent derived data, identity, STR, or AI. |
| 26 | **Outer Banks Association of REALTORS MLS (OBAR)** / Outer Banks | Direct outreach / Web API agreement, aggregator unresolved | OBAR has separate IDX, Third Party Access, and VOW regimes. IDX is display-only and refreshes at least every 12 hours. VOW refresh is at least every three days. MLS information is confidential and credentials may not be shared. [OBAR rules, Rev. 65](https://outerbanksassociationofrealtors.growthzoneapp.com/ap/CloudFile/Download/p9W4GMkL) | Confirm whether a Web API or approved aggregator exists, obtain §17 terms, and establish all internal, vendor-hosting, field, media, retention, display, sold, analytics, AI, identity, and STR permissions. |
| 27 | **UtahRealEstate.com** / Park City not assumed | Direct RESO Web API, plan only | Registration and an executed data license are required. Product Description controls use; internal business use is not allowed unless expressly stated. Separate products exist for IDX, VOW, full feed, CRM, analytics, CMA, and back office. Recommended update cadence is 15 minutes. Internet visibility flags control listing, address, AVM, comment, and delayed-marketing displays. [Utah data services FAQ](https://vendor.utahrealestate.com/faq) | Confirm executed product and fields, **Park City coverage**, retention/purge, media, public and VOW rules, sold data, and permission for AI, valuation, identity, and STR. The legacy IDX termination clause is not automatically the Direct API contract. |
| 28 | **Baldwin REALTORS MLS** / Baldwin County | Direct outreach; Perchwell transition; endpoint unconfirmed | Perchwell reports a September 22, 2026 transition and is the system of record for new listings and changes. Rules require media rights and distinguish confidential sale-price use in nondisclosure states. Public site terms are not a data license. [Baldwin rules](https://www.baldwincountymls.com/_files/ugd/90365d_7bebbce8859b4f5a83d5fba7dd9c0011.pdf) | Confirm actual post-transition API/provider route, vendor entitlement, refresh, retention, photo, display, field, sold-data, and all internal/derived-data rights. Do not infer anything from Perchwell's marketing announcement. |
| 29 | **Columbus & Central Ohio Regional MLS (CCORMLS)** / Columbus, Hocking Hills | Direct licensing outreach; Spark/FBS delivery to be confirmed | CCORMLS rules state a 12-hour maximum IDX refresh and require accuracy disclaimer, intent notice, opt-outs, designated fields, no confidential fields, and listing-firm/contact attribution. Spark plans and permissions are MLS-controlled. [CCORMLS June 2026 rules](https://cms.columbusrealtors.com/api/media/file/MLS%20Rules%20%26%20%20Regulations%20-%20JUNE%202026.pdf) | Confirm Spark delivery and sponsorship, roles, fields, sold interpretation, media, purge/termination, private/admin scope, branding, AI/AVM/identity/STR use, and the internally tensioned sold/expired/withdrawn wording before implementation. |

## Important cross-provider differences

### 1. The distribution platform is not the licensor

MLS Grid, Trestle, Spark, and RESO Web API provide technical delivery or standardized interfaces. The local MLS, rights holder, Participant/Broker, and executed agreement control the license. A successful connection in one market does not establish rights in another market, even where the adapter and data model are identical.

### 2. MLS Grid has especially concrete replication, media, termination, and AI signals

For MLS Grid markets, the integration must respect the current record-level signal model:

- Ingest only records with the approved use class. `MlgCanUse` distinguishes IDX, VOW, BO, and PT permission contexts.
- When `MlgCanView=false`, remove the locally held record. MLS Grid says those records leave the feed after seven days, so replication cannot be paused longer than that without a full reconciliation/reload.
- Replace records on `ModificationTimestamp`; replace media when photo/media timestamps change; remove missing media resources.
- MLS Grid media is not a web hotlink feed. The documented media model uses expiring, one-time download URLs. Storing a URL for later use, caching it as a URL, or sharing it is not permitted by the public media guidance. A separate written license is still needed to determine whether SavvyOS may retain downloaded media.
- The MLS Grid master agreement publicly describes immediate cessation on termination, destruction of MLS data within 10 days, and destruction of confidential information within five business days after termination or request. Build a provable purge workflow, but check each local MLS addendum for stricter terms.
- The AI Addendum generally allows only narrowly defined IDX/VOW query-response or participant marketing uses absent written approval. Persistent query caching, AI training, embeddings, retrieval/vector indexes, knowledge graphs, testing, fine-tuning, and persistent representations require prior express authorization.

**MLS-specific Grid differences matter:** Canopy specifies its own BO, seller opt-out, content, and AVM rules; MIBOR publishes VOW and media detail; Stellar uses a three-party project model; MARIS has separate written feed agreements; Unlock has explicit closed-listing and AI restrictions; Realtracs has potential but unverified GSMAR transition coverage; MLSOK and Spartanburg route/coverage are not yet verified.

### 3. Trestle product names do not guarantee field or retention rights

Trestle documentation shows categories such as Back Office, Broker Data Feed, IDX, IDX Plus, VOW, Statistics, and custom feeds. It also describes operational concepts such as `ListingKey`, `ModificationTimestamp`, media changes, periodic reconciliation, product-specific credentials, and general freshness targets. These are useful adapter design inputs, not a uniform license.

- **Do not carry Trestle's general five-minute listing and 15-minute image freshness targets into an MLS contract statement.** They are platform-level context, not each MLO's required SLA.
- Trestle's public documentation does not establish a universal deletion flag or an MLS-specific permission to retain stale data. Build daily key reconciliation and provider-defined deletion controls, then contractually validate the required cadence.
- **Media permissions vary.** Trestle availability of a `MediaURL` does not establish the right to cache, proxy, manipulate, train on, or retain photos.
- CPAR has a relatively clear public IDX/IDX Plus/VOW product distinction. HAR has an unusually detailed three-way display and termination agreement. Bright has specific status and photo handling. Other Trestle markets need an executed local contract before scope can be stated.

### 4. Spark/FBS roles are MLS-controlled

Spark documentation describes Private back-office, IDX public-display, and VOW registered-customer roles. Private applications may technically support listing search, CMA, CRM, photo management, and market analysis, but every MLS controls role availability, terms, field access, pricing, and developer approval.

- Plan enrollment, developer authorization, MLS member sponsor, and a current local agreement are activation requirements.
- Spark technical replication needs independent update and reconciliation controls. Polling or API capability does not authorize historic archive, redistribution, resale, or derivatives.
- Several Spark markets have valuable local differences: CCIMLS has a defined PDL and BBO/valuation concepts; ECAR expressly restricts derivative products and analyses without consent; Space Coast puts strong limits on photo reuse; realMLS's BO agreement prohibits unapproved derivatives; ARMLS uses a CLA and makes AI disclosure/authorization explicit.

### 5. Direct RESO is only a transport path

UtahRealEstate requires a registration and executed license, with a Product Description controlling use. It separately markets IDX, VOW, full feed, CRM, analytics, CMA, and back-office products. The API's recommended 15-minute polling and deleted-record endpoint are operational inputs, not a data retention grant. Park City coverage must be confirmed.

For OBAR, Baldwin, and CCORMLS, the actual permitted integration route is unresolved or only partly evidenced. The custom-route adapter must remain unconnected until local written terms are obtained.

### 6. Sold, historical, and photo data are not universal

- Standard IDX frequently excludes sold data. Trestle says ordinary IDX does not provide sold listings, while IDX Plus can provide some depending on the connection.
- Doorify, CPAR, MIAMI, Bright, realMLS, and CCIMLS have distinct public statements about particular sold or historic contexts. None supplies a blanket SavvyOS right to retain, analyze, enrich, or redistribute sold records.
- Unlock limits participant closed-listing display to no sale price and only its primary feed-designated photo. MRMLS IDX prohibits sold display. Bright's photo-removal practices differ from MLS Grid's media behavior. Western Upstate preserves one historical photo after owner removal request. Space Coast requires photo-owner permission for reuse.
- **Treat sold price, sale date, historical photos, and off-market data as field- and use-specific until the local contract says otherwise.**

### 7. Conditional territory requires direct confirmation

Do not activate a market based on a city label, public announcement, or claimed data-coop reach. The following require explicit written coverage confirmation:

| Conditional geography | Why it is conditional | Required proof before activation |
|---|---|---|
| Asheville / Western NC | Canopy/MLS Grid resource and entitlement mapping is unverified | Canopy confirmation of Originating System/feed/resource coverage and Participant rights |
| Smokies / GSMAR | Realtracs announced planned GSMAR onboarding and migration, but live Grid-feed coverage is not confirmed | Realtracs/GSMAR written confirmation of live feed, territory, participating offices, fields, and broker eligibility |
| Florida Keys | MIAMI planned route is Miami only | MIAMI written confirmation of Keys coverage and correct participating MLS or separate route |
| Ann Arbor | MichRIC mentions possible Ann Arbor Area Board data but not SavvyOS entitlement | MichRIC confirmation of data ownership, dataset scope, broker rights, and API plan |
| Broken Bow / McCurtain County | MLSOK Grid participation and territorial coverage are not established | MLSOK confirmation of Grid participation and coverage, or the actual serving MLS/provider route |
| Park City | UtahRealEstate route does not itself prove Park City coverage | UtahRealEstate written market, status, property type, and broker-rights confirmation |
| Shenandoah | Bright route depends on applicable Bright membership | Bright membership/territory confirmation and selected data product |
| Hocking Hills | CCORMLS territory includes only parts of Hocking County in public description | CCORMLS confirmation of exact county/board/field coverage |

## Launch checklist and hard activation gates

No market may pass to activation until all relevant gates are checked and stored in the SavvyOS compliance record.

### A. Commercial and authority gates

1. Identify the **legal SavvyOS entity**, data-controller role, named broker/Participant, brokerage office, licensed users, and any in-house or third-party processors.
2. Obtain the local MLS's **written confirmation of market coverage**, including conditional geographies above.
3. Obtain an executed **MLS-specific agreement** and, where applicable, a platform agreement and three-party broker-vendor-developer agreement. Record agreement version, effective date, renewal, termination, audit, insurance, and indemnity obligations.
4. Select every intended use separately: Back Office/BBO/Private, CRM, transaction management, agent-production analytics, market analytics, CMA, AVM, Participant listings, IDX, VOW, or Vendor Product. Do not select a use speculatively.
5. Obtain an approved **field, status, media, geography, and audience matrix**. It must say which data SavvyOS can retrieve, store, display, export, and retain, and to whom.
6. Obtain written confirmation that SavvyOS and its hosting, observability, support, backup, security, and subcontractor vendors are permitted recipients and processors.
7. Get written decisions on whether SavvyOS may: store photo binaries; use thumbnails/crops; cache or proxy URLs; retain historical/off-market records; use public records; use sold data; export data; combine data with CRM or STR sources; create analytics; calculate valuations; display reports; or retain derived outputs.
8. For AI, obtain a **separate, explicit written approval** that identifies model/provider, prompts, input fields, inference purpose, storage, training prohibition or authorization, output audience, data deletion, and downstream processor restrictions. A generic “AI assistance” statement is insufficient.

### B. Product and display gates

9. For the initial pilot, confirm in writing that the product is **internal Back Office only** or an equivalent non-public product. Restrict use to approved brokerage users. No public pages, VOW login, consumer search, lead routing, marketing, client portal, or seller CRM synchronization.
10. If a later IDX/VOW product is approved, implement only the local MLS's current display rules: brokerage and listing attribution, MLS source, license/copyright notices, logos, timestamp/reliability and consumer-use disclaimers, contact details, source labels, personal-use terms, privacy policy, VOW login/registration, audit access, anti-scraping, and DMCA procedures.
11. Implement field-level protection for seller/occupant names, phone numbers, emails, access codes, showing instructions, security details, agent/office remarks, compensation data, listing agreement type, and every other confidential field. Default to deny.
12. Implement seller/listing Internet, address, comment/review, and automated-value opt-outs. Preserve the fact of the opt-out and the source timestamp without retaining prohibited content.
13. Treat photos, virtual tours, floor plans, documents, remarks, and structured listing content as separately licensed content. Do not reuse assets on a new listing, edit media, strip watermarks/copyright notices, or use media for AI without explicit rights.

### C. Technical and data-lifecycle gates

14. Store provider, MLS, feed, permission lane, field entitlement, record identifier, content status, `MlgCanUse` or equivalent, source timestamp, received timestamp, and deletion/purge state for every ingested item.
15. Make visibility/permission removal authoritative. For MLS Grid, delete on `MlgCanView=false`, replace changed record/resource data, replace changed media, remove absent media keys, and design scheduled reconciliation within the documented seven-day removal window. For Trestle, Spark, and direct RESO, use provider-specific incremental and full-key reconciliation only after contractual approval.
16. Do not hotlink Grid media. For all other providers, default to no local photo storage, proxying, CDN use, image transformation, or long-lived media cache until the local contract permits it.
17. Encrypt data in transit and at rest; isolate tenants and feeds; use least privilege, user SSO/MFA, approved device/session policies, audit logs, rate limiting, secret rotation, and incident procedures. Never share MLS user credentials.
18. Keep raw records, indexes, media, exports, logs, data warehouse copies, backups, test fixtures, support tickets, observability payloads, queues, and derived tables in the same data lifecycle inventory.
19. Test, evidence, and sign off deletion workflows for listing removal, status loss, photo removal, opt-out, feed revocation, agreement expiration, and broker termination. The system must purge or irreversibly destroy data from all identified locations within the controlling contract deadline and create an attestation/evidence package.
20. Configure a kill switch per MLS/feed/use class. Revocation must stop pulls, access tokens, displays, exports, queues, derived computations, and downstream deliveries immediately.
21. Run no provider live calls, load tests, backfills, sample pulls, or credential validation until written activation approval is received. Use synthetic data for development and QA.

### D. Governance gates

22. Assign a business owner, broker compliance owner, technical owner, incident contact, and renewal owner for every MLS.
23. Maintain a current rules archive and re-review at each contract renewal, material product change, new geography, new user class, new feature, AI supplier change, or data-sharing change.
24. Obtain counsel or MLS compliance review for any contractual interpretation, particularly sold-price, nondisclosure-state, photo copyright, valuation, statistical-report, broker-client, public display, or derived-data issue.

## Pre-activation inputs Tyler or the broker must supply

Before SavvyOS activates **any** adapter or requests credentials, Tyler or the sponsoring broker must provide the following for that MLS:

1. **Broker/Participant identity:** legal brokerage name, office ID, Participant ID, MLS member status, state license details if requested, designated broker, and the exact local MLS account holding participatory rights.
2. **Market confirmation:** written local MLS confirmation of the target geography, including the conditional areas listed above, property types, statuses, and data coverage.
3. **Executed authorization:** completed MLS/vendor/Broker agreement, current addenda, selected product/use options, current rules, and any three-party agreement. Include a copy of the signed agreement and the MLS compliance contact.
4. **Approved use statement:** a signed statement that expressly names SavvyOS, its legal entity, the broker, intended users, internal admin search scope, allowed CRM or transaction functions if any, allowed analytics/CMA/AVM functions if any, public display status, and prohibited uses.
5. **Data/field schedule:** permitted resources and fields, all confidential fields, statuses, history/sold rules, address and seller opt-outs, listing-level exclusions, photo/document rights, feed refresh requirement, display/disclaimer/logo package, and source/attribution text.
6. **Retention and purge schedule:** accepted local deadlines for changed/removed listings, photos, opt-outs, termination, backups, logs, exports, caches, and any permitted historical or derived data. Require the MLS to state whether derived data can survive deletion or termination.
7. **Media decision:** written yes/no for local binary storage, thumbnailing, cropping, CDN/proxy, transformation, attribution/copyright notice, removal process, and post-termination handling. If no clear yes, SavvyOS must not store media.
8. **AI and enrichment decision:** written yes/no for each model/provider and each of AI inference, prompt use, caching, training, embeddings, retrieval/vector index, knowledge graph, valuation features, property identity, public-record/CRM joins, STR enrichment, analytics, and sharing. A “no response” means **not permitted**.
9. **Credential package after approval:** approved API application/client credentials or tokens, environment/endpoint, OriginatingSystemName or plan/role, allowed API scopes, user-agent requirements, rate limits, sandbox policy, IP allowlisting, rotation process, and emergency revocation contact. Credentials must not be emailed or entered into source control.
10. **Operational contacts:** MLS data licensing contact, compliance contact, technical support contact, broker compliance owner, security/incident contact, and agreement renewal date.

## Exact source register

The following are the verified source links supplied in the per-MLS research. Platform references may be informative only; each local MLS agreement and approval controls actual rights.

### Canopy MLS
- [Canopy MLS Data Licensing](https://go.canopymls.com/data/)
- [Canopy MLS Rules and Regulations](https://brokerrelations.canopyrealtors.com/mls-compliance-training/rules-regulations/)
- [Canopy MLS Internet Data Exchange Program](https://carolinamls.happyfox.com/kb/article/331-canopy-mls-internet-data-exchange-idx-program/)
- [Canopy Dictionary](https://brokerrelations.canopyrealtors.com/compliance-education/canopy-dictionary/)
- [Canopy AI-enhanced images and unauthorized content use](https://support.canopymls.com/kb/article/104-digital-virtually-staged-and-ai-enhanced-images-and-unauthorized-use-of-listing-content/)
- [MLS Grid overview](https://www.mlsgrid.com/)

### MLS Grid markets: MIBOR, Stellar, MARIS, Unlock, Spartanburg, MLSOK, Realtracs
- [MLS Grid API Version 2.0](https://docs.mlsgrid.com/api-documentation/api-version-2.0)
- [MLS Grid Resources and Guides](https://www.mlsgrid.com/resources)
- [MLS Grid FAQ](https://www.mlsgrid.com/faq)
- [MLS Grid Master Data License Agreement](https://www.mlsgrid.com/s/MLS-GRID-Data-License-Agreement.pdf)
- [MLS Grid IDX Rules, updated September 17, 2026](https://www.mlsgrid.com/s/MLS-Grid-IDX-Rules.pdf)
- [MLS Grid VOW Rules](https://www.mlsgrid.com/s/MLS-Grid-VOW-Rules.pdf)
- [MLS Grid AI Use Addendum](https://www.mlsgrid.com/s/MLS-Grid-AI-Use-Addendum.pdf)
- [MLS Grid media delivery migration notice](https://docs.mlsgrid.com/releases/upcoming-changes-to-media-delivery-migration-away-from-amazon-aws)
- [MLS Grid media access notice](https://docs.mlsgrid.com/recent-releases/changes-to-mls-grid-media-access)
- [MIBOR/BLC Rules, January 2026](https://www.mibor.com/wp-content/uploads/2026/01/BLC_Rules_and_Regulations_01302026.pdf)
- [Stellar MLS Data Delivery](https://www.stellarmls.com/data-delivery)
- [Stellar MLS Rules landing page](https://rules.stellarmls.com/)
- [MARIS Rules, January 2023](https://marismls.com/userfiles/kcfinder/files/2023_RulesPacket_FINAL_011923.pdf)
- [MARIS Participant Agreement, July 2024](https://marismls.com/userfiles/kcfinder/files/241009%20MARIS%20Participant%20Agreement%20-%20LS%20%28clean%29.pdf)
- [MARIS data-use guidance](https://marismls.com/news/headlines/data-use-abuse-keeping-agents-brokerages-out-of-trouble)
- [Unlock MLS photography guidance](https://www.unlockmls.com/photography-guidelines)
- [Spartanburg MLS Membership](https://www.spartanburgrealtors.com/mls-membership/)
- [Spartanburg Participant-Subscriber Agreement](https://members.spartanburgrealtors.com/subscriber-agreement)
- [Realtracs Data Delivery](https://www.realtracs.com/info/data-delivery/)
- [Realtracs Rules, April 1, 2025](https://20846796.fs1.hubspotusercontent-na1.net/hubfs/20846796/MLS%20Rules%2C%20User%20Agreement%2C%20and%20Participation%20Agreements/Realtracs%20Rules%20April%201%2C%202025.pdf)
- [GSMAR Rules and Regulations](https://www.gsmar.org/gsmar-rules-and-regulations/)
- [Realtracs GSMAR transition announcement](https://www.realtracs.com/info/great-smoky-mountain-association-of-realtors-selects-realtracs/)

### Trestle markets: Doorify, Hive, Western Upstate, CPAR, HAR, MIAMI, Montana, ArkansasONE, Bright
- [Trestle for Multiple Listing Managers Release Guide](https://trestle.corelogic.com/Content/Trestle%20for%20Multiple%20Listing%20Managers%20Release%20v2.pdf)
- [Trestle FAQ](https://trestle-documentation.corelogic.com/support/faq/)
- [Doorify Rules and Regulations](https://support.doorifymls.com/hc/en-us/articles/32402136977427-Rules-Regulations)
- [Doorify IDX options](https://support.doorifymls.com/hc/en-us/articles/360063826853-What-are-my-options-for-IDX)
- [Doorify syndication versus IDX](https://support.doorifymls.com/hc/en-us/articles/1500002027061-What-is-the-difference-between-Syndication-and-IDX)
- [Doorify photo requirements](https://support.doorifymls.com/hc/en-us/articles/360058227993-What-are-the-Photo-Requirements-for-a-listing)
- [Doorify media guidelines](https://support.doorifymls.com/hc/en-us/articles/33997561324819-Data-Integrity-Media-Guidelines)
- [Hive MLS IDX and data feed](https://www.ncrmls.com/idx)
- [Hive MLS Rules, September 11, 2025](https://www.ncrmls.com/Hive_MLS_Rules_UPDATED_9_11_25%201.pdf)
- [Western Upstate MLS Rules, May 2025](https://www.westernupstatemls.com/wp-content/uploads/2025/10/Western-Upstate-MLS-Rules-and-Regulations-May-2025.pdf)
- [Western Upstate Full Data Feed Contract](https://www.westernupstatemls.com/wp-content/uploads/2019/01/Western-Upstate-MLS-Full-Data-Feed-Contract.pdf)
- [Western Upstate Policies](https://www.westernupstatemls.com/member-services/policies/)
- [CPAR Data Feeds, IDX, API](https://www.cpar.us/mls/data-feeds-idx-api/)
- [CPAR Multiple Listing Options for Sellers](https://www.cpar.us/main/multiple-listing-options-for-sellers/)
- [CPAR Clear Cooperation](https://www.cpar.us/mls/clear-cooperation/)
- [CPAR MLS-only Subscriber Application](https://www.cpar.us/clientuploads/Applications/2024/MLS_ONLY_Fillable_Application.pdf)
- [HAR MLS information](https://www.har.com/content/department/mls_site)
- [HRIS Three-Way Third-Party Services Agreement](https://www.harconnect.com/wp-content/uploads/2024/10/3-Way-Third-Party-Services-Agreement-2022c-1.pdf)
- [HAR MLS Rules](https://www.har.com/mls/MLSRules.pdf)
- [MIAMI MLS Rules, August 21, 2025](https://www.miamirealtors.com/wp-content/uploads/bsk-pdf-manager/2020/04/mls-rules-and-regulations.pdf)
- [MIAMI IDX FAQ](https://www.miamirealtors.com/wp-content/uploads/bsk-pdf-manager/2024/03/IDX-FAQS.pdf)
- [MIAMI IDX and API pricing](https://www.miamirealtors.com/mls/webapi/pricing/)
- [MIAMI Broker Attribution FAQ](https://www.miamirealtors.com/brokers/attributionfaqs/)
- [Florida REALTORS photo copyright guidance](https://www.miamirealtors.com/wp-content/uploads/bsk-pdf-manager/2019/12/PHOTOS-Cease-Desist.pdf)
- [Montana Regional MLS Rules, March 5, 2026](https://www.406mls.com/wp-content/uploads/2026/03/MRMLS-Rules-Regulations.pdf)
- [Montana Regional MLS listing data feeds](https://www.406mls.com/realtor-resources/listing-data-feeds/)
- [ArkansasONE MLS](https://www.arkansasonemls.org/)
- [ArkansasONE contact](https://www.arkansasonemls.org/contact)
- [Bright MLS Subscription Agreement](https://www.brightmls.com/subscription-agreement)
- [Bright direct data access](https://brightmls.com/directdataaccess)
- [Bright approved IDX vendors](https://support.brightmls.com/s/article/Bright-MLS-Approved-IDX-Vendors)
- [Bright image and document rules](https://image.m.brightmls.com/lib/fe2b11747364047b741278/m/1/f31c3aee-aba8-446d-9472-d47d387185c7.pdf)
- [Bright photo and digital display rules](https://image.m.brightmls.com/lib/fe2b11747364047b741278/m/1/c0ddb804-f067-47e9-91fb-a2b2744810d1.pdf)
- [Bright data correction policies](https://support.brightmls.com/s/article/Bright-MLS-Data-Corrections-Policies)
- [Bright listing status definitions](https://support.brightmls.com/s/article/Listing-Status-Definitions)
- [Bright AVM guidance](https://support.brightmls.com/s/article/AVM-What-is-it)

### Spark/FBS markets: PMAR, MOREMLS, ECAR, Space Coast, realMLS, MichRIC, CCIMLS, ARMLS, CCORMLS
- [Spark API overview](https://sparkplatform.com/docs/overview/api)
- [Spark API access setup](https://sparkplatform.com/docs/overview/set_up_access)
- [Spark roles](https://sparkplatform.com/docs/supporting_documentation/roles)
- [Spark Datamart](https://www.sparkapi.io/)
- [PMAR Subscriber Agreement](https://poconorealtors.com/wp-content/uploads/2024/05/PMAR-Subscriber-Agreement-2024.pdf)
- [PMAR property search](https://poconorealtors.com/property-search/)
- [MOREMLS Rules, April 2026](https://monmouthoceanrealtors.com/wp-content/uploads/2026/04/RulesApr2026.pdf)
- [MOREMLS IDX versus VOW](https://monmouthoceanrealtors.com/idx-vs-vow/)
- [MOREMLS IDX/VOW Data Access Agreement](https://monmouthoceanrealtors.com/wp-content/uploads/2026/05/IDX-AGREEMENT_2026.pdf)
- [ECAR Resource Center](https://www.emeraldcoastrealtors.com/resource-center/)
- [ECAR Residential MLS Rules](https://www.emeraldcoastrealtors.com/wp-content/uploads/2024/09/MLS-rules-draft-8-9-2024-redline-removed-1.pdf)
- [ECAR request to withhold property photos](https://www.emeraldcoastrealtors.com/wp-content/uploads/2022/10/request-to-withhold-property-photos.pdf)
- [ECAR request to withhold seller/buyer name](https://www.emeraldcoastrealtors.com/wp-content/uploads/2022/10/request-to-withhold-seller-buyer-name.pdf)
- [Space Coast MLS Rules](https://www.spacecoastmls.com/home/mlsrules)
- [Space Coast photo clarification](https://members.spacecoastmls.com/blogs/kymberly-franklin/2024/08/28/space-coast-mls-photo-rule-clarifications)
- [Space Coast governing documents](https://www.spacecoastmls.com/about-us/about-the-association/space-coast-governing-documents)
- [realMLS data licensing options](https://www.realmls.com/data-products/)
- [NEFMLS IDX Rules](https://stage.realmls.com/wp-content/uploads/NEFMLS-IDX-Rules-Regulations.pdf)
- [NEFMLS VOW and Back Office Rules](https://stage.realmls.com/wp-content/uploads/NEFMLS-VOW-and-Back-Office-Rules-Regulations.pdf)
- [NEFMLS Back Office Data License Agreement](https://www.realmls.com/wp-content/uploads/Back-Office-Agreement-watermark.pdf)
- [realMLS Data Integrity quick guide](https://www.realmls.com/wp-content/uploads/realMLS-Data-Integrity-Policy-Quick-Guide-1-1.pdf)
- [realMLS Broker Portal](https://www.realmls.com/broker-portal/)
- [MichRIC API access](https://mlshelp.com/api)
- [Spark RESO versus RETS guidance](https://sparkplatform.com/docs/overview/api_vs_rets)
- [RESO Web API](https://www.reso.org/reso-web-api/)
- [NAR photo copyright considerations](https://www.nar.realtor/ae/manage-your-association/association-policy/copyright-considerations-for-mls-photographs)
- [CCIMLS Data Distribution Guidelines](https://cciaor.com/data-distribution-guidelines)
- [CCIMLS Rules, June 3, 2026](https://cciaor.com/uploads/MLS-Rules-Regulations_June-3-2026.pdf)
- [CCIMLS Participant Data License](https://cciaor.com/uploads/FINAL_CCIMLS-Participant-Data-License-Modified-clean.pdf)
- [CCIMLS services and data resources](https://cciaor.com/cape-island-mls)
- [CCIMLS Comparable Sale Policy](https://cciaor.com/help-center/what-is-the-comparable-sale-policy)
- [ARMLS Rules, May 28, 2026](https://armls.com/docs/armls-rules-regulations.pdf)
- [ARMLS Content Access Policy](https://armls.com/docs/content-access-policy.pdf)
- [ARMLS photo rules](https://armls.com/all-about-armls-photo-rules)
- [ARMLS watermarks guidance](https://armls.com/watermarks)
- [Columbus REALTORS MLS information](https://columbusrealtors.com/mls-information)
- [CCORMLS Rules, June 2026](https://cms.columbusrealtors.com/api/media/file/MLS%20Rules%20%26%20%20Regulations%20-%20JUNE%202026.pdf)

### Direct and unresolved-route markets: OBAR, UtahRealEstate, Baldwin
- [OBAR MLS Rules, Revision 65](https://outerbanksassociationofrealtors.growthzoneapp.com/ap/CloudFile/Download/p9W4GMkL)
- [OBAR Rules update](https://www.outerbanksrealtors.com/2022/05/27/mls-rules-regulations-update/)
- [OBAR official site](https://www.outerbanksrealtors.com/)
- [UtahRealEstate Data Services FAQ](https://vendor.utahrealestate.com/faq)
- [UtahRealEstate Web API docs](https://vendor.utahrealestate.com/webapi/docs)
- [UtahRealEstate replication docs](https://vendor.utahrealestate.com/webapi/docs/tuts/replication)
- [UtahRealEstate photo docs](https://vendor.utahrealestate.com/webapi/docs/tuts/photos)
- [UtahRealEstate Internet Visibility](https://vendor.utahrealestate.com/webapi/internet_visibility)
- [UtahRealEstate legacy IDX RETS license](https://vendor.utahrealestate.com/rets/current_license)
- [Baldwin REALTORS Rules, official page](https://baldwinrealtors.freshdesk.com/support/solutions/articles/151000179212-baldwin-realtors-rules-and-regulations-official)
- [Baldwin MLS Rules, updated October 2025](https://www.baldwincountymls.com/_files/ugd/90365d_7bebbce8859b4f5a83d5fba7dd9c0011.pdf)
- [Baldwin REALTORS Terms of Use](https://baldwinrealtors.com/legal/gdpr)
- [Perchwell Baldwin MLS transition announcement](https://www.perchwell.com/blog/baldwin-mls-completes-transition-to-perchwell)

### Reference-only policy context
- [NAR IDX background and FAQ](https://www.nar.realtor/about-nar/policies/internet-data-exchange-idx/internet-data-exchange-idx-background-and-faq)
- [NAR IDX policy](https://www.nar.realtor/about-nar/policies/internet-data-exchange-idx)
- [NAR Model MLS Rules](https://www.nar.realtor/handbook-on-multiple-listing-policy/c-model-rules-and-regulations-for-an-mls-operated-as-a-committee-of-an-association-of-realtors)
- [NAR model rules for separately incorporated MLS](https://www.nar.realtor/handbook-on-multiple-listing-policy/f-model-rules-and-regulations-for-an-mls-separately-incorporated-but-wholly-owned-by-an-association)
- [NAR Model IDX Provisions](https://www.nar.realtor/about-nar/policies/internet-data-exchange-idx/model-idx-provisions-for-mls-rules)

## Bottom line

SavvyOS has a technically sensible **adapter strategy**, but no provider route should be treated as live or licensed. The next business action is a documented **Canopy-only, internal Back Office pilot approval package**, followed by credentials only after local MLS and broker approval. Every other market should remain a research-backed placeholder until its local MLS, coverage, use class, media rights, lifecycle terms, and AI/derived-data position are explicitly approved in writing.
