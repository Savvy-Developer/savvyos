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
  | { kind: "joinTeam" }
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
  const segments = relative.split("/").filter(Boolean).map(s => {
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
    }
    return SLUG.test(first) ? { kind: "page", slug: first } : null;
  }
  if (segments.length === 2 && SLUG.test(second)) {
    if (first === "properties") return { kind: "property", slug: second };
    if (first === "agents") return { kind: "agent", slug: second };
    if (first === "case-studies") return { kind: "caseStudy", slug: second };
    if (first === "resources") return { kind: "resource", slug: second };
  }
  return null;
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
  | "joinTeam",
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
};

export function pageTitle(title: string | null | undefined): string {
  const clean = (title ?? "").trim();
  return clean ? `${clean} | ${SITE_NAME}` : SITE_NAME;
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
