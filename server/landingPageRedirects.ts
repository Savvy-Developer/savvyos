import type { Express, Request } from "express";
import { and, eq, sql } from "drizzle-orm";
import { landingPageRedirects } from "../drizzle/schema";
import { getDb } from "./db";

const publicHost = (process.env.PUBLIC_LANDING_PAGE_HOST || "home.savvy-agents.com").toLowerCase();
const publicBaseUrl = `https://${publicHost}`;

function requestHost(req: Request) {
  return (req.hostname || req.headers.host || "").split(":")[0].toLowerCase();
}

function normalizedPath(path: string) {
  return `/${path.replace(/^\/+|\/+$/g, "")}`.replace(/\/+/g, "/");
}

function destinationWithIncomingQuery(destinationUrl: string, originalUrl: string, preserveQueryParams: boolean) {
  if (!preserveQueryParams) return destinationUrl;
  const destination = new URL(destinationUrl);
  const incoming = new URL(originalUrl, publicBaseUrl);
  incoming.searchParams.forEach((value, key) => {
    if (!destination.searchParams.has(key)) destination.searchParams.append(key, value);
  });
  return destination.toString();
}

/**
 * Maps legacy public paths to a modern destination before normal landing-page
 * rendering. This supports a controlled GHL cutover without sacrificing paid
 * media query parameters or opening an arbitrary redirect endpoint.
 */
export function registerLandingPageRedirects(app: Express) {
  app.get("/*", async (req, res, next) => {
    try {
      if (requestHost(req) !== publicHost) return next();
      if (req.path.startsWith("/api/")) return next();
      const sourcePath = normalizedPath(req.path);
      if (sourcePath === "/") return next();
      const db = await getDb();
      if (!db) return next();
      const [redirect] = await db.select().from(landingPageRedirects).where(and(
        eq(landingPageRedirects.sourcePath, sourcePath),
        eq(landingPageRedirects.status, "active"),
      )).limit(1);
      if (!redirect) return next();
      const now = new Date();
      await db.update(landingPageRedirects).set({
        clickCount: sql`${landingPageRedirects.clickCount} + 1`,
        lastRedirectedAt: now,
      }).where(eq(landingPageRedirects.id, redirect.id));
      res.set("Cache-Control", "no-store");
      return res.redirect(redirect.redirectType === "permanent" ? 301 : 302, destinationWithIncomingQuery(redirect.destinationUrl, req.originalUrl, redirect.preserveQueryParams));
    } catch (error) {
      // Never let a redirect reporting failure suppress the intended landing page.
      console.error("[LandingPageRedirects] Redirect handling failed:", error);
      return next();
    }
  });
}
