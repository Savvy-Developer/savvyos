/**
 * Fixed path redirects on the public site at /newsite: an address that used
 * to show a page and now lives somewhere else, such as a listing whose slug
 * changed. Each one answers with a permanent (301) redirect to the new page,
 * query string carried over so ad and email tracking survives.
 *
 * Kept in code rather than in the database on purpose: the list is short,
 * changes rarely, and every change is reviewed with the reason next to it.
 * The admin-managed redirects (Landing Pages > Redirects) still run first and
 * win for the same address.
 *
 * Rules, checked by buildPathRedirectTable and the tests:
 * - Both sides are paths on this site, under /newsite. Never a full URL, so
 *   this can never become an open redirect.
 * - A source is a page address only: no query string or # fragment.
 * - No loops and no chains: a target can not be another entry's source.
 *   Point the old entry straight at the final page instead.
 *
 * Pure: no database or Express. server/websitePathRedirects.ts applies it.
 */

export type WebsitePathRedirect = {
  /** The old address, e.g. "/newsite/properties/old-slug". */
  from: string;
  /** Where it lives now, e.g. "/newsite/properties/new-slug". */
  to: string;
  /** Why it exists, for whoever reads this list next. */
  reason: string;
};

const BASE = "/newsite";

export const WEBSITE_PATH_REDIRECTS: WebsitePathRedirect[] = [
  {
    from: "/newsite/properties/overlook-glendale-ut",
    to: "/newsite/properties/360-e-overlook-ln-glendale-t7in53",
    reason: "Retired listing address. The listing now lives at the slug the old site used.",
  },
  // Old savvy-agents.com listings whose house is published on the new site
  // under a different slug (see docs/redirect-map.csv, match_type "renamed").
  // The legacy redirect sends /properties/<old slug> here, then straight on.
  {
    from: "/newsite/properties/707-n-1490-e-heber-wn9y7n",
    to: "/newsite/properties/1490-east-heber-city-ut",
    reason: "Old site slug for 707 N 1490 E, Heber City.",
  },
  {
    from: "/newsite/properties/608-touchstone-circle-port-orange-3h6m91",
    to: "/newsite/properties/608-touchstone-circle-port-orange",
    reason: "Old site slug for 608 Touchstone Circle, Port Orange.",
  },
  {
    from: "/newsite/properties/3-old-marina-drive-ocean-isle-beach-38dtrk",
    to: "/newsite/properties/3-old-marina-drive-ocean-isle-beach",
    reason: "Old site slug for 3 Old Marina Drive, Ocean Isle Beach.",
  },
  {
    from: "/newsite/properties/337-ne-41st-street-oak-island-qdx155",
    to: "/newsite/properties/337-ne-41st-street-oak-island",
    reason: "Old site slug for 337 NE 41st Street, Oak Island.",
  },
  {
    from: "/newsite/properties/200-park-charles-blvd-s-saint-peters-xe0wds",
    to: "/newsite/properties/200-park-charles-boulevard-saint-peters",
    reason: "Old site slug for 200 Park Charles Blvd S, Saint Peters.",
  },
  {
    from: "/newsite/properties/22-saint-mark-dr-saint-peters-z0d1iw",
    to: "/newsite/properties/22-saint-mark-drive-saint-peters",
    reason: "Old site slug for 22 Saint Mark Dr, Saint Peters.",
  },
  {
    from: "/newsite/properties/581-10th-st-key-colony-beach-lng0gz",
    to: "/newsite/properties/581-10th-street-key-colony-beach",
    reason: "Old site slug for 581 10th St, Key Colony Beach.",
  },
  // Old agent profile slugs carried a -2 suffix the new profiles dropped.
  { from: "/newsite/agents/cole-lema-2", to: "/newsite/agents/cole-lema", reason: "Old site agent slug." },
  { from: "/newsite/agents/ana-estevez-2", to: "/newsite/agents/ana-estevez", reason: "Old site agent slug." },
  // Old articles republished under a new slug, same title.
  {
    from: "/newsite/resources/cape-cod-str-rules-before-you-buy",
    to: "/newsite/resources/check-str-rules-before-you-fall-in-love",
    reason: "Old site article slug, same article.",
  },
  {
    from: "/newsite/resources/jersey-shore-december-31-in-service-timeline",
    to: "/newsite/resources/fall-timeline-for-a-jersey-shore-rental",
    reason: "Old site article slug, same article.",
  },
  {
    from: "/newsite/resources/year-one-vs-year-two-what-2-years-of-real-str-performance-data-shows",
    to: "/newsite/resources/year-one-vs-year-two-str-performance",
    reason: "Old site article slug, same article (title now says Two, not 2).",
  },
  // Markets renamed in SavvyOS. The old site's /markets/<state>/<city> keeps
  // its address under /newsite, so these catch the old names.
  { from: "/newsite/markets/fl/daytona", to: "/newsite/markets/fl/daytona-beach", reason: "Market renamed." },
  { from: "/newsite/markets/fl/st-augustine", to: "/newsite/markets/fl/ne-fl-st-augustine", reason: "Market renamed." },
  { from: "/newsite/markets/ky/bourbon-trail", to: "/newsite/markets/ky/kentucky-bourbon-trail", reason: "Market renamed." },
  { from: "/newsite/markets/mo/st-charles-county", to: "/newsite/markets/mo/st-charles", reason: "Market renamed." },
  { from: "/newsite/markets/mt/whitefish", to: "/newsite/markets/mt/whitefish-glacier-national-park", reason: "Market renamed." },
  { from: "/newsite/markets/nj/jersey-shore", to: "/newsite/markets/nj/new-jersey", reason: "Market renamed." },
];

