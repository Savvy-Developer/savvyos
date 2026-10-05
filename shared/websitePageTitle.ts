/**
 * The <title> for a page on the new website, shared by the server (what
 * Google reads) and the browser tab, so the two always match.
 *
 * A meta title someone wrote for the page is sized for Google (about 60
 * characters), so " | Savvy STR Agents" is only added when it still fits.
 * Anything else (a name, an address) always gets the site name.
 */
export const WEBSITE_SITE_NAME = "Savvy STR Agents";
export const WEBSITE_TITLE_MAX = 60;

export function websitePageTitle(
  title: string | null | undefined,
  options: { ownMetaTitle?: boolean } = {}
): string {
  const clean = (title ?? "").trim();
  if (!clean) return WEBSITE_SITE_NAME;
  const withSite = `${clean} | ${WEBSITE_SITE_NAME}`;
  if (options.ownMetaTitle && withSite.length > WEBSITE_TITLE_MAX) return clean;
  return withSite;
}
