import { websitePageTitle } from "@shared/websitePageTitle";
import { websitePageSlug } from "@shared/websitePageSlug";
/**
 * What search engines and link previews see for the public site at /newsite.
 *
 * The site is a single-page app: every address returns the same index.html and
 * the browser fills in the page. Google and the Facebook/Slack/iMessage preview
 * fetchers read that first HTML and nothing else, so without this every page
 * looked like an untitled, undescribed copy of every other page.
 *
 * Pure: no database, no request. server/websiteSeo.ts does the lookups and
 * feeds the results through here, which keeps the rules testable.
 */

export const WEBSITE_BASE_PATH = "/newsite";
export const SITE_NAME = "Savvy STR Agents";

export type WebsiteRoute =
  | { kind: "home" }
  | { kind: "properties" }
  | { kind: "property"; slug: string }
  | { kind: "agents" }
  | { kind: "agent"; slug: string }
  | { kind: "caseStudies" }
  | { kind: "caseStudy"; slug: string }
  | { kind: "resources" }
  | { kind: "resource"; slug: string }
  | { kind: "about" }
  | { kind: "contact" }
  | { kind: "markets" }
  | { kind: "market"; state: string; city: string }
  | { kind: "joinTeam" }
  | { kind: "team" }
  | { kind: "sell" }
  | { kind: "account" }
  | { kind: "page"; slug: string };

/** Signed-in and sign-up screens: useful to people, useless in search. */
const ACCOUNT_PATHS = new Set([
  "/sign-in",
  "/sign-up",
  "/forgot-password",
  "/reset-password",
]);

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;

/**
 * The same routing the client does in PublicWebsite.tsx, so the server
 * describes the page the visitor is actually about to see. Returns null for
 * anything outside /newsite.
 */
export function parseWebsitePath(path: string): WebsiteRoute | null {
  const trimmed = path.replace(/\/+$/, "") || "/";
  if (trimmed !== WEBSITE_BASE_PATH && !trimmed.startsWith(`${WEBSITE_BASE_PATH}/`)) return null;
  const relative = trimmed.slice(WEBSITE_BASE_PATH.length) || "/";
  if (relative === "/") return { kind: "home" };
  if (ACCOUNT_PATHS.has(relative) || relative.startsWith("/account")) return { kind: "account" };
  // The client reads window.location.pathname, which arrives percent-encoded
  // just like req.path. It decodes the listing, agent, article, case study and
  // market segments, and hands a CMS page's segment to the page lookup as is.
  const rawSegments = relative.split("/").filter(Boolean);
  const segments = rawSegments.map(s => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  });
  const [first, second] = segments;
  if (segments.length === 1) {
    switch (first) {
      case "properties": return { kind: "properties" };
      case "agents": return { kind: "agents" };
      case "case-studies": return { kind: "caseStudies" };
      case "resources": return { kind: "resources" };
      case "about": return { kind: "about" };
      case "contact": return { kind: "contact" };
      case "markets": return { kind: "markets" };
      case "join-our-team": return { kind: "joinTeam" };
      case "team": return { kind: "team" };
      case "sell": return { kind: "sell" };
    }
    // A CMS page. The client looks it up by websitePageSlug, so /Some-Page
    // and /some_page open the page saved as some-page; so does this.
    const slug = websitePageSlug(rawSegments[0]);
    return slug ? { kind: "page", slug } : null;
  }
  if (segments.length === 2 && SLUG.test(second)) {
    if (first === "properties") return { kind: "property", slug: second };
    if (first === "agents") return { kind: "agent", slug: second };
    if (first === "case-studies") return { kind: "caseStudy", slug: second };
    if (first === "resources") return { kind: "resource", slug: second };
  }
  // One market's page: /markets/<state>/<city>. Any segments, matched the way
  // the client's findMarketForPage does (decoded, trimmed, any case), so a
  // state saved with a space, /markets/north%20carolina/asheville, resolves.
  if (segments.length === 3 && first === "markets") {
    const state = second.trim().toLowerCase();
    const city = segments[2].trim().toLowerCase();
    if (state && city) return { kind: "market", state, city };
  }
  return null;
}

