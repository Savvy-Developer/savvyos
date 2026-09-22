/**
 * Redirects from savvy-agents.com addresses to the new site. See
 * legacySiteRedirectRules.ts for the map and why it exists.
 *
 * Runs on the public host only, after the admin-managed redirects in
 * landingPageRedirects.ts, so a redirect somebody sets up by hand always wins.
 * A published landing page at the same address also wins: a single-segment
 * path like /about is checked against landing pages before it is redirected.
 */
import type { Express, Request } from "express";
import { and, eq } from "drizzle-orm";
import {
  landingPages,
  websiteAgentProfiles,
  websiteBlogPosts,
  websiteCaseStudies,
  websiteProperties,
} from "../drizzle/schema";
import { getDb } from "./db";
import { legacyTarget, resolveLegacyTarget, withQuery, type LegacyTarget } from "./legacySiteRedirectRules";

const publicHost = (process.env.PUBLIC_LANDING_PAGE_HOST || "home.savvy-agents.com").toLowerCase();
const publicHosts = new Set([publicHost, `www.${publicHost}`]);

function isPublicHost(req: Request) {
  const host = (req.hostname || req.headers.host || "").split(":")[0].toLowerCase();
  return publicHosts.has(host);
}

async function isPublished(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, target: LegacyTarget) {
  if (target.kind !== "item") return false;
  // One query per section rather than a table picked at runtime: drizzle's
  // types do not follow a union of tables, and four plain queries read better.
  const { section, slug } = target;
  if (section === "properties") {
    const [row] = await db.select({ id: websiteProperties.id }).from(websiteProperties)
      .where(and(eq(websiteProperties.slug, slug), eq(websiteProperties.status, "published"))).limit(1);
    return !!row;
  }
  if (section === "agents") {
    const [row] = await db.select({ id: websiteAgentProfiles.id }).from(websiteAgentProfiles)
      .where(and(eq(websiteAgentProfiles.slug, slug), eq(websiteAgentProfiles.status, "published"))).limit(1);
    return !!row;
  }
  if (section === "case-studies") {
    const [row] = await db.select({ id: websiteCaseStudies.id }).from(websiteCaseStudies)
      .where(and(eq(websiteCaseStudies.slug, slug), eq(websiteCaseStudies.status, "published"))).limit(1);
    return !!row;
  }
  const [row] = await db.select({ id: websiteBlogPosts.id }).from(websiteBlogPosts)
    .where(and(eq(websiteBlogPosts.slug, slug), eq(websiteBlogPosts.status, "published"))).limit(1);
  return !!row;
}

async function isLandingPage(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, path: string) {
  const slug = path.replace(/^\/+|\/+$/g, "").toLowerCase();
  if (!slug || slug.includes("/")) return false;
  const [row] = await db
    .select({ id: landingPages.id })
    .from(landingPages)
    .where(and(eq(landingPages.slug, slug), eq(landingPages.status, "published")))
    .limit(1);
  return !!row;
}

export function registerLegacySiteRedirects(app: Express) {
  app.get("/*", async (req, res, next) => {
    try {
      if (!isPublicHost(req)) return next();
      const target = legacyTarget(req.path);
      if (!target) return next();
      const db = await getDb();
      if (!db) return next();
      if (await isLandingPage(db, req.path)) return next();
      const { to, permanent } = resolveLegacyTarget(target, await isPublished(db, target));
      res.set("Cache-Control", permanent ? "public, max-age=3600" : "no-store");
      return res.redirect(permanent ? 301 : 302, withQuery(to, req.originalUrl));
    } catch (error) {
      // A failed lookup must never take a page down; fall through as before.
      console.error("[LegacySiteRedirects] Redirect failed:", error);
      return next();
    }
  });
}
