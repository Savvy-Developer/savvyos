/**
 * Search and link-preview support for the public site at /newsite: the
 * per-page title, description and share image, plus sitemap.xml and
 * robots.txt. The rules live in websiteSeoPages.ts; this file does the
 * lookups and wires them into Express.
 *
 * Every lookup reads published rows only and only fields the page itself shows
 * a signed-out visitor, so nothing here can leak a draft or a gated figure.
 */
import type { Express, Request } from "express";
import { and, eq } from "drizzle-orm";
import {
  properties,
  users,
  websiteAgentProfiles,
  websiteBlogPosts,
  websiteCaseStudies,
  websitePages,
  websiteProperties,
  websiteSiteSettings,
} from "../drizzle/schema";
import { getDb } from "./db";
import type { LandingMetadata } from "./landingPageHtml";
import { RESERVED_PAGE_SLUGS } from "./routers/website";
import {
  STATIC_PAGES,
  absoluteImage,
  buildRobotsTxt,
  buildSitemapXml,
  describeText,
  pageTitle,
  parseWebsitePath,
  websiteUrl,
  type SitemapEntry,
} from "./websiteSeoPages";
import { EDITABLE_BUILT_IN_SLUGS } from "@shared/websiteEditablePages";

const publicHost = (process.env.PUBLIC_LANDING_PAGE_HOST || "home.savvy-agents.com").toLowerCase();
const publicHosts = new Set([publicHost, `www.${publicHost}`]);
const ORIGIN = `https://${publicHost}`;

function isPublicHost(req: Request) {
  const host = (req.hostname || req.headers.host || "").split(":")[0].toLowerCase();
  return publicHosts.has(host);
}

type Described = {
  title: string | null;
  description: string | null;
  image: string | null;
  noindex?: boolean;
};

async function siteDefaults(db: NonNullable<Awaited<ReturnType<typeof getDb>>>) {
  const [settings] = await db
    .select({ heroBody: websiteSiteSettings.heroBody, heroImageUrl: websiteSiteSettings.heroImageUrl })
    .from(websiteSiteSettings)
    .where(eq(websiteSiteSettings.singletonKey, "primary"))
    .limit(1);
  return {
    description: describeText(settings?.heroBody) ?? STATIC_PAGES.home.description,
    image: absoluteImage(settings?.heroImageUrl, ORIGIN),
  };
}

/**
 * Title, description and share image for a /newsite address, or null when the
 * address is not a /newsite page or names something that is not published.
 * An unknown slug returns null rather than a generic card, so a typo'd link
 * does not preview as a real page.
 */