/** Whether a request path belongs to the public site at all. */
export function isWebsitePath(path: string): boolean {
  const trimmed = path.replace(/\/+$/, "") || "/";
  return trimmed === WEBSITE_BASE_PATH || trimmed.startsWith(`${WEBSITE_BASE_PATH}/`);
}

/** Pages a signed-in Savvy team member can open as a Draft at its future address. */
const DRAFT_PREVIEW_KINDS = new Set<WebsiteRoute["kind"]>(["property", "caseStudy", "resource"]);

/** Pages that exist only when a row in the database says so. */
const LOOKED_UP_KINDS = new Set<WebsiteRoute["kind"]>([
  "property",
  "agent",
  "caseStudy",
  "resource",
  "market",
  "page",
]);

export function canPreviewDraft(route: WebsiteRoute): boolean {
  return DRAFT_PREVIEW_KINDS.has(route.kind);
}

/** What the database said about the item a route names. */
export type WebsitePageLookup = "published" | "draft" | "missing";

/**
 * The HTTP status for a /newsite page. The HTML is the same single-page app
 * either way, so a missing page still shows the site's "Page not found"; the
 * 404 is for search engines and link checkers, which otherwise index every
 * typo'd or retired address as a real, empty page.
 *
 * - Built-in pages (home, list pages, about, account screens): always 200.
 * - An address the site does not route at all: 404.
 * - A listing, agent, case study, article, market or CMS page: 200 when
 *   published, 404 otherwise, except that a signed-in Savvy team member gets
 *   200 for a Draft listing, case study or article, which the page shows them
 *   as a preview.
 */
export function websitePageStatus(input: {
  route: WebsiteRoute | null;
  lookup: WebsitePageLookup;
  visitorIsStaff: boolean;
}): 200 | 404 {
  const { route, lookup, visitorIsStaff } = input;
  if (!route) return 404;
  if (!LOOKED_UP_KINDS.has(route.kind)) return 200;
  if (lookup === "published") return 200;
  if (lookup === "draft" && visitorIsStaff && canPreviewDraft(route)) return 200;
  return 404;
}

/**
 * The status the single-page app is served with: 404 only for a public-site
 * address the metadata step found missing (res.locals.websiteNotFound).
 */
export function spaStatus(locals: Record<string, unknown>): 200 | 404 {
  return locals.websiteNotFound === true ? 404 : 200;
}

/**
 * The page head for a 404: the not-found title the client sets anyway, and
 * noindex so a missing address never lands in search results.
 */
export function injectNotFoundHead(html: string): string {
  const title = `<title>${pageTitle("Page not found")}</title>`;
  const robots = `<meta name="robots" content="noindex, nofollow" />`;
  const withTitle = /<title>[\s\S]*?<\/title>/i.test(html)
    ? html.replace(/<title>[\s\S]*?<\/title>/i, title)
    : html.replace(/<head([^>]*)>/i, `<head$1>\n    ${title}`);
  return withTitle.replace(/<\/head>/i, `    ${robots}\n  </head>`);
}

/**
 * Titles for the pages the site serves from code. Kept word for word with the
 * usePageTitle calls in PublicWebsite.tsx, so the tab title does not change
 * the moment the app loads.
 */
export const STATIC_PAGES: Record<
  | "home"
  | "properties"
  | "agents"
  | "caseStudies"
  | "resources"
  | "about"
  | "contact"
  | "markets"
  | "joinTeam"
  | "team"
  | "sell",
  { path: string; title: string; description: string }
