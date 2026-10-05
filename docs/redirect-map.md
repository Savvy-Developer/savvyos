# Old site to new site redirect map

Built 2026-10-05 for Rock 1 Milestone 3. The full row-by-row map is in
[`redirect-map.csv`](./redirect-map.csv) (`old_url,new_url,match_type,notes`).
Nothing here switches the domain or changes DNS.

## How it was built

Every request was a public GET. There were no form submits, no admin calls and
no database queries.

- **Old URLs (1,088):** `www.savvy-agents.com/sitemap.xml` (863 URLs, a plain
  urlset with no index), plus the pages the old sitemap leaves out: agent
  profiles, case studies, articles and market pages. Those came from the old
  public APIs (`/api/agents`, `/api/case-studies`, `/api/blogs`,
  `/api/properties?status=published`) and the links on `/agents`,
  `/case-studies`, `/resources` and `/markets`. `/resources`, `/sell` and
  `/join-our-team` were added from the old site's routes.
- **New URLs:** `home.savvy-agents.com/sitemap.xml` (111 URLs), which lists
  every published page. Titles and addresses came from `website.publicProperty`,
  `publicAgents`, `publicCaseStudies`, `publicPosts`, `publicCaseStudy`,
  `publicPost` and `publicMarketDirectory`. I also spot-checked 12 random
  unmatched property slugs with `website.publicProperty`, and all 12 returned
  null.
- **Matching:**
  - Properties: exact slug first, then the same house (street number, street
    name, city) published under another slug.
  - Agents: slug first, then the same name.
  - Case studies and articles: slug first, then the same title.
  - Markets: `/markets/<state>/<city>` slug first. Renames were matched by hand
    against the market directory.

## Counts

| Kind | exact-slug | renamed | static | none | Total |
|---|---:|---:|---:|---:|---:|
| Static pages (home, about, contact, team, sell, join, privacy, legal, recent-sales) | | | 9 | | 9 |
| Properties (incl. `/properties` list) | 1 | 8 | 1 | 843 | 853 |
| Agents (incl. list) | 45 | 2 | 1 | 11 | 59 |
| Case studies (incl. list) | 1 | 0 | 1 | 72 | 74 |
| Resources / articles (incl. list) | 0 | 3 | 1 | 30 | 34 |
| Markets (incl. list) | 16 | 8 | 1 | 34 | 59 |
| **Total** | **63** | **21** | **14** | **990** | **1,088** |

`/recent-sales` is mapped `static` to Case Studies because the new site has no
recent-sales page. The legacy rule already uses a 302 for it, so the target can
change later.

18 of the 21 renamed rows are now in the new path redirect table
(`shared/websitePathRedirects.ts`), so an old URL reaches its page in one 301
hop. These 3 renamed rows are not in the table and need a decision:

- `/properties/6927-s-virginia-dare-trl-14-nags-head-8p5iv9`: the old address
  has unit #14. The published `6927-south-virginia-dare-trail-nags-head` has no
  unit. Confirm it is the same unit before redirecting.
- `/markets/fl/the-florida-keys` to `/markets/fl/key-west`: this is the nearest
  market, not the same one.
- `/markets/fl/central-and-north-florida` to `/markets/fl/central-fl`: this is
  also the nearest market, not the same one.

## Unmatched old URLs, by kind

### Properties: 843

These old listings are not published on the new site. The Oct 2 old-site import
(`server/oldSiteListingImport.ts`) brought in every listing that was live on the
old site as a **Draft** at the same slug. It skipped a listing only when the
slug or the house already existed. So nearly all of these are most likely
**drafts on new site**.

Public endpoints cannot tell a draft from a listing that is not there at all:
`publicProperty` hides drafts from anonymous visitors. One read-only query would
confirm it:
`SELECT slug, status FROM website_properties WHERE slug IN (...)`. The row-level
notes say "most likely a draft on new site" for this reason.

Until a listing is published, `legacySiteRedirects` sends its old URL to
`/newsite/properties` with a 302. Once it is published, the old URL 301s to the
listing automatically. No table entry is needed.

Three of the 843 appear in the old sitemap but not in the old listings API, so
their notes have no address.

### Agents: 11

No published profile on the new site: `liz-huxley`, `kristin-hajek` (Nicki
Hajek), `james-st-laurent`, `liz-davis`, `julie-boone`, `blake-carter`,
`ryan-mcfadyen`, `jeremy-holden`, `sales-savvy` (a house account),
`james-wright` and `dhruv-chougle`. These fall back to `/newsite/agents` with a
302.

### Case studies: 72

Only `orem-utah-511755547` is published under its old slug. The other 72 old
case studies are not published on the new site, which has 4 case studies. Most
of them are Western NC, Outer Banks, Greenville SC, Jersey Shore and Florida
deals. These fall back to `/newsite/case-studies` with a 302.

### Resources (articles): 30

Three old articles matched new ones: Cape Cod / STR rules, Jersey Shore
timeline, and Year One vs Year Two. The other 30 are not on the new site, which
has 3 articles. Examples include Gulf Shores condos, Outer Banks buy/sell
timing, DSCR loans, STR insurance, best markets 2026 and St. Louis. These fall
back to `/newsite/resources` with a 302.

### Markets: 34

The SavvyOS market directory has no market for these:

- az/scottsdale
- fl/bradenton, clearwater, cocoa-beach, emerald-coast,
  palm-coast-flagler-beach, seminole, south-florida, south-miami,
  southwest-florida, tampa, treasure-coast
- ga/metro-atlanta, north-georgia
- in/indianapolis
- ma/cape-cod
- mi/ann-arbor
- mo/lake-of-the-ozarks
- ms/mississippi
- nc/carolina-beach, charlotte, holden-beach, oak-island, ocean-isle-beach,
  sunset-beach, wilmington
- sc/columbia, greenville, myrtle-beach
- tn/smokies
- tx/galveston
- ut/salt-lake-city, southern-utah
- wa/seattle

These used to redirect to a "couldn't find that market" page. Now that missing
pages return a real 404, the legacy redirect checks the market directory and
sends these to `/newsite/markets` with a 302.

## Recommendations

1. **Publish, or confirm, the drafted listings that are still for sale.** This
   is the biggest gap: 843 indexed URLs land on the list page. Each listing
   published at its old slug fixes its own redirect, with no code change.
2. **Retire sold or withdrawn listings on purpose.** A listing that will never
   be published can stay on the 302 to the list. Alternatively, add a market or
   area target to `shared/websitePathRedirects.ts` if there is a better page.
3. **Decide the 3 open renames** above (6927 unit #14, Florida Keys, Central and
   North Florida) and add them to the table if they are right.
4. **Add markets for the high-value gaps**, such as Brunswick County beaches
   (Oak Island, Ocean Isle, Holden, Sunset), Wilmington, Myrtle Beach, Smokies,
   Scottsdale and Cape Cod. Alternatively, map each one to its nearest market in
   the table. Many old listings and articles sit in these areas.
5. **Case studies and articles:** decide whether to republish the old ones.
   Western NC alone has about 40 case studies. If they are republished at their
   old slugs, the legacy redirect picks them up automatically.
6. **Before the domain switch,** re-run this map, because the published set
   changes daily. The scripts used are simple and the CSV can be regenerated.
   Then check that Search Console's indexed old URLs are a subset of these rows.
