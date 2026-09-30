/**
 * Forwarding for links to the new site's current address.
 *
 * Until launch the public site lives at home.savvy-agents.com/newsite. Links
 * to that address are already out in the world and some cannot be edited:
 * Reel captions (Birdie's organic posts, from October 2026), sent daily and
 * price drop emails. Savvy promised Cam that those links keep working after
 * launch, with all five UTMs carried over.
 *
 * When the site moves, Website Studio turns forwarding on with the new site
 * address. Every home.savvy-agents.com/newsite/... request then gets a
 * permanent redirect to the same page on the new address, query string
 * unchanged. Until it is turned on nothing changes.
 *
 * Pure: no database or Express here, so the rules are tested on their own.
 */

/** The address the links point at today. */
export const FORWARD_SOURCE_HOST = "home.savvy-agents.com";
export const FORWARD_SOURCE_BASE = "/newsite";

export type LinkForwardingSettings = {
  enabled: boolean;
  /** Where the site lives now, origin only, e.g. "https://savvy-agents.com". */
  targetOrigin: string | null;
  /**
   * Whether the new address still has /newsite in it
   * (savvy-agents.com/newsite/properties vs savvy-agents.com/properties).
   */
  keepBasePath: boolean;
};

export const LINK_FORWARDING_OFF: LinkForwardingSettings = {
  enabled: false,
  targetOrigin: null,
  keepBasePath: false,
};

const SOURCE_HOSTS = new Set([FORWARD_SOURCE_HOST, `www.${FORWARD_SOURCE_HOST}`]);

/**
 * The new site address as an origin ("https://host"), or an error message a
 * person can act on. Only https, only an origin (no path, query or port), and
 * never the address the links point at, since that would redirect to itself.
 */
export function normalizeTargetOrigin(
  input: string | null | undefined
): { origin: string } | { error: string } {
  const raw = (input ?? "").trim();
  if (!raw) return { error: "Enter the new site address, for example https://savvy-agents.com." };
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return { error: "That is not a web address. Use one like https://savvy-agents.com." };
  }
  if (url.protocol !== "https:") return { error: "The new site address must start with https://." };
  if (url.port) return { error: "Leave the port out of the new site address." };
  if (url.username || url.password) return { error: "The new site address cannot contain a user name or password." };
  if ((url.pathname && url.pathname !== "/") || url.search || url.hash) {
    return { error: "Enter only the site address, without a page path. Use the /newsite switch for the path." };
  }
  const host = url.hostname.toLowerCase();
  if (SOURCE_HOSTS.has(host)) {
    return { error: `The new address cannot be ${FORWARD_SOURCE_HOST}: links would redirect to themselves.` };
  }
  if (!host.includes(".")) return { error: "That is not a full site address." };
  return { origin: `https://${host}` };
}

/** Whether a request host is the one the old links point at. */
export function isForwardSourceHost(host: string | null | undefined): boolean {
  const name = (host ?? "").split(":")[0].trim().toLowerCase();
  return SOURCE_HOSTS.has(name);
}

/** The path a /newsite path moves to, or null when it is not a site path. */
export function forwardedPath(path: string, keepBasePath: boolean): string | null {
  if (path !== FORWARD_SOURCE_BASE && !path.startsWith(`${FORWARD_SOURCE_BASE}/`)) return null;
  if (keepBasePath) return path;
  const rest = path.slice(FORWARD_SOURCE_BASE.length);
  return rest || "/";
}

/**
 * Where a request should go, or null to serve it as usual. `originalUrl` is
 * the request's path plus query string; the query string is carried over
 * exactly as it arrived, so UTMs, fbclid and gclid all survive.
 */
export function forwardingTarget(
  request: { host: string | null | undefined; path: string; originalUrl: string },
  settings: LinkForwardingSettings
): string | null {
  if (!settings.enabled || !settings.targetOrigin) return null;
  if (!isForwardSourceHost(request.host)) return null;
  const target = normalizeTargetOrigin(settings.targetOrigin);
  if ("error" in target) return null;
  const path = forwardedPath(request.path, settings.keepBasePath);
  if (path === null) return null;
  const queryAt = request.originalUrl.indexOf("?");
  const query = queryAt >= 0 ? request.originalUrl.slice(queryAt) : "";
  return `${target.origin}${path}${query === "?" ? "" : query}`;
}

/** The page the Studio card uses as its example, and the check before switching on. */
export function forwardingExample(settings: Pick<LinkForwardingSettings, "targetOrigin" | "keepBasePath">) {
  const from = `https://${FORWARD_SOURCE_HOST}${FORWARD_SOURCE_BASE}/properties?utm_source=instagram&utm_medium=social`;
  const target = normalizeTargetOrigin(settings.targetOrigin);
  if ("error" in target) return { from, to: null };
  return {
    from,
    to: `${target.origin}${forwardedPath(`${FORWARD_SOURCE_BASE}/properties`, settings.keepBasePath)}?utm_source=instagram&utm_medium=social`,
  };
}

/** The home page on the new address, which must answer before forwarding is switched on. */
export function forwardingCheckUrl(origin: string, keepBasePath: boolean) {
  return `${origin}${keepBasePath ? FORWARD_SOURCE_BASE : "/"}`;
}
