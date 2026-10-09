import express, { type Express, type Request, type Response, type NextFunction } from "express";

/**
 * Browser security headers (security audit, finding 08).
 *
 * Before this, neither os.savvy-agents.com nor home.savvy-agents.com sent any
 * (checked 9 Oct 2026). Two groups:
 *
 * Enforced now, chosen so they cannot break a page:
 * - Strict-Transport-Security: browsers only ever use https for these hosts.
 * - X-Content-Type-Options: nosniff, so a file is never run as a script just
 *   because it looks like one.
 * - Referrer-Policy: other sites see only our host name, never full addresses
 *   with ids or tokens in them.
 * - Permissions-Policy: camera and location are off (nothing in SavvyOS uses
 *   them), so an injected script or embed cannot ask for them. The microphone
 *   is left alone: the Aircall phone inside SavvyOS needs it.
 * - Content-Security-Policy, three rules only: no plugins (<object>/<embed>),
 *   no <base href> pointing elsewhere, and on SavvyOS itself (not the public
 *   site) only our own savvy-agents.com sites may show it inside a frame,
 *   which stops clickjacking of the admin screens.
 *
 * Report-only, to tighten later: Content-Security-Policy-Report-Only with a
 * fuller policy (https only, no eval, known frame and form targets). Browsers
 * block nothing for it; they report what WOULD be blocked to /api/csp-report,
 * which logs one line per new kind of problem under [CSP]. Once the logs are
 * quiet for a couple of weeks, those rules can move into the enforced policy.
 *
 * SECURITY_HEADERS=off on Railway removes all of them.
 */

export const CSP_REPORT_PATH = "/api/csp-report";

const PUBLIC_SITE_HOSTS = new Set([
  "home.savvy-agents.com",
  "www.home.savvy-agents.com",
  "savvy-agents.com",
  "www.savvy-agents.com",
]);

/** The public website (as opposed to SavvyOS itself). */
export function isPublicSiteHost(host: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const clean = String(host || "").split(":")[0].trim().toLowerCase();
  const landing = (env.PUBLIC_LANDING_PAGE_HOST || "").trim().toLowerCase();
  return PUBLIC_SITE_HOSTS.has(clean) || (!!landing && (clean === landing || clean === `www.${landing}`));
}

/** Our own sites, which may show SavvyOS pages in a frame (old site included until it is retired). */
const OWN_FRAME_ANCESTORS = "'self' https://savvy-agents.com https://*.savvy-agents.com";

export function enforcedCsp(publicSite: boolean): string {
  return [
    "object-src 'none'",
    "base-uri 'self'",
    ...(publicSite ? [] : [`frame-ancestors ${OWN_FRAME_ANCESTORS}`]),
  ].join("; ");
}

/**
 * What a strict policy would look like. Inline scripts stay allowed (the
 * analytics tags and the stale-deploy reload script are inline); everything
 * else must come over https, and eval is reported.
 */
export function reportOnlyCsp(publicSite: boolean): string {
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https:",
    "style-src 'self' 'unsafe-inline' https:",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https:",
    "connect-src 'self' https: wss:",
    "media-src 'self' blob: https:",
    "frame-src 'self' https:",
    "worker-src 'self' blob:",
    "form-action 'self' https:",
    "object-src 'none'",
    "base-uri 'self'",
    ...(publicSite ? [] : [`frame-ancestors ${OWN_FRAME_ANCESTORS}`]),
    `report-uri ${CSP_REPORT_PATH}`,
    "report-to csp",
  ].join("; ");
}

export function securityHeadersFor(input: { host: string; production: boolean }, env: NodeJS.ProcessEnv = process.env) {
  const publicSite = isPublicSiteHost(input.host, env);
  const headers: Record<string, string> = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), geolocation=()",
    "Content-Security-Policy": enforcedCsp(publicSite),
    "Content-Security-Policy-Report-Only": reportOnlyCsp(publicSite),
    "Reporting-Endpoints": `csp="${CSP_REPORT_PATH}"`,
  };
  // Only over the real https hosts: never on localhost in development.
  if (input.production) headers["Strict-Transport-Security"] = "max-age=31536000";
  return headers;
}

