/**
 * Forwarding for links to home.savvy-agents.com/newsite once the site moves.
 * The rules are in shared/websiteLinkForwarding.ts; this file is the storage,
 * the Express hook and the check before it is switched on.
 *
 * Off until someone with Website settings permission turns it on in Website
 * Studio > CMS. A missing table, a failed read or a bad saved address all
 * mean "off": the page is served as usual.
 */
import type { Express } from "express";
import { eq } from "drizzle-orm";

import { websiteLinkForwarding } from "../drizzle/schema";
import { getDb } from "./db";
import {
  LINK_FORWARDING_OFF,
  forwardingCheckUrl,
  forwardingTarget,
  isForwardSourceHost,
  normalizeTargetOrigin,
  type LinkForwardingSettings,
} from "@shared/websiteLinkForwarding";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export async function readLinkForwarding(db: Db): Promise<LinkForwardingSettings> {
  const [row] = await db
    .select({
      enabled: websiteLinkForwarding.enabled,
      targetOrigin: websiteLinkForwarding.targetOrigin,
      keepBasePath: websiteLinkForwarding.keepBasePath,
    })
    .from(websiteLinkForwarding)
    .where(eq(websiteLinkForwarding.singletonKey, "primary"))
    .limit(1);
  if (!row) return LINK_FORWARDING_OFF;
  return { enabled: !!row.enabled, targetOrigin: row.targetOrigin ?? null, keepBasePath: !!row.keepBasePath };
}

// ─── Cache for the request hook ──────────────────────────────────────────────
// Every /newsite page request passes through the hook, so the setting is read
// at most once a minute, and straight away after a save on this instance.

const CACHE_MS = 60_000;
let cache: { at: number; settings: LinkForwardingSettings } | null = null;

export function resetLinkForwardingCache() {
  cache = null;
}

async function cachedSettings(): Promise<LinkForwardingSettings> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.settings;
  let settings = LINK_FORWARDING_OFF;
  try {
    const db = await getDb();
    if (db) settings = await readLinkForwarding(db);
  } catch (error) {
    console.error("[WebsiteLinkForwarding] Could not read the setting; treating it as off.", error);
  }
  cache = { at: Date.now(), settings };
  return settings;
}

/**
 * The request hook. Registered before every other redirect and the site
 * itself, and only ever acts on GET/HEAD for home.savvy-agents.com/newsite...
 * Everything else, including the admin app and the API, goes straight on.
 */
export function registerWebsiteLinkForwarding(app: Express) {
  app.use(async (req, res, next) => {
    try {
      if (req.method !== "GET" && req.method !== "HEAD") return next();
      const host = req.hostname || req.headers.host || "";
      if (!isForwardSourceHost(host)) return next();
      if (!req.path.startsWith("/newsite")) return next();
      const to = forwardingTarget({ host, path: req.path, originalUrl: req.originalUrl }, await cachedSettings());
      if (!to) return next();
      // Browsers keep a 301 for as long as they are told to. An hour keeps a
      // mistaken switch-on from sticking for long, while still being a
      // permanent redirect as far as Google is concerned.
      res.set("Cache-Control", "public, max-age=3600");
      return res.redirect(301, to);
    } catch (error) {
      console.error("[WebsiteLinkForwarding] Redirect failed; serving the page instead.", error);
      return next();
    }
  });
}

/**
 * Before forwarding is switched on, the new address must already serve the
 * site: otherwise every old link would land on an error page. Fetches the new
 * home page and wants a 2xx HTML answer within 8 seconds.
 */
export async function checkForwardingTarget(origin: string, keepBasePath: boolean) {
  const url = forwardingCheckUrl(origin, keepBasePath);
  try {
    const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(8_000) });
    const type = response.headers.get("content-type") || "";
    if (!response.ok) return { ok: false as const, url, message: `${url} answered ${response.status}.` };
    if (!type.includes("text/html")) return { ok: false as const, url, message: `${url} did not answer with a web page.` };
    // A redirect chain that ends back on the old address would loop.
    if (isForwardSourceHost(new URL(response.url || url).hostname)) {
      return { ok: false as const, url, message: `${url} sends visitors back to the old address, which would loop.` };
    }
    return { ok: true as const, url, message: `${url} is live.` };
  } catch {
    return { ok: false as const, url, message: `${url} could not be reached.` };
  }
}

export async function saveLinkForwarding(
  db: Db,
  input: { enabled: boolean; targetOrigin: string | null; keepBasePath: boolean },
  userId: number
): Promise<LinkForwardingSettings> {
  let targetOrigin: string | null = null;
  if (input.targetOrigin && input.targetOrigin.trim()) {
    const normalized = normalizeTargetOrigin(input.targetOrigin);
    if ("error" in normalized) throw new Error(normalized.error);
    targetOrigin = normalized.origin;
  }
  if (input.enabled) {
    if (!targetOrigin) throw new Error("Enter the new site address before turning forwarding on.");
    const check = await checkForwardingTarget(targetOrigin, input.keepBasePath);
    if (!check.ok) throw new Error(`Not turned on: ${check.message} Turn forwarding on once the new site is live there.`);
  }
  const values = { enabled: input.enabled, targetOrigin, keepBasePath: input.keepBasePath, updatedById: userId };
  const [current] = await db
    .select({ id: websiteLinkForwarding.id })
    .from(websiteLinkForwarding)
    .where(eq(websiteLinkForwarding.singletonKey, "primary"))
    .limit(1);
  if (current) await db.update(websiteLinkForwarding).set(values).where(eq(websiteLinkForwarding.id, current.id));
  else await db.insert(websiteLinkForwarding).values({ singletonKey: "primary", ...values });
  resetLinkForwardingCache();
  return { enabled: input.enabled, targetOrigin, keepBasePath: input.keepBasePath };
}