> = {
  home: {
    path: "/",
    title: "",
    description:
      "Short-term rental properties for sale, with projected revenue and a local STR agent to walk you through every deal.",
  },
  properties: {
    path: "/properties",
    title: "Short-Term Rental Properties for Sale",
    description:
      "Browse short-term rental investment properties for sale, with photos, pricing and projected rental revenue.",
  },
  agents: {
    path: "/agents",
    title: "Our STR Investment Agents",
    description:
      "Meet agents who specialize in short-term rental investing and know the markets they sell in.",
  },
  caseStudies: {
    path: "/case-studies",
    title: "STR Investment Case Studies",
    description: "Real short-term rental purchases: what investors bought, why, and how the numbers worked out.",
  },
  resources: {
    path: "/resources",
    title: "Insights & Resources",
    description: "Guides and articles on buying, financing and running short-term rental properties.",
  },
  about: {
    path: "/about",
    title: "Why Investors Work With Savvy STR Agents",
    description: "Why short-term rental investors work with Savvy STR Agents, and how we help them buy.",
  },
  contact: {
    path: "/contact",
    title: "Contact a Short-Term Rental Specialist",
    description: "Talk to a short-term rental specialist about a property, a market, or your next purchase.",
  },
  markets: {
    path: "/markets",
    title: "STR Markets",
    description: "The short-term rental markets we cover, and the properties for sale in each.",
  },
  joinTeam: {
    path: "/join-our-team",
    title: "Join Our Team",
    description:
      "Join Savvy STR Agents, the #1 enterprise agent team at eXp Realty. For agents who know their short-term rental market inside and out.",
  },
  team: {
    path: "/team",
    title: "Meet the Team",
    description:
      "Meet the people behind Savvy STR Agents, dedicated to helping you succeed in short-term rental investing.",
  },
  sell: {
    path: "/sell",
    title: "Sell Your Short-Term Rental",
    description:
      "Find out what your short-term rental is worth to an investor buyer. Send the address and last year of performance, and an STR agent who knows your market comes back with a straight answer.",
  },
};

/** See shared/websitePageTitle.ts: a page's own meta title drops the site name when both don't fit in 60. */
export function pageTitle(title: string | null | undefined, options: { ownMetaTitle?: boolean } = {}): string {
  return websitePageTitle(title, options);
}

/**
 * A search-result sized description from free text, which is often Markdown.
 * Cut at a word boundary, never mid-word, and only ellipsed when it was cut.
 */
export function describeText(text: string | null | undefined, max = 160): string | null {
  if (!text) return null;
  const plain = text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links keep their text
    .replace(/<[^>]+>/g, " ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_`>~|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) return null;
  if (plain.length <= max) return plain;
  const cut = plain.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,.;:-]+$/, "")}…`;
}

/** Only absolute http(s) images can be fetched by a preview bot. */
export function absoluteImage(url: string | null | undefined, origin: string): string | null {
  const value = (url ?? "").trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("/")) return `${origin}${value}`;
  return null;
}

export function websiteUrl(origin: string, path: string): string {
  return `${origin}${WEBSITE_BASE_PATH}${path === "/" ? "" : path}`;
}

export type SitemapEntry = { path: string; lastModified?: Date | string | null };

function escapeXml(value: string) {
  return value.replace(/[&<>'"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&apos;", '"': "&quot;" })[c] ?? c);
}

function isoDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

export function buildSitemapXml(origin: string, entries: SitemapEntry[]): string {
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const entry of entries) {
    const loc = websiteUrl(origin, entry.path);
    if (seen.has(loc)) continue;
    seen.add(loc);
    const lastmod = isoDate(entry.lastModified);
    urls.push(
      `  <url><loc>${escapeXml(loc)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}</url>`
    );
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}

/**
 * Everything on the public host may be crawled except the API and the
 * account screens, which carry noindex as well. Landing pages decide their own
 * indexing with their per-page noindex switch, so they are not listed here.
 */
export function buildRobotsTxt(origin: string): string {
  return [
    "User-agent: *",
    "Allow: /",
    "Disallow: /api/",
    `Disallow: ${WEBSITE_BASE_PATH}/account`,
    `Disallow: ${WEBSITE_BASE_PATH}/sign-in`,
    `Disallow: ${WEBSITE_BASE_PATH}/sign-up`,
    `Disallow: ${WEBSITE_BASE_PATH}/forgot-password`,
    `Disallow: ${WEBSITE_BASE_PATH}/reset-password`,
    "",
    `Sitemap: ${origin}/sitemap.xml`,
    "",
  ].join("\n");
}
