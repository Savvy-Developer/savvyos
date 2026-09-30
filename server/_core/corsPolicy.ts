import type { Request } from "express";

/**
 * Which browser origins may make signed-in requests to SavvyOS.
 *
 * Before this, the server echoed back any Origin with
 * Access-Control-Allow-Credentials: true. Session cookies are SameSite=None in
 * production, so any website a signed-in person visited could call SavvyOS as
 * them and read the answer. Now:
 *
 * - Trusted origins (our own hosts) keep full credentialed CORS, exactly as
 *   before.
 * - Any other origin still gets Access-Control-Allow-Origin, so anonymous
 *   cross-site reads keep working, but never Allow-Credentials. A browser then
 *   refuses to hand a signed-in response to that page, and refuses a
 *   credentialed preflight outright.
 * - A state-changing /api request (anything but GET, HEAD, OPTIONS) that
 *   carries an untrusted Origin is refused before it reaches a route. This
 *   closes "simple" cross-site POSTs (a form, or text/plain fetch) that need
 *   no preflight and would otherwise run with the visitor's cookies.
 *   Requests with no Origin at all (webhooks, servers, mail providers' one
 *   click unsubscribe) are unaffected: browsers always send Origin on a
 *   cross-site POST, and servers do not.
 *
 * Webhook, scheduled and unsubscribe endpoints are exempt from the POST check
 * by path, since callers there are external by design and none use a session.
 */

const DEFAULT_TRUSTED = [
  "https://os.savvy-agents.com",
  "https://home.savvy-agents.com",
  "https://www.home.savvy-agents.com",
  "https://savvy-agents.com",
  "https://www.savvy-agents.com",
  "https://savvyos-production-ee09.up.railway.app",
];

const EXEMPT_POST_PREFIXES = ["/api/webhooks/", "/api/scheduled/", "/api/unsubscribe"];

function normalizeOrigin(value: string | null | undefined): string {
  return String(value || "").trim().replace(/\/+$/, "").toLowerCase();
}

function hostOrigin(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    return `${url.protocol}//${url.host}`.toLowerCase();
  } catch {
    return null;
  }
}

export function trustedOrigins(env: NodeJS.ProcessEnv = process.env): Set<string> {
  const set = new Set(DEFAULT_TRUSTED);
  const landing = hostOrigin(env.PUBLIC_LANDING_PAGE_HOST);
  if (landing) {
    set.add(landing);
    set.add(landing.replace("://", "://www."));
  }
  const staffApp = hostOrigin(env.STAFF_APP_URL);
  if (staffApp) set.add(staffApp);
  for (const extra of String(env.CORS_TRUSTED_ORIGINS || "").split(",")) {
    const origin = hostOrigin(extra);
    if (origin) set.add(origin);
  }
  return set;
}

export function isTrustedOrigin(
  origin: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const value = normalizeOrigin(origin);
  if (!value || value === "null") return false;
  if (trustedOrigins(env).has(value)) return true;
  return (
    env.NODE_ENV !== "production" &&
    /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(value)
  );
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * True when a request must be refused: a state-changing /api call from a
 * browser page on an untrusted origin.
 */
export function isCrossSiteWrite(
  req: Pick<Request, "method" | "path" | "headers">,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  if (SAFE_METHODS.has(String(req.method).toUpperCase())) return false;
  if (!req.path.startsWith("/api/")) return false;
  if (EXEMPT_POST_PREFIXES.some(prefix => req.path.startsWith(prefix))) return false;
  const header = req.headers.origin;
  const origin = Array.isArray(header) ? header[0] : header;
  if (!origin) return false;
  return !isTrustedOrigin(origin, env);
}
