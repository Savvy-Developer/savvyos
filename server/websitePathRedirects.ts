/**
 * Applies the fixed /newsite path redirects in shared/websitePathRedirects.ts.
 * GET and HEAD only; everything else, and every address not in the list,
 * goes straight on. No database, so it can not fail a page.
 */
import type { Express } from "express";

import { websitePathRedirectTarget } from "@shared/websitePathRedirects";

export function registerWebsitePathRedirects(app: Express) {
  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    if (!req.path.startsWith("/newsite/")) return next();
    const to = websitePathRedirectTarget(req.path, req.originalUrl);
    if (!to) return next();
    res.set("Cache-Control", "public, max-age=3600");
    return res.redirect(301, to);
  });
}
