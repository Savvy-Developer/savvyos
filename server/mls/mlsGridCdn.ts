/**
 * MLS Grid's provisioned CDN (for Savvy: cdn-savvystr.mlsgrid.com) serves
 * reusable links that do not expire after an hour and do not count toward
 * api.mlsgrid.com limits. The standard media.mlsgrid.com links stay signed,
 * single-use and one-hour. The API decides which host a token gets, so the
 * returned URL is the only signal we trust. `MLS_GRID_CDN_HOSTS` (comma list)
 * adds hosts MLS Grid assigns later without a code change.
 */
const CDN_HOST = /^cdn-[a-z0-9-]+\.mlsgrid\.com$/;

export function isMlsGridCdnUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  let host: string;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    host = parsed.hostname.toLowerCase();
  } catch {
    return false;
  }
  if (CDN_HOST.test(host)) return true;
  return (process.env.MLS_GRID_CDN_HOSTS ?? "")
    .split(",")
    .map(item => item.trim().toLowerCase())
    .filter(Boolean)
    .includes(host);
}