export function securityHeadersEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.SECURITY_HEADERS || "").trim().toLowerCase() !== "off";
}

export function securityHeadersMiddleware(env: NodeJS.ProcessEnv = process.env) {
  const production = env.NODE_ENV === "production";
  const enabled = securityHeadersEnabled(env);
  return (req: Request, res: Response, next: NextFunction) => {
    if (enabled) {
      const host = req.hostname || String(req.headers.host || "");
      const headers = securityHeadersFor({ host, production }, env);
      for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
    }
    next();
  };
}

// ─── Violation reports ───────────────────────────────────────────────────────

export type CspViolation = { directive: string; blocked: string; page: string; disposition: string };

function originOf(value: unknown): string {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (!/^[a-z][a-z0-9+.-]*:/i.test(text)) return text.slice(0, 40); // "inline", "eval", "data"
  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:" || url.protocol === "wss:" ? url.origin : url.protocol;
  } catch {
    return text.slice(0, 40);
  }
}

function pathOf(value: unknown): string {
  try {
    const url = new URL(String(value ?? ""));
    return `${url.host}${url.pathname}`.slice(0, 120);
  } catch {
    return "";
  }
}

/**
 * Reads both report formats: the older {"csp-report": {...}} (report-uri) and
 * the newer [{type: "csp-violation", body: {...}}] (report-to). Keeps only
 * origins and paths, never full addresses with their query strings.
 */
export function parseCspReports(body: unknown): CspViolation[] {
  const items: any[] = Array.isArray(body) ? body : body && typeof body === "object" ? [body] : [];
  const out: CspViolation[] = [];
  for (const item of items.slice(0, 20)) {
    const legacy = item?.["csp-report"];
    const modern = item?.type === "csp-violation" ? item.body : null;
    const report = legacy || modern;
    if (!report || typeof report !== "object") continue;
    const directive = String(report["effective-directive"] || report.effectiveDirective || report["violated-directive"] || "")
      .split(" ")[0]
      .slice(0, 40);
    if (!directive) continue;
    out.push({
      directive,
      blocked: originOf(report["blocked-uri"] ?? report.blockedURL),
      page: pathOf(report["document-uri"] ?? report.documentURL),
      disposition: String(report.disposition || "report").slice(0, 10),
    });
  }
  return out;
}

const seen = new Map<string, number>();
let windowStart = 0;
const WINDOW_MS = 60 * 60_000;
const MAX_KINDS_PER_WINDOW = 50;

/** One log line per new (directive, blocked origin) an hour, at most 50 kinds an hour. */
export function shouldLogViolation(violation: CspViolation, now = Date.now()): boolean {
  if (now - windowStart > WINDOW_MS) {
    seen.clear();
    windowStart = now;
  }
  const key = `${violation.disposition}|${violation.directive}|${violation.blocked}`;
  if (seen.has(key)) {
    seen.set(key, (seen.get(key) ?? 0) + 1);
    return false;
  }
  if (seen.size >= MAX_KINDS_PER_WINDOW) return false;
  seen.set(key, 1);
  return true;
}

/**
 * Must be registered before the public host's /api guard, so reports from
 * the public site arrive too. Always answers 204; never reads cookies.
 */
export function registerCspReportRoute(app: Express) {
  app.post(
    CSP_REPORT_PATH,
    express.json({ type: ["application/csp-report", "application/reports+json", "application/json"], limit: "32kb" }),
    (req, res) => {
      try {
        for (const violation of parseCspReports(req.body)) {
          if (shouldLogViolation(violation)) {
            console.warn(
              `[CSP] ${violation.disposition === "enforce" ? "Blocked" : "Would block"} ${violation.directive}: ${violation.blocked || "(unknown)"} on ${violation.page || "(unknown page)"}`
            );
          }
        }
      } catch {
        // A malformed report is not worth an error.
      }
      res.status(204).end();
    }
  );
}
