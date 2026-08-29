import type { Express, Request } from "express";
import { and, eq, sql } from "drizzle-orm";
import { shortLinkClicks, shortLinks } from "../drizzle/schema";
import { getDb } from "./db";

const publicHost =
  process.env.PUBLIC_LANDING_PAGE_HOST || "home.savvy-agents.com";
const publicBaseUrl = `https://${publicHost}`;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function publicShortLinkUrl(slug: string) {
  return `${publicBaseUrl}/${slug}`;
}

function requestHost(req: Request) {
  return (req.hostname || req.headers.host || "").split(":")[0].toLowerCase();
}

function deviceCategory(userAgent: string | undefined) {
  const ua = (userAgent ?? "").toLowerCase();
  if (/ipad|tablet/.test(ua)) return "tablet";
  if (/mobile|android|iphone|ipod/.test(ua)) return "mobile";
  if (ua) return "desktop";
  return "other";
}

function destinationWithIncomingQuery(
  destinationUrl: string,
  originalUrl: string,
  preserveQueryParams: boolean
) {
  if (!preserveQueryParams) return destinationUrl;
  const destination = new URL(destinationUrl);
  const incoming = new URL(originalUrl, publicBaseUrl);
  incoming.searchParams.forEach((value, key) => {
    // Values deliberately present on the saved destination take precedence.
    if (!destination.searchParams.has(key))
      destination.searchParams.append(key, value);
  });
  return destination.toString();
}

/**
 * Register public redirects before static hosting. Redirects are intentionally
 * served only from home.savvy-agents.com so external shares never surface the
 * SavvyOS hostname.
 */
export function registerShortLinkRedirects(app: Express) {
  app.get("/*", async (req, res, next) => {
    try {
      const configuredHost = publicHost.toLowerCase();
      if (requestHost(req) !== configuredHost) return next();

      const requestedPath = req.path.replace(/^\/+|\/+$/g, "");
      if (!slugPattern.test(requestedPath)) return next();

      const db = await getDb();
      if (!db) return next();
      const [link] = await db
        .select()
        .from(shortLinks)
        .where(
          and(
            eq(shortLinks.slug, requestedPath),
            eq(shortLinks.status, "active")
          )
        )
        .limit(1);
      if (!link) return next();

      const now = new Date();
      const referrer =
        typeof req.headers.referer === "string"
          ? req.headers.referer.slice(0, 2000)
          : null;
      const category = deviceCategory(req.headers["user-agent"]);
      await Promise.all([
        db.insert(shortLinkClicks).values({
          shortLinkId: link.id,
          referrerUrl: referrer,
          deviceCategory: category,
          clickedAt: now,
        }),
        db
          .update(shortLinks)
          .set({
            clickCount: sql`${shortLinks.clickCount} + 1`,
            lastClickedAt: now,
          })
          .where(eq(shortLinks.id, link.id)),
      ]);

      res.set("Cache-Control", "no-store");
      return res.redirect(
        302,
        destinationWithIncomingQuery(
          link.destinationUrl,
          req.originalUrl,
          link.preserveQueryParams
        )
      );
    } catch (error) {
      // A public redirect must never expose internal details or block the
      // existing landing-page fallback if analytics storage is unavailable.
      console.error("[ShortLinks] Redirect handling failed:", error);
      return next();
    }
  });
}