/** "/newsite/a/b/" and "/newsite//a/B" both become "/newsite/a/b". */
export function normalizeRedirectPath(path: string): string {
  return `/${path.replace(/^\/+|\/+$/g, "")}`.replace(/\/{2,}/g, "/").toLowerCase();
}

function isSitePath(path: string): boolean {
  return (
    path.startsWith(`${BASE}/`) &&
    !/[?#\\\s]/.test(path) &&
    !path.includes("//") &&
    !path.split("/").some(segment => segment === "." || segment === "..")
  );
}

export type PathRedirectTable = {
  /** Normalized source path to target path. */
  targets: Map<string, string>;
  /** One line per entry left out, with the reason. Empty when the list is valid. */
  errors: string[];
};

/** Checks every entry and keeps the valid ones. A bad entry is dropped, never served. */
export function buildPathRedirectTable(entries: WebsitePathRedirect[]): PathRedirectTable {
  const errors: string[] = [];
  const candidates = new Map<string, string>();
  for (const entry of entries) {
    const from = normalizeRedirectPath(entry.from);
    const to = entry.to.trim();
    if (!isSitePath(from) || from === BASE) {
      errors.push(`${entry.from}: the old address must be a page under ${BASE}/ with no query string.`);
      continue;
    }
    if (!isSitePath(to.split("?")[0])) {
      errors.push(`${entry.from}: the target must be a path on this site under ${BASE}/, not a full URL.`);
      continue;
    }
    if (normalizeRedirectPath(to.split("?")[0]) === from) {
      errors.push(`${entry.from}: redirects to itself.`);
      continue;
    }
    if (candidates.has(from)) {
      errors.push(`${entry.from}: listed more than once.`);
      continue;
    }
    candidates.set(from, to);
  }
  // No chains (and so no loops): a target must be a final page.
  const targets = new Map<string, string>();
  for (const [from, to] of Array.from(candidates)) {
    if (candidates.has(normalizeRedirectPath(to.split("?")[0]))) {
      errors.push(`${from}: redirects to ${to}, which itself redirects. Point it at the final page.`);
      continue;
    }
    targets.set(from, to);
  }
  return { targets, errors };
}

const SHIPPED = buildPathRedirectTable(WEBSITE_PATH_REDIRECTS);

/** Problems in the shipped list. The tests require this to be empty. */
export const WEBSITE_PATH_REDIRECT_ERRORS = SHIPPED.errors;

/** The query string of a request URL, with its "?", or "". */
function queryOf(originalUrl: string): string {
  const at = originalUrl.indexOf("?");
  if (at === -1) return "";
  const query = originalUrl.slice(at);
  return query === "?" ? "" : query;
}

/**
 * Where a request should be redirected, or null to serve it as usual.
 * `path` is the request path (trailing slash and case don't matter);
 * `originalUrl` is path plus query string, carried over unchanged.
 */
export function websitePathRedirectTarget(
  path: string,
  originalUrl: string = path,
  table: PathRedirectTable = SHIPPED
): string | null {
  const from = normalizeRedirectPath(path);
  if (from !== BASE && !from.startsWith(`${BASE}/`)) return null;
  const to = table.targets.get(from);
  if (!to) return null;
  const query = queryOf(originalUrl);
  if (!query) return to;
  return to.includes("?") ? `${to}&${query.slice(1)}` : `${to}${query}`;
}