export async function getWebsitePageMetadata(req: Request): Promise<LandingMetadata | null> {
  if (!isPublicHost(req)) return null;
  const route = parseWebsitePath(req.path);
  if (!route) return null;
  const db = await getDb();
  if (!db) return null;
  const defaults = await siteDefaults(db);

  let found: Described | null = null;
  switch (route.kind) {
    case "home":
      found = { title: null, description: defaults.description, image: defaults.image };
      break;
    case "properties":
    case "agents":
    case "caseStudies":
    case "resources":
    case "about":
    case "contact":
    case "markets":
    case "joinTeam": {
      const page = STATIC_PAGES[route.kind];
      found = { title: page.title, description: page.description, image: defaults.image };
      // About, Contact and Join Our Team can be replaced by a CMS page at the
      // same address. When one is published, its title and description are
      // what the visitor sees, so search and share previews use them too.
      const slug = page.path.replace(/^\//, "");
      if (EDITABLE_BUILT_IN_SLUGS.has(slug)) {
        const [row] = await db
          .select({
            name: websitePages.name,
            heroTitle: websitePages.heroTitle,
            metaTitle: websitePages.metaTitle,
            metaDescription: websitePages.metaDescription,
            heroSubtitle: websitePages.heroSubtitle,
            bodyMarkdown: websitePages.bodyMarkdown,
          })
          .from(websitePages)
          .where(and(eq(websitePages.slug, slug), eq(websitePages.status, "published")))
          .limit(1);
        if (row) {
          found = {
            title: row.metaTitle || page.title,
            description:
              describeText(row.metaDescription) ??
              describeText(row.heroSubtitle) ??
              describeText(row.bodyMarkdown) ??
              page.description,
            image: defaults.image,
          };
        }
      }
      break;
    }
    case "account":
      found = { title: null, description: defaults.description, image: defaults.image, noindex: true };
      break;
    case "property": {
      const [row] = await db
        .select({
          metaTitle: websiteProperties.metaTitle,
          metaDescription: websiteProperties.metaDescription,
          headline: websiteProperties.headline,
          summary: websiteProperties.summary,
          heroImageUrl: websiteProperties.heroImageUrl,
          address: properties.address,
          city: properties.city,
          state: properties.state,
        })
        .from(websiteProperties)
        .innerJoin(properties, eq(websiteProperties.propertyId, properties.id))
        .where(and(eq(websiteProperties.slug, route.slug), eq(websiteProperties.status, "published")))
        .limit(1);
      if (row) {
        const place = [row.city, row.state].filter(Boolean).join(", ");
        found = {
          // Matches the client: metaTitle, else the street address.
          title: row.metaTitle || row.address || "Property",
          description:
            describeText(row.metaDescription) ??
            describeText(row.summary) ??
            describeText([row.headline, place].filter(Boolean).join(" in ")),
          image: absoluteImage(row.heroImageUrl, ORIGIN) ?? defaults.image,
        };
      }
      break;
    }
    case "agent": {
      const [row] = await db
        .select({
          name: users.name,
          headline: websiteAgentProfiles.headline,
          shortBio: websiteAgentProfiles.shortBio,
          imageUrl: websiteAgentProfiles.imageUrl,
        })
        .from(websiteAgentProfiles)
        .innerJoin(users, eq(websiteAgentProfiles.userId, users.id))
        .where(and(eq(websiteAgentProfiles.slug, route.slug), eq(websiteAgentProfiles.status, "published")))
        .limit(1);
      if (row) {
        found = {
          title: row.name || "Agent",
          description: describeText(row.headline) ?? describeText(row.shortBio),
          image: absoluteImage(row.imageUrl, ORIGIN) ?? defaults.image,
        };
      }
      break;
    }
    case "caseStudy": {
      const [row] = await db
        .select({
          title: websiteCaseStudies.title,
          excerpt: websiteCaseStudies.excerpt,
          body: websiteCaseStudies.body,
          heroImageUrl: websiteCaseStudies.heroImageUrl,
        })
        .from(websiteCaseStudies)
        .where(and(eq(websiteCaseStudies.slug, route.slug), eq(websiteCaseStudies.status, "published")))
        .limit(1);
      if (row) {
        found = {
          title: row.title,
          description: describeText(row.excerpt) ?? describeText(row.body),
          image: absoluteImage(row.heroImageUrl, ORIGIN) ?? defaults.image,
        };
      }
      break;
    }
    case "resource": {
      const [row] = await db
        .select({
          title: websiteBlogPosts.title,
          metaTitle: websiteBlogPosts.metaTitle,
          metaDescription: websiteBlogPosts.metaDescription,
          excerpt: websiteBlogPosts.excerpt,
          body: websiteBlogPosts.body,
          coverImageUrl: websiteBlogPosts.coverImageUrl,
        })
        .from(websiteBlogPosts)
        .where(and(eq(websiteBlogPosts.slug, route.slug), eq(websiteBlogPosts.status, "published")))
        .limit(1);
      if (row) {
        found = {
          // The client titles a post by its title; the meta title only feeds
          // search, where a post often wants a longer or keyword-led version.
          title: row.metaTitle || row.title,
          description:
            describeText(row.metaDescription) ?? describeText(row.excerpt) ?? describeText(row.body),
          image: absoluteImage(row.coverImageUrl, ORIGIN) ?? defaults.image,
        };
      }
      break;
    }
    case "page": {
      if (RESERVED_PAGE_SLUGS.has(route.slug)) break;
      const [row] = await db
        .select({
          name: websitePages.name,
          metaTitle: websitePages.metaTitle,
          metaDescription: websitePages.metaDescription,
          heroSubtitle: websitePages.heroSubtitle,
          bodyMarkdown: websitePages.bodyMarkdown,
        })
        .from(websitePages)
        .where(and(eq(websitePages.slug, route.slug), eq(websitePages.status, "published")))
        .limit(1);
      if (row) {
        found = {
          title: row.metaTitle || row.name,
          description:
            describeText(row.metaDescription) ??
            describeText(row.heroSubtitle) ??
            describeText(row.bodyMarkdown),
          image: defaults.image,
        };
      }
      break;
    }
  }
  if (!found) return null;

  const path = req.path.replace(/\/+$/, "").slice("/newsite".length) || "/";
  return {
    slug: "",
    canonicalUrl: websiteUrl(ORIGIN, path),
    pageTitle: pageTitle(found.title),
    metaDescription: found.description,
    socialImageUrl: found.image,
    noindex: !!found.noindex,
    // Tracking tags stay off the site until the Tag Manager decision is made.
    trackingSettings: {},
  };
}

/** Every published page, for sitemap.xml. */
export async function listWebsiteSitemapEntries(): Promise<SitemapEntry[]> {
  const entries: SitemapEntry[] = Object.values(STATIC_PAGES).map(page => ({ path: page.path }));
  const db = await getDb();
  if (!db) return entries;
  const [props, agents, studies, posts, pages] = await Promise.all([
    db
      .select({ slug: websiteProperties.slug, updatedAt: websiteProperties.updatedAt })
      .from(websiteProperties)
      .where(eq(websiteProperties.status, "published")),
    db
      .select({ slug: websiteAgentProfiles.slug, updatedAt: websiteAgentProfiles.updatedAt })
      .from(websiteAgentProfiles)
      .where(eq(websiteAgentProfiles.status, "published")),
    db
      .select({ slug: websiteCaseStudies.slug, updatedAt: websiteCaseStudies.updatedAt })
      .from(websiteCaseStudies)
      .where(eq(websiteCaseStudies.status, "published")),
    db
      .select({ slug: websiteBlogPosts.slug, updatedAt: websiteBlogPosts.updatedAt })
      .from(websiteBlogPosts)
      .where(eq(websiteBlogPosts.status, "published")),
    db
      .select({ slug: websitePages.slug, updatedAt: websitePages.updatedAt })
      .from(websitePages)
      .where(eq(websitePages.status, "published")),
  ]);
  const add = (prefix: string, rows: Array<{ slug: string; updatedAt: Date | null }>) => {
    for (const row of rows) {
      entries.push({ path: `${prefix}/${encodeURIComponent(row.slug)}`, lastModified: row.updatedAt });
    }
  };
  add("/properties", props);
  add("/agents", agents);
  add("/case-studies", studies);
  add("/resources", posts);
  // A CMS page saved at a built-in address never renders (see
  // RESERVED_PAGE_SLUGS), so it is not advertised either.
  add("", pages.filter(page => !RESERVED_PAGE_SLUGS.has(page.slug)));
  return entries;
}

/**
 * sitemap.xml and robots.txt on the public host. Other hosts fall through, so
 * the staff app at os.savvy-agents.com is unchanged.
 */
export function registerWebsiteSeoRoutes(app: Express) {
  app.get("/robots.txt", (req, res, next) => {
    if (!isPublicHost(req)) return next();
    res.type("text/plain").set("Cache-Control", "public, max-age=3600").send(buildRobotsTxt(ORIGIN));
  });
  app.get("/sitemap.xml", async (req, res, next) => {
    if (!isPublicHost(req)) return next();
    try {
      const xml = buildSitemapXml(ORIGIN, await listWebsiteSitemapEntries());
      res.type("application/xml").set("Cache-Control", "public, max-age=3600").send(xml);
    } catch (error) {
      console.error("[WebsiteSeo] Sitemap failed:", error);
      res.status(500).type("text/plain").send("Sitemap unavailable");
    }
  });
}
