/**
 * Where each savvy-agents.com address goes once that domain points at SavvyOS.
 *
 * Google has about 800 of the old site's pages indexed, almost all of them
 * /properties/<slug>. Without these, every one of them becomes a "page not
 * found" the day the domain moves, and the search traffic they bring goes with
 * them.
 *
 * Pure: no database. The Express side (legacySiteRedirects.ts) checks whether
 * a slug is published before sending anyone to it.
 */

export type LegacyTarget =
  /** A fixed new address. */
  | { kind: "fixed"; to: string; permanent: boolean }
  /**
   * One item on the old site. Goes to the same slug on the new site when it is
   * published there, otherwise to the section's list page.
   */
  | {
      kind: "item";
      section: "properties" | "agents" | "case-studies" | "resources";
      slug: string;
    };

const BASE = "/newsite";

/**
 * Old top-level pages. Permanent where the new page is the same page;
 * temporary where it is only the nearest thing, so the choice can change
 * without browsers and Google having cached it.
 */
export const LEGACY_PAGES: Record<string, { to: string; permanent: boolean }> = {
  "/properties": { to: `${BASE}/properties`, permanent: true },
  "/agents": { to: `${BASE}/agents`, permanent: true },
  "/case-studies": { to: `${BASE}/case-studies`, permanent: true },
  "/resources": { to: `${BASE}/resources`, permanent: true },
  "/about": { to: `${BASE}/about`, permanent: true },
  "/contact": { to: `${BASE}/contact`, permanent: true },
  "/markets": { to: `${BASE}/markets`, permanent: true },
  "/legal": { to: `${BASE}/legal`, permanent: true },
  "/privacy": { to: `${BASE}/privacy`, permanent: true },
  "/join-our-team": { to: `${BASE}/join-our-team`, permanent: true },
  // No direct equivalents yet.
  "/team": { to: `${BASE}/agents`, permanent: false },
  "/recent-sales": { to: `${BASE}/case-studies`, permanent: false },
  // The new site's Sell link already goes here.
  "/sell": { to: "https://www.savvy.realty/sellers", permanent: false },
  // Old investor account screens. Old accounts are not carried over, so
  // everyone starts at sign in or sign up.
  "/login": { to: `${BASE}/sign-in`, permanent: true },
  "/register": { to: `${BASE}/sign-up`, permanent: true },
  "/create-account": { to: `${BASE}/sign-up`, permanent: true },
  "/create-account-success": { to: `${BASE}/sign-up`, permanent: true },
  "/complete-profile": { to: `${BASE}/sign-up`, permanent: true },
  "/forgot-password": { to: `${BASE}/forgot-password`, permanent: true },
  // An old reset link carries a token the new site cannot use, so it goes to
  // the start of a fresh reset rather than a form that will reject it.
  "/reset-password": { to: `${BASE}/forgot-password`, permanent: true },
  "/account": { to: `${BASE}/account/saved`, permanent: true },
};

const SECTIONS = new Set(["properties", "agents", "case-studies", "resources"]);
const SLUG = /^[A-Za-z0-9][A-Za-z0-9-]*$/;

function clean(path: string) {
  return `/${path.replace(/^\/+|\/+$/g, "")}`.replace(/\/+/g, "/");
}

/** Where an old address should go, or null to leave it alone. */
export function legacyTarget(rawPath: string): LegacyTarget | null {
  const path = clean(rawPath);
  if (path === "/" || path.startsWith(`${BASE}/`) || path === BASE || path.startsWith("/api/")) return null;
  const fixed = LEGACY_PAGES[path.toLowerCase()];
  if (fixed) return { kind: "fixed", ...fixed };

  const segments = path.split("/").filter(Boolean);
  const [section, slug, extra] = segments;
  // /markets/<state>/<city> had its own pages; the new site has one page.
  if (section === "markets" && segments.length === 3) {
    return { kind: "fixed", to: `${BASE}/markets`, permanent: true };
  }
  // /share/<id> was an unfinished feature that never showed real listings.
  if (section === "share" && segments.length === 2) {
    return { kind: "fixed", to: `${BASE}/properties`, permanent: false };
  }
  if (SECTIONS.has(section) && slug && SLUG.test(slug)) {
    // /properties/<slug>/comps and /properties/<slug>/v2 were views of the
    // same listing.
    const subview = section === "properties" && (extra === "comps" || extra === "v2");
    if (segments.length === 2 || (segments.length === 3 && subview)) {
      return { kind: "item", section: section as any, slug: slug.toLowerCase() };
    }
  }
  return null;
}

/** The address to send someone to, given whether the item is published. */
export function resolveLegacyTarget(
  target: LegacyTarget,
  published: boolean
): { to: string; permanent: boolean } {
  if (target.kind === "fixed") return { to: target.to, permanent: target.permanent };
  // A match is the same page, so it is permanent. A fallback to the list is
  // temporary: if the item is published later, the redirect should find it.
  return published
    ? { to: `${BASE}/${target.section}/${target.slug}`, permanent: true }
    : { to: `${BASE}/${target.section}`, permanent: false };
}

/** Carry the query string across, so ad tracking tags survive the redirect. */
export function withQuery(to: string, originalUrl: string): string {
  const q = originalUrl.indexOf("?");
  if (q === -1) return to;
  const query = originalUrl.slice(q + 1);
  if (!query) return to;
  return `${to}${to.includes("?") ? "&" : "?"}${query}`;
}
