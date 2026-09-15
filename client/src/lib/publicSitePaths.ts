/**
 * Where the public website lives.
 *
 * The site is still served under a prefix while it runs alongside SavvyOS. One
 * definition, imported by both the site and the account pages, so moving it to
 * the root later is a one-line change rather than a search for string literals.
 */
export const PUBLIC_SITE_BASE = "/newsite";

export const publicPath = (suffix = "") => `${PUBLIC_SITE_BASE}${suffix}`;

/**
 * A safe post-sign-in destination.
 *
 * Only same-origin paths inside the public site are accepted. Anything else,
 * including a protocol-relative "//evil.example" that a browser would happily
 * treat as another host, falls back to the site root. An open redirect on a
 * login page is how a phishing link borrows a real domain.
 */
export function safeNextPath(value: string | null | undefined): string {
  if (!value) return publicPath();
  if (!value.startsWith(PUBLIC_SITE_BASE)) return publicPath();
  if (value.startsWith(`${PUBLIC_SITE_BASE}//`)) return publicPath();
  return value;
}
